/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

type PrefVal struct {
	base
	peg Val
	superpeg Val
	rank int

	narrowed Val
}

func newPref(v Val) *PrefVal {
	p := &PrefVal{peg: v}
	p.resuper()
	if inner, ok := v.(*PrefVal); ok {
		p.rank = 1 + inner.rank
	}
	return p
}

func (p *PrefVal) resuper() {
	p.superpeg = superOf(cp(p.path), prefInnerPeg(p))
}

func (p *PrefVal) regate(ctx *Ctx) {
	p.resuper()
	if nil != p.narrowed {
		p.superpeg = unite(ctx, clonePath(p.superpeg, cp(p.path)), p.narrowed)
	}
}

func (p *PrefVal) restand(met Val) Val {
	out := met
	for rI := 0; rI <= p.rank; rI++ {
		np := newPref(out)
		np.site.sp, np.site.spu, np.site.url = p.site.sp, p.site.spu, p.site.url
		np.path = cp(p.path)
		out = np
	}
	return out
}

// A preference met with another of its rank meets their override
// spaces as well, so a bound that narrowed either holds of the meet.
func (p *PrefVal) overMet(ctx *Ctx, pp *PrefVal, met Val) Val {
	mp := met.(*PrefVal)
	gate := p.superpeg
	if p.superpeg.Canon() != pp.superpeg.Canon() {
		gate = trialUnify(ctx, clonePath(p.superpeg, cp(p.path)), pp.superpeg)
	}
	if nil == gate || mp.superpeg.Canon() == gate.Canon() {
		return met
	}
	mp.narrowed = gate
	mp.superpeg = gate
	return mp
}

// Unchanged on both counts is the SAME preference, returned as itself:
// minting a new one every pass would keep the fixpoint moving for ever.
func (p *PrefVal) stand(met, gate Val) Val {
	if valSame(met, prefInnerPeg(p)) && valSame(gate, p.superpeg) {
		return p
	}
	stood := p.restand(met)
	if sp, ok := stood.(*PrefVal); ok {
		sp.narrowed = gate
		sp.superpeg = gate
	}
	return stood
}

// Scalar defaults meet as the disjunctions they stand for: each
// stands only where the other's override space admits it, so a value
// either one has already met survives the other's rank.
func (p *PrefVal) meetPref(pp *PrefVal, ctx *Ctx) Val {
	strong, weak := p, pp
	if pp.rank < p.rank {
		strong, weak = pp, p
	}
	path := cp(p.path)

	strongMet := trialUnify(ctx, clonePath(prefInnerPeg(strong), path),
		clonePath(weak.superpeg, path))
	weakMet := trialUnify(ctx, clonePath(strong.superpeg, path),
		clonePath(prefInnerPeg(weak), path))
	space := trialUnify(ctx, clonePath(strong.superpeg, path),
		clonePath(weak.superpeg, path))

	if nil == strongMet && nil == weakMet {
		if nil == space {
			return makeNilErr(ctx, "empty", p, pp)
		}
		return space
	}

	// An emptied override space stays a quiet nil, as a peer's does.
	var gate Val = space
	if nil == space {
		gate = newNil("empty")
	}

	if strong.rank == weak.rank && nil != strongMet && nil != weakMet {
		peg := trialUnify(ctx, clonePath(prefInnerPeg(p), path), prefInnerPeg(pp))
		if nil == peg {
			return makeNilErr(ctx, "pref_rank_clash", p, pp)
		}
		return p.stand(peg, gate)
	}

	if nil != strongMet {
		return strong.stand(strongMet, gate)
	}
	return weak.stand(weakMet, gate)
}

func prefInnerPeg(v Val) Val {
	out := v
	for {
		p, ok := out.(*PrefVal)
		if !ok {
			return out
		}
		out = p.peg
	}
}

func (p *PrefVal) cjo() int { return 30000 }

func (p *PrefVal) superior() Val { return top() }
func (p *PrefVal) Canon() string { return "*" + CanonRiders(p.peg) }

func (p *PrefVal) Gen(ctx *Ctx) (any, error) {
	return p.peg.Gen(ctx)
}

func (p *PrefVal) Unify(peer Val, ctx *Ctx) Val {
	// The peg is driven at the pref's own location (TS resolves it with
	// the same undescended ctx).
	slot := ctx.slot
	// Resolve the preferred value (e.g. a function) before comparing.
	if p.peg.Dc() != DONE && !(ctx.settle && 0 < p.Dc()) {
		ctx.slot = slot
		p.peg = unite(ctx, p.peg, top())
		p.regate(ctx)
	}

	var out Val
	waits := false
	switch pp := peer.(type) {
	case nil:
		out = p
		waits = p.peg.Dc() != DONE
	case *PrefVal:
		_, ps := prefInnerPeg(p).(*ScalarVal)
		_, qs := prefInnerPeg(pp).(*ScalarVal)
		switch {
		case ps && qs:
			out = p.meetPref(pp, ctx)
		case p.rank < pp.rank:
			out = p
		case pp.rank < p.rank:
			out = pp
		default:
			peg := trialUnify(ctx, clonePath(prefInnerPeg(p), cp(p.path)),
				prefInnerPeg(pp))
			if nil == peg {
				out = makeNilErr(ctx, "pref_rank_clash", p, peer)
			} else {
				out = p.overMet(ctx, pp, p.restand(peg))
			}
		}
	default:
		if isTop(peer) {
			out = p
			waits = p.peg.Dc() != DONE
		} else {
			if nil == p.superpeg {
				p.regate(ctx)
			}

			inner := prefInnerPeg(p)
			met := trialUnify(ctx, clonePath(inner, cp(p.path)), peer)
			if nil != met {
				waits = met.Dc() != DONE
				// A peer that empties the override space leaves the preference standing.
				gate := trialUnify(ctx, clonePath(p.superpeg, cp(p.path)), peer)
				if nil == gate {
					if p.superpeg.Nil() {
						gate = p.superpeg
					} else {
						gate = newNil("empty")
					}
				}

				out = p.stand(met, gate)
			} else if over := trialUnify(ctx, clonePath(p.superpeg, cp(p.path)), peer); nil != over {
				out = over
			} else if peer.Nil() {
				// A peer that arrived already failed keeps its own
				// refusal: that is its failure, not the default's.
				out = peer
			} else {
				out = makeNilErr(ctx, "empty", p, peer)
			}
		}
	}
	// TS PrefVal.unify stamps DONE on every result — even a stuck
	// conjunct from the superior-unify (`&:*hello, b:key()` leaves b as
	// key()&string DONE, never re-driven) — but one whose own value still
	// waits, as a reference does before its target stands: a later pass
	// reads it, until the settling pass freezes it. Mirror that exactly.
	if waits && !ctx.settle {
		out.setDc(p.Dc() + 1)
	} else {
		out.setDc(DONE)
	}
	return out
}
