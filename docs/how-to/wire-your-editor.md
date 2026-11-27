---
description: Connect `aontu lsp` to VS Code, Neovim, a JetBrains IDE, or any LSP client for diagnostics as you type.
group: run-embed
order: 90
---

# Wire your editor

Both implementations serve the Language Server Protocol from the
command itself, `aontu lsp`: unification problems as diagnostics
while you type, with hover, completion, go to definition, find
references, highlights and an outline of the document's keys beside
them. Completion offers the keys a type declares and the members of a
path after a dot; hover, definition and references work on a key and on
a reference, across the files a document includes. Ready-made
clients for VS Code, Emacs, Vim/Neovim, and the JetBrains IDEs live in
[`editors/`](../../editors/), each a thin client that launches the
server, with install steps in its README. The recipes below are for
wiring a client yourself.

The facts every client needs: the command is `aontu` with the one
argument `lsp`, the transport is stdio, and the document selector is
the `aontu` language (`.aontu` is the extension, and the only one;
`.jsonic` is retired). The server has no configuration options.
The standalone `aontu-lsp` binary that earlier configurations name
still ships and runs the same server.

The server reads an include with a relative path from its own working
directory, not from the document's folder
([limitations](../lsp.md#limitations-and-extension-points)), so start
it where the documents' includes are relative to. A client sets the
directory: `options: { cwd }` in the server options of VS Code's
language client, and `cmd_cwd` in Neovim's `vim.lsp.start`.

Get the command any way the [CLI guide](run-cli-and-repl.md) lists:
`npm install -g aontu`, a built binary, or `go install`. The two builds
are interchangeable from a client's point of view
([running the server](../lsp.md#running-the-server)).

## VS Code

There is no published extension; the smallest path is a tiny custom
extension whose `activate` starts the server with
[`vscode-languageclient`](https://www.npmjs.com/package/vscode-languageclient):

<!-- test: skip VS Code extension wiring; the server contract is pinned by ts/test/lsp.test.ts -->
```ts
import { workspace, ExtensionContext } from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

export function activate(_ctx: ExtensionContext) {
  const server = { command: 'aontu', args: ['lsp'], transport: TransportKind.stdio }
  const client = new LanguageClient(
    'aontu',
    'aontu',
    { run: server, debug: server },
    { documentSelector: [{ scheme: 'file', language: 'aontu' }] },
  )
  client.start()
}
```

From a checkout, use
`{ module: '/abs/path/to/aontu/ts/bin/aontu-lsp.js', transport: TransportKind.stdio }`
for the TypeScript server, or `command: '/abs/path/to/go/aontu'` with
the same `args` for a Go build.

## Neovim (built-in LSP)

<!-- test: skip Neovim configuration; the server contract is pinned by ts/test/lsp.test.ts and go/lsp/serve_test.go -->
```lua
vim.filetype.add({ extension = { aontu = 'aontu' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'aontu',
  callback = function(args)
    vim.lsp.start({
      name = 'aontu',
      cmd = { 'aontu', 'lsp' },        -- or { 'node', '/abs/path/ts/bin/aontu-lsp.js' }
      root_dir = vim.fs.dirname(args.file),
    })
  end,
})
```

The shipped [vim plugin](../../editors/vim/) registers the same
filetype and adds syntax highlighting.

## JetBrains IDEs

A JetBrains IDE needs no plugin of aontu's own. The
[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) plugin
connects one to any language server, and takes a server's settings
from a template directory. The shipped
[template](../../editors/jetbrains/) is that directory. In `Settings`,
open `Languages & Frameworks`, then `Language Servers (LSP4IJ)`. Click
`+`, then `Import template...`, and select the directory.

To wire it by hand, the New Language Server dialog wants two things.
Its `Server` tab takes the command, `aontu lsp`. Its `Mappings` tab
takes the filename pattern `*.aontu`, with the language id `aontu`.
On Windows the command is `cmd /C aontu lsp`, since the plugin starts
a command without a shell. The template's
[README](../../editors/jetbrains/README.md) covers syntax
highlighting.

## Any LSP client

Configure a server whose command is `aontu` with the argument `lsp`
(or `node …/aontu-lsp.js`), transport stdio, document selector the
`aontu` language / `*.aontu` glob. No initialization options are
required. One is available: hover provenance, which appends to each
hover the contributions record `aontu model why` prints: ask for it and
pay a second evaluation per hover, or leave it off and pay nothing
([LSP hover provenance](../reference-api.md#lsp-hover-provenance)):

<!-- test: skip editor initialization sample; the hover surface is pinned by ts/test/lsp.test.ts -->
```json
{ "initializationOptions": { "aontu": { "provenance": true } } }
```

What you will and will not see: the server flags contradictions,
unresolved references and unknown constructs, and stays silent on
schemas and partial documents: non-concrete is valid, so your
half-written model does not light up red
([how diagnostics are
computed](../lsp.md#how-diagnostics-are-computed)).

The full reference (architecture, both library APIs, the protocol
surface) is [the LSP page](../lsp.md). The same contributions record
the hover option shows is yours at the command line with
[explain a value](explain-a-value.md).
