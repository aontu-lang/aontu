/* Copyright (c) 2025 Richard Rodger, MIT License */

// Command aontu-lsp is the Aontu Language Server. It speaks LSP over
// stdio (JSON-RPC with Content-Length framing) and reports unification
// diagnostics as you edit `.aontu` files.
//
// This binary is intentionally thin: all protocol logic lives in the
// reusable library github.com/aontu-lang/aontu/go/lsp (Handler +
// Diagnostics). Editors typically launch it with no arguments:
//
//	aontu-lsp
//
// See docs/lsp.md for editor configuration.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/aontu-lang/aontu/go/lsp"
)

func main() { //coverage:ignore run under GOCOVERDIR by `make cov-go`
	os.Exit(serve(os.Stdin, os.Stdout, os.Stderr))
}

// serve runs the LSP read/handle/write loop against the given streams,
// returning the process exit code. It is separated from main so it can be
// driven by tests with in-memory pipes.
func serve(in io.Reader, out io.Writer, logw io.Writer) int {
	r := bufio.NewReader(in)
	w := bufio.NewWriter(out)
	h := lsp.NewHandler()

	for {
		body, err := readMessage(r)
		if err != nil {
			if err == io.EOF {
				break
			}
			fmt.Fprintln(logw, "aontu-lsp: read error:", err)
			break
		}

		var msg lsp.Message
		if jerr := json.Unmarshal(body, &msg); jerr != nil {
			fmt.Fprintln(logw, "aontu-lsp: bad message:", jerr)
			continue
		}

		for _, o := range h.Handle(msg) {
			if werr := writeMessage(w, o); werr != nil {
				fmt.Fprintln(logw, "aontu-lsp: write error:", werr)
				return 1
			}
		}
		w.Flush()

		if h.ShouldExit() {
			break
		}
	}

	return h.ExitCode()
}

// readMessage reads one Content-Length-framed JSON-RPC message body.
func readMessage(r *bufio.Reader) ([]byte, error) {
	contentLength := -1
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break // end of headers
		}
		if name, value, ok := strings.Cut(line, ":"); ok {
			if strings.EqualFold(strings.TrimSpace(name), "Content-Length") {
				n, perr := strconv.Atoi(strings.TrimSpace(value))
				if perr != nil {
					return nil, fmt.Errorf("invalid Content-Length: %q", value)
				}
				contentLength = n
			}
		}
	}
	if contentLength < 0 {
		return nil, fmt.Errorf("missing Content-Length header")
	}
	body := make([]byte, contentLength)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}
	return body, nil
}

// writeMessage frames and writes one outgoing message.
func writeMessage(w *bufio.Writer, o lsp.Out) error {
	body, err := json.Marshal(o)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "Content-Length: %d\r\n\r\n", len(body)); err != nil {
		return err
	}
	_, err = w.Write(body)
	return err
}
