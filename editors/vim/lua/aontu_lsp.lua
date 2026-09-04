-- Aontu language-server launcher for Neovim's built-in LSP client.
-- Started from plugin/aontu.vim on `FileType aontu`.

local M = {}

function M.start()
  local cmd = vim.g.aontu_lsp_cmd or { "aontu", "lsp" }
  vim.lsp.start({
    name = "aontu",
    cmd = cmd,
    root_dir = vim.fs.dirname(vim.api.nvim_buf_get_name(0)),
  })
end

return M
