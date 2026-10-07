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

The import drops and names each construct it has no reading for, so
it admits more than the schema does. An annotation is no loss: it
rides `meta()` beside the value it describes, and changes nothing
admitted. Write `payment.schema.json`:

<!-- test: file payment.schema.json -->
```json
{
  "description": "How an order is paid.",
  "type": "object",
  "properties": {
    "method": {"enum": ["card", "transfer"]},
    "card": {"type": "string", "pattern": "^(?=[0-9]{12,19}$)[0-9]+$"},
    "holder": {"type": "string"}
  },
  "required": ["method"],
  "unevaluatedProperties": false
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --strict payment.schema.json
schema: hide(meta(
  { method: ("card"|"transfer") card?:empty() holder?:empty() } & rest(
    nil,
    any,
    { keys:"method"|"card"|"holder" }
  ),
  { description:"How an order is paid." }
))
lossy: #/properties/card/pattern pattern: the pattern uses a (?...) group other than the non-capturing (?:, which re() does not carry, so it is DROPPED and the import admits strings the schema refuses
vet data against it with: aontu vet --at '$.schema' --no-fill --exact-numbers <file.aontu> <data>
$ echo $?
1
```

The import drops the pattern, which holds a `(?=` group, so the
imported source admits a card number the pattern refuses. It carries
`unevaluatedProperties` as `rest()`, which refuses every key the
schema does not name. `--strict` exits 1 on any loss, for a pipeline
that must not admit more than the schema does.
Without it the same import exits 0.

## Assert the formats

2020-12 makes `format` an annotation, so by default the import keeps
it in `meta()` and admits any string. `--format-assertion` asks for the
check a validator makes when it is set to assert formats. Write
`contact.schema.json`:

<!-- test: file contact.schema.json -->
```json
{
  "type": "object",
  "properties": {
    "email": {"type": "string", "format": "email"},
    "since": {"type": "string", "format": "date"}
  }
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --format-assertion contact.schema.json
schema: hide({
  email?: meta(empty() & format("email"), { format:"email" })
  since?: meta(empty() & format("date"), { format:"date" })
})
```

Each format aontu checks is also `format(name)`, so it asserts. Save
the output as `contact.aontu`:

<!-- test: file contact.aontu -->
```aontu
schema: hide({
  email?: meta(empty() & format("email"), { format:"email" })
  since?: meta(empty() & format("date"), { format:"date" })
})
```

Write a contact whose date names no such day as `contact.json`:

<!-- test: file contact.json -->
```json
{"email": "ana@example.com", "since": "2026-02-30"}
```

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' --no-fill --exact-numbers contact.aontu contact.json
verdict: invalid

$.schema.since: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.schema.since
  expected: format("date")&empty()
  actual:   "2026-02-30"
  data: contact.json:1:39 ("2026-02-30")
  schema: contact.aontu:3:11 (format("date")&empty())
$ echo $?
1
```

`regex`, the one format 2020-12 defines that aontu does not check yet,
is a loss, and a name 2020-12 does not define asserts nothing. The export writes each `format()` back as
`format` and reports it, since a reader of the default dialect takes
it for an annotation again.

## The refusals

A schema the import cannot read exits 4 with a finding at the JSON
Pointer of the fault, and stdout stays empty. A `$ref` to a document
the import was not given is one such fault. Write
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
  the reference "https://example.com/address.json" names a document the import was not given
$ echo $?
4
```

The same code answers a pointer or an anchor that names nothing in
the document it names. Text that is not JSON, or a keyword holding a
value 2020-12 does not define for it, is `jsonschema_schema`, and an
identifier or an anchor that names two schemas is
`jsonschema_duplicate`.

## A reference to another document

The import reads the documents a schema refers to from the ones it is
given, each with `--document <uri>=<file>`: the URI is the one the
references name, and the file holds the document. Write
`address.json`:

<!-- test: file address.json -->
```json
{
  "$id": "https://example.com/address.json",
  "type": "object",
  "properties": {"city": {"type": "string"}},
  "required": ["city"]
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --document https://example.com/address.json=address.json address.schema.json
%_d-https_3a__2f__2f_example_2e_com_2f_address_2e_json = identity(
  { city:empty() },
  { id:"https://example.com/address.json" }
)

schema: hide({ billing?:%_d-https_3a__2f__2f_example_2e_com_2f_address_2e_json })
```

The other document is imported into the same source, as an alias
named for its URI, so the result refers to nothing outside itself.
`identity()` holds the URI on the declaration, where the export reads
it back as the definition's `$id`. Save the source as `order.aontu`:

<!-- test: file order.aontu -->
```aontu
%_d-https_3a__2f__2f_example_2e_com_2f_address_2e_json = identity(
  { city:empty() },
  { id:"https://example.com/address.json" }
)

schema: hide({ billing?:%_d-https_3a__2f__2f_example_2e_com_2f_address_2e_json })
```

Write an order whose city is not a string, as `order.json`:

<!-- test: file order.json -->
```json
{"billing": {"city": 5}}
```

<!-- test: run -->
```sh
$ aontu vet --at '$.schema' --no-fill --exact-numbers order.aontu order.json
verdict: invalid

$.schema.billing.city: empty_domain [conflict]
  [aontu/empty_domain]: Cannot unify values at path $.schema.billing.city
  data: order.json:1:22 (5)
  schema: order.aontu:2:10 (empty())
$ echo $?
1
```

A document is read when a reference first reaches it. A reference to
a URI that names no document it was given reads the rest, since an
`$id` inside one may be the URI it names.

The full mapping is in the reference under
[`aontu jsonschema import`](../reference-api.md#aontu-jsonschema-import),
and the other direction is [export JSON Schema](export-json-schema.md).
