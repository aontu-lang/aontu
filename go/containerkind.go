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
func (k *MapKindVal) Canon() string { return "map()" }

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
func (k *ListKindVal) Canon() string { return "list()" }

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
	return makeNilErr(ctx, "list", k, peer)
}
