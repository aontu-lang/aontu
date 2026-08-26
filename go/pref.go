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
	// THE GATE AN OVERRIDING PEER MUST PASS IS superpeg ITSELF — the
	// preferred value's own KIND, not its family. The full note is on
	// the canonical port (ts/src/val/PrefVal.ts): a family gate made
	// `*2.2 & 3` and `*8080 & 3.5` one rule in two directions, and the
	// second silently widened every key written with the documented
	// default idiom `*8080 | integer` from integer to number.
	rank int
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
//
// THE RANK-UNIFORM MEET (ADR-004): the yardstick is the INNERMOST
// preferred value's kind, whatever the preference's rank -- `**1.5`
// defends `float` exactly as `*1.5` does. Reading the immediate peg
// made a rank>=2 peg (itself a PrefVal, whose superior is top) an
// ungated default that ANY conjunct silently overrode
// (use-cases/BUGS.md §3). Mirrors PrefVal.resuper in
// ts/src/val/PrefVal.ts (whose innermost-kind exception -- a peg that
// is itself a kind gates nothing -- is Go's ScalarKindVal.superior()
// returning top).
func (p *PrefVal) resuper() {
	p.superpeg = prefInnerPeg(p).superior()
}

// prefInnerPeg unwraps every pref layer to the innermost preferred
// value: the value a preference of ANY rank ultimately defends, and
// the one generation emits for it. Shared by the disjunct admission
// gate (disjunct.go), the defaulted-scrutinee rule (generate.go) and
// the effective-default walk (subsume.go). Mirrors prefInnerPeg in
// ts/src/val/PrefVal.ts.
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

// superior of a pref is TOP (TS PrefVal inherits FeatureVal's
// superior). NOTE: resuper above deliberately does NOT see this --
// it unwraps to the innermost non-pref peg (the rank-uniform meet,
// ADR-004), so a nested pref peg (`**hello & false`) clashes with the
// inner value's kind exactly as the rank-1 spelling does.
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
			// superpeg does not weaken this test, it deletes it -- and
			// silently, which is how a dropped field in one clone case
			// disabled the gate everywhere without a single test failing.
			// Belt and braces: clone.go carries the field, and this makes
			// the whole class of bug unreachable rather than fixed once.
			if nil == p.superpeg {
				p.resuper()
			}
			out = unite(ctx, p.superpeg, peer)
			// The preference stands AS ITSELF, rank intact (ADR-004):
			// returning the peg demoted it — to a concrete value at
			// rank 0, to a lower rank above — destroying
			// overridability and the layered-defaults ladder. The
			// full note is on the canonical port
			// (ts/src/val/PrefVal.ts).
			if valSame(out, p.superpeg) {
				out = p
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
