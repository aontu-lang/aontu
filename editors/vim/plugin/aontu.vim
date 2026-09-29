" Aontu language-server autostart for Neovim's built-in LSP client.
"
" For Vim 8 or other LSP clients (vim-lsp, coc.nvim, ALE), configure the
" `aontu-lsp` server manually — see editors/vim/README.md.
"
" Customise the launch command with, e.g.:
"   let g:aontu_lsp_cmd = ['node', '/abs/path/ts/bin/aontu-lsp.js']

if !has('nvim')
  finish
endif
if exists('g:loaded_aontu_lsp')
  finish
endif
let g:loaded_aontu_lsp = 1

if !exists('g:aontu_lsp_enable')
  let g:aontu_lsp_enable = 1
endif
if !exists('g:aontu_lsp_cmd')
  let g:aontu_lsp_cmd = ['aontu-lsp']
endif

if g:aontu_lsp_enable
  augroup aontu_lsp
    autocmd!
    autocmd FileType aontu lua require('aontu_lsp').start()
  augroup END
endif
