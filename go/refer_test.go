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
	a, ok := parseAddress("svc_auth.ports.http")
	if !ok || "svc_auth" != a.Name || 2 != len(a.Path) ||
		"ports" != a.Path[0] || "http" != a.Path[1] {
		t.Fatalf("parseAddress = %+v,%v", a, ok)
	}
	if _, ok := parseAddress("svc_auth."); ok {
		t.Error("a trailing dot is not an address")
	}
	// D-1: the name half is a flat identifier -- no slash.
	if _, ok := parseAddress("svc/auth.ports"); ok {
		t.Error("a slashed name is not an address")
	}
	if _, ok := parseAddress("a b"); ok {
		t.Error("a space is not an address")
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
	addr, _ := parseAddress("svc_x")
	sited := newRefer(nil)
	sited.addr, sited.addrsrc = &addr, "svc_x"
	if out := bare.Unify(sited, ctx).(*ReferVal); "svc_x" != out.addrsrc {
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

func TestFindEntityWalksIntoNonBags(t *testing.T) {
	// An address that descends THROUGH a scalar names nothing: the walk
	// stops rather than guessing. Reachable from source only as a
	// pending refer that later refuses, so the walk itself is pinned
	// here.
	ctx := &Ctx{entities: map[string]Val{}}
	m := newMap()
	m.set("p", newInteger(1))
	ctx.entities["x"] = m

	addr, _ := parseAddress("x.p.q")
	if _, ok := findEntity(ctx, addr); ok {
		t.Error("a path through a scalar should not resolve")
	}
	addr2, _ := parseAddress("x.nope")
	if _, ok := findEntity(ctx, addr2); ok {
		t.Error("a missing key should not resolve")
	}
	addr3, _ := parseAddress("nosuch")
	if _, ok := findEntity(ctx, addr3); ok {
		t.Error("an unknown entity should not resolve")
	}
	addr4, _ := parseAddress("x.p")
	site, ok := findEntity(ctx, addr4)
	if !ok || Val(m) != site.parent || "p" != site.key {
		t.Fatalf("findEntity = %+v,%v", site, ok)
	}
}

func TestReferFlowRefusalIsTheNil(t *testing.T) {
	// A flow whose TOP-LEVEL meet fails answers the nil rather than
	// writing a broken representative back: `refer(1)` against a map
	// target. From source the conflict usually lands on a FIELD (the
	// maps meet and one key disagrees), so the whole-value refusal is
	// pinned here.
	ctx := &Ctx{entities: map[string]Val{}}
	m := newMap()
	m.set("k", newInteger(1))
	ctx.entities["x"] = m

	addr, _ := parseAddress("x")
	r := newRefer(newInteger(1))
	r.addr, r.addrsrc = &addr, "x"
	if out := r.settle(ctx, r); !out.Nil() {
		t.Fatalf("expected a nil, got %s", out.Canon())
	}
}
