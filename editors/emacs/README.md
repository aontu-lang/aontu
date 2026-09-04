# Aontu for Emacs

`aontu-mode` — a major mode for Aontu source files (`.aon`, `.aontu`) with
syntax highlighting and language-server integration (diagnostics, hover,
completion) for both **Eglot** and **lsp-mode**.

## Install

Put `aontu-mode.el` on your `load-path` and require it:

```elisp
(add-to-list 'load-path "/abs/path/to/aontu/editors/emacs")
(require 'aontu-mode)
```

Or with `use-package` and a local path:

```elisp
(use-package aontu-mode
  :load-path "/abs/path/to/aontu/editors/emacs"
  :mode (("\\.aon\\'" . aontu-mode) ("\\.aontu\\'" . aontu-mode)))
```

## Language server

Ensure `aontu` is on your `exec-path`; the server is its `lsp` verb:

```sh
npm install -g aontu      # or any install channel
```

…or customise the command (e.g. to run from a checkout):

```elisp
(setq aontu-lsp-command '("node" "/abs/path/to/aontu/ts/dist/lsp-server.js"))
;; or the Go binary:
(setq aontu-lsp-command '("/abs/path/to/aontu" "lsp"))
```

Then, in a `.aon` buffer:

- **Eglot** (Emacs 29+): `M-x eglot`
- **lsp-mode**: `M-x lsp`

Both are registered automatically when loaded. See
[`docs/lsp.md`](../../docs/lsp.md) for what the server provides.
