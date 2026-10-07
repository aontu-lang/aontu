---
description: Export a model as JSON Schema 2020-12 with `aontu jsonschema`, and read the loss report it owes you.
group: schemas
order: 70
---

# Export JSON Schema

JSON Schema is what the rest of the world reads: an MCP tool's
`inputSchema` must be one, structured-output APIs constrain
generation to one, OpenAPI embeds one. `aontu jsonschema` exports the
unified value as draft 2020-12 to stdout, and names every loss on
stderr, because a converter that silently dropped a constraint would
hand you a schema that admits more than the model does.

## Export a whole document

A document whose root is one `close()` expression exports as one
schema object, sealed at the root. Write this as `event.aontu`:

<!-- test: scenario jsonschema-export -->
<!-- test: file event.aontu -->
```aontu
close({
  id: string & re("^evt_[0-9a-f]{12}$")
  kind: created|updated|deleted
  priority: *normal|low|high
  note?: string & len(min(1) & max(500))
})
```

<!-- test: run -->
```sh
$ aontu jsonschema event.aontu
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "id": {
      "minLength": 1,
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
`len()` on a string as `minLength`/`maxLength`, the optional
`note` out of `required`, and the root `close()` as
`additionalProperties: false`: the one thing the two languages say
identically. This output is pasteable into an OpenAPI components
entry with nothing to strip.

## Export one definition with `--at`

`--at <path>` names the subtree to export, the same anchor
[`vet --at`](../reference-api.md#aontu-vet) takes. This is the MCP
move: keep a registry of tools in one document and answer each tool's
`inputSchema` from its own anchor. Write a one-tool registry as
`tools.aontu`:

<!-- test: file tools.aontu -->
```aontu
argschemas: type(close({
  search_docs: close({
    query: string & len(min(1) & max(256))
    limit?: integer & min(1) & max(50)
    scope?: workspace|org|web
  })
}))
```

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.argschemas.search_docs' tools.aontu
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
`additionalProperties: false` on the JSON Schema side. Stderr carried
one loss, for `limit`: JSON reads `1` and `1.0` as one number, while
`vet` reads `1.0` as a float that the `integer` kind refuses, so the
schema admits a spelling the model does not. Everything else
here crosses exactly: the string kind, scalar enums, bounds, `re()`,
`len()`, optional keys and `close()`. The full crossing table is in
the reference under
[`aontu jsonschema`](../reference-api.md#aontu-jsonschema).

## Read the loss report

Constructs JSON Schema cannot say still export, as the nearest
admissible schema, and each one is named on stderr with its path and
construct. Collect the classes in `report.aontu`:

<!-- test: file report.aontu -->
```aontu
report: {
  total: number & must(min(0), "total must not be negative")
  amountEur: bigdecimal
  audit: hide("kept-off-the-wire")
  attempts: [&: integer] & len(max(3))
}
```

<!-- test: run -->
```sh
$ aontu jsonschema --at report report.aontu
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
    "total": {
      "type": "number"
    }
  },
  "required": [
    "amountEur",
    "attempts",
    "total"
  ],
  "type": "object"
}
```

That exit was 0: a lossy export is still an export, so redirecting
stdout writes a usable schema. The report went to stderr, and
`--strict` turns it into a failure for pipelines that must not ship
a schema admitting more than the model does:

<!-- test: run -->
```sh
$ aontu jsonschema --strict --at report report.aontu
...
lossy: $.report.amountEur bigdecimal: the schema says "number" and admits every JSON number, which vet reads as an integer or a float, never as the bigdecimal leaf
lossy: $.report.attempts.& integer: the schema says "integer" and admits a JSON spelling such as 1.0, which vet reads as a float and the integer leaf refuses
lossy: $.report.audit hide: a hidden entry is not generated, so it is omitted from the schema; a consumer is neither asked for it nor allowed to know about it
lossy: $.report.total must: an evaluate-only check is opaque by construction -- it carries the author's own message and the algebra never reasons about it -- so it is DROPPED and the schema admits values `vet` refuses
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

The report above already pins two of them. First, `must()` is an
evaluate-only check, so it is dropped and reported while the kind
beside it still crosses: `total` exported `"type": "number"` and the
check went to stderr. Second, the numeric leaves. JSON reads `1` and
`1.0` as one number and `vet` reads them as two leaves, so the
`integer` kind under `attempts` admits a spelling the model refuses,
and an integer literal is reported for the same reason. A float with
a fraction, such as `1.5`, crosses exactly, as does the `number`
kind.

Third, a spread template crosses as `additionalProperties` (or
`items`), a constrained one included, as the schema its terms meet to.
Evaluation computes a member such as `add(.n, 1)`, so it crosses as
the kind the builtin returns, and the loss report names it. Put both in
`spreads.aontu`:

<!-- test: file spreads.aontu -->
```aontu
annotations: { &: string & len(max(63)) }
counters: { &: { n:number next:add(.n, 1) } }
```

<!-- test: run -->
```sh
$ aontu jsonschema --strict spreads.aontu
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "annotations": {
      "additionalProperties": {
        "maxLength": 63,
        "minLength": 1,
        "type": "string"
      },
      "properties": {},
      "type": "object"
    },
    "counters": {
      "additionalProperties": {
        "properties": {
          "n": {
            "type": "number"
          },
          "next": {
            "type": "number"
          }
        },
        "required": [
          "n",
          "next"
        ],
        "type": "object"
      },
      "properties": {},
      "type": "object"
    }
  },
  "required": [
    "annotations",
    "counters"
  ],
  "type": "object"
}
lossy: $.counters.&.next add: this is computed when the document is evaluated, which a schema cannot say, so the schema admits any number here
$ echo $?
1
```

`annotations` admits strings of at most 63 characters; `counters`
admits any number at `next`, and says so. List templates cross the
same way, as `items`.

Fourth, `deprecate()` crosses as the annotation 2020-12 has for it,
`deprecated: true`. What the deprecation says crosses beside it in
`x-aontu-deprecate`, a keyword the draft does not define, which
`aontu jsonschema import` reads back. Write `legacy.aontu`:

<!-- test: file legacy.aontu -->
```aontu
region: deprecate(string & re("^[a-z]{2}-[a-z]+-[0-9]$"), {
  msg: "renamed"
  use: "$.zone"
  since: "2.0.0"
})
```

<!-- test: run -->
```sh
$ aontu jsonschema --strict legacy.aontu
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "region": {
      "deprecated": true,
      "minLength": 1,
      "pattern": "^[a-z]{2}-[a-z]+-[0-9]$",
      "type": "string",
      "x-aontu-deprecate": {
        "msg": "renamed",
        "since": "2.0.0",
        "use": "$.zone"
      }
    }
  },
  "required": [
    "region"
  ],
  "type": "object"
}
$ echo $?
0
```

A consumer of the exported schema learns that the property is
deprecated, which is the part that changes what a client does. One
that reads the extension also learns the reason, the replacement and
the version, and one that does not ignores them, as 2020-12 ignores
every keyword it does not define. Nothing is lost, so `--strict` exits
0.

## Definitions that name their resource

An alias whose declaration is an `identity()` crosses as the resource
it names. Its definition keeps its key under `$defs`, its `$anchor` and
its `$id`, and each use of it is a `$ref` to that `$id`.
`aontu jsonschema import` writes these declarations, so a resource a
schema named crosses back under its own name. Write `address.aontu`:

<!-- test: file address.aontu -->
```aontu
%Address = identity({ city:string }, { id:"https://example.com/address" })
order: { billing:%Address shipping?:%Address }
```

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.order' address.aontu
{
  "$defs": {
    "Address": {
      "$id": "https://example.com/address",
      "properties": {
        "city": {
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "city"
      ],
      "type": "object"
    }
  },
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "properties": {
    "billing": {
      "$ref": "https://example.com/address"
    },
    "shipping": {
      "$ref": "https://example.com/address"
    }
  },
  "required": [
    "billing"
  ],
  "type": "object"
}
```

Inside a definition with an `$id`, a reference resolves against that
`$id`, so a reference from there to a definition without one names the
root by the root's own `$id`. Where the root has none, the export
writes every definition without its `$id`, and the loss report says so.

## The refusals

A lossy export exits 0; a run that cannot produce a truthful schema
at all exits 4, and stdout stays empty: never a partial schema. An
`--at` that names nothing is one such run:

<!-- test: run -->
```sh
$ aontu jsonschema --at '$.reprot' report.aontu
$: no_path [reference]
  [aontu/no_path]: Cannot at value at path $
...
$ echo $?
4
```

So is a document that does not stand up on its own, such as a
dangling reference in `dangling.aontu`:

<!-- test: file dangling.aontu -->
```aontu
spec: owner: $.people.alice.email
people: {}
```

<!-- test: run -->
```sh
$ aontu jsonschema dangling.aontu
$.spec.owner: no_path [reference]
  [aontu/no_path]: Cannot resolve value at path $.spec.owner
  data: dangling.aontu:1:14 ($.people.alice.email)
$ echo $?
4
```

That is not a loss to report: the verb exports what a document
*means*, and this one does not mean anything. A failure nested
anywhere in the exported value refuses the run the same way, and so
does an atom whose arguments the engine cannot use, such as
`neq(1, "a")`.

The live version is
[use-cases/14-jsonschema-export](../../use-cases/14-jsonschema-export/):
a three-tool registry exported per anchor, a wire message exported
whole, the money convention crossing intact, and every loss class
pinned by golden files, including the exports re-checked under a
stock JSON reader.
