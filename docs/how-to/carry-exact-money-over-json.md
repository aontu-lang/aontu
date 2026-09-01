---
description: Keep money exact inside Aontu and cross JSON as a fixed-scale decimal string with a conversion mark.
group: schemas
order: 60
---

# Carry exact money over JSON

Inside an Aontu document, money is a
[`bigdecimal`](../reference-language.md#the-four-numeric-leaves):
`0d` literals are exact base-10 values and `+` on them is exact
arithmetic — no binary rounding, ever. Write this as `money.aon`:

<!-- test: scenario money-wire -->
<!-- test: file money.aon -->
```aontu
subtotal: 0d19.99
shipping: 0d4.01
total:    $.subtotal + $.shipping
```

<!-- test: run -->
```sh
$ aontu money.aon
{
  "shipping": 4.01,
  "subtotal": 19.99,
  "total": 24.0
}
```

The problem is the wire. A `bigdecimal` schema cannot be satisfied by
a plain JSON number, by design: `JSON.parse` has already turned `0.1`
into a binary64 `float` before Aontu ever sees it, and [the numeric
leaves are
disjoint](../reference-language.md#the-four-numeric-leaves), so the
exactness the field demands is gone at the door. Put the schema in
`invoice.aon`:

<!-- test: file invoice.aon -->
```aontu
invoice: { total: bigdecimal }
```

and a parsed-and-reserialised number in `invoice.json`:

<!-- test: file invoice.json -->
```json
{"invoice": {"total": 0.1}}
```

<!-- test: run -->
```sh
$ aontu vet invoice.aon invoice.json
verdict: invalid

$.invoice.total: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.invoice.total
  data: invoice.json:1:23 (0.1)
  schema: invoice.aon:1:19 (bigdecimal)
$ echo $?
1
```

This refusal is the feature: a schema that admitted `0.1` here would
be certifying a value the wire already corrupted. The convention that
works is string decimals at the boundary — the JSON field carries the
exact digits as text, and the schema pins its shape with
[`re`](../reference-language.md#re-and-the-portable-pattern-subset).
Replace `invoice.aon` with the string form:

<!-- test: file invoice.aon -->
```aontu
invoice: { total: string & re("^-?[0-9]+\\.[0-9][0-9]$") }
```

A conforming wire value in `wire.json`:

<!-- test: file wire.json -->
```json
{"invoice": {"total": "19.99"}}
```

and a wrong-scale one in `bad.json`:

<!-- test: file bad.json -->
```json
{"invoice": {"total": "19.9"}}
```

<!-- test: run -->
```sh
$ aontu vet invoice.aon wire.json
verdict: valid
$ aontu vet invoice.aon bad.json
verdict: invalid

$.invoice.total: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.invoice.total
  expected: re("^-?[0-9]+\\.[0-9][0-9]$")
  actual:   "19.9"
  data: bad.json:1:23 ("19.9")
  schema: invoice.aon:1:28 (re("^-?[0-9]+\\.[0-9][0-9]$"))
$ echo $?
1
```

## The convention, in full

A pattern alone leaves the reader guessing that the string is a
number at all. The convention has two parts, a canonical wire form
and a conversion mark that says what the text means. Write it as
`money-wire.aon`:

<!-- test: file money-wire.aon -->
```aontu
# A decimal carried as text, at a fixed scale. Canonical only: no
# leading zeros, no separators, no exponent, no bare -0.
Dec2: type(string & re("^-?(0|[1-9][0-9]*)[.][0-9]{2}$") & neq("-0.00"))

Money: type(close({
  amount: $.Dec2
  currency: string & re("^[A-Z]{3}$") & neq("XXX", "XTS")

  # The conversion mark: which leaf, at what scale. OPTIONAL, so a
  # producer is never asked to send it; CONSTANT, so a producer that
  # does send it cannot claim something else.
  dec?: "bigdecimal:2"
}))
```

Write the mark as a constant, not as a preference. `dec?:
*"bigdecimal:2"` looks equivalent and is not: a preference is a
*default*, so it yields to whatever the data says, and `{"dec":
"float"}` would vet clean.

The currency travels with the amount. A decimal string with no
currency beside it is a number rather than money, and every rounding
rule that matters belongs to the currency.

## Crossing the boundary

The conversion is textual: the wire string is the `0d` literal's
digits, so nothing is parsed as a float on the way in and nothing is
rounded. Put the corner cases in `convert.aon`:

<!-- test: file convert.aon -->
```aontu
amount:         0d3998.19
refund:         -0d12.05
sameNumber:     0d10.50 & 0d10.5
scaleZeroRight: 0d10.0
```

<!-- test: run -->
```sh
$ aontu --canon convert.aon
{"amount":0d3998.19,"refund":-0d12.05,"sameNumber":0d10.5,"scaleZeroRight":0d10.0}
```

Three details decide whether an implementation of this is correct:

- **The sign goes outside the prefix.** `"-12.05"` becomes
  `-0d12.05`. `0d-12.05` is not a literal, so a converter that pastes
  the sign after the prefix fails to parse rather than computing the
  wrong number — the safe direction, but still the detail everyone
  gets wrong once.
- **Scale is not part of the value.** `0d10.50` and `0d10.5` are the
  same number and unify; canon prints the shorter one. A serialiser
  therefore cannot recover `"10.50"` from the value — it formats *to*
  the scale the schema declared, which is why the mark names a scale
  as well as a leaf.
- **At scale 0 the point still has to be written.** `0d10` is a
  `biginteger` and the leaves are disjoint, so a scale-0 wire decimal
  converts to `0d<digits>.0` — never `0d<digits>`, which would refuse
  the very schema it was converted for.

The producer formats its exact value into the string; the consumer,
after `vet` passes, parses the string with a *decimal* parser (never
`parseFloat`) — in TypeScript the `Decimal` class the engine itself
uses, in Go `math/big`. Inside the trust boundary, keep the value a
`0d` exact literal and let Aontu's arithmetic and the [lossy-literal
refusal](../reference-language.md#exact-or-refused-lossy-literals)
protect it. Note the asymmetry: Aontu's own generated JSON *writes*
an exact value's digits faithfully (the `24.0` above), but a standard
JSON reader hands them back as a float. Exactness survives writing,
not the round trip, which is exactly why the wire field is a string.

## The convention survives export

A bare `bigdecimal` field is a loss on a JSON Schema export — the
exactness has no receiver. The wire form is the way around it:
[export JSON Schema](export-json-schema.md) covers the verb, and the
`Money` type crosses whole, mark included:

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.Money' money-wire.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "amount": {
...
      "pattern": "^-?(0|[1-9][0-9]*)[.][0-9]{2}$",
      "type": "string"
    },
...
    "dec": {
      "const": "bigdecimal:2",
      "type": "string"
    }
  },
  "required": [
    "amount",
    "currency"
  ],
  "type": "object"
}
```

`type` and `pattern` do different jobs here and both are needed:
`type: "string"` is what refuses a bare JSON number (whose *text* the
pattern would happily accept), `pattern` is what refuses the wrong
scale. A consumer that never runs Aontu still enforces the wire form,
and still learns the leaf and the scale from the exported `const`.

A worked end-to-end version — the schema, strictly-JSON records that
pass, the three that must not, the exported schema checked against the
same records, and the conversion written as theorems — is
[use-cases/10-data-model](../../use-cases/10-data-model/)
(`money-wire.aon` and `money-convert.aon`), with `check.sh` asserting
every claim on this page.
