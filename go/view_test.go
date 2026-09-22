/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestViewTreeUnparseableSource(t *testing.T) {
	// An unclosed STRING does not parse, which is what reaches
	// parseEntry's error return.
	r := New().ViewTree("a: \"unterminated", nil)
	if "error" != r.Verdict || "tree" != r.Kind {
		t.Fatalf("verdict %q kind %q, want error tree", r.Verdict, r.Kind)
	}
	if 1 != len(r.Errors) || "" == r.Errors[0].Code {
		t.Fatalf("errors: %v", r.Errors)
	}
	if nil != r.Text {
		t.Fatalf("a refusal carried a figure: %q", *r.Text)
	}
}

// A NIL ROOT WITH AN EMPTY ERROR LIST (use-cases/BUGS.md 43): the
// id-spread refusal IS the root, so ctx.err is empty and the finding
// is built from the root itself.
func TestViewTreeNilRootWithNoCollectedError(t *testing.T) {
	r := New().ViewTree("&:\n", &ViewOptions{})
	if "error" != r.Verdict {
		t.Fatalf("verdict %q, want error", r.Verdict)
	}
	if 1 != len(r.Errors) || "" == r.Errors[0].Code {
		t.Fatalf("errors: %v", r.Errors)
	}
}

// A rendered figure is present even when empty: a model with no links
// draws nothing, honestly, rather than refusing.
func TestViewTreeOfNoEdgesIsAnEmptyFigure(t *testing.T) {
	r := New().ViewTree("a: 1\n", nil)
	if "rendered" != r.Verdict || nil == r.Text || "" != *r.Text {
		t.Fatalf("report: %+v", r)
	}
}


func viewTempDoc(t *testing.T, dir, name, src string) string {
	t.Helper()
	file := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestViewDocName(t *testing.T) {
	for _, c := range []struct{ file, entry, want string }{
		{"", "", "-"},
		{"", "dir/entry.aontu", "entry.aontu"},
		{"dir/entry.aontu", "dir/entry.aontu", "entry.aontu"},
		{"lib/x.aontu", "dir/entry.aontu", "lib/x.aontu"},
		{"/abs/x.aontu", "", "/abs/x.aontu"},
	} {
		if got := viewDocName(c.file, c.entry); got != c.want {
			t.Fatalf("viewDocName(%q, %q) = %q, want %q", c.file, c.entry, got, c.want)
		}
	}
	abs := filepath.Join(t.TempDir(), "sub", "inc.aontu")
	entry := filepath.Join(filepath.Dir(filepath.Dir(abs)), "entry.aontu")
	if got := viewDocName(abs, entry); filepath.Join("sub", "inc.aontu") != got {
		t.Fatalf("relative = %q", got)
	}
}

// A MULTI-FILE DOCUMENT: the layers panel names the files an include
// wrote into relative to the entry, and the ladder's rungs sort by
// file and then by column.
func TestViewOverIncludedFiles(t *testing.T) {
	dir := t.TempDir()
	viewTempDoc(t, dir, "lib/base.aontu", "a: {x: **1 & integer, y: 2}\n")
	entry := viewTempDoc(t, dir, "entry.aontu", "@\"./lib/base.aontu\"\na: {x: *2 & integer, z: 3}\n")
	src, _ := os.ReadFile(entry)
	a := NewWithBase(dir)
	a.File = entry
	a.Trust = &TrustOptions{IncludeRoot: dir}

	layers := a.View(string(src), &ViewOptions{Kind: "layers"})
	if "rendered" != layers.Verdict {
		t.Fatalf("layers = %+v", layers)
	}
	// The included file is named relative to the entry, in the host's
	// own separator.
	if !strings.Contains(*layers.Text, "# layers  file=entry.aontu  documents=2") ||
		!strings.Contains(*layers.Text, filepath.Join("lib", "base.aontu")) {
		t.Fatalf("layers text:\n%s", *layers.Text)
	}
	if r := a.View(string(src), &ViewOptions{Kind: "layers", MaxRows: 1}); "error" != r.Verdict ||
		"view_rows_exceeded" != r.Errors[0].Code {
		t.Fatalf("layers max rows = %+v", r)
	}

	ladder := a.View(string(src), &ViewOptions{Kind: "ladder", At: "$.a.x"})
	if "rendered" != ladder.Verdict {
		t.Fatalf("ladder = %+v", ladder)
	}
	want := "c0[\"**1<br/>pref | base.aontu:1:8\"]\n  c1[\"*2<br/>pref | entry.aontu:2:8\"]\n" +
		"  c2[\"integer<br/>literal | entry.aontu:2:13\"]\n  c3[\"integer<br/>literal | base.aontu:1:14\"]"
	if !strings.Contains(*ladder.Text, want) {
		t.Fatalf("ladder text:\n%s", *ladder.Text)
	}

	// The poset labels a document by its file, and a further document
	// by its own path.
	other := viewTempDoc(t, dir, "wide.aontu", "a: {x: integer, y: integer, z: integer}\n")
	osrc, _ := os.ReadFile(other)
	poset := a.View(string(src), &ViewOptions{Kind: "poset", Profile: "values",
		Docs: []ViewDoc{{Src: string(osrc), Path: other}}})
	if "rendered" != poset.Verdict || !strings.Contains(*poset.Text, "n0[\"entry\"]\n  n1[\"wide\"]\n  n0 --> n1") {
		t.Fatalf("poset = %+v %s", poset, *poset.Text)
	}
}

func TestViewLayersSkipsPathsTheDocumentLacks(t *testing.T) {
	src := "a: {b: 1}\n"
	a := New()
	prov := newProvenance(src, map[string]string{})
	root, _, errs := a.viewLoad(src, prov)
	if nil != errs {
		t.Fatal(errs)
	}
	// A record at a path the document does not have, and a record
	// nothing contributed to: neither is a row.
	ghost := prov.paths["a.b"].conjuncts[0]
	prov.paths["a.ghost"] = &whyPathRecord{conjuncts: []whyContribution{ghost}}
	prov.paths["a.empty"] = &whyPathRecord{}
	loss := []ViewLoss{}
	text, ferrs := drawLayers(prov, root, "", "", 0, 0, "text", "none", 60, &loss)
	if nil != ferrs || strings.Contains(text, "ghost") || strings.Contains(text, "empty") {
		t.Fatalf("layers = %q %v", text, ferrs)
	}
}

func TestViewPosetInjectedVerdicts(t *testing.T) {
	docs := []viewPosetDoc{{src: "a", label: "a"}, {src: "b", label: "b"}, {src: "c", label: "c"}}
	compare := func(g, s viewPosetDoc) (string, string) {
		switch g.label + s.label {
		case "ab", "bc":
			return SubsumeYes, ""
		case "ac":
			return SubsumeNo, "compat_narrowed"
		}
		return SubsumeNo, "compat_narrowed"
	}
	loss := []ViewLoss{}
	text, errs := New().drawPoset(docs, "", "", "mermaid", 60, &loss, compare)
	if nil != errs || !strings.Contains(text, "n1 --> n0\n  n2 --> n1") {
		t.Fatalf("poset = %q %v", text, errs)
	}
	if 1 != len(loss) || "order_intransitive" != loss[0].Code || "c < a" != loss[0].Detail[0] {
		t.Fatalf("loss = %+v", loss)
	}

	bad := []viewPosetDoc{{src: "a", label: "a\nb"}}
	if _, errs = New().drawPoset(bad, "", "", "dot", 60, &loss, compare); nil == errs ||
		"view_line_break" != errs[0].Code {
		t.Fatalf("line break = %v", errs)
	}
}

// ViewDefaultProfile is the kind-to-profile table cmd/aontu reads to
// resolve `--style auto` before the library runs. Its own arms: a kind
// that has profiles, and one that is not a kind at all.
func TestViewDefaultProfile(t *testing.T) {
	for kind, want := range map[string]string{
		"doc": "text", "tree": "text", "matrix": "text",
		"graph": "mermaid", "layer": "text", "sets": "text",
		"layers": "text", "ladder": "mermaid", "poset": "mermaid",
		"nope": "",
	} {
		if got := ViewDefaultProfile(kind); want != got {
			t.Fatalf("ViewDefaultProfile(%q) = %q, want %q", kind, got, want)
		}
	}
}

func TestViewDocWalksAList(t *testing.T) {
	a := New()
	root, _, errs0 := a.viewLoad(`a: [1, {b: "x"}]`, nil)
	if nil != errs0 {
		t.Fatal(errs0)
	}
	loss := []ViewLoss{}
	text, errs := drawDoc(root, "$", 3, "text", "none", 60, &loss)
	if nil != errs {
		t.Fatal(errs)
	}
	want := "$\n└── a\n    ├── 0 1\n    └── 1\n        └── b \"x\""
	if want != text {
		t.Fatalf("list walk =\n%q\nwant\n%q", text, want)
	}
}
