/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE SERVERS AS VERBS (the Go side of ts/src/cli.ts): `aontu lsp`
// runs the language server over the CLI's own streams, so the one
// binary on PATH is the editor's server too, and a version manager
// (docs/design/ENV.0.md) has one thing to resolve. The standalone
// aontu-lsp binary (cmd/aontu-lsp) runs the same function. `aontu mcp`
// is the npm build's: the verb is in both builds so that the help text
// is one text, and this build says where the server is.

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
