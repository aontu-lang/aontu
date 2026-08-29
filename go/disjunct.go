/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"reflect"
	"strings"
)

// DisjunctVal is the choice (|) between its members. Conjunction
// distributes over disjunction: unifying with a peer tries the peer
// against each member, dropping members that fail.
type DisjunctVal struct {
	base
	peg         []Val
	prefsRanked bool
}

func newDisjunct(members []Val) *DisjunctVal {
	d := &DisjunctVal{peg: members}
	d.sp = -1
	return d
}

func (d *DisjunctVal) cjo() int      { return 35000 }
func (d *DisjunctVal) superior() Val { return top() }

func (d *DisjunctVal) Canon() string {
	parts := make([]string, len(d.peg))
	for i, m := range d.peg {
		// Parenthesise nested junction children (see junctChildCanon).
		parts[i] = junctChildCanon(m)
	}
	return strings.Join(parts, "|")
}

func (d *DisjunctVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}

	// Members are driven at the disjunct's own location (TS trials each
	// branch with the same undescended ctx; the slot hint is single-use
	// per unite).
	slot := ctx.slot

	if !d.prefsRanked {
		d.rankPrefs(ctx)
	}

	done := true
	var gate []int
	_, peerIsPref := peer.(*PrefVal)
	oval := make([]Val, len(d.peg))
	for i, m := range d.peg {
		// Try the member against peer in isolation: a failed trial
		// must not pollute the real error list, so swap in a throwaway
		// error slice for the duration of the trial.
		saved := ctx.err
		savedTrial := ctx.trial
		trial := []*NilVal{}
		ctx.err = trial
		ctx.trial = true
		ctx.slot = slot
		r := unite(ctx, m, peer)
		failed := len(ctx.err) > 0 || r.Nil()
		ctx.err = saved
		ctx.trial = savedTrial
		if failed {
			oval[i] = nil
		} else {
			oval[i] = r
			if r.Dc() != DONE {
				done = false
			}
			if pm, ok := m.(*PrefVal); ok && !peerIsPref && !isTop(peer) {
				if _, sc := prefInnerPeg(pm).(*ScalarVal); sc {
					// A candidate for the admission gate below: a
					// non-pref, non-top peer met a scalar preference
					// inside this disjunction.
					gate = append(gate, i)
				}
			}
		}
	}

	// THE ADMISSION GATE (ADR-004). A peer that meets a preference
	// INSIDE a disjunction must be admitted by the disjunction: by some
	// sibling alternative (whose own trial above already answers that),
	// or by the preferred value itself (the pref branch's own admitted
	// set). The pref's kind gate alone used to decide, so a same-kind
	// concrete peer replaced the default with the alternatives never
	// consulted -- `k:*'auto'|'literal'|'data'` plus `k:'autoo'`
	// answered "autoo", and `*8080|(integer&neq(80))` admitted 80
	// (use-cases/BUGS.md §1-2). An inadmissible override now fails the
	// pref member's trial, and when every member is gone the meet is
	// the existing `|:empty` refusal.
	//
	// SCALAR preferred values only, exactly the kind gate's own
	// boundary (test/spec/pref.tsv, "THE GATE IS A SCALAR GATE"): a
	// structural or kind-peg default stays ungated. A deliberately open
	// default remains spellable as `*x|top` -- the top branch admits
	// every override. Mirrors DisjunctVal.unify in
	// ts/src/val/DisjunctVal.ts.
	for _, gI := range gate {
		admitted := false
		for kI := range oval {
			// Sibling alternatives only: a pref member cannot admit its
			// own override (post-rankPrefs at most one pref stands at
			// this level, so this is defensive).
			if kI == gI || nil == oval[kI] {
				continue
			}
			if _, kPref := d.peg[kI].(*PrefVal); kPref {
				continue
			}
			admitted = true
			break
		}
		if !admitted {
			// The trial is against a CLONE: the preferred value must
			// stay pristine for the surviving preference (the matchFunc
			// precedent in generate.go).
			inner := prefInnerPeg(d.peg[gI].(*PrefVal))
			ctx.slot = slot
			if nil == trialUnify(ctx, clonePath(inner, cp(d.path)), peer) {
				oval[gI] = nil
			}
		}
	}

	// A PREFERENCE CONJOINED WITH A DISJUNCTION IS A PREFERENCE ON THE
	// ALTERNATIVE IT NAMES: `(A|B) & *A` is `*A|B`, the same value the
	// direct spelling denotes. The full note is on the twin in
	// ts/src/val/DisjunctVal.ts; the short of it is that distribution
	// carries the peer to each member and the kind gate then replaces a
	// scalar preference BY the concrete member it met, so the preference
	// simply vanished and the enum-with-default written this way round
	// held no default at all. A preference naming no alternative is
	// dropped, as it is today.
	if pp, ok := peer.(*PrefVal); ok {
		want := prefInnerPeg(pp)
		for vI, got := range oval {
			if nil == got || got.Nil() {
				continue
			}
			if _, isPref := got.(*PrefVal); isPref {
				continue
			}
			if !valSame(got, want) {
				continue
			}
			wrapped := newPref(got)
			wrapped.rank = pp.rank
			wrapped.sp = pp.sp
			wrapped.spu = pp.spu
			wrapped.surl = pp.surl
			wrapped.stext = pp.stext
			wrapped.path = cp(got.vpath())
			oval[vI] = wrapped
		}
	}

	// Flatten nested disjuncts, drop failed members, dedup.
	var res []Val
	for _, v := range oval {
		if v == nil {
			continue
		}
		if dj, ok := v.(*DisjunctVal); ok {
			res = append(res, dj.peg...)
		} else {
			res = append(res, v)
		}
	}
	res = dedup(res)

	switch len(res) {
	case 1:
		return res[0]
	case 0:
		return makeNilErr(ctx, "|:empty", d, peer)
	}
	out := newDisjunct(res)
	// The fold's result stands where the disjunct stood, so it keeps the
	// path (TS's Val constructor takes it from the ctx, which is the
	// same location; the conjunct fold already does this). Without it a
	// disjunct that survives one evaluation and meets its peer in a
	// LATER one — which is exactly what the validation verb does, schema
	// first and data second — reported its conflict at the root.
	out.path = cp(d.path)
	// A NARROWED DISJUNCTION IS STILL THAT DISJUNCTION. The meet mints a
	// fresh value, which arrived unsited and file-less -- so every
	// finding naming a disjunction that had met anything pointed at
	// row -1 with no file, and an agent handed the report had nowhere to
	// go (the review's finding F). The whole site travels, position and
	// url together: the url is what tells the report which document it
	// came from. Twin: the `this.place(out)` in
	// ts/src/val/DisjunctVal.ts.
	out.sp = d.sp
	out.spu = d.spu
	out.surl = d.surl
	out.stext = d.stext
	// AND SO DOES PROVENANCE, because the site and the mark answer one
	// question. A narrowed disjunction is a value the engine built from
	// a value the author wrote, standing where that one stood: carrying
	// the site and withholding the mark would let `why` print the value,
	// know the line it came from, and still answer "nothing met at this
	// path" (the review's finding E). Twin: the WRITTEN/INNER_OF carry
	// in Val.place, ts/src/val/Val.ts.
	if d.written() {
		out.setWritten()
	}
	if nil != d.innerOf() {
		out.setInnerOf(d.innerOf())
	}
	if done {
		out.setDc(DONE)
	} else {
		out.setDc(d.dc + 1)
	}
	return out
}

// AN UNRESOLVED DISJUNCTION IS NOT A VALUE (ADR-007). The twin of
// DisjunctVal.gen in ts/src/val/DisjunctVal.ts; the full note is there.
// The short of it: generation used to FOLD the surviving members
// together with Unify and emit the result, which is a value in no
// branch of the disjunction (`({x:1}|{y:2}) & {z:3}` generated
// `{x:1,y:2,z:3}`) and reported an unresolved enum as a scalar CONFLICT
// -- so vet, which keeps incomplete-class findings, filtered it out and
// answered valid on a missing required field (use-cases/BUGS.md §13).
func (d *DisjunctVal) Gen(ctx *Ctx) (any, error) {
	val, unresolved := d.forGen(ctx)
	if unresolved {
		// ALTERNATIVES THAT GENERATE THE SAME VALUE ARE RESOLVED
		// (ADR-007's rule, asked at the moment it matters): `[] | [&:
		// T]` met by an empty list keeps both arms -- they differ as
		// SCHEMAS, which is what stops dedup collapsing the template
		// away (BUGS.md §52 regime 4) -- but both generate the empty
		// list, and one generated value is one value. Mirrors the
		// same-value arm in ts/src/val/DisjunctVal.ts.
		if out, same := d.genSame(ctx); same {
			return out, nil
		}
		return nil, residueErr(ctx, d, "disjunct_no_gen")
	}
	if val == nil {
		// Registered code for an alternatives-exhausted disjunct. (TS
		// generates nothing for an empty disjunct and lets the bag
		// report — an edge no shared row pins; this Code is
		// classification, not pinned parity.)
		return nil, &AontuError{Msg: "Cannot generate value: empty disjunct", Code: "|:empty"}
	}
	return val.Gen(ctx)
}

// forGen answers the single Val that Gen will emit, or reports that the
// disjunction is still UNRESOLVED -- more than one alternative admitted
// and no preference to choose between them. A nil Val with unresolved
// false is the empty disjunct.
//
// Split out of Gen so that gensNull can ask what a disjunct WOULD
// generate without generating it. Go's Gen returns (any, error) and so
// collapses TypeScript's two distinct empty results -- `undefined`
// (nothing) and `null` (JSON null) -- into one `nil`; gensNull
// reconstructs the difference from the child Val, and had no case for a
// disjunct. So a key whose value was a disjunction resolving to null was
// read as "nothing" and silently DROPPED, taking list elements with it.
func (d *DisjunctVal) forGen(ctx *Ctx) (Val, bool) {
	if len(d.peg) == 0 {
		return nil, false
	}
	// Ranking may not have run when Gen is reached without a prior
	// Unify, and it is what guarantees at most one preference stands
	// here.
	if !d.prefsRanked {
		d.rankPrefs(ctx)
	}
	var prefs []Val
	for _, m := range d.peg {
		if isPref(m) {
			prefs = append(prefs, m)
		}
	}
	if 0 == len(prefs) {
		if 1 < len(d.peg) {
			return nil, true
		}
		return d.peg[0], false
	}
	return prefs[0], false
}

// rankPrefs merges and filters PrefVal members before member trials
// (DisjunctVal.rankPrefs in TS): equal-rank prefs unify into one
// (`*{x:1} | *{y:2}` -> `*{x:1,y:2}`), a lower-rank pref supersedes a
// higher-rank one, and a nested disjunct that collapses to a single
// pref replaces itself in place. Returns the single remaining PrefVal
// (or the nil from a failed pref merge) for nested-collapse callers;
// nil otherwise.
func (d *DisjunctVal) rankPrefs(ctx *Ctx) Val {
	var lastpref *PrefVal
	lastprefI := -1

	for vI := 0; vI < len(d.peg); vI++ {
		switch v := d.peg[vI].(type) {
		case *PrefVal:
			if lastpref != nil {
				if v.rank == lastpref.rank {
					u := v.Unify(lastpref, ctx)
					// A pref meeting a pref always yields a pref, never a
					// bare nil (a conflict is wrapped inside it).
					if u.Nil() { //coverage:ignore PrefVal.Unify never returns a bare nil here
						return u
					}
					d.peg[lastprefI] = u
					if up, ok := u.(*PrefVal); ok {
						lastpref = up
					}
					d.peg[vI] = nil
				} else if v.rank < lastpref.rank {
					d.peg[lastprefI] = nil
					lastpref = v
					lastprefI = vI
				} else {
					d.peg[vI] = nil
				}
			} else {
				lastpref = v
				lastprefI = vI
			}
		case *DisjunctVal:
			if sub := v.rankPrefs(ctx); sub != nil {
				if sp, ok := sub.(*PrefVal); ok {
					d.peg[vI] = sp
					lastpref = sp
					lastprefI = vI
				}
			}
		}
	}

	kept := d.peg[:0]
	for _, p := range d.peg {
		if p != nil {
			kept = append(kept, p)
		}
	}
	d.peg = kept
	d.prefsRanked = true

	if len(d.peg) == 1 {
		if p, ok := d.peg[0].(*PrefVal); ok {
			return p
		}
	}
	return nil
}

// genSame generates every member in isolation and answers the one
// value they all produce, or same=false when any refuses, generates
// nothing, or differs.
func (d *DisjunctVal) genSame(ctx *Ctx) (any, bool) {
	var first any
	for i, m := range d.peg {
		gctx := &Ctx{}
		if nil != ctx {
			c := *ctx
			gctx = &c
		}
		gctx.err = nil
		gctx.collect = true
		out, gerr := m.Gen(gctx)
		if nil != gerr || 0 < len(gctx.err) || nil == out {
			return nil, false
		}
		if 0 == i {
			first = out
		} else if !reflect.DeepEqual(first, out) {
			return nil, false
		}
	}
	return first, true
}

// dedup removes structurally-equal Vals, keeping first occurrence.
func dedup(vals []Val) []Val {
	var out []Val
	for _, v := range vals {
		dup := false
		for _, e := range out {
			if valSame(e, v) {
				dup = true
				break
			}
		}
		if !dup {
			out = append(out, v)
		}
	}
	return out
}

// spreadSame is the spread half of bag equality (BUGS.md §52 regime
// 4): `[]` and `[&: T]` share an empty key set, and calling them the
// same value collapsed the disjunction to its first arm before any
// data could pick. Two spreads are the same when their canons are.
func spreadSame(a, b Val) bool {
	if (nil == a) != (nil == b) {
		return false
	}
	return nil == a || a.Canon() == b.Canon()
}

// valSame reports structural equality used for disjunct dedup.
func valSame(a, b Val) bool {
	if a == b {
		return true
	}
	// TOP is a single value however many times it is spelled, so `top|top`
	// must collapse (idempotence). Go's top is not a pointer singleton, so
	// the identity test above misses it and the pair survived dedup --
	// which then also hid the fact that a bare unresolved top is not
	// generable, a rule both ports already applied to a plain `x:top`.
	// The analogue of TS's TopVal.same override.
	if isTop(a) || isTop(b) {
		return isTop(a) && isTop(b)
	}
	if as, ok := a.(*ScalarVal); ok {
		if bs, ok := b.(*ScalarVal); ok {
			// Per-kind VALUE comparison (D2). A bare `as.peg == bs.peg`
			// compares *big.Int / *Decimal addresses, so `0d1|0d1` would
			// keep both members instead of deduping to one.
			return as.kind == bs.kind && scalarPegSame(as.kind, as.peg, bs.peg)
		}
		return false
	}
	if ak, ok := a.(*ScalarKindVal); ok {
		if bk, ok := b.(*ScalarKindVal); ok {
			return ak.kind == bk.kind
		}
		return false
	}
	if ap, ok := a.(*PrefVal); ok {
		if bp, ok := b.(*PrefVal); ok {
			return valSame(ap.peg, bp.peg)
		}
	}
	if ac, ok := a.(*ConstraintVal); ok {
		if bc, ok := b.(*ConstraintVal); ok {
			// Canon equality, exactly the TS ConstraintVal.same rule: the
			// canon is the residual's normal form, so equal canon IS
			// structural equality (`min(0)|min(0)` collapses).
			return ac.Canon() == bc.Canon()
		}
		return false
	}
	// TWO BAGS ARE THE SAME VALUE WHEN THEY HAVE THE SAME SHAPE. Without
	// this the fallthrough below said "different", so `x:*{a:1}|{a:number}`
	// met by `x:{a:2}` left `{"a":2}|{"a":2}` -- a disjunction of one value
	// spelled twice -- past dedup. Generation's old member FOLD hid it
	// (folding a value with itself is that value); ADR-007 does not, and a
	// disjunction whose alternatives are all the SAME value is resolved,
	// not ambiguous. The twin of BagVal.same in ts/src/val/BagVal.ts:
	// structural and deliberately strict, and terminating because a
	// reference is not a bag.
	if am, ok := a.(*MapVal); ok {
		bm, ok := b.(*MapVal)
		if !ok || am.closed != bm.closed ||
			am.mtype != bm.mtype || am.mhide != bm.mhide ||
			len(am.peg) != len(bm.peg) ||
			len(am.optional) != len(bm.optional) ||
			!spreadSame(am.spread, bm.spread) {
			return false
		}
		for _, k := range am.optional {
			if !bm.isOptional(k) {
				return false
			}
		}
		for k, av := range am.peg {
			bv, has := bm.peg[k]
			if !has || !valSame(av, bv) {
				return false
			}
		}
		return true
	}
	if al, ok := a.(*ListVal); ok {
		bl, ok := b.(*ListVal)
		if !ok || al.closed != bl.closed ||
			al.mtype != bl.mtype || al.mhide != bl.mhide ||
			len(al.peg) != len(bl.peg) ||
			!spreadSame(al.spread, bl.spread) {
			return false
		}
		for i, av := range al.peg {
			if !valSame(av, bl.peg[i]) {
				return false
			}
		}
		return true
	}
	return false
}
