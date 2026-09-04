<a name="top"></a>

# Aontu: JSON Structure unifier

[![npm version](https://img.shields.io/npm/v/aontu.svg)](https://npmjs.com/package/aontu)
[![build](https://github.com/aontu-lang/aontu/actions/workflows/build.yml/badge.svg)](https://github.com/aontu-lang/aontu/actions/workflows/build.yml)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|


This unifier is heavily inspired by [Cue Lang](https://cuelang.org/)
and may be regarded as a purpose-specific dialect.


## Implementations

Aontu ships two implementations, kept in parity (structure inspired by
[`voxgig/util`](https://github.com/voxgig/util)):

- **TypeScript** in [`ts/`](ts/)—the canonical implementation
  (published to npm as `aontu`).
- **Go** in [`go/`](go/)—a port (`github.com/aontu-lang/aontu/go`) that
  mirrors the core unification semantics.

Both are checked against a single, language-agnostic test suite in
[`test/spec/`](test/spec/) (tab-separated cases run by both
implementations). See [AGENTS.md](AGENTS.md) and
[docs/shared-spec.md](docs/shared-spec.md).

```sh
make build   # build both (ts + go)
make test    # test both against the shared spec
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
the model as JSON Schema), `trim` (find redundant entries), `mod`
(dependency closures), `agentsmd` (an AGENTS.md stanza), `fmt` (the
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
clone: `node ts/dist/cli.js …` or, inside `go/`, `go run ./cmd/aontu …`.

## Documentation

Full documentation is in [`docs/`](docs/):

- [Documentation home](docs/index.md). Start here
- [Tutorial](docs/tutorial.md). Learn Aontu step by step
- [How-to guides](docs/how-to/). Task-focused recipes
- [Language reference](docs/reference-language.md). Every construct and rule
- [API reference](docs/reference-api.md). TypeScript & Go APIs, and the CLI
- [Explanation](docs/explanation.md). How and why the unifier works
- [Test coverage](docs/test-coverage.md). How it is measured, and the numbers

[use-cases/](use-cases/) holds sixteen enterprise-shaped systems built
as real Aontu documents, each with a `check.sh` that drives the CLI and
asserts every outcome.

## Security and contributing

- **Security**: the evaluator's trust contract
  ([docs/trust.md](docs/trust.md)) is the security surface—see
  [SECURITY.md](SECURITY.md) for scope and how to report privately.
- **Contributing**: start at [CONTRIBUTING.md](CONTRIBUTING.md), which
  points at [AGENTS.md](AGENTS.md), the full contributor and agent
  guide.

