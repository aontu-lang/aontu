/* Copyright (c) 2025 Richard Rodger, MIT License */

// The diff API around the shared rows (G7 phase 6). Every change kind
// is pinned by test/spec/diff.tsv in both ports; what is left here is
// the per-document base path, which no row exercises and which the
// cross-package CLI runs do not count toward this package's coverage.

package aontu

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiffResolvesIncludesFromEachSidesBase(t *testing.T) {
	left := t.TempDir()
	right := t.TempDir()
	for dir, k := range map[string]string{left: "k: 1", right: "k: 2"} {
		if err := os.WriteFile(
			filepath.Join(dir, "part.aontu"), []byte(k), 0o600); nil != err {
			t.Fatal(err)
		}
	}

	r := Diff(`a: @"./part.aontu"`, `a: @"./part.aontu"`, &DiffOptions{
		LeftPath:  left,
		RightPath: right,
	})
	if !r.OK || 1 != len(r.Changes) {
		t.Fatalf("bad report: %+v", r)
	}
	c := r.Changes[0]
	if "$.a.k" != c.Path || "1" != c.Left || "2" != c.Right {
		t.Fatalf("bad change: %+v", c)
	}
}
