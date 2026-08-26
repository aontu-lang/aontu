/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage round 3: direct unit tests for internal paths no source
// input reaches (see docs/test-coverage.md for the spec-first method
// and the ruling on which paths get per-port tests). Round 1–2 tests
// live in coverage_test.go.

package aontu

import (
	"math"
	"math/big"
	"strings"
	"testing"

	expr "github.com/tabnas/expr/go"
	jsonic "github.com/tabnas/jsonic/go"
)

// Check reports errors recorded on the context but absent from the
// tree — the budget_passes exhaustion nil of a 10-link ref chain — as
// positionless (-1) problems.
func TestCheckCtxErrUnion(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 10; i++ {
		b.WriteString("c")
		b.WriteString(itoa(i))
		b.WriteString(":$.c")
		b.WriteString(itoa(i + 1))
		b.WriteString(" ")
	}
	b.WriteString("c10:1")
	probs := New().Check(b.String())
	found := false
	for _, p := range probs {
		if p.Why == "budget_passes" {
			found = true
			if p.Pos != -1 {
				t.Fatalf("budget problem must be positionless, got %d", p.Pos)
			}
		}
	}
	if !found {
		t.Fatalf("expected budget_passes problem, got %v", probs)
	}
}

// The collectSpans / collectNils walkers and the valKind labels, on
// constructed trees (the walk arms the LSP package exercises are not
// attributed to this package by go test -cover).
func TestCheckWalkersDirect(t *testing.T) {
	var out []ValueSpan
	collectSpans(nil, &out, map[Val]bool{})
	if len(out) != 0 {
		t.Fatalf("nil walk must add nothing")
	}
	m := newMap()
	m.set("k", newInteger(1))
	m.spread = newScalarKind(KindInteger)
	collectSpans(m, &out, map[Val]bool{})
	l := newList([]Val{newInteger(1)})
	l.spread = newScalarKind(KindInteger)
	collectSpans(l, &out, map[Val]bool{})
	cj := newConjunct([]Val{newInteger(1), newString("s")})
	collectSpans(cj, &out, map[Val]bool{})

	if valKind(&RefVal{}) != "reference" {
		t.Fatalf("ref kind")
	}
	if valKind(cj) != "conjunct" {
		t.Fatalf("conjunct kind")
	}
	// A junction that survives evaluation is always a FOLD's mint, and a
	// mint carries no position (disjunct.go), so collectSpans never
	// reaches this label through a real document — the hover path it
	// serves would still use it for a constructed tree, and TS's
	// valKind keeps the same arm.
	if valKind(newDisjunct(nil)) != "disjunct" {
		t.Fatalf("disjunct kind")
	}
	if valKind(newFunc("key", nil)) != "function" {
		t.Fatalf("func kind")
	}
	if valKind(newNil("x")) != "error" {
		t.Fatalf("nil kind")
	}
	if valKind(newMap()) != "value" {
		t.Fatalf("default kind")
	}

	var nils []*NilVal
	collectNils(nil, &nils, map[Val]bool{})
	m2 := newMap()
	m2.set("k", newNil("a"))
	m2.spread = newNil("b")
	collectNils(m2, &nils, map[Val]bool{})
	l2 := newList([]Val{newNil("c")})
	l2.spread = newNil("d")
	collectNils(l2, &nils, map[Val]bool{})
	collectNils(newConjunct([]Val{newNil("e")}), &nils, map[Val]bool{})
	collectNils(newDisjunct([]Val{newNil("f")}), &nils, map[Val]bool{})
	if len(nils) != 6 {
		t.Fatalf("expected 6 nils, got %d", len(nils))
	}
}

// RefVal internals: computed-segment append fallbacks, prefix-dot
// merging, the found-is-ref defer arms, find/detectRefCycle walk
// failures, plainRefPath reduction, and the VarVal plumbing.
func TestRefInternalsDirect(t *testing.T) {
	if _, ok := (&RefVal{}).superior().(*TopVal); !ok {
		t.Fatalf("ref superior")
	}

	// append: scalar segments with NO source text render computed.
	rv := &RefVal{}
	rv.append(&ScalarVal{kind: KindInteger, peg: int64(7)})
	rv.append(&ScalarVal{kind: KindFloat, peg: 2.5})
	rv.append(&ScalarVal{kind: KindBigInteger, peg: big.NewInt(9)})
	rv.append(&ScalarVal{kind: KindBigDecimal, peg: newDecimal(big.NewInt(15), 1)})
	got := make([]string, len(rv.peg))
	for i, p := range rv.peg {
		got[i] = p.(string)
	}
	if strings.Join(got, "/") != "7/2/5/9/1/5" {
		t.Fatalf("computed segments: %v", got)
	}

	// append: a prefix child ref onto a non-empty non-prefix ref keeps
	// the parent-step marker.
	rv2 := &RefVal{}
	rv2.append("a")
	rv2.append(&RefVal{prefix: true, peg: []any{"b"}})
	if len(rv2.peg) != 3 || rv2.peg[1] != "." || rv2.peg[2] != "b" {
		t.Fatalf("prefix-dot merge: %v", rv2.peg)
	}

	// The found-is-ref defer arms (chain link found, peer decides).
	root := newMap()
	root.set("a", newInteger(1))
	root.set("r", &RefVal{absolute: true, peg: []any{"r2"}})
	root.set("r2", &RefVal{absolute: true, peg: []any{"a"}})
	ctx := &Ctx{root: root}
	chaser := &RefVal{absolute: true, peg: []any{"r"}}
	if out := chaser.Unify(newNil("x"), ctx); !out.Nil() {
		t.Fatalf("chain defer with nil peer must fail")
	}
	if out := chaser.Unify(&RefVal{absolute: true, peg: []any{"r"}}, ctx); out.Nil() {
		t.Fatalf("chain defer with same-canon peer must defer")
	}
	if _, ok := chaser.Unify(newInteger(5), ctx).(*ConjunctVal); !ok {
		t.Fatalf("chain defer with scalar peer must conjunct")
	}

	// find: a non-string non-var segment defers.
	if (&RefVal{absolute: true, peg: []any{42}}).find(ctx, false) != nil {
		t.Fatalf("bad segment must defer")
	}
	// find: relative ref with an empty own path clamps the base.
	if f := (&RefVal{peg: []any{"a"}}).find(ctx, false); f == nil || f.Canon() != "1" {
		t.Fatalf("relative find from root")
	}
	// find: ref marks transfer onto the found node in place.
	mk := &RefVal{absolute: true, peg: []any{"a"}}
	mk.mtype = true
	mk.mhide = true
	if out := mk.find(ctx, false); out == nil {
		t.Fatalf("marked find")
	}
	if !root.peg["a"].markedType() || !root.peg["a"].markedHide() {
		t.Fatalf("marks must land on the found node")
	}
	root.peg["a"].setMarkType(false)
	root.peg["a"].setMarkHide(false)

	// detectRefCycle: walk failures yield no proof.
	lroot := newMap()
	lroot.set("l", newList([]Val{newInteger(1)}))
	lroot.set("s", newString("x"))
	lctx := &Ctx{root: lroot}
	for _, bad := range []*RefVal{
		{absolute: true, peg: []any{"l", "zz"}},
		{absolute: true, peg: []any{"l", "5"}},
		{absolute: true, peg: []any{"s", "x"}},
		{absolute: true, peg: []any{"nope"}},
	} {
		if bad.detectRefCycle(lctx) {
			t.Fatalf("no cycle proof for %v", bad.peg)
		}
	}

	// plainRefPath: relative base, empty-path clamp, dot reduction.
	p1 := &RefVal{peg: []any{"b"}}
	p1.path = []string{"a", "x"}
	if strings.Join(p1.plainRefPath(), "/") != "a/b" {
		t.Fatalf("relative plainRefPath")
	}
	if strings.Join((&RefVal{peg: []any{"b"}}).plainRefPath(), "/") != "b" {
		t.Fatalf("empty-path clamp")
	}
	if (&RefVal{absolute: true, peg: []any{".", "b"}}).plainRefPath() != nil {
		t.Fatalf("dot off the top must bail")
	}
	if strings.Join((&RefVal{absolute: true, peg: []any{"a", ".", "b"}}).plainRefPath(), "/") != "b" {
		t.Fatalf("dot reduction")
	}

	// VarVal plumbing.
	if varName(&VarVal{peg: "plain"}) != "plain" {
		t.Fatalf("varName string")
	}
	if (&VarVal{peg: 3}).Canon() != "$" {
		t.Fatalf("var canon default")
	}
	if out := (&VarVal{peg: 3}).Unify(nil, ctx); !out.Nil() {
		t.Fatalf("nameless var must fail")
	}
	vr := &VarVal{peg: &RefVal{peg: []any{"a"}}}
	if out := vr.Unify(top(), ctx); out.Canon() != "1" {
		t.Fatalf("var-wrapped ref must resolve absolutely, got %s", out.Canon())
	}
}

// FuncVal: silent Gen, nil peers while key() residuates and the
// pending-args defer, and the walkPref conjunct arm.
// G8 phase 3 — the hole's own contracts, at the arms no document
// reaches. Gen is silent (the enclosing bag decides that an unfilled
// hole is an error, exactly as it does for TOP), and superior answers
// itself because nothing sits above a value that admits everything.
// The TypeScript twin is coverage3.test.ts, `a-hole-has-nothing-above-it`.
func TestPlaceArmsDirect(t *testing.T) {
	p := newPlace()
	if g, err := p.Gen(&Ctx{}); nil != g || nil != err {
		t.Fatalf("a hole generates silently: %v %v", g, err)
	}
	if Val(p) != p.superior() {
		t.Fatalf("a hole is its own superior")
	}
}

func TestFuncArmsDirect(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	f := newFunc("key", nil)
	if g, err := f.Gen(nil); g != nil || err != nil {
		t.Fatalf("func Gen must be silent")
	}
	if out := f.Unify(nil, ctx); out == nil {
		t.Fatalf("nil peer")
	}
	n := newNil("x")
	if newFunc("key", nil).Unify(n, ctx) != Val(n) {
		t.Fatalf("key delay must fail against nil peer")
	}

	// A pending arg defers; a nil peer wins the defer.
	root := newMap()
	root.set("a", newConjunct([]Val{numberVal(1, "1", -1)}))
	pctx := &Ctx{root: root}
	arg := &RefVal{absolute: true, peg: []any{"a", "b"}}
	fu := newFunc("upper", []Val{arg})
	n2 := newNil("y")
	if fu.Unify(n2, pctx) != Val(n2) {
		t.Fatalf("pending func against nil peer must yield the nil")
	}

	// walkPref descends conjunct members.
	cj := newConjunct([]Val{newPref(newInteger(1)), newInteger(2)})
	if walkPref(cj) != Val(cj) {
		t.Fatalf("walkPref conjunct identity")
	}
}

// PlusOpVal: the un-addable-result and pending-operand defer arms, and
// the plusAdd fallthrough.
func TestOpArmsDirect(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	if out := newPlusOp(numberVal(1, "1", -1), numberVal(2, "2", -1)).Unify(nil, ctx); out.Canon() != "3" {
		t.Fatalf("nil peer resolve")
	}

	// operate() yields nothing for bool+integer: the op stays itself
	// and the peer decides.
	mk := func() *PlusOpVal { return newPlusOp(newBoolean(true), numberVal(1, "1", -1)) }
	n := newNil("x")
	if out := mk().Unify(n, ctx); !out.Nil() {
		t.Fatalf("stuck op against nil peer must fail")
	}
	o := mk()
	if out := o.Unify(mk(), ctx); out != Val(o) {
		t.Fatalf("stuck op against its own spelling must stand")
	}

	// Pending operand: nil peer wins, any other peer conjoins.
	root := newMap()
	root.set("a", newConjunct([]Val{numberVal(1, "1", -1)}))
	pctx := &Ctx{root: root}
	pend := func() *PlusOpVal {
		return newPlusOp(&RefVal{absolute: true, peg: []any{"a", "b"}}, numberVal(1, "1", -1))
	}
	n2 := newNil("y")
	if pend().Unify(n2, pctx) != Val(n2) {
		t.Fatalf("pending op against nil peer must yield the nil")
	}
	if _, ok := pend().Unify(newString("s"), pctx).(*ConjunctVal); !ok {
		t.Fatalf("pending op against scalar peer must conjunct")
	}

	if plusAdd(true, "x") != "truex" {
		t.Fatalf("plusAdd concatenates through strings")
	}
}

// Scalar rendering leftovers: the canon default for a kind no concrete
// scalar carries, and control-character escaping in JSON strings.
func TestScalarRenderingLeftovers(t *testing.T) {
	if (&ScalarVal{kind: KindNumber}).Canon() != "" {
		t.Fatalf("supertype scalar canon must be empty")
	}
	if s := jsonString("x\x01y"); s != "\"x\\u0001y\"" {
		t.Fatalf("control escape: %s", s)
	}
}

// ConstraintVal: nil peers, the constraint-meet kind mismatch, domain
// adoption, and tighterBound's decided orders.
func TestConstraintArmsDirect(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	c := &ConstraintVal{domain: "number", kind: KindTop}
	n := newNil("x")
	if c.Unify(n, ctx) != Val(n) {
		t.Fatalf("constraint against nil peer")
	}
	ci := &ConstraintVal{domain: "number", kind: KindInteger}
	cf := &ConstraintVal{domain: "number", kind: KindFloat}
	if !ci.Unify(cf, ctx).Nil() {
		t.Fatalf("leaf-kind mismatch must fail")
	}
	cd := &ConstraintVal{kind: KindTop}
	cn := &ConstraintVal{domain: "number", kind: KindTop}
	out, ok := cd.Unify(cn, ctx).(*ConstraintVal)
	if !ok || out.domain != "number" {
		t.Fatalf("domain adoption")
	}
	a := &constraintBound{v: newInteger(2)}
	b := &constraintBound{v: newInteger(1)}
	if tighterBound("number", a, b, true) != a {
		t.Fatalf("higher lower bound must win")
	}
	if tighterBound("number", b, a, false) != b {
		t.Fatalf("lower upper bound must win")
	}
}

// Val plumbing leftovers: sprOf on a nil interface, TopVal against nil
// and top peers, NilVal absorbing everything.
func TestValPlumbingLeftovers(t *testing.T) {
	if sprOf(nil) != nil {
		t.Fatalf("sprOf nil")
	}
	tv := top()
	if tv.Unify(nil, nil) != Val(tv) || tv.Unify(top(), nil) != Val(tv) {
		t.Fatalf("top against nil/top")
	}
	n := newNil("x")
	if n.Unify(newInteger(1), nil) != Val(n) {
		t.Fatalf("nil absorbs")
	}
}

// An empty conjunct unifies to TOP.
func TestConjunctEmptyDirect(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	if out := newConjunct([]Val{}).Unify(top(), ctx); !isTop(out) {
		t.Fatalf("empty conjunct must be top, got %v", out.Canon())
	}
}

// Decimal: the scale half of the exactness budget, and cmp's
// scale-alignment branch.
func TestDecimalBudgetAndCmp(t *testing.T) {
	if !(&Decimal{coeff: big.NewInt(1), scale: decimalMaxScale + 1}).overBudget() {
		t.Fatalf("over-scale must be over budget")
	}
	if !(&Decimal{coeff: big.NewInt(1), scale: -decimalMaxScale - 1}).overBudget() {
		t.Fatalf("under-scale must be over budget")
	}
	a := newDecimal(big.NewInt(15), 1)  // 1.5
	b := newDecimal(big.NewInt(125), 2) // 1.25
	if a.cmp(b) <= 0 {
		t.Fatalf("1.5 must compare above 1.25")
	}
}

// walkMark descends disjunct members.
func TestMarksDisjunctWalk(t *testing.T) {
	d := newDisjunct([]Val{newInteger(1), newString("s")})
	walkMark(d, true, true, false, false)
	if !d.peg[0].markedType() || !d.peg[1].markedType() {
		t.Fatalf("disjunct members must be marked")
	}
}

// PrefVal: a nil peer keeps the pref; a lower rank supersedes.
func TestPrefRankArms(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	p := newPref(newInteger(1))
	if p.Unify(nil, ctx) != Val(p) {
		t.Fatalf("pref against nil peer")
	}
	lo := newPref(newInteger(3))          // rank 0
	hi := newPref(newPref(newInteger(2))) // rank 1
	if lo.Unify(hi, ctx) != Val(lo) {
		t.Fatalf("lower rank must supersede")
	}
}

// PrefVal.superior answers top for the Val interface. Nothing reaches
// it through a document any more: resuper (the rank-uniform meet,
// ADR-004) unwraps nested prefs to the innermost non-pref peg instead
// of asking the pref itself, so the interface contract is pinned here
// (ADR-002).
func TestPrefSuperiorIsTop(t *testing.T) {
	p := newPref(newInteger(1))
	if !isTop(p.superior()) {
		t.Fatalf("pref superior must be top")
	}
}

// The admission gate's defensive pref-sibling skip (ADR-004): a pref
// member cannot admit another pref's override. rankPrefs leaves a
// settled disjunct at most one pref, so a document cannot reach a
// two-pref gate -- the arm is pinned here (ADR-002) with prefsRanked
// forced, and the meet is the `|:empty` refusal because neither
// preferred value admits the peer.
func TestDisjunctGateSkipsPrefSibling(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	d := newDisjunct([]Val{newPref(newString("z")), newPref(newString("x"))})
	d.prefsRanked = true
	out := d.Unify(newString("y"), ctx)
	if !out.Nil() {
		t.Fatalf("two-pref gate must refuse an inadmissible peer, got %s",
			out.Canon())
	}
}

// recordNotFound guards: no context, and a meta bag without the sink.
func TestSourceSinkGuards(t *testing.T) {
	recordNotFound(nil, "x")
	recordNotFound(&jsonic.Context{Meta: map[string]any{}}, "x")
	// Reaching here without a panic is the assertion: both calls must
	// no-op when there is no sink to write to.
}

// adderr deduplicates by identity.
func TestCtxAdderrDedup(t *testing.T) {
	c := &Ctx{}
	n := newNil("x")
	n.primary = n
	c.adderr(n)
	c.adderr(n)
	if len(c.err) != 1 {
		t.Fatalf("adderr must dedup, got %d", len(c.err))
	}
}

// An empty code classifies as its eventual gen-time code, nil_gen.
func TestCodeClassEmpty(t *testing.T) {
	if codeClass("") != codeClass("nil_gen") {
		t.Fatalf("empty code must classify as nil_gen")
	}
}

// scaledOfFloat: a value with a non-negative binary exponent shifts up.
func TestScaledPositiveExponent(t *testing.T) {
	s := scaledOfFloat(math.Ldexp(1, 60))
	want := new(big.Int).Lsh(big.NewInt(1), 60)
	if s.scale != 0 || s.unscaled.Cmp(want) != 0 {
		t.Fatalf("2^60 must scale integrally, got %v/%d", s.unscaled, s.scale)
	}
}

// clonePath: the VarVal case, the default identity case, and
// repathArg's spread descent.
func TestCloneVarAndSpreads(t *testing.T) {
	v := &VarVal{peg: "x"}
	v.path = []string{"q"}
	c, ok := clonePath(v, []string{"a"}).(*VarVal)
	if !ok || c == v || c.peg != "x" {
		t.Fatalf("var clone")
	}
	m := newMap()
	m.set("k", newInteger(1))
	m.spread = newFunc("path", nil)
	repathArg(m, []string{"b"}, false)
	l := newList([]Val{newInteger(1)})
	l.spread = newFunc("path", nil)
	repathArg(l, []string{"b"}, false)
	if strings.Join(m.spread.vpath(), "/") != "b" || strings.Join(l.spread.vpath(), "/") != "b" {
		t.Fatalf("spread repath")
	}
}

// DisjunctVal: a deferring member keeps the junction pending, a nested
// disjunct collapsing to a single pref replaces itself, and valSame
// refuses a constraint against a non-constraint.
func TestDisjunctPendingAndNested(t *testing.T) {
	root := newMap()
	root.set("a", newConjunct([]Val{numberVal(1, "1", -1)}))
	ctx := &Ctx{root: root}
	d := newDisjunct([]Val{
		&RefVal{absolute: true, peg: []any{"a", "b"}},
		newInteger(1),
	})
	out := d.Unify(top(), ctx)
	if _, ok := out.(*DisjunctVal); !ok || out.Dc() == DONE {
		t.Fatalf("deferring member must keep the junction pending")
	}

	inner := newDisjunct([]Val{newPref(newInteger(1))})
	outer := newDisjunct([]Val{inner, newInteger(2)})
	outer.rankPrefs(ctx)
	if _, ok := outer.peg[0].(*PrefVal); !ok {
		t.Fatalf("nested single-pref disjunct must collapse in place")
	}

	if valSame(&ConstraintVal{domain: "number", kind: KindTop}, newInteger(1)) {
		t.Fatalf("constraint against non-constraint")
	}
}

// ListVal: marked Gen silence, collect-mode element drops, the mark
// ratchet, and pending peers.
func TestListValArmsDirect(t *testing.T) {
	l := newList([]Val{newInteger(1)})
	l.mtype = true
	if g, err := l.Gen(nil); g != nil || err != nil {
		t.Fatalf("marked list Gen must be silent")
	}

	l2 := newList([]Val{&RefVal{absolute: true, peg: []any{"zz"}}, newInteger(2)})
	g2, err2 := l2.Gen(&Ctx{collect: true})
	if err2 != nil || len(g2.([]any)) != 1 {
		t.Fatalf("collect mode must drop the erroring element: %v %v", g2, err2)
	}

	ctx := &Ctx{root: newMap()}
	l3 := newList([]Val{newInteger(1)})
	l3.mtype = true
	l3.mhide = true
	l3.Unify(top(), ctx)
	if !l3.peg[0].markedType() || !l3.peg[0].markedHide() {
		t.Fatalf("list marks must ratchet onto elements")
	}

	root := newMap()
	root.set("a", newConjunct([]Val{numberVal(1, "1", -1)}))
	pctx := &Ctx{root: root}
	pending := newList([]Val{&RefVal{absolute: true, peg: []any{"a", "b"}}})
	out := newList([]Val{}).Unify(pending, pctx)
	if out.Dc() == DONE {
		t.Fatalf("pending peer element must keep the list pending")
	}
}

// MapVal: the hasPathFunc walk arms, marked Gen silence, optional and
// collect-mode error drops, nil peers, and the mark ratchet.
func TestMapValArmsDirect(t *testing.T) {
	inner := newMap()
	inner.set("k", newFunc("key", nil))
	if !hasPathFunc(inner) {
		t.Fatalf("map child")
	}
	if !hasPathFunc(newList([]Val{newFunc("key", nil)})) {
		t.Fatalf("list element")
	}
	ls := newList([]Val{newInteger(1)})
	ls.spread = newFunc("key", nil)
	if !hasPathFunc(ls) {
		t.Fatalf("list spread")
	}
	if !hasPathFunc(newConjunct([]Val{newFunc("key", nil)})) {
		t.Fatalf("conjunct term")
	}
	if !hasPathFunc(newDisjunct([]Val{newFunc("key", nil)})) {
		t.Fatalf("disjunct member")
	}
	if !hasPathFunc(newPref(newPref(newFunc("key", nil)))) {
		t.Fatalf("nested pref peg")
	}

	m := newMap()
	m.mtype = true
	if g, err := m.Gen(nil); g != nil || err != nil {
		t.Fatalf("marked map Gen must be silent")
	}

	m2 := newMap()
	m2.set("b", &RefVal{absolute: true, peg: []any{"zz"}})
	m2.optional = []string{"b"}
	g2, e2 := m2.Gen(nil)
	if e2 != nil || len(g2.(map[string]any)) != 0 {
		t.Fatalf("optional erroring key must drop: %v %v", g2, e2)
	}

	m3 := newMap()
	m3.set("b", &RefVal{absolute: true, peg: []any{"zz"}})
	g3, e3 := m3.Gen(&Ctx{collect: true})
	if e3 != nil || len(g3.(map[string]any)) != 0 {
		t.Fatalf("collect mode must drop the erroring key: %v %v", g3, e3)
	}

	m4 := newMap()
	if out := m4.Unify(nil, &Ctx{root: m4}); out == nil {
		t.Fatalf("nil peer")
	}

	m5 := newMap()
	m5.set("k", newInteger(1))
	m5.mtype = true
	m5.mhide = true
	m5.Unify(top(), &Ctx{root: m5})
	if !m5.peg["k"].markedType() || !m5.peg["k"].markedHide() {
		t.Fatalf("map marks must ratchet onto children")
	}
}

// negate: raw float operands and the -(-2^63) integer-range escape.
func TestNegateEdges(t *testing.T) {
	if v := negate(1.5); v.Canon() != "-1.5" {
		t.Fatalf("raw float negate: %s", v.Canon())
	}
	mn := negate(&ScalarVal{kind: KindInteger, peg: int64(math.MinInt64)})
	sv, ok := mn.(*ScalarVal)
	if !ok || sv.kind != KindFloat || sv.peg.(float64) != -float64(math.MinInt64) {
		t.Fatalf("MinInt64 negate must widen to float")
	}
}

// Lexer helpers: negSrc stripping, the lossy-literal exponent bound,
// and the based-run separator refusals with a sign.
func TestLexerHelpersRound3(t *testing.T) {
	if negSrc("-5") != "5" {
		t.Fatalf("negSrc strip")
	}
	if isLossyIntegerLiteral("1e401") {
		t.Fatalf("over-bound exponent is refused, not lossy")
	}
	if !sepInvalid("-0x_1") || !sepInvalid("+0b_1") {
		t.Fatalf("signed based separator open")
	}
}

// asVal: raw scalar fallbacks (values with no literal behind them).
func TestAsValRawScalars(t *testing.T) {
	if v, ok := asVal(2.5).(*ScalarVal); !ok || v.kind != KindFloat {
		t.Fatalf("raw float")
	}
	if v, ok := asVal("s").(*ScalarVal); !ok || v.kind != KindString {
		t.Fatalf("raw string")
	}
	if v, ok := asVal(true).(*ScalarVal); !ok || v.kind != KindBoolean {
		t.Fatalf("raw bool")
	}
}

// Grammar-action guards and arms, driven with constructed rules: the
// current engine happens not to hand these shapes to the actions, but
// the action is the contract, not the engine's current habits.
func TestGrammarActionsDirect(t *testing.T) {
	// elemSpread: an empty list is left alone; consecutive spreads
	// merge into a conjunct.
	r1 := &jsonic.Rule{Node: []any{}}
	r1.EnsureU()["spread"] = true
	elemSpread(r1, nil)

	ls := &listSpread{val: newInteger(1)}
	r2 := &jsonic.Rule{Node: []any{ls}, Child: &jsonic.Rule{Node: 2.0}}
	r2.EnsureU()["spread"] = true
	elemSpread(r2, nil)
	if _, ok := ls.val.(*ConjunctVal); !ok {
		t.Fatalf("consecutive spreads must merge into a conjunct")
	}

	// recordMapPos: no open token, no stamp.
	m := map[string]any{}
	recordMapPos(&jsonic.Rule{Node: m}, nil)
	if _, ok := m[posKey]; ok {
		t.Fatalf("no token, no stamp")
	}

	// wrapList: a non-list node is left alone.
	r3 := &jsonic.Rule{Node: "x"}
	wrapList(r3, nil)
	if r3.Node != "x" {
		t.Fatalf("non-list node must survive wrapList")
	}

	// wrapLeaf: the pre-saturation text fallback for an overflowing
	// literal, and the bool leaf.
	r4 := &jsonic.Rule{Node: "1e999", ON: 1,
		O0: &jsonic.Token{Tin: jsonic.TinTX, SI: 2, Src: "1e999"}}
	wrapLeaf(r4, nil)
	if n, ok := r4.Node.(*NilVal); !ok || n.why != "not_number" {
		t.Fatalf("overflowing text must refuse as not_number")
	}
	r5 := &jsonic.Rule{Node: true}
	wrapLeaf(r5, nil)
	if v, ok := r5.Node.(*ScalarVal); !ok || v.kind != KindBoolean {
		t.Fatalf("bool leaf")
	}

	// trackOrder: the own-node map fallback, the elided spread value,
	// and the no-map bail.
	//
	// An elided spread MARKS the map rather than storing nothing (issue
	// #48): a spread is not a child, so there is no slot a refusal could
	// occupy, and the map itself becomes the refusal when it is
	// converted. Storing nothing is what used to let `x:&:` generate as
	// `{}` with the mistake gone.
	m2 := map[string]any{}
	r6 := &jsonic.Rule{Node: m2, Child: &jsonic.Rule{}}
	r6.EnsureU()["spread"] = true
	trackOrder(r6, nil)
	if m2[elidedSpreadKey] != true || len(m2) != 1 {
		t.Fatalf("elided spread must mark the map: %v", m2)
	}
	trackOrder(&jsonic.Rule{Node: "x"}, nil)
}

// snipExprCycles and evaluate, outside any parse.
func TestSnipAndEvaluateDirect(t *testing.T) {
	if out := snipExprCycles((*jsonic.ListRef)(nil)); out == nil {
		t.Fatalf("typed-nil ListRef identity")
	}

	// A ListRef whose Val slice is its own ancestor is snipped.
	s := make([]any, 1)
	lr := &jsonic.ListRef{Val: s}
	s[0] = lr
	snipExprCycles(s)
	if lr.Val != nil {
		t.Fatalf("ancestor back-edge must be snipped")
	}

	// evaluate with no rule: the NoRule sentinel, the dot-infix
	// missing-operand guard, and the unknown-operator refusal.
	if v, ok := evaluate(nil, nil, &expr.Op{Name: "dot-infix"}, nil).(Val); !ok || !v.Nil() {
		t.Fatalf("dot-infix without terms must be incomplete")
	}
	if v, ok := evaluate(nil, nil, &expr.Op{Name: "bogus-op"}, []any{newInteger(1)}).(Val); !ok || !v.Nil() {
		t.Fatalf("unknown operator must refuse")
	}

	// A top-level expression wrapper evaluates through asVal.
	if asVal(&jsonic.ListRef{Val: []any{2.5}}) == nil {
		t.Fatalf("expr wrapper must evaluate")
	}
}

// Round-3 stragglers: the based-literal arm of the lossy-literal rule,
// and the path-func walk through a non-path func's arguments.
func TestRound3Stragglers(t *testing.T) {
	if isLossyIntegerLiteral("0b101") {
		t.Fatalf("0b101 is exact")
	}
	if !hasPathFunc(newFunc("upper", []Val{newFunc("key", nil)})) {
		t.Fatalf("path func inside a plain func's args")
	}
}

// The custom lex matchers' entry guards, and the comment-starter stops
// inside scanTextExtent, on a hand-built lexer.
func TestLexMatcherGuards(t *testing.T) {
	cfg := jsonic.DefaultLexConfig()
	le := jsonic.NewLex("", cfg)
	if tsTextCheck(le) != nil || tsNumCheck(le) != nil {
		t.Fatalf("matchers must decline at end of input")
	}
	cfg.EnderChars = map[rune]bool{',': true}
	lc := jsonic.NewLex(",", cfg)
	if tsNumCheck(lc) != nil {
		t.Fatalf("number check must decline on an ender")
	}
	cfg2 := jsonic.DefaultLexConfig()
	cfg2.CommentLine = []string{"#"}
	cfg2.CommentBlock = [][2]string{{"/*", "*/"}}
	lb := jsonic.NewLex("x/*y*/", cfg2)
	if sI, _ := scanTextExtent(lb, 0, false); sI != 1 {
		t.Fatalf("block comment must stop the text extent, got %d", sI)
	}
}

// listIndex is the canonical-decimal grammar a path segment must match
// to be a list index — the rule references and `vet --at` share, and
// the rule the canonical port gets for free from JavaScript array
// indexing. `strconv.Atoi` had been standing in for it, and accepted a
// sign and leading zeros.
func TestListIndexIsCanonicalDecimal(t *testing.T) {
	for _, ok := range []struct {
		part string
		idx  int
	}{{"0", 0}, {"1", 1}, {"12", 12}, {"907", 907}} {
		if i, valid := listIndex(ok.part); !valid || i != ok.idx {
			t.Fatalf("listIndex(%q) = %d, %v", ok.part, i, valid)
		}
	}
	for _, bad := range []string{
		"", "01", "007", "-1", "-0", "+1", "x", "1x", " 1", "1.0",
		// A digit run that is not a number this machine can index by.
		"999999999999999999999999",
	} {
		if i, valid := listIndex(bad); valid {
			t.Fatalf("listIndex(%q) = %d, accepted", bad, i)
		}
	}
}
