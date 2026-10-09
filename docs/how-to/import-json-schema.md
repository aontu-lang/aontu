---
description: Import a JSON Schema document, from draft-04 to 2020-12, as aontu, and check data against it the way JSON Schema does.
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
with its numbers read by value. The import prints that invocation on
stderr after its losses, as `vet with: aontu vet --no-fill
--exact-numbers <document> <data>`. Write the order as `good.json`:

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

A keyword the importer does not carry is dropped and reported on
stderr, so `aontu jsonschema import s.json > s.aontu` writes a usable
document and still says what it left behind. A 2020-12 schema that
uses a keyword of an earlier dialect, such as `additionalItems`
beside `prefixItems`, is wider than its author meant, and the report
says so. `--strict` turns any loss into exit 1, for a pipeline that
must not accept a widened schema. Write `email.json`:

<!-- test: file email.json -->
```json
{"type": "object", "properties": {"email": {"type": "string", "format": "email", "title": "Email"}, "tags": {"type": "array", "prefixItems": [{"type": "string"}], "additionalItems": false}}}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --strict email.json
email?: meta(empty(), { format:"email" title:"Email" })
tags?: [&: match(key(0), "0", empty(), any)]
lossy: #/properties/tags/additionalItems additionalItems: a keyword of an earlier dialect, which 2020-12 does not define, so it is dropped and the position admits more than that dialect does
vet with: aontu vet --no-fill --exact-numbers <document> <data>
$ echo $?
1
```

Without `--strict` the same import exits 0. Text that is not a schema
is refused with `jsonschema_schema` and exit 4, naming where the text
goes wrong.

## Import an earlier dialect

A schema written for draft-04, draft-06, draft-07 or 2019-09 is read
in its own dialect, which its `$schema` names. The importer rewrites
it, keyword by keyword, into the 2020-12 schema that means the same
before reading it: an array `items` and `additionalItems` become
`prefixItems` and `items`, `dependencies` becomes `dependentSchemas`
and `dependentRequired`, and so on. Write `shape.json`:

<!-- test: file shape.json -->
```json
{"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {"point": {"type": "array", "items": [{"type": "number"}, {"type": "number"}], "additionalItems": false}, "label": {"$ref": "#/definitions/label", "maxLength": 3}}, "definitions": {"label": {"type": "string"}}}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --strict shape.json
%p_definitions_2f_label = empty()

point?: [&: match(key(0), "0", number, "1", number, nil)]
label?: %p_definitions_2f_label
lossy: #/properties/label/maxLength maxLength: draft-07 and earlier read nothing beside $ref, so this keyword asserts nothing and is dropped
vet with: aontu vet --no-fill --exact-numbers <document> <data>
$ echo $?
1
```

The loss names the keyword where it was written. Draft-07 and earlier
read nothing beside a `$ref`, so the `maxLength` there asserts nothing,
and `--strict` says so with exit 1.

A schema that names no dialect is read as 2020-12. `--dialect` reads
it in another, as in a draft-04 schema whose `exclusiveMinimum` is a
flag on `minimum`. Write `ratio.json`:

<!-- test: file ratio.json -->
```json
{"type": "number", "minimum": 0, "exclusiveMinimum": true}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --dialect draft-04 ratio.json
number & above(0)
```

A `$schema` that names no dialect aontu reads refuses the import with
`jsonschema_dialect`, unless `--doc` supplies the custom meta-schema at
that URI, whose own `$schema` then names the dialect. A custom
meta-schema whose `$vocabulary` lists vocabularies also narrows what
its schemas read: a keyword of a vocabulary it does not list is carried
as an annotation, and a vocabulary it requires that aontu does not read
refuses the import with `jsonschema_vocabulary`.

## Keep the annotations

The `format` and `title` in `email.json` are not lost. The annotation keywords
of JSON Schema assert nothing, so the importer carries them on the value they
describe, in a `meta()` record: `title`, `description`, `$comment`,
`default`, `examples`, `readOnly`, `writeOnly`, `format` and the
content keywords, with any keyword JSON Schema does not name under `x`.
`deprecated` imports as `deprecate()`. A record never changes what its
value admits, and the export writes it back.

A `default` stays an annotation, as JSON Schema means it, so it fills
nothing. `--defaults` makes an optional property's `default` a
preference, which generation fills, where the property's own
assertions admit it. Write `port.json`:

<!-- test: file port.json -->
```json
{"type": "object", "properties": {"port": {"type": "integer", "default": 8080, "description": "The listen port"}}}
```

<!-- test: run -->
```sh
$ aontu jsonschema import --defaults port.json
port?: *8080|meta(number & multiple(1), {
  default: 8080
  description: "The listen port"
})
```

## Assert formats

A `format` is an annotation unless a validator is asked to assert it,
as JSON Schema 2020-12 has it, so the `"format": "email"` above checks
nothing. `--format-assert` makes each format an assertion as well,
`format(g)` with the grammar aontu commits for it, and
`--format-grammar` gives a format JSON Schema does not define a grammar
of your own. Write `visit.json`:

<!-- test: file visit.json -->
```json
{"type": "object", "properties": {"day": {"type": "string", "format": "date"}, "zip": {"type": "string", "format": "zip"}}}
```

and `zip.abnf`, the grammar for `zip`:

<!-- test: file zip.abnf -->
```abnf
zip = 5DIGIT
```

<!-- test: run -->
```sh
$ aontu jsonschema import --format-assert --format-grammar zip zip.abnf visit.json
day?: meta(empty() & format("date"), { format:"date" })
zip?: meta(empty() & format("zip = 5DIGIT\n"), { format:"zip" })
```

The grammar is the file's text, its last newline included. The
`meta()` record still carries each name, so the export writes `format`
back; it writes a grammar as `x-aontu-format`, which the import reads
in any mode. Under `--format-assert` a format with no grammar
stays an annotation. A schema whose meta-schema, in the document set,
lists the format-assertion vocabulary, or requires 2019-09's format
vocabulary, asserts its formats without the flag, and there a format
with no grammar refuses the import with `format_unknown`, as JSON
Schema asks.

## What to watch for

- Each loss names a pointer into the schema, `#/properties/a/format`,
  and the keyword it dropped.
- A committed format reads what the grammar in its RFC reads, with a few
  limits the [language reference](../reference-language.md#formats-format)
  lists: a `hostname` A-label is never decoded, and the email formats
  do not count RFC 5321's size limits.
- A `$ref` that names another document needs that document in the
  set: pass it with `--doc <uri> <file>`, and the schema's own URI with
  `--uri` where its references are relative. Nothing is fetched, and a
  reference the import cannot reach refuses it with `jsonschema_ref`.
  The published meta-schemas of the five dialects, and of their
  vocabularies, are in the set without `--doc`.
- A `$dynamicRef` is specialised to the dynamic scope it is read in, so
  a schema reached through scopes that bind its dynamic anchors
  differently is declared once for each, its later declarations named
  with an `_e2` suffix and on. The use keeps the reference's text in
  its `meta` record, and the export writes it back as a `$dynamicRef`
  where it reads the same.
- `anyOf` imports as a disjunction only where its branches cannot both
  hold for one value; otherwise it is `nof(min(1), …)`, which counts the
  branches that admit the data rather than choosing one. `oneOf` is
  `nof(1, …)` and `not` is `nof(0, …)`.
- `if`, `then` and `else` import as `when(c, t, e)`, and only within
  one schema object: an `if` in one `allOf` branch never pairs with a
  `then` in another. `dependentSchemas` and `dependentRequired` are a
  `when` on the key being present, `when({k: any}, …)`.
- `contains` imports as `contains(c, n)` on the list, with `minContains`
  and `maxContains` as its count, and `uniqueItems` as `unique()`, which
  compares numbers by value under `vet --exact-numbers`.
- `unevaluatedProperties` and `unevaluatedItems` import as the spread
  `additionalProperties` would be where no branch decides what is
  evaluated. Where an `anyOf`, `oneOf`, `if` or `dependentSchemas`
  branch does, they are `rest(t, …)`, which holds each member no passing
  branch evaluates to `t`.
- A reference is an alias only where the schema's root is an object
  schema with `type: "object"`, whatever annotations, deprecation or
  counts it carries beside its properties. Any other root copies each
  referenced schema in place, and a reference that reaches itself
  through such a root is cut, with a loss.

The constructs the import writes are in the
[language reference](../reference-language.md); the verb and its
options are in the [API reference](../reference-api.md#aontu-jsonschema-import).
For the other direction, see [Export JSON Schema](export-json-schema.md).
