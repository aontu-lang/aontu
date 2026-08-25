/* Copyright (c) 2025 Richard Rodger, MIT License */

// The patch API around the shared rows (G7 phase 5). The report itself
// is pinned by test/spec/patch.tsv; what is left here is the options,
// which cross-package CLI runs do not count toward this package's
// coverage.

package aontu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// With EntryPath and OverlayPath given, a finding names those files
// rather than Vet's generic schema/data labels: with two documents
// that both belong to the caller, "which file" is the whole question.
func TestPatchLabelsFindingsWithTheirFiles(t *testing.T) {
	r := Patch("port: 3", "", []string{"$.port=5"}, &PatchOptions{
		EntryPath:   "sys.aon",
		OverlayPath: "ov.aon",
	})
	if VetInvalid != r.Verdict || 0 == len(r.Findings) {
		t.Fatalf("want invalid with findings: %+v", r)
	}
	files := []string{}
	for _, s := range r.Findings[0].Sites {
		files = append(files, s.File)
	}
	joined := strings.Join(files, ",")
	if !strings.Contains(joined, "sys.aon") || !strings.Contains(joined, "ov.aon") {
		t.Fatalf("finding does not name its files: %s", joined)
	}
}

// OFFSET ARITHMETIC, at its edges. Every one of these is a position that
// does not exist, and the answer to a position that does not exist is -1
// -- never an offset that happens to be in range. The TS twin is
// ts/test/patch.test.ts, offsetat-refuses-positions-that-do-not-exist.
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

// COLUMNS COUNT UTF-16 CODE UNITS AND GO STRINGS ARE BYTES, so the
// conversion is the whole job: an astral character before the value is
// TWO columns and FOUR bytes, and reading the column as a byte count
// would land inside it.
func TestOffsetAtConvertsUTF16ColumnsToBytes(t *testing.T) {
	// "a🎉b" is 4 UTF-16 units (a, the surrogate pair, b) and 6 bytes.
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

// AN OVERLAY THAT LOADS ANOTHER DOCUMENT CANNOT BE EDITED IN PLACE, and
// this is the case that makes it necessary rather than tidy.
//
// The include holds `a: 42` at row 1 column 4; the overlay holds
// `x: 42` at row 1 column 4. The site is a real site, the text at the
// span really is `42`, and the span verification therefore PASSES -- so
// a splice that trusted it would rewrite `x` while reporting a
// replacement of `$.a`, with a valid verdict and no findings. The site's
// File cannot save it: this port names the ENTRY document for an
// included value (issue #66), so the comparison is the overlay against
// itself, and a library caller need not pass OverlayPath at all.
//
// Denying includes removes the ambiguity at its source: what resolves is
// what this text says by itself. The TS twin is
// refuses-an-overlay-that-loads-another-document.
func TestPatchRefusesAnOverlayThatLoadsAnotherDocument(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0o755); nil != err {
		t.Fatal(err)
	}
	incFile := filepath.Join(dir, "sub", "inc.aon")
	if err := os.WriteFile(incFile, []byte("a: 42\n"), 0o600); nil != err {
		t.Fatal(err)
	}
	ovFile := filepath.Join(dir, "ov.aon")
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

// TWO ASSIGNMENTS AT ONE PATH. The second is the one the author wrote
// last, so it wins -- and the first is DROPPED rather than layered,
// because splicing the same span twice would write one value inside the
// other.
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

// A malformed assignment is refused before anything is written, and the
// report says which one. Replaced is EMPTY rather than nil: an emitter
// that dropped the field would make the two ports differ.
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

	// THE TEXT IS DIFFERENT. An included literal's coordinates applied
	// to this file used to reach here; nothing does now, and it still
	// must refuse.
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

	// A ZERO-LENGTH SPAN never holds against real text.
	if spanHolds(src, at(1, 4, 0), "42") {
		t.Fatal("held with a zero-length span")
	}

	// AND THE UTF-16 CONVERSION, at the one place it decides a write:
	// the astral character is two columns and four bytes.
	utf := "\"a\U0001F389b\": \"old\"\n"
	if !spanHolds(utf, at(1, 9, 5), "\"old\"") {
		t.Fatalf("utf-16 column did not resolve: %q", spanAt(utf, at(1, 9, 5), "\"old\""))
	}
}
