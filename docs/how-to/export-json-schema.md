---
description: Export a model as JSON Schema 2020-12 with `aontu jsonschema`, and read the loss report it owes you.
group: schemas
order: 70
---

# Export JSON Schema

JSON Schema is what the rest of the world reads: an MCP tool's
`inputSchema` must be one, structured-output APIs constrain
generation to one, OpenAPI embeds one. `aontu jsonschema` exports the
unified value as draft 2020-12 to stdout—and names every loss on
stderr, because a converter that silently dropped a constraint would
hand you a schema that admits more than the model does.

## Export a whole document

A document whose root is one `close()` expression exports as one
schema object, sealed at the root. Write this as `event.aon`:

<!-- test: scenario jsonschema-export -->
<!-- test: file event.aon -->
```aontu
close({
  id: string & re("^evt_[0-9a-f]{12}$")
  kind: created | updated | deleted
  priority: *normal | low | high
  note?: string & length(min(1) & max(500))
})
```

<!-- test: run -->
```sh
$ aontu jsonschema event.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "id": {
      "pattern": "^evt_[0-9a-f]{12}$",
      "type": "string"
    },
    "kind": {
      "enum": [
        "created",
        "updated",
        "deleted"
      ]
    },
    "note": {
      "maxLength": 500,
      "minLength": 1,
      "type": "string"
    },
    "priority": {
      "default": "normal",
      "enum": [
        "normal",
        "low",
        "high"
      ]
    }
  },
  "required": [
    "id",
    "kind",
    "priority"
  ],
  "type": "object"
}
```

Everything here crossed exactly: `re()` as `pattern`, the scalar
disjunctions as `enum` with the `*` preference as `default`,
`length()` on a string as `minLength`/`maxLength`, the optional
`note` out of `required`, and the root `close()` as
`additionalProperties: false`—the one thing the two languages say
identically. This output is pasteable into an OpenAPI components
entry with nothing to strip.

## Export one definition with `--at`

`--at <path>` names the subtree to export, the same anchor
[`vet --at`](../reference-api.md#aontu-vet) takes. This is the MCP
move: keep a registry of tools in one document and answer each tool's
`inputSchema` from its own anchor. Write a one-tool registry as
`tools.aon`:

<!-- test: file tools.aon -->
```aontu
argschemas: type(close({
  search_docs: close({
    query: string & length(min(1) & max(256))
    limit?: integer & min(1) & max(50)
    scope?: workspace | org | web
  })
}))
```

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.argschemas.search_docs' tools.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "limit": {
      "maximum": 50,
      "minimum": 1,
      "type": "integer"
    },
    "query": {
      "maxLength": 256,
      "minLength": 1,
      "type": "string"
    },
    "scope": {
      "enum": [
        "workspace",
        "org",
        "web"
      ]
    }
  },
  "required": [
    "query"
  ],
  "type": "object"
}
```

The export reads straight through the `type()` mark, and the
closedness the agent must respect crosses without loss: a
hallucinated argument is a refusal on the aontu side and
`additionalProperties: false` on the JSON Schema side. Stderr stayed
empty for this run because the registry is written in the crossing
subset—kinds, scalar enums, bounds, `re()`, string `length()`,
optional keys, `close()`. The full crossing table is in the
reference under
[`aontu jsonschema`](../reference-api.md#aontu-jsonschema).

## Read the loss report

Constructs JSON Schema cannot say still export, as the nearest
admissible schema, and each one is named on stderr with its path and
construct. Collect the classes in `report.aon`:

<!-- test: file report.aon -->
```aontu
report: {
  total: number & must((v) => 0 <= v, "total must not be negative")
  amountEur: bigdecimal
  audit: hide("kept-off-the-wire")
  attempts: [&: integer] & length(max(3))
}
```

<!-- test: run -->
```sh
$ aontu jsonschema --at report report.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "amountEur": {
      "type": "number"
    },
    "attempts": {
      "items": {
        "type": "integer"
      },
      "maxItems": 3,
      "minItems": 0,
      "type": "array"
    },
    "total": {}
  },
  "required": [
    "amountEur",
    "attempts",
    "total"
  ],
  "type": "object"
}
```

That exit was 0—a lossy export is still an export, so redirecting
stdout writes a usable schema. The report went to stderr, and
`--strict` turns it into a failure for pipelines that must not ship
a schema admitting more than the model does:

<!-- test: run -->
```sh
$ aontu jsonschema --strict --at report report.aon
...
lossy: $.report.amountEur bigdecimal: JSON has one number type and it is binary64, so the EXACTNESS this leaf exists for cannot be carried; the schema says "number" and a consumer may round
lossy: $.report.attempts length: a count with no domain is exported as minItems/maxItems; JSON Schema has no keyword that counts a string OR a container
lossy: $.report.audit hide: a hidden entry is not generated, so it is omitted from the schema; a consumer is neither asked for it nor allowed to know about it
lossy: $.report.total nil: this is not a value yet, so there is nothing to constrain a consumer to; the schema admits anything here
$ echo $?
1
```

`--format json` carries the same report as data (`verdict: "lossy"`,
each loss as `{path, construct, reason}`, the schema embedded) for a
build step that wants to allowlist specific losses rather than fail
on any. The `bigdecimal` loss is the one with a way around it:
[carry exact money over JSON](carry-exact-money-over-json.md) crosses
the export loss-free as a decimal string with a conversion mark.

## Four edges

The report above already pins two of them. First, `must()` holds the whole value residual, so `number &
must(...)` exports `{}` under the construct name `nil`—the check is
opaque by construction, and the `number` kind beside it is lost with
it (a concrete `5 & must(...)` exports `{}` all the same). Second,
`length()` on a list has no domain until data arrives, so `attempts`
exported real `minItems`/`maxItems` and was still reported: the
keywords are the sizing atom's best rendering, not its meaning.

Third, a spread template crosses as `additionalProperties` (or
`items`) only when it is a bare kind. A template carrying a
constraint call stays residual and exports `{}`, reported as
`unresolved`. Put both in `spreads.aon`:

<!-- test: file spreads.aon -->
```aontu
labels: { &: string }
annotations: { &: string & length(max(63)) }
```

<!-- test: run -->
```sh
$ aontu jsonschema --strict spreads.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "annotations": {
      "additionalProperties": {},
      "properties": {},
      "type": "object"
    },
    "labels": {
      "additionalProperties": {
        "type": "string"
      },
      "properties": {},
      "type": "object"
    }
  },
  "required": [
    "annotations",
    "labels"
  ],
  "type": "object"
}
lossy: $.annotations.& unresolved: this is not a value yet, so there is nothing to constrain a consumer to; the schema admits anything here
$ echo $?
1
```

`labels` admits string values; `annotations` admits anything, and
says so. The same split decides list templates: `[&: string]`
crosses as `items`, a constrained element template does not.

Fourth, `deprecate()` crosses as the annotation 2020-12 has for it,
`deprecated: true`, and what the deprecation SAYS does not, because
the draft has no field for it. That half is reported. Write
`legacy.aon`:

<!-- test: file legacy.aon -->
```aontu
region: deprecate(string & re("^[a-z]{2}-[a-z]+-[0-9]$"), {
  msg: "renamed"
  use: "$.zone"
  since: "2.0.0"
})
```

<!-- test: run -->
```sh
$ aontu jsonschema --strict legacy.aon
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "region": {
      "deprecated": true,
      "pattern": "^[a-z]{2}-[a-z]+-[0-9]$",
      "type": "string"
    }
  },
  "required": [
    "region"
  ],
  "type": "object"
}
lossy: $.region deprecate: JSON Schema 2020-12 has the `deprecated` flag and no field for what it SAYS, so msg/use/since cannot cross; the schema marks the property deprecated and a consumer must read the model for the reason
$ echo $?
1
```

A consumer of the exported schema learns that the property is
deprecated, which is the part that changes what a client does. It does
not learn the reason, the replacement or the version (`msg`, `use`
and `since` have nowhere to go in 2020-12), so `--strict` reports that
half and exits 1. Announce renames through a channel that carries the
text.

## The refusals

A lossy export exits 0; a run that cannot produce a truthful schema
at all exits 4, and stdout stays empty—never a partial schema. An
`--at` that names nothing is one such run:

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.reprot' report.aon
$: no_path [reference]
  [aontu/no_path]: Cannot at value at path $
...
$ echo $?
4
```

So is a document that does not stand up on its own, such as a
dangling reference in `dangling.aon`:

<!-- test: file dangling.aon -->
```aontu
spec: owner: $.people.alice.email
people: {}
```

<!-- test: run -->
```sh
$ aontu jsonschema dangling.aon
$.spec.owner: no_path [reference]
  [aontu/no_path]: Cannot resolve value at path $.spec.owner
  data: dangling.aon:1:14 ($.people.alice.email)
$ echo $?
4
```

That is not a loss to report: the verb exports what a document
*means*, and this one does not mean anything.

The live version is
[use-cases/14-jsonschema-export](../../use-cases/14-jsonschema-export/):
a three-tool registry exported per-anchor with empty stderr, a wire
message exported whole, the money convention crossing intact, and
every loss class pinned by golden files—including the exports
re-checked under a stock JSON reader.
