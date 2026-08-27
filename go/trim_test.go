/* Copyright (c) 2025 Richard Rodger, MIT License */

// The trim internals no source reaches (ADR-002; the Go side of
// ts/test/coverage3.test.ts, coverage3-trim): trimDeleteAt's honest
// answers for paths a candidate enumeration from an identical parse
// can never produce, and trimEvalCanon's fold of a probe whose
// deletion cannot land. Cross-package runs (the CLI tests) do not
// count toward this package's coverage, so the arms are exercised
// here directly.

package aontu

import (
	"testing"
)

func TestTrimInternals(t *testing.T) {
	inner := newMap()
	inner.optional = []string{"x", "y"}
	inner.set("x", newInteger(1))
	root := newMap()
	root.set("a", inner)
	root.set("s", newInteger(2))

	// A mid-path segment that is not a bag proves nothing to delete:
	// the walk stops inside the loop, before the final-key check.
	if trimDeleteAt(root, []string{"s", "deep", "deeper"}) {
		t.Fatal("expected false for a scalar mid-path")
	}
	// And when the FINAL parent is not a bag, the last check answers.
	if trimDeleteAt(root, []string{"s", "deep"}) {
		t.Fatal("expected false for a scalar final parent")
	}
	// A mid-path key the map does not have leaves nothing to walk.
	if trimDeleteAt(root, []string{"zz", "deep"}) {
		t.Fatal("expected false for a missing mid-path key")
	}
	// A missing FINAL key likewise.
	if trimDeleteAt(root, []string{"a", "zz"}) {
		t.Fatal("expected false for a missing final key")
	}
	// A list index the list does not have, mid-path.
	list := &ListVal{peg: []Val{newInteger(1)}}
	if trimDeleteAt(list, []string{"9", "x"}) {
		t.Fatal("expected false for a missing list index")
	}
	// A real optional entry deletes, and its optional mark goes too.
	if !trimDeleteAt(root, []string{"a", "x"}) {
		t.Fatal("expected true for a real entry")
	}
	if 1 != len(inner.optional) || "y" != inner.optional[0] {
		t.Fatalf("expected optional [y], got %v", inner.optional)
	}

	// trimEvalCanon answers ok=false for a probe whose deletion cannot
	// land (the caller's "load-bearing" fold).
	if _, ok, _ := New().trimEvalCanon("a:1", []string{"zz", "deep"}); ok {
		t.Fatal("expected ok=false for an unlandable deletion")
	}
}

// AN `error` VERDICT SAYS WHY (the review's finding F). Both
// single-document verbs used to answer an unusable document with an
// empty report, which is the one answer a repair loop cannot act on.
// The TypeScript twin is `verb-errors` in ts/test/vet.test.ts.
func TestSingleDocumentVerbsReportWhy(t *testing.T) {
	// A document that PARSES and then contradicts itself: the finding
	// is the engine's own, with both operands sited.
	tr := New().TrimCheck("a:1 a:2")
	if TrimError != tr.Verdict || 1 != len(tr.Errors) {
		t.Fatalf("trim: %+v", tr)
	}
	if "scalar_value" != tr.Errors[0].Code || "$.a" != tr.Errors[0].Path {
		t.Fatalf("trim finding: %+v", tr.Errors[0])
	}
	if 2 != len(tr.Errors[0].Sites) {
		t.Fatalf("trim sites: %+v", tr.Errors[0].Sites)
	}

	// A document that does not PARSE takes the other arm, and lands in
	// the same shape: one located parse-class finding.
	tp := New().TrimCheck("a:]")
	if TrimError != tp.Verdict || 1 != len(tp.Errors) {
		t.Fatalf("trim parse: %+v", tp)
	}
	if "parse" != tp.Errors[0].Class {
		t.Fatalf("trim parse finding: %+v", tp.Errors[0])
	}

	// Relations, both arms. `Findings` stays the GRAPH's vocabulary --
	// a document with no graph has no graph findings -- and the reason
	// rides `Errors`.
	rr := New().RelationCheck("a:1 a:2")
	if "error" != rr.Verdict || 0 != len(rr.Findings) || 1 != len(rr.Errors) {
		t.Fatalf("relations: %+v", rr)
	}
	if "scalar_value" != rr.Errors[0].Code {
		t.Fatalf("relations finding: %+v", rr.Errors[0])
	}

	rp := New().RelationCheck("a:]")
	if "error" != rp.Verdict || 0 != len(rp.Findings) || 1 != len(rp.Errors) {
		t.Fatalf("relations parse: %+v", rp)
	}
	if "parse" != rp.Errors[0].Class {
		t.Fatalf("relations parse finding: %+v", rp.Errors[0])
	}
}
