/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage for the stdio server's error paths: framing failures, bad
// JSON bodies, and write errors (see docs/test-coverage.md).

package lsp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// A non-EOF read error is logged and stops the loop with exit 1.
func TestServeReadError(t *testing.T) {
	var out, logw bytes.Buffer
	if code := Serve(errReader{}, &out, &logw); code != 1 ||
		!strings.Contains(logw.String(), "read error") {
		t.Fatalf("read error: %d %q", code, logw.String())
	}
}

// A body that is not JSON is logged and skipped.
func TestServeBadJSON(t *testing.T) {
	var out, logw bytes.Buffer
	in := strings.NewReader(frame("{"))
	if code := Serve(in, &out, &logw); code != 1 ||
		!strings.Contains(logw.String(), "bad message") {
		t.Fatalf("bad json: %d %q", code, logw.String())
	}
}

// A failing output stream turns into a write error and exit 1. The
// first response overflows the buffered writer via a second request
// after the sticky flush failure.
func TestServeWriteError(t *testing.T) {
	var logw bytes.Buffer
	in := strings.NewReader(
		frame(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`) +
			frame(`{"jsonrpc":"2.0","id":2,"method":"initialize"}`))
	if code := Serve(in, failWriter{}, &logw); code != 1 ||
		!strings.Contains(logw.String(), "write error") {
		t.Fatalf("write error: %d %q", code, logw.String())
	}
}

// Framing failures: a bad Content-Length value, missing header, and a
// truncated body.
func TestReadMessageFraming(t *testing.T) {
	if _, err := readMessage(bufio.NewReader(strings.NewReader(
		"Content-Length: xyz\r\n\r\n"))); err == nil ||
		!strings.Contains(err.Error(), "invalid Content-Length") {
		t.Fatalf("bad length: %v", err)
	}
	if _, err := readMessage(bufio.NewReader(strings.NewReader(
		"X-Other: 1\r\n\r\n"))); err == nil ||
		!strings.Contains(err.Error(), "missing Content-Length") {
		t.Fatalf("missing header: %v", err)
	}
	if _, err := readMessage(bufio.NewReader(strings.NewReader(
		"Content-Length: 100\r\n\r\n{}"))); err == nil {
		t.Fatalf("truncated body must fail")
	}
}

// writeMessage: an unmarshalable Out (invalid RawMessage) fails before
// any bytes are framed.
func TestWriteMessageMarshalError(t *testing.T) {
	w := bufio.NewWriter(&bytes.Buffer{})
	if err := writeMessage(w, Out{JSONRPC: "2.0", Result: json.RawMessage("{")}); err == nil {
		t.Fatalf("invalid RawMessage must fail to marshal")
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

type failWriter struct{}

func (failWriter) Write([]byte) (int, error) { return 0, errors.New("sink closed") }
