/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"io"

	"github.com/aontu-lang/aontu/go/lsp"
)

func runLsp(argv []string, stdin io.Reader, stdout, stderr io.Writer) int {
	for _, arg := range argv {
		if "-h" == arg || "--help" == arg {
			io.WriteString(stdout, helpText)
			return 0
		}
		io.WriteString(stderr, "aontu: lsp takes no arguments (try --help)\n")
		return 2
	}
	return lsp.Serve(stdin, stdout, stderr)
}

func runMcp(argv []string, stdout, stderr io.Writer) int {
	for _, arg := range argv {
		if "-h" == arg || "--help" == arg {
			io.WriteString(stdout, helpText)
			return 0
		}
	}
	io.WriteString(stderr,
		"aontu: the MCP server is part of the npm build: npm install -g aontu, then aontu mcp\n")
	return 2
}
