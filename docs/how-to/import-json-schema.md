---
description: Import a JSON Schema 2020-12 document as aontu, and check data against it the way JSON Schema does.
group: schemas
order: 75
---

# Import JSON Schema

A schema you were handed is often JSON Schema: an OpenAPI component, a
tool's `inputSchema`, a contract another team publishes. `aontu
jsonschema import` rewrites one as an aontu document, so you can unify
it with your own models, compare two versions of it, and check data
against it with `vet`. Like the export, it names every keyword it could
not carry rather than dropping it.

## Import a schema

Write this as `order.json`:

<!-- test: scenario jsonschema-import -->
<!-- test: file order.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {"type": "integer", "minimum": 1},
    "total": {"type": "number", "exclusiveMinimum": 0},
    "lines": {"type": "array", "items": {"$ref": "#/$defs/line"}, "minItems": 1},
    "note": {"type": "string", "maxLength": 200}
  },
  "required": ["id", "total", "lines"],
  "additionalProperties": false,
  "$defs": {
    "line": {
      "type": "object",
      "properties": {
        "sku": {"type": "string", "pattern": "^[A-Z]{3}-\\d{4}$"},
        "qty": {"type": "integer", "minimum": 1}
      },
      "required": ["sku", "qty"]
    }
  }
}
```

<!-- test: run -->
```sh
$ aontu jsonschema import order.json
%d_line = sku: empty() & re("^[A-Z]{3}-\\d{4}$")
%d_line = qty: number & multiple(1) & min(1)

id: number & multiple(1) & min(1)
total: number & above(0)
lines: [&: %d_line] & len(min(1))
note?: empty() & len(max(200))
&: match(key(0), "id", any, "total", any, "lines", any, "note", any, nil)
```

Each keyword lands on the construct that means it:

- A property is an optional key, and `required` drops the `?`.
- `additionalProperties: false` is a spread that admits the declared
  names and refuses every other key with `nil`.
- `items` is a list spread, and `minItems` a count with `len`.
- `type: "string"` is `empty()`, because the strings of JSON Schema
  include `""` and aontu's `string` does not.
- `type: "integer"` is `number & multiple(1)`: a number with no
  fraction, however it is written, so `2.0` is one.
- A `$defs` entry that something references is an alias, here
  `%d_line`, declared one member to a line.

## Check data against it

Save the text above as `order.aontu`:

<!-- test: file order.aontu -->
```aontu
%d_line = sku: empty() & re("^[A-Z]{3}-\\d{4}$")
%d_line = qty: number & multiple(1) & min(1)

id: number & multiple(1) & min(1)
total: number & above(0)
lines: [&: %d_line] & len(min(1))
note?: empty() & len(max(200))
&: match(key(0), "id", any, "total", any, "lines", any, "note", any, nil)
```

Then check an order with `--no-fill --exact-numbers`, which asks the
question JSON Schema asks: whether the data is an instance as written,
with its numbers read by value. Write the order as `good.json`:

<!-- test: file good.json -->
```json
{"id": 7, "total": 19.90, "lines": [{"sku": "ABC-1234", "qty": 2}]}
```

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers order.aontu good.json
verdict: valid
```

An order with a key the schema does not declare is refused. Write it
as `bad.json`; its quantity, written `2.0`, is the integer it is:

<!-- test: file bad.json -->
```json
{"id": 7, "total": 19.90, "lines": [{"sku": "ABC-1234", "qty": 2.0}], "extra": true}
```

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers order.aontu bad.json
verdict: invalid

$.extra: literal_nil [conflict]
...
$ echo $?
1
```

Without `--exact-numbers`, a decimal in the data is read as a binary
float, so `0.3` sent against `"minimum": 0.3` falls just short of the
bound and is refused.
Without `--no-fill`, a default or a literal in the schema fills a
member the data left out, where JSON Schema reports it missing.

## Read the loss report

A keyword the importer does not carry yet is dropped and reported on
stderr, so `aontu jsonschema import s.json > s.aontu` writes a usable
document and still says what it left behind. An annotation such as
`title` or `format` asserts nothing, so dropping it changes no answer;
a validation keyword such as `if` widens the schema, and the report
says so. `--strict` turns any loss into exit 1, for a pipeline that
must not accept a widened schema. Write `email.json`:

<!-- test: file email.json -->
```json
{"type": "string", "format": "email", "title": "Email"}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --strict email.json
empty()
lossy: #/format format: an annotation asserts nothing, and the importer does not keep annotations yet, so it is dropped
lossy: #/title title: an annotation asserts nothing, and the importer does not keep annotations yet, so it is dropped
$ echo $?
1
```

Without `--strict` the same import exits 0. Text that is not a schema
is refused with `jsonschema_schema` and exit 4, naming where the text
goes wrong.

## What to watch for

- Each loss names a pointer into the schema, `#/properties/a/format`,
  and the keyword it dropped.
- A `$ref` that names another document is reported, and the position
  admits anything: the importer reads one document.
- `anyOf` imports as a disjunction only where its branches cannot both
  hold for one value; otherwise it is `nof(min(1), …)`, which counts the
  branches that admit the data rather than choosing one. `oneOf` is
  `nof(1, …)` and `not` is `nof(0, …)`.
- A reference is an alias only where the schema's root is an object
  schema with `type: "object"`. Any other root copies each referenced
  schema in place, and a reference that reaches itself through such a
  root is cut, with a loss.

The constructs the import writes are in the
[language reference](../reference-language.md); the verb and its
options are in the [API reference](../reference-api.md#aontu-jsonschema-import).
For the other direction, see [Export JSON Schema](export-json-schema.md).
