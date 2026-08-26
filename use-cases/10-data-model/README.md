# 10 — Enterprise data domain model (customers, orders, invoices, money)

## Scenario

An order-to-cash domain for a mid-size B2B company: customers with
64-bit upstream ledger ids, orders with line items, invoices with
net/tax/gross money, ISO country and currency codes. The model is used
two ways at once:

1. **Schema.** Agent-emitted JSON candidate records (`data/`, `bad/`)
   are vetted against it in batches — referential integrity included.
2. **Seed-data generator.** Evaluating `seed.aon` *is* generating the
   fixture set: defaults fill in, `pack()` derives one receivables
   account per customer, and every constraint has already held over
   the output or there is no output.

This is the ground-truth-ontology use the language advertises: one
document that is simultaneously the contract, the checker, and the
generator. Money is the stress test — the whole reason `0d` exact
decimals exist — and 64-bit ids are the trap the number tower sets for
schema authors.

Run `./check.sh` (24 assertions, ~5s). `gaps/` holds the **failed
attempts kept executable**: check.sh asserts each still fails the way
this README documents.

## Model design

- `domain.aon` — record types (`close()`d maps, optional keys `?`,
  `re()` for ISO codes, `neq()` to ban XXX/XTS, `length()` on names,
  `min`/`max` cents bounds), plus the record bags whose `&:` spreads
  apply the types, force `id == key` via `.$KEY`, and attach `refer()`
  links (`order.customerId`, `invoice.orderId`).
- `seed.aon` — includes the domain; an exact price book in `0d`
  bigdecimals with **pinned sums** (`(0d0.1 + 0d0.2) & 0d0.3` is a
  theorem, not a comment), seed records declared as entities with
  `id()`, per-record `must()` arithmetic spot checks, `match()` for
  price tiers, `pack()` for the receivables bag, `*"open"` default
  order status.
- `exact-money.aon` — the money schema you *want* (`bigdecimal`), kept
  as the executable form of gap 1.
- `reporting.aon` — a wider projection; `subsume` proves it sound.
- Money on **records** is integer cents. That is a forced workaround,
  not a preference — see gap 1.

## What worked

- **Exact decimal money is real.** `(0d0.1 + 0d0.2) & 0d0.3` unifies;
  binary64 would give `0.30000000000000004`. Canon round-trips the
  kind: `get '$.pricing.bundles' --canon` prints
  `{"pro-pair":{"eur":0d69.89,...},"service-kit":{"eur":0d0.3,...}}`.
  Writing bundle prices as *sums pinned to their expected value* makes
  the price book self-verifying.
- **No silent corruption path for 64-bit ids.** A plain JSON record
  carrying `9007199254740993` (2^53+1) is refused at parse
  (`lossy_integer_literal`) even inside `vet` — the id is never
  rounded behind your back. The `0d` escape stores it exactly and
  canon keeps it: `get ... --canon` → `0d9007199254740993`.
- **The float/exact wall holds in both directions**, with one of the
  best error messages I have seen (`exact_float_mix` names both
  operand kinds, both orders, and the fix).
- **Referential integrity via `id()` + `refer()` works through vet.**
  A JSON order naming `cust-9999` fails with `refer_unresolved` and
  the data file:line. Constraints, dangling detection, and batch
  merging all compose.
- **Batch vet is one command.** `vet seed.aon a.json b.json c.aon`
  merges and checks everything, and the exit-code discipline
  (0 valid / 1 invalid / 3 incomplete) plus stable machine codes
  (`[aontu/closed]`, `[aontu/constraint]`, ...) make CI assertion
  trivial — check.sh never byte-compares error prose.
- **`close()`, `re()`, `neq()`, optional keys, defaults** all did
  exactly what the reference says: `segment` refused as an undeclared
  key, `"Switzerland"` refused by `re("^[A-Z]{2}$")`, omitted `status`
  generated as `"open"`.
- **`subsume` is a genuinely useful projection check**, and sharper
  than expected: `status: string` in the view was rejected with
  `compat_default_changed` because the domain carries a `*"open"`
  default — a real BI hazard I had not thought to test for. Restating
  the default (`*"open" | string`) made the view subsume. The
  int64-assuming bad view is caught citing `biginteger&min(1)` —
  though as `undecided` exit 3, honestly refusing to invent a
  counterexample, rather than `does_not_subsume`.
- **`pack()` as a generator**: the receivables bag is derived from the
  customer bag with `accountFor: refer() & key()`, so accounts cannot
  drift from customers and each link is checked, not a loose string.
- **`vet --at '$.schema.Customer'`** validates a single bare record
  against one named type — handy for agent loops that emit one record
  at a time.

## Gaps and friction

Severity: **critical** = blocks the scenario's core promise;
**major** = forced a real workaround; **minor** = friction/diagnostic.

### Gap 1 (critical): exact money is unreachable from plain JSON

`bigdecimal` can only be produced by a `0d` literal. JSON has no such
spelling, so **no strictly-JSON record can ever satisfy an exact-money
schema** — the type the language builds its money story on is
invisible to the JSON wire:

```
$ aontu vet exact-money.aon data/quote-float.json
verdict: invalid

$.quote.amountEur: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.quote.amountEur
  expected: bigdecimal&min(0d0)
  actual:   10.5
```

(With bare `bigdecimal` and no bound the code is `no_scalar_unify`;
same verdict.) Two escapes exist, both compromised:

- `vet` parses `.json` data files with the Aontu parser, so
  `{"amountEur": 0d10.50, ...}` is accepted (`verdict: valid`) — but
  `JSON.parse` rejects that file (`Expected ',' or '}' after property
  value...`), so it is not JSON any more and no stock agent/tool emits
  it. check.sh asserts both halves of this duality.
- Integer minor units (cents) — what `domain.aon` actually uses. This
  works, but it means the `0d` machinery, the language's flagship
  numeric feature, is confined to the model's interior (price book,
  pins) and never protects the data plane, which is where the money
  actually flows.

The flip side is coherent and good — `gaps/float-mix.aon`:

```
[aontu/exact_float_mix]: Cannot add value at path $.delta
Aontu cannot mix an exact number with a binary float.
Here the operands are bigdecimal and float, in that order.
```

but combined with JSON-only ingestion it means agent-supplied money is
permanently stuck on the float side of the wall.

### Gap 2 (major, by design but a real trap): 64-bit id kinds

The `0d` rescue for ids above 2^53 changes the *kind* to `biginteger`,
and the four leaves are disjoint, so the natural schema spelling
`ledgerId: integer` refuses the very records the escape saved
(`bad/id-trap-schema.aon` vs `data/customer-bigid.aon`):

```
$.customers.ledgerId: constraint [conflict]
  expected: integer&min(1)
  actual:   0d9007199254740993
```

`number` admits floats, so the honest spelling is the verbose
two-leaf disjunction used in `domain.aon`:

```aon
ledgerId: integer & min(1) | biginteger & min(1)
```

There is no `wholenumber`-style union kind, and no `must`-free way to
say "integral, any leaf". The trap propagates to consumers: a
reporting view declaring `ledgerId: integer` fails subsumption
(`sub_disjunct_distribution`, exit 3). Every schema between the wire
and the warehouse has to know this idiom.

### Gap 3 (critical for a data domain): no aggregate computation

`invoice.total = sum(lines[].amountCents)` is the single most natural
invariant in this domain and it is inexpressible. There is no
sum/fold/reduce/avg — `length()` can *count* members but nothing can
*add* them (`gaps/agg-sum.aon`):

```
[aontu/unknown_function]: Cannot resolve value at path $.total
This function name is not recognized.
```

`|> sum` fails the same way (`pipe_target`). There is also no `*`
operator (`gaps/multiply.aon`):

```
[aontu/unexpected]: unexpected character(s): *
```

so `amountCents = qty * unitCents` and `taxCents = netCents * 0.19`
are equally out of reach. The honest workaround used in `seed.aon`:
totals are **self-declared** and spot-checked with per-record
`must()`, and "qty 2" is spelled `unit + unit`:

```aon
amountCents: 3998 & must(.unitCents + .unitCents, "amountCents != 2 x unitCents")
```

That protects seed records an author writes by hand. It does not and
cannot protect the batch: see gap 4.

### Gap 4 (major): cross-field constraint args don't re-anchor in templates

The rule "gross = net + tax", written once in the invoice bag spread
so it applies to *every* record, does not work: a relative reference
inside a `must()` (or `min()`) **argument** resolves at the template's
own path instead of re-anchoring at each record
(`gaps/spread-cross-field.aon`):

```
[aontu/no_path]: Cannot resolve value at path $.invoices.grossCents
 Cannot resolve value: .netCents
```

Plain relative references in the same template position *do* re-anchor
(`&: {a: integer, b: .a}` works), so this is an inconsistency, not a
rule. Consequence: arithmetic invariants exist only on records whose
author hand-wrote the `must()` — a JSON candidate invoice with
`gross != net + tax` sails through vet untouched. For a data-domain
model this is the difference between a schema and a suggestion.

### Gap 5 (major): `length()` cannot ride a list template

"An order has 1–50 lines" attached to the schema's list template kills
the schema at definition time — the sizing atom folds against the
template list itself, which has zero elements
(`gaps/list-length-template.aon`):

```
[aontu/constraint]: Cannot unify values at path $.schema.Order.lines
 Cannot unify value: length(integer&min(1)&max(50)) with value: [&:$.schema.OrderLine]
```

So `domain.aon` ships `lines: [&: $.schema.OrderLine]` with no
cardinality bound at all. An empty `lines: []` order vets as valid.

### Gap 6 (critical, implementation bug): includes + named type aliases

The intended vocabulary — `Country`, `Currency`, `Cents`, `Id64` as
named `type()` aliases referenced from the record types — works in a
single file and **breaks as soon as the schema crosses an `@"..."`
include boundary**, in two escalating ways (minimal 2-file repro in
`gaps/include-id-key/`):

1. With `id(key(0))` in the bag spread, evaluation fails with a bogus
   name error (the argument *is* a computed valid name):

   ```
   [aontu/id_name]: Cannot id value at path $.customers.cust-1001
   The argument to id() is not an entity name. ...
    Cannot id value: id(key(0))
   ```

2. Without `id(key(0))`, the same combination **silently drops every
   affected record from generation** — exit 0 and:

   ```
   { "customers": {}, "schema": {} }
   ```

   Silent data loss from a validity-first language is the worst
   failure mode it has. check.sh asserts both.

Marking the whole schema map `type({...})` instead fails with
`mapval_no_gen` (`$.schema.Customer` never resolves through the
include), and `hide()`-marked aliases drop records the same way.
The only workaround that survived: **inline every vocabulary
constraint at every use site** (see the duplicated
`integer & min(0) & max(100000000000)` in `domain.aon`) and declare
entity ids per record by hand. DRY schema vocabulary — the thing a
"system ontology" most needs — is effectively unavailable across
files today. Two knock-on diagnostics problems while debugging this:
error blame frames mix up which include file a line came from, and a
`vet` finding under a spread reports the template path
(`$.customers.ledgerId`) without the record key segment.

### Gap 7 (major, incl. a hang): `refer()` cannot live in a named type

`customerId: refer() & string & re("^cust-")` inside
`schema.Order` — the obvious place for referential integrity — cannot
settle at its own definition site:

```
[aontu/unify_cycle]: Cannot unify values at path $.schema.Order.customerId
Circular reference detected during unification.
 Cannot unify value: refer()&re("^cust-") with value: top
```

(with plain `refer() & string` it is `mapval_no_gen` instead). Worse:
in the full model, evaluation **did not terminate**. Recipe, verified
twice: take this directory's `domain.aon`, move the two `refer()`
conjuncts from the bag spreads back into the `customerId`/`orderId`
fields of the `Order`/`Invoice` type definitions, and evaluate
`seed.aon` — the run burns CPU with no output until killed (90s and
120s timeouts both hit; normal evaluation is ~0.5s). Not kept in
`gaps/` because check.sh must terminate. Workaround: attach `refer()`
at the bag spread (`&: $.schema.Order & { customerId: refer() }`),
which works — but it splits the contract between the type and its
application site.

### Gap 8 (major): no uniqueness by projection

`unique()` compares whole members, so "no two customers share a
ledgerId" is inexpressible; `gaps/unique-by-field.aon` gives two
customers the same ledger id and **evaluates cleanly** — check.sh
asserts the silent pass, because that silence is the finding. (The
reference acknowledges this and reserves the arity for G8.) In this
domain, key-uniqueness covers ids, but natural-key fields — VAT
numbers, ledger ids, emails — get no protection.

### Gap 9 (minor, diagnostics): spurious `pref_not_instance` warning

Every vet against a schema with a defaulted string enum emits a false
compat warning when the data leaves the field to default — repeated
once per data file in a batch:

```
$.orders.ord-7002.status: pref_not_instance [compat]
  the default "open" is not an instance of any alternative of *"open"|"invoiced"|"cancelled"
```

`"open"` is literally the first alternative. Verdict is unaffected
(`valid`, exit 0), but in a CI log this reads as a schema bug and
trains people to ignore compat findings. Minimal repro:
`status: *"open"|"x"` vetted against `{}`. check.sh asserts the
current behaviour so a fix surfaces.

### Polish-level friction

- `get '$.customers."cust-1003".ledgerId'` fails (`no_path ... did you
  mean cust-1003?`) — the quoted segment form the *language* requires
  for dashed keys is rejected by the CLI path parser; the unquoted
  spelling works.
- Generated JSON renders a biginteger as a plain numeral
  (`123456789012345678901234567890`), which is textually exact but
  will be rounded by any consumer that parses JSON numbers as doubles
  — exactness survives generation only until the next parser.

## Verdict for this scenario

Validation of *shape* is excellent: kinds, patterns, closedness,
optionality, defaults, referential integrity and batch vetting are
better than anything comparable at this weight, and the exactness
discipline (lossy-literal refusal, the float/exact wall) is genuinely
novel protection. Validation of *arithmetic* — the heart of an
invoicing domain — is close to absent: no aggregates, no
multiplication, cross-field rules that cannot be stated generically,
and exact money that JSON data can never carry. The include/alias
bugs (gap 6, gap 7) are implementation, not design, but today they
force exactly the copy-paste vocabulary an ontology language exists
to eliminate.
