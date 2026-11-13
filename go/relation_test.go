/* Copyright (c) 2025 Richard Rodger, MIT License */

// The relation check's OPTIONS (G11 phase 4). What the verb reports is
// pinned by test/spec/relation.tsv in both ports; the count is asked
// for by the command, and cross-package runs do not count toward this
// package's coverage.

package aontu

import "testing"

func TestRelationCheckCountsDeclarations(t *testing.T) {
	none := "a: { b: 1 }\n"
	graph := "a: {dependsOn: relate() & acyclic() & [path($.b)]}\nb: {}\n"

	if r := New().RelationCheck(none); nil != r.Declared {
		t.Errorf("unasked: %d", *r.Declared)
	}
	if r := New().RelationCheckOpts(none, nil); nil != r.Declared {
		t.Errorf("nil options: %d", *r.Declared)
	}

	r := New().RelationCheckOpts(none, &RelationOptions{Count: true})
	if "pass" != r.Verdict {
		t.Fatalf("verdict: %s", r.Verdict)
	}
	if nil == r.Declared || 0 != *r.Declared {
		t.Fatalf("a document declaring none: %v", r.Declared)
	}

	// A POINTER, so `omitempty` cannot drop the zero that carries the
	// whole signal; and a document that DOES declare counts.
	d := New().RelationCheckOpts(graph, &RelationOptions{Count: true})
	if nil == d.Declared || 0 == *d.Declared {
		t.Fatalf("a document that declares: %v", d.Declared)
	}
}
