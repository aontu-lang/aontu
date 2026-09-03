# 14 — jsonschema export: the bridge out, and the loss report

The worked example of
[`aontu jsonschema`](../../docs/reference-api.md#aontu-jsonschema). JSON
Schema is what the rest of the world reads: an MCP tool's
`inputSchema` must be one, every major structured-output API
constrains generation to one, OpenAPI embeds one, stock validators
check one. The verb exports the unified value as draft 2020-12 to
stdout and names every loss on stderr. This case drives the bridge in
its three moods: exact, lossy, refused.

![The model tree: a record whose fields are exactly the constructs the export has to decide about](expected/diagram-doc.svg)

## The model

Four documents, one per mood plus the money convention:

- **registry.aon** — a three-tool MCP-flavoured registry (use-case
  09's shape, self-contained), written in the subset that crosses
  without loss, so each per-tool export is complete.
  `jsonschema --at '$.argschemas.<tool>'` answers the tool's
  `inputSchema` directly, with nothing on stderr.
- **message.aon** — a wire message whose root is one `close()`
  expression, so the whole-document export carries
  `additionalProperties: false` at its root: pasteable into an
  OpenAPI components entry with nothing to strip.
- **money.aon** — use-case 10's money wire convention (the recipe is
  [Carry exact money over JSON](../../docs/how-to/carry-exact-money-over-json.md)).
  The fixed-scale decimal's `re()` crosses as `pattern` and the
  constant `dec` mark as `{"const": "bigdecimal:2"}` outside
  `required`, so a consumer reading only the JSON Schema learns the
  exact leaf and the scale.
- **residue.aon** — one instance of each loss class: `must()`,
  `bigdecimal`, `hide()`, a constrained spread template, `length()`
  on a list. The export still happens; every loss is named.
- **bad/dangling.aon** — a reference that resolves nowhere. Not a
  loss: no unified value, no export, exit 4.

The line between registry.aon and residue.aon runs through two
constructs. A bare-kind template (`[&: string]`, `{ &: string }`)
crosses as `items` or `additionalProperties`; a template carrying a
constraint call (`{ &: string & length(max(63)) }`) is held residual,
exports as `{}` in that position, and is reported as `unresolved`.
`length()` on a list exports as `minItems`/`maxItems` and is reported
as well, because a count has no domain until data arrives. One more
construct reports under a name other than its own: `must()` holds the
whole value residual, so `number & must(...)` exports as `{}` and is
reported as `nil`.

Every golden in `expected/` is captured engine output.

## The model tree

`residue.aon` is deliberately small and deliberately awkward: every
field of `report` is a construct the JSON Schema export must either
carry or drop, and the loss report says which. A `bigdecimal`, a
spread template, a list template, a concrete string and a `nil`.

```
$
└── report
    ├── amountEur bigdecimal
    ├── annotations {&:string&length(integer&min(...
    ├── attempts [&:integer]
    ├── audit "kept-off-the-wire"
    └── total nil
```

`aontu view doc --depth 3 residue.aon` draws it, and `check.sh` pins it
with `--out --check`. A key with `(n)` after it is a container the
depth bound stopped at, and `n` is how many keys are not drawn; a
leaf carries its canon, which is the kind of thing it is rather
than its value.

## What check.sh proves

1. Three per-tool exports match their goldens with EMPTY stderr —
   inputSchema-shaped, closed, nothing lost.
2. The exports hold under a stock JSON reader (python3): closedness,
   the required list, an enum, and two `re()` on one string rendered
   as `allOf` of patterns.
3. The whole-document message export: root
   `additionalProperties: false`, disjunctions as `enum`, the `*`
   preference as `default`, optional keys out of `required`.
4. The money convention crosses intact: `pattern` for `Dec2`, `const`
   for the mark, and `required` stays `["amount", "currency"]`.
5. residue.aon exports at exit 0 while stderr names all five losses,
   each with its path and construct.
6. `--strict` flips the same run to exit 1.
7. `--format json` carries the same report as data: `verdict: lossy`,
   each loss as `{path, construct, reason}`, the schema embedded.
8. bad/dangling.aon refuses with exit 4 and a located
   `[aontu/no_path]`, and stdout stays empty — never a partial schema.

## Run

    ./check.sh          # all assertions

The Go CLI has the verb too, and the same checks run against it:

    (cd ../../go && go build -o /tmp/aontu-go ./cmd/aontu)
    AONTU=/tmp/aontu-go ./check.sh

Build the binary rather than using `go run`, which remaps the verb's
exit 4 to its own exit 1 and fails check 8.
