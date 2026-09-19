/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// ADR-034. Twin of ts/src/val/MaybeFuncVal.ts and AbsentVal.ts.

// Top with one difference: absence is GENERABLE, and generates
// nothing, so a bag drops it at a required key too.
type AbsentVal struct{ base }

func newAbsent() *AbsentVal {
	a := &AbsentVal{}
	a.dc = DONE
	a.site.sp = -1
	return a
}

func isAbsent(v Val) bool { _, ok := v.(*AbsentVal); return ok }

func (a *AbsentVal) Canon() string { return "maybe()" }

//coverage:ignore-block the interface requires it; nothing asks an absence for a supertype
func (a *AbsentVal) superior() Val { return a }

func (a *AbsentVal) Gen(ctx *Ctx) (any, error) { return nil, nil }

// The unit of the meet, called for EITHER operand so `&` commutes. Top
// is the one peer it does not yield to: `+` answers an absence into a
// slot whose peer is top.
func (a *AbsentVal) Unify(peer Val, ctx *Ctx) Val {
	if isTop(peer) {
		return a
	}
	return peer
}

// The error list is swapped as trialUnify swaps it, but trial mode is
// NOT set: its shared nil carries no code to judge the failure by.
func forgive(ctx *Ctx, f *FuncVal, base []string, arg Val) Val {
	saved := ctx.err
	ctx.err = []*NilVal{}
	ctx.slot = base

	out := unite(ctx, arg, top())

	sink := ctx.err
	ctx.err = saved

	if n, ok := out.(*NilVal); ok && "reference" == codeClass(n.why) {
		a := newAbsent()
		a.path = cp(base)
		a.site.sp, a.site.spu, a.site.url = f.site.sp, f.site.spu, f.site.url
		return a
	}

	for _, err := range sink {
		ctx.adderr(err)
	}

	return out
}
