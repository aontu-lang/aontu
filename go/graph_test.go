/* Copyright (c) 2025 Richard Rodger, MIT License */

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
