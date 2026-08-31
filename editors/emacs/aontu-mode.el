;;; aontu-mode.el --- Major mode and LSP client for Aontu  -*- lexical-binding: t; -*-

;; Copyright (c) 2025 Richard Rodger, MIT License

;; Author: Richard Rodger
;; URL: https://github.com/rjrodger/aontu
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1"))
;; Keywords: languages, aontu

;;; Commentary:

;; Major mode for editing Aontu (https://github.com/rjrodger/aontu)
;; source files (`.aon', also `.aontu'), with optional integration with
;; the Aontu language server (`aontu-lsp') for diagnostics, hover and
;; completion.
;;
;; LSP integration works with both Eglot (built into Emacs 29+) and
;; lsp-mode; both are wired up automatically when present.  To start the
;; server in a buffer, run `M-x eglot' (or `M-x lsp').  Ensure `aontu-lsp'
;; is on your `exec-path' (e.g. `npm install -g aontu'), or customise
;; `aontu-lsp-command'.

;;; Code:

(defgroup aontu nil
  "Support for the Aontu structure-unifier language."
  :group 'languages
  :prefix "aontu-")

(defcustom aontu-lsp-command '("aontu-lsp")
  "Command (program and arguments) that launches the Aontu language server."
  :type '(repeat string)
  :group 'aontu)

(defvar aontu-mode-syntax-table
  (let ((table (make-syntax-table)))
    ;; `#' starts a line comment, newline ends it.
    (modify-syntax-entry ?# "<" table)
    (modify-syntax-entry ?\n ">" table)
    ;; Strings.
    (modify-syntax-entry ?\" "\"" table)
    ;; Treat these as symbol constituents so refs like $.a.b read well.
    (modify-syntax-entry ?$ "_" table)
    (modify-syntax-entry ?. "_" table)
    (modify-syntax-entry ?_ "_" table)
    table)
  "Syntax table for `aontu-mode'.")

(defconst aontu-font-lock-keywords
  (let ((kinds '("string" "number" "float" "integer" "boolean" "top" "nil"))
        (literals '("true" "false" "null"))
        (funcs '("upper" "lower" "copy" "key" "pref" "super"
                 "type" "hide" "move" "path" "close" "open"
                 "map" "list")))
    `(;; Scalar-kind keywords.
      (,(regexp-opt kinds 'symbols) . font-lock-type-face)
      ;; Literals.
      (,(regexp-opt literals 'symbols) . font-lock-constant-face)
      ;; Built-in functions, when called.
      (,(concat "\\_<" (regexp-opt funcs t) "\\_>\\s-*(")
       1 font-lock-builtin-face)
      ;; References: $.a.b, .x, $name.
      ("\\(\\$\\|\\.\\)[A-Za-z0-9_.]*" . font-lock-variable-name-face)
      ;; Preference/default marker.
      ("\\*" . font-lock-negation-char-face)))
  "Font-lock highlighting for `aontu-mode'.")

;;;###autoload
(define-derived-mode aontu-mode prog-mode "Aontu"
  "Major mode for editing Aontu source files."
  :syntax-table aontu-mode-syntax-table
  (setq-local comment-start "# ")
  (setq-local comment-start-skip "#+\\s-*")
  (setq-local comment-end "")
  (setq-local font-lock-defaults '(aontu-font-lock-keywords))
  (setq-local indent-tabs-mode nil))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.aon\\'" . aontu-mode))
;;;###autoload
(add-to-list 'auto-mode-alist '("\\.aontu\\'" . aontu-mode))

;; --- Eglot integration (Emacs 29+ / eglot package) -------------------
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               `(aontu-mode . ,aontu-lsp-command)))

;; --- lsp-mode integration -------------------------------------------
(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(aontu-mode . "aontu"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection (lambda () aontu-lsp-command))
    :activation-fn (lsp-activate-on "aontu")
    :server-id 'aontu-lsp)))

(provide 'aontu-mode)
;;; aontu-mode.el ends here
