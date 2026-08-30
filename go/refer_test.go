/* Copyright (c) 2025 Richard Rodger, MIT License */

// The refer internals no source reaches (ADR-002; G4 phase 2). The
// residual is minted where it is used and answers whole shapes, so its
// per-arm behaviour — a name with a character no bare source can carry,
// the two nil-combination arms of a refer-meets-refer merge, a nil
// peer, an address that walks into a scalar, a flow whose top-level
// meet fails — is exercised here directly. Cross-package runs (the CLI
// tests) do not count toward this package's coverage.

package aontu

import (
	"testing"
)

func TestAddrSegmentOK(t *testing.T) {
	// Every arm of the character switch, including the two a source
	// cannot spell inside an address (an address is met as a STRING, so
	// the upper-case and digit arms are reachable, but the switch is
	// pinned whole here rather than by four spec rows that all say the
	// same thing).
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
	// An address is a TREE PATH (ADR-013), in the two spellings a
	// reference uses. The TS twin is address-spellings in
	// ts/test/coverage3.test.ts.
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
	// What is not an address. `$` alone names the whole document, which
	// has no position to be written back into; the rest are paths
	// without an anchor, empty segments, or characters no key spells.
	for _, bad := range []string{"$", "", "a.b", "services.auth", "$.",
		"$.a.", "$..a", ".", "..", "$.a b", "$.a/b"} {
		if _, ok := parseAddress(bad); ok {
			t.Errorf("parseAddress(%q) = ok, want not", bad)
		}
	}
}

func TestAddressPathResolution(t *testing.T) {
	// The TS twin is address-path-resolution in
	// ts/test/coverage3.test.ts.
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
	// The stubs no spec row reaches: the fold-order slot and the
	// silent generation of a settled-but-unmet relation (the bag
	// drops an optional one before asking, and a required one errors
	// before generation). The TS twin is rel-func-shape in
	// ts/test/coverage3.test.ts.
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
	// LAST in a conjunct fold: a refer has to see the string it
	// constrains, and the string is what the other terms produce.
	if 45000 != r.cjo() {
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

func TestReferMergeNilCombinations(t *testing.T) {
	ctx := &Ctx{}
	held := newScalarKind(KindString)
	typed := newMap()
	typed.set("k", newInteger(1))

	// The merge's four corners: neither side typed, one side typed
	// either way, and neither side holding vs one side holding.
	bare := newRefer(nil)
	withT := newRefer(typed)
	if out := bare.Unify(withT, ctx).(*ReferVal); Val(typed) != out.tval {
		t.Error("an untyped refer should take the peer's type")
	}
	if out := withT.Unify(newRefer(nil), ctx).(*ReferVal); Val(typed) != out.tval {
		t.Error("a typed refer should keep its type against an untyped peer")
	}

	withH := newRefer(nil)
	withH.held = held
	if out := bare.Unify(withH, ctx).(*ReferVal); Val(held) != out.held {
		t.Error("an unheld refer should take the peer's held constraint")
	}
	if out := withH.Unify(newRefer(nil), ctx).(*ReferVal); Val(held) != out.held {
		t.Error("a held refer should keep it against an unheld peer")
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
	// A path that descends THROUGH a scalar names nothing: the walk
	// stops rather than guessing. Reachable from source only as a
	// pending refer that later refuses, so the walk itself is pinned
	// here. The TS twin is find-at-walks-into-non-bags in
	// ts/test/coverage3.test.ts.
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
	// A relative address with more parent steps than the link has
	// ancestors. No later pass can grow the tree upwards, so settle
	// refuses at once rather than residuating to the last pass. The TS
	// twin is address-path-resolution / refer-climb-off-the-top-refuses.
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
	// A flow whose TOP-LEVEL meet fails answers the nil rather than
	// writing a broken representative back: `refer(1)` against a map
	// target. From source the conflict usually lands on a FIELD (the
	// maps meet and one key disagrees), so the whole-value refusal is
	// pinned here.
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
	// The T-1 backstop (RECURSION.0.md): the depth budget is shared
	// with the unite nesting guard, so through DATA the nesting guard
	// always trips first -- a chain deep enough to charge the residual
	// is a tree too deep to drive. The arm is a backstop, pinned
	// directly: a residual already charged to the budget refuses the
	// next expansion as recursion_budget, naming the target. The TS
	// twin is recurse-budget-backstop in ts/test/coverage3.test.ts.
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

func TestGraphAtomShape(t *testing.T) {
	// The atom arms no document reaches through unite's ladder: the
	// fast paths skip a DONE value with no peer, so the self-drive's
	// held-nil and held-done returns and the dedup/absorb held merges
	// are pinned directly, the way TestRelValShape pins rel's. The TS
	// twin is graph-atom-shape in ts/test/coverage3.test.ts.
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

	// A held whose own drive collapses to a nil (a pending conjunct
	// of two scalars): the self-drive answers the nil.
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
	// The residual arms unite's ladder never dispatches to (the fast
	// paths skip a DONE value with no peer) and the hold arms a
	// document with an assembled definition never revisits, pinned
	// directly, the way TestGraphAtomShape pins the atom's. The TS
	// twin is recurse-residual-shape in ts/test/coverage3.test.ts.
	ctx := &Ctx{root: newMap(), collect: true}
	mk := func(target ...string) *RecurseVal { return newRecurse(target, 0) }

	// Self-drive: nothing to advance.
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
