/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strings"
	"testing"
)

// The number tower's Phase 1 invariants that the shared TSV suite cannot
// express, because they are about the internal Kind lattice rather than
// about observable canon/gen text. See docs/design/number-tower.md.

// TestKindStringNeverEmpty guards the exhaustive Kind.String switch: a
// kind that falls off the end would render as the empty string and
// silently produce, for example, `{"a":}` from a canon.
func TestKindStringNeverEmpty(t *testing.T) {
	want := map[Kind]string{
		KindTop:        "top",
		KindNil:        "nil",
		KindString:     "string",
		KindNumber:     "number",
		KindInteger:    "integer",
		KindFloat:      "float",
		KindBigInteger: "biginteger",
		KindBigDecimal: "bigdecimal",
		KindBoolean:    "boolean",
		KindNull:       "null",
		KindPath:       "path",
	}
	for k, w := range want {
		if got := k.String(); got != w {
			t.Errorf("Kind(%d).String() = %q, want %q", int(k), got, w)
		}
	}
	// Every declared Kind is covered above; anything added later without
	// a String case shows up here as "top" at an unexpected index.
	for k := KindTop; k <= KindPath; k++ {
		if _, ok := want[k]; !ok {
			t.Errorf("Kind(%d) = %q has no expectation: extend this table and Kind.String", int(k), k.String())
		}
	}
}

// TestKindLattice pins the parent/subsumption relations the tower rests
// on: `number` is a pure supertype of the numeric leaves, the leaves are
// pairwise disjoint, and non-numeric kinds sit directly under top.
func TestKindLattice(t *testing.T) {
	leaves := []Kind{KindInteger, KindFloat, KindBigInteger, KindBigDecimal}
	for _, leaf := range leaves {
		if p, ok := kindParent(leaf); !ok || p != KindNumber {
			t.Errorf("kindParent(%s) = (%s, %v), want (number, true)", leaf, p, ok)
		}
		if !kindSubsumes(KindNumber, leaf) {
			t.Errorf("number should subsume %s", leaf)
		}
		if kindSubsumes(leaf, KindNumber) {
			t.Errorf("%s must not subsume number", leaf)
		}
	}
	// number is the root of the numeric family, so it lifts to top.
	if _, ok := kindParent(KindNumber); ok {
		t.Error("kindParent(number) should have no parent")
	}
	for _, k := range []Kind{KindString, KindBoolean, KindNull, KindTop} {
		if _, ok := kindParent(k); ok {
			t.Errorf("kindParent(%s) should have no parent", k)
		}
		if kindSubsumes(KindNumber, k) {
			t.Errorf("number must not subsume %s", k)
		}
	}
	// The path kind sits under string (docs/design/PATHS.0.md), the one
	// non-numeric subtype edge in the lattice.
	if p, ok := kindParent(KindPath); !ok || p != KindString {
		t.Errorf("kindParent(path) = (%s, %v), want (string, true)", p, ok)
	}
	if !kindSubsumes(KindString, KindPath) {
		t.Error("string should subsume path")
	}
	if kindSubsumes(KindPath, KindString) {
		t.Error("path must not subsume string")
	}
	// Distinct leaves are disjoint sets: no common lower bound. This is
	// the whole of D2 at the kind level — integer/float/biginteger/
	// bigdecimal never subsume one another, so `5 & 0d5` can only be an
	// error.
	for _, a := range leaves {
		for _, b := range leaves {
			if a != b && kindSubsumes(a, b) {
				t.Errorf("%s must not subsume %s: the numeric leaves are disjoint", a, b)
			}
		}
	}
}

// TestConcreteValuesCarryLeafKinds is the invariant behind every Kind
// switch in the port: KindNumber is a SUPERTYPE, carried only by a
// ScalarKindVal. A ScalarVal tagged KindNumber would fall off the end of
// ScalarVal.Canon (empty string), negate (a `negative` nil) and
// upperLower (an invalid-arg nil).
func TestConcreteValuesCarryLeafKinds(t *testing.T) {
	if sv := newFloat(1.5); sv.kind != KindFloat {
		t.Errorf("newFloat kind = %s, want float", sv.kind)
	}
	if sv := newInteger(1); sv.kind != KindInteger {
		t.Errorf("newInteger kind = %s, want integer", sv.kind)
	}

	// Every construction route the language has for a numeric value:
	// literals of both kinds, base prefixes, exponents at both ends of
	// the int64 window, unary minus, `+`, and upper/lower.
	src := strings.Join([]string{
		"a:1", "b:1.5", "c:1e3", "d:1e21", "e:0x1f", "f:0b1010",
		"g:-2.5", "h:-3", "i:1+2", "j:1.5+1.5", "k:1+2.0",
		"l:upper(1.1)", "m:lower(2)", "n:1e-400", "o:100000000000000000000",
	}, "\n")

	// Spans reports a ScalarVal as its kind name and a ScalarKindVal as
	// "type", so a span labelled "number" can only be a concrete value
	// wrongly tagged with the supertype.
	for _, s := range New().Spans(src) {
		if s.Kind == "number" {
			t.Errorf("concrete value %s carries the `number` supertype", s.Canon)
		}
	}
}

// TestNumberKeywordIsSupertype checks the keyword surface: `number`
// builds the supertype, `float` builds the binary64 leaf, and each
// canons back to its own spelling.
func TestNumberKeywordIsSupertype(t *testing.T) {
	if got := NewScalarKind(KindNumber).Canon(); got != "number" {
		t.Errorf("number kind canon = %q", got)
	}
	if got := NewScalarKind(KindFloat).Canon(); got != "float" {
		t.Errorf("float kind canon = %q", got)
	}
	// NewNumber keeps its name but builds the float leaf.
	if sv, ok := NewNumber(1.25).(*ScalarVal); !ok || sv.kind != KindFloat {
		t.Errorf("NewNumber must build a float-kind scalar, got %v", NewNumber(1.25))
	}
}
