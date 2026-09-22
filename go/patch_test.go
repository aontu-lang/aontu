/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPatchLabelsFindingsWithTheirFiles(t *testing.T) {
	r := Patch("port: 3", "", []string{"$.port=5"}, &PatchOptions{
		EntryPath:   "sys.aontu",
		OverlayPath: "ov.aontu",
	})
	if VetInvalid != r.Verdict || 0 == len(r.Findings) {
		t.Fatalf("want invalid with findings: %+v", r)
	}
	files := []string{}
	for _, s := range r.Findings[0].Sites {
		files = append(files, s.File)
	}
	joined := strings.Join(files, ",")
	if !strings.Contains(joined, "sys.aontu") || !strings.Contains(joined, "ov.aontu") {
		t.Fatalf("finding does not name its files: %s", joined)
	}
}

func TestOffsetAtRefusesPositionsThatDoNotExist(t *testing.T) {
	src := "ab\ncd\n"
	cases := []struct {
		row, col, want int
		note           string
	}{
		{1, 1, 0, "start"},
		{2, 1, 3, "second line"},
		{2, 2, 4, "second line, second column"},
		{3, 1, 6, "one past the last character IS a position"},
		{0, 1, -1, "row 0"},
		{1, 0, -1, "col 0"},
		{-1, -1, -1, "the unsited site"},
		{9, 1, -1, "row past the end"},
		{1, 99, -1, "col past the end of the line"},
	}
	for _, c := range cases {
		if got := offsetAt(src, c.row, c.col); got != c.want {
			t.Fatalf("offsetAt(%d,%d) = %d, want %d (%s)",
				c.row, c.col, got, c.want, c.note)
		}
	}

	// A LAST LINE WITH NO NEWLINE runs off the end of the loop rather
	// than meeting a '\n', which is a different exit and needs its own
	// case: one past the last character is still a position, two is not.
	if got := offsetAt("ab", 1, 3); 2 != got {
		t.Fatalf("offsetAt past the last character = %d, want 2", got)
	}
	if got := offsetAt("ab", 1, 9); -1 != got {
		t.Fatalf("offsetAt well past the last character = %d, want -1", got)
	}
}

func TestOffsetAtConvertsUTF16ColumnsToBytes(t *testing.T) {
	src := "a\U0001F389b=x\n"
	// Column 5 is `=`, which is byte 6.
	if got := offsetAt(src, 1, 5); 6 != got {
		t.Fatalf("offsetAt = %d, want 6 (byte offset of `=`)", got)
	}
	if src[6] != '=' {
		t.Fatalf("fixture wrong: byte 6 is %q", src[6])
	}
	// And the round trip against rowCol, the inverse this must match.
	row, col := rowCol(src, 6)
	if 1 != row || 5 != col {
		t.Fatalf("rowCol(6) = %d:%d, want 1:5", row, col)
	}
}

func TestPatchRefusesAnOverlayThatLoadsAnotherDocument(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0o755); nil != err {
		t.Fatal(err)
	}
	incFile := filepath.Join(dir, "sub", "inc.aontu")
	if err := os.WriteFile(incFile, []byte("a: 42\n"), 0o600); nil != err {
		t.Fatal(err)
	}
	ovFile := filepath.Join(dir, "ov.aontu")
	// The coincidence: same row, same column, same text. The include is
	// written ABSOLUTE so it resolves with or without a base directory.
	overlay := "x: 42\n@\"" + filepath.ToSlash(incFile) + "\"\n"
	if err := os.WriteFile(ovFile, []byte(overlay), 0o600); nil != err {
		t.Fatal(err)
	}

	for _, opts := range []*PatchOptions{
		{InPlace: true, OverlayPath: ovFile},
		{InPlace: true}, // the library caller who names no path
	} {
		r := Patch("x: integer\na: integer", overlay, []string{"$.a=99"}, opts)
		if 0 != len(r.Replaced) {
			t.Fatalf("rewrote something: %+v", r.Replaced)
		}
		codes := []string{}
		for _, f := range r.Findings {
			codes = append(codes, f.Code)
		}
		if !strings.Contains(strings.Join(codes, ","), "patch_not_editable") {
			t.Fatalf("codes = %v", codes)
		}
		if !strings.Contains(r.Findings[0].Message, "loads another document") {
			t.Fatalf("message = %q", r.Findings[0].Message)
		}
		// AND `x: 42` IS UNTOUCHED, which is the whole point.
		if !strings.HasPrefix(r.Overlay, "x: 42\n") {
			t.Fatalf("overlay: %q", r.Overlay)
		}
		back, _ := os.ReadFile(incFile)
		if "a: 42\n" != string(back) {
			t.Fatalf("the included file was written: %q", string(back))
		}
	}
}

func TestPatchLastAssignmentAtAPathWins(t *testing.T) {
	r := Patch("a: integer", "a: 1\n", []string{"$.a=2", "$.a=3"},
		&PatchOptions{InPlace: true})
	if 1 != len(r.Replaced) || "3" != r.Replaced[0].To {
		t.Fatalf("replaced = %+v", r.Replaced)
	}
	if "a: 3\n" != r.Overlay {
		t.Fatalf("overlay = %q", r.Overlay)
	}
	if VetValid != r.Verdict {
		t.Fatalf("verdict = %s", r.Verdict)
	}
}

func TestPatchMalformedAssignmentRefusesTheWholeRun(t *testing.T) {
	r := Patch("a: integer", "a: 1\n", []string{"$.a=2", "nonsense"},
		&PatchOptions{InPlace: true})
	if VetError != r.Verdict {
		t.Fatalf("verdict = %s", r.Verdict)
	}
	if 0 != len(r.Replaced) || 0 != len(r.Appended) {
		t.Fatalf("wrote something: %+v", r)
	}
	if "a: 1\n" != r.Overlay {
		t.Fatalf("the overlay moved: %q", r.Overlay)
	}
	if "patch_assignment" != r.Findings[0].Code {
		t.Fatalf("code = %s", r.Findings[0].Code)
	}
}

// spanValue's refusals: text that does not stand alone as a value at
// all, and text that stands alone but is a CONSTRAINT rather than a pin.
func TestSpanValueSeparatesValuesFromConstraints(t *testing.T) {
	cases := []struct {
		src      string
		canon    string
		concrete bool
		ok       bool
	}{
		{"1", "1", true, true},
		{"0x1F", "31", true, true},
		{`"s"`, `"s"`, true, true},
		{"integer", "integer", false, true},
		{"above(0)", "above(0)", false, true},
		// `min` alone is a bare word, which is a STRING -- not the call
		// its site was pointing into.
		{"min", `"min"`, true, true},
		{"$", "", false, false},
		// TEXT THE PARSER REFUSES takes the error path, not the nil
		// one: `$` PARSES and means nothing, these do not parse at all.
		{")", "", false, false},
		{`"unclosed`, "", false, false},
		{"&", "", false, false},
	}
	for _, c := range cases {
		canon, concrete, ok := spanValue(c.src)
		if ok != c.ok || (c.ok && (canon != c.canon || concrete != c.concrete)) {
			t.Fatalf("spanValue(%q) = (%q, %v, %v), want (%q, %v, %v)",
				c.src, canon, concrete, ok, c.canon, c.concrete, c.ok)
		}
	}
}

// THE LAST CHECK BEFORE A SPLICE, exercised with sites the engine would
// never produce -- which is the only way to test a guard whose whole
// purpose is to catch a state the rest of the code says cannot happen.
// The TS twin is spanholds-refuses-what-it-cannot-account-for.
func TestSpanHoldsRefusesWhatItCannotAccountFor(t *testing.T) {
	src := "a: 42\nb: 7\n"
	at := func(row, col, l int) WhySite {
		return WhySite{Row: row, Col: col, Len: l}
	}

	// The site that describes the text: the only case a splice is
	// allowed to proceed from.
	if got := spanAt(src, at(1, 4, 2), "42"); "42" != got {
		t.Fatalf("spanAt = %q, want 42", got)
	}
	if !spanHolds(src, at(1, 4, 2), "42") {
		t.Fatal("the site that describes the text must hold")
	}

	if spanHolds(src, at(2, 4, 2), "42") {
		t.Fatal("held over different text")
	}

	// THE POSITION IS NOT IN THIS TEXT AT ALL.
	if got := spanAt(src, at(9, 1, 2), "42"); "" != got {
		t.Fatalf("spanAt past the end = %q, want empty", got)
	}
	if spanHolds(src, at(9, 1, 2), "42") {
		t.Fatal("held at a position that does not exist")
	}
	if spanHolds(src, at(-1, -1, 2), "") {
		t.Fatal("the unsited site must never hold, even against empty text")
	}

	if spanHolds(src, at(1, 4, 0), "42") {
		t.Fatal("held with a zero-length span")
	}

	utf := "\"a\U0001F389b\": \"old\"\n"
	if !spanHolds(utf, at(1, 9, 5), "\"old\"") {
		t.Fatalf("utf-16 column did not resolve: %q", spanAt(utf, at(1, 9, 5), "\"old\""))
	}
}

func TestVerifiedSiteRefusesTheSpanThatDoesNotHold(t *testing.T) {
	src := "a: 42\n"

	// The written conjunct: proceeds to a replacement site.
	good, gf := verifiedSite(src, "$.a", WhyConjunct{
		Canon: "42", Role: "literal",
		Site: WhySite{File: "over.aontu", Row: 1, Col: 4, Len: 2}, Src: "42",
	})
	if nil != gf {
		t.Fatalf("the written conjunct must not refuse: %+v", gf)
	}
	if nil == good || "42" != good.From || 1 != good.Row {
		t.Fatalf("wrong replacement site: %+v", good)
	}

	// The conjunct whose coordinates do not describe this text: the
	// write-safety refusal, class internal — the recorded span failing
	// to check out is the engine's fault, never the document's.
	bad, bf := verifiedSite(src, "$.a", WhyConjunct{
		Canon: "42", Role: "literal",
		Site: WhySite{File: "over.aontu", Row: 3, Col: 1, Len: 2}, Src: "42",
	})
	if nil != bad {
		t.Fatalf("a span that does not hold must not name a site: %+v", bad)
	}
	if nil == bf || "patch_span_mismatch" != bf.Code || "internal" != bf.Class {
		t.Fatalf("wrong refusal: %+v", bf)
	}
	if !strings.Contains(bf.Message, "cannot be verified before writing") {
		t.Fatalf("wrong message: %q", bf.Message)
	}
}
