/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
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

// The same text as the TypeScript server: the detail line and the hint,
// plain, with no colour escapes and no source frame.
func TestDiagnosticsMessageIsPlainText(t *testing.T) {
	d := Diagnostics("a: 1\nmode: \"a\" & \"b\"")
	if len(d) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(d), d)
	}
	want := "Cannot unify value: \"b\" with value: \"a\"\n" +
		"Literal scalar values of the same kind can only unify if they are\n" +
		"exactly equal.\n \nExamples:\n" +
		"  1 & 1   -> 1    # Does unify (equal Integers);\n" +
		"  a & a   -> a    # Does unify (equal Strings);\n" +
		"  1 & 2   -> nil  # Does not unify (unequal Integers);\n" +
		"  1 & 1.0 -> nil  # Does not unify (kinds: Integer & Float)."
	if d[0].Message != want {
		t.Errorf("message = %q, want %q", d[0].Message, want)
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
	outs := h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/codeLens"})
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

	met := []string{}
	for _, x := range Diagnostics("p: deprecate(integer, {msg: \"a\"}) & " +
		"deprecate(1, {msg: \"b\", use: \"$.q\"})\nq: 1") {
		if "deprecated" == x.Code {
			met = append(met, x.Message)
		}
	}
	if 1 != len(met) || "deprecated: a; b (use $.q)" != met[0] {
		t.Fatalf("met records: %v", met)
	}
}

// Twin: ts/test/lsp.test.ts lsp-formatting, case for case.
func TestFormatting(t *testing.T) {
	var cases [][2]json.RawMessage
	if err := json.Unmarshal([]byte(`[
  ["a:1 b: {c:2}", [{"range":{"start":{"line":0,"character":0},"end":{"line":0,"character":12}},"newText":"a: 1\nb: c: 2\n"}]],
  ["a: 1\n", []],
  ["a: ]", null],
  ["a: 1\nb: \"😀\"", [{"range":{"start":{"line":0,"character":0},"end":{"line":1,"character":7}},"newText":"a: 1\nb: \"😀\"\n"}]],
  ["x: {\n  y: 1\n}\n", [{"range":{"start":{"line":0,"character":0},"end":{"line":3,"character":0}},"newText":"x: y: 1\n"}]]
]`), &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		var text string
		_ = json.Unmarshal(c[0], &text)
		got, _ := json.Marshal(Formatting(text))
		var a, b any
		_ = json.Unmarshal(got, &a)
		_ = json.Unmarshal(c[1], &b)
		if !reflect.DeepEqual(a, b) {
			t.Errorf("Formatting(%q) = %s, want %s", text, got, c[1])
		}
	}
}

func TestFormattingThroughTheHandler(t *testing.T) {
	h := NewHandler()
	init := h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize",
		Params: json.RawMessage(`{}`)})
	if !strings.Contains(string(init[0].Result), `"documentFormattingProvider":true`) {
		t.Fatalf("capabilities = %s", init[0].Result)
	}
	h.Handle(Message{Method: "textDocument/didOpen", Params: json.RawMessage(
		`{"textDocument":{"uri":"file:///f.aontu","text":"a:1"}}`)})
	out := h.Handle(Message{ID: json.RawMessage("2"), Method: "textDocument/formatting",
		Params: json.RawMessage(`{"textDocument":{"uri":"file:///f.aontu"}}`)})
	if !strings.Contains(string(out[0].Result), `"newText":"a: 1\n"`) {
		t.Fatalf("formatting = %s", out[0].Result)
	}
	for _, params := range []json.RawMessage{json.RawMessage(`{}`), json.RawMessage(`[]`)} {
		out = h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/formatting",
			Params: params})
		if "null" != string(out[0].Result) {
			t.Errorf("formatting with params %s = %s", params, out[0].Result)
		}
	}
}

func TestServerLayerAnswersAsTheLibrary(t *testing.T) {
	src := "a: { b: 1 }\nc: $.a.b\n"
	at := PathAt(src, 1, 5, nil)
	if nil == at || "ref" != at.On || !reflect.DeepEqual(at.Path, []string{"c"}) ||
		!reflect.DeepEqual(at.Reads, []string{"a", "b"}) {
		t.Fatalf("PathAt = %+v", at)
	}
	sites := SitesOf(src, []string{"c"}, nil)
	got := [][2]string{}
	for _, s := range sites {
		got = append(got, [2]string{s.Role, s.Canon})
	}
	if !reflect.DeepEqual(got, [][2]string{{"literal", "1"}, {"ref", "$.a.b"}}) {
		t.Fatalf("SitesOf = %v", got)
	}
	if nil != PathAt(src, 0, 2, nil) || nil != SitesOf(src, []string{"nope"}, nil) {
		t.Fatal("a colon is on nothing, and no site writes a path that isn't there")
	}
}

func TestAConflictCopiedToAnotherPathIsReportedOnce(t *testing.T) {
	ds := Diagnostics(`a:{b:1&"s"} c:$.a d:$.a`)
	if 1 != len(ds) || 7 != ds[0].Range.Start.Character || "scalar_kind" != ds[0].Code {
		t.Fatalf("got %+v", ds)
	}
}

// Twin: ts/test/lsp.test.ts completion-offers-the-keys-and-members-at-the-cursor.
func TestCompletionOffersTheKeysAndMembersAtTheCursor(t *testing.T) {
	const s = "S: type({ port: integer, \"a b\": string, tier?: string })\n"
	got := CompletionsAt(s+"api: $.S & { port: 1,  }\n", 1, 22, "", nil)
	want := []CompletionItem{
		{Label: "a b", Kind: CompletionField, Detail: "string", InsertText: `"a b"`},
		{Label: "tier", Kind: CompletionField, Detail: "string (optional)"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("keys: %+v", got)
	}
	if got := CompletionsAt("xs: [10]\ny: $.xs.\n", 1, 8, ".", nil); !reflect.DeepEqual(got,
		[]CompletionItem{{Label: "0", Kind: CompletionField, Detail: "10"}}) {
		t.Errorf("members: %+v", got)
	}
	// A path that holds nothing offers nothing, not the general list.
	if got := CompletionsAt("y: $.zz.\n", 0, 8, "", nil); 0 != len(got) {
		t.Errorf("nothing: %+v", got)
	}
	// Where nothing is declared, the general list stands.
	const plain = "a: { b: 1,  }\n"
	if got := CompletionsAt(plain, 0, 11, "", nil); !reflect.DeepEqual(got, Completions(plain)) {
		t.Errorf("general: %d items", len(got))
	}
	// A dot that begins no path offers nothing.
	if got := CompletionsAt("x: 1.\n", 0, 5, ".", nil); nil == got || 0 != len(got) {
		t.Errorf("dot: %+v", got)
	}
}

func TestCompletionWritesAKeyAsItReadsWhereItGoes(t *testing.T) {
	inserts := func(src string, line, character int) map[string]string {
		out := map[string]string{}
		for _, i := range CompletionsAt(src, line, character, "", nil) {
			out[i.Label] = i.InsertText
		}
		return out
	}
	const keys = `a: { "true": 1, _: 2, nil: 3, ok: 4, "x\ny": 5, "q\"r": 6 }` + "\n"
	// After a dot, a segment the lexer reads as a value takes quotes too.
	if got := inserts(keys+"x: $.a.\n", 1, 7); !reflect.DeepEqual(got, map[string]string{
		"_": `"_"`, "nil": `"nil"`, "ok": "", `q"r`: `"q\"r"`, "true": `"true"`, "x\ny": `"x\ny"`,
	}) {
		t.Errorf("path: %q", got)
	}
	const typ = `T: type({ true: integer, _: string, "x\ny": string })` + "\n"
	if got := inserts(typ+"v: $.T & {  }\n", 1, 11); !reflect.DeepEqual(got, map[string]string{
		"_": "", "true": "", "x\ny": `"x\ny"`,
	}) {
		t.Errorf("key: %q", got)
	}
}

func TestCompletionThroughTheHandler(t *testing.T) {
	h := NewHandler()
	init, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize"})[0])
	if !strings.Contains(string(init), `"completionProvider":{"triggerCharacters":["."]}`) {
		t.Errorf("initialize: %s", init)
	}
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{
		"uri": "file:///c.aontu", "text": "a: { b: 1 }\nx: $.a.\n"}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	ask := func(extra map[string]any) []CompletionItem {
		params := map[string]any{"textDocument": map[string]any{"uri": "file:///c.aontu"}}
		for k, v := range extra {
			params[k] = v
		}
		raw, _ := json.Marshal(params)
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("2"),
			Method: "textDocument/completion", Params: raw})[0])
		var res struct {
			Result []CompletionItem `json:"result"`
		}
		json.Unmarshal(out, &res)
		return res.Result
	}
	dot := map[string]any{"triggerKind": 2, "triggerCharacter": "."}
	if got := ask(map[string]any{"position": map[string]any{"line": 1, "character": 7},
		"context": dot}); 1 != len(got) || "b" != got[0].Label {
		t.Errorf("members: %+v", got)
	}
	if got := ask(nil); len(got) != len(Completions("")) {
		t.Errorf("general: %d items", len(got))
	}
	if got := ask(map[string]any{"context": dot}); nil == got || 0 != len(got) {
		t.Errorf("dot: %+v", got)
	}
}

// Twin: ts/test/lsp.test.ts describe('lsp-symbols').
func TestSymbolsOutlineWhatTheDocumentWrites(t *testing.T) {
	got, _ := json.Marshal(Symbols("a: { b: 1 }\nl: [$.a]\n", nil))
	want := `[{"name":"a","kind":19,` +
		`"range":{"start":{"line":0,"character":0},"end":{"line":0,"character":11}},` +
		`"selectionRange":{"start":{"line":0,"character":0},"end":{"line":0,"character":1}},` +
		`"children":[{"name":"b","kind":16,` +
		`"range":{"start":{"line":0,"character":5},"end":{"line":0,"character":9}},` +
		`"selectionRange":{"start":{"line":0,"character":5},"end":{"line":0,"character":6}},` +
		`"children":[]}]},` +
		`{"name":"l","kind":18,` +
		`"range":{"start":{"line":1,"character":0},"end":{"line":1,"character":8}},` +
		`"selectionRange":{"start":{"line":1,"character":0},"end":{"line":1,"character":1}},` +
		`"children":[{"name":"0","kind":13,` +
		`"range":{"start":{"line":1,"character":4},"end":{"line":1,"character":7}},` +
		`"selectionRange":{"start":{"line":1,"character":4},"end":{"line":1,"character":7}},` +
		`"children":[]}]}]`
	if want != string(got) {
		t.Errorf("symbols: %s", got)
	}
	if got := Symbols("1\n", nil); nil == got || 0 != len(got) {
		t.Errorf("no key: %+v", got)
	}
	if got := Symbols("a: )\n", nil); nil != got {
		t.Errorf("unparsed: %+v", got)
	}
}

func TestSymbolsOutlineALargeList(t *testing.T) {
	got := Symbols("items: ["+strings.Repeat("0,", 130000)+"]\n", nil)
	if 1 != len(got) || "items" != got[0].Name || 18 != got[0].Kind ||
		130000 != len(got[0].Children) || 260009 != got[0].Range.End.Character {
		t.Fatalf("large list: %d symbols", len(got))
	}
	first, last := got[0].Children[0], got[0].Children[129999]
	if 8 != first.Range.Start.Character || 9 != first.Range.End.Character || "129999" != last.Name {
		t.Errorf("children: %+v %+v", first, last)
	}
}

func TestSymbolsThroughTheHandler(t *testing.T) {
	h := NewHandler()
	init, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize"})[0])
	if !strings.Contains(string(init), `"documentSymbolProvider":true`) {
		t.Errorf("initialize: %s", init)
	}
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{
		"uri": "file:///s.aontu", "text": "a: b: 1\na: 2\n"}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	ask := func(uri string) string {
		raw, _ := json.Marshal(map[string]any{"textDocument": map[string]any{"uri": uri}})
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("2"),
			Method: "textDocument/documentSymbol", Params: raw})[0])
		return string(out)
	}
	got := ask("file:///s.aontu")
	for _, part := range []string{
		`"name":"a","kind":19,"range":{"start":{"line":0,"character":0},"end":{"line":0,"character":7}}`,
		`"children":[{"name":"b"`,
		`"name":"a","kind":16,"range":{"start":{"line":1,"character":0},"end":{"line":1,"character":4}}`,
	} {
		if !strings.Contains(got, part) {
			t.Errorf("symbols: %s", got)
		}
	}
	if got := ask("file:///none.aontu"); !strings.Contains(got, `"result":null`) {
		t.Errorf("unopened: %s", got)
	}
	if out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("4"), Method: "textDocument/documentSymbol",
		Params: json.RawMessage(`{}`)})[0]); !strings.Contains(string(out), `"result":null`) {
		t.Errorf("no document: %s", out)
	}
	if out := h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/documentSymbol",
		Params: json.RawMessage(`[`)}); 1 != len(out) {
		t.Errorf("malformed: %+v", out)
	}
}

// Twin: ts/test/lsp.test.ts describe('lsp-references').
const refsSrc = "base: { port: 8080 }\ndb: { port: $.base.port }\nx: $.base.port\n"

func TestReferencesListTheSitesAndTheReads(t *testing.T) {
	const u = "file:///r.aontu"
	if got := References(refsSrc, 0, 9, u, true, nil); !reflect.DeepEqual(got, []Location{
		{URI: u, Range: rangeOf(0, 14, 0, 18)}, {URI: u, Range: rangeOf(1, 12, 1, 23)},
		{URI: u, Range: rangeOf(2, 3, 2, 14)},
	}) {
		t.Errorf("with the sites: %+v", got)
	}
	if got := References(refsSrc, 2, 5, u, false, nil); !reflect.DeepEqual(got, []Location{
		{URI: u, Range: rangeOf(1, 12, 1, 23)}, {URI: u, Range: rangeOf(2, 3, 2, 14)},
	}) {
		t.Errorf("reads: %+v", got)
	}
	if got := References(refsSrc, 0, 15, u, true, nil); nil != got {
		t.Errorf("value: %+v", got)
	}
	if got := References("a: )\n", 0, 0, u, true, nil); nil != got {
		t.Errorf("unparsed: %+v", got)
	}
}

func TestHighlightsTellAWriteFromARead(t *testing.T) {
	if got := Highlights(refsSrc, 1, 20, nil); !reflect.DeepEqual(got, []DocumentHighlight{
		{Range: rangeOf(0, 14, 0, 18), Kind: HighlightWrite}, {Range: rangeOf(1, 12, 1, 23), Kind: HighlightRead},
		{Range: rangeOf(2, 3, 2, 14), Kind: HighlightRead},
	}) {
		t.Errorf("highlights: %+v", got)
	}
	if got := Highlights("x: $.nope\n", 0, 5, nil); !reflect.DeepEqual(got,
		[]DocumentHighlight{{Range: rangeOf(0, 3, 0, 9), Kind: HighlightRead}}) {
		t.Errorf("unwritten: %+v", got)
	}
	if got := Highlights(refsSrc, 0, 15, nil); nil != got {
		t.Errorf("value: %+v", got)
	}
}

func TestReferencesAcrossAnInclude(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "base.aontu"), []byte("port: 8080\nr: ( $.top )\ns: $.\"top\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	trust := &aontu.TrustOptions{IncludeRoot: dir}
	src := "top: 1\nbase: @\"" + srcPath(dir) + "/base.aontu\"\n"
	got := References(src, 0, 1, "file:///r.aontu", true, trust)
	// A reference there is ranged by its span as written there.
	if 3 != len(got) || !reflect.DeepEqual(got[0], Location{URI: "file:///r.aontu", Range: rangeOf(0, 5, 0, 6)}) ||
		!strings.HasPrefix(got[1].URI, "file:///") || !strings.HasSuffix(got[1].URI, "/base.aontu") ||
		!reflect.DeepEqual(got[1].Range, rangeOf(1, 5, 1, 10)) || !reflect.DeepEqual(got[2].Range, rangeOf(2, 3, 2, 10)) {
		t.Errorf("across: %+v", got)
	}
	// A highlight is in the open document alone.
	if got := Highlights(src, 0, 1, trust); !reflect.DeepEqual(got,
		[]DocumentHighlight{{Range: rangeOf(0, 5, 0, 6), Kind: HighlightWrite}}) {
		t.Errorf("highlights: %+v", got)
	}
}

func TestReferencesAndHighlightsThroughTheHandler(t *testing.T) {
	const u = "file:///r.aontu"
	h := NewHandler()
	init, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize"})[0])
	if !strings.Contains(string(init), `"referencesProvider":true`) ||
		!strings.Contains(string(init), `"documentHighlightProvider":true`) {
		t.Errorf("initialize: %s", init)
	}
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{"uri": u, "text": refsSrc}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	ask := func(method, uri string, extra map[string]any) string {
		params := map[string]any{"textDocument": map[string]any{"uri": uri}}
		for k, v := range extra {
			params[k] = v
		}
		raw, _ := json.Marshal(params)
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("2"), Method: method, Params: raw})[0])
		return string(out)
	}
	at := map[string]any{"position": map[string]any{"line": 0, "character": 9}}
	with := map[string]any{"position": at["position"], "context": map[string]any{"includeDeclaration": true}}
	if got := ask("textDocument/references", u, with); 3 != strings.Count(got, `"uri"`) {
		t.Errorf("with the sites: %s", got)
	}
	if got := ask("textDocument/references", u, at); 2 != strings.Count(got, `"uri"`) {
		t.Errorf("reads: %s", got)
	}
	if got := ask("textDocument/documentHighlight", u, at); 1 != strings.Count(got, `"kind":3`) ||
		2 != strings.Count(got, `"kind":2`) {
		t.Errorf("highlights: %s", got)
	}
	if got := ask("textDocument/references", u, nil); !strings.Contains(got, `"result":null`) {
		t.Errorf("no position: %s", got)
	}
	if got := ask("textDocument/documentHighlight", "file:///none.aontu", at); !strings.Contains(got, `"result":null`) {
		t.Errorf("unopened: %s", got)
	}
	if out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("4"), Method: "textDocument/references",
		Params: json.RawMessage(`{}`)})[0]); !strings.Contains(string(out), `"result":null`) {
		t.Errorf("no document: %s", out)
	}
	if out := h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/references",
		Params: json.RawMessage(`[`)}); 1 != len(out) {
		t.Errorf("malformed: %+v", out)
	}
}

const renameSrc = "base: { port: 8080 }\ndb: { port: $.base.port }\nx: $.base.port\n"

func TestRenameEditsTheKeyAndEveryReference(t *testing.T) {
	const u = "file:///w/r.aontu"
	if got, refused := PrepareRename(renameSrc, 1, 20, u, "", nil); "" != refused ||
		!reflect.DeepEqual(got, &PrepareRenameResult{Range: rangeOf(1, 19, 1, 23), Placeholder: "port"}) {
		t.Errorf("prepare: %+v %q", got, refused)
	}
	got, refused := Rename(renameSrc, 0, 9, u, "listen", "", nil)
	if want := (&WorkspaceEdit{Changes: map[string][]TextEdit{u: {
		{Range: rangeOf(0, 8, 0, 12), NewText: "listen"},
		{Range: rangeOf(1, 19, 1, 23), NewText: "listen"},
		{Range: rangeOf(2, 10, 2, 14), NewText: "listen"},
	}}}); "" != refused || !reflect.DeepEqual(got, want) {
		t.Errorf("rename: %+v %q", got, refused)
	}
	if _, refused := Rename(renameSrc, 0, 9, u, `a"b`, "", nil); `cannot rename base.port to a"b: the name needs an escape` != refused {
		t.Errorf("escape: %q", refused)
	}
	if got, refused := PrepareRename(renameSrc, 0, 15, u, "", nil); nil != got || "" != refused {
		t.Errorf("prepare on a value: %+v %q", got, refused)
	}
	if got, refused := Rename(renameSrc, 0, 15, u, "q", "", nil); nil != got || "" != refused {
		t.Errorf("rename on a value: %+v %q", got, refused)
	}
}

func TestRenameKeepsToTheWorkspaceRoot(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, text := range map[string]string{
		filepath.Join(root, "base.aontu"): "port: 8080\nr: $.top.k\n",
		filepath.Join(dir, "away.aontu"):  "port: 1\n",
	} {
		if err := os.WriteFile(name, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	doc := pathToURI(srcPath(filepath.Join(root, "doc.aontu")))
	there := pathToURI(srcPath(filepath.Join(root, "base.aontu")))
	src := "top: { k: 1 }\nbase: @\"" + srcPath(root) + "/base.aontu\"\naway: @\"" + srcPath(dir) + "/away.aontu\"\n"
	trust := &aontu.TrustOptions{IncludeRoot: dir}
	got, refused := Rename(src, 0, 7, doc, "j", "", trust)
	if want := (&WorkspaceEdit{Changes: map[string][]TextEdit{
		doc:   {{Range: rangeOf(0, 7, 0, 8), NewText: "j"}},
		there: {{Range: rangeOf(1, 9, 1, 10), NewText: "j"}},
	}}); "" != refused || !reflect.DeepEqual(got, want) {
		t.Errorf("under the root: %+v %q", got, refused)
	}
	if got, _ := Rename(src, 1, 1, doc, "b", srcPath(root), trust); 1 != len(got.Changes) || nil == got.Changes[doc] {
		t.Errorf("the include's key: %+v", got)
	}
	if _, refused := Rename(src+"y: $.away.port\n", 3, 11, doc, "p", srcPath(root), trust); !strings.HasPrefix(refused,
		"cannot rename away.port: ") || !strings.HasSuffix(refused, "away.aontu is outside the workspace root") {
		t.Errorf("outside: %q", refused)
	}
	if got, refused := Rename("a: 1\n", 0, 0, doc, "b", srcPath(dir), nil); "" != refused || !reflect.DeepEqual(got,
		&WorkspaceEdit{Changes: map[string][]TextEdit{doc: {{Range: rangeOf(0, 0, 0, 1), NewText: "b"}}}}) {
		t.Errorf("inside: %+v %q", got, refused)
	}
	if _, refused := Rename("a: 1\n", 0, 0, doc, "b", srcPath(filepath.Join(dir, "x")), nil); "cannot rename: the document is outside the workspace root" != refused {
		t.Errorf("document outside: %q", refused)
	}
	pkg := pathToURI(srcPath(filepath.Join(root, "aontu_meta", "vendor", "p", "main.aontu")))
	if _, refused := PrepareRename("a: 1\n", 0, 0, pkg, "", nil); "cannot rename: the document is in a package" != refused {
		t.Errorf("package: %q", refused)
	}
	if _, refused := Rename(src+"y: $.base.port\n", 3, 11, "untitled:1", "q", "", trust); !strings.HasPrefix(refused,
		"cannot rename base.port: ") || !strings.HasSuffix(refused, "base.aontu is outside the workspace root") {
		t.Errorf("untitled: %q", refused)
	}
}

func TestRenameNamesAFileWhoseTextItCannotRead(t *testing.T) {
	const u = "file:///w/r.aontu"
	trust := &aontu.TrustOptions{IncludeMem: map[string]string{"m.aontu": "k: { n: key() }\n"}}
	if _, refused := Rename("a: @\"m.aontu\"\ny: $.a.k\n", 1, 7, u, "j", "/", trust); "cannot rename a.k: key() reads the key at m.aontu" != refused {
		t.Errorf("key(): %q", refused)
	}
	trust = &aontu.TrustOptions{IncludeMem: map[string]string{"n.aontu": "k: 1\nr: $.a.k\n"}}
	if _, refused := Rename("a: @\"n.aontu\"\ny: $.a.k\n", 1, 7, u, "j", "/", trust); "cannot rename a.k: the text of n.aontu cannot be read" != refused {
		t.Errorf("unread: %q", refused)
	}
}

func TestRenameThroughTheHandler(t *testing.T) {
	const u = "file:///w/r.aontu"
	h := NewHandler()
	init, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize",
		Params: json.RawMessage(`{"rootUri":"file:///w"}`)})[0])
	if !strings.Contains(string(init), `"renameProvider":{"prepareProvider":true}`) {
		t.Errorf("initialize: %s", init)
	}
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{"uri": u, "text": renameSrc}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	ask := func(method string, extra map[string]any) string {
		params := map[string]any{"textDocument": map[string]any{"uri": u}}
		for k, v := range extra {
			params[k] = v
		}
		raw, _ := json.Marshal(params)
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("2"), Method: method, Params: raw})[0])
		return string(out)
	}
	at := map[string]any{"line": 0, "character": 9}
	if got := ask("textDocument/prepareRename", map[string]any{"position": at}); !strings.Contains(got, `"placeholder":"port"`) {
		t.Errorf("prepare: %s", got)
	}
	if got := ask("textDocument/rename", map[string]any{"position": at, "newName": "p"}); 3 != strings.Count(got, `"newText":"p"`) {
		t.Errorf("rename: %s", got)
	}
	if got := ask("textDocument/rename", map[string]any{"position": at, "newName": 7}); !strings.Contains(got,
		`"error":{"code":-32803,"message":"cannot rename base.port: the new name is empty"}`) {
		t.Errorf("no name: %s", got)
	}
	if got := ask("textDocument/rename", nil); !strings.Contains(got, `"result":null`) {
		t.Errorf("no position: %s", got)
	}
	if out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/prepareRename",
		Params: json.RawMessage(`{}`)})[0]); !strings.Contains(string(out), `"result":null`) {
		t.Errorf("no document: %s", out)
	}
	if out := h.Handle(Message{ID: json.RawMessage("4"), Method: "textDocument/rename",
		Params: json.RawMessage(`[`)}); 1 != len(out) {
		t.Errorf("malformed: %+v", out)
	}
}

const actionsSrc = "cfg: {\n  &: { port: 80, tls: false }\n  a: { port: 80, tls: false }\n  b: { x: 1 }\n}\n"

func TestAnActionRemovesWhatTrimReports(t *testing.T) {
	const u = "file:///w/c.aontu"
	at := func(l0, c0, l1, c1 int) Range { return rangeOf(l0, c0, l1, c1) }
	want := []CodeAction{{Title: "Remove $.cfg.a.port, which changes nothing", Kind: "quickfix",
		Edit: WorkspaceEdit{Changes: map[string][]TextEdit{u: {{Range: rangeOf(2, 7, 2, 17)}}}}}}
	if got := CodeActions(actionsSrc, at(2, 7, 2, 7), u, nil, nil); !reflect.DeepEqual(got, want) {
		t.Errorf("at the entry: %+v", got)
	}
	if got := CodeActions(actionsSrc, at(3, 0, 3, 3), u, nil, nil); nil == got || 0 != len(got) {
		t.Errorf("elsewhere: %+v", got)
	}
	if got := CodeActions(actionsSrc, at(2, 7, 2, 7), u, []any{"refactor"}, nil); nil == got || 0 != len(got) {
		t.Errorf("refactor only: %+v", got)
	}
	if got := CodeActions(actionsSrc, at(2, 7, 2, 7), u, []any{"quickfix"}, nil); 1 != len(got) {
		t.Errorf("quickfix only: %+v", got)
	}
	if got := CodeActions("a: ]\n", at(0, 0, 0, 0), u, nil, nil); nil != got {
		t.Errorf("unparsed: %+v", got)
	}
}

func TestTheTextWithoutTheEntryIsWhatTrimNoLongerReports(t *testing.T) {
	for _, src := range []string{
		actionsSrc,
		"m: { &: { k: 1 }, a: { k: 1, k: 1 } }\n",
		"m: {\n  &: { k: 1 }\n  a: {\n    k: 1 # same\n    j: 2\n  }\n}\n",
		"m: { &: { k: 1 }, a: { j: 2 k: 1 } }\n",
		"ys: [&: { k: 1 }, { k: 1 }]\n",
	} {
		lines := strings.Split(src, "\n")
		acts := aontu.New().ActionsAt(src, aontu.CursorRange{End: aontu.CursorPosition{Line: len(lines) - 1}})
		if 0 == len(acts) {
			t.Errorf("no action: %q", src)
		}
		off := func(p aontu.CursorPosition) int {
			n := 0
			for _, l := range lines[:p.Line] {
				n += len(l) + 1
			}
			return n + p.Character
		}
		for _, act := range acts {
			text := src
			for i := len(act.Edits) - 1; 0 <= i; i-- {
				e := act.Edits[i]
				text = text[:off(e.Range.Start)] + e.NewText + text[off(e.Range.End):]
			}
			report := aontu.New().TrimCheck(text)
			if aontu.TrimError == report.Verdict || slices.Contains(report.Redundant, "$."+strings.Join(act.Path, ".")) {
				t.Errorf("%q: %+v", text, report)
			}
		}
	}
}

func TestCodeActionsThroughTheHandler(t *testing.T) {
	const u = "file:///w/c.aontu"
	h := NewHandler()
	init, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize"})[0])
	if !strings.Contains(string(init), `"codeActionProvider":{"codeActionKinds":["quickfix"]}`) {
		t.Errorf("initialize: %s", init)
	}
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{"uri": u, "text": actionsSrc}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	ask := func(extra string) string {
		raw := `{"textDocument":{"uri":"` + u + `"}` + extra + `}`
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("2"), Method: "textDocument/codeAction",
			Params: json.RawMessage(raw)})[0])
		return string(out)
	}
	rng := `,"range":{"start":{"line":1,"character":0},"end":{"line":3,"character":0}}`
	if got := ask(rng + `,"context":{"diagnostics":[]}`); 2 != strings.Count(got, `"kind":"quickfix"`) {
		t.Errorf("range: %s", got)
	}
	if got := ask(rng + `,"context":{"only":["source"]}`); !strings.Contains(got, `"result":[]`) {
		t.Errorf("source only: %s", got)
	}
	if got := ask(rng + `,"context":{"only":"x"}`); 2 != strings.Count(got, `"kind":"quickfix"`) {
		t.Errorf("only not a list: %s", got)
	}
	if got := ask(""); !strings.Contains(got, `"result":null`) {
		t.Errorf("no range: %s", got)
	}
	if got := ask(`,"range":{"start":{"line":0,"character":0}}`); !strings.Contains(got, `"result":null`) {
		t.Errorf("no end: %s", got)
	}
	if out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("3"), Method: "textDocument/codeAction",
		Params: json.RawMessage(`{}`)})[0]); !strings.Contains(string(out), `"result":null`) {
		t.Errorf("no document: %s", out)
	}
	if out := h.Handle(Message{ID: json.RawMessage("4"), Method: "textDocument/codeAction",
		Params: json.RawMessage(`[`)}); 1 != len(out) {
		t.Errorf("malformed: %+v", out)
	}
}
