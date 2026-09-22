<a name="top"></a>

# aontu: schema guardrails for your agent

[![npm version](https://img.shields.io/npm/v/aontu.svg)](https://npmjs.com/package/aontu)
[![build](https://github.com/aontu-lang/aontu/actions/workflows/build.yml/badge.svg)](https://github.com/aontu-lang/aontu/actions/workflows/build.yml)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|


aontu combines data, schemas, and defaults into one consistent result,
or reports where they conflict. It is a purpose-specific dialect
inspired by [CUE](https://cuelang.org/).


## Implementations

aontu ships two implementations, kept in parity (structure inspired by
[`voxgig/util`](https://github.com/voxgig/util)):

- **TypeScript** in [`ts/`](ts/): the canonical implementation
  (published to npm as `aontu`).
- **Go** in [`go/`](go/): a port (`github.com/aontu-lang/aontu/go`) that
  mirrors the core unification semantics.

Both are checked against a single, language-agnostic test suite in
[`test/spec/`](test/spec/) (tab-separated cases run by both
implementations). See [AGENTS.md](AGENTS.md) and
[docs/shared-spec.md](docs/shared-spec.md).

```sh
make build     # build both (ts + go)
make test      # test both against the shared spec
make install   # put both builds on PATH from this clone (npm link, go install)
```

### Repository layout

```
ts/          canonical TypeScript implementation (src, test, dist, dist-test)
go/          Go port (package aontu)
test/spec/   shared *.tsv unit tests both implementations must satisfy
docs/        documentation
```

## Command line

Both implementations ship an `aontu` command that evaluates a file (or
stdin) and prints the result, or starts a REPL when run with no file:

```sh
aontu config.aontu            # evaluate a file -> JSON
aontu --canon config.aontu    # canonical form instead
echo 'a:1 b:$.a' | aontu      # read from stdin
aontu                         # no file on a terminal -> REPL
```

Beyond evaluation the command has a verb for each task around a
document: `vet` (validate data against a schema), `get` and `why`
(query, and provenance), `set` (change a value in an overlay, by
appending or in place), `subsume` and `breaking` (schema evolution),
`hash` (pin what a document means), `relations`, `reaches` and `view`
(the declared entity graph: its checks, reachability over it, and its
figures drawn as text: tree, matrix, graph, layers, sets, the meet
ladder, the subsumption poset, the key document and the value
lattice), `jsonschema` (export
the model as JSON Schema), `trace` (what wrote a line of generated
output: the file, the model node and the rule), `template` (read a
generator written in the target's own syntax), `trim` (find redundant
entries), `sync`, `add`, `get`, `remove`, `why` and `publish` (the
package system: dependency closures and their repository), `agentsmd` (an AGENTS.md stanza), `fmt` (the
source formatter, in the tradition of `gofmt`: one agreed form), `lsp`
(the language server) and `mcp` (the MCP server, npm build). The
library adds a path-addressed `diff`, and an MCP server answers with
the same reports over stdio. All of it is documented in
[docs/reference-api.md](docs/reference-api.md).

Install with `npm i -g aontu` (Node); with
`curl -fsSL https://aontu.dev/install.sh | sh` on Linux or macOS, which
puts the Go build of `aontu` and `aontu-lsp` in `~/.local/bin` with no
toolchain; with a package or archive from the
[releases page](https://github.com/aontu-lang/aontu/releases), the
image `ghcr.io/aontu-lang/aontu`, the Nix flake, or the setup action
`aontu-lang/aontu/setup-action` in a workflow; or with
`go install github.com/aontu-lang/aontu/go/cmd/aontu@latest` (Go). From a
clone, `make install` puts both builds on `PATH`: `make install-ts` links
the checkout as the global npm package and `make install-go` runs
`go install` for the two commands. Without installing:
`node ts/bin/aontu.js …` or, inside `go/`, `go run ./cmd/aontu …`.

## Formatting

`aontu fmt` writes a document in one agreed form, in the tradition of
`gofmt`: layout stops being an argument, and a diff shows only what
changed. The form is a spelling and never a change of meaning. What
comes back evaluates to the same value, carries the same canon-hash,
and formatting it again changes nothing.

```sh
aontu fmt config.aontu          # print the formatted text
aontu fmt -w config.aontu       # rewrite in place
aontu fmt --check *.aontu       # exit 1 if any file would change: the CI gate
aontu fmt -d config.aontu       # a unified diff of what would change
aontu fmt --lint config.aontu   # style findings only; the form is untouched
```

The rules, in short:

- **Two-space indentation**, never a tab; `LF` endings, no trailing
  whitespace, one final newline.
- **`key: value`**, the colon tight to the key. No commas between
  entries; a call keeps its argument commas.
- **Braces only where the language needs them.** A one-pair map is a
  chain, `a: b: c: 1`; a one-key map in a list is a pair element,
  `[a:1 b:2]`. A map that is an operand or an argument keeps its
  braces, because splitting it would change the document.
- **80 columns** decides between one line and several, and nothing
  else. The formatter never breaks a line, so a wide string stays wide.
- **The prefix repeats.** A map too wide for one line becomes one
  statement per entry, each carrying its key again: `server: host: …`
  over `server: port: …`. A key written twice is a meet, so the two
  spellings are one document.
- **Comments are kept, their text untouched.** A comment that ends a
  line of code sits **two spaces** behind it, normalised from whatever
  the author left, because a single space reads as part of the value.
  Trailing comments are never aligned into a column.
- **Bare keys where they can be**, single quotes become double unless
  the string holds one, numbers exactly as written, every blank-line
  paragraph break kept.
- **It checks its own work.** The output is parsed again and compared
  with the input tree to tree; a disagreement is refused as a formatter
  defect and nothing is written.

A file as it arrived from JSON:

```aontu
{
  "server": { "host": '0.0.0.0', "port": 8080 },# where the edge listens
  "limits": { "rps": 100, "burst": 200 },
  "features": ["auth", "metrics"]
}
```

`aontu fmt` writes:

```aontu
server: { host:"0.0.0.0" port:8080 }  # where the edge listens
limits: { rps:100 burst:200 }
features: ["auth" "metrics"]
```

**Both ports expose the formatter as a library**, with the same report:

```js
import { format, unifiedDiff } from 'aontu'

const r = format('a: 1# c\n', { lint: true })
r.verdict   // 'formatted'
r.changed   // true
r.text      // 'a: 1  # c\n'
r.findings  // the --lint style findings, [] here
unifiedDiff('a.aontu', 'a: 1# c\n', r.text)
```

```go
r := aontu.New().Format("a: 1# c\n")
r.Verdict // "formatted"
r.Changed // true
r.Text    // "a: 1  # c\n"

aontu.New().FormatWith(src, aontu.FormatOptions{Lint: true})
aontu.UnifiedDiff("a.aontu", src, r.Text)
```

The full rule set is [the formatted
form](docs/reference-language.md#the-formatted-form); the verb, its
options and its exit codes are in [the API
reference](docs/reference-api.md#aontu-fmt); running it on a repository
and gating CI on it is a
[how-to](docs/how-to/format-a-document.md).

## Documentation

Full documentation is in [`docs/`](docs/):

- [Documentation home](docs/index.md). Start here
- [Tutorials](docs/tutorial.md). Four, each building one thing step by step
- [How-to guides](docs/how-to/). Task-focused recipes
- [Language reference](docs/reference-language.md). Every construct and rule
- [Generation reference](docs/reference-generation.md). The component tree:
  every node, its props, the children it admits, and what writes it
- [Functions reference](docs/reference-functions.md). The call surface of every
  built-in: arity, argument modes, accepted kinds and result words
- [Error reference](docs/reference-errors.md). Every registered error code, by
  class, with what raises it
- [API reference](docs/reference-api.md). TypeScript & Go APIs, and the CLI
- [Explanation](docs/explanation.md). How and why the unifier works
- [Test coverage](docs/test-coverage.md). How it is measured, and the numbers

[use-cases/](use-cases/) holds eighteen enterprise-shaped systems built
as real aontu documents, each with a `check.sh` that drives the CLI and
asserts every outcome.

## Security and contributing

- **Security**: the evaluator's trust contract
  ([docs/trust.md](docs/trust.md)) is the security surface: see
  [SECURITY.md](SECURITY.md) for scope and how to report privately.
- **Contributing**: start at [CONTRIBUTING.md](CONTRIBUTING.md), which
  points at [AGENTS.md](AGENTS.md), the full contributor and agent
  guide.

