/* Copyright (c) 2025 Richard Rodger, MIT License */

// The identity internals no source reaches (ADR-002; G4 phase 1, the
// Go side of the coverage3-identity tests in ts/test/coverage3.test.ts).
// Cross-package runs (the CLI tests) do not count toward this package's
// coverage, so the arms are exercised here directly.
//
// What no document can produce: an entity name on a value the walks
// reach only through a kind they do not descend into, a registry
// consulted before any pass has filled it, a template shape the parser
// never builds, and a cyclic tree — which a unified result IS (a
// resolved ref shares its target), so the seen-guards are load-bearing
// rather than defensive.

package aontu

import (
	"testing"
)

func TestIdNameOK(t *testing.T) {
	for _, ok := range []string{"a", "svc_auth", "team-pay", "a_1",
		"A_b-c1", "_x"} {
		if !idNameOK(ok) {
			t.Errorf("idNameOK(%q) = false, want true", ok)
		}
	}
	// D-1 (docs/design/RELATIONS.0.md): no slash, no leading digit or
	// hyphen.
	for _, bad := range []string{"", "svc.auth", "a b", "a:b", "a$b", "é",
		"svc/auth", "A/b-c_1", "x/y/z", "0", "9x", "-x"} {
		if idNameOK(bad) {
			t.Errorf("idNameOK(%q) = true, want false", bad)
		}
	}
}

func TestIdNameArgKinds(t *testing.T) {
	// A non-scalar argument, and a scalar of the wrong kind: both are
	// "not a name", and the func arm answers id_name for each.
	if _, ok := idName(newMap()); ok {
		t.Error("a map is not a name")
	}
	if _, ok := idName(newInteger(1)); ok {
		t.Error("an integer is not a name")
	}
	if n, ok := idName(newString("svc_auth")); !ok || "svc_auth" != n {
		t.Errorf("idName(scalar) = %q,%v; want svc_auth,true", n, ok)
	}
}

func TestMergeEntitiesEmptyIsIdentity(t *testing.T) {
	// No id anywhere and an empty registry: the walks are skipped and
	// the tree comes back as itself, not a copy.
	ctx := &Ctx{}
	root := newMap()
	root.set("a", newInteger(1))
	if out := mergeEntities(ctx, root); Val(root) != out {
		t.Fatal("expected the same tree back")
	}
	if 0 != len(ctx.entities) {
		t.Fatalf("registry seeded on a document with no id: %v", entityNames(ctx))
	}
}

func TestMergeEntitiesRegistryIsSorted(t *testing.T) {
	// entityNames is the deterministic view of a Go map (ADR-001):
	// insertion order here is deliberately not sorted order.
	ctx := &Ctx{entities: map[string]Val{}}
	for _, n := range []string{"svc_z", "svc_a", "svc_m"} {
		v := newMap()
		v.setEntityName(n)
		ctx.entities[n] = v
	}
	got := entityNames(ctx)
	want := []string{"svc_a", "svc_m", "svc_z"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("entityNames = %v, want %v", got, want)
		}
	}
}

func TestWalkEntitiesNilNode(t *testing.T) {
	// A bag slot can hold nil in a hand-built tree; the walk answers it
	// unchanged rather than dereferencing it.
	if out := walkEntities(&Ctx{}, nil, map[Val]bool{}, true); nil != out {
		t.Error("a nil node should come back as nil")
	}
}

func TestMergeEntitiesListPositions(t *testing.T) {
	// A list element is a POSITION, so applyEntities writes the
	// representative back into it. Built by hand: the parser routes a
	// list element's id through the same conjunct fold as a map's, so
	// only the direct call reaches the *ListVal arm with an already
	// stamped element.
	ctx := &Ctx{}
	e0 := newMap()
	e0.set("k", newInteger(1))
	e0.setEntityName("x")
	e1 := newMap()
	e1.set("j", newInteger(2))
	e1.setEntityName("x")
	lv := &ListVal{peg: []Val{e0, e1}}
	root := newMap()
	root.set("a", lv)

	out := mergeEntities(ctx, root).(*MapVal)
	got := out.peg["a"].(*ListVal)
	if got.peg[0] != got.peg[1] {
		t.Fatalf("list positions did not converge: %s vs %s",
			got.peg[0].Canon(), got.peg[1].Canon())
	}
	if `{"j":2,"k":1}` != got.peg[0].Canon() {
		t.Fatalf("merged element = %s", got.peg[0].Canon())
	}
}

func TestMergeEntitiesCycleGuards(t *testing.T) {
	// A unified tree is a GRAPH — a resolved reference shares its
	// target — so a self-containing map is a shape the walks must
	// survive. Every walk (hasEntity, collect, apply) sees it.
	root := newMap()
	root.set("self", root)
	root.set("k", newInteger(1))
	if out := mergeEntities(&Ctx{}, root); Val(root) != out {
		t.Fatal("an id-free cyclic tree should come back as itself")
	}
	root.setEntityName("x")
	ctx := &Ctx{}
	if out := mergeEntities(ctx, root); Val(root) != out {
		t.Fatalf("a single-entity cyclic tree should come back as itself")
	}

	// And the apply walk's second guard: a node whose representative
	// was ALREADY visited returns the representative without
	// descending into it again.
	other := newMap()
	other.set("j", newInteger(2))
	other.setEntityName("x")
	ctx2 := &Ctx{entities: map[string]Val{"x": root}}
	holder := newMap()
	holder.set("p", root)
	holder.set("q", other)
	out := walkEntities(ctx2, holder, map[Val]bool{}, true).(*MapVal)
	if out.peg["q"] != Val(root) {
		t.Fatal("q did not take the representative")
	}
}

func TestConstantIdFuncShapes(t *testing.T) {
	// Every container a template can be, and the two answers.
	idfn := newFunc("id", []Val{newString("x")})
	keyed := newFunc("id", []Val{newFunc("key", []Val{newInteger(0)})})

	inMap := newMap()
	inMap.set("a", idfn)
	inList := &ListVal{peg: []Val{idfn}}
	inSpreadMap := newMap()
	inSpreadMap.spread = idfn
	inSpreadList := &ListVal{spread: idfn}

	for _, v := range []Val{
		idfn,
		newConjunct([]Val{idfn, newMap()}),
		newDisjunct([]Val{idfn, newMap()}),
		newPref(idfn),
		newFunc("type", []Val{idfn}),
		inMap, inList, inSpreadMap, inSpreadList,
	} {
		if found := constantIdFunc(v, map[Val]bool{}); nil == found {
			t.Errorf("constantIdFunc missed a constant id in %T", v)
		}
	}
	for _, v := range []Val{
		keyed,
		newConjunct([]Val{keyed, newMap()}),
		newMap(),
		newInteger(1),
		nil,
	} {
		if found := constantIdFunc(v, map[Val]bool{}); nil != found {
			t.Errorf("constantIdFunc refused %T, which has no constant id", v)
		}
	}

	// The cycle guard, on the same graph reason as above.
	cyc := newMap()
	cyc.set("self", cyc)
	if found := constantIdFunc(cyc, map[Val]bool{}); nil != found {
		t.Error("constantIdFunc found an id in a cyclic id-free tree")
	}

	// refuseSpreadId passes a clean template straight through, and a
	// nil template (a bag with no spread at all) is not a template.
	if out := refuseSpreadId(nil); nil != out {
		t.Error("a nil template should stay nil")
	}
	clean := newMap()
	if out := refuseSpreadId(clean); Val(clean) != out {
		t.Error("a clean template should pass through unchanged")
	}
	if out := refuseSpreadId(idfn); !out.Nil() {
		t.Error("a constant id template should be refused")
	}
}

func TestCanonEntityAndRiders(t *testing.T) {
	// canonEntity on a value with no id is the plain canon; with one it
	// is the reparseable conjunct. canonRiders nests the deprecation
	// record outside it — an ordering no single document exercises,
	// because a bag renders its children through canonRiders and the
	// two riders rarely meet on one child.
	v := newInteger(1)
	if "1" != canonEntity(v) {
		t.Fatalf("canonEntity(anonymous) = %q", canonEntity(v))
	}
	v.setEntityName("team-pay")
	if `id("team-pay")&1` != canonEntity(v) {
		t.Fatalf("canonEntity = %q", canonEntity(v))
	}
	v.setDeprecRec(map[string]string{"msg": "gone"})
	if `deprecate(id("team-pay")&1,{"msg":"gone"})` != canonRiders(v) {
		t.Fatalf("canonRiders = %q", canonRiders(v))
	}
}

func TestWalkClearEntity(t *testing.T) {
	// The clearing walk reaches every kind the mark walk does, root
	// included — a copy() of a junction of entities keeps none of them.
	inner := newMap()
	inner.set("k", newInteger(1))
	inner.setEntityName("in")
	cj := newConjunct([]Val{inner, newMap()})
	cj.setEntityName("cj")
	lv := &ListVal{peg: []Val{cj}}
	lv.setEntityName("lv")
	walkClearEntity(lv)
	for _, v := range []Val{lv, cj, inner} {
		if "" != v.entityName() {
			t.Errorf("%T kept id %q", v, v.entityName())
		}
	}
}
