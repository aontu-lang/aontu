# What aontu reads and writes, and what tabnas now writes

**Status:** Investigation, 2026-11-21, ruled the same day: see
[The rulings](#the-rulings). Nothing is scheduled. It answers one
question: aontu loads many formats through the tabnas
parsers, and the tabnas stack can now write many formats too, so what
does aontu read and write today, and what stands between it and the
writers?
**Basis:** aontu at `main` (`464f5ce`), both ports; the tabnas packages
as the npm registry and the Go module proxy served them on 2026-11-21;
CUE v0.17.1 and v0.18.0-rc.4. Every statement about behaviour below was
run, and [How it was checked](#how-it-was-checked) lists the runs.
**Context:** the Interchange rows of
[CUE-COMPARISON.0.md](CUE-COMPARISON.0.md#interchange), and M1, L3 and
L4 of [CONFIG-LANGUAGES-PLAN.0.md](CONFIG-LANGUAGES-PLAN.0.md).

## In short

- **tabnas writes now, as well as reads.** Its `alchemy translate`
  command reads and writes 22 formats. Ten of them take any JSON value:
  JSON, JSON5, JSONC, jsonic, JSONL, YAML, TOML, INI, CSV and ZON. XML
  takes one through a fixed embedding, and eleven more write only their
  own tree.
- **Each writer is data, not code.** A format's package carries its
  writer as a program in tabnas's small transformation language, with
  a list of what the writer loses, and the TypeScript and Go libraries
  run the same text. They gave the same bytes in every comparison made
  here.
- **aontu uses none of it yet.** It pins the tabnas packages at their
  versions of late September, which read and do not write. It reads ten
  extensions, through an include only, and it writes JSON and its
  canonical form.
- **The formats can be had today with a pipe**, in either language:
  `aontu model.aontu | alchemy translate --from json --to yaml -`.
- **The upgrade is small.** With all sixteen pins raised to their
  latest versions, the TypeScript engine needs a two-line change and
  the Go engine none. Then every group of the TypeScript suite passes,
  and the Go suite passes but for the file that records the vendored
  modules' hash.
- **The writers are safe, not idiomatic, and slow at scale.** YAML is
  written with every string and key double-quoted, and TOML with every
  table inline on one line. Ten thousand records take four seconds in
  Go, where `cue export` takes under one.
- **Reading has two gaps of its own.** Only an include reads a file by
  its extension: `aontu vet schema.aontu data.yaml` reads the YAML as
  aontu source. And tabnas reads formats that aontu still refuses, CSV,
  JSONL and XML among them.
- **One defect surfaced**, now an issue: a syntax error inside an
  included data file is reported in the including file, and differently
  in each port
  ([#876](https://github.com/aontu-lang/aontu/issues/876)).

## What aontu reads today

An include's extension decides what a file is, from a fixed table
([ADR-012](../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused),
[Source loading](../docs/reference-language.md#source-loading-)). Both
ports read each row below alike, on one small file of each kind.

| Extension | Read as | Reader, at the pinned version |
|---|---|---|
| `.aontu` | aontu source | aontu's own grammar on `@tabnas/jsonic` 0.7.1 |
| `.json`, `.jsonld` | data | `@tabnas/json` 0.5.10 |
| `.jsonc` | data | `@tabnas/jsonc` 0.5.7 |
| `.json5` | data | `@tabnas/json5` 0.5.8 |
| `.jsonic`, `.jsc` | data | `@tabnas/jsonic` 0.7.1 |
| `.yaml`, `.yml` | data | `@tabnas/yaml` 0.5.9 |
| `.toml` | data | `@tabnas/toml` 0.5.8 |
| `.ini` | data | `@tabnas/ini` 0.5.9 |
| `.txt`, and what `--text-ext` names | one string | none |
| `.csv`, `.jsonl`, `.xml`, `.zon`, `.md` and the rest | refused, `include_extension` | none |

The Go port pins the same versions of the Go modules
(`github.com/tabnas/yaml/go` v0.5.9 and its siblings).

**Only an include reads by extension.** A file that a verb is handed
is aontu source, whatever its name:

| Command | Answer, in both ports |
|---|---|
| `aontu d.yaml`, a block sequence in it | `unexpected`: `-` is no aontu syntax |
| `aontu d.toml` | `bare_punct`, on the `=` |
| `aontu vet schema.aontu d.json` | `valid`: JSON is aontu source too |
| `aontu vet schema.aontu d.yaml` | `invalid`, a `parse` finding at `d.yaml:5:3` |
| `aontu vet schema.aontu d.toml` | `invalid`, a `map` conflict against a list of the file's words |
| `aontu vet schema.aontu w.aontu`, where `w.aontu` is `@"./d.yaml"` | `valid` |

So the way to check a YAML file today is a document of one line that
includes it. `cue vet schema.cue data.yaml` reads the YAML by the
file's extension, and answered it here.

**A broken data file is reported badly**
([#876](https://github.com/aontu-lang/aontu/issues/876)). TypeScript
prints the data file's line and column under the including file's
name and source, and Go points at the `@` of the include. Neither
names the file that is broken.

## What aontu writes today

- JSON, from the bare command, and the canonical form under `-c`.
- A report as text or JSON, from each verb that answers one.
- Files, through the component tree and `aontu render`
  ([ADR-038](../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages),
  [ADR-040](../ADR.md#adr-040--aontu-render-writes-the-component-tree-through-jostraca-in-both-ports)).
  The text of each file is what the document builds with `+`, `join`
  and the components. The bundled models under `aontu/lang/` know
  Markdown and plain text, and no data format.
- JSON Schema, from `aontu jsonschema`.

No verb and no built-in writes a value as YAML, TOML or any other data
format. The October plan's M1 proposes one route, a bundled model that
writes YAML through the component tree, and it is not built.

## What tabnas now writes

**The pieces.** aontu's pins date from 23 and 24 September. Three
libraries and a command were first published on 3 and 5 October:

| Package | Version | What it is |
|---|---|---|
| `@tabnas/alchemy` | 0.4.0 | a small transformation language over streams of structured data, and `translate`, which composes a route from one format to another |
| `@tabnas/transduce` | 0.6.9 | streaming transducers over any tabnas parser: the events a document or a value gives |
| `@tabnas/render` | 0.2.7 | the renderers a route ends in: JSON, CSV and text |
| `@tabnas/alchemy-cli` | 0.2.0 | the `alchemy` command: `translate --from F --to F`, and `formats` |

Each grammar package now exports `translate()`. It answers the
package's manifest, with the shapes the format reads and writes, the
root its writer needs and a list of what the writer loses, and the
writer itself: a program in the alchemy language, held as text inside
the package. `@tabnas/yaml` 0.5.34 has it and the pinned 0.5.9 does
not. The Go modules carry the same parts at the same versions
(`yaml.Translate()` in `github.com/tabnas/yaml/go` v0.5.34), and the
manifest of each data format names a Rust crate beside them.

**The formats.** `alchemy formats` lists 22:

| Group | Formats | What a value must be |
|---|---|---|
| Any JSON value | `json`, `json5`, `jsonc`, `jsonic`, `yaml`, `zon` | anything |
| A map at the root | `toml`, `ini` | a map; any other root is wrapped under a key, `items` unless `--key` names one |
| Rows | `csv`, `jsonl` | a list of rows; any other root is written as one row |
| Through an embedding | `xml` | anything, as `<document>`, `<member name="…">` and `<item>` elements |
| Their own tree only | `abnf`, `ebnf`, `gbnf`, `c`, `css`, `expr`, `feed`, `markdown`, `pgn`, `proto`, `semver` | the tree that format's reader builds |

**A host's wiring is short.** About twenty lines of TypeScript write
a value in any of these formats: read the format package's parts into
a `Part`, `compose` the route, `compile` it with transduce's routers
and render's renderers, and walk the value into the program's sink.
The same calls exist in Go, as `translate.PartFromDescriptor`,
`translate.Compose` and `Composition.Compile`.

## What the writers give for aontu's output

**A pipe works today.** Both lines were run, and gave the same bytes
in the two languages for YAML, TOML, INI, CSV, XML, JSONL, ZON and
JSON5:

```sh
aontu svc.aontu | alchemy translate --from json --to yaml -
aontu svc.aontu | alchemy translate --from json --to toml -
```

With `svc.aontu` as

```aontu
service: &: { port: integer & min(1), replicas: *1 | integer, env: *prod | string }
service: {
  web: { port: 8080, replicas: 3 }
  db: { port: 5432, env: "no" }
}
```

the first line writes

```yaml
"service":
  "db":
    "env": "no"
    "port": 5432
    "replicas": 1
  "web":
    "env": "prod"
    "port": 8080
    "replicas": 3
```

and the second writes one line:

```toml
"service" = { "db" = { "env" = "no", "port" = 5432, "replicas" = 1 }, "web" = { "env" = "prod", "port" = 8080, "replicas" = 3 } }
```

`cue export` writes the same data as `env: "no"` beside unquoted
`env: prod` in YAML, and as `[service.db]` tables in TOML.

**What each format keeps.** One document of awkward values went into
each format and back: strings such as `"no"`, `"null"`, `"1e3"`,
`"0755"` and `"2026-11-21"`, an empty string, line breaks, a
thirty-digit integer, nulls, empty containers, nested lists and keys
with spaces, dots and quotes.

| Format | Read back | What changed |
|---|---|---|
| YAML | exact | nothing: every string is quoted, so none reads back as a boolean, a null or a number |
| JSON, JSON5, JSONC, jsonic | exact | nothing |
| TOML | 5 differences | a null member and a null element are left out, and the thirty-digit integer is written as a float |
| INI | 22 differences | every scalar reads back as a string, and a list or map inside a list is written as its JSON text |
| CSV | one row | a nested value is written as its JSON text, and every cell reads back as a string |
| JSONL | one line | the root map becomes a list of one |
| XML | its element tree | the embedding is written, and what reads back is the XML's own tree |
| ZON | 2 differences | an empty map reads back as an empty list, and the thirty-digit integer as a marked string |

Each difference is one the format's manifest lists. A null in TOML is
dropped by `cue export` as well.

**Numbers must be handed over as text.** The streamed route keeps a
number's spelling, so the thirty-digit integer is written whole. A
host that parses the JSON first and walks the value writes
`1.2345678901234568e29`, in both languages. aontu's exact numbers
would need the first route.

**The two languages agree.** The output of each of the 114 probes of
the comparison that evaluate was written in nine formats by the
TypeScript command and by the Go command: 1026 pairs of files, and
each pair the same bytes. YAML, JSON and JSON5 read back as the
document in all 114. The Go command runs older versions of the
libraries than the TypeScript one, and two short hosts at the latest
versions agreed as well.

**The writers are slow at scale.** A list of 10000 records, 473 KB of
JSON:

| Writer | Time |
|---|---|
| Go `alchemy translate`, to YAML, TOML, CSV, JSON | 4.0 s, 4.6 s, 3.5 s, 3.2 s |
| TypeScript `alchemy translate`, to YAML, CSV | 18.2 s, 12.6 s |
| TypeScript, the short host, from a value in memory, to YAML | 3.9 s |
| `cue export --out yaml` | 0.65 s |
| aontu evaluating and printing the JSON | 1.7 s in TypeScript, 0.4 s in Go |

A configuration file of a few kilobytes is written in milliseconds.

## What stands between aontu and the writers

**The pins.** [parity.md](../docs/contributing/parity.md) says why
they are exact: aontu's own grammar depends on how the tabnas plugins
compose. The writers need newer versions of the same packages, so
every pin moves:

| Package | Pinned | Latest |
|---|---|---|
| `parser` | 0.12.2 | 0.12.21 |
| `jsonic` | 0.7.1 | 0.7.12 |
| `json`, `json5`, `jsonc` | 0.5.10, 0.5.8, 0.5.7 | 0.5.20, 0.5.20, 0.5.18 |
| `yaml`, `toml`, `ini` | 0.5.9, 0.5.8, 0.5.9 | 0.5.34, 0.5.23, 0.5.24 |
| `expr`, `path`, `multisource`, `directive` | 0.5.10, 0.3.8, 0.5.8, 0.5.8 | 0.6.4, 0.3.13, 0.6.3, 0.5.13 |
| `abnf`, `bnf`, `debug`, `railroad` | 0.4.15, 0.1.19, 0.3.8, 0.3.7 | 0.5.1, 0.1.33, 0.3.13, 0.3.12 |

**A trial of the upgrade**, in a scratch copy of `main` with every pin
at its latest version:

- **TypeScript** builds with no error and then fails at load: the
  format plugins now mount on a `Tabnas` engine, as
  `new Tabnas().use(jsonic).use(Yaml)`, and no longer on
  `Jsonic.make()`. Two lines of `ts/src/lang.ts` change. After that
  all seven groups of the suite pass, 45905 tests with no failure, and
  the one group with skipped tests skips the same 34 as `main`.
- **Go** builds with no change, `go vet` is clean, and the suite
  passes but for `TestFlakeVendorHashMatchesTheModuleTree`, which
  asks for `go/vendorhash.txt` to be rewritten after any change to
  `go.mod`.
- Both trial engines read the ten extensions as `main` does.

The trial did not run coverage, the use cases, the definition's
checks or the daily workflow. aontu and the tabnas packages declare
Node 24, and this machine runs Node 22.

**New dependencies.** `alchemy`, `transduce` and `render` in each
port, and a package for each format aontu does not read yet.

**The Go command lags.** `github.com/tabnas/alchemy-cli/go` v0.2.0
builds only with the module versions it pins: against transduce
v0.6.9 it fails on `ParserSource.Grammar`. This touches the pipe in
Go and not a built-in, which would call the libraries. The libraries
at their latest versions gave the same bytes as TypeScript's.

**Decisions that bear on it.**

| Decision | What it says | What it means here |
|---|---|---|
| [ADR-012](../ADR.md#adr-012--an-includes-extension-decides-what-the-file-is-aontu-source-config-data-or-refused) | an include's extension decides what a file is, from a fixed table | reading CSV, JSONL or XML is a row of that table and a reader in each port |
| [ADR-038](../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages) | the component tree is the only output road, and aontu knows no languages | a writer for a data format is either a different kind of output, or a built-in that makes a file's text |
| [ADR-003](../ADR.md#adr-003--host-provided-semantics-are-normalised-not-trusted) | where a host subsystem supplies semantics, aontu defines the meaning | the writers are one text run by both ports, with their losses listed; aontu would still state which spelling it promises |
| [ADR-001](../ADR.md#adr-001--typescript-and-go-stay-at-full-parity-driven-by-a-shared-spec) | both ports, one meaning | shared rows over the written bytes, which agreed in every run here |
| M1 of the [October plan](CONFIG-LANGUAGES-PLAN.0.md) | YAML and TOML output through a bundled model and the component tree | the tabnas writers are a second route to the same end |

## Options, for a ruling

Each was a candidate for the maintainer, who ruled on them on
2026-11-21: see [The rulings](#the-rulings).

| | Option | What it gives | What it costs |
|---|---|---|---|
| A | Raise the pins, and nothing else | the newest readers, and the ground for every option below | the two-line change, the vendor hash, and the checks the trial did not run |
| B | An output flag on the bare command and `model get`, such as `--out yaml` | what `cue export --out` gives, for ten formats | A, three new dependencies in each port, and a ruling that this is not a second output road |
| C | A built-in that writes a value as text in a named format | files of any data format through the one output road, as a file's `content` | A and B's dependencies inside the engine, a line of `signature.tsv`, and the definition |
| D | More rows in ADR-012's table: `.csv`, `.jsonl`, `.xml`, `.zon` | more configuration that a model can meet where it lies | A, and a reader in each port for each row |
| E | A verb reads a data file by its extension | `aontu vet schema.aontu data.yaml` | a ruling on what an operand is; no new dependency |
| F | Leave the engines as they are, and document the pipe | ten formats today, with no change | a second tool to install, and the Go command's lag |

One order that would work: A first, since B, C and D stand on it, then
B, which is the smallest thing a user sees, then C. D and E are
rulings of their own. M1's bundled model stays the route for any
format whose spelling aontu wants to own, since the tabnas writers'
style is fixed.

## The rulings

Ruled by the maintainer on 2026-11-21.

| Option | Ruling |
|---|---|
| A, the pins | raise them now, as a change of its own, ahead of anything that uses the writers |
| B and C, writing | both, the flag first: an output flag on the bare command and on `model get`, and then a built-in that writes a value as text |
| D, more readers | an include also reads `.csv`, `.jsonl` and `.xml`, and input whose format an ABNF grammar defines |
| E, operands | a verb reads a data file by its extension, by the table an include uses |
| F, the pipe alone | not taken |

Progress on 2026-11-27. E is built in both CLIs, with no new
dependency. A verb's document operand is read by the include's table:
`aontu d.yaml` prints the YAML's value, and `aontu vet schema.aontu
d.toml` reads the TOML as the data. Both engines gain one option,
`readByExtension` in TypeScript and `ReadByExtension` in Go, which
reads the entry by its path's extension through the include's own
readers, and the library verbs carry it to their engines. The bare
command, `vet` (schema and data), `subsume`, `trim`, `relations`,
`reaches`, `view`, `jsonschema`, `hash`, `model get`, `model why`,
`allow` and `agentsmd` set it. `fmt`, `template`, `trace`, `render`,
`breaking`, `model set`, `jsonschema import`, `--vars`, the REPL, the
MCP server and the language server read as before. A data file that
doesn't parse is refused at the operand, framed in that file, under
the code its reader gives, `unexpected` in the readers tried; both
CLIs print the same bytes. The reference states what an operand is.
Three things were found. First, `.json` and `.jsonld` stay aontu
source: the include's JSON reader rounds a whole number no double
holds and ignores `--exact-numbers`, where aontu source refuses it as
`lossy_integer_literal`, and use cases 07 and 10 hold `vet` to the
refusal. The same reader rounds silently in every data format, so a
nineteen-digit identifier in a `.yaml` operand reaches `vet` rounded,
as it does through an include. Second, a value read from a data
operand carries no row or column, as an include's doesn't, so a
finding names `d.toml:-1:-1`. Third, Go's syntax frame put the caret
a line low where an error stands past a file's last newline, which no
aontu document reached; it is fixed to match TypeScript's. The tests
are `cli-operand` in `ts/test/cli.test.ts` and its twin
`go/cmd/aontu/operand_test.go`, over the same files and text.

Three of these change a decision on record, and each lands with the
record it changes:

- **The flag and ADR-038.** An output flag writes the value that the
  bare command prints as JSON, in another spelling. It is ruled not to
  be a second output road, and
  [ADR-038](../ADR.md#adr-038--the-component-tree-is-the-only-output-road-and-aontu-knows-no-languages)
  says so when the flag lands.
- **The readers and ADR-012.** Its table gains three rows, and its own
  example of a refusal, `rows.csv`, becomes a file that is read.
- **The operands.** The reference says what a verb's operand is, and
  it changes with the first verb that reads one by extension.

**One input found since stands before the pins.** With the pins
raised, `neq(-1, -2, -3)` takes the TypeScript engine's memory, where
at the pins it overflows the stack at once
([#326](https://github.com/aontu-lang/aontu/issues/326)). The same
trial closes
[#325](https://github.com/aontu-lang/aontu/issues/325). So the task
under ruling A waits on IS3 of
[the lang refinement plan](LANG-REFINEMENT-PLAN.0.md#what-the-pins-do-to-the-parser-issues),
which holds the table.

**Input that an ABNF grammar defines** was the maintainer's own
addition to option D. Two steps read it today, and both ports agree
on them: an include of the text, and `parse` over it with the grammar.

```aontu
G: hide(abnf(`
rec = "{" pair *( ";" pair ) "}"   ; @array
pair = key "=" val   ; @object key val
key = 1*ALPHA
val = 1*( ALPHA / DIGIT )
`))
v: parse($.G, @"./rec.txt")
```

With `{host=h1;port=80}` in `rec.txt`, `v` is a list of two maps,
`{ "key": "host", "val": "h1" }` and `{ "key": "port", "val": "80" }`.
The text must be in a `.txt` file, or one whose extension `--text-ext`
names. The ruling asks for the include to do this itself. How a
project names the grammar for an extension is the first question of
that task.

## Found along the way

- **[#876](https://github.com/aontu-lang/aontu/issues/876)**, a
  defect: a syntax error inside an included data file is reported in
  the including file, and differently in each port.
- **A `.toml` or `.ini` operand is read as aontu source**, and `vet`
  answers a conflict against a list of the file's words. The
  reference says an operand is a document, so this is not filed as a
  defect: it is option E.
- **`.jsonc` refuses a trailing comma** and `.jsc`, which is jsonic,
  accepts one. Both follow from the table.
- **The Go `alchemy` command lags its libraries.** That is tabnas's to
  fix, and matters here only for the pipe.

## How it was checked

- **Reading.** One file of each of sixteen extensions, included from
  a document and evaluated by both ports; one broken file of each of
  eight data formats; `vet` and the bare command on data files.
- **The formats.** `alchemy formats` from `@tabnas/alchemy-cli` 0.2.0,
  which resolved `alchemy` 0.4.0, `transduce` 0.6.9, `render` 0.2.7
  and the latest grammar packages, and from the Go command built from
  `github.com/tabnas/alchemy-cli/go` v0.2.0.
- **Writing.** Three documents, a small model's output, the document
  of awkward values and the list of 10000 records, written in eleven
  formats by both commands, and each format's text read back by the
  TypeScript command.
- **The two languages.** The outputs of 114 probes in nine formats,
  by both commands: 1026 pairs, all identical. Two short hosts, one in
  each language at the latest versions, agreed on the three documents
  in seven formats.
- **The upgrade.** A scratch worktree of `main` at `464f5ce` with the
  sixteen pins raised: the TypeScript build, its seven test groups,
  `go build`, `go vet` and `go test ./...`.
- **CUE.** `cue export --out yaml`, `toml` and `json` on the same
  data, with v0.18.0-rc.4.

## Sources

- aontu, branch `main` at `464f5ce`: `ts/src/lang.ts`,
  `ts/package.json`, `go/go.mod`, [ADR.md](../ADR.md),
  [parity.md](../docs/contributing/parity.md) and the references
  linked above.
- The npm registry on 2026-11-21: the 39 packages of the `@tabnas`
  scope, and the sources that `@tabnas/render` 0.2.7,
  `@tabnas/alchemy` 0.4.0, `@tabnas/alchemy-cli` 0.2.0,
  `@tabnas/transduce` 0.6.9 and `@tabnas/yaml` 0.5.34 ship.
- The Go module proxy on 2026-11-21: `github.com/tabnas/alchemy/go`
  v0.4.0, `render/go` v0.2.7, `transduce/go` v0.6.9, `yaml/go` v0.5.34
  and `alchemy-cli/go` v0.2.0.
