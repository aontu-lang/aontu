/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	aontu "github.com/aontu-lang/aontu/go"
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

// Twin: ts/test/lsp.test.ts alias-budget-is-a-diagnostic. The editor
// checks on each keystroke, so a ladder too big to expand is turned
// away here too; evaluating it instead takes tens of seconds.
func TestDiagnosticsAliasBudget(t *testing.T) {
	ladder := []string{"%a0 = 1"}
	for i := 1; i <= 20; i++ {
		ladder = append(ladder, fmt.Sprintf("%%a%d = [%%a%d, %%a%d]", i, i-1, i-1))
	}
	ladder = append(ladder, "out: %a20")

	started := time.Now()
	d := Diagnostics(strings.Join(ladder, "\n"))

	if len(d) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(d), d)
	}
	if d[0].Code != "alias_budget" {
		t.Errorf("code = %q, want alias_budget", d[0].Code)
	}
	if d[0].Severity != SeverityError {
		t.Errorf("severity = %d, want %d", d[0].Severity, SeverityError)
	}
	if el := time.Since(started); 5*time.Second < el {
		t.Errorf("took %v: the ladder was evaluated, not refused", el)
	}
}

// Twin: ts/test/lsp.test.ts completion-offers-the-names-in-scope.
func TestCompletionOffersTheNamesInScope(t *testing.T) {
	src := "%port = integer\n{ %uint8, %b: %remote } = @\"./types.aontu\"\n"
	// A rename binds the LOCAL name: `%b`, not the `%remote` it takes.
	want := []CompletionItem{
		{Label: "%port", Kind: CompletionVariable, Detail: "alias"},
		{Label: "%uint8", Kind: CompletionVariable, Detail: "alias from ./types.aontu"},
		{Label: "%b", Kind: CompletionVariable, Detail: "alias from ./types.aontu"},
	}
	got := namedCompletions(src)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("named completions\n got: %+v\nwant: %+v", got, want)
	}
	// A name that binds more than once is offered once.
	if n := len(namedCompletions("%n = 1\n%n = integer\n")); 1 != n {
		t.Errorf("a redeclared name is offered %d times, want 1", n)
	}
	// The set is what the file binds, so a use alone offers nothing.
	if n := len(namedCompletions("a: %undeclared\n")); 0 != n {
		t.Errorf("an unbound use is offered %d times, want 0", n)
	}
}

func namedCompletions(src string) []CompletionItem {
	out := []CompletionItem{}
	for _, c := range Completions(src) {
		if strings.HasPrefix(c.Label, "%") {
			out = append(out, c)
		}
	}
	return out
}

// Twin: ts/test/lsp.test.ts describe('lsp-alias').
func TestAliasHoverAndDefinition(t *testing.T) {
	const src = "%port = integer\n{ %uint8 } = @\"./t.aontu\"\n\nl: %port\nv: %uint8"

	h := Hover(src, 3, 4, false)
	if nil == h ||
		h.Contents.Value != "```aontu\n%port = integer\n```\n\n*alias*" {
		t.Fatalf("hover on a use: %+v", h)
	}
	// The span is the USE the cursor is on, not the declaration.
	if h.Range.Start != (Position{3, 3}) || h.Range.End != (Position{3, 8}) {
		t.Errorf("hover range = %+v", h.Range)
	}

	taken := Hover(src, 4, 4, false)
	if nil == taken || taken.Contents.Value !=
		"```aontu\n{ %uint8 } = @\"./t.aontu\"\n```\n\n*alias, taken from ./t.aontu*" {
		t.Fatalf("hover on a taken name: %+v", taken)
	}

	// A local declaration: the name in its own line.
	want := &Location{URI: "file:///m", Range: Range{Position{0, 0}, Position{0, 5}}}
	if got := Definition(src, 3, 4, "file:///m"); !reflect.DeepEqual(got, want) {
		t.Errorf("definition of a local name = %+v, want %+v", got, want)
	}
	// A taken name: the pattern, which is where this file gets it.
	want = &Location{URI: "file:///m", Range: Range{Position{1, 2}, Position{1, 8}}}
	if got := Definition(src, 4, 4, "file:///m"); !reflect.DeepEqual(got, want) {
		t.Errorf("definition of a taken name = %+v, want %+v", got, want)
	}

	// `%` inside a string is text, so neither answers there.
	const inStr = "a: \"%port\"\n%port = integer"
	if h := Hover(inStr, 0, 5, false); nil != h &&
		strings.Contains(h.Contents.Value, "*alias*") {
		t.Errorf("a name inside a string hovered as an alias: %+v", h)
	}
	for _, c := range []struct {
		name            string
		src             string
		line, character int
	}{
		{"inside a string", inStr, 0, 5},
		{"a use with no binding", "a: %nope", 0, 4},
		{"off the end of the document", src, 99, 0},
		{"on no name at all", src, 0, 8},
	} {
		if got := Definition(c.src, c.line, c.character, "file:///m"); nil != got {
			t.Errorf("definition %s = %+v, want nil", c.name, got)
		}
	}
}

func TestAliasKeyHoverAndDefinition(t *testing.T) {
	const src = "%port: integer\ntypes: type({%row: {n:string}})\na: %row\nb: %port"
	got := namedCompletions(src)
	if len(got) != 2 || got[0].Label != "%port" || got[1].Label != "%row" {
		t.Fatalf("alias key completions: %+v", got)
	}
	want := &Location{URI: "file:///m", Range: Range{Position{1, 13}, Position{1, 17}}}
	if got := Definition(src, 2, 4, "file:///m"); !reflect.DeepEqual(got, want) {
		t.Errorf("alias key definition: %+v, want %+v", got, want)
	}
	h := Hover(src, 2, 4, false)
	if h == nil || h.Contents.Value != "```aontu\ntypes: type({%row: {n:string}})\n```\n\n*alias*" {
		t.Fatalf("alias key hover: %+v", h)
	}
}

// Twin: ts/test/lsp.test.ts describe('lsp-alias-lexical').
func TestAliasScopeIsLexical(t *testing.T) {
	// A head that is not a set of names binds nothing, the wildcard
	// takes its names from the other file rather than from this text,
	// and an `=` that is not the declaration operator does not declare.
	for _, src := range []string{
		`{ a } = @"./f.aontu"`, `{%} = @"./f.aontu"`, "%a == 1",
	} {
		if got := aontu.AliasScope(src); 0 != len(got) {
			t.Errorf("AliasScope(%q) = %+v, want none", src, got)
		}
	}
	// Indentation hides no declaration, and the column is its own.
	want := []aontu.AliasBinding{{Name: "%a", Row: 1, Col: 3, Decl: "%a = 1"}}
	if got := aontu.AliasScope("  %a = 1"); !reflect.DeepEqual(got, want) {
		t.Errorf("an indented declaration = %+v, want %+v", got, want)
	}
}

// Twin: ts/test/lsp.test.ts a-percent-is-not-always-a-name.
func TestAPercentIsNotAlwaysAName(t *testing.T) {
	// `50%` is ordinary text: the sigil starts a name or nothing, and a
	// quoted run is stepped over whichever quote opened it.
	for _, c := range []struct {
		name            string
		src             string
		line, character int
	}{
		{"a bare percent", "%a = 1\nb: 50%", 1, 5},
		{"a single-quoted name", "%a = 1\nb: '%a'", 1, 4},
	} {
		if got := Definition(c.src, c.line, c.character, "u"); nil != got {
			t.Errorf("definition on %s = %+v, want nil", c.name, got)
		}
	}
	// The cursor on the SECOND name steps over the first.
	two := "%a = 1\n%bb = 2\nc: { %a %bb }"
	d := Definition(two, 2, 9, "u")
	if nil == d || 1 != d.Range.Start.Line {
		t.Fatalf("definition on the second name = %+v, want line 1", d)
	}
}

// Twin: ts/test/lsp.test.ts definition-through-the-handler.
func TestDefinitionThroughTheHandler(t *testing.T) {
	h := NewHandler()
	h.Handle(Message{Method: "textDocument/didOpen", Params: json.RawMessage(
		`{"textDocument":{"uri":"file:///a.aontu","text":"%a = 1\nb: %a"}}`)})

	outs := h.Handle(Message{ID: json.RawMessage("7"),
		Method: "textDocument/definition", Params: json.RawMessage(
			`{"textDocument":{"uri":"file:///a.aontu"},"position":{"line":1,"character":4}}`)})
	var loc Location
	if err := json.Unmarshal(outs[0].Result, &loc); err != nil {
		t.Fatalf("definition result: %v (%s)", err, outs[0].Result)
	}
	if "file:///a.aontu" != loc.URI || 0 != loc.Range.Start.Line {
		t.Fatalf("definition through the handler = %+v", loc)
	}

	// The open document is what completion offers names from.
	comp := h.Handle(Message{ID: json.RawMessage("8"),
		Method: "textDocument/completion", Params: json.RawMessage(
			`{"textDocument":{"uri":"file:///a.aontu"}}`)})
	var items []CompletionItem
	if err := json.Unmarshal(comp[0].Result, &items); err != nil {
		t.Fatalf("completion result: %v", err)
	}
	found := false
	for _, c := range items {
		if "%a" == c.Label {
			found = true
		}
	}
	if !found {
		t.Error("completion did not offer the open document's name")
	}

	// A position naming nothing, no such document, and unreadable
	// params: null rather than a guess.
	out := h.Handle(Message{ID: json.RawMessage("10"),
		Method: "textDocument/definition", Params: json.RawMessage(
			`{"textDocument":{"uri":"file:///a.aontu"},"position":{"line":0,"character":3}}`)})
	if "null" != string(out[0].Result) {
		t.Errorf("definition on no name = %s", out[0].Result)
	}
	for _, params := range []json.RawMessage{
		json.RawMessage(`{}`), json.RawMessage(`[]`),
	} {
		out = h.Handle(Message{ID: json.RawMessage("9"),
			Method: "textDocument/definition", Params: params})
		if "null" != string(out[0].Result) {
			t.Errorf("definition with params %s = %s", params, out[0].Result)
		}
		out = h.Handle(Message{ID: json.RawMessage("9"),
			Method: "textDocument/completion", Params: params})
		items = nil
		if err := json.Unmarshal(out[0].Result, &items); err != nil ||
			0 == len(items) {
			t.Errorf("completion with params %s offered nothing", params)
		}
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
	outs := h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/references"})
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
	if err := os.WriteFile(filepath.Join(root, "in.aontu"),
		[]byte("f: 11"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "secret.aontu"),
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
		"textDocument": map[string]any{"uri": "file:///d.aontu", "text": text},
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
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aontu"`), "include_denied") {
		t.Fatal("escape not denied")
	}
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aontu"`)) {
		t.Fatal("in-root include should resolve")
	}
}

func trustHovers(t *testing.T, h *Handler, text string) string {
	t.Helper()
	trustDiags(t, h, text)
	all := ""
	for c := 0; c < len(text); c++ {
		raw, err := json.Marshal(map[string]any{
			"textDocument": map[string]any{"uri": "file:///d.aontu"},
			"position":     map[string]any{"line": 0, "character": c},
		})
		if err != nil { //coverage:ignore Marshal of a literal map cannot fail
			t.Fatal(err)
		}
		outs := h.Handle(Message{JSONRPC: "2.0", ID: json.RawMessage("2"),
			Method: "textDocument/hover", Params: raw})
		body, err := json.Marshal(outs[0].Result)
		if err != nil { //coverage:ignore a HoverResult always marshals
			t.Fatal(err)
		}
		all += string(body)
	}
	return all
}

func TestTrustLspWorkspaceRootConfinesHover(t *testing.T) {
	dir, root := trustLspWorld(t)
	confined := trustInit(t,
		trustParams(t, map[string]any{"rootUri": fileURI(root)}))

	// In-root: the include resolves, so the value is hoverable.
	if !strings.Contains(
		trustHovers(t, confined, `a:@"`+srcPath(root)+`/in.aontu"`), "11") {
		t.Fatal("in-root value not hoverable")
	}
	// Out-of-root: nowhere on the line does the outside value appear.
	if strings.Contains(
		trustHovers(t, confined, `a:@"`+srcPath(dir)+`/secret.aontu"`), "outside") {
		t.Fatal("hover resolved an escape the diagnostics denied")
	}
	// The unconfined session is the control: it DOES resolve the same
	// escape, which is what makes the assertion above about the
	// capability rather than about hover failing everywhere.
	wide := trustInit(t, trustParams(t, map[string]any{}))
	if !strings.Contains(
		trustHovers(t, wide, `a:@"`+srcPath(dir)+`/secret.aontu"`), "outside") {
		t.Fatal("unconfined control did not resolve the escape")
	}
}

func TestTrustLspWorkspaceFoldersOutrankRootURI(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, trustParams(t, map[string]any{
		"rootUri":          "file:///nowhere",
		"workspaceFolders": []any{map[string]any{"uri": fileURI(root)}},
	}))
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aontu"`)) {
		t.Fatal("in-root include should resolve under the folder root")
	}
}

func TestTrustLspRootPathFallback(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, trustParams(t, map[string]any{"rootPath": root}))
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aontu"`), "include_denied") {
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
	if 0 != len(trustDiags(t, wide, `a:@"`+srcPath(dir)+`/secret.aontu"`)) {
		t.Fatal("explicit system should widen")
	}

	// "none" narrows to nothing.
	none := trustInit(t,
		`{"initializationOptions":{"aontu":{"trust":{"include":"none"}}}}`)
	if !hasCode(trustDiags(t, none, `a:@"`+srcPath(root)+`/in.aontu"`), "include_denied") {
		t.Fatal("explicit none should deny")
	}

	// {root} names its own directory.
	rooted := trustInit(t, trustParams(t, map[string]any{
		"initializationOptions": map[string]any{"aontu": map[string]any{
			"trust": map[string]any{
				"include": map[string]any{"root": root}}}},
	}))
	if 0 != len(trustDiags(t, rooted, `a:@"`+srcPath(root)+`/in.aontu"`)) {
		t.Fatal("explicit root should allow in-root")
	}

	// An unrecognised explicit value confines to NOTHING rather than
	// silently widening.
	unknown := trustInit(t, `{"initializationOptions":`+
		`{"aontu":{"trust":{"include":{"bogus":1}}}}}`)
	if !hasCode(trustDiags(t, unknown, `a:@"`+srcPath(root)+`/in.aontu"`), "include_denied") {
		t.Fatal("unknown explicit value should deny")
	}
}

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
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aontu"`)) {
		t.Fatal("no root, no option: unconfined")
	}
}

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
	if !hasCode(trustDiags(t, h, `a:@"`+srcPath(root)+`/../secret.aontu"`),
		"include_denied") {
		t.Fatal("a bad rootUri must not discard rootPath: escape not denied")
	}

	// And initializationOptions this server cannot read costs only
	// itself: the workspace root still confines.
	opt := trustInit(t, `{"rootUri":"`+fileURI(root)+
		`","initializationOptions":"not an object"}`)
	if !hasCode(trustDiags(t, opt, `a:@"`+srcPath(root)+`/../secret.aontu"`),
		"include_denied") {
		t.Fatal("unreadable initializationOptions must not discard the root")
	}
	if 0 != len(trustDiags(t, opt, `a:@"`+srcPath(root)+`/in.aontu"`)) {
		t.Fatal("in-root include should still resolve")
	}
}

func TestTrustLspMalformedInitializeParams(t *testing.T) {
	_, root := trustLspWorld(t)
	h := trustInit(t, `not json`)
	if 0 != len(trustDiags(t, h, `a:@"`+srcPath(root)+`/in.aontu"`)) {
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
