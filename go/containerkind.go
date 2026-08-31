/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// CONTAINER KINDS (docs/design/PATHS.0.md): `map()` and `list()`.
//
// `{}` and `[]` are the container UNITS: they admit any map (or list)
// AND generate empty when nothing arrives. The kinds admit exactly the
// same values and default to NOTHING, as `string` does -- the spelling
// of "this must be a map, and it must be supplied", which the unit
// cannot say because an unmet unit silently manufactures its empty
// value. The vacuous call is the kind; the literal is the unit.
//
// Neither function takes arguments: element constraints already belong
// to the spreads (`{&: V}`, `[&: V]`). A kind mismatch reuses the
// unit's own refusal codes (`map`, `list`) -- same fact, same code.
// Mirrors MapKindVal/ListKindVal in ts/src/val/ContainerKindVal.ts.

type MapKindVal struct {
	base
}

func newMapKind() *MapKindVal {
	v := &MapKindVal{}
	v.sp = unsited
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
	v.sp = unsited
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
