/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
)

func lspFrame(payload string) string {
	return fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(payload), payload)
}

// `aontu lsp` is the language server: one initialize round trip
// through the CLI's dispatch, then the arguments it refuses.
func TestLspVerbRunsTheServer(t *testing.T) {
	in := strings.NewReader(
		lspFrame(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`) +
			lspFrame(`{"jsonrpc":"2.0","id":2,"method":"shutdown"}`) +
			lspFrame(`{"jsonrpc":"2.0","method":"exit"}`))
	var out, errw bytes.Buffer
	if code := run([]string{"lsp"}, in, &out, &errw, false); 0 != code {
		t.Fatalf("code %d err %q", code, errw.String())
	}
	if !strings.Contains(out.String(), `"serverInfo"`) || !strings.Contains(out.String(), "Content-Length:") {
		t.Fatalf("no initialize answer: %q", out.String())
	}
	out.Reset()
	if code := run([]string{"lsp", "--help"}, strings.NewReader(""), &out, &errw, false); 0 != code || !strings.Contains(out.String(), "aontu lsp") {
		t.Fatalf("help: code %d out %q", code, out.String())
	}
	errw.Reset()
	if code := run([]string{"lsp", "extra"}, strings.NewReader(""), &out, &errw, false); 2 != code || !strings.Contains(errw.String(), "lsp takes no arguments") {
		t.Fatalf("argument: code %d err %q", code, errw.String())
	}
}

// `aontu mcp` is the npm build's server; this build says so.
func TestMcpVerbSaysWhereTheServerIs(t *testing.T) {
	var out, errw bytes.Buffer
	if code := run([]string{"mcp", "--root", "."}, strings.NewReader(""), &out, &errw, false); 2 != code || !strings.Contains(errw.String(), "part of the npm build") {
		t.Fatalf("code %d err %q", code, errw.String())
	}
	if code := run([]string{"mcp", "--help"}, strings.NewReader(""), &out, &errw, false); 0 != code || !strings.Contains(out.String(), "aontu mcp") {
		t.Fatalf("help: code %d out %q", code, out.String())
	}
}
