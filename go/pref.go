/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// PrefVal marks a preferred (default) value, written `*x`. Within a
// disjunct it is selected over non-preferred members during
// generation; unified against a concrete peer it yields the peer when
// the peer narrows it, otherwise the preferred value wins.
type PrefVal struct {
	base
	peg Val
	// The preferred value's own type: the yardstick for "did the peer
	// say anything I did not already say?".
	superpeg Val
	// The gate an overriding peer must pass. A preference is a DEFAULT,
	// so a concrete peer replaces it — but only within the preferred
	// value's FAMILY: `*lower(1.1) & a` is a conflict, not an override.
	//
	// Family and not leaf, because the number tower made `integer` and
	// `float` disjoint siblings under `number`. Gating on the leaf would
	// turn `*2.2 & 3` (a float default overridden by an integer) into an
	// error, which is a tightening no document asked for. For every
	// non-numeric value the family root IS the leaf, so this is the
	// preferred value's type as before. Mirrors TS PrefVal.familypeg.
	familypeg Val
	rank      int
}

func newPref(v Val) *PrefVal {
	p := &PrefVal{peg: v}
	p.resuper()
	if inner, ok := v.(*PrefVal); ok {
		p.rank = 1 + inner.rank
	}
	return p
}

// resuper recomputes the type yardstick and the override gate from the
// current peg. Called again whenever the peg resolves (e.g. a func).
func (p *PrefVal) resuper() {
	sup := p.peg.superior()
	p.superpeg = sup
	p.familypeg = sup
	if sk, ok := sup.(*ScalarKindVal); ok {
		if fam := kindFamily(sk.kind); fam != sk.kind {
			f := newScalarKind(fam)
			// Placed at the yardstick it widens, as TS's
			// `sup.place(new ScalarKindVal({peg: family}))` does.
			f.sp, f.spu, f.surl = sk.sp, sk.spu, sk.surl
			f.stext = sk.stext
			p.familypeg = f
		}
	}
}

func (p *PrefVal) cjo() int { return 30000 }

// superior of a pref is TOP (TS PrefVal inherits FeatureVal's
// superior): a nested pref peg (`**hello & false`) lets the concrete
// peer win instead of clashing with the inner value's kind.
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
		p.resuper()
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
			out = newPref(unite(ctx, p.peg, pp.peg))
		}
	default:
		if isTop(peer) {
			out = p
		} else {
			// Peer is a concrete or kind value. Unify the preferred
			// value's FAMILY with peer: if the peer added nothing beyond
			// a type the preferred value already satisfies (`*1 &
			// integer`, `*1 & number`), the preference stands; anything
			// else is a concrete override and wins.
			// Recompute a missing gate rather than proceed without one.
			// unite(ctx, nil, peer) returns the peer verbatim, so a nil
			// familypeg does not weaken this test, it deletes it -- and
			// silently, which is how a dropped field in one clone case
			// disabled the gate everywhere without a single test failing.
			// Belt and braces: clone.go now carries the field, and this
			// makes the whole class of bug unreachable rather than fixed
			// once.
			if nil == p.familypeg {
				p.resuper()
			}
			out = unite(ctx, p.familypeg, peer)
			if valSame(out, p.superpeg) || valSame(out, p.familypeg) {
				out = p.peg
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
