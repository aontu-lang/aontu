/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE FORMATTER'S OWN CASES (docs/design/FMT.0.md), the Go twin of
// ts/test/format.test.ts. What the two ports must AGREE on -- the form
// itself -- is pinned row by row in test/spec/fmt.tsv and executed by
// both spec runners. What is here is the rest: the self-check's refusal
// (reached by swapping the check, since a formatter that is right never
// takes that arm on its own), the unified diff, and the corpus gate --
// every document under use-cases/ and test/spec/files/ formats to a
// fixed point.

package aontu

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestFormatReportsWhatChanged(t *testing.T) {
	a := New()
	same := a.Format("a: 1\n")
	if "formatted" != same.Verdict || "a: 1\n" != same.Text || same.Changed {
		t.Fatalf("clean document: %+v", same)
	}

	// Line endings are the checkout's business, not the document's:
	// CRLF formats to LF, and that IS a change.
	crlf := a.Format("a: 1\r\n")
	if "a: 1\n" != crlf.Text || !crlf.Changed {
		t.Fatalf("crlf: %+v", crlf)
	}
}

// A document that does not parse is not formatted, and the report says
// why in the finding shape every verb uses, the file named.
func TestFormatRefusesASyntaxError(t *testing.T) {
	a := New()
	a.File = "broken.aon"
	r := a.Format("a: {b\n")
	if "error" != r.Verdict || 1 != len(r.Errors) {
		t.Fatalf("want one error: %+v", r)
	}
	f := r.Errors[0]
	if "syntax" != f.Code || "parse" != f.Class || "broken.aon" != f.Sites[0].File {
		t.Fatalf("finding: %+v", f)
	}

	// A merge-conflict marker is refused before the parse, as
	// everywhere else.
	m := New().Format("<<<<<<< HEAD\na: 1\n=======\na: 2\n>>>>>>> other\n")
	if "error" != m.Verdict || "merge_conflict" != m.Errors[0].Code {
		t.Fatalf("conflict: %+v", m)
	}
}

// THE DEPTH BUDGET: a document nested past the evaluation budget is
// refused as a finding, in both ports at the same depth, rather than
// left to whichever port's stack gives out first.
func TestFormatRefusesPastTheDepthBudget(t *testing.T) {
	nest := func(n int) string {
		return "a:" + strings.Repeat("{b:", n) + "1" + strings.Repeat("}", n) + "\n"
	}
	ok := New().Format(nest(999))
	if "formatted" != ok.Verdict || "a: "+strings.Repeat("b: ", 999)+"1\n" != ok.Text {
		t.Fatalf("999 levels: %s %q", ok.Verdict, ok.Text[:40])
	}
	deep := New().Format(nest(1000))
	if "error" != deep.Verdict || "max_depth" != deep.Errors[0].Code || "budget" != deep.Errors[0].Class {
		t.Fatalf("1000 levels: %+v", deep)
	}
}

// THE SELF-CHECK. The formatter re-parses what it wrote and compares
// the two trees; a disagreement is its own defect, so it writes
// nothing and says so, with both spellings in the finding. The check
// is a package variable because a correct formatter never fails it.
func TestFormatRefusesItsOwnDefect(t *testing.T) {
	orig := formatSame
	defer func() { formatSame = orig }()

	formatSame = func(root Val, after string) bool { return false }
	r := New().Format("a: {b: 1}\n")
	if "error" != r.Verdict {
		t.Fatalf("want a refusal: %+v", r)
	}
	f := r.Errors[0]
	if "format_check" != f.Code || "internal" != f.Class ||
		`{"a":{"b":1}}` != *f.Expected || "a: b: 1\n" != *f.Actual ||
		"a formatter defect: please report it with the source" != *f.Note {
		t.Fatalf("finding: %+v", f)
	}

	a := New()
	a.File = "doc.aon"
	named := a.Format("a: 1\n")
	if "a formatter defect: please report it with the source (doc.aon)" != *named.Errors[0].Note {
		t.Fatalf("note: %q", *named.Errors[0].Note)
	}

	// The check sees the parsed root and the text about to be written.
	var seen []string
	formatSame = func(root Val, after string) bool {
		seen = []string{root.Canon(), after}
		return true
	}
	ok := New().Format("a: 1\n")
	if "formatted" != ok.Verdict || 2 != len(seen) || `{"a":1}` != seen[0] || "a: 1\n" != seen[1] {
		t.Fatalf("hook: %+v %v", ok, seen)
	}

	// And the real check, on a text that is not the document.
	if formatSameDocument(New().mustParse(t, "a: 1"), "a: 2\n") {
		t.Fatal("a different document passed the check")
	}
	if formatSameDocument(New().mustParse(t, "a: 1"), "a: {\n") {
		t.Fatal("an unclosed map is not `a: 1`")
	}
	if !formatSameDocument(New().mustParse(t, "a: {b: 1}"), "a: b: 1\n") {
		t.Fatal("a chain is the braced map")
	}
	if formatSameDocument(New().mustParse(t, "a: 1"), "a: {b\n") {
		t.Fatal("a text that does not parse is no document")
	}
}

// THE LAWFUL TIER'S CHECK (FMT.0.md §7.3). A merge or a repeat stays
// only where the engine agrees the two spellings meet the same; the
// check is a package variable so the spelling it keeps can be
// exercised, and it sees both spellings.
func TestFormatKeepsTheSpellingTheEngineRefuses(t *testing.T) {
	orig := formatMeet
	defer func() { formatMeet = orig }()

	var seen [][2]string
	formatMeet = func(before, after string) bool {
		seen = append(seen, [2]string{before, after})
		return false
	}
	keep := New().Format("s: a: 1\ns: b: 2\n")
	if "formatted" != keep.Verdict || "s: a: 1\ns: b: 2\n" != keep.Text || keep.Changed {
		t.Fatalf("kept: %+v", keep)
	}
	if 1 != len(seen) || "s: a: 1\ns: b: 2\n" != seen[0][0] || "s: { a:1 b:2 }\n" != seen[0][1] {
		t.Fatalf("seen: %q", seen)
	}

	formatMeet = func(before, after string) bool { return true }
	if take := New().Format("s: a: 1\ns: b: 2\n"); "s: { a:1 b:2 }\n" != take.Text {
		t.Fatalf("taken: %q", take.Text)
	}

	// A statement inside a block is checked at its indentation, and
	// only it keeps its spelling before.
	W := strings.Repeat("x", 60)
	block := "s: {\n  a: 1\n  b: [\n    " + W + "\n    " + W + "\n  ]\n"
	seen = nil
	formatMeet = func(before, after string) bool {
		seen = append(seen, [2]string{before, after})
		return false
	}
	V := strings.Repeat("y", 70)
	inner := New().Format(block + "  c: { " + V + ": 1 d: 2 }\n}\n")
	if block+"  c: {\n    "+V+": 1\n    d: 2\n  }\n}\n" != inner.Text {
		t.Fatalf("inner: %q", inner.Text)
	}
	if 1 != len(seen) || "  c: {\n    "+V+": 1\n    d: 2\n  }\n" != seen[0][0] ||
		"  c: "+V+": 1\n  c: d: 2\n" != seen[0][1] {
		t.Fatalf("inner seen: %q", seen)
	}

	// The real check: the meet, and the kinds of failure, not their
	// count -- one unresolved reference is reported once by a block
	// and once per key it reaches by the statements.
	formatMeet = orig
	if !formatSameByMeet("s: a: $.t\ns: b: 2\n", "s: { a:$.t b:2 }\n") {
		t.Fatal("the same unresolved reference")
	}
	if formatSameByMeet("s: a: 1\n", "s: a: 2\n") {
		t.Fatal("a different value")
	}
	if !formatSameByMeet("c: { &: $.e }\nc: a: 1\nc: b: 2\n", "c: { &: $.e a:1 b:2 }\n") {
		t.Fatal("no_path once and no_path thrice are one kind")
	}

	// The outcome of generation is compared as GenerateVars decides it:
	// a nil root's own kind, and the relation verdict after a
	// generation that succeeded.
	if !formatSameByMeet("nil\n", "nil\n") || !strings.HasSuffix(formatMeetOf("nil\n"), "\nliteral_nil") {
		t.Fatalf("nil root: %q", formatMeetOf("nil\n"))
	}
	rel := "a: { dependsOn: rel() & inverse(usedBy) & [path($.b)] }\nb: {}\n"
	if !strings.HasSuffix(formatMeetOf(rel), "\nrelation_inverse_missing") {
		t.Fatalf("relation verdict: %q", formatMeetOf(rel))
	}

	// The engine's own repros: §76 of use-cases/BUGS.md is a map the
	// TypeScript port evaluates differently as one map and as three
	// statements, so the merge is refused there and taken here. Goes
	// with §76.
	raw, err := os.ReadFile(filepath.Join("..", "use-cases", "repros", "key-func", "spread-key-through-deep-ref.aon"))
	if err != nil {
		t.Fatal(err)
	}
	if taken := New().Format(string(raw)); !strings.Contains(taken.Text, "a: b: { c:d:e:$.a.b.f f:{ &: { n:key() } x:{} } }\n") {
		t.Fatalf("repro: %q", taken.Text)
	}
}

func (a *Aontu) mustParse(t *testing.T, src string) Val {
	t.Helper()
	v, err := a.Parse(src)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// THE LINT (§4) is asked for, never assumed: without the option the
// report carries no findings, and with it the findings say where. The
// rules themselves are pinned row by row in fmt.tsv.
func TestFormatLintsOnlyWhenAsked(t *testing.T) {
	a := New()
	src := "a: 1\r\nHTTP_PORT: 8080\r\n"
	plain := a.Format(src)
	if nil == plain.Findings || 0 != len(plain.Findings) {
		t.Fatalf("unasked: %+v", plain.Findings)
	}
	linted := a.FormatWith(src, FormatOptions{Lint: true})
	// CRLF is read as LF before the lint counts, so the positions are
	// the file's lines.
	want := []LintFinding{{Rule: "style/key-case", Line: 2, Col: 1,
		Message: "key HTTP_PORT holds an underscore; httpPort would follow the form"}}
	if !reflect.DeepEqual(linted.Findings, want) || "a: 1\nHTTP_PORT: 8080\n" != linted.Text {
		t.Fatalf("linted: %+v %q", linted.Findings, linted.Text)
	}
	// A document that does not format has no findings to report.
	if bad := a.FormatWith("a: {b", FormatOptions{Lint: true}); "error" != bad.Verdict || nil != bad.Findings {
		t.Fatalf("error report: %+v", bad)
	}
}

func TestUnifiedDiff(t *testing.T) {
	cases := []struct{ name, before, after, want string }{
		{"same", "a\n", "a\n", ""},
		{"empty", "", "", ""},
		{"one line", "a\n", "b\n", "--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n"},
		// Into an empty file, and out of one.
		{"into empty", "", "a\nb\n", "--- a/x\n+++ b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n"},
		{"to empty", "a\n", "", "--- a/x\n+++ b/x\n@@ -1,1 +0,0 @@\n-a\n"},
		// A missing final newline is a difference, and is said as diff
		// says it.
		{"no newline", "a", "a\n",
			"--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+a\n"},
		// Lines that repeat on both sides -- closers, blanks -- are no
		// anchors, and the gap between anchors recurses to the plain
		// delete-and-insert.
		{"repeated lines", "x: {\n  a: 1\n}\ny: {\n  b: 2\n}\n", "x: {\n  a: 1\n  c: 3\n}\ny: {\n  b: 2\n}\n",
			"--- a/x\n+++ b/x\n@@ -1,5 +1,6 @@\n x: {\n   a: 1\n+  c: 3\n }\n y: {\n   b: 2\n"},
		// Nothing in common at all: everything out, everything in.
		{"disjoint", "a\nb\n", "c\nd\n", "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d\n"},
		// A line that MOVED: the unique lines are out of order across
		// the sides, so the chain keeps one of them and the other is a
		// deletion and an insertion.
		{"moved line", "a\nb\nc\nd\n", "a\nc\nb\nd\n",
			"--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@\n a\n-b\n c\n+b\n d\n"},
	}
	for _, c := range cases {
		if got := UnifiedDiff("x", c.before, c.after); got != c.want {
			t.Errorf("%s:\n want %q\n got  %q", c.name, c.want, got)
		}
	}

	// Two changes far apart are two hunks, three lines of context each;
	// the unique lines between them are the anchors.
	lines := make([]string, 20)
	for i := range lines {
		lines[i] = "line " + itoa(i)
	}
	before := strings.Join(lines, "\n") + "\n"
	edited := append([]string{}, lines...)
	edited[2] = "changed 2"
	edited = append(edited[:17], append([]string{"inserted"}, edited[17:]...)...)
	want := "--- a/f.aon\n+++ b/f.aon\n" +
		"@@ -1,6 +1,6 @@\n line 0\n line 1\n-line 2\n+changed 2\n line 3\n line 4\n line 5\n" +
		"@@ -15,6 +15,7 @@\n line 14\n line 15\n line 16\n+inserted\n line 17\n line 18\n line 19\n"
	if got := UnifiedDiff("f.aon", before, strings.Join(edited, "\n")+"\n"); got != want {
		t.Fatalf("two hunks:\n want %q\n got  %q", want, got)
	}
}

// THE CORPUS GATE (FMT.0.md §7.5): every document in the repository
// that parses formats to a fixed point, and every one that does not is
// refused for its syntax, or its depth, and nothing else.
func TestEveryCorpusDocumentFormatsToAFixedPoint(t *testing.T) {
	var files []string
	for _, dir := range []string{filepath.Join("..", "use-cases"), filepath.Join("..", "test", "spec", "files")} {
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if !info.IsDir() && strings.HasSuffix(path, ".aon") {
				files = append(files, path)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(files) <= 300 {
		t.Fatalf("too few documents: %d", len(files))
	}
	var failures []string
	formatted := 0
	for _, file := range files {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		a := New()
		a.File = file
		r := a.Format(string(raw))
		if "error" == r.Verdict {
			if "syntax" != r.Errors[0].Code && "max_depth" != r.Errors[0].Code {
				failures = append(failures, file+": refused with "+r.Errors[0].Code)
			}
			continue
		}
		formatted++
		again := a.Format(r.Text)
		switch {
		case "error" == again.Verdict:
			failures = append(failures, file+": the formatted text does not format: "+again.Errors[0].Code)
		case again.Text != r.Text:
			failures = append(failures, file+": not a fixed point")
		case again.Changed:
			failures = append(failures, file+": a fixed point that reports a change")
		}
	}
	if 0 < len(failures) {
		t.Fatalf("%s", strings.Join(failures, "\n"))
	}
	if formatted <= 300 {
		t.Fatalf("too few documents formatted: %d", formatted)
	}
}
