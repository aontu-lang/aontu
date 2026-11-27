/* Copyright (c) 2025 Richard Rodger, MIT License */

package lsp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
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

// G12 phase 8: a value's meta() titles and descriptions close its hover,
// byte-identical to ts/test/lsp.test.ts.
func TestHoverAnnotations(t *testing.T) {
	cases := [][2]string{
		{`port: meta(8080, {title: "Port", description: "The listen port"})`,
			"```aontu\n8080\n```\n\n*integer*\n\n**Port**\n\nThe listen port"},
		{`port: meta(8080, {title: "A"}) & meta(8080, {title: "B"})`,
			"```aontu\n8080\n```\n\n*integer*\n\n**A**\n\n**B**"},
	}
	for _, c := range cases {
		if h := Hover(c[0], 0, 11, false); nil == h || c[1] != h.Contents.Value {
			t.Errorf("%s: hover = %+v", c[0], h)
		}
	}
}

func TestHoverMiss(t *testing.T) {
	if h := Hover("port: 8080", 5, 0, false); h != nil {
		t.Errorf("expected nil hover off-document, got %+v", h)
	}
}

func TestCompletionsList(t *testing.T) {
	c := Completions("")
	if len(c) != 90 {
		t.Fatalf("expected 90 completions, got %d", len(c))
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
		"above", "below", "neq", "relate", "string", "number",
		"integer", "float", "biginteger", "bigdecimal", "true", "null", "any", "map", "list", "constraint"} {
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
	want := []string{"abnf", "above", "acyclic", "add", "apply", "below", "close", "contains", "content", "copy", "copyfiles", "decode", "deprecate", "div", "each", "emit", "empty", "encode", "esc", "file", "filter", "folder", "format", "fragment", "gen", "greatest", "hide", "ident", "inject", "inverse", "join", "key", "keyed", "least", "len", "line", "listitems", "lower", "match", "max", "maybe", "meta", "min", "mod", "move", "mul", "mulof", "must", "neq", "nof", "nom", "open", "pack", "parse", "path", "pick", "pref", "project", "re", "relate", "rem", "rep", "rest", "slot", "sort", "split", "sub", "sum", "super", "translate", "type", "unique", "upper", "usc", "when"}
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
	if len(items) != 90 {
		t.Errorf("expected 90 completion items, got %d", len(items))
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

func TestContributionsMarkdown(t *testing.T) {
	if "" != contributionsMarkdown(nil) {
		t.Fatal("empty should render nothing")
	}
	got := contributionsMarkdown([]aontu.WhyConjunct{
		{Canon: "1", Role: "literal",
			Site: aontu.WhySite{Col: -1, File: "", Row: -1}},
		{Canon: "integer", Role: "spread",
			Site: aontu.WhySite{Col: 3, File: "x.aontu", Row: 2}},
	})
	want := "\n\n---\n\nContributions:\n" +
		"- `1` — literal\n- `integer` — spread (x.aontu:2:3)"
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

// Twin: ts/test/lsp.test.ts lsp-key-and-path.
const keyPathSrc = "base: { port: 8080 }\ndb: { port: $.base.port }\n"

func rangeOf(l0, c0, l1, c1 int) Range {
	return Range{Position{l0, c0}, Position{l1, c1}}
}

func TestHoverOnAKeyShowsWhatUnifiedUnderIt(t *testing.T) {
	h := Hover(keyPathSrc, 0, 1, false)
	if nil == h || "```aontu\n{\"port\":8080}\n```\n\n*map*" != h.Contents.Value ||
		rangeOf(0, 0, 0, 4) != *h.Range {
		t.Fatalf("hover = %+v", h)
	}
}

func TestHoverOnAReferenceShowsThePathItReads(t *testing.T) {
	h := Hover(keyPathSrc, 1, 15, true)
	want := "```aontu\n8080\n```\n\n*integer*" +
		"\n\n---\n\nContributions:\n- `8080` — literal (1:15)"
	if nil == h || want != h.Contents.Value || rangeOf(1, 12, 1, 23) != *h.Range {
		t.Fatalf("hover = %+v", h)
	}
}

func TestPathDefinitionGoesToEverySiteOfThePath(t *testing.T) {
	at := func(line, character int) []Location {
		return PathDefinition(keyPathSrc, line, character, "file:///d.aontu", nil)
	}
	if got := at(1, 15); !reflect.DeepEqual(got,
		[]Location{{URI: "file:///d.aontu", Range: rangeOf(0, 14, 0, 18)}}) {
		t.Errorf("reference: %+v", got)
	}
	if got := at(1, 7); 2 != len(got) || (Position{0, 14}) != got[0].Range.Start ||
		(Position{1, 12}) != got[1].Range.Start {
		t.Errorf("key: %+v", got)
	}
	if got := at(0, 14); nil != got {
		t.Errorf("a plain value: %+v", got)
	}
	if got := PathDefinition("a: }", 0, 0, "file:///d.aontu", nil); nil != got {
		t.Errorf("unparsed: %+v", got)
	}
}

func TestKeyAndPathAcrossAnInclude(t *testing.T) {
	dir := t.TempDir()
	for name, text := range map[string]string{
		"base.aontu": "port: 8080\n", "far.aontu": "   5\n", "two.aontu": "2\n",
		"ref.aontu": "\n\n\n$.missing\n", "call.aontu": "\n\nfoo(1)\n",
		"deep.aontu": "  a: $.nope\n",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); nil != err {
			t.Fatal(err)
		}
	}
	trust := &aontu.TrustOptions{IncludeRoot: dir}
	src := `base: @"` + srcPath(dir) + `/base.aontu"` + "\nx: $.base.port\n"

	locs := PathDefinition(src, 1, 5, "file:///d.aontu", trust)
	if 1 != len(locs) || !strings.HasPrefix(locs[0].URI, "file:///") ||
		!strings.HasSuffix(locs[0].URI, "/base.aontu") || rangeOf(0, 6, 0, 10) != locs[0].Range {
		t.Fatalf("definition: %+v", locs)
	}

	// The key that holds the include answers with what the file wrote.
	if h := HoverTrust(src, 0, 1, false, trust); nil == h ||
		!strings.Contains(h.Contents.Value, `{"port":8080}`) {
		t.Fatalf("key hover: %+v", h)
	}

	// The loaded 5 is at 1:4 of its own file, which is the `@` here.
	far := `n: @"` + srcPath(dir) + `/far.aontu"` + "\n"
	if h := HoverTrust(far, 0, 3, false, trust); nil != h {
		t.Errorf("hover read another file's position here: %+v", h)
	}
	if h := HoverTrust(far, 0, 0, false, trust); nil == h ||
		!strings.Contains(h.Contents.Value, "\n5\n") {
		t.Errorf("key hover: %+v", h)
	}

	// A conflict with a loaded value is placed at the operand written here.
	ds := DiagnosticsTrust(`y: @"`+srcPath(dir)+`/two.aontu"`+"\ny: 3\n", nil, trust)
	if 1 != len(ds) || "scalar_value" != ds[0].Code || rangeOf(1, 3, 1, 4) != ds[0].Range {
		t.Errorf("diagnostics: %+v", ds)
	}

	// An error in what an include loads, with no operand here, is placed
	// at the `@` that loaded it.
	for file, code := range map[string]string{"ref": "no_path", "call": "unknown_function"} {
		at := DiagnosticsTrust(`v: @"`+srcPath(dir)+`/`+file+`.aontu"`+"\n", nil, trust)
		if 1 != len(at) || code != at[0].Code || rangeOf(0, 3, 0, 4) != at[0].Range {
			t.Errorf("%s: %+v", file, at)
		}
	}
	// Deeper in the file, it keeps the file's own row and column.
	deep := DiagnosticsTrust(`v: @"`+srcPath(dir)+`/deep.aontu"`+"\n", nil, trust)
	if 1 != len(deep) || "no_path" != deep[0].Code || rangeOf(0, 5, 0, 6) != deep[0].Range {
		t.Errorf("deep: %+v", deep)
	}
}

func TestAPathBecomesAFileURI(t *testing.T) {
	for path, want := range map[string]string{
		"/a/b c.aontu":         "file:///a/b%20c.aontu",
		`C:\a\b.aontu`:         "file:///C:/a/b.aontu",
		"/é/#?%.aontu":         "file:///%C3%A9/%23%3F%25.aontu",
		`\\host\share\b.aontu`: "file://host/share/b.aontu",
	} {
		if got := pathToURI(path); want != got {
			t.Errorf("%q: %q, want %q", path, got, want)
		}
	}
}

func TestTheHandlerGoesToAnAliasThenToAPath(t *testing.T) {
	h := NewHandler()
	open, _ := json.Marshal(map[string]any{"textDocument": map[string]any{
		"uri": "file:///d.aontu", "text": "%p = 1\n" + keyPathSrc}})
	h.Handle(Message{Method: "textDocument/didOpen", Params: open})
	def := func(line, character int) string {
		params, _ := json.Marshal(map[string]any{
			"textDocument": map[string]any{"uri": "file:///d.aontu"},
			"position":     map[string]any{"line": line, "character": character}})
		out, _ := json.Marshal(h.Handle(Message{ID: json.RawMessage("1"),
			Method: "textDocument/definition", Params: params})[0])
		return string(out)
	}
	if got := def(0, 1); !strings.Contains(got,
		`"result":{"uri":"file:///d.aontu","range":{"start":{"line":0,"character":0},"end":{"line":0,"character":2}}}`) {
		t.Errorf("alias: %s", got)
	}
	if got := def(2, 15); !strings.Contains(got,
		`"result":[{"uri":"file:///d.aontu","range":{"start":{"line":1,"character":14},"end":{"line":1,"character":18}}}]`) {
		t.Errorf("path: %s", got)
	}
	if got := def(1, 14); !strings.Contains(got, `"result":null`) {
		t.Errorf("a plain value: %s", got)
	}
}
