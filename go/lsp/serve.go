/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Serve runs the language server over the given streams: LSP, which
// is JSON-RPC with Content-Length framing, read from in and written
// to out, with the log on logw, until the client says exit or the
// input ends; it returns the process exit code. `aontu lsp` and the
// standalone aontu-lsp binary both run this, and the streams are
// parameters so that a test can drive it with in-memory pipes.
func Serve(in io.Reader, out io.Writer, logw io.Writer) int {
	r := bufio.NewReader(in)
	w := bufio.NewWriter(out)
	h := NewHandler()

	for {
		body, err := readMessage(r)
		if err != nil {
			if err == io.EOF {
				break
			}
			fmt.Fprintln(logw, "aontu lsp: read error:", err)
			break
		}

		var msg Message
		if jerr := json.Unmarshal(body, &msg); jerr != nil {
			fmt.Fprintln(logw, "aontu lsp: bad message:", jerr)
			continue
		}

		for _, o := range h.Handle(msg) {
			if werr := writeMessage(w, o); werr != nil {
				fmt.Fprintln(logw, "aontu lsp: write error:", werr)
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
func writeMessage(w *bufio.Writer, o Out) error {
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
