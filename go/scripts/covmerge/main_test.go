/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// WHAT A MARKER REACHES, pinned from both directions, because both
// directions have been wrong.
//
// Too SHORT: `go tool cover` decides where an if-body's coverage block
// begins and it moved -- go1.24 opened it at the `{`, on the `if` line,
// a later release at the body's first statement. A marker that covered
// only its own line matched the first and not the second, so every
// guard in the tree silently lost its exclusion and forty-two justified
// sites came back as ADR-002 failures. Nothing caught it until the
// coverage gate first ran in CI, on a newer toolchain than the
// contributor machines.
//
// Too LONG: widening to the whole statement instead reached past the
// if-body into the `else` chain -- a SIBLING arm the author never
// marked -- and excused genuinely untested code. That is the one
// failure this tool must never have, and it is invisible: the gate goes
// green.
//
// So the reach is the BODY, brace to brace, compared by position rather
// than by line -- because a closing brace shares its line with the
// `else if` that follows it.

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// sample is written with LINE MARKERS in it (@name), so the assertions
// below name lines by meaning rather than by number: adding a line to
// the source cannot silently decouple a hard-coded key from what its
// comment claims it is.
const sample = `package sample

func guard(s string) bool {
	n, err := parse(s)
	if err != nil { //coverage:ignore the caller already vetted it @if
		return false @ifbody
	} else if n > 100 { @elseif
		return false @elsebody
	}
	//coverage:ignore-block registration cannot fail here
	if err := use(n); err != nil { @block
		return false @blockbody
	}
	//coverage:ignore this marker sits on no statement at all @orphan
	return true @tail
}
`

// world writes the sample beside a go.mod, chdirs into it, and returns
// a lookup from marker name to line number.
func world(t *testing.T) map[string]int {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "go.mod"),
		[]byte("module example.com/sample\n\ngo 1.24\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	at := map[string]int{}
	var clean []string
	for i, line := range strings.Split(sample, "\n") {
		if cut := strings.LastIndex(line, " @"); 0 <= cut {
			at[line[cut+2:]] = i + 1
			line = line[:cut]
		}
		clean = append(clean, line)
	}
	if err := os.WriteFile(filepath.Join(dir, "sample.go"),
		[]byte(strings.Join(clean, "\n")), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)
	return at
}

// key spells a profile block the way `go tool cover` does.
func key(startLine, startCol, endLine, endCol int) string {
	return "example.com/sample/sample.go:" +
		strconv.Itoa(startLine) + "." + strconv.Itoa(startCol) + "," +
		strconv.Itoa(endLine) + "." + strconv.Itoa(endCol) + " 1"
}

// A line marker reaches its body under EITHER toolchain spelling.
func TestLineMarkerCoversBothBlockSpellings(t *testing.T) {
	at := world(t)
	for _, c := range []struct {
		name string
		key  string
	}{
		// go1.24: the block opens at the `{` on the `if` line.
		{"go1.24 spelling", key(at["if"], 16, at["elseif"], 3)},
		// later: the block opens at the body's first statement.
		{"later spelling", key(at["ifbody"], 3, at["elseif"], 1)},
	} {
		ig := newIgnorer()
		stmts, ok := ig.skip(c.key)
		if !ok {
			t.Errorf("%s: block not dropped (%s)", c.name, c.key)
			continue
		}
		if 1 != stmts {
			t.Errorf("%s: dropped %d statements, want 1", c.name, stmts)
		}
	}
}

// ...AND STOPS AT THE BODY. The `else if` arm is a sibling the author
// did not mark, and it begins on the SAME LINE as the if-body's closing
// brace -- so a line-wide reach swallowed it and excused untested code.
func TestLineMarkerDoesNotReachTheElseArm(t *testing.T) {
	at := world(t)
	ig := newIgnorer()
	// The else-if body, as `go tool cover` spells it: it opens after
	// the `else if ... {` further along the closing-brace line.
	if _, ok := ig.skip(key(at["elseif"], 20, at["tail"], 3)); ok {
		t.Fatal("the else arm was excused by a marker on the if")
	}
}

// The block marker takes the whole statement, which is what it is for.
func TestBlockMarkerCoversBothBlockSpellings(t *testing.T) {
	at := world(t)
	for _, k := range []string{
		key(at["block"], 31, at["blockbody"]+1, 3),
		key(at["blockbody"], 3, at["blockbody"]+1, 1),
	} {
		ig := newIgnorer()
		if _, ok := ig.skip(k); !ok {
			t.Errorf("block not dropped: %s", k)
		}
	}
}

// An unmarked statement is never dropped, however close it sits.
func TestUnmarkedStatementIsNotDropped(t *testing.T) {
	at := world(t)
	ig := newIgnorer()
	if _, ok := ig.skip(key(at["tail"], 2, at["tail"], 13)); ok {
		t.Fatal("an unmarked statement was dropped")
	}
}

// A MARKER THAT NAMES NOTHING SAYS SO. It used to reach its own line
// and quietly match nothing, which is precisely how a toolchain moving
// its block boundaries showed up as forty-two unrelated-looking
// coverage failures instead of "your markers stopped working".
func TestAMarkerThatMatchesNothingIsReported(t *testing.T) {
	at := world(t)
	ig := newIgnorer()
	// Drive the two markers that DO match, so only the orphan is left.
	ig.skip(key(at["ifbody"], 3, at["elseif"], 1))
	ig.skip(key(at["blockbody"], 3, at["blockbody"]+1, 1))

	stale := ig.unmatched()
	if 1 != len(stale) {
		t.Fatalf("want the orphan marker reported, got %v", stale)
	}
	if !strings.Contains(stale[0], ":"+strconv.Itoa(at["orphan"])+":") {
		t.Fatalf("reported the wrong marker: %s", stale[0])
	}
}
