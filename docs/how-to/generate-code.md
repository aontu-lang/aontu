---
description: "Generate target-language source from a model: a rule set over the records, a component tree of files and lines, and `aontu render` to write the bytes and hold them against their goldens."
group: schemas
order: 80
---

# Generate code from a model

A model that holds the field names, the types, and the optionality
already holds everything a Go struct or a TypeScript interface needs.
This guide computes a Go file from one with a rule set (`emit`), as a
**component tree**: a `File` holding the `Line` nodes the model
produced. aontu answers the tree; a generator runtime writes it.

For the full worked version (three targets in one document, goldens,
and a check that both ports answer byte-identical files) see
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

## Write the rules

A generator is a **rule set**: `emit(select, table)` visits every node
of a selection in source order, takes the first template whose `match`
the node unifies with, and instantiates its `body` against that node:
`.name` is that node's `name`. The body is a list of **children** of
the component the rule is filling. A bare string is a `Line`, `line(s)`
is the same thing written out, and a nested `emit` splices its children
into the list, so the result is flat.

`file(name, children)` names a file and holds its lines. Write this as
`types.aon`:

<!-- test: file types.aon -->
```aontu
records: [
  {
    name: "Customer"
    fields: [{ n:"id" t:"string" go:"ID" } { n:"email" t:"string" go:"Email" }]
  }
]

%field = emit(_, {
  match: n: string
  body: [
    line(
      "\t" + .go + " " + match(.t, "string", "string", "integer", "int64")
      + ` \`json:"` + .n + `"\``
    )
  ]
})

%record = emit(_, {
  match: name: string
  body: ["" "type " + .name + " struct {" emit(.fields, %field) "}"]
})

out: file("types.go", ["package acme" emit($.records, %record)])
```

Each piece of that shape is there for a reason:

- **A rule set walks the records in source order.** List order is what
  a file needs; `pack` would key by data and emit the records
  alphabetically: silently wrong output for a file.
- **Lines, not text.** A record contributes a blank line, a head, its
  fields and a tail; a field contributes one line. A `Line` writes its
  terminator, so nothing here spells a newline, and the indent is the
  target's own: a tab in the string, because aontu knows no languages
  and has no view about how Go indents.
- **The file is a value.** `$.out` is the tree, so `aontu model get` reads it,
  `aontu vet` checks it, and a second generator can meet it.
- **The source keys ride through.** `emit` binds the body to the node,
  so `.name` and `.fields` resolve inside the template without the node
  being copied anywhere.

## Read the tree

The tree is an ordinary value, so the verb that answers it is `get`:

<!-- test: run -->
```sh
$ aontu model get $.out types.aon
{
  "children": [
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "package acme"
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": ""
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "type Customer struct {"
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "\tID string `json:\"id\"`"
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "\tEmail string `json:\"email\"`"
      }
    },
    {
      "children": [],
      "cmp": "Line",
      "props": {
        "src": "}"
      }
    }
  ],
  "cmp": "File",
  "props": {
    "name": "types.go"
  }
}
```

That is the file, as data. No host unwraps a string, decides an
ordering, or adds a separator: the transform said which lines exist and
in what order, and each one carries its own text.

## Write the files, and hold them

[`aontu render`](../reference-api.md#aontu-render) hands the tree to
[jostraca](https://github.com/jostraca/jostraca), the generator runtime,
which writes it: `Project`, `Folder`, `File`, `Line` and the rest are
its components, and it is a dependency of both implementations. This
tree is one file, so the path names the file:

<!-- test: run -->
```sh
$ aontu render types.aon gen/types.go
```

`gen/types.go` is on disk. `--check` writes nothing and compares,
exiting 1 on drift and naming the files that differ:

<!-- test: run -->
```sh
$ aontu render --check types.aon gen/types.go
```

That is the CI form. Commit the generated files beside the model and
run the comparison in CI; a hand edit to a generated file is then a red
build rather than a silent divergence from the model. A project written
in several languages is a folder of generators, one file per language,
and `aontu render gen/ app` writes every generator directly in `gen/`
as one run, with one `--check` for the set.

Nothing in aontu walks the tree to disk. The value is checkable
without a runtime (`aontu model get` above), and the runtime writes
the bytes, so what a user gets is what the check held.

## Ask what wrote a line

A reader looking at one line of generated output has no way back to the
rule that produced it. [`aontu trace`](../reference-api.md#aontu-trace)
answers that, one entry per stamped piece: the file it reached, the
model node the dispatch matched, and the rule set that wrote it.

<!-- test: run -->
```sh
$ aontu trace types.aon
types.go	$.children.1	$.records.0	$.%record#0
types.go	$.children.2	$.records.0	$.%record#0
types.go	$.children.3	$.records.0.fields.0	$.%field#0
types.go	$.children.4	$.records.0.fields.1	$.%field#0
types.go	$.children.5	$.records.0	$.%record#0
```

**What is missing from that list is as useful as what is in it.**
`$.children.0` is the package clause, which the document writes by hand
rather than a rule producing it, so no rule stamped it and it has no
entry. `--format json` is the same report for a tool.

## Write the generator in the target's own syntax

A body of quoted lines is a generator a compiler cannot read. The same
generator can be written as a file **in the language it generates**:
one rule, a marked line is aontu source and every other line is a line
of output. The marker is the target's comment token plus a dash, so the
file stays valid in its own language. Write the model as `model.aon`:

<!-- test: file model.aon -->
```aontu
records: [
  { name:"Customer" note:"one account holder" }
  { name:"Order" note:"one purchase" }
]
```

and the generator as `struct.go`:

<!-- test: file struct.go -->
```go
//- @"./model.aon"
//- out: emit($.records, {
//- match: { name: string }
//- body: [file(.name + ".go", emit([_], {
//- match: { name: string }
//- replace: { NAME: .name, NOTE: .note }
//- body: [
package acme

// NAME is NOTE. Generated: edit the model, not this file.
type NAME struct{}
//- ]}))]
//- })
```

Every verb that reads a generator reads it directly (the entry's
extension says it is a template), so there is nothing new to learn
about generation itself:

<!-- test: run -->
```sh
$ aontu trace struct.go
Customer.go	$.0	$.records.0	#0
Customer.go	$.0.children.0	$.records.0	#0
Customer.go	$.0.children.1	$.records.0	#0
Customer.go	$.0.children.2	$.records.0	#0
Customer.go	$.0.children.3	$.records.0	#0
Order.go	$.1	$.records.1	#0
Order.go	$.1.children.0	$.records.1	#0
Order.go	$.1.children.1	$.records.1	#0
Order.go	$.1.children.2	$.records.1	#0
Order.go	$.1.children.3	$.records.1	#0
```

The rule is `#0` with no name, because the table is written inline at
the call rather than bound to a `%name`.

A list of files is written below the path:

<!-- test: run -->
```sh
$ aontu render struct.go gen
```

Three things follow from writing it this way:

- **The output lines are the target's, at their own indentation.**
  `gofmt` formats them, an editor highlights them, and `go vet` reads
  the generator itself. What the target sees is a file with four
  comments in it. The MARKER lines are aontu's half, and `aontu fmt`
  formats them: the marker stands at the left margin with the aontu
  indented after it, so the tree the generator carries has a shape on
  the page without any of the target's lines moving.
- **A value still arrives through `replace`.** `NAME` is a string the
  body holds, matched exactly, so no delimiter can collide with the
  target's syntax. That needs an inner dispatch: `replace` reaches the
  lines a rule wrote, so the file's lines and the map naming the file
  are two rules rather than one.
- **The whitespace is the artifact.** A line of two spaces is two
  spaces of output, so the generator's bytes matter as much as the
  generated file's. `aontu template --check struct.go` holds the file
  to the spelling the round trip answers, and the byte gate against the
  committed output catches a body line whose whitespace changed: an
  editor set to trim on save, say.

`aontu template struct.go` prints the canonical form, the aontu the
marked lines mean, for reading rather than for keeping. `aontu fmt
struct.go` formats the generator ITSELF: it desugars, formats the
document the marker lines carry, and resugars, so what comes back is a
generator with every output line where it was. A file with no marker
line in it is another language's, and is refused by name.

## Put the target's names in the model

aontu knows no languages: there is no table of reserved words, no
acronym set and no case rule inside it, and a generator spells the
target's names itself. `nom(name, style, acronyms)` does the casing,
so `nom("ledger_id", pascal, ["ID"])` is `LedgerID`, and the acronym
list is the generator's, written where a reader can see it.

Better still, write the target's spelling as data, as `go: "ID"` does
above. What a type is called in a target is a fact about the model
rather than a rule in a template, which is the split every code
generator that survived contact with many languages arrives at.
Writing it down makes a name collision a unification conflict instead
of a broken identifier at emit time.

## Related

- [`aontu render`](../reference-api.md#aontu-render). The verb that
  writes the tree, and its `--check`.
- [`aontu trace`](../reference-api.md#aontu-trace). What wrote a line:
  the file, the model node and the rule.
- [Transforming: `emit`](../reference-language.md#transforming-emit).
  Dispatch order, splicing, named tables and recursion.
- [`aontu template`](../reference-api.md#aontu-template). The two
  transforms, the markers by extension, and the round trip.
- [Export JSON Schema](export-json-schema.md). The other bridge out of
  the model.
- [Keep schema out of output](keep-schema-out-of-output.md). `hide()`
  and marks, and what they do to generation.
