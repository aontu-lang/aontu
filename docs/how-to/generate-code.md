---
description: Generate target-language source from a model — the shape a transform takes today, the traps in it, and the one primitive that is missing.
group: schemas
order: 80
---

# Generate code from a model

A model that holds the field names, the types and the optionality
already holds everything a Go struct or a TypeScript interface needs.
This guide shows how to compute those lines with the unifier, and is
honest about where the language stops: assembling the lines into a
file needs a fold over strings, and there is not one yet.

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

## Put the target's names in the model

`upper()` uppercases a whole string, so it yields `EMAIL`, not
`Email`; there is no substring, no case conversion and no `replace`.
Write the target's spelling as data, as `go: "Email"` does above.

That is also the better design. What a type is called in a target is
a fact about the model rather than a rule in a template, which is the
split every code generator that survived contact with many languages
arrives at. Writing it down makes a name collision a unification
conflict instead of a broken identifier at emit time.

## What is missing: the fold

A spread can put a separator **after** each element. Putting one
**between** N elements is a reduction over strings, and the language
has none — `sum` is numeric, `+` does not reduce a list, and indexed
concatenation needs the arity known in advance.

So a generated SQL column list carries a trailing comma and does not
parse, and assembling lines into a file happens outside Aontu.
`join(bag, sep)` is
[G9 phase 2](../capability-review/g9-transformation.md): one entry in
the function registry, no grammar change.

Until then, fold in the host. The whole of the missing step:

<!-- test: skip shows the host-side fold, which is not an aontu command -->
```sh
$ aontu get $.units types.aon | python3 -c '
import json, sys
for u in json.load(sys.stdin):
    print(u["head"]); [print(l) for l in u["body"]]; print(u["tail"])'
type Customer struct {
	ID string `json:"id"`
	Email string `json:"email"`
}
```

## Related

- [Export JSON Schema](export-json-schema.md) — the other bridge out,
  and the one that ships as a verb.
- [Keep schema out of output](keep-schema-out-of-output.md) — `hide()`
  and marks, and what they do to generation.
- [G9](../capability-review/g9-transformation.md) — the plan: an
  output vocabulary that is itself an Aontu schema, a renderer with
  per-language profiles, and one model feeding several artifacts.
