# 10 — Enterprise data domain model (customers, orders, invoices, money)

![The model tree: customers, orders, invoices and the pricing book, over one record vocabulary](expected/diagram-doc.svg)

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

This is the ground-truth-ontology use: one document that is
simultaneously the contract, the checker, and the generator. Money is
the stress test (the reason `0d` exact decimals exist), and 64-bit
ids exercise the number tower's disjoint kinds.

## The model tree

`seed.aon` layers the deterministic seed ledger onto the domain model,
so evaluating it IS the fixture generator. The record bags are
`customers`, `orders`, `invoices` and `receivables`; `pricing` is the
exact-money half, and `schema` the vocabulary, which generates empty
because a type is not data.

```
$
├── customers
│   ├── cust-1001 (7)
│   └── cust-1002 (7)
├── invoices
│   └── inv-3001 (6)
├── orders
│   ├── ord-7001 (5)
│   └── ord-7002 (5)
├── pricing
│   ├── book (4)
│   └── bundles (2)
├── receivables
│   ├── cust-1001 (2)
│   └── cust-1002 (2)
├── reconcile
│   ├── centsPath 30
│   └── exactPath 0d0.3
└── schema
    ├── Customer (7)
    ├── Invoice (6)
    ├── Order (5)
    └── OrderLine (4)
```

`aontu view doc --depth 2 seed.aon` draws it, and `check.sh` pins it
with `--out --check`. A key with `(n)` after it is a container the
depth bound stopped at, and `n` is how many keys are not drawn; a
leaf carries its canon, which is the kind of thing it is rather
than its value.

## Model design

- `domain.aon` — record types (`close()`d maps, optional keys `?`,
  `re()` for ISO codes, `neq()` to ban XXX/XTS, `length()` on names,
  `min`/`max` cents bounds), plus the record bags whose `&:` spreads
  apply the types, force `id == key` via `key()`, and attach `refer()`
  links (`order.customerId`, `invoice.orderId`).
- `seed.aon` — includes the domain; an exact price book in `0d`
  bigdecimals with **pinned sums** (`(0d0.1 + 0d0.2) & 0d0.3` is a
  theorem, not a comment), per-record `must()` arithmetic checks,
  `match()` for price tiers, `pack()` for the receivables bag, `*"open"`
  default order status.
- `exact-money.aon` — the money schema stated on the exact leaf
  (`amountEur: bigdecimal & min(0d0)`). Only a `0d` literal produces
  a `bigdecimal`, and JSON has no such spelling, so an `.aon` record
  satisfies this schema and a strictly-JSON record cannot.
- `money-wire.aon` — the money schema for a JSON wire: a decimal
  string with a fixed scale, an ISO 4217 currency beside it, and an
  optional-but-constant conversion mark (`dec?: "bigdecimal:2"`)
  naming the leaf and the scale. `money-convert.aon` writes the
  crossing point out as theorems — the sign outside the `0d` prefix,
  scale absent from the value, the scale-0 point that must still be
  written, and exact VAT both ways. The convention has its own guide,
  [Carry exact money over JSON](../../docs/how-to/carry-exact-money-over-json.md).
- `reporting.aon` — a wider projection; `subsume` proves it sound.
- `gaps/` — one-file models, each pinning a single behaviour of the
  arithmetic and constraint families; see below.

Money on **records** in `domain.aon` is integer minor units (cents),
one of the two supported spellings; the other is the decimal-string
wire form in `money-wire.aon`. Exact arithmetic lives in the price
book: `(0d0.1 + 0d0.2) & 0d0.3` unifies where binary64 gives
`0.30000000000000004`, and writing bundle prices as sums pinned to
their expected value makes the price book self-verifying. An exact
number and a binary float do not mix, in either operand order;
`gaps/float-mix.aon` adds a `0d` book price to a float and is refused
with both kinds named:

```
[aontu/exact_float_mix]: Cannot add value at path $.delta

Aontu cannot mix an exact number with a binary float.
Here the operands are bigdecimal and float, in that order.
```

A plain JSON record carrying `9007199254740993` (2^53+1) is refused
at parse (`lossy_integer_literal`), even inside `vet`: an id is never
rounded silently. The `0d` spelling stores it exactly, with
`biginteger` kind, and canon keeps it (`0d9007199254740993`). The
four numeric leaves are disjoint, so a schema saying
`ledgerId: integer` refuses that record (`bad/id-trap-schema.aon`
against `data/customer-bigid.aon`):

```
$.customers.ledgerId: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.customers.ledgerId
  expected: integer&min(1)
  actual:   0d9007199254740993
```

`number` would admit floats, so `domain.aon` spells the field as the
two-leaf disjunction:

```aon
ledgerId: integer & min(1) | biginteger & min(1)
```

Every schema between the wire and the warehouse spells the id the
same way: `reporting.aon` leaves `ledgerId` out of its Customer view,
and `bad/reporting-int64.aon`, which declares it `integer`, fails
subsumption.

A link is a tree path (`customerId: path("$.customers.cust-1001")`),
so `domain.aon` pins the address shape in the type
(`re("^\\$\\.customers\\.cust-")`) and attaches `refer()` at the bag
spread, where the type is applied to each record
(`&: $.schema.Order & { id: key(), customerId: refer() }`): the
pattern catches a link into the wrong bag, the resolution catches a
link to nothing. `pack()` derives the receivables bag from the
customer bag with `accountFor: refer() & path("$.customers." + key())`,
so accounts cannot drift from customers and each link is checked
rather than carried as a loose string.

`reporting.aon` restates the domain's `*"open"` default on `status`
as `*"open" | string`. A view declaring plain `string` changes the
effective default and fails subsumption with
`compat_default_changed`, so the restatement is what keeps the
projection sound.

The one-file models in `gaps/` each evaluate on their own:

- `agg-sum.aon` derives an invoice total from its lines:
  `pick($.lines, amountCents)` projects a bag of records to a bag of
  numbers, `sum()` folds it with `add` (integer cents total to an
  exact integer), and `greatest()` picks the largest line.
- `multiply.aon` computes `mul(2, 1999)` and integer-cent VAT as
  `div(mul($.amount, 19), 100)`: multiply first, divide once, and
  `div` truncates toward zero, so 19% of 3998 cents is 759. Maths
  arrives as functions; the `*` character is not an operator, and
  `star-token.aon` shows `2 * 1999` refused at parse with
  `[aontu/unexpected]`.
- `unique-by-field.aon` puts `unique(ledgerId)` on the customer bag:
  no two members may share the named key, and a member without it
  fails rather than being skipped. Two customers with the same ledger
  id are refused with `[aontu/constraint]` at `$.customers`.
- `spread-cross-field.aon` states `gross = net + tax` once, as a
  `must()` in the invoice bag spread. The relative references inside
  the `must()` argument do not resolve against each record there, and
  the file is refused with `[aontu/no_path]`; `seed.aon` writes that
  `must()` on each invoice record, where the same references resolve.
- `list-length-template.aon` attaches `length(min(1) & max(50))` to a
  list template. A sizing atom is read from the merged container, and
  here that is the template list itself, with no members, so the file
  is refused with `[aontu/constraint]`; `domain.aon` leaves
  `lines: [&: $.schema.OrderLine]` without a cardinality bound.
- `include-alias-spread/` is a two-file model: `vocab.aon` declares a
  named alias (`T: type(integer & min(1))`) and a record type that
  references it, and `main.aon` includes it with `@"./vocab.aon"` and
  adds one record. Named aliases resolve across the include boundary
  as they do within a file, and the record generates fully unified.

Generated JSON prints exact values as plain digits (`0.3`,
`9007199254740993`); a consumer that parses JSON numbers as doubles
rounds them, and `--canon` keeps the `0d` prefix and the exact value.

## What check.sh proves

1. `aontu seed.aon` matches `expected/seed.json` byte for byte:
   defaults filled (`ord-7002.status` is `"open"`), every `id` equal
   to its key, and one receivables account per customer.
2. `aontu get '$.pricing.bundles' --canon seed.aon` matches
   `expected/bundles-canon.txt`,
   `{"pro-pair":{"eur":0d69.89,"tier":"premium"},"service-kit":{"eur":0d0.3,"tier":"accessory"}}`:
   canon keeps the `0d` kind.
3. `$.reconcile.exactPath` is `0d0.3` in canon and `0.3` generated:
   `0d0.1 + 0d0.2` is exactly `0d0.3`, and the pin in `seed.aon`
   holds.
4. One `vet` command over `seed.aon` and three data files (two
   agent-emitted order batches and a `0d` ledger sync) is
   `verdict: valid`, exit 0; each data file is vetted separately and
   the worst verdict wins. The same run reports a `pref_not_instance`
   compat finding on the defaulted `status` of the order that omits
   it; the finding is an advisory lint (severity `warning`) and the
   verdict stays `valid`.
5. `bad/order-dangling.aon`, an order whose `customerId` names
   `$.customers.cust-9999`, is refused with `[aontu/refer_unresolved]`,
   exit 1, naming the missing customer and the data file, line and
   column.
6. `bad/customer-extra-key.json`, a customer with an undeclared
   `segment` key, is refused by `close()` with `[aontu/closed]`.
7. `bad/customer-country.json`, whose country is `"Switzerland"`, is
   refused by `re("^[A-Z]{2}$")` with `[aontu/constraint]`.
8. `bad/customer-id-lossy.json`, plain JSON carrying
   `9007199254740993`, is refused at parse with
   `[aontu/lossy_integer_literal]`, exit 1: vet never sees a rounded
   id.
9. `bad/id-trap-schema.aon`, which declares `ledgerId: integer &
   min(1)`, refuses `data/customer-bigid.aon` with
   `[aontu/constraint]`, citing `integer&min(1)` against
   `0d9007199254740993`. The domain's `integer | biginteger`
   disjunction admits the same record (it is part of the batch in 4),
   and `aontu get '$.customers.cust-1003.ledgerId' --canon` prints
   `0d9007199254740993`.
10. `exact-money.aon` accepts `data/quote-exact.aon` (`0d10.50`) and
    refuses `data/quote-float.json` (`10.5`) with `[aontu/constraint]`
    against `bigdecimal`:

    ```
    $ aontu vet exact-money.aon data/quote-float.json
    verdict: invalid

    $.quote.amountEur: constraint [conflict]
      [aontu/constraint]: Cannot unify values at path $.quote.amountEur
      expected: bigdecimal&min(0d0)
      actual:   10.5
    ```

11. `data/quote-0d.json`, which spells the amount `0d10.50`, vets as
    valid, because `vet` parses `.json` data files with the Aontu
    parser, and a strict JSON parser rejects the same file. Both
    halves are asserted.
12. `aontu vet --at '$.schema.Customer' domain.aon
    data/customer-record.json` validates one bare record against one
    named type: `verdict: valid`.
13. `aontu subsume reporting.aon domain.aon` is `verdict: subsumes`,
    exit 0: every document the domain admits, the reporting view
    admits.
14. `aontu subsume bad/reporting-int64.aon domain.aon` is
    `undecided`, exit 3, citing `sub_disjunct_distribution` and the
    domain's `biginteger&min(1)` alternative that the view's `integer`
    does not admit.
15. `gaps/agg-sum.aon` evaluates with `"total": 4008` and
    `"largest": 3998`.
16. `gaps/multiply.aon` evaluates with `"amount": 3998` and
    `"vatCents": 759`.
17. `gaps/star-token.aon` is refused at parse with
    `[aontu/unexpected]`, exit 1.
18. `gaps/float-mix.aon` is refused with `[aontu/exact_float_mix]`,
    exit 1.
19. `gaps/spread-cross-field.aon` is refused with `[aontu/no_path]`,
    exit 1.
20. `gaps/list-length-template.aon` is refused with
    `[aontu/constraint]`, exit 1.
21. `gaps/unique-by-field.aon` is refused with `[aontu/constraint]` at
    `$.customers`, exit 1.
22. `gaps/include-alias-spread/main.aon` generates the record through
    the include, `"ledgerId": 5` and `"id": "cust-1001"`, exit 0.
23. `data/quote-wire.json` is strict JSON (`JSON.parse` accepts it),
    and `aontu vet money-wire.aon data/quote-wire.json` is
    `verdict: valid`.
24. The conversion mark is optional to send and impossible to
    contradict: `data/quote-wire-marked.json`, which echoes
    `"dec": "bigdecimal:2"` beside a negative amount, is valid;
    `bad/quote-wire-mark.json`, which claims `"dec": "float"`, is
    refused at `$.quote.dec`, citing `bigdecimal:2`.
25. The wrong scale (`"3998.1"`) and a bare JSON number (`3998.19`)
    are both refused at `$.quote.amount`.
26. `aontu jsonschema --at '$.Money' money-wire.aon` carries the
    pattern `^-?(0|[1-9][0-9]*)[.][0-9]{2}$` and
    `"const": "bigdecimal:2"`, and `dec` is not in `required`; running
    the exported `type` and `pattern` over the same four records gives
    the verdicts vet gave.
27. `aontu --canon money-convert.aon` prints `"amount":0d3998.19`,
    `"refund":-0d12.05`, `"sameNumber":0d10.5`,
    `"scaleZeroRight":0d10.0` and `"vatExact":0d759.6561`: the
    conversion, its sign, its scale and its VAT all pin.

## Running it

From this directory, `./check.sh` runs all 29 assertions and exits 0.
It drives the TypeScript CLI (`ts/bin/aontu.js`, or the command in
`$AONTU`), and every refusal is asserted by exit code and machine code
rather than by error prose. The two verbs by hand:

```sh
aontu seed.aon                                                                            # generate the fixture set
aontu vet seed.aon data/order-batch-1.aon data/order-batch-2.aon data/customer-bigid.aon  # vet a batch
```
