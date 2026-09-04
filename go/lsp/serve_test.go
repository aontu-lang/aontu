/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// frame wraps a JSON-RPC payload with the LSP Content-Length header.
func frame(payload string) string {
	return fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(payload), payload)
}

// readFrames decodes all Content-Length-framed messages from r.
func readFrames(t *testing.T, r *bufio.Reader) []map[string]any {
	t.Helper()
	var out []map[string]any
	for {
		body, err := readMessage(r)
		if err != nil {
			break
		}
		var m map[string]any
		if err := json.Unmarshal(body, &m); err != nil {
			t.Fatalf("bad frame: %v", err)
		}
		out = append(out, m)
	}
	return out
}

func TestServeRoundTrip(t *testing.T) {
	var in bytes.Buffer
	in.WriteString(frame(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`))
	in.WriteString(frame(`{"jsonrpc":"2.0","method":"initialized","params":{}}`))
	in.WriteString(frame(`{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///t.aontu","text":"a:1 a:2"}}}`))
	in.WriteString(frame(`{"jsonrpc":"2.0","id":2,"method":"shutdown"}`))
	in.WriteString(frame(`{"jsonrpc":"2.0","method":"exit"}`))

	var out, logb bytes.Buffer
	code := Serve(&in, &out, &logb)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; log: %s", code, logb.String())
	}

	msgs := readFrames(t, bufio.NewReader(&out))
	// Expect: initialize response, publishDiagnostics notification, shutdown response.
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d: %+v", len(msgs), msgs)
	}

	if msgs[0]["id"].(float64) != 1 || msgs[0]["result"] == nil {
		t.Errorf("first message should be initialize response: %+v", msgs[0])
	}

	if msgs[1]["method"] != "textDocument/publishDiagnostics" {
		t.Errorf("second message should be publishDiagnostics: %+v", msgs[1])
	}
	params := msgs[1]["params"].(map[string]any)
	if params["uri"] != "file:///t.aontu" {
		t.Errorf("uri = %v", params["uri"])
	}
	if diags := params["diagnostics"].([]any); len(diags) != 1 {
		t.Errorf("expected 1 diagnostic, got %d", len(diags))
	}

	// shutdown response carries result: null.
	if msgs[2]["id"].(float64) != 2 {
		t.Errorf("third message should be shutdown response: %+v", msgs[2])
	}
	if _, present := msgs[2]["result"]; !present {
		t.Errorf("shutdown response must include result (null): %+v", msgs[2])
	}
}

func TestServeEOFWithoutShutdownExits1(t *testing.T) {
	in := strings.NewReader(frame(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`))
	var out, logb bytes.Buffer
	if code := Serve(in, &out, &logb); code != 1 {
		t.Errorf("exit code = %d, want 1 (EOF without shutdown)", code)
	}
}
