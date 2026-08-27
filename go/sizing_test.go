/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE SIZING RESIDUE (the review's finding C, use-cases/BUGS.md §16).
// What the two ports must AGREE on is test/spec/vet.tsv's vet-sizing-*
// and vet-must-* rows and constraint-length.tsv's canon rows. This file
// holds the arms that are this port's own: the shape test itself, the
// paths a Go nil would take where TypeScript has a thrown value, and
// the anchor walking through a residue.

import (
	"strings"
	"testing"
)

func TestSizingResidueRecognisesOnlyTheResidueShape(t *testing.T) {
	// NOT a residue: a conjunct of two constraints, a conjunct of two
	// containers, and a conjunct that is not two terms at all. Each
	// falls through to the ordinary unresolved-conjunct handling.
	for _, terms := range [][]Val{
		{newConstraint("min", []Val{newInteger(1)}, 0), newConstraint("min", []Val{newInteger(1)}, 0)},
		{newMap(), newMap()},
		{newConstraint("min", []Val{newInteger(1)}, 0)},
	} {
		if _, _, ok := sizingResidue(newConjunct(terms)); ok {
			t.Fatalf("%d-term conjunct read as a sizing residue", len(terms))
		}
	}
	// ... and neither is a value that is not a conjunct at all.
	if _, _, ok := sizingResidue(newMap()); ok {
		t.Fatal("a bare map read as a sizing residue")
	}
}

func TestASizingResidueRefusesOutsideACollectingContext(t *testing.T) {
	// The RAISE arm: a bare evaluation gets the constraint's own code
	// and message, not a generic `conjunct` residue error. A collecting
	// caller reads the same refusal off the context instead, which the
	// shared vet rows cover.
	a := New()
	_, err := a.Generate("a: length(min(2))\na: [1]\n")
	if nil == err {
		t.Fatal("a short list generated")
	}
	ae, ok := err.(*AontuError)
	if !ok || "constraint" != ae.Code {
		t.Fatalf("err = %#v, want a constraint AontuError", err)
	}
	if !strings.Contains(ae.Msg, "length") {
		t.Fatalf("the refusal does not name the atom: %s", ae.Msg)
	}
}

func TestAnAnchorStepsThroughASizingResidue(t *testing.T) {
	// `--at` and `get` name the same node whether or not the container
	// still carries its atom: a path that stopped at the residue would
	// report no_path for a key the document plainly has (use case 06's
	// service ports).
	a := New()
	root, err := a.Unify("a: unique() & [{p: 1}]\n")
	if nil != err {
		t.Fatal(err)
	}
	at := anchorAt(root, "$.a.0.p")
	if nil == at || "1" != at.Canon() {
		t.Fatalf("anchor = %v, want the element's p", at)
	}
	// The residue itself anchors as its container.
	if bag := anchorAt(root, "$.a"); nil == bag || bag.Canon() != "[{\"p\":1}]" {
		t.Fatalf("the residue did not anchor as its container: %v", bag)
	}
}

func TestASizingResidueGenArms(t *testing.T) {
	// The two arms a document cannot reach through the CLI: a
	// COLLECTING caller, which reads the refusal off the context
	// instead of being handed it, and a caller with NO context at all.
	build := func() *ConjunctVal {
		a := New()
		root, err := a.Unify("a: length(min(2)) & [1]\n")
		if nil != err {
			t.Fatal(err)
		}
		m, ok := root.(*MapVal)
		if !ok {
			t.Fatalf("root is %T", root)
		}
		cj, ok := m.peg["a"].(*ConjunctVal)
		if !ok {
			t.Fatalf("$.a is %T, want the residue conjunct", m.peg["a"])
		}
		return cj
	}

	ctx := &Ctx{collect: true}
	out, err := build().Gen(ctx)
	if nil != err || nil != out {
		t.Fatalf("collecting: out=%v err=%v, want both nil", out, err)
	}
	if 1 != len(ctx.err) || "constraint" != ctx.err[0].why {
		t.Fatalf("collecting: ctx.err = %v", ctx.err)
	}

	if _, err = build().Gen(nil); nil == err {
		t.Fatal("no context: want the refusal raised")
	}
}

func TestExportingANonResidueConjunct(t *testing.T) {
	// The exporter's fall-through: a conjunct that is NOT a sizing
	// residue is residue like any other, and is reported as a loss
	// rather than exported as half a schema.
	r := New().JSONSchema("a: refer() & string\n", "")
	if "lossy" != r.Verdict {
		t.Fatalf("verdict %q, want lossy: %v", r.Verdict, r.Lossy)
	}
	if 1 != len(r.Lossy) || "$.a" != r.Lossy[0].Path {
		t.Fatalf("lossy = %v", r.Lossy)
	}
}
