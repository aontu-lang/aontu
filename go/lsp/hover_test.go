/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"strings"
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

func TestHoverScalar(t *testing.T) {
	h := Hover("port: 8080", 0, 7, false)
	if h == nil {
		t.Fatal("expected hover over 8080")
	}
	if !strings.Contains(h.Contents.Value, "8080") || !strings.Contains(h.Contents.Value, "integer") {
		t.Errorf("hover value = %q", h.Contents.Value)
	}
	if h.Range == nil || h.Range.Start.Character != 6 || h.Range.End.Character != 10 {
		t.Errorf("range = %+v, want start char 6 end 10", h.Range)
	}
}

// A LITERAL WHOSE CANON IS NOT ITS SOURCE TEXT. `0x1F` renders as
// canon `31`, and sizing the hover by canon underlined two characters
// of a four-character literal: hovering the `0x` answered 6..8 and
// hovering the `1F` answered NOTHING, because the span stopped before
// the cursor. Every column of the literal now answers the whole of it.
//
// The twin is hover-over-a-literal-whose-canon-is-shorter in
// ts/test/lsp.test.ts, and the defect is status report §5's
// "Site is a point with no extent".
func TestHoverSpansTheWholeLiteral(t *testing.T) {
	const src = "port: 0x1F"
	for col := 6; col <= 9; col++ {
		h := Hover(src, 0, col, false)
		if nil == h || nil == h.Range {
			t.Fatalf("col %d: no hover over %q", col, src[col:col+1])
		}
		if 6 != h.Range.Start.Character || 10 != h.Range.End.Character {
			t.Errorf("col %d: range = %d..%d, want 6..10",
				col, h.Range.Start.Character, h.Range.End.Character)
		}
	}
}

func TestHoverType(t *testing.T) {
	h := Hover("a:{x:string}", 0, 5, false)
	if h == nil || !strings.Contains(h.Contents.Value, "string") || !strings.Contains(h.Contents.Value, "type") {
		t.Fatalf("expected type hover, got %+v", h)
	}
}

func TestHoverResolvedReference(t *testing.T) {
	// b resolves to 1; hovering the definition shows the resolved value.
	h := Hover("a:1\nb:$.a", 0, 2, false)
	if h == nil || !strings.Contains(h.Contents.Value, "1") {
		t.Fatalf("expected hover over resolved value, got %+v", h)
	}
}

func TestHoverMiss(t *testing.T) {
	if h := Hover("port: 8080", 5, 0, false); h != nil {
		t.Errorf("expected nil hover off-document, got %+v", h)
	}
}

func TestCompletionsList(t *testing.T) {
	c := Completions()
	// 44 functions + 7 kinds + 5 literals.
	if len(c) != 56 {
		t.Fatalf("expected 56 completions, got %d", len(c))
	}
	byLabel := map[string]CompletionItem{}
	for _, it := range c {
		byLabel[it.Label] = it
	}
	if byLabel["upper"].Kind != CompletionFunction {
		t.Errorf("upper kind = %d, want Function", byLabel["upper"].Kind)
	}
	if byLabel["string"].Kind != CompletionKeyword {
		t.Errorf("string kind = %d, want Keyword", byLabel["string"].Kind)
	}
	for _, want := range []string{"close", "upper", "path", "min", "max",
		"above", "below", "neq", "refer", "string", "number",
		"integer", "float", "biginteger", "bigdecimal", "true", "null", "top"} {
		if _, ok := byLabel[want]; !ok {
			t.Errorf("missing completion %q", want)
		}
	}
}

// TestHoverExactLeaves covers the tower's exact leaves on the tooling
// surface: a `0d` literal hovers as its own leaf (never as "number",
// which is the supertype), and its range covers the whole literal —
// including the fraction, which the dot token would otherwise split off.
func TestHoverExactLeaves(t *testing.T) {
	h := Hover("a:0d5", 0, 3, false)
	if h == nil || !strings.Contains(h.Contents.Value, "0d5") ||
		!strings.Contains(h.Contents.Value, "biginteger") {
		t.Fatalf("expected biginteger hover, got %+v", h)
	}
	h = Hover("a:0d1.5", 0, 3, false)
	if h == nil || !strings.Contains(h.Contents.Value, "0d1.5") ||
		!strings.Contains(h.Contents.Value, "bigdecimal") {
		t.Fatalf("expected bigdecimal hover, got %+v", h)
	}
	if h.Range == nil || h.Range.Start.Character != 2 || h.Range.End.Character != 7 {
		t.Errorf("range = %+v, want start char 2 end 7", h.Range)
	}
}

// TestHoverConstraint: a constraint residual hovers as its canon with
// the shared kind label "constraint" — never a bare "value" default
// (the TS twin is hover-constraint; identical hover-text contract).
func TestHoverConstraint(t *testing.T) {
	h := Hover("a:min(0)&max(10)", 0, 3, false)
	if h == nil || !strings.Contains(h.Contents.Value, "min(0)&max(10)") ||
		!strings.Contains(h.Contents.Value, "*constraint*") {
		t.Fatalf("expected constraint hover, got %+v", h)
	}
}

func TestBuiltinFuncNamesParity(t *testing.T) {
	// The completion function list must match the engine's recognised
	// functions exactly (guards against drift).
	got := aontu.BuiltinFuncNames()
	want := []string{"above", "acyclic", "add", "below", "close", "copy", "deprecate", "div", "each", "emit", "filter", "greatest", "hide", "inverse", "join", "key", "least", "length", "list", "lower", "map", "match", "max", "min", "mod", "move", "mul", "must", "neq", "open", "pack", "path", "pick", "pref", "re", "refer", "rel", "rem", "sub", "sum", "super", "type", "unique", "upper"}
	if len(got) != len(want) {
		t.Fatalf("BuiltinFuncNames = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("BuiltinFuncNames[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestHandlerHover(t *testing.T) {
	h := NewHandler()
	open, _ := json.Marshal(map[string]any{
		"textDocument": map[string]any{"uri": "file:///t.aontu", "text": "port: 8080"},
	})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})

	hov, _ := json.Marshal(map[string]any{
		"textDocument": map[string]any{"uri": "file:///t.aontu"},
		"position":     map[string]any{"line": 0, "character": 7},
	})
	outs := h.Handle(Message{ID: json.RawMessage("5"), Method: "textDocument/hover", Params: hov})
	if len(outs) != 1 {
		t.Fatalf("expected 1 response, got %d", len(outs))
	}
	var res HoverResult
	if err := json.Unmarshal(outs[0].Result, &res); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Contents.Value, "8080") {
		t.Errorf("hover result = %q", res.Contents.Value)
	}
}

func TestHandlerCompletion(t *testing.T) {
	h := NewHandler()
	outs := h.Handle(Message{ID: json.RawMessage("6"), Method: "textDocument/completion"})
	if len(outs) != 1 {
		t.Fatalf("expected 1 response, got %d", len(outs))
	}
	var items []CompletionItem
	if err := json.Unmarshal(outs[0].Result, &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 56 {
		t.Errorf("expected 56 completion items, got %d", len(items))
	}
}

func TestInitializeAdvertisesHoverAndCompletion(t *testing.T) {
	h := NewHandler()
	outs := h.Handle(Message{ID: json.RawMessage("1"), Method: "initialize"})
	var res struct {
		Capabilities struct {
			HoverProvider      bool            `json:"hoverProvider"`
			CompletionProvider json.RawMessage `json:"completionProvider"`
		} `json:"capabilities"`
	}
	json.Unmarshal(outs[0].Result, &res)
	if !res.Capabilities.HoverProvider {
		t.Error("hoverProvider not advertised")
	}
	if len(res.Capabilities.CompletionProvider) == 0 {
		t.Error("completionProvider not advertised")
	}
}

// HOVER PROVENANCE (G7 phase 7) is config-gated and off by default:
// the contributions that met at the hovered path, appended to the
// value's own hover. The markdown is byte-identical to the canonical
// port's (ts/src/lsp.ts), which was diffed before this was written.
func TestHoverProvenance(t *testing.T) {
	src := "services: {\n  &: { replicas: *1 | integer }\n  auth: { replicas: 3 }\n}"

	off := Hover(src, 2, 20, false)
	if nil == off || strings.Contains(off.Contents.Value, "Contributions") {
		t.Fatalf("provenance leaked when off: %q", off.Contents.Value)
	}

	on := Hover(src, 2, 20, true)
	if nil == on {
		t.Fatal("no hover")
	}
	for _, want := range []string{
		"Contributions:", "`*1|integer` — spread (2:18)", "`3` — literal (3:21)",
	} {
		if !strings.Contains(on.Contents.Value, want) {
			t.Fatalf("hover missing %q:\n%s", want, on.Contents.Value)
		}
	}

	// A value with NO path — the whole document — has no contributions
	// to name, and the hover is unchanged rather than decorated with
	// an empty section.
	bare := Hover("42", 0, 1, true)
	if nil != bare && strings.Contains(bare.Contents.Value, "Contributions") {
		t.Fatalf("root hover: %q", bare.Contents.Value)
	}

	// A document with an error ELSEWHERE still hovers, while Why
	// refuses it: the hover keeps its value and gains no section.
	broken := Hover("a: 1\nb: 2 & \"x\"", 0, 3, true)
	if nil == broken || strings.Contains(broken.Contents.Value, "Contributions") {
		t.Fatalf("broken hover: %+v", broken)
	}
}

// The two shapes the record allows and no hover produces: a
// contribution with no site, and one whose site names a file.
func TestContributionsMarkdown(t *testing.T) {
	if "" != contributionsMarkdown(nil) {
		t.Fatal("empty should render nothing")
	}
	got := contributionsMarkdown([]aontu.WhyConjunct{
		{Canon: "1", Role: "literal",
			Site: aontu.WhySite{Col: -1, File: "", Row: -1}},
		{Canon: "integer", Role: "spread",
			Site: aontu.WhySite{Col: 3, File: "x.aon", Row: 2}},
	})
	want := "\n\n---\n\nContributions:\n" +
		"- `1` — literal\n- `integer` — spread (x.aon:2:3)"
	if want != got {
		t.Fatalf("want %q, got %q", want, got)
	}
}

// The opt-in reaches the handler: an initialize with
// initializationOptions.aontu.provenance turns it on, and anything
// else leaves it off.
func TestHandlerHoverProvenance(t *testing.T) {
	for _, c := range []struct {
		params string
		want   bool
	}{
		{`{"initializationOptions":{"aontu":{"provenance":true}}}`, true},
		{`{"initializationOptions":{"aontu":{"provenance":false}}}`, false},
		{`{"initializationOptions":{"aontu":{}}}`, false},
		{`{}`, false},
		{`not json`, false},
	} {
		if got := provenanceFromInitialize(json.RawMessage(c.params)); got != c.want {
			t.Fatalf("%s: want %v, got %v", c.params, c.want, got)
		}
	}
}
