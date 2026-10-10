/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"strconv"
	"testing"
)

type stubVal struct {
	base
	n int
}

func (s *stubVal) Canon() string             { return "stub" + strconv.Itoa(s.n) }
func (s *stubVal) Gen(ctx *Ctx) (any, error) { return nil, nil }
func (s *stubVal) superior() Val             { return top() }
func (s *stubVal) Unify(peer Val, ctx *Ctx) Val {
	s.n++
	s.setDc(s.dc + 1)
	return s
}

// The budget error names `$` when the residue walk finds no paths:
// residuePaths only descends maps and lists, so a root that is neither
// yields an empty list.
func TestBudgetResidueUnnamedPaths(t *testing.T) {
	v := &stubVal{}
	ctx := &Ctx{root: v}
	unifyRoot(v, ctx)
	if len(ctx.err) != 1 || ctx.err[0].why != "budget_passes" {
		t.Fatalf("want one budget_passes error, got %v", ctx.err)
	}
	if got := ctx.err[0].details["paths"]; got != "$" {
		t.Fatalf("paths: want $, got %q", got)
	}
}

// clonePathRec returns anything it does not recognise unchanged. The
// type switch names every Val in the package, so only a Val declared
// outside it reaches the fallthrough.
func TestClonePathRecUnknown(t *testing.T) {
	v := &stubVal{n: 7}
	if got := clonePathRec(v, []string{"x"}, false); got != Val(v) {
		t.Fatalf("want the value back unchanged, got %v", got)
	}
	if got := clonePathRec(nil, []string{"x"}, false); got != nil {
		t.Fatalf("want nil back, got %v", got)
	}
}

// isLossyIntegerLiteral strips ONE leading sign before the based-literal
// test, so a doubly-signed spelling reaches SetString with a sign still
// in the digits and must be refused rather than accepted.
func TestLossyBasedLiteralDoubleSign(t *testing.T) {
	for _, s := range []string{"+-0x11", "-+0o17", "--0b101"} {
		if isLossyIntegerLiteral(s) {
			t.Fatalf("%s: want not lossy", s)
		}
	}
}

func TestContainerKindApiOnlyArms(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	mk := newMapKind()
	if out := mk.Unify(top(), ctx); out != mk {
		t.Fatalf("map kind against top: got %T", out)
	}
	lk := newListKind()
	if out := lk.Unify(top(), ctx); out != lk {
		t.Fatalf("list kind against top: got %T", out)
	}
}

// Only a root reference of empty segments names its own scope.
func TestRefDegenerateEmptySegments(t *testing.T) {
	for _, c := range []struct {
		path []string
		why  string
	}{{[]string{}, "path_cycle"}, {[]string{"y"}, "no_path"}} {
		ctx := &Ctx{root: newMap()}
		rv := newRef([]any{""}, false)
		rv.path = c.path
		n, ok := rv.Unify(top(), ctx).(*NilVal)
		if !ok || c.why != n.why {
			t.Fatalf("path %v: want %s, got %v", c.path, c.why, n)
		}
	}
}

func TestFuncNoArgGuardsViaAPI(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	for _, tc := range []struct{ name, why string }{
		{"copy", "invalid-arg"},
		{"pref", "arg"},
		{"type", "arg"},
		{"hide", "arg"},
		{"move", "arg"},
		{"upper", "arg"},
		{"lower", "arg"},
	} {
		f := newFunc(tc.name, nil)
		out := f.resolve(ctx, nil, nil)
		n, ok := out.(*NilVal)
		if !ok {
			t.Fatalf("%s: want nil, got %T", tc.name, out)
		}
		if n.why != tc.why {
			t.Fatalf("%s: why = %q, want %q", tc.name, n.why, tc.why)
		}
	}

	// close() and open() with no argument are seals, not refusals.
	for _, tc := range []struct {
		name   string
		closed bool
	}{{"close", true}, {"open", false}} {
		out := newFunc(tc.name, nil).resolve(ctx, nil, nil)
		sv, ok := out.(*SealVal)
		if !ok || sv.closed != tc.closed {
			t.Fatalf("%s: want a seal (closed=%v), got %T %+v", tc.name, tc.closed, out, out)
		}
	}

	// path with no argument is the path KIND now
	// (docs/design/PATHS.0.md), not a missing-argument refusal.
	pf := newFunc("path", nil)
	if k, ok := pf.resolve(ctx, nil, nil).(*ScalarKindVal); !ok || KindPath != k.kind {
		t.Fatalf("path: want the path kind, got %T", pf.resolve(ctx, nil, nil))
	}

	// The constraint atoms carry their complaint on the residual rather
	// than returning a nil, and report it when the residual is met.
	if c := newConstraint("min", nil, -1); c.invalid != "arg" {
		t.Fatalf("min(): invalid = %q, want %q", c.invalid, "arg")
	}
}

func TestKeyFuncDriverDeeper(t *testing.T) {
	f := newFunc("key", nil)
	f.path = []string{"x"}
	out := keyFunc(&Ctx{}, f, []string{"x", "a", "k"})
	sv, ok := out.(*ScalarVal)
	if !ok || "a" != sv.peg {
		t.Fatalf("key() at a deeper driver must answer the driver's path, got %v", out)
	}
}

func TestUpperLowerKindDefaultArm(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	barg := newScalar(KindBoolean, true)
	out := upperLower(ctx, []Val{barg}, true)
	if nv, ok := out.(*NilVal); !ok || "invalid-arg" != nv.why {
		t.Fatalf("boolean operand: %v", out)
	}
}
