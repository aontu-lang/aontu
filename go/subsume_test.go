/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"testing"
)

func TestSubsumeNoRuleFold(t *testing.T) {
	st := &subState{
		profile:     "values",
		generalURL:  "general",
		specificURL: "specific",
	}
	out := subsumeNode(st, nil, newNil("test"), newNil("test"))
	if subUndecided != out {
		t.Fatalf("expected undecided, got %q", out)
	}
	if 1 != len(st.findings) {
		t.Fatalf("expected one finding, got %d", len(st.findings))
	}
	if "sub_unresolved" != st.findings[0].Code {
		t.Fatalf("expected sub_unresolved, got %q", st.findings[0].Code)
	}
}

// TestSubsumeRecursionWithoutItsDefinition: a recursion unfolds into the
// definition its own document holds (docs/design/RECURSION.0.md, P3); one
// whose document does not hold it, which no evaluated pair produces, is
// undecided.
func TestSubsumeRecursionWithoutItsDefinition(t *testing.T) {
	rec := newRecurse([]string{"T"}, 0)
	st := &subState{
		profile:     "values",
		generalURL:  "general",
		specificURL: "specific",
		groot:       newMap(),
		sroot:       newMap(),
		pairs:       newSubPairs(),
	}
	if out := subsumeNode(st, []string{"x"}, rec, rec); subUndecided != out {
		t.Fatalf("expected undecided, got %q", out)
	}
	if 1 != len(st.findings) || "sub_unresolved" != st.findings[0].Code {
		t.Fatalf("expected one sub_unresolved finding, got %+v", st.findings)
	}
}

func TestSubsumeUnresolvedVal(t *testing.T) {
	for _, tc := range []struct {
		name string
		v    Val
		want bool
	}{
		{"ref", &RefVal{}, true},
		{"var", &VarVal{}, true},
		{"conjunct", &ConjunctVal{}, true},
		{"expect", &ExpectVal{}, true},
		{"func", newFunc("upper", nil), true},
		{"plus-op", &PlusOpVal{}, true},
		{"constraint", &ConstraintVal{}, false},
		{"scalar", newInteger(1), false},
	} {
		if got := subUnresolvedVal(tc.v); tc.want != got {
			t.Fatalf("%s: expected %v, got %v", tc.name, tc.want, got)
		}
	}
}

func TestSubsumeConstraintPathFunc(t *testing.T) {
	mustCv := &ConstraintVal{musts: []constraintMust{{v: newFunc("key", nil)}}}
	if !hasPathFunc(mustCv) {
		t.Fatal("expected a must holding key() to be path-dependent")
	}
	countCv := &ConstraintVal{count: &ConstraintVal{
		pending: &constraintPending{atom: "min", args: []Val{newFunc("key", nil)}},
	}}
	if !hasPathFunc(countCv) {
		t.Fatal("expected a count holding key() to be path-dependent")
	}
	nofCv := &ConstraintVal{nofs: []constraintNof{{cs: []Val{newFunc("key", nil)}}}}
	if !hasPathFunc(nofCv) {
		t.Fatal("expected a nof branch holding key() to be path-dependent")
	}
	plain := &ConstraintVal{musts: []constraintMust{{v: newInteger(1)}}}
	if hasPathFunc(plain) {
		t.Fatal("expected a plain must to not be path-dependent")
	}
}

// listView's child accessor answers nil for an index the list does not
// hold. subsumeBag only asks for present keys, so the miss arm is
// unreachable through Subsume — pinned directly, as the accessor's
// contract, not the walk's.
func TestSubsumeListViewChildMiss(t *testing.T) {
	lv := listView(newList([]Val{newInteger(1)}))
	if nil != lv.child("9") {
		t.Fatal("expected nil for an out-of-range index")
	}
	if v := lv.child("0"); nil == v {
		t.Fatal("expected the held element for index 0")
	} else if "1" != v.Canon() {
		t.Fatalf("expected 1, got %s", v.Canon())
	}
}

func TestPolicyCompat(t *testing.T) {
	for _, tc := range []struct {
		name string
		src  string
		want string
	}{
		{"pref", "aontu_policy: hide({compat: *none|backward|forward|full})\na:1", "none"},
		{"no-pref-first", "aontu_policy: hide({compat: none|backward})\na:1", "none"},
		{"bare", "aontu_policy: hide({compat: forward})\na:1", "forward"},
		{"not-string", "aontu_policy: hide({compat: 1})\na:1", ""},
		{"not-a-mode", "aontu_policy: hide({compat: sideways})\na:1", ""},
		{"no-compat-key", "aontu_policy: hide({other: 1})\na:1", ""},
		{"no-policy-key", "a:1", ""},
		{"scalar-root", "5", ""},
		{"broken", "a:1 a:2", ""},
	} {
		if got := PolicyCompat(tc.src, ""); tc.want != got {
			t.Fatalf("%s: expected %q, got %q", tc.name, tc.want, got)
		}
	}
}

// The deprecation surfaces' engine internals (G3 phase 4), pinned in
// this package because cross-package runs (the LSP and CLI tests) do
// not count toward its coverage. TS twins: breaking-deprecated-at-reader
// (ts/test/cli.test.ts), collect-deprecations-walk and
// deprecate-func-internals (ts/test/coverage3.test.ts).
func TestDeprecationReaders(t *testing.T) {
	a := New()
	src := "a:[deprecate(1,{msg:\"m\"})] b:{c:deprecate(2,{msg:\"n\"})} d:3"

	deps := a.DeprecationsVars(src, nil)
	if 2 != len(deps) {
		t.Fatalf("expected 2 deprecations, got %d", len(deps))
	}
	for _, d := range deps {
		if "" == d.Record["msg"] || d.Pos < 0 || d.Len < 1 {
			t.Fatalf("bad deprecation: %+v", d)
		}
	}
	if 0 != len(a.DeprecationsVars("a:1 a:2", nil)) {
		t.Fatal("expected none for a broken source")
	}
	if 0 != len(a.DeprecationsVars("a:]", nil)) {
		t.Fatal("expected none for an unparseable source")
	}

	for _, tc := range []struct {
		path string
		want bool
	}{
		{"$.a.0", true},
		{"$.b.c", true},
		{"$.a.5", false},
		{"$.a.x", false},
		{"$.zz", false},
		{"$.d.deeper", false},
		{"$.d", false},
	} {
		if got := a.DeprecatedAt(src, tc.path); tc.want != got {
			t.Fatalf("%s: expected %v, got %v", tc.path, tc.want, got)
		}
	}
	// A document that does not stand alone answers false: the check
	// that produced the finding already reported why.
	if a.DeprecatedAt("a:1 a:2", "$.a") {
		t.Fatal("expected false for a broken source")
	}
	if a.DeprecatedAt("a:]", "$.a") {
		t.Fatal("expected false for an unparseable source")
	}
}

// The shared walk's nil guard: a bag slot a degenerate construction can
// leave empty.
func TestCollectDeprecatedValsNilSlot(t *testing.T) {
	m := newMap()
	dep := newInteger(1)
	dep.setDeprecRec(map[string][]string{"msg": {"m"}})
	m.set("a", newList([]Val{dep}))
	m.set("empty", nil)
	found := collectDeprecatedVals(m)
	if 1 != len(found) {
		t.Fatalf("expected 1, got %d", len(found))
	}
	if "a" != found[0].path[0] || "0" != found[0].path[1] {
		t.Fatalf("bad path: %v", found[0].path)
	}
}

// The deprecate builtin's defensive resolve arms no source reaches:
// arity refuses the argless call at parse, and a nil argument is
// returned unchanged, never marked (the type()/hide() lesson —
// refusal over corruption, D7).
func TestDeprecateResolveArms(t *testing.T) {
	f := newFunc("deprecate", nil)
	ctx := &Ctx{root: newMap()}
	out := f.resolve(ctx, nil, nil)
	if nil == out || !out.Nil() {
		t.Fatalf("expected an arg nil, got %v", out)
	}

	n := newNil("test")
	f2 := newFunc("deprecate", []Val{n})
	if got := f2.resolve(ctx, nil, []Val{n}); got != Val(n) {
		t.Fatalf("expected the nil back, got %v", got)
	}
}
