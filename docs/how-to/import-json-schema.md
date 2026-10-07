---
description: Turn a JSON Schema 2020-12 into aontu source, then vet data against it as the schema judges it.
group: schemas
order: 75
---

# Import JSON Schema

A partner publishes its API contract as JSON Schema, and you want that
contract inside your model rather than in a second validator beside
it. `aontu jsonschema import` reads a draft 2020-12 schema, writes
aontu source to stdout, and names on stderr every keyword it could not
carry. The schema stays the partner's. The source is yours to refine.

## Import a schema

Write the contract as `order.schema.json`:

<!-- test: scenario jsonschema-import-howto -->
<!-- test: file order.schema.json -->
```json
{
  "$defs": {
    "money": {"type": "string", "pattern": "^[0-9]+[.][0-9]{2}$"}
  },
  "type": "object",
  "properties": {
    "version": {"const": "v1"},
    "status": {"enum": ["open", "paid", "void"]},
    "total": {"$ref": "#/$defs/money"},
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sku": {"type": "string"},
          "qty": {"type": "integer", "minimum": 1}
        },
        "required": ["sku", "qty"]
      }
    },
    "vat": {"enum": [0, 0.2]}
  },
  "required": ["version", "status", "total"]
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import order.schema.json
%money = empty() & re("^[0-9]+[.][0-9]{2}$")

schema: hide({
  version: "v1"
  status: ("open"|"paid"|"void")
  total: %money
  lines?: [&: { sku:empty() qty:number & multiple(1) & min(1) }]
  vat?: (0|0d0.2)
})
```

The `$defs` entry became the alias `%money`, declared above the schema
and referenced where the `$ref` was, so a definition used twice is
written once. `"type": "string"` reads as `empty()`, the string that
may be empty, because aontu's own `string` refuses `""`, which a JSON
Schema string admits.

## Vet data against it

The definition sits under `hide()`, so the file generates nothing of
its own and `vet --at '$.schema'` checks data against it. Save the
output as `order.aontu`:

<!-- test: file order.aontu -->
```aontu
%money = empty() & re("^[0-9]+[.][0-9]{2}$")

schema: hide({
  version: "v1"
  status: ("open"|"paid"|"void")
  total: %money
  lines?: [&: { sku:empty() qty:number & multiple(1) & min(1) }]
  vat?: (0|0d0.2)
})
```

Write a paid order as `paid.json`:

<!-- test: file paid.json -->
```json
{"version": "v1", "status": "paid", "total": "12.50", "lines": [{"sku": "A-1", "qty": 2}]}
```

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' --no-fill --exact-numbers order.aontu paid.json
verdict: valid
```

The two options are what make `vet` answer as the schema does, and
each has a case that shows why. Write an order with no `version` as
`unversioned.json`:

<!-- test: file unversioned.json -->
```json
{"status": "open", "total": "3.00"}
```

Plain `vet` fills the missing `version` from the `const`, which is
what generation is for:

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' order.aontu unversioned.json
verdict: valid
```

`--no-fill` asks instead whether the data already *is* an instance,
and the schema requires `version`:

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' --no-fill --exact-numbers order.aontu unversioned.json
verdict: incomplete

$.schema.version: vet_filled [incomplete]
  the schema supplies "v1", which the data does not carry
  schema: order.aontu:4:12 ("v1")
$ echo $?
3
```

JSON Schema compares numbers by their value, so the `0.2` an order
carries is the `0.2` the schema lists. Write an order with that rate as
`vat.json`:

<!-- test: file vat.json -->
```json
{"version": "v1", "status": "open", "total": "3.00", "vat": 0.2}
```

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' --no-fill order.aontu vat.json
verdict: invalid

$.schema.vat: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.schema.vat
  data: vat.json:1:61 (0.2)
  schema: order.aontu:8:9 (0|0d0.2)
$ echo $?
1
$ aontu vet --at '$.schema' --no-fill --exact-numbers order.aontu vat.json
verdict: valid
```

Without `--exact-numbers`, `vet` reads `0.2` by its spelling, as a
float, where the import wrote the schema's `0.2` by its value, as the
exact `0d0.2`. With it, every number is read by its value, which is the
reading the import was written for. An integer needs neither:
`"integer"` imports as `number & multiple(1)`, which admits `1.0`
however `vet` reads it.

## Read the losses

A keyword the import does not carry yet is dropped and named, so the
import admits more than the schema does. An annotation is dropped too,
and changes nothing admitted. Write `payment.schema.json`:

<!-- test: file payment.schema.json -->
```json
{
  "description": "How an order is paid.",
  "type": "object",
  "properties": {
    "method": {"enum": ["card", "transfer"]},
    "card": {"type": "string", "minLength": 12},
    "holder": {"type": "string"}
  },
  "required": ["method"],
  "unevaluatedProperties": false
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --strict payment.schema.json
schema: hide({
  method: ("card"|"transfer")
  card?: empty() & len(min(12))
  holder?: empty()
})
lossy: #/description description: an annotation; it is dropped, and what the import admits is unchanged
lossy: #/unevaluatedProperties unevaluatedProperties: not carried yet, so it is DROPPED and the import admits instances the schema refuses
vet data against it with: aontu vet --at '$.schema' --no-fill --exact-numbers <file.aontu> <data>
$ echo $?
1
```

`unevaluatedProperties` refused every key the schema does not name,
and the imported source admits an order that carries one. `--strict`
exits 1 on any loss, for a pipeline that must not admit more than the
schema does. Without it the same import exits 0.

## The refusals

A schema the import cannot read exits 4 with a finding at the JSON
Pointer of the fault, and stdout stays empty. The import reads one
document, so a `$ref` to another is one such fault. Write
`address.schema.json`:

<!-- test: file address.schema.json -->
```json
{
  "type": "object",
  "properties": {
    "billing": {"$ref": "https://example.com/address.json"}
  }
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import address.schema.json
#/properties/billing/$ref: jsonschema_ref [reference]
  the reference "https://example.com/address.json" names another document, and the import reads one document
$ echo $?
4
```

The same code answers a pointer or an anchor that names nothing in
the document. Text that is not JSON, or a keyword holding a value
2020-12 does not define for it, is `jsonschema_schema`.

The full mapping is in the reference under
[`aontu jsonschema import`](../reference-api.md#aontu-jsonschema-import),
and the other direction is [export JSON Schema](export-json-schema.md).
