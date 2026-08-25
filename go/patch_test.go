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

// THE FOREIGN-FILE REFUSAL. An included file's literal is editable, but
// not by an overlay that did not name it: the write would land in a
// document the caller did not name. Needs a real path on disk, which is
// why it is here and not in the shared rows.
func TestPatchRefusesALiteralInAnIncludedFile(t *testing.T) {
	dir := t.TempDir()
	incFile := filepath.Join(dir, "inc.aon")
	ovFile := filepath.Join(dir, "ov.aon")
	if err := os.WriteFile(incFile, []byte("shared: 42\n"), 0o600); nil != err {
		t.Fatal(err)
	}
	overlay := "@\"inc.aon\"\n"
	if err := os.WriteFile(ovFile, []byte(overlay), 0o600); nil != err {
		t.Fatal(err)
	}

	r := Patch("shared: integer", overlay, []string{"$.shared=7"},
		&PatchOptions{InPlace: true, OverlayPath: ovFile})

	if 0 != len(r.Replaced) {
		t.Fatalf("rewrote something: %+v", r.Replaced)
	}
	// THE REFUSAL IS ASSERTED; WHICH REFUSAL IS NOT, and that is a
	// recorded divergence rather than a looser test. This port cannot
	// name the file an included value came from -- Go's include loader
	// stamps the whole tree with the ENTRY document's url, so the
	// foreign-file check compares the overlay against itself and cannot
	// fire (test/spec/divergent.tsv; TypeScript answers
	// patch_not_editable naming inc.aon, Go answers patch_span_mismatch).
	//
	// What matters for SAFETY holds in both: the span verification
	// catches what the file check cannot, because the include's
	// coordinates do not describe the overlay's text. Nothing is written
	// either way, which is the property this mode promises.
	codes := []string{}
	for _, f := range r.Findings {
		codes = append(codes, f.Code)
	}
	joined := strings.Join(codes, ",")
	if !strings.Contains(joined, "patch_not_editable") &&
		!strings.Contains(joined, "patch_span_mismatch") {
		t.Fatalf("neither refusal raised: %v", codes)
	}
	// AND THE FILE ON DISK IS UNTOUCHED, which is the point.
	back, _ := os.ReadFile(incFile)
	if "shared: 42\n" != string(back) {
		t.Fatalf("the included file was written: %q", string(back))
	}
}

// THE SPAN VERIFICATION, reached the way it is meant to be: an included
// literal with NO OverlayPath, so the foreign-file guard cannot fire and
// the verification is the only thing between the include's coordinates
// and this file's text.
func TestPatchRefusesASpanTheOverlayDoesNotHold(t *testing.T) {
	dir := t.TempDir()
	incFile := filepath.Join(dir, "inc.aon")
	if err := os.WriteFile(incFile,
		[]byte("# a comment that pushes the literal well down the file\nshared: 42\n"),
		0o600); nil != err {
		t.Fatal(err)
	}
	overlay := "@\"" + filepath.ToSlash(incFile) + "\"\n"

	r := Patch("shared: integer", overlay, []string{"$.shared=7"},
		&PatchOptions{InPlace: true})

	if 0 != len(r.Replaced) {
		t.Fatalf("rewrote something: %+v", r.Replaced)
	}
	codes := []string{}
	for _, f := range r.Findings {
		codes = append(codes, f.Code)
	}
	if !strings.Contains(strings.Join(codes, ","), "patch_span_mismatch") {
		t.Fatalf("codes = %v", codes)
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
