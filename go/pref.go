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

	// THE OVERRIDE SPACE, NARROWED (ADR-011 R1). The second arm of the
	// distribution -- `super(x) & every peer met so far` -- kept here
	// as well as in superpeg, because resuper() recomputes the gate
	// from the peg whenever the peg resolves and would otherwise widen
	// it back to `super(x)`: a rank>=2 default, whose peg is itself a
	// preference and so is re-driven, lost its narrowing that way and
	// let a pinned `***false & false` be overridden by `true`.
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
// THE GATE IS super() (ADR-011 R4, docs/design/DEFAULTS.0.md). `*x` is
// sugar for `*x | super(x)`, so the type an overriding peer must pass
// is the one the long form spells out loud -- one function, not a
// second implementation that agrees with it on the common case. Two
// special cases retired with the switch: a KIND peg gated nothing
// (`*integer` was overridden by a string) and a BAG peg had no gate at
// all, both of which followed from a superior() of top. Mirrors
// PrefVal.resuper in ts/src/val/PrefVal.ts.
func (p *PrefVal) resuper() {
	p.superpeg = superOf(cp(p.path), prefInnerPeg(p))
}

// regate recomputes the gate and REAPPLIES any narrowing the meets so
// far have left on it. resuper alone widens the override space back to
// `super(x)` every time the peg resolves, which a rank>=2 default --
// whose peg is itself a preference, and so is re-driven -- hits on
// every pass: a pinned `***false & false` was overridden by `true`.
// Split from resuper because narrowing needs a context to meet in and
// the constructor has none (it also has nothing narrowed yet).
func (p *PrefVal) regate(ctx *Ctx) {
	p.resuper()
	if nil != p.narrowed {
		p.superpeg = unite(ctx, clonePath(p.superpeg, cp(p.path)), p.narrowed)
	}
}

// restand rebuilds the preference around a NARROWED value: `*integer &
// 7` is `*7`, which is what the long form answers (`(integer&7) |
// (number&7)` keeps the star on the arm that survived). The rank is
// rebuilt as NESTING rather than stamped, because Canon renders one
// star per layer -- a rank set on a single layer would print `*x` for
// a rank-2 default and the document would no longer round-trip.
// Mirrors PrefVal.restand in ts/src/val/PrefVal.ts.
func (p *PrefVal) restand(met Val) Val {
	out := met
	for rI := 0; rI <= p.rank; rI++ {
		np := newPref(out)
		np.sp, np.spu, np.surl = p.sp, p.spu, p.surl
		np.path = cp(p.path)
		out = np
	}
	return out
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
			// TWO DEFAULTS OF EQUAL RANK THAT CANNOT AGREE (ADR-011
			// R2): the refusal is about the DEFAULTS, not about the
			// values they happen to hold, and its hint names the fix
			// -- rank one of them. Compatible pegs still fold (`*1 &
			// *integer` is `*1`), so only a real disagreement lands
			// here. Trialled, because the inner meet's own code would
			// otherwise be the one the reader sees.
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
			// THE MEET IS THE DESUGARING, DISTRIBUTED (ADR-011 R1,
			// docs/design/DEFAULTS.0.md). `*x` stands for `*x |
			// super(x)`, and a peer meets a disjunction arm by arm:
			//
			//     (x & peer)  |  (super(x) & peer)
			//
			// THE FIRST ARM DECIDES. When the preferred value itself
			// still satisfies the peer the default STANDS -- `*1 &
			// integer`, `*8080 & min(1024)`, `*{x:1} & {y:2}` (maps
			// merge, so the `x` default survives): the peer narrowed
			// the type without ruling the default out, which is the
			// whole point of writing one. Only when that arm is empty
			// does the second answer, and that is the override. When
			// BOTH are empty nothing remains of the disjunction the
			// star stands for -- `empty`, the same refusal the
			// written-out long form gives.
			//
			// Recompute a missing gate rather than proceed without
			// one: unite(ctx, nil, peer) returns the peer verbatim, so
			// a nil superpeg does not weaken the second arm, it
			// deletes it -- and silently.
			if nil == p.superpeg {
				p.regate(ctx)
			}

			// Trialled against a CLONE, on the innermost value (the
			// rank-uniform meet): the preferred value must stay
			// pristine for the arm that stands, and a failed trial
			// must not leave its errors on the context.
			inner := prefInnerPeg(p)
			if met := trialUnify(ctx, clonePath(inner, cp(p.path)), peer); nil != met {
				// THE SECOND ARM IS CARRIED FORWARD, not discarded. It
				// is the override space -- everything the peer would
				// still admit INSTEAD of the default -- and meeting a
				// peer narrows it just as it narrows the default, so
				// two successive meets compose to `(x & p1 & p2) |
				// (super(x) & p1 & p2)`. Dropping it let a constraint
				// arriving beside a default vanish: `r:*2` with
				// `r:max(20)` stood as a bare `*2`, and `r:40` then
				// overrode it through a gate that had forgotten the
				// bound. It cannot fail: the first arm succeeded, so
				// its value satisfies `super(x)` and `peer` both.
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
