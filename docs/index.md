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
  (`github.com/rjrodger/aontu/go`) that mirrors the core semantics.

Both are checked against one language-agnostic test suite in
[`../test/spec/`](../test/spec/).

## How this documentation is organised

The documentation is split by **what you are trying to do** when you
open it. Reach for the part that matches your need:

| If you want to…                                              | Read |
|--------------------------------------------------------------|------|
| **Learn** Aontu from zero by building something, step by step | [Tutorial](tutorial.md) |
| **Accomplish a specific task** you already have in mind        | [How-to guides](how-to.md) |
| **Look up** exact syntax, semantics, options, or API surface  | [Language reference](reference-language.md) · [API reference](reference-api.md) |
| **Understand** how and why the engine works the way it does    | [Explanation](explanation.md) |

Tooling:

- [Language Server (LSP)](lsp.md) — the `aontu-lsp` diagnostics server
  (TypeScript and Go), how to wire it into an editor, and the reusable
  LSP library API.

For agents:

- [The Aontu skill](skill/SKILL.md) — an agent-facing teaching pack:
  the [grammar card](skill/grammar-card.md), a
  [worked example ladder](skill/examples.md) whose documents the test
  suite executes, and the [error-code index](skill/error-codes.md).
  The `aontu agentsmd` verb generates the matching AGENTS.md stanza.

Contract:

- [The trust contract](trust.md) — hermeticity, termination,
  determinism, and sandboxing: what a host may rely on when evaluating
  an Aontu document, exactly where each guarantee is conditional
  today, and the budget/cycle error taxonomy.

Two further documents support the project itself:

- [Test coverage](test-coverage.md) — how coverage is measured for both
  implementations, the current numbers, and where the gaps are.
- [Shared test specification](shared-spec.md) — the format of the
  cross-language `test/spec/*.tsv` suite.

Design notes (deeper analyses of specific behaviours and known defects)
live in [`design/`](design/):

- [Colon-chain nested `@"file"` import](design/nested-import-colon-chain.md)
  — a since-resolved Go-port parity defect (fixed upstream in
  `@tabnas/multisource/go`) where a colon-chain imported value was
  dropped.
- [The number model](design/number-model.md) — how a numeric literal
  is classified and how kind travels through operators and canon:
  the pre-tower record, its rounding edges since reversed by the
  tower's exactness rule.
- [The number tower](design/number-tower.md) — *implemented*:
  boru's four-leaf number structure mirrored (`integer`, `float`,
  `biginteger`, `bigdecimal` under a pure-supertype `number`), the
  `0d` exact literals, the `lossy_integer_literal` exactness error,
  and where a unification lattice forces
  deviations from boru.

Forward-looking design work lives in
[`capability-review/`](capability-review/index.md): a survey of what
Aontu lacks to serve as a systems-definition ground truth for agents,
with eight companion design documents (G1–G8) covering the constraint
algebra, the validation verb, subsumption and schema evolution,
identity and relations, the trust contract, distribution, the
machine-facing access surface, and generation. Those documents are
design; what has actually been built from them is recorded phase by
phase in the
[progress register](capability-review/progress.md).

### Why the split?

The four kinds of document answer four different questions and are kept
separate on purpose. A tutorial holds your hand and is allowed to omit
detail; a how-to assumes you know the basics and just need the recipe; a
reference is exhaustive and dry so you can trust it as the source of
truth; an explanation is discursive and is the only place that argues
about trade-offs. Mixing them — a reference that teaches, a tutorial that
digresses into design rationale — serves none of those needs well, so
each lives in its own file.

## A 30-second taste

```aontu
# A schema, a default, and data — unified into one result.
port:    integer
port:    *8080 | integer
host:    string
host:    "localhost"
```

Unifying the four lines above yields:

```json
{ "host": "localhost", "port": 8080 }
```

The `port` is constrained to be an `integer`, defaults to `8080`, and —
because nothing overrode the default — `8080` is what comes out. `host`
is constrained to a `string` and pinned to `"localhost"`. Conflicting
facts (e.g. a second `port: "high"`) would instead produce a precise
unification error rather than a silent wrong answer.

Try it without writing any code — both implementations ship an `aontu`
command that evaluates a file or starts a REPL:

```sh
echo 'port: *8080 | integer' | node ts/bin/aontu.js   # or: go run ./cmd/aontu
```

Start with the [Tutorial](tutorial.md).
