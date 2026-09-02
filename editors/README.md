# Aontu editor integrations

Editor plugins that connect to the Aontu language server (`aontu-lsp`) for
diagnostics, hover and completion on `.aon` (preferred) and `.aontu`
files. All language intelligence lives in the server — see
[`docs/lsp.md`](../docs/lsp.md); these plugins are thin clients.

| Editor | Directory | LSP | Syntax |
|--------|-----------|-----|--------|
| VS Code | [`vscode/`](vscode/) | ✓ (vscode-languageclient) | ✓ |
| Emacs | [`emacs/`](emacs/) | ✓ (Eglot & lsp-mode) | ✓ |
| Vim / Neovim | [`vim/`](vim/) | ✓ (Neovim built-in) | ✓ |

Syntax highlighting for VS Code comes from
[`grammar/aontu.tmLanguage.json`](../grammar/aontu.tmLanguage.json), the
published TextMate grammar — the same file aontu.dev loads into Shiki, so
the docs and the editor colour a source identically. The extension carries
a copy of it (`syntaxes/`, written by `npm run sync-grammar`) because a VS
Code grammar path cannot leave the extension root; `ts/test/grammar.test.ts`
holds the copy to the original. Vim and Emacs keep their own native syntax
files, which the table above counts.

Each subdirectory has its own README with install and configuration. All
default to launching `aontu-lsp` from `PATH` (`npm install -g aontu`), and
all allow overriding the command to run the server from a checkout
(`node .../ts/dist/lsp-server.js`) or the Go binary.
