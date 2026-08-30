# 14 — jsonschema export: the bridge out, and the loss report

The dedicated exercise of `aontu jsonschema` (reference-api.md). JSON
Schema is what the rest of the world reads: an MCP tool's
`inputSchema` must be one, every major structured-output API
constrains generation to one, OpenAPI embeds one, stock validators
check one. The verb exports the unified value as draft 2020-12 to
stdout and names every loss on stderr. This case drives the bridge at
its three moods: exact, lossy, refused.

## The model

Four documents, one per mood plus the money convention:

- **registry.aon** — a three-tool MCP-flavoured registry (use-case
  09's shape, self-contained), written in the crossing subset so each
  per-tool export is complete. `jsonschema --at '$.argschemas.<tool>'`
  answers the tool's `inputSchema` directly; the two trims that keep
  stderr empty are recorded in the file's header comment.
- **message.aon** — a wire message whose root is one `close()`
  expression, so the whole-document export carries
  `additionalProperties: false` at its root: pasteable into an
  OpenAPI components entry with nothing to strip.
- **money.aon** — use-case 10's money wire convention (finding I).
  The fixed-scale decimal's `re()` crosses as `pattern` and the
  constant `dec` mark as `{"const": "bigdecimal:2"}` outside
  `required`, so a consumer reading only the JSON Schema learns the
  exact leaf and the scale.
- **residue.aon** — one instance of each loss class: `must()`,
  `bigdecimal`, `hide()`, a constrained spread template, `length()`
  on a list. The export still happens; every loss is named.
- **bad/dangling.aon** — a reference that resolves nowhere. Not a
  loss: no unified value, no export, exit 4.

Every golden in `expected/` is captured engine output.

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

## Boundaries hit while writing it

- `must()` exports as `{}` and is reported under the construct name
  `nil`, not `must` — even on a concrete value (`5 & must(...)`), and
  the kind beside it (`number & must(...)`) is lost with it. The
  reference's loss table promises a `must` report that drops only the
  check; the engine holds the whole value residual instead.
- "A spread is `additionalProperties: <template>`" holds for a
  bare-kind template only. A template carrying a constraint call
  (`&: string & length(max(63))`) or a map exports as
  `additionalProperties: {}` with an `unresolved` (or `close`) loss.
  The same split decides list templates: `[&: string]` crosses as
  `items`, a constrained element template does not.
- `length()` on a list is always the domain-less loss — the sizing
  atom has no domain until data arrives, so `[&: integer] &
  length(max(3))` exports `minItems`/`maxItems` and still reports.
- `deprecate(x, meta)` exports `x` plus `deprecated: true`, the
  annotation 2020-12 has for exactly this, and reports the record's
  `msg`/`use`/`since` as a loss — the draft has no field for what a
  deprecation SAYS. (Until 2026-08-30 it dropped the whole record in
  silence: no keyword, no loss line. That was the one silent drop
  found here, and it was BUGS.md §56.)
- A default that repeats a disjunct (`*internal | internal | ...`)
  duplicates the entry in the exported `enum`. Write
  `*internal | standard | critical` instead.

## Run

    ./check.sh          # all assertions

The Go CLI has the verb too, and this case passes against it with
byte-identical goldens:

    (cd ../../go && go build -o /tmp/aontu-go ./cmd/aontu)
    AONTU=/tmp/aontu-go ./check.sh

Build the binary rather than using `go run`, which remaps the verb's
exit 4 to its own exit 1 and fails check 8.
