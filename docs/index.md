# Aontu documentation

Aontu is a JSON structure **unifier**: a small language (a
purpose-specific dialect inspired by [CUE](https://cuelang.org/)) and an
engine that merges partial structures into one consistent result, or
reports exactly where they conflict. The same source can describe data,
the schema that constrains it, and the defaults that fill it in — all in
one notation, all combined by a single operation: *unification*.

This repository ships **two implementations kept in parity**:

- **TypeScript** in [`../ts/`](../ts/) — the canonical implementation,
  published to npm as [`aontu`](https://npmjs.com/package/aontu).
- **Go** in [`../go/`](../go/) — a port
  (`github.com/aontu-lang/aontu/go`) that mirrors the core semantics.

Both are checked against one language-agnostic test suite in
[`../test/spec/`](../test/spec/), and every example in these pages is
executed by that machinery too: the outputs come from the engine, not
from the author's memory.

## How this documentation is organised

The documentation is split by **what you are trying to do** when you
open it. Reach for the part that matches your need:

| If you want to…                                               | Read |
|---------------------------------------------------------------|------|
| **Learn** Aontu from zero by building something, step by step | [Tutorial](tutorial.md) |
| **Learn** the graph layer (identity, relations, reachability) | [Graph tutorial](tutorial-graph.md) |
| **Accomplish a specific task** you already have in mind       | [How-to guides](how-to/) |
| **Look up** exact syntax, semantics, options, or API surface  | [Language reference](reference-language.md) · [API reference](reference-api.md) |
| **Understand unification itself** — meet, top, bottom, the lattice | [Unification](unification.md) |
| **Understand** how and why the engine works the way it does   | [Explanation](explanation.md) |
| **See whole systems defined**, each with its checks runnable  | [Use cases](use-cases.md) |

The how-to guides are one page per task, grouped six ways: run, embed
and integrate; templates, defaults and composition; schemas and
constraints; query, explain and change; validate and evolve; modules
and multi-file.

Three capabilities have doorways of their own:

- **Declare and check relations.** Entities carry identity, the edges
  between them are declared in the model, and the engine checks both.
  The recipe is [check relations](how-to/check-relations.md); the live
  version is [`use-cases/12-relations`](../use-cases/12-relations/);
  the normative rules are under
  [Declared relations](reference-language.md#declared-relations).
- **Write a recursive schema.** A schema can name itself, so trees and
  nested structures validate to any depth. The recipe is
  [define a recursive schema](how-to/define-a-recursive-schema.md);
  the live version is
  [`use-cases/13-recursive-schema`](../use-cases/13-recursive-schema/);
  the semantics are under
  [Recursive references](reference-language.md#recursive-references-fixpoints).
- **Generate code from a model.** The field names, types and
  optionality a Go struct or a TypeScript interface needs are already
  in the model, and the unifier computes the file: a list spread over
  the fields, `match` for the type mapping, a backtick string to carry
  the target text, and `join` to fold the lines into one string. The
  recipe is [generate code from a model](how-to/generate-code.md); the
  live version, with three targets and a check that both ports emit
  identical bytes, is
  [`use-cases/15-code-generation`](../use-cases/15-code-generation/).

Tooling:

- [The `aontu` command](reference-api.md#command-line-interface) — one
  binary, fourteen verbs, both implementations. Each verb has its own
  reference section:
  - validate: [`vet`](reference-api.md#aontu-vet), wrapped for CI as a
    [GitHub Action](../vet-action/README.md)
  - evolve a schema: [`subsume`](reference-api.md#aontu-subsume),
    [`breaking`](reference-api.md#aontu-breaking)
  - ask and change: [`get`](reference-api.md#aontu-get),
    [`why`](reference-api.md#aontu-why),
    [`set`](reference-api.md#aontu-set),
    [`trim`](reference-api.md#aontu-trim)
  - identity and relations:
    [`relations`](reference-api.md#aontu-relations),
    [`reaches`](reference-api.md#aontu-reaches),
    [`view`](reference-api.md#aontu-view)
  - export and pin: [`jsonschema`](reference-api.md#aontu-jsonschema),
    [`hash`](reference-api.md#aontu-hash)
  - distribute and hand over: [`mod`](reference-api.md#aontu-mod),
    [`agentsmd`](reference-api.md#aontu-agentsmd)

  With no file at all, `aontu` starts a REPL.
- [Language Server (LSP)](lsp.md) — the `aontu-lsp` diagnostics server
  (TypeScript and Go), how to wire it into an editor, and the reusable
  LSP library API.
- [The MCP server](reference-api.md#the-mcp-server) — `aontu-mcp`, a
  Model Context Protocol server over stdio, answering with the
  identical reports the CLI prints.

For agents:

- [The Aontu skill](skill/SKILL.md) — an agent-facing teaching pack:
  the [grammar card](skill/grammar-card.md), a
  [worked example ladder](skill/examples.md) whose documents the test
  suite executes, and the [error-code index](skill/error-codes.md).
- [The published grammar](reference-api.md#the-published-grammar) —
  [`grammar/aontu.gbnf`](../grammar/aontu.gbnf) and
  [`grammar/aontu.lark`](../grammar/aontu.lark), the emission surface
  for constrained decoding.

Contract:

- [The trust contract](trust.md) — hermeticity, termination,
  determinism, and sandboxing: what a host may rely on when evaluating
  an Aontu document, and where each guarantee is conditional.

For contributors:

- [The style guide](STYLE-GUIDE.md) — how these pages are written:
  Diátaxis placement, the voice, the banned-phrase list, and the
  snippet directives under which every example runs.

### Why the split?

The four kinds of document answer four different questions and are kept
separate on purpose. A tutorial holds your hand and is allowed to omit
detail; a how-to assumes you know the basics and just need the recipe; a
reference is exhaustive and dry so you can trust it as the source of
truth; an explanation is discursive and is the only place that argues
about trade-offs. Mixing them (a reference that teaches, a tutorial
that digresses into design rationale) serves none of those needs well,
so each lives in its own file.

The rule applies to the toolkit as much as to the language, which is
why a verb can appear in all four kinds without any of them repeating
another: met once, in passing, while a tutorial builds something; given
as a recipe for one goal in a how-to guide; specified exhaustively
(every flag, every exit code) in the API reference; and argued for,
never merely listed, in the explanation. The use cases stand alongside
as whole worked systems, each holding a `check.sh` that CI runs.

## A 30-second taste

```aontu
# A schema, a default, and data — unified into one result.
port:    *8080 | integer
host:    string
host:    "localhost"
```

Unifying the three lines above yields:

```json
{ "host": "localhost", "port": 8080 }
```

The `port` is constrained to be an `integer`, defaults to `8080`, and,
because nothing overrode the default, `8080` is what comes out. `host`
is constrained to a `string` and pinned to `"localhost"`. Conflicting
facts (a second `port: "high"`, say, or a `port: 1.5`) are refused
with a precise error rather than silently resolved: the preferred
branch keeps the kind it names, which is
[argued in the explanation](explanation.md#a-preference-is-gated-by-kind-not-by-family).

Try it without writing a file — both implementations ship an `aontu`
command that evaluates a file, reads stdin, or starts a REPL:

<!-- test: run -->
```sh
$ echo 'port: *8080 | integer' | aontu
{
  "port": 8080
}
```

Start with the [Tutorial](tutorial.md).
