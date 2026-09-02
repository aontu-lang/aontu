/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// What the two ports must AGREE on about the tree view -- the rendered
// text and the refusals -- is test/spec/view.tsv. This file holds the
// arms that are this port's own: the parse-failure path `parseEntry`
// gives Go, which collect mode gives TypeScript on the context instead,
// and the nil-root-with-no-error fallback.

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

// ---------------------------------------------------------------------
// The kinds beyond the tree: what the shared rows cannot reach from an
// inline source -- files, includes, and a verdict matrix the checker
// cannot be made to produce.

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
		{"", "dir/entry.aon", "entry.aon"},
		{"dir/entry.aon", "dir/entry.aon", "entry.aon"},
		{"lib/x.aon", "dir/entry.aon", "lib/x.aon"},
		{"/abs/x.aon", "", "/abs/x.aon"},
	} {
		if got := viewDocName(c.file, c.entry); got != c.want {
			t.Fatalf("viewDocName(%q, %q) = %q, want %q", c.file, c.entry, got, c.want)
		}
	}
	abs := filepath.Join(t.TempDir(), "sub", "inc.aon")
	entry := filepath.Join(filepath.Dir(filepath.Dir(abs)), "entry.aon")
	if got := viewDocName(abs, entry); filepath.Join("sub", "inc.aon") != got {
		t.Fatalf("relative = %q", got)
	}
}

// A MULTI-FILE DOCUMENT: the layers panel names the files an include
// wrote into relative to the entry, and the ladder's rungs sort by
// file and then by column.
func TestViewOverIncludedFiles(t *testing.T) {
	dir := t.TempDir()
	viewTempDoc(t, dir, "lib/base.aon", "a: {x: **1 & integer, y: 2}\n")
	entry := viewTempDoc(t, dir, "entry.aon", "@\"./lib/base.aon\"\na: {x: *2 & integer, z: 3}\n")
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
	if !strings.Contains(*layers.Text, "# layers  file=entry.aon  documents=2") ||
		!strings.Contains(*layers.Text, filepath.Join("lib", "base.aon")) {
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
	// The rank-1 rung first; then the rank-0 rungs by file -- the FULL
	// path, so `<dir>/entry.aon` before `<dir>/lib/base.aon` -- and,
	// within entry.aon's one row, by column.
	want := "c0[\"**1<br/>pref | base.aon:1:8\"]\n  c1[\"*2<br/>pref | entry.aon:2:8\"]\n" +
		"  c2[\"integer<br/>literal | entry.aon:2:13\"]\n  c3[\"integer<br/>literal | base.aon:1:14\"]"
	if !strings.Contains(*ladder.Text, want) {
		t.Fatalf("ladder text:\n%s", *ladder.Text)
	}

	// The poset labels a document by its file, and a further document
	// by its own path.
	other := viewTempDoc(t, dir, "wide.aon", "a: {x: integer, y: integer, z: integer}\n")
	osrc, _ := os.ReadFile(other)
	poset := a.View(string(src), &ViewOptions{Kind: "poset", Profile: "values",
		Docs: []ViewDoc{{Src: string(osrc), Path: other}}})
	if "rendered" != poset.Verdict || !strings.Contains(*poset.Text, "n0[\"entry\"]\n  n1[\"wide\"]\n  n0 --> n1") {
		t.Fatalf("poset = %+v %s", poset, *poset.Text)
	}
}

// THE PROVENANCE RECORD CAN NAME A PATH THE DOCUMENT DOES NOT HAVE
// (use-cases/BUGS.md 70): a spread template's own child is met under
// each key it is spread over. The panel shows the document's paths
// only.
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

// A VERDICT MATRIX THE CHECKER CANNOT BE MADE TO PRODUCE: a chain the
// closure implies but the checker measured as does_not_subsume is
// reported as order_intransitive rather than absorbed, and a class
// label with a line terminator is refused.
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
