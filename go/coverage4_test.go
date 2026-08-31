/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage round 5 (ADR-002): the last blocks in package aontu that no
// source input reaches but a test can. What remains after this file is
// marked `//coverage:ignore` in the source with its justification, and
// listed in docs/test-coverage.md.

package aontu

import (
	"strconv"
	"testing"
)

// stubVal is a Val the engine never builds: it refines forever without
// ever settling, and it is neither a map nor a list. Both properties
// are needed below — the first to spend the pass budget, the second so
// the residue walk has no path to name.
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

// TestContainerKindApiOnlyArms reaches the arms the dispatcher hides
// from source (docs/design/PATHS.0.md). A DONE kind meeting TOP is
// absorbed by uniteRaw's fast path before Unify runs, so the top arms
// are API-only; they stay, mirrored with the TS twins, for callers
// driving Vals directly. The twin is container-kind-api-only-arms in
// ts/test/coverage3.test.ts.
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

// TestRefDegenerateEmptySegments pins the all-empty-segment reference:
// no source spells it since path() became the capture (ADR-015), but a
// constructed RefVal still reaches the cycle verdict rather than a
// miss (issue #38), and deleting the arms would move that refusal to a
// panic for anyone building Vals.
func TestRefDegenerateEmptySegments(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	rv := newRef([]any{""}, false)
	rv.path = []string{"y"}
	out := rv.Unify(top(), ctx)
	n, ok := out.(*NilVal)
	if !ok {
		t.Fatalf("want nil, got %T", out)
	}
	if "path_cycle" != n.why {
		t.Fatalf("why = %q, want path_cycle", n.why)
	}
}

// TestFuncNoArgGuardsViaAPI reaches every built-in's missing-argument
// guard the only way that is left: through the programmatic API
// (issue #51). The twin is func-no-arg-guards-via-api in
// ts/test/coverage3.test.ts.
//
// A wrong argument count is refused at PARSE now, so no source can reach
// these guards -- but a caller building a FuncVal by hand still can, and
// they are what keeps that a clean nil rather than an index panic. The
// value of the test is that surface, not the counter: deleting the
// guards would have moved the failure from a refusal to a crash for
// anyone constructing Vals.
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
		{"close", "no_first_arg"},
		{"open", "no_first_arg"},
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

	// path() with no argument is the path KIND now
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

// keyFunc's driver-deeper arm: a key() whose stored path is SHALLOWER
// than the driving base answers for the base — the transplant contract
// for a shared, never-placed argument (see the comment in keyFunc). No
// source spelling reaches it any more now that template instantiation
// deep-clones arguments with placed paths (ADR-005), but the arm is
// the port of the TS `positioned` fallback (KeyFuncVal.resolve), which
// TS still takes for parse-time argument paths; the contract is pinned
// directly so the two ports cannot drift.
func TestKeyFuncDriverDeeper(t *testing.T) {
	f := newFunc("key", nil)
	f.path = []string{"x"}
	out := keyFunc(&Ctx{}, f, []string{"x", "a", "k"})
	sv, ok := out.(*ScalarVal)
	if !ok || "a" != sv.peg {
		t.Fatalf("key() at a deeper driver must answer the driver's path, got %v", out)
	}
}

// The case family's kind-default arm: the signature gate refuses
// every concrete non-string/number BEFORE resolve, so the arm is
// reachable only through a direct call with an exotic argument -- an
// API shape, pinned here as ts/test/coverage3.test.ts pins the TS
// twins ('case-func-fallback-arm').
func TestUpperLowerKindDefaultArm(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	barg := newScalar(KindBoolean, true)
	out := upperLower(ctx, []Val{barg}, true)
	if nv, ok := out.(*NilVal); !ok || "invalid-arg" != nv.why {
		t.Fatalf("boolean operand: %v", out)
	}
}
