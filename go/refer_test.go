/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"testing"
)

func TestAddrSegmentOK(t *testing.T) {
	for _, ok := range []string{"a", "Z", "0", "_", "-", "aZ0_-"} {
		if !addrSegmentOK(ok) {
			t.Errorf("addrSegmentOK(%q) = false, want true", ok)
		}
	}
	for _, bad := range []string{"", "a.b", "a/b", "a b", "a$", "é"} {
		if addrSegmentOK(bad) {
			t.Errorf("addrSegmentOK(%q) = true, want false", bad)
		}
	}
}

func TestParseAddressShapes(t *testing.T) {
	a, ok := parseAddress("$.services.auth")
	if !ok || !a.Absolute || 0 != a.Up || 2 != len(a.Parts) ||
		"services" != a.Parts[0] || "auth" != a.Parts[1] {
		t.Fatalf("parseAddress = %+v,%v", a, ok)
	}
	r, ok := parseAddress("..b.c")
	if !ok || r.Absolute || 1 != r.Up || 2 != len(r.Parts) ||
		"b" != r.Parts[0] || "c" != r.Parts[1] {
		t.Fatalf("parseAddress = %+v,%v", r, ok)
	}
	for _, bad := range []string{"$", "", "a.b", "services.auth", "$.",
		"$.a.", "$..a", ".", "..", "$.a b", "$.a/b"} {
		if _, ok := parseAddress(bad); ok {
			t.Errorf("parseAddress(%q) = ok, want not", bad)
		}
	}
}

func TestAddressPathResolution(t *testing.T) {
	abs, _ := parseAddress("$.a.b")
	if p, ok := addressPath(abs, []string{"x", "y", "dep"}); !ok ||
		2 != len(p) || "a" != p[0] || "b" != p[1] {
		t.Fatalf("absolute = %v,%v", p, ok)
	}
	// A relative one drops the link's OWN key and reads the sibling
	// scope: a link at $.x.y.dep spelling `.other` means $.x.y.other.
	sib, _ := parseAddress(".other")
	if p, ok := addressPath(sib, []string{"x", "y", "dep"}); !ok ||
		3 != len(p) || "x" != p[0] || "y" != p[1] || "other" != p[2] {
		t.Fatalf("sibling = %v,%v", p, ok)
	}
	// Each further dot is one step further up.
	up, _ := parseAddress("..other")
	if p, ok := addressPath(up, []string{"x", "y", "dep"}); !ok ||
		2 != len(p) || "x" != p[0] || "other" != p[1] {
		t.Fatalf("one up = %v,%v", p, ok)
	}
}

func TestRelValShape(t *testing.T) {
	r := newRel(nil)
	if 45000 != r.cjo() {
		t.Errorf("cjo = %d", r.cjo())
	}
	if !isTop(r.superior()) {
		t.Error("a rel has no meaningful superior")
	}
	v, err := r.Gen(&Ctx{})
	if nil != v || nil != err {
		t.Errorf("Gen = %v,%v; want nil,nil", v, err)
	}
	if "rel()" != r.Canon() {
		t.Errorf("Canon = %q", r.Canon())
	}
}

func TestReferValShape(t *testing.T) {
	r := newRefer(nil)
	if 120000 != r.cjo() {
		t.Errorf("cjo = %d", r.cjo())
	}
	if !isTop(r.superior()) {
		t.Error("a refer has no meaningful superior")
	}
	// Silent generation: the enclosing bag reports a value that never
	// became concrete, exactly as it does for a bare constraint.
	v, err := r.Gen(&Ctx{})
	if nil != v || nil != err {
		t.Errorf("Gen = %v,%v; want nil,nil", v, err)
	}
	if "refer()" != r.Canon() {
		t.Errorf("Canon = %q", r.Canon())
	}
	// A NIL peer is the self-drive the dispatcher never makes (it
	// substitutes TOP first), and answers the same pending residual.
	if out := r.Unify(nil, &Ctx{}); Val(r) != out {
		t.Error("a nil peer should leave the residual pending")
	}
}

func TestReferValLateDeliveryArms(t *testing.T) {
	ctx := &Ctx{root: newMap(), collect: true}
	r := newRefer(nil)
	addr, _ := parseAddress("$.q")
	r.addr, r.addrsrc = &addr, "$.q"
	refined, ok := r.Unify(newPath("$.q.r"), ctx).(*ReferVal)
	if !ok || "$.q.r" != refined.addrsrc {
		t.Fatalf("refined address = %v", refined)
	}
	// The prefix rule is symmetric in which side is pending.
	kept, ok := refined.Unify(newPath("$.q"), ctx).(*ReferVal)
	if !ok || "$.q.r" != kept.addrsrc {
		t.Fatalf("kept address = %v", kept)
	}
	if out := r.Unify(newPath("$.z"), ctx); !out.Nil() {
		t.Fatalf("incomparable = %s", out.Canon())
	}
	// held meets a second late constraint rather than replacing it.
	h := newRefer(nil)
	h1, ok := h.Unify(newScalarKind(KindString), ctx).(*ReferVal)
	if !ok || nil == h1.held {
		t.Fatalf("first held = %v", h1)
	}
	h2, ok := h1.Unify(newScalarKind(KindString), ctx).(*ReferVal)
	if !ok || nil == h2.held || h2.held.Nil() {
		t.Fatalf("second held = %v", h2)
	}
}

func TestReferMergeNilCombinations(t *testing.T) {
	ctx := &Ctx{}
	held := newScalarKind(KindString)
	typed := newMap()
	typed.set("k", newInteger(1))

	bare := newRefer(nil)
	withT := newRefer(typed)
	if out := bare.Unify(withT, ctx).(*ReferVal); Val(typed) != out.tval {
		t.Error("an untyped refer should take the peer's type")
	}
	if out := withT.Unify(newRefer(nil), ctx).(*ReferVal); Val(typed) != out.tval {
		t.Error("a typed refer should keep its type against an untyped peer")
	}
	typed2 := newMap()
	typed2.set("k2", newInteger(2))
	if out := withT.Unify(newRefer(typed2), ctx).(*ReferVal); nil == out.tval || out.tval.Nil() {
		t.Error("two typed refers should meet their types")
	}

	withH := newRefer(nil)
	withH.held = held
	if out := bare.Unify(withH, ctx).(*ReferVal); Val(held) != out.held {
		t.Error("an unheld refer should take the peer's held constraint")
	}
	if out := withH.Unify(newRefer(nil), ctx).(*ReferVal); Val(held) != out.held {
		t.Error("a held refer should keep it against an unheld peer")
	}
	withH2 := newRefer(nil)
	withH2.held = newScalarKind(KindString)
	if out := withH.Unify(withH2, ctx).(*ReferVal); nil == out.held || out.held.Nil() {
		t.Error("two held refers should meet their held constraints")
	}

	// And a peer that already has the address, when this one does not.
	addr, _ := parseAddress("$.svc_x")
	sited := newRefer(nil)
	sited.addr, sited.addrsrc = &addr, "$.svc_x"
	if out := bare.Unify(sited, ctx).(*ReferVal); "$.svc_x" != out.addrsrc {
		t.Errorf("the address should carry across the merge, got %q", out.addrsrc)
	}
}

func TestReferNilPeerIsTheNil(t *testing.T) {
	// A nil peer is absorbing, as everywhere else: the refer answers the
	// existing failure rather than minting a second one.
	n := newNil("test-nil")
	if out := newRefer(nil).Unify(n, &Ctx{}); Val(n) != out {
		t.Error("a nil peer should be returned unchanged")
	}
}

func TestFindAtWalksIntoNonBags(t *testing.T) {
	m := newMap()
	m.set("p", newInteger(1))
	root := newMap()
	root.set("x", m)

	if _, ok := findAt(root, []string{"x", "p", "q"}); ok {
		t.Error("a path through a scalar should not resolve")
	}
	if _, ok := findAt(root, []string{"x", "nope"}); ok {
		t.Error("a missing key should not resolve")
	}
	if _, ok := findAt(nil, []string{"x"}); ok {
		t.Error("no tree should not resolve")
	}
	// The empty path is `$`, refused as an address because it has no
	// parent to be written back into.
	if _, ok := findAt(root, nil); ok {
		t.Error("the empty path should not resolve")
	}
	site, ok := findAt(root, []string{"x", "p"})
	if !ok || Val(m) != site.parent || "p" != site.key {
		t.Fatalf("findAt = %+v,%v", site, ok)
	}
}

func TestAddressPathClimbsOffTheTop(t *testing.T) {
	addr, ok := parseAddress("...z")
	if !ok {
		t.Fatal("...z should parse as a relative address")
	}
	if _, ok := addressPath(addr, []string{"a", "dep"}); ok {
		t.Error("a climb off the top should not resolve")
	}

	ctx := &Ctx{}
	ctx.root = newMap()
	r := newRefer(nil)
	r.addr, r.addrsrc = &addr, "...z"
	r.path = []string{"a", "dep"}
	if out := r.settle(ctx, r); !out.Nil() {
		t.Fatalf("expected a nil, got %s", out.Canon())
	}
}

func TestReferFlowRefusalIsTheNil(t *testing.T) {
	ctx := &Ctx{}
	m := newMap()
	m.set("k", newInteger(1))
	root := newMap()
	root.set("x", m)
	ctx.root = root

	addr, _ := parseAddress("$.x")
	r := newRefer(newInteger(1))
	r.addr, r.addrsrc = &addr, "$.x"
	if out := r.settle(ctx, r); !out.Nil() {
		t.Fatalf("expected a nil, got %s", out.Canon())
	}
}

func TestRecurseBudgetBackstop(t *testing.T) {
	ctx := &Ctx{root: newMap(), collect: true}
	rec := newRecurse([]string{"n"}, maxUniteDepth)
	out := rec.Unify(newMap(), ctx)
	n, ok := out.(*NilVal)
	if !ok || "recursion_budget" != n.why {
		t.Fatalf("expected recursion_budget, got %s", out.Canon())
	}
	if "$.n" != n.details["target"] {
		t.Fatalf("target detail = %q", n.details["target"])
	}
}

func TestRecurseGenArms(t *testing.T) {
	rec := newRecurse([]string{"n"}, 0)
	_, err := rec.Gen(nil)
	ae, ok := err.(*AontuError)
	if !ok || "recursion_unexpanded" != ae.Code {
		t.Fatalf("no context: %v", err)
	}
	ctx := &Ctx{root: newMap()}
	out, err := rec.Gen(ctx)
	if nil != out || nil != err || 1 != len(ctx.err) || "recursion_unexpanded" != ctx.err[0].why {
		t.Fatalf("with a context: %v %v %v", out, err, ctx.err)
	}
}

func TestGraphAtomShape(t *testing.T) {
	ctx := &Ctx{root: newMap(), collect: true}

	// Bare atom: DONE at birth, self-drive answers itself.
	bare := newGraphAtom("acyclic", "", nil)
	if DONE != bare.Dc() {
		t.Fatalf("bare dc = %d", bare.Dc())
	}
	if bare != bare.Unify(nil, ctx) {
		t.Fatal("bare self-drive must answer itself")
	}

	// A held that is already done: the self-drive records DONE in
	// place and answers the atom.
	heldAtom := newGraphAtom("inverse", "q", newInteger(1))
	heldAtom.dc = 0
	if heldAtom != heldAtom.Unify(nil, ctx) || DONE != heldAtom.dc {
		t.Fatalf("held-done self-drive: dc = %d", heldAtom.dc)
	}

	broken := newGraphAtom("acyclic", "",
		newConjunct([]Val{newInteger(1), newInteger(2)}))
	if out := broken.Unify(nil, ctx); !out.Nil() {
		t.Fatalf("broken self-drive = %s", out.Canon())
	}

	// The clone arm carries the declaration and the held.
	c, ok := clonePath(heldAtom, []string{"p"}).(*GraphAtomVal)
	if !ok || "inverse" != c.akind || "q" != c.invname ||
		heldAtom.held != c.held || DONE != c.dc {
		t.Fatalf("clone = %+v", c)
	}

	// Dedup with one side unheld: the held side's value survives.
	dup := newGraphAtom("inverse", "q", nil)
	merged, ok := heldAtom.Unify(dup, ctx).(*GraphAtomVal)
	if !ok || nil == merged.held {
		t.Fatal("dedup dropped the held")
	}

	// Absorbing a first value: the atom carries it.
	carry, ok := bare.Unify(newInteger(7), ctx).(*GraphAtomVal)
	if !ok || nil == carry.held {
		t.Fatal("absorb did not carry")
	}

	// Dedup with BOTH sides held: the helds meet; agreeing values
	// merge, contradicting ones answer the nil.
	both, ok := carry.Unify(newGraphAtom("acyclic", "", newInteger(7)), ctx).(*GraphAtomVal)
	if !ok || nil == both.held {
		t.Fatal("held-held dedup dropped the value")
	}
	if out := both.Unify(newGraphAtom("acyclic", "", newInteger(8)), ctx); !out.Nil() {
		t.Fatalf("contradicting helds must refuse, got %s", out.Canon())
	}

	// The fold-order slot and superior, as TestRelValShape pins
	// rel's; canon with and without a held.
	if 46000 != bare.cjo() {
		t.Fatalf("cjo = %d", bare.cjo())
	}
	if !isTop(bare.superior()) {
		t.Fatal("an atom has no meaningful superior")
	}
	if "acyclic()" != bare.Canon() {
		t.Fatalf("bare canon = %q", bare.Canon())
	}
	if c := newGraphAtom("inverse", "q", nil).Canon(); `inverse("q")` != c {
		t.Fatalf("inverse canon = %q", c)
	}
}

func TestRecurseResidualShape(t *testing.T) {
	ctx := &Ctx{root: newMap(), collect: true}
	mk := func(target ...string) *RecurseVal { return newRecurse(target, 0) }

	r := mk("n")
	if r != r.Unify(nil, ctx) {
		t.Fatal("self-drive must answer itself")
	}

	// The same fixpoint twice is one fixpoint.
	if r != r.Unify(mk("n"), ctx) {
		t.Fatal("same target must dedup")
	}

	// Mutual recursion meeting: both held, in a conjunct.
	if _, ok := r.Unify(mk("m"), ctx).(*ConjunctVal); !ok {
		t.Fatal("mutual targets must hold in a conjunct")
	}

	// Concrete structure whose definition has not assembled (the root
	// holds no `n`): the peer is held beside the residual.
	if _, ok := r.Unify(newMap(), ctx).(*ConjunctVal); !ok {
		t.Fatal("unassembled definition must hold the peer")
	}

	// Anything else -- here a graph atom -- waits beside the residual
	// the same way.
	atom := newGraphAtom("acyclic", "", nil)
	if _, ok := r.Unify(atom, ctx).(*ConjunctVal); !ok {
		t.Fatal("a non-structural peer must hold in a conjunct")
	}

	// bumpRecurse: the conjunct arm and the spread tails.
	cj := newConjunct([]Val{mk("n")})
	bumpRecurse(cj, 5)
	if 5 != cj.peg[0].(*RecurseVal).xc {
		t.Fatal("bumpRecurse must reach a conjunct member")
	}

	ref := &RefVal{absolute: true, peg: []any{"n"}}
	bumpRecurse(ref, 7)
	if 7 != ref.rxc {
		t.Fatal("bumpRecurse must seed a raw reference to the target")
	}
	// Monotone, like the residual arm beside it.
	bumpRecurse(ref, 3)
	if 7 != ref.rxc {
		t.Fatal("the seed only ever grows")
	}

	// containsRecurseOf: the depth guard, and a target of a different
	// length is not the fixpoint.
	if containsRecurseOf(mk("n"), []string{"n"}, 9) {
		t.Fatal("depth guard must refuse")
	}
	if !containsRecurseOf(mk("n"), []string{"n"}, 0) {
		t.Fatal("the residual is its own fixpoint")
	}
	if containsRecurseOf(mk("n", "m"), []string{"n"}, 0) {
		t.Fatal("length mismatch is not the fixpoint")
	}

	// ... and it looks through LIST elements and conjunct members.
	if !containsRecurseOf(newList([]Val{mk("n")}), []string{"n"}, 0) {
		t.Fatal("a list element residual is the fixpoint")
	}
	if !containsRecurseOf(newConjunct([]Val{mk("n")}), []string{"n"}, 0) {
		t.Fatal("a conjunct member residual is the fixpoint")
	}

	// A residual of a DIFFERENT target length holds beside this one
	// (the sameTarget length arm).
	if _, ok := r.Unify(mk("n", "m"), ctx).(*ConjunctVal); !ok {
		t.Fatal("different-length targets must hold in a conjunct")
	}

	// bumpRecurse reaches list elements and both spread tails.
	lst := newList([]Val{mk("n")})
	lst.spread = mk("n")
	bumpRecurse(lst, 6)
	if 6 != lst.peg[0].(*RecurseVal).xc || 6 != lst.spread.(*RecurseVal).xc {
		t.Fatal("bumpRecurse must reach list elements and the spread")
	}
	mp := newMap()
	mp.spread = mk("n")
	bumpRecurse(mp, 7)
	if 7 != mp.spread.(*RecurseVal).xc {
		t.Fatal("bumpRecurse must reach a map spread")
	}

	// The residual's fold-order slot, superior, and the nil-ctx body
	// guard.
	if 47000 != r.cjo() {
		t.Fatalf("cjo = %d", r.cjo())
	}
	if !isTop(r.superior()) {
		t.Fatal("a residual has no meaningful superior")
	}
	if nil != r.body(nil) {
		t.Fatal("body without a context is nothing")
	}
}
