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
func (p *PrefVal) Canon() string { return "*" + p.peg.Canon() }

func (p *PrefVal) Gen(ctx *Ctx) (any, error) {
	return p.peg.Gen(ctx)
}

func (p *PrefVal) Unify(peer Val, ctx *Ctx) Val {
	// The peg is driven at the pref's own location (TS resolves it with
	// the same undescended ctx).
	slot := ctx.slot
	// Resolve the preferred value (e.g. a function) before comparing.
	if p.peg.Dc() != DONE {
		ctx.slot = slot
		p.peg = unite(ctx, p.peg, top())
		p.regate(ctx)
	}

	var out Val
	switch pp := peer.(type) {
	case nil:
		out = p
	case *PrefVal:
		switch {
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
				out = p.restand(peg)
			}
		}
	default:
		if isTop(peer) {
			out = p
		} else {
			if nil == p.superpeg {
				p.regate(ctx)
			}

			inner := prefInnerPeg(p)
			if met := trialUnify(ctx, clonePath(inner, cp(p.path)), peer); nil != met {
				gate := unite(ctx, clonePath(p.superpeg, cp(p.path)), peer)

				// Unchanged on both counts is the SAME preference,
				// returned as itself: minting a new one every pass
				// would keep the fixpoint moving for ever.
				if valSame(met, inner) && valSame(gate, p.superpeg) {
					out = p
				} else {
					stood := p.restand(met)
					if sp, ok := stood.(*PrefVal); ok {
						sp.narrowed = gate
						sp.superpeg = gate
					}
					out = stood
				}
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
	// TS PrefVal.unify stamps DONE on every result (its `done` flag is
	// never cleared) — even a stuck conjunct from the superior-unify
	// (`&:*hello, b:key()` leaves b as key()&string DONE, never
	// re-driven). Mirror that exactly.
	out.setDc(DONE)
	return out
}
