# aontu Language Server (LSP)

Both implementations ship a [Language Server
Protocol](https://microsoft.github.io/language-server-protocol/) server
that reports aontu unification problems as editor diagnostics while you
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

The server provides these features:

- **Diagnostics**: unification problems published as you edit.
- **Hover**: the resolved value and kind under the cursor, what stands
  at the path a key or a reference names, or the declaration of the
  alias name it is on.
- **Completion**: at a key, the keys a type or a spread's template
  declares and the map has not written; after a dot in a reference,
  the members of the path; elsewhere, the built-in functions,
  scalar-kind keywords and literals, and the alias names the document
  binds.
- **Go to definition**: from a key or a reference to every site that
  writes its path, across includes, and from an alias name to where
  the file binds it.
- **Signature help**: the parameters of the function being called.
- **Formatting**: the document as `aontu fmt` writes it.

**Diagnostics**: open or edit an aontu document and it
publishes a list of problems, each with a precise source range, severity,
an engine error code (`code`), and a human-readable message.

It reports *genuine errors* only:

| Source                  | Diagnostic?                                   |
|-------------------------|-----------------------------------------------|
| `a:1 a:2`               | yes: `scalar_value` conflict                 |
| `a:1 & string`          | yes: `no_scalar_unify`                        |
| `x:foo(1)`              | yes: `unknown_function`                       |
| `a:$.missing`           | yes: `no_path`                                |
| `b: relate() & path("$.nope")` | yes: `rel_unresolved`                         |
| `a:string`              | **no**: a non-concrete schema is valid        |
| `a:{b:string, c:1}`     | **no**: partial/constraint documents are valid |
| `port:*8080 \| integer` | **no**: defaults and disjunctions are valid    |
| `a: $.a`                | **no**: a recursive reference is a valid schema |

This distinction is deliberate: aontu documents are frequently schemas or
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
shouting. Two records met on one value are one diagnostic, each field's
values joined with `; `.

**Hover** reads the *unified* tree, so hovering a value shows what it
resolves to: hovering `8080` in `port: 8080` shows `8080` with kind
*integer*; hovering `string` in a schema shows kind *type*. On a key,
hover shows what unified at the key's path, whether a scalar, a map,
or a list. On a reference, it shows what stands at the path the
reference reads, which an included file may have written. A value
annotated with `meta()` adds the text its `title` keys hold, each in
bold, then the text its `description` keys hold, under the kind.

The kind is one word, the same in both servers: the value's own kind
(`integer`, `float`, `string`, `boolean`, `null`, `path`, `map`,
`list`, and so on), `type` for a kind such as `string`, `constraint`,
`reference` for a reference not yet resolved, `recurse` for a
recursive position, `disjunct` for alternatives, `pref` for a default,
`function` for a call that waits on its arguments, `any`, and `error`
for a conflict.

**Go to definition** on a key answers every site that writes the key's
path, and on a reference every site that writes the path it reads:
the sites `aontu model why` prints for that path, in its order. A site
in an included file is a location in that file, by its `file://` URI.
A value an include loads is written in its own file, so the
definition of `base` in `base: @"./base.aontu"` is in `base.aontu`.
On an alias name, it goes to where the file binds the name.

**Completion** reads what may be written at the cursor. At a key, it
offers the keys the map there takes once the document has unified and
that the map has not written: the fields of a type it meets, and what
a spread's template declares. Each comes with its value's canon, and
an optional key says so. After a dot in a reference, it offers the
members of the path the reference has reached: a map's keys, or a
list's positions. One dot reads the map the cursor is in, and each
more dot one level up. A key that `aontu fmt` would not write bare is
inserted in quotes. A dot is a trigger character, and a dot that
begins no path offers nothing.

Both read the document with the word being typed taken out, the
reference being typed standing as `any`, and every bracket left open
closed. Elsewhere, and at a key where nothing is declared, completion
offers the general list (clients filter by the typed prefix): the
built-in functions (the engine's full roster, the constraint atoms
(`min`, `re`, `len`, …) and the relation atoms (`relate`, `acyclic`,
`inverse`) included), the kind keywords (`string`, `number`,
`integer`, `float`, `biginteger`, `bigdecimal`, `boolean`, `map`,
`list`, `constraint`), the literals (`_`, `true`, `false`, `null`,
`any`), and the alias names the document binds.


## Architecture: library vs. server

Per the requirement to *expose the LSP logic as a library separate from
serving it*, each implementation is split into three layers. Only the
outermost layer touches stdin/stdout, so the analysis and the protocol
state machine are both unit-testable with no I/O.

```
┌─────────────────────────────────────────────────────────────┐
│ 3. Server (transport)        ts/src/lsp-server.ts             │
│    stdio Content-Length      go/lsp/serve.go                  │
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
| 3. Server | `ts/src/lsp-server.ts` → `aontu lsp` (and the `aontu-lsp` bin) | `go/lsp/serve.go` → `aontu lsp` (and the `aontu-lsp` binary) |

You can consume any layer directly:

- embed **layer 1** to lint aontu source in your own tool;
- embed **layer 2** to run the server over a non-stdio transport (for example a
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

In both, `computeDiagnostics`/`Diagnostics`, `computeHover`/`Hover`,
`computePathDefinition`/`PathDefinition`, and
`computeCompletions`/`Completions` take the document's text and are
usable standalone, with no JSON-RPC at all.


## Running the server

The server is the `lsp` verb of the CLI in both builds. It reads
LSP/JSON-RPC from **stdin** and writes to **stdout**; diagnostic
logging (if any) goes to **stderr**. Editors launch it with no
arguments beyond the verb:

<!-- test: skip a long-running stdio server; the transport is round-trip tested in ts/test/lsp.test.ts and go/lsp/serve_test.go, and the verb in both CLI suites -->
```sh
aontu lsp
```

The standalone binaries still ship and run the same server, for
configurations that name them: `aontu-lsp` from the npm package
(`node ts/bin/aontu-lsp.js` from a checkout), and `cmd/aontu-lsp` in
the Go module (`go run ./cmd/aontu-lsp` inside `go/`). The two builds
are byte-for-byte interchangeable from a client's point of view.


## Editor configuration

Ready-made clients for **VS Code**, **Emacs**, **Vim/Neovim**, and the
**JetBrains IDEs** live in [`editors/`](../editors/), and the manual
wiring recipes for VS Code, Neovim, a JetBrains IDE, and any other LSP
client are in the [wire your editor](how-to/wire-your-editor.md) guide. The facts a client
needs: command `aontu` with the argument `lsp`, transport stdio,
document selector the `aontu` language (`.aontu` is the extension, and
the only one; `.jsonic` is retired), and no configuration options.


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

Analyse one document of aontu source and return its diagnostics. A valid
document (including a non-concrete schema) returns `[]`.

- `src: string`: the document text.
- `opts?: { vars?: Record<string, Val> }`: optional `$name` variable
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
//    message: 'Cannot unify value: 2 with value: 1\nLiteral scalar values of ...' }]

computeDiagnostics('a:string') // []  (valid schema)
```

#### `computeHover(src, position, provenance?, trust?) => Hover | null`

Describe what is at a 0-based `{ line, character }` position: the
alias name there, else what stands at the path a key or a reference
there names, else the concrete value there. The answer is `null` where
the position is on none of them. `provenance` appends the
contributions record, and `trust` is the include capability the
document is evaluated under.

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by ts/test/lsp.test.ts -->
```ts
computeHover('port: 8080', { line: 0, character: 7 })
// { contents: { kind: 'markdown', value: '```aontu\n8080\n```\n\n*integer*' },
//   range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } } }
computeHover('base: { port: 8080 }', { line: 0, character: 1 })
// { contents: { kind: 'markdown', value: '```aontu\n{"port":8080}\n```\n\n*map*' },
//   range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } } }
```

#### `computeCompletions(src, position?, opts?) => CompletionItem[]`

Return the completion list. With a 0-based `position`, it is the keys
or the members that may be written there, where there are any, each
with `kind` `COMPLETION_FIELD` (5), its value's canon as `detail`, and
an `insertText` where the key needs quotes. Otherwise, and without a
position, it is the general list: the built-in functions, scalar-kind
keywords and literals, which do not depend on `src`, and the alias
names `src` binds, which do. `opts` is `{ trust?, trigger? }`; a
`trigger` of `.` that begins no path answers `[]`. `CompletionItem` is
`{ label, kind?, detail?, insertText? }`. The exported `BUILTIN_FUNCS`
is the function-name list.

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by ts/test/lsp.test.ts -->
```ts
const src = 'S: type({ port: integer, tier?: string })\napi: $.S & {  }\n'
computeCompletions(src, { line: 1, character: 13 })
// [{ label: 'port', kind: 5, detail: 'integer' },
//  { label: 'tier', kind: 5, detail: 'string (optional)' }]
```

#### `computeDefinition(src, position, uri) => Location | null`

Where the document binds the alias name at a 0-based position, or
`null` where the position is not on one, or names nothing the file
binds. `Location` is `{ uri, range }`.

#### `computePathDefinition(src, position, uri, trust?) => Location[] | null`

Every site that writes the path a key or a reference at a 0-based
position names, as a `Location`: `uri` for a site in the document, and
the `file://` URI of an included file for a site there. The answer is
`null` where the position names no path, or the document does not
evaluate. The server asks this where `computeDefinition` answers
`null`.

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by ts/test/lsp.test.ts -->
```ts
const src = 'base: { port: 8080 }\ndb: { port: $.base.port }\n'
computePathDefinition(src, { line: 1, character: 15 }, 'file:///d.aontu')
// [{ uri: 'file:///d.aontu',
//    range: { start: { line: 0, character: 14 }, end: { line: 0, character: 18 } } }]
```

#### `computeFormatting(src) => TextEdit[] | null`

The document as `aontu fmt` writes it: one `TextEdit`, `{ range,
newText }`, over the whole document, none where it already is that
text, and `null` where it doesn't parse.

#### `computePathAt(src, position, trust?) => CursorPath | null`

What the cursor at a 0-based position is on, and the path that stands
there: `{ on, path, range, reads? }`. `on` is `key`, `value` or `ref`;
`path` holds the path's segments, with `&` for a spread's template;
`range` is the span of the key, value or reference itself; and `reads`
is the absolute path a reference reads. The answer is `null` where the
document has a syntax error or the cursor is on none of the three.

<!-- test: skip TypeScript API sample; results probed against ts/dist/lsp.js and pinned by test/spec/cursor.tsv -->
```ts
const src = 'base: { port: 8080 }\ndb: { port: $.base.port }\n'
computePathAt(src, { line: 1, character: 7 })
// { on: 'key', path: ['db', 'port'],
//   range: { start: { line: 1, character: 6 }, end: { line: 1, character: 10 } } }
computePathAt(src, { line: 1, character: 15 })
// { on: 'ref', path: ['db', 'port'], reads: ['base', 'port'],
//   range: { start: { line: 1, character: 12 }, end: { line: 1, character: 23 } } }
```

#### `computeSitesOf(src, path, trust?) => PathSite[] | null`

Every site that writes `path`, as `aontu model why` lists them:
`{ canon, role, file, range }`, where `role` is `literal`, `spread`,
`ref` or `pref`, and `file` is empty for the document itself. The
answer is `null` where the document doesn't evaluate or has no such
path. For the document above, `['db', 'port']` has two sites: `8080`,
a literal, and `$.base.port`, a reference.

#### `class LspHandler`

The transport-agnostic protocol state machine. Construct one per session
and feed it decoded JSON-RPC message objects.

<!-- test: skip TypeScript API sample; the handler is pinned by ts/test/lsp.test.ts -->
```ts
const handler = new LspHandler()
const replies: OutMessage[] = handler.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
```

- `handle(msg: Message): OutMessage[]`: process one message; returns the
  messages to send back (a response for a request, notifications such as
  `textDocument/publishDiagnostics` for document events, or `[]`).
- `get shouldExit(): boolean`: true once an `exit` notification arrives.
- `get exitCode(): number`: `0` if `shutdown` preceded `exit`, else `1`.
- `doc(uri: string): string | undefined`: current text of an open
  document (handy in tests).

#### `class FrameCodec` (server helper)

Exported from `ts/src/lsp-server.ts`. A byte-level Content-Length codec
that drives an `LspHandler`; injectable `write`/`onExit` make it testable
without real stdio. Most users want `aontu lsp` instead.

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

#### `func Hover(src string, line, character int, provenance bool) *HoverResult`

Describe what is at a 0-based position, as `computeHover` answers it,
or `nil`. `HoverResult` is `{ Contents MarkupContent; Range *Range }`.
`HoverTrust` takes the include capability as well. On a key or a
reference it is built on the core `(*aontu.Aontu).DescribeAt`, and on
a value on `(*aontu.Aontu).Spans(src) []aontu.ValueSpan`, which lists
positioned non-container values.

#### `func Completions(src string) []CompletionItem`

The general completion list: the built-in functions, scalar-kind
keywords and literals, which do not depend on `src`, and the alias
names `src` binds, which do. `CompletionItem` is
`{ Label string; Kind int; Detail string; InsertText string }`. The
function names come from the engine via `aontu.BuiltinFuncNames()`, and
the alias names via `aontu.AliasScope()`.

#### `func CompletionsAt(src string, line, character int, trigger string, trust *aontu.TrustOptions) []CompletionItem`

The completion at a 0-based position, as `computeCompletions` answers
it with one. Built on the core `(*aontu.Aontu).MembersAt`.

#### `func Definition(src string, line, character int, uri string) *Location`

Where the document binds the alias name at a 0-based position, or `nil`
where the position is not on one, or names nothing the file binds.
`Location` is `{ URI string; Range Range }`.

#### `func PathDefinition(src string, line, character int, uri string, trust *aontu.TrustOptions) []Location`

Every site that writes the path a key or a reference at a 0-based
position names, as `computePathDefinition` answers it, or `nil`. Built
on the core `(*aontu.Aontu).DefinitionAt`.

#### `func Formatting(src string) []TextEdit`

The document as `aontu fmt` writes it: one `TextEdit`, `{ Range Range;
NewText string }`, over the whole document, none where it already is
that text, and `nil` where it doesn't parse.

#### `func PathAt(src string, line, character int, trust *aontu.TrustOptions) *aontu.CursorPath`

What the cursor at a 0-based position is on, and the path that stands
there, as `computePathAt` answers it: `CursorPath` is `{ On string;
Path []string; Range CursorRange; Reads []string }`, or `nil`.

#### `func SitesOf(src string, path []string, trust *aontu.TrustOptions) []aontu.PathSite`

Every site that writes `path`, as `computeSitesOf` answers it:
`PathSite` is `{ Canon, File, Role string; Range CursorRange }`, or
`nil`. Both functions wrap `(*aontu.Aontu).PathAt` and `SitesOf`,
which live in `package aontu` because they read the parsed tree.

#### `type Handler`

The transport-agnostic protocol state machine (mirrors `LspHandler`).

- `NewHandler() *Handler`
- `(*Handler) Handle(m Message) []Out`: process one message, return
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
`hoverProvider: true`, `definitionProvider: true`,
`completionProvider` with the trigger character `.`,
`signatureHelpProvider` with the trigger
characters `(` and `,`, and `documentFormattingProvider: true`.

| Method | Kind | Behaviour |
|--------|------|-----------|
| `initialize` | request | Replies with the advertised capabilities and `serverInfo: { name: "aontu-lsp", version }`. |
| `initialized` | notification | Ignored. |
| `textDocument/didOpen` | notification | Stores the document, publishes diagnostics. |
| `textDocument/didChange` | notification | Replaces the document with the last content change (Full sync), publishes diagnostics. |
| `textDocument/didClose` | notification | Drops the document, publishes an empty diagnostic list (clears markers). |
| `textDocument/hover` | request | Replies with a hover for the alias name at the position, else for what stands at the path a key or a reference there names, else for the value there, else `null`. |
| `textDocument/completion` | request | Replies with the keys or the members that may be written at the position, where there are any; else with `[]` after a dot that begins no path; else with the general list for the open document. |
| `textDocument/definition` | request | Replies with the `Location` where the document binds the alias name at the position, else with a `Location` for every site that writes the path a key or a reference there names, in the document or in a file it includes, else `null`. |
| `textDocument/signatureHelp` | request | Replies with the signature of the call the position is inside, or `null`. |
| `textDocument/formatting` | request | Replies with one edit that replaces the document with the text `aontu fmt` writes, no edit where it already is that text, and `null` where it doesn't parse, which its diagnostics report. |
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
   every `NilVal` node. The rule: in aontu a `NilVal` in the
   *result* is always a real error (a conflict, an unresolved reference,
   an unknown function, …). Valid-but-non-concrete values (scalar kinds
   like `string`, unresolved references, conjuncts) are **not** `NilVal`s,
   so schemas and partial documents produce no diagnostics. Nodes are
   de-duplicated by identity, and two diagnostics alike in range, code
   and message are sent once, so a conflict that a reference copies to
   another path is reported once.
3. **Map to LSP.** Each `NilVal` carries a source position (1-based
   row/col in TS; a byte offset in Go) and the offending value's canon.
   These become a 0-based LSP range whose end extends across the canon
   length. The message is the engine's full error text (the
   `[aontu/<code>]` marker line, the hint, and the located source
   frames) identical in both languages. A conflict between a value an
   included file wrote and one the document wrote is placed at the
   document's operand, since the included file's row and column mean
   nothing in the document. An error in the value an include loads,
   with no operand in the document, is placed at the include's `@`.

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
(`go/lsp/serve_test.go`, and the `FrameCodec` test in
`ts/test/lsp.test.ts`).


## Limitations and extension points

Current scope is diagnostics, hover, completion, go-to-definition on an
alias name, signature help and formatting. The layered design
makes additions localised: most new features are implemented once in the
analysis layer (layer 1) and advertised in `initialize` (layer 2):

- **Hover on a value** targets concrete values (scalars, kinds,
  references), not containers, which hover on their key shows instead.
  It uses canon length to size the hit span, stopping at the end of the
  line; a value resolved from a reference is shown at its definition
  site. Hovering the cursor exactly on a `{` brace may not resolve.
- **Completion** of keys and members needs the document to parse once
  the word being typed is taken out, so a second unfinished edit
  elsewhere leaves the general list. A relative reference inside a
  list, or a quoted segment holding an escaped quote, offers nothing.
  The analysis layer maps a cursor to a path and a path to its sites
  (`computePathAt`, `computeSitesOf`), which hover, definition and
  completion use, and which references will use.
- **The cursor mapping** answers nothing on a key spelled with an
  escape, on the key of an include written in parentheses,
  `p: (@"./x.aontu")`, or on what an included file holds. The sites of
  a top-level key written `""` include the document's own, since
  provenance keeps a path by its segments joined with dots.
- **Includes are read from the folder the server runs in.** The server
  evaluates the text of an open document, not its file, so an include
  with a relative path is resolved against the server's working
  directory, which the editor sets, and not against the document's
  folder as `aontu` resolves it at the command line. An error raised
  deeper inside an included file than the value it loads, with no
  operand in the document, is placed at that file's row and column in
  the document.
- **The alias features read the document's text**, not its tree, so
  they answer while a document is half-written and would not parse. The
  cost is that they know only what the text says: a name arriving
  through a destructure resolves to the pattern that takes it, which is
  where the file binds the name, rather than to the declaration in the
  other file. Following it across the boundary would mean the server
  reading that file itself, outside the include capability that governs
  every other read.
- **Cancellation, rename**: not implemented; unknown requests get a
  `-32601` reply.
- **Incremental sync**: the server uses Full document sync for
  simplicity; range-based incremental edits could be added in the handler
  without touching the analysis layer.
- **Warnings/info severities**: engine problems are all published as
  `Error`; the one exception is `deprecated`, at Hint severity with the
  Deprecated tag.
- **Number-canon edge cases**: diagnostic ranges are sized by the
  offending value's canon length; see
  [Canonical form](reference-language.md#canonical-form) for the
  decimal subset that pins it.
