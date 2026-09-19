/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"net/url"
	"strings"
	"unicode/utf8"

	aontu "github.com/aontu-lang/aontu/go"
)

const Version = aontu.VERSION

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
	raw, err := json.Marshal(result)
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

type Handler struct {
	docs       map[string]string
	shutdownOK bool
	exit       bool

	trust *aontu.TrustOptions

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
		return []Out{newResponse(m.ID, HoverTrust(
			text, p.Position.Line, p.Position.Character, h.provenance, h.trust))}

	case "textDocument/completion":
		var p struct {
			TextDocument struct {
				URI string `json:"uri"`
			} `json:"textDocument"`
		}
		if err := json.Unmarshal(m.Params, &p); err != nil {
			return []Out{newResponse(m.ID, Completions(""))}
		}
		return []Out{newResponse(m.ID, Completions(h.docs[p.TextDocument.URI]))}

	case "textDocument/definition":
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
		at := Definition(text, p.Position.Line, p.Position.Character,
			p.TextDocument.URI)
		if nil == at {
			return []Out{newResponse(m.ID, nil)}
		}
		return []Out{newResponse(m.ID, at)}

	case "textDocument/signatureHelp":
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
		help := SignatureHelp(text, p.Position.Line, p.Position.Character)
		if nil == help {
			return []Out{newResponse(m.ID, nil)}
		}
		return []Out{newResponse(m.ID, help)}

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

func trustFromInitialize(raw json.RawMessage) *aontu.TrustOptions {
	var p struct {
		RootURI               json.RawMessage `json:"rootUri"`
		RootPath              json.RawMessage `json:"rootPath"`
		Folders               json.RawMessage `json:"workspaceFolders"`
		InitializationOptions json.RawMessage `json:"initializationOptions"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil
	}

	var opts struct {
		Aontu struct {
			Trust struct {
				Include json.RawMessage `json:"include"`
			} `json:"trust"`
		} `json:"aontu"`
	}
	_ = json.Unmarshal(p.InitializationOptions, &opts)

	if explicit := opts.Aontu.Trust.Include; 0 < len(explicit) {
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

	root := uriToPath(jsonString(p.RootURI))
	var folders []struct {
		URI json.RawMessage `json:"uri"`
	}
	if nil == json.Unmarshal(p.Folders, &folders) && 0 < len(folders) {
		if folder := uriToPath(jsonString(folders[0].URI)); "" != folder {
			root = folder
		}
	}
	if rootPath := jsonString(p.RootPath); "" == root && "" != rootPath {
		root = rootPath
	}
	if "" != root {
		return &aontu.TrustOptions{IncludeRoot: root}
	}
	return nil
}

// jsonString is raw decoded as a JSON string, or "" for absent, null,
// or anything that is not a string. The canonical port spells the same
// rule as `'string' !== typeof uri` (ts/src/lsp.ts).
func jsonString(raw json.RawMessage) string {
	var s string
	if 0 == len(raw) || nil != json.Unmarshal(raw, &s) {
		return ""
	}
	return s
}

func uriToPath(uri string) string {
	if !strings.HasPrefix(uri, "file://") {
		return ""
	}
	path := uri[len("file://"):]
	if decoded, err := url.PathUnescape(path); err == nil &&
		utf8.ValidString(decoded) {
		path = decoded
	}
	if driveLetterPath(path) {
		path = path[1:]
	}
	return path
}

// driveLetterPath reports whether p is "/X:..." for a drive letter X --
// the one shape whose leading slash is uri syntax rather than path.
// Mirrors the same predicate in ts/src/lsp.ts.
func driveLetterPath(p string) bool {
	if len(p) < 3 || '/' != p[0] || ':' != p[2] {
		return false
	}
	c := p[1]
	return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z')
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
			"textDocumentSync":   1,
			"hoverProvider":      true,
			"definitionProvider": true,
			"completionProvider": map[string]any{},
			"signatureHelpProvider": map[string]any{
				"triggerCharacters": []string{"(", ","},
			},
		},
		"serverInfo": map[string]any{
			"name":    "aontu-lsp",
			"version": Version,
		},
	}
}
