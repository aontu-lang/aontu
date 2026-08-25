/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiagnosticsValidIsEmpty(t *testing.T) {
	for _, src := range []string{
		"a:1 b:2",
		"a:string",          // non-concrete schema is valid
		"a:{b:string, c:1}", // nested schema
		"a:1\nb:$.a",        // resolving reference
		"x:{a:1} & {b:2}",   // map merge
	} {
		if d := Diagnostics(src); len(d) != 0 {
			t.Errorf("expected no diagnostics for %q, got %d: %+v", src, len(d), d)
		}
	}
}

func TestDiagnosticsConflictPosition(t *testing.T) {
	// "a:1\na:2": the conflicting "2" is on line 1 (0-based), char 2.
	d := Diagnostics("a:1\na:2")
	if len(d) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(d), d)
	}
	if d[0].Severity != SeverityError {
		t.Errorf("severity = %d, want %d", d[0].Severity, SeverityError)
	}
	if d[0].Code != "scalar_value" {
		t.Errorf("code = %q, want scalar_value", d[0].Code)
	}
	if d[0].Source != "aontu" {
		t.Errorf("source = %q, want aontu", d[0].Source)
	}
	if got := d[0].Range.Start; got.Line != 1 || got.Character != 2 {
		t.Errorf("start = %+v, want {1 2}", got)
	}
}

func TestDiagnosticsUnknownFunctionPosition(t *testing.T) {
	d := Diagnostics("x:foo(1)")
	if len(d) != 1 || d[0].Code != "unknown_function" {
		t.Fatalf("expected unknown_function, got %+v", d)
	}
	if got := d[0].Range.Start; got.Line != 0 || got.Character != 2 {
		t.Errorf("start = %+v, want {0 2}", got)
	}
}

func TestDiagnosticsMultiByteColumn(t *testing.T) {
	// A multi-byte rune before the error must not shift the column off:
	// LSP characters are UTF-16 units, so "é" counts as 1.
	d := Diagnostics("a:\"é\"\nb:1 b:2")
	if len(d) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(d), d)
	}
	// "b:1 b:2" second "2" is at char 6 on line 1.
	if got := d[0].Range.Start; got.Line != 1 || got.Character != 6 {
		t.Errorf("start = %+v, want {1 6}", got)
	}
}

func mustRaw(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestHandlerInitialize(t *testing.T) {
	h := NewHandler()
	outs := h.Handle(Message{JSONRPC: "2.0", ID: json.RawMessage("1"), Method: "initialize"})
	if len(outs) != 1 {
		t.Fatalf("expected 1 response, got %d", len(outs))
	}
	if string(outs[0].ID) != "1" {
		t.Errorf("response id = %s, want 1", outs[0].ID)
	}
	var res struct {
		Capabilities struct {
			TextDocumentSync int `json:"textDocumentSync"`
		} `json:"capabilities"`
		ServerInfo struct {
			Name string `json:"name"`
		} `json:"serverInfo"`
	}
	if err := json.Unmarshal(outs[0].Result, &res); err != nil {
		t.Fatal(err)
	}
	if res.Capabilities.TextDocumentSync != 1 {
		t.Errorf("textDocumentSync = %d, want 1", res.Capabilities.TextDocumentSync)
	}
	if res.ServerInfo.Name != "aontu-lsp" {
		t.Errorf("serverInfo.name = %q", res.ServerInfo.Name)
	}
}

func TestHandlerDidOpenPublishesDiagnostics(t *testing.T) {
	h := NewHandler()
	params := mustRaw(t, map[string]any{
		"textDocument": map[string]any{
			"uri":  "file:///t.aontu",
			"text": "a:1 a:2",
		},
	})
	outs := h.Handle(Message{JSONRPC: "2.0", Method: "textDocument/didOpen", Params: params})
	if len(outs) != 1 || outs[0].Method != "textDocument/publishDiagnostics" {
		t.Fatalf("expected publishDiagnostics, got %+v", outs)
	}
	var pp struct {
		URI         string       `json:"uri"`
		Diagnostics []Diagnostic `json:"diagnostics"`
	}
	if err := json.Unmarshal(outs[0].Params, &pp); err != nil {
		t.Fatal(err)
	}
	if pp.URI != "file:///t.aontu" {
		t.Errorf("uri = %q", pp.URI)
	}
	if len(pp.Diagnostics) != 1 {
		t.Errorf("expected 1 diagnostic, got %d", len(pp.Diagnostics))
	}
	if _, ok := h.Doc("file:///t.aontu"); !ok {
		t.Error("document not tracked after didOpen")
	}
}

func TestHandlerDidChangeAndClose(t *testing.T) {
	h := NewHandler()
	open := mustRaw(t, map[string]any{
		"textDocument": map[string]any{"uri": "file:///t.aontu", "text": "a:1 a:2"},
	})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})

	// Fix the conflict via didChange -> diagnostics should clear.
	change := mustRaw(t, map[string]any{
		"textDocument":   map[string]any{"uri": "file:///t.aontu"},
		"contentChanges": []map[string]any{{"text": "a:1 b:2"}},
	})
	outs := h.Handle(Message{Method: "textDocument/didChange", Params: change})
	var pp struct {
		Diagnostics []Diagnostic `json:"diagnostics"`
	}
	json.Unmarshal(outs[0].Params, &pp)
	if len(pp.Diagnostics) != 0 {
		t.Errorf("expected cleared diagnostics after fix, got %d", len(pp.Diagnostics))
	}

	// Close -> empty diagnostics and untracked.
	closeP := mustRaw(t, map[string]any{
		"textDocument": map[string]any{"uri": "file:///t.aontu"},
	})
	outs = h.Handle(Message{Method: "textDocument/didClose", Params: closeP})
	if len(outs) != 1 || outs[0].Method != "textDocument/publishDiagnostics" {
		t.Fatalf("expected publishDiagnostics on close, got %+v", outs)
	}
	if _, ok := h.Doc("file:///t.aontu"); ok {
		t.Error("document still tracked after didClose")
	}
}

func TestHandlerShutdownExit(t *testing.T) {
	h := NewHandler()
	if h.ShouldExit() {
		t.Fatal("should not exit initially")
	}
	h.Handle(Message{ID: json.RawMessage("9"), Method: "shutdown"})
	outs := h.Handle(Message{Method: "exit"})
	if len(outs) != 0 {
		t.Errorf("exit should produce no messages, got %d", len(outs))
	}
	if !h.ShouldExit() {
		t.Error("should exit after exit notification")
	}
	if h.ExitCode() != 0 {
		t.Errorf("exit code = %d, want 0 (shutdown before exit)", h.ExitCode())
	}
}

func TestHandlerExitWithoutShutdown(t *testing.T) {
	h := NewHandler()
	h.Handle(Message{Method: "exit"})
	if h.ExitCode() != 1 {
		t.Errorf("exit code = %d, want 1 (no prior shutdown)", h.ExitCode())
	}
}

func TestHandlerUnknownRequest(t *testing.T) {
	h := NewHandler()
	outs := h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/definition"})
	if len(outs) != 1 || outs[0].Error == nil || outs[0].Error.Code != -32601 {
		t.Fatalf("expected method-not-found error, got %+v", outs)
	}
	// Unknown notification (no id) is silently ignored.
	if outs := h.Handle(Message{Method: "$/setTrace"}); len(outs) != 0 {
		t.Errorf("unknown notification should be ignored, got %+v", outs)
	}
}

// --- trust (G5 phase 3): the workspace confinement -------------------

func trustLspWorld(t *testing.T) (dir, root string) {
	t.Helper()
	dir = t.TempDir()
	root = filepath.Join(dir, "root")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "in.aon"),
		[]byte("f: 11"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "secret.aon"),
		[]byte(`secret: "outside"`), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir, root
}

// srcPath spells a path for EMBEDDING IN SOURCE text: inside an @"..."
// include a backslash is an ESCAPE character, so a native Windows path
// interpolated raw is eaten by the lexer. The full note is on the twin
// helper in go/trust_test.go.
func srcPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

// fileURI is the uri a real editor sends for a directory: file://,
// then the ABSOLUTE PATH with its own leading slash. On Windows that
// makes three slashes before the drive letter
// (file:///C:/Users/me/project), which is the shape uriToPath has to
// undo. These tests used to build "file://" + path -- two slashes --
// which is not what any client sends and which quietly hid the
// drive-letter defect uriToPath now handles.
func fileURI(p string) string {
	p = srcPath(p)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return "file://" + p
}

// trustParams marshals the initialize params rather than concatenating
// them: a native Windows path pasted into a JSON string literal carries
// \U and \r, which are not valid JSON escapes, so the whole params
// object failed to unmarshal and the handler fell back to unconfined --
// a test that asserted confinement while silently testing its absence.
func trustParams(t *testing.T, params map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func trustInit(t *testing.T, params string) *Handler {
	t.Helper()
	h := NewHandler()
	h.Handle(Message{JSONRPC: "2.0", ID: json.RawMessage("1"),
		Method: "initialize", Params: json.RawMessage(params)})
	return h
}

func trustDiags(t *testing.T, h *Handler, text string) []Diagnostic {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"textDocument": map[string]any{"uri": "file:///d.aon", "text": text},
	})
	if err != nil {
		t.Fatal(err)
	}
	outs := h.Handle(Message{JSONRPC: "2.0",
		Method: "textDocument/didOpen", Params: raw})
	var pub struct {
		Diagnostics []Diagnostic `json:"diagnostics"`
	}
	if err := json.Unmarshal(outs[0].Params, &pub); err != nil {
		t.Fatal(err)
	}
	return pub.Diagnostics
}

func hasCode(diags []Diagnostic, code string) bool {
	for _, d := range diags {
		if code == d.Code {
			return true
		}
	}
	return false
}

func TestTrustLspWorkspaceRootConfines(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, trustParams(t, map[string]any{"rootUri": fileURI(root)}))
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aon"`), "include_denied") {
		t.Fatal("escape not denied")
	}
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("in-root include should resolve")
	}
}

func TestTrustLspWorkspaceFoldersOutrankRootURI(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, trustParams(t, map[string]any{
		"rootUri":          "file:///nowhere",
		"workspaceFolders": []any{map[string]any{"uri": fileURI(root)}},
	}))
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("in-root include should resolve under the folder root")
	}
}

func TestTrustLspRootPathFallback(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, trustParams(t, map[string]any{"rootPath": root}))
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aon"`), "include_denied") {
		t.Fatal("escape not denied under rootPath")
	}
}

func TestTrustLspExplicitOptionWins(t *testing.T) {
	dir, root := trustLspWorld(t)

	// "system" widens even when a workspace root exists.
	wide := trustInit(t, trustParams(t, map[string]any{
		"rootUri": fileURI(root),
		"initializationOptions": map[string]any{
			"aontu": map[string]any{"trust": map[string]any{"include": "system"}}},
	}))
	if 0 != len(trustDiags(t, wide, `a:@"`+srcPath(dir)+`/secret.aon"`)) {
		t.Fatal("explicit system should widen")
	}

	// "none" narrows to nothing.
	none := trustInit(t,
		`{"initializationOptions":{"aontu":{"trust":{"include":"none"}}}}`)
	if !hasCode(trustDiags(t, none, `a:@"`+srcPath(root)+`/in.aon"`), "include_denied") {
		t.Fatal("explicit none should deny")
	}

	// {root} names its own directory.
	rooted := trustInit(t, trustParams(t, map[string]any{
		"initializationOptions": map[string]any{"aontu": map[string]any{
			"trust": map[string]any{
				"include": map[string]any{"root": root}}}},
	}))
	if 0 != len(trustDiags(t, rooted, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("explicit root should allow in-root")
	}

	// An unrecognised explicit value confines to NOTHING rather than
	// silently widening.
	unknown := trustInit(t, `{"initializationOptions":`+
		`{"aontu":{"trust":{"include":{"bogus":1}}}}}`)
	if !hasCode(trustDiags(t, unknown, `a:@"`+srcPath(root)+`/in.aon"`), "include_denied") {
		t.Fatal("unknown explicit value should deny")
	}
}

// A REAL CLIENT'S URI, on both platforms. The three-slash form is what
// every editor sends: file:// then the absolute path, whose own leading
// slash makes the third. On Windows that slash sits before the drive
// letter and is uri syntax, not path -- and stripping only "file://"
// left "/C:/Users/..." for the confinement to compare real paths
// against. The two-slash form these tests used to build kept working
// by accident and is kept here so the accident stays covered.
// The twin is lsp-uri-to-path in ts/test/lsp.test.ts.
func TestUriToPathHandlesDriveLetters(t *testing.T) {
	for _, c := range []struct{ uri, want string }{
		{"file:///tmp/proj", "/tmp/proj"},
		{"file:///C:/Users/me/proj", "C:/Users/me/proj"},
		{"file:///c%3A/Users/me/proj", "c:/Users/me/proj"},
		{"file://C:/Users/me/proj", "C:/Users/me/proj"},
		{"file:///", "/"},
		// NOT a drive letter: the slash stays, because a single-letter
		// directory is an ordinary POSIX path.
		{"file:///C/Users", "/C/Users"},
		{"file:///1:/x", "/1:/x"},
		{"http://example.com/x", ""},
		{"", ""},
		// `file://` alone is no path at all. This port answers "" and
		// trustFromInitialize tests for it; the canonical port has to
		// answer undefined, because its chain uses `??` and '' would
		// survive it (ts/src/lsp.ts).
		{"file://", ""},
		// AN ESCAPE THAT DOES NOT DECODE TO TEXT IS LEFT ALONE, and
		// there are two ways to fail. `%ZZ` is malformed and
		// url.PathUnescape rejects it, where the canonical port's
		// decodeURIComponent THREW a URIError until it was made to
		// swallow it (ts/src/lsp.ts, percentDecode). `%FF` is
		// well-formed and decodes to a raw byte -- a perfectly good
		// Linux filename that a JavaScript string cannot hold, so
		// TypeScript refuses it and this port used to accept it. Two
		// ports, two workspace roots, for a uri a byte-oriented client
		// really sends. They agree on BOTH classes now, and both
		// classes are pinned here so neither can drift back.
		{"file:///%ZZ/x", "/%ZZ/x"},
		{"file:///C:/%ZZ", "C:/%ZZ"},
		{"file:///tmp/%FF", "/tmp/%FF"},
		{"file:///tmp/%e9", "/tmp/%e9"},
		// A well-formed escape that IS text still decodes.
		{"file:///tmp/%C3%A9", "/tmp/é"},
		{"file:///C%3A/x", "C:/x"},
	} {
		if got := uriToPath(c.uri); c.want != got {
			t.Errorf("uriToPath(%q) = %q, want %q", c.uri, got, c.want)
		}
	}
}

func TestTrustLspNoRootStaysUnconfined(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, `{}`)
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("no root, no option: unconfined")
	}
}

// ONE BAD FIELD COSTS THAT FIELD, not the whole trust configuration.
// The params were decoded into typed fields on a single struct, so a
// client sending `"rootUri": 42` failed the Unmarshal outright and the
// session opened UNCONFINED -- failing open on the one surface that
// must not. The canonical port reads each field through its own
// `typeof` guard and confines to rootPath regardless; the twin is
// trust-lsp's malformed-field case in ts/test/trust.test.ts.
func TestTrustLspOneBadFieldDoesNotDiscardTheRest(t *testing.T) {
	_, root := trustLspWorld(t)

	// A rootUri of the wrong TYPE, with a usable rootPath beside it.
	// Marshalled, not spliced: the path is the one part that has to be
	// a correctly escaped JSON string here, and the wrong-typed field
	// is the one part that must not be.
	rootJSON, err := json.Marshal(root)
	if err != nil {
		t.Fatal(err)
	}
	h := trustInit(t, `{"rootUri":42,"rootPath":`+string(rootJSON)+`}`)
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aon"`),
		"include_denied") {
		t.Fatal("a bad rootUri must not discard rootPath: escape not denied")
	}

	// And initializationOptions this server cannot read costs only
	// itself: the workspace root still confines.
	opt := trustInit(t, `{"rootUri":"`+fileURI(root)+
		`","initializationOptions":"not an object"}`)
	if !hasCode(trustDiags(t, opt, `a:@"`+srcPath(root)+`/../secret.aon"`),
		"include_denied") {
		t.Fatal("unreadable initializationOptions must not discard the root")
	}
	if 0 != len(trustDiags(t, opt, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("in-root include should still resolve")
	}
}

func TestTrustLspMalformedInitializeParams(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, `not json`)
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aon"`)) {
		t.Fatal("malformed params fall back to unconfined")
	}
}

// G3 phase 4: the deprecation mark's LSP surface — the native
// Deprecated tag (2) at Hint severity, on the declaration and on every
// use resolving through the value. The TS twin is lsp-deprecated in
// ts/test/lsp.test.ts.
func TestDiagnosticsDeprecated(t *testing.T) {
	d := Diagnostics("p:deprecate(8080,{msg:\"renamed\",use:\"$.listen\",since:\"2.0.0\"})\nq:$.p")
	tagged := []Diagnostic{}
	for _, x := range d {
		if "deprecated" == x.Code {
			tagged = append(tagged, x)
		}
	}
	if 2 != len(tagged) {
		t.Fatalf("expected 2 deprecated diagnostics, got %d: %+v", len(tagged), d)
	}
	for _, x := range tagged {
		if SeverityHint != x.Severity || 1 != len(x.Tags) || 2 != x.Tags[0] {
			t.Fatalf("expected hint severity and tag 2, got %+v", x)
		}
		for _, want := range []string{"renamed", "use $.listen", "since 2.0.0"} {
			if !strings.Contains(x.Message, want) {
				t.Fatalf("expected %q in %q", want, x.Message)
			}
		}
	}

	if d2 := Diagnostics("a:1"); 0 != len(d2) {
		t.Fatalf("expected no diagnostics, got %+v", d2)
	}
}
