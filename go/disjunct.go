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
	d.site.sp = -1
	return d
}

func (d *DisjunctVal) cjo() int { return 35000 }

func (d *DisjunctVal) superior() Val { return top() } //coverage:ignore no caller: the preference gate asks superOf (ADR-011 R4)

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
		// A clash between equal-rank defaults refuses for the whole
		// disjunction (R2): the disagreement IS the answer.
		if ranked := d.rankPrefs(ctx); nil != ranked && ranked.Nil() {
			return ranked
		}
	}

	done := true
	var gate []int
	_, peerIsPref := peer.(*PrefVal)
	oval := make([]Val, len(d.peg))
	if nil == ctx.referflows {
		ctx.referflows = map[string]Val{}
	}
	savedFlows := ctx.referflows
	staged := make([]map[string]Val, len(d.peg))
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
		if nil != savedFlows {
			staged[i] = map[string]Val{}
			ctx.referflows = staged[i]
		}
		r := unite(ctx, m, peer)
		failed := len(ctx.err) > 0 || r.Nil()
		ctx.err = saved
		ctx.trial = savedTrial
		ctx.referflows = savedFlows
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
			//coverage:ignore-block the meet returns the preference itself; see above
			wrapped := newPref(got)
			wrapped.rank = pp.rank
			wrapped.site.sp = pp.site.sp
			wrapped.site.spu = pp.site.spu
			wrapped.site.url = pp.site.url
			wrapped.site.src = pp.site.src
			wrapped.path = cp(got.vpath())
			oval[vI] = wrapped
		}
	}

	// THE SURVIVORS' FLOWS, AND ONLY THEIRS. Members knocked out by the
	// trial or by the admission gate above are nil here, so this runs
	// after both and before they are dropped.
	if nil != savedFlows {
		for i, st := range staged {
			if nil == st || nil == oval[i] {
				continue
			}
			for k, fv := range st {
				if prev, seen := savedFlows[k]; seen {
					savedFlows[k] = unite(ctx, prev, fv)
				} else {
					savedFlows[k] = fv
				}
			}
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
		ctx.slot = slot
		return makeNilErr(ctx, "empty", d, peer)
	}
	out := newDisjunct(res)
	out.path = cp(d.path)
	out.site.sp = d.site.sp
	out.site.spu = d.site.spu
	out.site.url = d.site.url
	out.site.src = d.site.src
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

func (d *DisjunctVal) Gen(ctx *Ctx) (any, error) {
	val, unresolved := d.forGen(ctx)
	if unresolved {
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
		return nil, &AontuError{Msg: "Cannot generate value: empty disjunct", Code: "empty"}
	}
	return val.Gen(ctx)
}

func (d *DisjunctVal) forGen(ctx *Ctx) (Val, bool) {
	if len(d.peg) == 0 {
		return nil, false
	}
	if !d.prefsRanked {
		if clash := d.rankPrefs(ctx); nil != clash && clash.Nil() {
			return clash, false
		}
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
	best := prefs[0]
	for _, m := range prefs {
		if m.(*PrefVal).rank < best.(*PrefVal).rank {
			best = m
		}
	}
	return best, false
}

func (d *DisjunctVal) rankPrefs(ctx *Ctx) Val {
	// The kept index per rank, so an equal-rank twin folds into the arm
	// already standing for that rank.
	atRank := map[int]int{}

	for vI := 0; vI < len(d.peg); vI++ {
		var pref *PrefVal

		switch v := d.peg[vI].(type) {
		case *PrefVal:
			pref = v
		case *DisjunctVal:
			sub := v.rankPrefs(ctx)
			if nil != sub && sub.Nil() {
				return sub
			}
			if sp, ok := sub.(*PrefVal); ok {
				d.peg[vI] = sp
				pref = sp
			}
		}

		if nil == pref {
			continue
		}

		at, seen := atRank[pref.rank]
		if !seen {
			atRank[pref.rank] = vI
			continue
		}

		folded := pref.Unify(d.peg[at], ctx)
		if folded.Nil() {
			return folded
		}
		d.peg[at] = folded
		d.peg[vI] = nil
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

func dedup(vals []Val) []Val {
	var out []Val
	for _, v := range vals {
		dup := false
		for eI, e := range out {
			if valSame(e, v) {
				dup = true
				break
			}
			ep, eok := e.(*PrefVal)
			vp, vok := v.(*PrefVal)
			if eok && vok && valSame(prefInnerPeg(ep), prefInnerPeg(vp)) {
				dup = true
				if vp.rank < ep.rank {
					out[eI] = v
				}
				break
			}
		}
		if !dup {
			out = append(out, v)
		}
	}
	return out
}

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
