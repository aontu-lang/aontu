/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


type MapKindVal struct {
	base
}

func newMapKind() *MapKindVal {
	v := &MapKindVal{}
	v.site.sp = unsited
	v.dc = DONE
	return v
}

func (k *MapKindVal) superior() Val { return top() }
func (k *MapKindVal) Canon() string { return "map" }

func (k *MapKindVal) Gen(ctx *Ctx) (any, error) {
	// The kind admits and never defaults: unmet it cannot generate,
	// exactly as a bare `string` cannot (ScalarKindVal.Gen).
	return nil, residueErr(ctx, k, "no_gen")
}

func (k *MapKindVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return k
	}
	if _, ok := peer.(*MapVal); ok {
		return peer
	}
	if _, ok := peer.(*MapKindVal); ok {
		return k
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(k, ctx)
	}
	return makeNilErr(ctx, "map", k, peer)
}

type ListKindVal struct {
	base
}

func newListKind() *ListKindVal {
	v := &ListKindVal{}
	v.site.sp = unsited
	v.dc = DONE
	return v
}

func (k *ListKindVal) superior() Val { return top() }
func (k *ListKindVal) Canon() string { return "list" }

func (k *ListKindVal) Gen(ctx *Ctx) (any, error) {
	return nil, residueErr(ctx, k, "no_gen")
}

func (k *ListKindVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return k
	}
	if _, ok := peer.(*ListVal); ok {
		return peer
	}
	if _, ok := peer.(*ListKindVal); ok {
		return k
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(k, ctx)
	}
	return makeNilErr(ctx, "list", k, peer)
}

// constrains reports whether a value is a constraint, or a kind that can
// become one's domain (`integer` in `constraint & integer & min(0)`).
func constrains(v Val) bool {
	switch v.(type) {
	case *ConstraintVal, *ReferVal, *RelVal, *ScalarKindVal, *EmptyVal, *GraphAtomVal:
		return true
	}
	return false
}

// ConstraintKindVal is the type of constraints. It HOLDS the meet of the
// constraints it has met rather than answering with them, so a concrete
// value is refused whichever order the terms fold in:
// `constraint & min(3) & 5` is an error just as `constraint & 5` is.
type ConstraintKindVal struct {
	base
	held Val
}

func newConstraintKind(held Val) *ConstraintKindVal {
	v := &ConstraintKindVal{held: held}
	v.site.sp = unsited
	v.dc = DONE
	if nil != held && held.Dc() != DONE {
		v.dc = 0
	}
	return v
}

func (k *ConstraintKindVal) superior() Val { return top() }

func (k *ConstraintKindVal) Canon() string {
	if nil == k.held {
		return "constraint"
	}
	return "constraint&" + k.held.Canon()
}

func (k *ConstraintKindVal) Gen(ctx *Ctx) (any, error) {
	return nil, residueErr(ctx, k, "no_gen")
}

func (k *ConstraintKindVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		if nil == k.held || k.held.Dc() == DONE {
			return k
		}
		return k.hold(unite(ctx, k.held, top()), ctx)
	}
	var theirs Val
	if ck, ok := peer.(*ConstraintKindVal); ok {
		theirs = ck.held
		if nil == theirs {
			return k
		}
	} else if constrains(peer) {
		theirs = peer
	} else {
		return makeNilErr(ctx, "constraint_kind", k, peer)
	}
	if nil == k.held {
		return k.hold(theirs, ctx)
	}
	return k.hold(unite(ctx, k.held, theirs), ctx)
}

func (k *ConstraintKindVal) hold(v Val, ctx *Ctx) Val {
	if v.Nil() {
		return v
	}
	if !constrains(v) {
		return makeNilErr(ctx, "constraint_kind", k, v)
	}
	out := newConstraintKind(v)
	out.site = k.site
	out.path = cp(k.path)
	return out
}

// unwrapConstraintKind replaces each held `constraint` with what it
// holds: the type is a claim about the field it was written at, so a
// reference's copy carries the constraint and can be applied to a value.
func unwrapConstraintKind(v Val) Val {
	switch n := v.(type) {
	case *ConstraintKindVal:
		if nil != n.held {
			return n.held
		}
	case *MapVal:
		for _, key := range n.keys {
			n.peg[key] = unwrapConstraintKind(n.peg[key])
		}
	case *ListVal:
		for i, e := range n.peg {
			n.peg[i] = unwrapConstraintKind(e)
		}
	case *ConjunctVal:
		for i, t := range n.peg {
			n.peg[i] = unwrapConstraintKind(t)
		}
	case *DisjunctVal:
		for i, t := range n.peg {
			n.peg[i] = unwrapConstraintKind(t)
		}
	}
	return v
}
