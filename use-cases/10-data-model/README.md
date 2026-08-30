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
  apply the types, force `id == key` via `key()`, and attach `refer()`
  links (`order.customerId`, `invoice.orderId`).
- `seed.aon` — includes the domain; an exact price book in `0d`
  bigdecimals with **pinned sums** (`(0d0.1 + 0d0.2) & 0d0.3` is a
  theorem, not a comment), per-record `must()` arithmetic spot checks,
  `match()` for
  price tiers, `pack()` for the receivables bag, `*"open"` default
  order status.
- `exact-money.aon` — the money schema you *want* (`bigdecimal`), kept
  as the executable form of gap 1's dead end.
- `money-wire.aon` — the money wire convention that answers it: a
  decimal string with a fixed scale, an ISO 4217 currency beside it,
  and an optional-but-constant conversion mark (`dec?: "bigdecimal:2"`)
  naming the leaf and the scale. `money-convert.aon` writes the
  crossing point out as theorems — the sign outside the `0d` prefix,
  scale absent from the value, the scale-0 point that must still be
  written, and exact VAT both ways.
- `reporting.aon` — a wider projection; `subsume` proves it sound.
- Money on **records** is integer minor units (cents). That was a
  forced workaround when gap 1 had no answer; it is now one of two
  supported spellings, the other being the decimal-string wire form in
  `money-wire.aon`. `domain.aon` keeps cents so the gap-2 and gap-4
  findings around it stay reproducible.

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
- **Referential integrity via `refer()` works through vet.** A JSON
  order naming `$.customers.cust-9999` fails with `refer_unresolved`
  and the data file:line. Since ADR-014 the link is a tree path, so
  `domain.aon` pins the address SHAPE (`^\$\.customers\.cust-`) and
  `refer()` at the bag spread pins its existence — the pattern catches
  a link into the wrong bag, the resolution catches a link to
  nothing. Constraints, dangling detection, and batch
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

**ANSWERED 2026-08-27** (the review's finding I) — by a documented
convention rather than by new machinery, which is what the review asked
for. Money crosses the wire as a **decimal string** validated exactly by
`re()`, with a **conversion mark** in the schema naming the leaf and the
scale. `money-wire.aon` is the schema, `money-convert.aon` writes the
crossing point out as theorems, and `check.sh` asserts both, plus the
exported JSON Schema, against the same records. See
[docs/how-to.md, "Carry exact money over JSON"](../../docs/how-to.md#carry-exact-money-over-json).
The finding below stands exactly as written — it is *why* the
convention exists, and `exact-money.aon` remains the executable form of
the dead end it describes.

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

**FIXED 2026-08-27** (the review's finding I). `invoice.total =
sum(lines[].amountCents)` is the single most natural invariant in this
domain and it was inexpressible: there was no sum/fold/reduce/avg —
`length()` could *count* members but nothing could *add* them —
and no `*` operator, so `amountCents = qty * unitCents` and
`taxCents = netCents * 0.19` were equally out of reach. The honest
workaround was self-declared totals spot-checked with per-record
`must()`, and "qty 2" spelled `unit + unit`. It protected seed records
an author writes by hand and could not protect the batch (gap 4).

It took three things, and `check.sh` now asserts all of them
(`gaps/agg-sum.aon`, `gaps/multiply.aon`):

- **`sum(d)`**, with `least(d)` and `greatest(d)`, folds a list or a
  map. It folds with `add`, so the number tower's law comes with it:
  integer cents total to an exact integer, and a total too large to
  store is refused rather than rounded.
- **`pick(d, k)`** is what gets from a bag of *records* to a bag of
  *numbers* — `sum(pick($.lines, amountCents))`. It is not `each` with
  a clever template: `each` *meets* each child, and a meet cannot
  select.
- **`mul` / `div` / `sub` / `mod` / `rem`**, so VAT is computed
  in-model: `div(mul($.amount, 19), 100)` is 759 cents on 3998, with
  the single truncation at the end and the truncation rule (toward
  zero) stated by the language rather than inherited from a host.

The `*` **token** is still a parse refusal, by design and unchanged —
maths arrives as functions, and the operator characters stay reserved
(`gaps/star-token.aon`).

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

### Gap 6 (critical, FIXED 2026-08-26): includes + named type aliases

**Fixed by the template-clone isolation change (ADR-005):** the
intended vocabulary — named `type()` aliases referenced from the
record types — now works across an `@"..."` include boundary exactly
as it does in a single file. The 2-file repro in
`gaps/include-alias-spread/` emits the fully-unified record, and
check.sh asserts the output.

This gap had two halves and **only one of them was ever a defect**.
The half that was: an include whose record type references a named
alias **silently dropped every affected record from generation**
(exit 0, `{"customers": {}}`) — references cloned the still-pending
`type()` alias and the clone stamped its mark at the destination after
the reference's mark-clearing walk had run. A silent drop looks like
success, which is what makes it worth a fixture.

The other half wanted `id(key(0))` in the bag spread and died with a
bogus `[aontu/id_name]`. **ADR-014 removed the identity mark, so that
half is not a spelling any more** — a record's address is
`$.customers.cust-1001` and there is nothing to declare. The fixture
pair collapsed to one and the shared suite dropped its pin
(`load-alias-idspread`) with it.

References now defer until a pending mark wrapper has resolved at its
own field, and spread applications are full per-destination
instances. The shared spec pins the include-crossing shapes in both
engines (`test/spec/file.tsv`, `load-alias-*`), so DRY schema
vocabulary across files is available again — `domain.aon`'s inlined
duplicate constraints are no longer forced (kept as written, as a
record of the era). Still open from the debugging notes: error blame
frames can mix up which include file a line came from, and a `vet`
finding under a spread can report the template path without the
record key segment (site-attribution family).

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

### Gap 8 — FIXED (major): no uniqueness by projection

`unique()` compares whole members, so "no two customers share a
ledgerId" was inexpressible: `gaps/unique-by-field.aon` gave two
customers the same ledger id and **evaluated cleanly**, and check.sh
asserted that silent pass because the silence was the finding. The
reference acknowledged it and reserved the arity for exactly this.

**FIXED 2026-08-27** — the arity is spent. `unique(ledgerId)` says no
two members may share the named key, so the natural-key fields that
had no protection at all — VAT numbers, ledger ids, emails — now have
the same protection map keys always had. `check.sh` asserts the
duplicate is caught (`[aontu/constraint]` at `$.customers`).

A member with no such key **fails** rather than being skipped:
distinctness that cannot be shown is distinctness the collection does
not have, and skipping would let one keyless record hide a duplicate.
`unique(a) & unique(b)` demands both, and canon sorts the keys so two
documents saying the same thing render the same string.

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
bugs were implementation, not design: gap 6 is fixed (2026-08-26,
the template-clone isolation change), so the copy-paste vocabulary
it forced is no longer necessary; gap 7 (`refer()` in a named type)
remains open.
