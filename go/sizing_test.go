/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"strings"
	"testing"
)

func TestSizingResidueRecognisesOnlyTheResidueShape(t *testing.T) {
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
	a := New()
	_, err := a.Generate("a: len(min(2))\na: [1]\n")
	if nil == err {
		t.Fatal("a short list generated")
	}
	ae, ok := err.(*AontuError)
	if !ok || "constraint" != ae.Code {
		t.Fatalf("err = %#v, want a constraint AontuError", err)
	}
	if !strings.Contains(ae.Msg, "len") {
		t.Fatalf("the refusal does not name the atom: %s", ae.Msg)
	}
}

func TestAnAnchorStepsThroughASizingResidue(t *testing.T) {
	a := New()
	root, err := a.Unify("a: unique() & [{p: 1}]\n")
	if nil != err {
		t.Fatal(err)
	}
	at := anchorAt(root, "$.a.0.p")
	if nil == at || "1" != at.Canon() {
		t.Fatalf("anchor = %v, want the element's p", at)
	}
	// ARRIVING at the residue keeps its atom: the anchored node is the
	// honest schema for `$.a`, container and unmet constraint alike, so
	// `--at` enforces what the author wrote there.
	got := anchorAt(root, "$.a")
	if nil == got || !strings.Contains(got.Canon(), "unique()") {
		t.Fatalf("the anchor dropped its atom: %v", got)
	}
}

func TestASizingResidueGenArms(t *testing.T) {
	build := func() *ConjunctVal {
		a := New()
		root, err := a.Unify("a: len(min(2)) & [1]\n")
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
