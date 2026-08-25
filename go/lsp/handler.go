/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"net/url"
	"strings"

	aontu "github.com/rjrodger/aontu/go"
)

// Version is reported to the client in the initialize response. It is
// the ENGINE's version, not a number of the server's own: a separately
// maintained one drifts, and had -- the server answered 0.1.0 against
// a module at 0.1.10, so a client could not tell which engine it was
// talking to (status-2026-08-21.md section 10).
const Version = aontu.VERSION

// Message is an incoming JSON-RPC message (request or notification). ID
// is kept raw because JSON-RPC ids may be either a number or a string;
// notifications omit it.
type Message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Out is an outgoing JSON-RPC message. Result uses json.RawMessage so a
// success response can carry an explicit `null` (omitempty drops only a
// genuinely absent result, e.g. on notifications and error responses).
type Out struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RespError      `json:"error,omitempty"`
}

// RespError is a JSON-RPC error object.
type RespError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func newResponse(id json.RawMessage, result any) Out {
	raw, err := json.Marshal(result) // nil result marshals to "null"
	if err != nil {
		raw = []byte("null")
	}
	return Out{JSONRPC: "2.0", ID: id, Result: raw}
}

func newError(id json.RawMessage, code int, msg string) Out {
	return Out{JSONRPC: "2.0", ID: id, Error: &RespError{Code: code, Message: msg}}
}

func newNotification(method string, params any) Out {
	raw, err := json.Marshal(params)
	if err != nil {
		raw = []byte("null")
	}
	return Out{JSONRPC: "2.0", Method: method, Params: raw}
}

// Handler implements the Aontu LSP message flow without any transport: it
// consumes decoded Messages and returns the Outs to send back. It tracks
// open document text and recomputes diagnostics on open/change/close. A
// single Handler is not safe for concurrent use; drive it from one
// goroutine (as the stdio server does).
type Handler struct {
	docs       map[string]string
	shutdownOK bool
	exit       bool

	// trust is the profile evaluation runs under (G5, docs/trust.md):
	// workspace-root confinement by default, set from the initialize
	// params. An initializationOptions.aontu.trust.include of "system",
	// "none" or {root: dir} widens or narrows it explicitly. Nil — no
	// workspace root and no explicit option — falls back to today's
	// unconfined behaviour, which single-file sessions rely on. The
	// same rule as the canonical port's LspHandler (ts/src/lsp.ts).
	trust *aontu.TrustOptions

	// provenance is hover provenance (G7 phase 7): off unless an
	// editor asks for it with initializationOptions.aontu.provenance.
	// It costs a second, instrumented evaluation per hover, which is a
	// cost to opt into. The same rule as the canonical port.
	provenance bool
}

// NewHandler returns a ready Handler with no open documents.
func NewHandler() *Handler {
	return &Handler{docs: map[string]string{}}
}

// ShouldExit reports whether an `exit` notification has been received and
// the server loop should stop.
func (h *Handler) ShouldExit() bool { return h.exit }

// ExitCode is the process exit code per the LSP spec: 0 if `shutdown`
// preceded `exit`, otherwise 1.
func (h *Handler) ExitCode() int {
	if h.shutdownOK {
		return 0
	}
	return 1
}

// Doc returns the current text of an open document and whether it is open.
func (h *Handler) Doc(uri string) (string, bool) {
	t, ok := h.docs[uri]
	return t, ok
}

// Handle processes one incoming message and returns zero or more messages
// to send. Notifications produce only notifications (e.g.
// publishDiagnostics); requests produce exactly one response.
func (h *Handler) Handle(m Message) []Out {
	switch m.Method {
	case "initialize":
		h.trust = trustFromInitialize(m.Params)
		h.provenance = provenanceFromInitialize(m.Params)
		return []Out{newResponse(m.ID, initializeResult())}

	case "initialized":
		return nil

	case "shutdown":
		h.shutdownOK = true
		return []Out{newResponse(m.ID, nil)} // result: null

	case "exit":
		h.exit = true
		return nil

	case "textDocument/didOpen":
		var p struct {
			TextDocument struct {
				URI  string `json:"uri"`
				Text string `json:"text"`
			} `json:"textDocument"`
		}
		if err := json.Unmarshal(m.Params, &p); err != nil {
			return nil
		}
		h.docs[p.TextDocument.URI] = p.TextDocument.Text
		return []Out{h.publish(p.TextDocument.URI)}

	case "textDocument/didChange":
		var p struct {
			TextDocument struct {
				URI string `json:"uri"`
			} `json:"textDocument"`
			ContentChanges []struct {
				Text string `json:"text"`
			} `json:"contentChanges"`
		}
		if err := json.Unmarshal(m.Params, &p); err != nil || len(p.ContentChanges) == 0 {
			return nil
		}
		// Full document sync: the last change holds the entire new text.
		h.docs[p.TextDocument.URI] = p.ContentChanges[len(p.ContentChanges)-1].Text
		return []Out{h.publish(p.TextDocument.URI)}

	case "textDocument/didClose":
		var p struct {
			TextDocument struct {
				URI string `json:"uri"`
			} `json:"textDocument"`
		}
		if err := json.Unmarshal(m.Params, &p); err != nil {
			return nil
		}
		delete(h.docs, p.TextDocument.URI)
		// Clear diagnostics for the closed document.
		return []Out{publishDiagnosticsMsg(p.TextDocument.URI, []Diagnostic{})}

	case "textDocument/hover":
		var p struct {
			TextDocument struct {
				URI string `json:"uri"`
			} `json:"textDocument"`
			Position struct {
				Line      int `json:"line"`
				Character int `json:"character"`
			} `json:"position"`
		}
		if err := json.Unmarshal(m.Params, &p); err != nil {
			return []Out{newResponse(m.ID, nil)}
		}
		text, ok := h.docs[p.TextDocument.URI]
		if !ok {
			return []Out{newResponse(m.ID, nil)}
		}
		return []Out{newResponse(m.ID,
			Hover(text, p.Position.Line, p.Position.Character, h.provenance))}

	case "textDocument/completion":
		return []Out{newResponse(m.ID, Completions())}

	default:
		// Unknown request (has an id): reply method-not-found. Unknown
		// notification: ignore.
		if len(m.ID) > 0 {
			return []Out{newError(m.ID, -32601, "method not found: "+m.Method)}
		}
		return nil
	}
}

// publish computes and wraps diagnostics for an open document.
func (h *Handler) publish(uri string) Out {
	return publishDiagnosticsMsg(uri, DiagnosticsTrust(h.docs[uri], nil, h.trust))
}

// provenanceFromInitialize reads the hover-provenance opt-in out of
// the initialize params: initializationOptions.aontu.provenance, and
// only the boolean true turns it on.
func provenanceFromInitialize(params json.RawMessage) bool {
	var p struct {
		InitializationOptions struct {
			Aontu struct {
				Provenance bool `json:"provenance"`
			} `json:"aontu"`
		} `json:"initializationOptions"`
	}
	if err := json.Unmarshal(params, &p); nil != err {
		return false
	}
	return p.InitializationOptions.Aontu.Provenance
}

// trustFromInitialize reads the trust profile out of the initialize
// params: an explicit initializationOptions.aontu.trust.include wins;
// otherwise the workspace root (workspaceFolders[0], rootUri, rootPath,
// in that order) confines evaluation below it; otherwise nil.
func trustFromInitialize(raw json.RawMessage) *aontu.TrustOptions {
	var p struct {
		RootURI  string `json:"rootUri"`
		RootPath string `json:"rootPath"`
		Folders  []struct {
			URI string `json:"uri"`
		} `json:"workspaceFolders"`
		InitializationOptions struct {
			Aontu struct {
				Trust struct {
					Include json.RawMessage `json:"include"`
				} `json:"trust"`
			} `json:"aontu"`
		} `json:"initializationOptions"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil
	}

	if explicit := p.InitializationOptions.Aontu.Trust.Include; 0 < len(explicit) {
		var name string
		if nil == json.Unmarshal(explicit, &name) {
			switch name {
			case "none":
				return &aontu.TrustOptions{IncludeNone: true}
			case "system":
				return nil
			}
		}
		var rooted struct {
			Root string `json:"root"`
		}
		if nil == json.Unmarshal(explicit, &rooted) && "" != rooted.Root {
			return &aontu.TrustOptions{IncludeRoot: rooted.Root}
		}
		// An unrecognised explicit value confines to nothing rather
		// than silently widening: deny is the safe reading of a
		// setting the server does not understand.
		return &aontu.TrustOptions{IncludeNone: true}
	}

	root := uriToPath(p.RootURI)
	if 0 < len(p.Folders) {
		if folder := uriToPath(p.Folders[0].URI); "" != folder {
			root = folder
		}
	}
	if "" == root && "" != p.RootPath {
		root = p.RootPath
	}
	if "" != root {
		return &aontu.TrustOptions{IncludeRoot: root}
	}
	return nil
}

// uriToPath is a file:// uri's filesystem path, percent-decoded; a
// non-file uri (or none) yields "".
func uriToPath(uri string) string {
	if !strings.HasPrefix(uri, "file://") {
		return ""
	}
	path := uri[len("file://"):]
	if decoded, err := url.PathUnescape(path); err == nil {
		path = decoded
	}
	return path
}

func publishDiagnosticsMsg(uri string, diags []Diagnostic) Out {
	return newNotification("textDocument/publishDiagnostics", map[string]any{
		"uri":         uri,
		"diagnostics": diags,
	})
}

// initializeResult advertises the server capabilities: full-text document
// sync (open/change/close) feeding diagnostics.
func initializeResult() map[string]any {
	return map[string]any{
		"capabilities": map[string]any{
			// 1 = TextDocumentSyncKind.Full
			"textDocumentSync":   1,
			"hoverProvider":      true,
			"completionProvider": map[string]any{},
		},
		"serverInfo": map[string]any{
			"name":    "aontu-lsp",
			"version": Version,
		},
	}
}
