<a name="top"></a>

# Aontu: JSON Structure unifier

[![npm version](https://img.shields.io/npm/v/aontu.svg)](https://npmjs.com/package/aontu)
[![build](https://github.com/rjrodger/aontu/actions/workflows/build.yml/badge.svg)](https://github.com/rjrodger/aontu/actions/workflows/build.yml)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|


This unifier is heavily inspired by [Cue Lang](https://cuelang.org/)
and may be regarded as a purpose-specific dialect.


## Implementations

Aontu ships two implementations, kept in parity (structure inspired by
[`voxgig/util`](https://github.com/voxgig/util)):

- **TypeScript** in [`ts/`](ts/) — the canonical implementation
  (published to npm as `aontu`).
- **Go** in [`go/`](go/) — a port (`github.com/aontu-lang/aontu/go`) that
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

The repository's CLI has grown a verb surface beyond evaluation —
`vet` (validate data against a schema), `get`/`why` (query and
provenance), `set` (change a value in an overlay, by appending or in
place), `subsume`/`breaking`, `hash`,
`relations`, `reaches` (transitive reachability over the entity
graph), `jsonschema` (export the model as JSON Schema), `trim`,
`mod` tooling, `agentsmd`, a path-addressed
`diff` in the API, and an MCP server —
documented in [docs/reference-api.md](docs/reference-api.md).
These verbs ship in the **0.53.0** line, published on npm since
2026-08-28 and as the Go module tag `go/v0.1.11`. The npm badge above
shows what is currently published, and the
[progress register](docs/capability-review/progress.md) records
exactly what has landed.

Install with `npm i -g aontu` (Node) or
`go install github.com/aontu-lang/aontu/go/cmd/aontu@latest` (Go). From a
clone: `node ts/dist/cli.js …` or, inside `go/`, `go run ./cmd/aontu …`.

## Documentation

Full documentation is in [`docs/`](docs/):

- [Documentation home](docs/index.md) — start here
- [Tutorial](docs/tutorial.md) — learn Aontu step by step
- [How-to guides](docs/how-to/) — task-focused recipes
- [Language reference](docs/reference-language.md) — every construct and rule
- [API reference](docs/reference-api.md) — TypeScript & Go APIs, and the CLI
- [Explanation](docs/explanation.md) — how and why the unifier works
- [Test coverage](docs/test-coverage.md) — how it is measured, and the numbers

The language has also been put through an executable review —
[use-cases/](use-cases/) drives fifteen enterprise scenarios through
the real CLI, with verified findings and minimal repros.

## Security and contributing

- **Security**: the evaluator's trust contract
  ([docs/trust.md](docs/trust.md)) is the security surface — see
  [SECURITY.md](SECURITY.md) for scope and how to report privately.
- **Contributing**: start at [CONTRIBUTING.md](CONTRIBUTING.md), which
  points at [AGENTS.md](AGENTS.md), the full contributor and agent
  guide.

