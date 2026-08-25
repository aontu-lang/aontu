# Aontu for Vim / Neovim

Filetype detection, syntax highlighting, and (Neovim) language-server
integration for Aontu source files (`.aon`, `.aontu`).

## Install

Copy this directory onto your runtime path, or point a plugin manager at
it.

- **Neovim (built-in package)**:
  ```sh
  mkdir -p ~/.config/nvim/pack/aontu/start
  ln -s /abs/path/to/aontu/editors/vim ~/.config/nvim/pack/aontu/start/aontu
  ```
- **vim-plug**:
  ```vim
  Plug '/abs/path/to/aontu/editors/vim'
  ```
- **lazy.nvim**:
  ```lua
  { dir = "/abs/path/to/aontu/editors/vim" }
  ```

## Language server (Neovim)

Ensure `aontu-lsp` is on your `PATH` (`npm install -g aontu`). On Windows
that entry point is the shim `aontu-lsp.cmd`, and an LSP client that
spawns without a shell cannot execute it — name `aontu-lsp.cmd`
explicitly, or point the command at `node` with the server script as its
argument, as the examples below do. On opening a
`.aon` file the plugin starts the server via Neovim's built-in LSP client.

Customise or disable:

```vim
let g:aontu_lsp_cmd = ['node', '/abs/path/to/aontu/ts/dist/lsp-server.js']  " or the Go binary
let g:aontu_lsp_enable = 0   " disable autostart
```

### Using nvim-lspconfig instead

```lua
local configs = require('lspconfig.configs')
local lspconfig = require('lspconfig')
if not configs.aontu then
  configs.aontu = {
    default_config = {
      cmd = { 'aontu-lsp' },
      filetypes = { 'aontu' },
      root_dir = lspconfig.util.find_git_ancestor,
    },
  }
end
lspconfig.aontu.setup({})
```

## Vim 8 / other clients

This plugin provides filetype detection and syntax only on classic Vim.
Wire `aontu-lsp` into your LSP client of choice (vim-lsp, coc.nvim, ALE)
using its stdio server interface. See [`docs/lsp.md`](../../docs/lsp.md).
