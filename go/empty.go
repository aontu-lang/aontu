/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// EmptyVal is `empty()`: the constraint that admits "" where `string`
// alone does not. It waives rather than narrows, so it folds first in a
// conjunct.
type EmptyVal struct {
	base
}

func newEmpty() *EmptyVal {
	v := &EmptyVal{}
	v.site.sp = unsited
	v.dc = DONE
	return v
}

func (e *EmptyVal) cjo() int      { return 20000 }
func (e *EmptyVal) superior() Val { return top() }
func (e *EmptyVal) Canon() string { return "empty()" }

func (e *EmptyVal) Gen(ctx *Ctx) (any, error) {
	return nil, residueErr(ctx, e, "no_gen")
}

func (e *EmptyVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return e
	}
	switch p := peer.(type) {
	case *EmptyVal:
		return e
	case *ScalarKindVal:
		if KindString == p.kind {
			return p.withEmpty()
		}
	case *ScalarVal:
		if KindString == p.kind {
			return p.withEmpty()
		}
	case *ConstraintVal:
		return p.allowEmpty(ctx, e)
	case *ConstraintKindVal:
		return p.Unify(e, ctx)
	}
	return makeNilErr(ctx, "empty_domain", e, peer)
}
