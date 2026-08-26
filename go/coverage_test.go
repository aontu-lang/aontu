/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// Direct unit tests for engine paths a shared spec row cannot reach:
// comparison-internal branches (binary64 infinities never constructible
// from source), defensive contracts (ExpectVal.Gen's deliberate
// silence), tooling walks (Check/Spans over every Val kind), and small
// plumbing helpers. Everything reachable FROM SOURCE is pinned by
// shared rows instead (test/spec/*.tsv, edge.tsv in particular); these
// tests exist for the remainder, per docs/test-coverage.md.

import (
	"math"
	"math/big"
	"strings"
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

// The binary64 infinities order below/above everything finite and are
// equal to themselves. No aontu source constructs an infinite float
// (1e999 is a not_number error), so the scaled-comparison branches are
// pinned here, not by rows.
func TestScaledInfinities(t *testing.T) {
	pinf := scaledOfFloat(math.Inf(1))
	ninf := scaledOfFloat(math.Inf(-1))
	one := scaledOfFloat(1)
	if pinf.inf != 1 || ninf.inf != -1 {
		t.Fatalf("inf marks: %+v %+v", pinf, ninf)
	}
	if cmpScaled(ninf, one) != -1 || cmpScaled(one, pinf) != -1 {
		t.Fatalf("finite vs inf ordering broken")
	}
	if cmpScaled(pinf, pinf) != 0 || cmpScaled(pinf, ninf) != 1 {
		t.Fatalf("inf vs inf ordering broken")
	}
	if scaledIsIntegral(pinf) {
		t.Fatalf("an infinity is not integral")
	}
}

// A subnormal float converts exactly (expBits 0 branch), and the
// scale-alignment branches of cmpScaled agree with float ordering.
func TestScaledSubnormalAndAlignment(t *testing.T) {
	sub := math.SmallestNonzeroFloat64
	s := scaledOfFloat(sub)
	if s.inf != 0 || s.unscaled.Sign() != 1 || s.scale != 1074 {
		t.Fatalf("subnormal conversion: %+v", s)
	}
	// 0.5 (scale 1) vs 0.25 (scale 2): alignment in both directions.
	a, b := scaledOfFloat(0.5), scaledOfFloat(0.25)
	if cmpScaled(a, b) != 1 || cmpScaled(b, a) != -1 {
		t.Fatalf("scale alignment broken")
	}
}

// towerRank's float default and the biginteger rank, direct.
func TestTowerRankDirect(t *testing.T) {
	f := numberVal(1.5, "", -1).(*ScalarVal)
	bi := &ScalarVal{kind: KindBigInteger, peg: big.NewInt(2)}
	if towerRank(f) != 1 || towerRank(bi) != 2 {
		t.Fatalf("towerRank: %d %d", towerRank(f), towerRank(bi))
	}
}

// ExpectVal.Gen is deliberately silent dead code (the bag-level Gen
// intercepts expect children first, in both ports); the contract that
// it stays silent is pinned here. superior() is TOP, like every
// residual feature.
func TestExpectValContracts(t *testing.T) {
	e := &ExpectVal{peg: newScalarKind(KindString)}
	v, err := e.Gen(nil)
	if v != nil || err != nil {
		t.Fatalf("ExpectVal.Gen must be silent, got %v %v", v, err)
	}
	if _, ok := e.superior().(*TopVal); !ok {
		t.Fatalf("ExpectVal.superior must be top")
	}
	if isExpect(newTop()) {
		t.Fatalf("isExpect(top) must be false")
	}
	// A TOP peer leaves the expect pending-but-done.
	out := e.Unify(top(), nil)
	if out != Val(e) || out.Dc() != DONE {
		t.Fatalf("top peer must keep the expect, done")
	}
}

// listval_spread_required is registered vocabulary with NO source-level
// raise site in either port (only maps create expects). The branch is
// the mirrored BagVal.gen shape; pin its message contract directly.
func TestListSpreadRequiredBranch(t *testing.T) {
	parent := newMap()
	parent.sp = 3
	ev := &ExpectVal{peg: newScalarKind(KindString), parent: parent, key: "0"}
	l := &ListVal{peg: []Val{ev}}
	_, err := l.Gen(&Ctx{src: "a:b", file: ""})
	if err == nil {
		t.Fatalf("expected listval_spread_required")
	}
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "listval_spread_required" {
		t.Fatalf("want listval_spread_required, got %v", err)
	}
	// A collect ctx truncates silently instead.
	out, err2 := l.Gen(&Ctx{collect: true})
	if err2 != nil || len(out.([]any)) != 0 {
		t.Fatalf("collect must truncate: %v %v", out, err2)
	}
}

// Check and Spans walk every Val kind; the kinds and problem set are
// the LSP surface contract (valKind, collectSpans, collectNils).
func TestCheckAndSpansKinds(t *testing.T) {
	a := New()
	spans := a.Spans("a:1 b:1.5 c:x d:true e:null f:{g:[2]} h:number i:$.a j:1|top k:*7 m:min(0) n:upper(z)")
	kinds := map[string]bool{}
	for _, sp := range spans {
		kinds[sp.Kind] = true
	}
	for _, want := range []string{"integer", "float", "string", "boolean",
		"null", "type", "constraint"} {
		if !kinds[want] {
			t.Fatalf("Spans missing kind %q in %v", want, kinds)
		}
	}
	probs := a.Check("a:1 a:2 b:$.zz")
	if len(probs) < 2 {
		t.Fatalf("Check must surface both problems, got %v", probs)
	}
}

// UnifyVars surfaces a parse error (the error-return branch of the
// public API).
func TestUnifyVarsParseError(t *testing.T) {
	// jsonic is lenient about unclosed braces, so use a genuine
	// unparseable operator instead.
	_, err := New().UnifyVars("a:number > 0", nil)
	if err == nil {
		t.Fatalf("expected parse error")
	}
}

// BuiltinFuncNames is sorted and matches funcSet exactly.
func TestBuiltinFuncNamesDirect(t *testing.T) {
	names := BuiltinFuncNames()
	if len(names) != len(funcSet) {
		t.Fatalf("length mismatch")
	}
	for i, n := range names {
		if !funcSet[n] {
			t.Fatalf("unknown name %q", n)
		}
		if i > 0 && names[i-1] >= n {
			t.Fatalf("not sorted at %d", i)
		}
	}
}

// Small plumbing helpers with no other reachable call path.
func TestPlumbingHelpers(t *testing.T) {
	// numStr: integral floats print as integers, others as floats.
	if numStr(3) != "3" || numStr(1.5) != "1.5" {
		t.Fatalf("numStr: %q %q", numStr(3), numStr(1.5))
	}
	// setPos is the Val-interface position setter.
	v := newString("x")
	Val(v).setPos(7)
	if v.pos() != 7 {
		t.Fatalf("setPos")
	}
	// srcOr prefers the recorded source text.
	if srcOr("src", func() string { return "fb" }) != "src" ||
		srcOr("", func() string { return "fb" }) != "fb" {
		t.Fatalf("srcOr")
	}
	// Decimal String is the 0d-less digits rendering.
	d := newDecimal(big.NewInt(15), 1)
	if d.String() != "1.5" {
		t.Fatalf("Decimal.String: %q", d.String())
	}
	// codeClass prefix families: op[ is conflict, var[/ref[ reference.
	if codeClass("op[+]") != "conflict" || codeClass("var[x") != "reference" ||
		codeClass("ref[x") != "reference" {
		t.Fatalf("codeClass prefixes")
	}
}

// TopVal.Unify delegates to a non-top peer; NilVal.Gen defaults a
// missing why to nil_gen; Message renders the resolve form.
func TestTopAndNilContracts(t *testing.T) {
	one := numberVal(1, "1", -1)
	if out := newTop().Unify(one, &Ctx{}); out != Val(one) {
		t.Fatalf("top must yield the peer")
	}
	n := &NilVal{}
	n.sp = -1
	_, err := n.Gen(nil)
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "nil_gen" {
		t.Fatalf("why-less nil must gen nil_gen, got %v", err)
	}
	m := newNil("no_gen")
	m.primary = one
	if !strings.Contains(m.Message(), "Cannot resolve value: 1") {
		t.Fatalf("Message: %q", m.Message())
	}
}

// The parse-depth bound: >10000 nested lists is a clean max_depth
// error at parse — the iterative valTreeDepth guard (the recursive
// walkers rely on it; see maxNodeDepth).
func TestMaxDepthGuard(t *testing.T) {
	n := maxNodeDepth + 2
	src := "a:" + strings.Repeat("[", n) + "1" + strings.Repeat("]", n)
	_, err := New().Generate(src)
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "max_depth" {
		t.Fatalf("want max_depth, got %v", err)
	}
}

// asValDepth defensive fallbacks: an unknown raw node is parse_unknown;
// beyond-limit raw nesting is max_depth (the raw-side guard).
func TestAsValFallbacks(t *testing.T) {
	if v := asVal(struct{}{}); !v.Nil() {
		t.Fatalf("unknown raw node must be a nil")
	}
	deep := any("x")
	for i := 0; i < maxNodeDepth+2; i++ {
		deep = []any{deep}
	}
	// The fallback listOfRaw path guards raw recursion.
	v := asVal(deep)
	found := false
	var walk func(Val, int)
	walk = func(x Val, d int) {
		if found || d > maxNodeDepth+3 {
			return
		}
		if nv, ok := x.(*NilVal); ok && nv.why == "max_depth" {
			found = true
			return
		}
		if lv, ok := x.(*ListVal); ok && len(lv.peg) > 0 {
			walk(lv.peg[0], d+1)
		}
	}
	walk(v, 0)
	if !found {
		t.Fatalf("deep raw list must embed a max_depth nil")
	}
}

// Direct Unify contracts shared by the residual family: a nil receiver
// argument peer normalises to TOP, and self-unification is identity.
func TestResidualUnifyIdentity(t *testing.T) {
	ctx := &Ctx{root: newMap()}
	rv := &RefVal{absolute: true, peg: []any{"zz"}}
	if rv.Unify(nil, ctx) == nil {
		t.Fatalf("ref nil peer")
	}
	if rv.Unify(rv, ctx) != Val(rv) {
		t.Fatalf("ref self peer")
	}
	f := newFunc("upper", []Val{newString("x")})
	if f.Unify(f, ctx) != Val(f) {
		t.Fatalf("func self peer")
	}
	o := newPlusOp(numberVal(1, "1", -1), &RefVal{absolute: true, peg: []any{"zz"}})
	if o.Unify(o, ctx) != Val(o) {
		t.Fatalf("op self peer")
	}
	d := newDisjunct([]Val{numberVal(1, "1", -1)})
	if d.Unify(nil, ctx) == nil {
		t.Fatalf("disjunct nil peer")
	}
	l := &ListVal{}
	if l.Unify(nil, ctx) == nil {
		t.Fatalf("list nil peer")
	}
}

// A deferring reference meeting a NIL peer or its own spelling (the
// found==nil and found-is-ref defer arms).
func TestRefDeferPeers(t *testing.T) {
	// A pending (not-done) node mid-path makes find defer (return nil),
	// reaching the defer arms.
	root := newMap()
	root.set("a", newConjunct([]Val{numberVal(1, "1", -1)}))
	ctx := &Ctx{root: root}
	rv := &RefVal{absolute: true, peg: []any{"a", "b"}}
	n := newNil("x")
	if out := rv.Unify(n, ctx); !out.Nil() {
		t.Fatalf("nil peer must fail")
	}
	rv2 := &RefVal{absolute: true, peg: []any{"a", "b"}}
	if out := rv.Unify(rv2, ctx); out.Nil() {
		t.Fatalf("same-canon ref peer must defer, got %v", out.Canon())
	}
}

// RefVal.append raw-part branches and the VarVal rendering helpers.
func TestRefAppendAndVarPlumbing(t *testing.T) {
	rv := &RefVal{}
	rv.append("a")
	rv.append(2.0)
	rv.append(1.5)
	if strings.Join(func() []string {
		out := []string{}
		for _, p := range rv.peg {
			out = append(out, p.(string))
		}
		return out
	}(), "/") != "a/2/1.5" {
		t.Fatalf("append parts: %v", rv.peg)
	}
	vv := &VarVal{peg: "name"}
	if vv.Canon() != "$name" {
		t.Fatalf("var canon: %q", vv.Canon())
	}
	if _, ok := vv.superior().(*TopVal); !ok {
		t.Fatalf("var superior")
	}
	if varName(&VarVal{peg: 3}) != "" {
		t.Fatalf("varName non-string")
	}
	if varName(&VarVal{peg: newString("s")}) != "s" {
		t.Fatalf("varName scalar string")
	}
	v2, err := (&VarVal{peg: "x"}).Gen(nil)
	if v2 != nil || err != nil {
		t.Fatalf("VarVal.Gen must be silent")
	}
	g, err := (&RefVal{absolute: true, peg: []any{"q"}}).Gen(nil)
	if g != nil || err == nil {
		t.Fatalf("RefVal.Gen must error as residue")
	}
}

// pathEq, direct. (keyArgVal went with G8 phase 1: the residuation
// twin check compares canon, which the two ports already agree on,
// rather than a key()-specific argument comparison.)
func TestFuncHelpers(t *testing.T) {
	if pathEq([]string{"a"}, []string{"a", "b"}) || !pathEq([]string{"a"}, []string{"a"}) ||
		pathEq([]string{"a"}, []string{"b"}) {
		t.Fatalf("pathEq")
	}
}

// PlusOpVal.Gen is the no_gen residue contract (a root-level `1+$.x`
// that never resolves reports differently per port — the Gen itself is
// the Go classification site).
func TestPlusOpGen(t *testing.T) {
	o := newPlusOp(numberVal(1, "1", -1), numberVal(2, "2", -1))
	_, err := o.Gen(nil)
	ae, ok := err.(*AontuError)
	// `op`, not `no_gen`: a residual operator is what TS's OpBaseVal.gen
	// raises, and only the root position reaches this method (issue #38).
	if !ok || ae.Code != "op" {
		t.Fatalf("PlusOp.Gen: %v", err)
	}
	// primStr/primFloat defaults.
	if primStr(struct{}{}) != "" || primFloat(struct{}{}) != 0 {
		t.Fatalf("prim defaults")
	}
}

// An empty disjunct folds to nothing and reports |:empty.
func TestEmptyDisjunctGen(t *testing.T) {
	d := newDisjunct(nil)
	_, err := d.Gen(nil)
	ae, ok := err.(*AontuError)
	if !ok || ae.Code != "|:empty" {
		t.Fatalf("empty disjunct: %v", err)
	}
}

// unite's nil-operand arms and the recursion bound.
func TestUniteArms(t *testing.T) {
	ctx := &Ctx{}
	one := numberVal(1, "1", -1)
	if unite(ctx, nil, one) != Val(one) {
		t.Fatalf("nil a")
	}
	n := newNil("x")
	if unite(ctx, n, one) != Val(n) || unite(ctx, one, n) != Val(n) {
		t.Fatalf("nil operands short-circuit")
	}
	deep := &Ctx{depth: maxUniteDepth + 1}
	if out := unite(deep, one, one); !out.Nil() {
		t.Fatalf("depth bound must yield unify_cycle nil")
	}
}

// Check surfaces a parse error as a problem, and Spans is empty for
// unparseable source (the error arms of the tooling API).
func TestCheckParseError(t *testing.T) {
	a := New()
	probs := a.Check("a:number > 0")
	if len(probs) == 0 {
		t.Fatalf("parse error must be a problem")
	}
	if spans := a.Spans("a:number > 0"); len(spans) != 0 {
		t.Fatalf("spans of unparseable source must be empty")
	}
	// Deeper span walks: nested bags, junction residue, funcs, refs.
	spans := a.Spans("a:{b:[1,{c:2}]} d:$.a e:top f:1|$.zz g:upper($.zz)")
	if len(spans) == 0 {
		t.Fatalf("expected spans")
	}
}

// Constraint internals no source reaches: the NaN guard (no literal
// spells NaN), mixed-domain scalar identity, direct nil/top peers on a
// residual, and tighterBound's one-sided arms.
func TestConstraintInternals(t *testing.T) {
	nan := numberVal(math.NaN(), "", -1).(*ScalarVal)
	if sv, d := orderableScalar(nan); sv != nil || d != "" {
		t.Fatalf("NaN must not be orderable")
	}
	one := numberVal(1, "1", -1).(*ScalarVal)
	s := newString("x")
	if sameConstraintScalar(one, s) || sameConstraintScalar(s, one) {
		t.Fatalf("mixed domains are never the same scalar")
	}
	c := newConstraint("min", []Val{one}, -1)
	if c.Unify(nil, &Ctx{}) != Val(c) || c.Unify(top(), &Ctx{}) != Val(c) {
		t.Fatalf("nil/top peer must keep the residual")
	}
	lo := &constraintBound{v: one}
	if tighterBound("number", nil, lo, true) != lo ||
		tighterBound("number", lo, nil, true) != lo {
		t.Fatalf("one-sided tighterBound arms")
	}
	if _, ok := c.superior().(*TopVal); !ok {
		t.Fatalf("constraint superior")
	}
	if _, err := c.Gen(nil); err == nil {
		t.Fatalf("constraint gen must refuse")
	}
}

// clonePath carries a PrefVal's gate fields and a RefVal's flags; the
// hideFound flag survives (move()-made refs cloned through paths).
func TestClonePrefAndRefFlags(t *testing.T) {
	p := &PrefVal{peg: numberVal(1, "1", -1), rank: 1}
	p.dc = DONE
	c := clonePath(p, []string{"q"}).(*PrefVal)
	if c.rank != 1 || c.peg != p.peg || !c.posu() {
		t.Fatalf("pref clone fields")
	}
	r := &RefVal{absolute: true, hideFound: true, copyFound: true, peg: []any{"x"}}
	cr := clonePath(r, nil).(*RefVal)
	if !cr.hideFound || !cr.copyFound {
		t.Fatalf("ref clone flags")
	}
}

// PrefVal.Unify's direct nil-peer arm (unite short-circuits nils
// before PrefVal sees them, so only a direct call reaches it), and
// Gen of an unresolved pref.
func TestPrefDirectArms(t *testing.T) {
	p := &PrefVal{peg: numberVal(1, "1", -1)}
	if out := p.Unify(newNil("x"), &Ctx{}); !out.Nil() {
		t.Fatalf("nil peer")
	}
	_, err := (&PrefVal{peg: &RefVal{absolute: true, peg: []any{"zz"}}}).Gen(&Ctx{})
	if err == nil {
		t.Fatalf("unresolved pref gen must refuse")
	}
}

// ConjunctVal direct arms: nil peer normalises to TOP; a member that
// unites to a conjunct is kept deferred.
func TestConjunctDirectArms(t *testing.T) {
	cj := newConjunct([]Val{numberVal(1, "1", -1)})
	if out := cj.Unify(nil, &Ctx{root: newMap()}); out == nil {
		t.Fatalf("nil peer")
	}
	if _, ok := newConjunct(nil).superior().(*TopVal); !ok {
		t.Fatalf("conjunct superior")
	}
	if _, err := newConjunct(nil).Gen(nil); err == nil {
		t.Fatalf("conjunct gen must refuse")
	}
}

// Kind.String's fallback, formatNumber's non-finite renderings (only
// the exported NewNumber constructor can build them), and the sprOf
// default.
func TestScalarRenderingEdges(t *testing.T) {
	if Kind(99).String() != "top" || KindNil.String() != "nil" {
		t.Fatalf("kind string fallbacks")
	}
	if formatNumber(math.NaN()) != "NaN" ||
		formatNumber(math.Inf(1)) != "Infinity" ||
		formatNumber(math.Inf(-1)) != "-Infinity" {
		t.Fatalf("non-finite renderings")
	}
	if sprOf(numberVal(1, "1", -1)) != nil {
		t.Fatalf("sprOf non-bag")
	}
	if !isEmptyGen([]any{}) || isEmptyGen(3) {
		t.Fatalf("isEmptyGen arms")
	}
}

// ScalarKindVal.Unify's nil/top arms, and mark ratcheting between
// duplicate scalars (the mtype/mhide propagation branch).
func TestScalarKindAndMarks(t *testing.T) {
	k := newScalarKind(KindInteger)
	if k.Unify(nil, &Ctx{}) != Val(k) || k.Unify(top(), &Ctx{}) != Val(k) {
		t.Fatalf("kind nil/top arms")
	}
	a := newInteger(1)
	b := newInteger(1)
	b.mtype = true
	b.mhide = true
	out := a.Unify(b, &Ctx{})
	if !out.markedType() || !out.markedHide() {
		t.Fatalf("marks must ratchet across equal scalars")
	}
}

// TopVal.Gen is silent; NilVal.superior is itself; message/fullmsg
// caches return the stored string on the second call.
func TestValMiscArms(t *testing.T) {
	g, err := newTop().Gen(nil)
	if g != nil || err != nil {
		t.Fatalf("top gen silent")
	}
	n := newNil("no_path")
	if n.superior() != Val(n) {
		t.Fatalf("nil superior")
	}
	m1 := n.Message()
	if n.Message() != m1 {
		t.Fatalf("message cache")
	}
	f1 := n.FullMessage("", "")
	if n.FullMessage("", "") != f1 {
		t.Fatalf("fullmsg cache")
	}
}

// ExpectVal accumulates a SECOND concrete peer (the unite arm of the
// accumulator) before escaping.
func TestExpectSecondPeer(t *testing.T) {
	e := &ExpectVal{peg: newScalarKind(KindInteger)}
	ctx := &Ctx{root: newMap()}
	out1 := e.Unify(newScalarKind(KindNumber), ctx)
	// Unify is PURE (the unequal-spread crosswire, BUGS.md §6-§7): a
	// non-escaping peer rides a NEW expectation while the met node —
	// possibly a shared spread template's child — stays untouched.
	e1, ok := out1.(*ExpectVal)
	if !ok || e1 == e || e1.peer == nil {
		t.Fatalf("kind peer must not escape, and its state must ride a new node: %v", out1.Canon())
	}
	if e.peer != nil {
		t.Fatalf("the met expectation itself must stay untouched (shared-template safety)")
	}
	out2 := e1.Unify(newInteger(7), ctx)
	if sv, ok := out2.(*ScalarVal); !ok || sv.peg.(int64) != 7 {
		t.Fatalf("second, concrete peer must escape through the carried node: %v", out2.Canon())
	}
}

// residuePaths truncates at max and walks list children; ctx.errmsg
// joins collected errors.
func TestResiduePathsAndErrmsg(t *testing.T) {
	m := newMap()
	l := &ListVal{peg: []Val{&RefVal{absolute: true, peg: []any{"z"}}}}
	l.dc = 1
	m.set("a", l)
	m.dc = 1
	paths := residuePaths(m, 1)
	if len(paths) != 1 {
		t.Fatalf("residuePaths max cut: %v", paths)
	}
	c := &Ctx{}
	c.adderr(newNil("no_path"))
	if c.errmsg() == "" {
		t.Fatalf("errmsg must render")
	}
	// walkMark's list arm.
	lv := &ListVal{peg: []Val{newInteger(1)}}
	walkMark(lv, false, true, false, false)
}

// plusAdd's string arms and operate's default fallthrough are only
// reachable through mixed raw primitives.
func TestPlusAddArms(t *testing.T) {
	if plusAdd("a", int64(1)) != "a1" || plusAdd(int64(1), "b") != "1b" {
		t.Fatalf("plusAdd string arms")
	}
}

// resolve's unknown-name fallback (every funcSet name has a resolve
// case; the fallback guards a registry/resolve drift, reachable only
// directly).
func TestKeyArgAndResolveFallback(t *testing.T) {
	bad := newFunc("min", []Val{})
	ctx := &Ctx{root: newMap()}
	out := bad.resolve(ctx, nil, nil)
	if out == nil || !out.Nil() {
		t.Fatalf("resolve fallback must refuse: %v", out)
	}
}

// Package-level lexer/number helpers, driven directly: the exactness
// checks, based-literal parsing, negation source forms, and the
// op-char hint's quote states.
func TestLexerHelpersDirect(t *testing.T) {
	// isLossyIntegerLiteral: signed forms, bad based digits, huge and
	// negative exponents, zero at any exponent, non-digit rejection.
	for src, want := range map[string]bool{
		"+9007199254740993":      true,
		"-123":                   false,
		"0b12":                   false,
		"1e99999999999999999999": false,
		"0e500":                  false,
		"12a":                    false,
		"1e-5":                   false,
		"0x1z":                   false,
	} {
		if got := isLossyIntegerLiteral(src); got != want {
			t.Fatalf("isLossyIntegerLiteral(%q) = %v", src, got)
		}
	}
	if !allDigits("123") || allDigits("") || allDigits("1a") {
		t.Fatalf("allDigits")
	}
	// based numeric recognisers, signed and malformed.
	if !basedNumeric("-0x1F") || basedNumeric("0x") || basedNumeric("0xZZ") {
		t.Fatalf("basedNumeric arms")
	}
	if v, ok := basedFloat("0xFF"); !ok || v != 255 {
		t.Fatalf("basedFloat hex: %v %v", v, ok)
	}
	if v, ok := basedFloat("-0o7"); !ok || v != -7 {
		t.Fatalf("basedFloat signed octal: %v %v", v, ok)
	}
	if v, ok := basedFloat("+0b11"); !ok || v != 3 {
		t.Fatalf("basedFloat binary: %v %v", v, ok)
	}
	if _, ok := basedFloat("0xZZ"); ok {
		t.Fatalf("basedFloat bad digits must fail")
	}
	// negSrc empty-source arm.
	if negSrc("") != "" {
		t.Fatalf("negSrc empty")
	}
	// keyOf nil-token arm.
	if keyOf(nil) != "" {
		t.Fatalf("keyOf nil")
	}
	// opCharHint: a quote closed at a later index, an escaped quote,
	// and a fully-quoted source with no operator chars.
	if opCharHint(`a:"x" b:'y'`) != "" {
		t.Fatalf("quoted-only source must not hint")
	}
	if opCharHint(`a:"<" b:>`) == "" {
		t.Fatalf("unquoted > after quoted < must hint")
	}
	if opCharHint(`a:"\"<" c:1`) != "" {
		t.Fatalf("escaped quote must stay in-quote")
	}
}

// langForBase caches per base (the second lookup is the cache-hit
// arm), and NewWithBase drives the based parse path.
func TestLangCacheHit(t *testing.T) {
	a1 := NewWithBase("cachebase")
	if _, err := a1.Unify("a:1"); err != nil {
		t.Fatal(err)
	}
	a2 := NewWithBase("cachebase")
	if _, err := a2.Unify("b:2"); err != nil {
		t.Fatal(err)
	}
}

// asVal's expression wrappers: a nil ListRef, an empty one, and the
// snip walk over shared slices.
func TestAsValExprWrappers(t *testing.T) {
	if sv, ok := asVal(&jsonic.ListRef{}).(*ScalarVal); !ok || sv.kind != KindNull {
		t.Fatalf("empty ListRef must be null")
	}
	if out := snipExprCycles(nil); out != nil {
		t.Fatalf("snip nil")
	}
	shared := []any{1.0}
	cyc := &jsonic.ListRef{Val: []any{shared, shared}}
	if snipExprCycles(cyc) == nil {
		t.Fatalf("snip shared (non-cycle) must keep")
	}
}
