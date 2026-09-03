---
description: Connect `aontu-lsp` to VS Code, Neovim, or any LSP client for diagnostics as you type.
group: run-embed
order: 90
---

# Wire your editor

Both implementations ship `aontu-lsp`, a Language Server Protocol
server that reports unification problems as diagnostics while you
type, with hover and completion beside them. Ready-made plugins for
VS Code, Emacs and Vim/Neovim live in [`editors/`](../../editors/),
each a thin client that launches the binary, with install steps in
its README. The recipes below are for wiring a client yourself.

The facts every client needs: the command is `aontu-lsp`, the
transport is stdio, and the document selector is the `aontu` language
(`.aon` is the preferred extension, `.aontu` also works, `.jsonic` is
retired). The server has no configuration options.

Get the binary with `npm install -g aontu` (the package ships
`aontu-lsp` beside `aontu`), or build the Go one with
`go build -o aontu-lsp ./cmd/aontu-lsp` inside `go/`. The two are
interchangeable from a client's point of view
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
  const serverModule = '/abs/path/to/aontu/ts/bin/aontu-lsp.js' // or the Go binary
  const client = new LanguageClient(
    'aontu',
    'Aontu',
    {
      run:   { module: serverModule, transport: TransportKind.stdio },
      debug: { module: serverModule, transport: TransportKind.stdio },
    },
    { documentSelector: [{ scheme: 'file', language: 'aontu' }] },
  )
  client.start()
}
```

For the Go binary, use
`{ command: '/abs/path/to/aontu-lsp', transport: TransportKind.stdio }`
instead of `module`.

## Neovim (built-in LSP)

<!-- test: skip Neovim configuration; the server contract is pinned by ts/test/lsp.test.ts and go/cmd/aontu-lsp/main_test.go -->
```lua
vim.filetype.add({ extension = { aon = 'aontu', aontu = 'aontu' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'aontu',
  callback = function(args)
    vim.lsp.start({
      name = 'aontu-lsp',
      cmd = { 'aontu-lsp' },           -- or { 'node', '/abs/path/ts/bin/aontu-lsp.js' }
      root_dir = vim.fs.dirname(args.file),
    })
  end,
})
```

The filetype registration covers both extensions; the shipped
[vim plugin](../../editors/vim/) does the same and adds syntax
highlighting.

## Any LSP client

Configure a server whose command is `aontu-lsp` (or
`node …/aontu-lsp.js`), transport stdio, document selector the
`aontu` language / `*.aon` glob. No initialization options are
required. One is available: hover provenance, which appends to each
hover the contributions record `aontu why` prints—ask for it and
pay a second evaluation per hover, or leave it off and pay nothing
([LSP hover provenance](../reference-api.md#lsp-hover-provenance)):

<!-- test: skip editor initialization sample; the hover surface is pinned by ts/test/lsp.test.ts -->
```json
{ "initializationOptions": { "aontu": { "provenance": true } } }
```

What you will and will not see: the server flags contradictions,
unresolved references and unknown constructs, and stays silent on
schemas and partial documents—non-concrete is valid, so your
half-written model does not light up red
([how diagnostics are
computed](../lsp.md#how-diagnostics-are-computed)).

The full reference (architecture, both library APIs, the protocol
surface) is [the LSP page](../lsp.md). The same contributions record
the hover option shows is yours at the command line with
[explain a value](explain-a-value.md).
