# Aontu Language Server (LSP)

Both implementations ship a [Language Server
Protocol](https://microsoft.github.io/language-server-protocol/) server
that reports Aontu unification problems as editor diagnostics while you
type. As required by the project's parity rule, the TypeScript and Go
servers are built the same way, advertise the same capabilities, and
produce identical diagnostic text for the same source.

This document is a **reference**: it is exhaustive about the architecture,
the library API in both languages, the supported protocol surface, and how
to run the server. Wiring it into an editor is a task, and lives in the
[wire your editor](how-to/wire-your-editor.md) guide.

- [What it does](#what-it-does)
- [Architecture: library vs. server](#architecture-library-vs-server)
- [Running the server](#running-the-server)
- [Editor configuration](#editor-configuration)
- [Library API](#library-api)
  - [TypeScript](#typescript-library)
  - [Go](#go-library)
- [Protocol surface](#protocol-surface)
- [How diagnostics are computed](#how-diagnostics-are-computed)
- [Cross-implementation parity](#cross-implementation-parity)
- [Limitations and extension points](#limitations-and-extension-points)


## What it does

The server provides three features:

- **Diagnostics** — unification problems published as you edit.
- **Hover** — the resolved value and kind under the cursor.
- **Completion** — the built-in functions, scalar-kind keywords and
  literals.

**Diagnostics**: open or edit an Aontu document and it
publishes a list of problems, each with a precise source range, severity,
an engine error code (`code`), and a human-readable message.

It reports *genuine errors* only:

| Source                  | Diagnostic?                                   |
|-------------------------|-----------------------------------------------|
| `a:1 a:2`               | yes — `scalar_value` conflict                 |
| `a:1 & string`          | yes — `no_scalar_unify`                        |
| `x:foo(1)`              | yes — `unknown_function`                       |
| `a:$.missing`           | yes — `no_path`                                |
| `b: refer() & path("$.nope")` | yes — `refer_unresolved` (a `rel()` member naming no entity: `rel_unresolved`) |
| `a:string`              | **no** — a non-concrete schema is valid        |
| `a:{b:string, c:1}`     | **no** — partial/constraint documents are valid |
| `port:*8080 \| integer` | **no** — defaults and disjunctions are valid    |
| `a: $.a`                | **no** — a recursive reference is a valid schema |

This distinction is deliberate: Aontu documents are frequently schemas or
partial fragments, which are *not concrete* but are *not errors*. The
server flags only contradictions and unresolved/unknown constructs. See
[How diagnostics are computed](#how-diagnostics-are-computed).

Verdicts that land at generation stay out of the editor. A required
recursive position that no data expanded (`recursion_unexpanded`) and a
relation finding from `acyclic()` (`relation_cycle`) are generate-time
refusals, so `computeDiagnostics` publishes nothing for either.

One diagnostic is not an error: a value carrying `deprecate()` is
published with code `deprecated` at Hint severity (4), tagged with the
native Deprecated tag (2), so editors strike it through without
shouting.

**Hover** reads the *unified* tree, so hovering a value shows what it
resolves to: e.g. hovering `8080` in `port: 8080` shows `8080` with kind
*integer*; hovering `string` in a schema shows kind *type*. Hover targets
concrete values (scalars, kinds, references), not containers.

**Completion** offers a context-free list (clients filter by the typed
prefix): the built-in functions — the engine's full roster, 41 today,
the constraint atoms (`min`, `re`, `length`, …) and the entity and
relation atoms (`id`, `refer`, `rel`, `acyclic`, `inverse`) included —
the scalar-kind keywords (`string`, `number`, `integer`, `float`,
`biginteger`, `bigdecimal`, `boolean`) and the
literals (`_`, `true`, `false`, `null`, `top`).


## Architecture: library vs. server

Per the requirement to *expose the LSP logic as a library separate from
serving it*, each implementation is split into three layers. Only the
outermost layer touches stdin/stdout, so the analysis and the protocol
state machine are both unit-testable with no I/O.

```
┌─────────────────────────────────────────────────────────────┐
│ 3. Server (transport)        ts/src/lsp-server.ts             │
│    stdio Content-Length      go/cmd/aontu-lsp/main.go         │
│    JSON-RPC framing only                                      │
└───────────────┬─────────────────────────────────────────────┘
                │ decoded message objects
┌───────────────▼─────────────────────────────────────────────┐
│ 2. Handler (protocol)        LspHandler  (ts/src/lsp.ts)      │
│    document sync, dispatch,  lsp.Handler (go/lsp/handler.go)  │
│    initialize/shutdown/exit  — no I/O, returns reply objects  │
└───────────────┬─────────────────────────────────────────────┘
                │ document text
┌───────────────▼─────────────────────────────────────────────┐
│ 1. Analysis (pure)           computeDiagnostics (ts/src/lsp.ts)│
│    source text -> Diagnostic[]  lsp.Diagnostics (go/lsp/lsp.go)│
└─────────────────────────────────────────────────────────────┘
```

| Layer | TypeScript | Go |
|-------|------------|----|
| 1. Analysis | `computeDiagnostics(src)` in `ts/src/lsp.ts` | `lsp.Diagnostics(src)` in `go/lsp/lsp.go` (over `aontu.Check`) |
| 2. Handler | `LspHandler` in `ts/src/lsp.ts` | `lsp.Handler` in `go/lsp/handler.go` |
| 3. Server | `ts/src/lsp-server.ts` → `aontu-lsp` bin | `go/cmd/aontu-lsp/main.go` → `aontu-lsp` binary |

You can consume any layer directly:

- embed **layer 1** to lint Aontu source in your own tool;
- embed **layer 2** to run the server over a non-stdio transport (e.g. a
  socket or an in-process channel) by feeding it decoded JSON-RPC objects;
- run **layer 3** as a ready-made stdio server for an editor.

### Bring your own server

The library (layers 1–2) does **not** depend on the bundled stdio server,
so a third party can build a server on a different transport while reusing
all the analysis and protocol logic:

- **Go**: import `github.com/aontu-lang/aontu/go/lsp`. The package has no
  dependency on `cmd/aontu-lsp` (verifiable with
  `go list -deps ./lsp | grep cmd` → empty). Drive `lsp.NewHandler()` with
  decoded `lsp.Message` values and write back the returned `lsp.Out`s over
  whatever transport you like.
- **TypeScript**: import `aontu/dist/lsp` (or `ts/src/lsp.ts`). It does
  not import `lsp-server.ts`; the dependency is one-way (server →
  library). Drive `new LspHandler()` with message objects.

In both, `computeDiagnostics`/`Diagnostics`, `computeHover`/`Hover`, and
`computeCompletions`/`Completions` are also usable standalone, with no
JSON-RPC at all.


## Running the server

The server reads LSP/JSON-RPC from **stdin** and writes to **stdout**;
diagnostic logging (if any) goes to **stderr**. Editors normally launch it
with no arguments.

**TypeScript** (Node ≥ 22):

<!-- test: skip build-and-launch commands for a long-running stdio server; the transport is round-trip tested in ts/test/lsp.test.ts -->
```sh
cd ts && npm install && npm run build
node ts/bin/aontu-lsp.js
# or, once installed (npm i -g aontu), the bin:
aontu-lsp
```

**Go**:

<!-- test: skip build-and-launch commands for a long-running stdio server; the transport is round-trip tested in go/cmd/aontu-lsp/main_test.go -->
```sh
cd go && go build -o aontu-lsp ./cmd/aontu-lsp
./aontu-lsp
# or run without building:
go run ./cmd/aontu-lsp
```

Both binaries are named `aontu-lsp` and are byte-for-byte interchangeable
from a client's point of view.


## Editor configuration

Ready-made plugins for **VS Code**, **Emacs** and **Vim/Neovim** live in
[`editors/`](../editors/), and the manual wiring recipes for VS Code,
Neovim and any other LSP client have moved to the
[wire your editor](how-to/wire-your-editor.md) guide. The facts a client
needs: command `aontu-lsp`, transport stdio, document selector the
`aontu` language (`.aon` is the preferred extension, `.aontu` also
works, `.jsonic` is retired), and no configuration options.


## Library API

### TypeScript library

Import from the built package (`ts/dist/lsp`) or from source
(`ts/src/lsp.ts`).

<!-- test: skip TypeScript import sample; the exported surface is pinned by ts/test/lsp.test.ts -->
```ts
import {
  computeDiagnostics,
  LspHandler,
  type Diagnostic,
  type Message,
  type OutMessage,
  SEVERITY_ERROR,
} from 'aontu/dist/lsp' // or relative path in this repo
```

#### `computeDiagnostics(src, opts?) => Diagnostic[]`

Analyse one document of Aontu source and return its diagnostics. A valid
document (including a non-concrete schema) returns `[]`.

- `src: string` — the document text.
- `opts?: { vars?: Record<string, Val> }` — optional `$name` variable
  bindings, the same map accepted by the engine's runner context.

`Diagnostic` is LSP-shaped:

<!-- test: skip type shapes quoted from ts/src/lsp.ts; pinned by ts/test/lsp.test.ts -->
```ts
type Position = { line: number; character: number }   // 0-based; UTF-16 chars
type Range    = { start: Position; end: Position }
type Diagnostic = {
  range: Range
  severity: number       // SEVERITY_ERROR (1); SEVERITY_HINT (4) for "deprecated"
  code?: string          // engine error code, e.g. "scalar_value"
  source: string         // always "aontu"
  message: string
  tags?: number[]        // LSP DiagnosticTag values; [2] marks "deprecated"
}
```

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by ts/test/lsp.test.ts -->
```ts
computeDiagnostics('a:1\na:2')
// [{ range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
//    severity: 1, code: 'scalar_value', source: 'aontu',
//    message: '[aontu/scalar_value]: Cannot unify values at path $.a\n...' }]

computeDiagnostics('a:string') // []  (valid schema)
```

#### `computeHover(src, position) => Hover | null`

Resolve the value at a 0-based `{ line, character }` position and describe
it, or `null` if the position is not over a concrete value.

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by ts/test/lsp.test.ts -->
```ts
computeHover('port: 8080', { line: 0, character: 7 })
// { contents: { kind: 'markdown', value: '```aontu\n8080\n```\n\n*integer*' },
//   range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } } }
```

#### `computeCompletions() => CompletionItem[]`

Return the context-free completion list (built-in functions, scalar-kind
keywords, literals). `CompletionItem` is `{ label, kind?, detail? }`. The
exported `BUILTIN_FUNCS` is the function-name list.

#### `class LspHandler`

The transport-agnostic protocol state machine. Construct one per session
and feed it decoded JSON-RPC message objects.

<!-- test: skip TypeScript API sample; the handler is pinned by ts/test/lsp.test.ts -->
```ts
const handler = new LspHandler()
const replies: OutMessage[] = handler.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
```

- `handle(msg: Message): OutMessage[]` — process one message; returns the
  messages to send back (a response for a request, notifications such as
  `textDocument/publishDiagnostics` for document events, or `[]`).
- `get shouldExit(): boolean` — true once an `exit` notification arrives.
- `get exitCode(): number` — `0` if `shutdown` preceded `exit`, else `1`.
- `doc(uri: string): string | undefined` — current text of an open
  document (handy in tests).

#### `class FrameCodec` (server helper)

Exported from `ts/src/lsp-server.ts`. A byte-level Content-Length codec
that drives an `LspHandler`; injectable `write`/`onExit` make it testable
without real stdio. Most users want the `aontu-lsp` binary instead.

### Go library

Import `github.com/aontu-lang/aontu/go/lsp`.

<!-- test: skip Go import sample; the exported surface is pinned by go/lsp/lsp_test.go -->
```go
import "github.com/aontu-lang/aontu/go/lsp"
```

#### `func Diagnostics(src string) []Diagnostic`

Analyse one document and return its diagnostics (empty for valid
documents). `DiagnosticsVars(src, vars)` adds `$name` bindings.

<!-- test: skip struct shapes quoted from go/lsp/lsp.go; pinned by go/lsp/lsp_test.go -->
```go
type Position struct { Line int `json:"line"`; Character int `json:"character"` }
type Range    struct { Start Position `json:"start"`; End Position `json:"end"` }
type Diagnostic struct {
    Range    Range  `json:"range"`
    Severity int    `json:"severity"` // SeverityError (1); SeverityHint (4) for "deprecated"
    Code     string `json:"code,omitempty"`
    Source   string `json:"source"`   // "aontu"
    Message  string `json:"message"`
    Tags     []int  `json:"tags,omitempty"` // LSP DiagnosticTag values; [2] marks "deprecated"
}
```

<!-- test: skip Go API sample; behaviour is pinned by go/lsp/lsp_test.go and kept in parity with the probed TypeScript results -->
```go
d := lsp.Diagnostics("a:1\na:2")
// d[0].Code == "scalar_value", d[0].Range.Start == {Line:1, Character:2}
lsp.Diagnostics("a:string") // len 0 (valid schema)
```

#### `func Hover(src string, line, character int) *HoverResult`

Resolve the value at a 0-based position, or `nil`. `HoverResult` is
`{ Contents MarkupContent; Range *Range }`. Built on the core
`(*aontu.Aontu).Spans(src) []aontu.ValueSpan`, which lists positioned
non-container values.

#### `func Completions() []CompletionItem`

The context-free completion list. `CompletionItem` is
`{ Label string; Kind int; Detail string }`. The function names come from
the engine via `aontu.BuiltinFuncNames()`.

#### `type Handler`

The transport-agnostic protocol state machine (mirrors `LspHandler`).

- `NewHandler() *Handler`
- `(*Handler) Handle(m Message) []Out` — process one message, return
  messages to send.
- `(*Handler) ShouldExit() bool`, `(*Handler) ExitCode() int`,
  `(*Handler) Doc(uri string) (string, bool)`.

`Message`/`Out` are JSON-RPC envelopes; `Out` marshals to a well-formed
response (including an explicit `result: null` for `shutdown`).

#### Core support: `func (*aontu.Aontu) Check(src string) []aontu.Problem`

`lsp.Diagnostics` is built on `aontu.Check`, which lives in `package
aontu` because it needs the engine's internal error positions. `Check`
parses and unifies `src` and returns every problem (it does not stop at
the first, and does not treat non-concrete values as errors). Each
`Problem` carries a source **byte offset** (`Pos`, or `-1`), the byte
`Len` of the offending value's canon, the error code (`Why`), and the
`Message`. The `lsp` package converts byte offsets to LSP line/UTF-16
positions.


## Protocol surface

`textDocumentSync` is **Full** (the client sends the whole document on
each change). Advertised capabilities: `textDocumentSync: 1`,
`hoverProvider: true`, `completionProvider: {}`.

| Method | Kind | Behaviour |
|--------|------|-----------|
| `initialize` | request | Replies with `{ capabilities: { textDocumentSync: 1, hoverProvider: true, completionProvider: {} }, serverInfo: { name: "aontu-lsp", version } }`. |
| `initialized` | notification | Ignored. |
| `textDocument/didOpen` | notification | Stores the document, publishes diagnostics. |
| `textDocument/didChange` | notification | Replaces the document with the last content change (Full sync), publishes diagnostics. |
| `textDocument/didClose` | notification | Drops the document, publishes an empty diagnostic list (clears markers). |
| `textDocument/hover` | request | Replies with a hover for the value at the position, or `null`. |
| `textDocument/completion` | request | Replies with the completion item list. |
| `textDocument/publishDiagnostics` | notification (server→client) | Carries `{ uri, diagnostics }`. |
| `shutdown` | request | Replies `result: null`, arms a clean exit. |
| `exit` | notification | Stops the server. Exit code `0` if `shutdown` came first, else `1`. |
| any other request | request | Replies with JSON-RPC error `-32601` (method not found). |
| any other notification | notification | Ignored. |

### Message flow

```
client → initialize                     server → result(capabilities)
client → initialized
client → didOpen(uri, text)             server → publishDiagnostics(uri, [...])
client → didChange(uri, newText)        server → publishDiagnostics(uri, [...])
client → didClose(uri)                  server → publishDiagnostics(uri, [])
client → shutdown                       server → result(null)
client → exit                           (process exits 0)
```


## How diagnostics are computed

The analysis layer turns source into diagnostics in three steps:

1. **Unify.** Parse and run the fixpoint unification over the whole
   document (in error-collecting mode; it never throws on conflicts).
2. **Walk for `NilVal`s.** Traverse the unified result tree and collect
   every `NilVal` node. The rule: in Aontu a `NilVal` in the
   *result* is always a real error (a conflict, an unresolved reference,
   an unknown function, …). Valid-but-non-concrete values — scalar kinds
   like `string`, unresolved references, conjuncts — are **not** `NilVal`s,
   so schemas and partial documents produce no diagnostics. Nodes are
   de-duplicated by identity.
3. **Map to LSP.** Each `NilVal` carries a source position (1-based
   row/col in TS; a byte offset in Go) and the offending value's canon.
   These become a 0-based LSP range whose end extends across the canon
   length. The message is the engine's full error text — the
   `[aontu/<code>]` marker line, the hint, and the located source
   frames — identical in both languages.

A hard **syntax error** (which prevents producing a tree) is reported as a
single diagnostic with code `parse`, positioned where the parser failed if
that information is available, otherwise at the document start.

Positions use the LSP default encoding (**UTF-16 code units** per line):
JavaScript strings are already UTF-16, and the Go library counts UTF-16
units explicitly, so a multi-byte character before an error does not shift
the reported column.


## Cross-implementation parity

The two servers are kept in lock-step:

- **Same capabilities** and `serverInfo.name` (`aontu-lsp`).
- **Same diagnostics**: the analysis is driven by the same engine, the
  `NilVal`-walk is identical, and the message text is constructed the same
  way (`go/val.go` `NilVal.Message` and `ts/src/lsp.ts` `nilMessage`), so
  for any given source both servers emit the same `code`, `range`, and
  `message`.
- **Same protocol behaviour**, including `result: null` for `shutdown` and
  the `0`/`1` exit-code rule.

Both libraries are unit-tested (`ts/test/lsp.test.ts`,
`go/lsp/lsp_test.go`) and each server has a transport round-trip test
(`go/cmd/aontu-lsp/main_test.go`, and the `FrameCodec` test in
`ts/test/lsp.test.ts`).


## Limitations and extension points

Current scope is diagnostics, hover and completion. The layered design
makes additions localised — most new features are implemented once in the
analysis layer (layer 1) and advertised in `initialize` (layer 2):

- **Hover** targets concrete values (scalars, kinds, references), not
  containers, and uses canon length to size the hit span on a single
  line; a value resolved from a reference is shown at its definition
  site. Hovering a multi-line container or the cursor exactly on a `{`
  brace may not resolve.
- **Completion** is context-free (no cursor-to-path awareness): it does
  not suggest sibling keys. Adding key completion needs a position→path
  mapping in the analysis layer.
- **Go-time-out / cancellation, go-to-definition, rename** — not
  implemented; unknown requests get a `-32601` reply.
- **Incremental sync** — the server uses Full document sync for
  simplicity; range-based incremental edits could be added in the handler
  without touching the analysis layer.
- **Warnings/info severities** — engine problems are all published as
  `Error`; the one exception is `deprecated`, at Hint severity with the
  Deprecated tag.
- **Number-canon edge cases** — diagnostic ranges are sized by the
  offending value's canon length; see
  [Canonical form](reference-language.md#canonical-form) for the
  decimal subset that pins it.
