---
description: Generate target-language source from a model — the shape a transform takes, the traps in it, and how `join` finishes the file.
group: schemas
order: 80
---

# Generate code from a model

A model that holds the field names, the types and the optionality
already holds everything a Go struct or a TypeScript interface needs.
This guide shows how to compute the whole file with the unifier — the
lines with a spread, and the assembly with `join`.

For the full worked version — three targets, goldens, and a check that
both ports emit identical bytes — see
[`use-cases/15-code-generation/`](../../use-cases/15-code-generation/).

## Hold the target text in a backtick string

`"…"` and `'…'` refuse a literal newline. `` `…` `` accepts one, so a
backtick string carries a block of another language as one value, and
escapes work in it: `\t` is a tab and `` \` `` a literal backtick.
Write this as `frag.aon`:

<!-- test: scenario generate-code -->
<!-- test: file frag.aon -->
```aontu
tag: `json:"id"`
row: `\tID string`
```

<!-- test: run -->
```sh
$ aontu -c frag.aon
{"row":"\tID string","tag":"json:\"id\""}
```

## Compute one line per field

Three pieces do the work: a **list spread** over the fields, a
**staged** key holding the computed rows, and `pick` to project them.
Write this as `types.aon`:

<!-- test: file types.aon -->
```aontu
records: [
  {name: "Customer", fields: [
    {n: "id",    t: "string",  go: "ID"}
    {n: "email", t: "string",  go: "Email"}
  ]}
]
units: [&: {
  head: `type ` + .name + ` struct {`
  rows: [&: { out: `\t` + .go + ` ` +
        match(.t, "string", `string`, "integer", `int64`) +
        ` \`json:"` + .n + `"\`` }] & .fields
  body: pick(.rows, out)
  tail: `}`
}] & $.records
```

<!-- test: run -->
```sh
$ aontu get $.units.0.body types.aon
[
  "\tID string `json:\"id\"`",
  "\tEmail string `json:\"email\"`"
]
```

Each piece is there for a reason:

- **A list spread, not `pack`.** List order is source order. `pack`
  keys by data, and map keys sort by code point, so `pack`-then-`pick`
  would emit the fields alphabetically — silently wrong output for a
  file.
- **The rows are staged into a key.** `pick` over an inline spread
  expression does not settle; giving it a named sibling to read makes
  it. Do not wrap that key in `hide()`: the Go port does not resolve a
  spread template's reference inside a mark
  ([BUGS 63](../../use-cases/BUGS.md)), so the hidden spelling
  generates in TypeScript and refuses in Go.
- **The source keys ride through.** A spread meets, and the meet is
  what makes `.name` and `.fields` resolvable inside the template, so
  `name` and `fields` appear beside `head` and `body` in the result.

## Fold the lines into a file with `join`

`join(coll, sep?)` is the reduction over strings: every member as
text, `sep` between them. It folds at whatever scale you point it at —
once over a record's lines, again over the records — and that is the
whole of file assembly.

Add two keys to the template and one at the top level. Write this as
`whole.aon`:

<!-- test: file whole.aon -->
```aontu
records: [
  {name: "Customer", fields: [
    {n: "id",    t: "string",  go: "ID"}
    {n: "email", t: "string",  go: "Email"}
  ]}
  {name: "Order", fields: [
    {n: "total", t: "integer", go: "Total"}
  ]}
]
units: [&: {
  head: `type ` + .name + ` struct {`
  rows: [&: { out: `\t` + .go + ` ` +
        match(.t, "string", `string`, "integer", `int64`) }] & .fields
  body: join(pick(.rows, out), `\n`)
  tail: `}`
  text: .head + `\n` + .body + `\n` + .tail
}] & $.records

file: join(pick($.units, text), `\n\n`) + `\n`
```

<!-- test: run -->
```sh
$ aontu get $.file whole.aon
"type Customer struct {\n\tID string\n\tEmail string\n}\n\ntype Order struct {\n\tTotal int64\n}\n"
```

That string **is** the file. `aontu get` answers with JSON, so a host
still unwraps the string to bytes, but it decides nothing — no
ordering, no separators, no layout.

Three properties are worth knowing:

- **The separator defaults to `""`**, so `join(coll)` is
  concatenation. That is why there is no `concat` and no `lines`.
- **`join([])` is `""`** — concatenation's identity, the parallel of
  `sum([]) == 0`. An empty record list yields an empty file rather
  than an error.
- **It folds with `+`**, so the number-to-text rule is `+`'s own: no
  `0d` marker, no `.0` float suffix, and a big integer's exact digits.

A member that is settled but not text — a map, a list, a null — is
`join_member`, refused at the member rather than at generation. A
member that is merely *unresolved* is not an error at all: the call
stays residual, so a transform can be written in a schema over data
that has not arrived.

<!-- test: scenario join-residual -->
<!-- test: run -->
```sh
$ echo 'names: [string]  line: join($.names, ",")' | aontu -c
{"line":join([string],","),"names":[string]}
```

## Put the target's names in the model

`upper()` uppercases a whole string, so it yields `EMAIL`, not
`Email`; there is no substring, no case conversion and no `replace`.
Write the target's spelling as data, as `go: "Email"` does above.

That is also the better design. What a type is called in a target is
a fact about the model rather than a rule in a template, which is the
split every code generator that survived contact with many languages
arrives at. Writing it down makes a name collision a unification
conflict instead of a broken identifier at emit time.

## Related

- [Export JSON Schema](export-json-schema.md) — the other bridge out,
  and the one that ships as a verb.
- [Keep schema out of output](keep-schema-out-of-output.md) — `hide()`
  and marks, and what they do to generation.
- [G9](../capability-review/g9-transformation.md) — the plan `join`
  is phase 2 of: an output vocabulary that is itself an Aontu schema,
  a renderer with per-language profiles, and one model feeding several
  artifacts.
