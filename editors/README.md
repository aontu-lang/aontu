# Aontu editor integrations

Editor plugins that connect to the Aontu language server (`aontu lsp`) for
diagnostics, hover and completion on `.aontu` files. All language intelligence lives in the server: see
[`docs/lsp.md`](../docs/lsp.md); these plugins are thin clients.

| Editor | Directory | LSP | Syntax |
|--------|-----------|-----|--------|
| VS Code | [`vscode/`](vscode/) | ✓ (vscode-languageclient) | ✓ |
| Emacs | [`emacs/`](emacs/) | ✓ (Eglot & lsp-mode) | ✓ |
| Vim / Neovim | [`vim/`](vim/) | ✓ (Neovim built-in) | ✓ |
| JetBrains IDEs | [`jetbrains/`](jetbrains/) | ✓ (LSP4IJ) | ✓ (TextMate bundle) |

Syntax highlighting for VS Code comes from
[`grammar/aontu.tmLanguage.json`](../grammar/aontu.tmLanguage.json), the
published TextMate grammar: the same file aontu.dev loads into Shiki, so
the docs and the editor colour a source identically. The extension carries
a copy of it (`syntaxes/`, written by `npm run sync-grammar`) because a VS
Code grammar path cannot leave the extension root; `ts/test/grammar.test.ts`
holds the copy to the original. Vim and Emacs keep their own native syntax
files, which the table above counts. A JetBrains IDE reads the VS Code
directory itself as a TextMate bundle, so that client carries no grammar
and is two files: a template for the LSP4IJ plugin and its README.

Each subdirectory has its own README with install and configuration. All
default to launching `aontu lsp` from `PATH` (`npm install -g aontu`, or
any install channel), and all allow overriding the command to run the
server from a checkout (`node .../ts/bin/aontu-lsp.js`) or a Go build.
