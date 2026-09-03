/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/aontu-lang/aontu/go/lsp"
)

// The standalone binary is the library's Serve and nothing else; the
// server itself is tested in go/lsp/serve_test.go, and `aontu lsp` in
// go/cmd/aontu/lsp_test.go. This pins the one fact the binary owns:
// an input that ends without a shutdown is exit 1, as main reports.
func TestStandaloneIsTheLibrary(t *testing.T) {
	var out, logb bytes.Buffer
	if code := lsp.Serve(strings.NewReader(""), &out, &logb); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
}
