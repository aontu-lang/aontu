/* Copyright (c) 2025 Richard Rodger, MIT License */

// Command aontu-lsp is the standalone Aontu language server: the same
// server `aontu lsp` runs, kept as a binary of its own for the editor
// configurations that name it. It speaks LSP over stdio (JSON-RPC
// with Content-Length framing) and reports unification diagnostics as
// you edit `.aon` files.
//
// The binary is nothing but the call: the loop and the protocol live
// in the library github.com/aontu-lang/aontu/go/lsp (Serve, Handler,
// Diagnostics). Editors launch it with no arguments:
//
//	aontu-lsp
//
// See docs/lsp.md for editor configuration.
package main

import (
	"os"

	"github.com/aontu-lang/aontu/go/lsp"
)

func main() { //coverage:ignore run under GOCOVERDIR by `make cov-go`
	os.Exit(lsp.Serve(os.Stdin, os.Stdout, os.Stderr))
}
