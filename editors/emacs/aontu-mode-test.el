;;; aontu-mode-test.el --- Indentation tests -*- lexical-binding: t; -*-

(require 'ert)
(require 'aontu-mode)

(ert-deftest aontu-indent-implicit-path-map ()
  (with-temp-buffer
    (aontu-mode)
    (insert "main: kit: info: {\ntitle?: string\nversion?: string\n}\n")
    (indent-region (point-min) (point-max))
    (should (equal (buffer-string)
                   "main: kit: info: {\n  title?: string\n  version?: string\n}\n"))
    (let ((once (buffer-string)))
      (indent-region (point-min) (point-max))
      (should (equal once (buffer-string))))))

(ert-deftest aontu-indent-tab-in-unfinished-map ()
  (with-temp-buffer
    (aontu-mode)
    (insert "main: kit: info: {\ntitle?: string\nversion?: string")
    (goto-char (point-min))
    (forward-line 1)
    (save-window-excursion
      (switch-to-buffer (current-buffer))
      (execute-kbd-macro (kbd "TAB")))
    (should (= (current-column) 2))
    (should (equal (buffer-string)
                   "main: kit: info: {\n  title?: string\nversion?: string"))
    (indent-region (point-min) (point-max))
    (should (equal (buffer-string)
                   "main: kit: info: {\n  title?: string\n  version?: string"))))

(ert-deftest aontu-indent-tab-after-map-opener ()
  (with-temp-buffer
    (aontu-mode)
    (insert "long_field_name: {\n")
    (indent-for-tab-command)
    (should (equal (buffer-string) "long_field_name: {\n  "))
    (indent-for-tab-command)
    (should (= (current-column) 2))))

(ert-deftest aontu-indent-nested-containers ()
  (with-temp-buffer
    (aontu-mode)
    (insert "root: {\nitems: [\n{\nvalue: upper(\n'name'\n)\n}\n]\n}\ntail: 1\n")
    (indent-region (point-min) (point-max))
    (should
     (equal (buffer-string)
            "root: {\n  items: [\n    {\n      value: upper(\n        'name'\n      )\n    }\n  ]\n}\ntail: 1\n"))))

(ert-deftest aontu-indent-ignores-string-and-comment-braces ()
  (dolist (value '("\"{\"" "'{'" "`{`" "1 # {" "1 // {" "1 /* { */"))
    (with-temp-buffer
      (aontu-mode)
      (insert "root: {\nvalue: " value "\nnext: 2\n}\n")
      (indent-region (point-min) (point-max))
      (should (equal (buffer-string)
                     (concat "root: {\n  value: " value "\n  next: 2\n}\n"))))))

(ert-deftest aontu-indent-preserves-multiline-string-content ()
  (with-temp-buffer
    (aontu-mode)
    (insert "root: {\ntext: `first\n    { literal\nlast`\nnext: 1\n}\n")
    (indent-region (point-min) (point-max))
    (should (equal (buffer-string)
                   "root: {\n  text: `first\n    { literal\nlast`\n  next: 1\n}\n"))))

(ert-deftest aontu-indent-preserves-point-in-content ()
  (with-temp-buffer
    (aontu-mode)
    (insert "root: {\nvalue: 1")
    (backward-char 3)
    (indent-for-tab-command)
    (should (= (current-column) 7))
    (should (eq (char-after) ?:))))

(ert-deftest aontu-indent-newline ()
  (with-temp-buffer
    (aontu-mode)
    (insert "main: kit: info: {")
    (newline-and-indent)
    (should (equal (buffer-string) "main: kit: info: {\n  "))))

;;; aontu-mode-test.el ends here
