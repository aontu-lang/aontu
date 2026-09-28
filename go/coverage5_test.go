/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"testing"
)

// The dispatcher in unify.go drives the type of constraints, empty()
// and a seal before their peers, so these arms of their Unify methods
// are reached only through the API.
func TestKeywordValsApiOnlyArms(t *testing.T) {
	ctx := &Ctx{root: newMap()}

	ck := newConstraintKind(nil)
	if out := ck.Unify(nil, ctx); out != ck {
		t.Fatalf("bare constraint against nothing: got %T", out)
	}
	if out := ck.Unify(top(), ctx); out != ck {
		t.Fatalf("bare constraint against top: got %T", out)
	}
	one := newScalar(KindInteger, int64(1))
	pending := newConstraint("min", []Val{newRef([]any{"b"}, false)}, 0)
	held := newConstraintKind(pending)
	if held.dc == DONE {
		t.Fatalf("a held reference leaves the type of constraints undone")
	}
	if out := held.Unify(top(), ctx); out == held {
		t.Fatalf("an undone held value is re-driven against top")
	}
	if out := ck.hold(newNil("test-nil"), ctx); "test-nil" != out.(*NilVal).why {
		t.Fatalf("hold(nil): got %T", out)
	}
	if out := ck.hold(one, ctx); "constraint_kind" != out.(*NilVal).why {
		t.Fatalf("hold(1): got %T", out)
	}
	if _, err := ck.Gen(ctx); nil == err {
		t.Fatalf("a bare constraint generates nothing")
	}

	e := newEmpty()
	if out := e.Unify(nil, ctx); out != e {
		t.Fatalf("empty() against nothing: got %T", out)
	}
	if out := e.Unify(top(), ctx); out != e {
		t.Fatalf("empty() against top: got %T", out)
	}
	if out := e.Unify(newConstraintKind(nil), ctx); "constraint&empty()" != out.Canon() {
		t.Fatalf("empty() against constraint: got %s", out.Canon())
	}
	if _, err := e.Gen(ctx); nil == err {
		t.Fatalf("empty() generates nothing")
	}

	closed, open := newSeal(true), newSeal(false)
	if out := closed.Unify(nil, ctx); out != closed {
		t.Fatalf("close() against nothing: got %T", out)
	}
	if out := open.Unify(closed, ctx); out != closed {
		t.Fatalf("open() & close() is close(): got %s", out.Canon())
	}
	if _, err := closed.Gen(ctx); nil == err {
		t.Fatalf("close() generates nothing")
	}

	rel := newRel(newString("x"))
	if out := rel.Unify(newConstraintKind(nil), ctx); "constraint&rel(\"x\")" != out.Canon() {
		t.Fatalf("rel() against constraint: got %s", out.Canon())
	}
}

// The empty-string flags fold idempotently, and a value carrying one
// hands it to an identical value that does not.
func TestEmptyFlagsApiOnlyArms(t *testing.T) {
	ctx := &Ctx{root: newMap()}

	sk := newScalarKind(KindString).withEmpty()
	if sk.withEmpty() != sk {
		t.Fatalf("withEmpty on a kind that already admits \"\" is identity")
	}
	plain := newScalarKind(KindString)
	if out := plain.Unify(sk, ctx); out != sk {
		t.Fatalf("string & (string & empty()) keeps the waiver: got %s", out.Canon())
	}

	s := newString("x").withEmpty()
	if s.withEmpty() != s {
		t.Fatalf("withEmpty on a value that already admits \"\" is identity")
	}
	if newScalar(KindInteger, int64(1)).withEmpty().emptyOk {
		t.Fatalf("withEmpty on a number is identity")
	}
	bare := newString("x")
	out := bare.Unify(s, ctx).(*ScalarVal)
	if out == bare || !out.emptyOk {
		t.Fatalf("\"x\" & (\"x\" & empty()) copies the waiver: got %+v", out)
	}
	blank := newString("")
	strict := newString("").withNonEmpty()
	out = blank.Unify(strict, ctx).(*ScalarVal)
	if out == blank || !out.needsNonEmpty {
		t.Fatalf("\"\" & (string & \"\") copies the demand: got %+v", out)
	}

	c := newConstraint("re", []Val{newString("x")}, 0)
	once := c.allowEmpty(ctx, newEmpty()).(*ConstraintVal)
	if again := once.allowEmpty(ctx, newEmpty()); again != once {
		t.Fatalf("allowEmpty twice is identity")
	}
}

// A reference segment that is a held constraint has no spelling.
func TestRefHeldConstraintSegment(t *testing.T) {
	rv := newRef(nil, false)
	rv.append(newConstraintKind(newConstraint("min", []Val{newScalar(KindInteger, int64(1))}, 0)))
	if len(rv.peg) != 1 || unspellableSegment != rv.peg[0] {
		t.Fatalf("held constraint segment: got %v", rv.peg)
	}
}

// The seal helpers answer a non-bag, a held-open bag and a closed bag
// unchanged; only an open bag is copied and closed.
func TestSealHelpersApiOnlyArms(t *testing.T) {
	one := newScalar(KindInteger, int64(1))
	if isOpened(one) || nil != pathOf(one) {
		t.Fatalf("a scalar is neither opened nor addressed")
	}
	sealBag(one, true)
	if out := sealChild(one); out != one {
		t.Fatalf("a done scalar child is itself: got %T", out)
	}
	held := newMap()
	held.opened = true
	if out := sealChild(held); out != held {
		t.Fatalf("a held-open child is itself")
	}
	shut := &ListVal{}
	shut.closed = true
	if out := sealChild(shut); out != shut {
		t.Fatalf("a closed child is itself")
	}
	plain := newMap()
	if out := sealChild(plain); out == plain || !out.(*MapVal).closed {
		t.Fatalf("an open child closes as a copy")
	}
	list := &ListVal{}
	if out := sealChild(list); out == list || !out.(*ListVal).closed {
		t.Fatalf("an open list child closes as a copy")
	}
}
