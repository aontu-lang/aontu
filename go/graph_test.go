/* Copyright (c) 2025 Richard Rodger, MIT License */

// The graph walk's guards (ADR-002; G4 phase 3). The walk visits
// POSITIONS rather than values — two positions of one entity share a
// value object after the merge — so its termination guard is the
// ANCESTOR chain, which is what a cycle actually is. No document
// produces one (a self-prefix reference is refused as `path_cycle`
// long before), so the guard is pinned here, as its TypeScript twin is
// in ts/test/coverage3.test.ts.

package aontu

import (
	"testing"
)

func TestGraphOfSurvivesACycle(t *testing.T) {
	root := newMap()
	root.set("self", root)
	g := GraphOf(root)
	if 0 != len(g.Edges) {
		t.Fatalf("edges = %+v", g.Edges)
	}
	// Once, at the root: the ancestor guard stops the descent the
	// moment the cycle closes back onto a node already on the path.

}

func TestGraphOfNilNode(t *testing.T) {
	// A bag slot can hold nil in a hand-built tree; the walk answers it
	// rather than dereferencing it.
	root := newMap()
	root.set("gap", nil)
	g := GraphOf(root)
	if 0 != len(g.Edges) {
		t.Fatalf("edges = %+v", g.Edges)
	}
}
