/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"reflect"
	"slices"
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

func (d *DisjunctVal) superior() Val { return top() } //coverage:ignore no caller: the preference gate asks superOf

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

	// An arm that isn't read yet is read, the peer held, before the disjunction meets the peer:
	// a default that reaches the arm stands as the arm it is whenever it settles (ruling 89).
	if !isTop(peer) && slices.ContainsFunc(d.peg, pends) && !d.readArms(peer, ctx) {
		cj := newConjunct([]Val{d, peer})
		cj.path = cp(d.path)
		cj.site.sp, cj.site.spu, cj.site.url = d.site.sp, d.site.spu, d.site.url
		return cj
	}

	if !d.prefsRanked {
		// A clash between equal-rank defaults refuses for the whole
		// disjunction (R2): the disagreement IS the answer.
		if ranked := d.rankPrefs(ctx); nil != ranked && ranked.Nil() {
			return ranked
		}
	}

	done := true
	var gate []int

	// A rider still a call resolves first: met member by member it would
	// write its record on each (the arm mirrors TypeScript's).
	if f, ok := peer.(*FuncVal); ok && ridesCall(f.name) && DONE != f.Dc() { //coverage:ignore unite drives a rider call before a disjunction meets it, where TypeScript's pass shortcut can leave it undriven
		peer = f.Unify(top(), ctx)
	}
	// The peer's annotations ride the result once, not each member, so a
	// disjunction met with itself is itself.
	member := peer
	annotated := nil != peer.metaRec() || nil != peer.deprecRec() || nil != peer.viaRec() ||
		nil != peer.declRec()
	if annotated {
		if c := clonePath(peer, peer.vpath()); c != peer {
			c.setMetaRec(nil)
			c.setDeprecRec(nil)
			c.setViaRec(nil)
			c.setDeclRec(nil)
			member = c
		}
	}

	_, peerIsPref := member.(*PrefVal)
	pd, peerIsDisjunct := member.(*DisjunctVal)
	if peerIsPref || peerIsDisjunct && (0 < leadRank(d) || 0 < leadRank(pd)) {
		out := meetRanked(ctx, d, member)
		if annotated {
			ride(out, nil, peer)
		}
		return out
	}
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
		r := ctx.holdArm(d.path, prefInnerPeg(m), member, false, func() Val { return unite(ctx, m, member) })
		// An arm's path into its own place that names nothing fails the arm, once all has settled.
		failed := len(ctx.err) > 0 || r.Nil() || holdsUnmetNil(r) ||
			(ctx.settle && nil != strayIn(r, d.path))
		ctx.err = saved
		ctx.trial = savedTrial
		if failed {
			oval[i] = nil
		} else {
			oval[i] = r
			if r.Dc() != DONE {
				done = false
			}
			if _, ok := m.(*PrefVal); ok && !isTop(peer) {
				// A candidate for the admission gate below: a non-pref,
				// non-top peer met a preference inside this disjunction.
				gate = append(gate, i)
			}
		}
	}

	// An arm `*x` is the arm `x` of rank one, with no parent type: a peer
	// its own value refuses kills it.
	for _, gI := range gate {
		// The trial is against a CLONE: the preferred value must stay
		// pristine for the surviving preference (the matchFunc precedent
		// in generate.go).
		inner := prefInnerPeg(d.peg[gI].(*PrefVal))
		ctx.slot = slot
		met := trialUnify(ctx, clonePath(inner, cp(d.path)), clonePath(peer, cp(d.path)))
		if nil == met {
			oval[gI] = nil
		} else if unread(met) {
			// The arm's own value isn't read yet, so its gate can't answer and the meet is tried again.
			cj := newConjunct([]Val{d, peer})
			cj.path = cp(d.path)
			cj.site.sp, cj.site.spu, cj.site.url = d.site.sp, d.site.spu, d.site.url
			return cj
		}
	}

	// Flatten nested disjuncts, drop failed members, dedup.
	var res []Val
	for _, v := range oval {
		if v == nil {
			continue
		}
		res = append(res, flatArms(v)...)
	}
	res = dedup(res, false)

	switch len(res) {
	case 1:
		if annotated {
			ride(res[0], nil, peer)
		}
		return res[0]
	case 0:
		ctx.slot = slot
		return makeNilErr(ctx, "empty", d, peer)
	}
	out := newDisjunct(res)
	if annotated {
		ride(out, nil, peer)
	}
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
	if d.admitsToward(ctx) {
		return ctx.toward.v, nil
	}
	if unresolved {
		if out, same := d.genAlike(ctx); same {
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

// admitsToward is whether, in a generation toward the data, an arm admits
// the data at this place as written.
func (d *DisjunctVal) admitsToward(ctx *Ctx) bool {
	if nil == ctx || nil == ctx.toward || len(d.peg) < 2 {
		return false
	}
	for _, arm := range d.peg {
		if armAdmits(arm, ctx) {
			return true
		}
	}
	return false
}

// readArms reads each arm that isn't read yet; false where one still waits.
func (d *DisjunctVal) readArms(peer Val, ctx *Ctx) bool {
	slot := ctx.slot
	arms := make([]Val, 0, len(d.peg))
	for _, m := range d.peg {
		if !pends(m) {
			arms = append(arms, m)
			continue
		}
		saved, savedTrial := ctx.err, ctx.trial
		ctx.err = []*NilVal{}
		ctx.trial = true
		ctx.slot = slot
		r := ctx.holdArm(d.path, prefInnerPeg(m), peer, false, func() Val { return unite(ctx, m, top()) })
		failed := len(ctx.err) > 0 || r.Nil()
		ctx.err, ctx.trial = saved, savedTrial
		if failed {
			continue
		}
		arms = append(arms, flatArms(r)...)
	}
	ctx.slot = slot
	d.peg = arms
	d.prefsRanked = false
	return !slices.ContainsFunc(arms, pends)
}

func flatArms(v Val) []Val {
	if dj, ok := v.(*DisjunctVal); ok {
		return dj.peg
	}
	return []Val{v}
}

func pends(v Val) bool {
	if DONE == v.Dc() {
		return false
	}
	switch v.(type) {
	case *RefVal, *FuncVal, *ConjunctVal:
		return true
	}
	return false
}

func unread(v Val) bool {
	return unreadWhich(v, func(*RefVal) bool { return true })
}

// unreadWhich: whether a value holds an unread path that `which` takes.
func unreadWhich(v Val, which func(*RefVal) bool) bool {
	in := func(k Val) bool { return unreadWhich(k, which) }
	switch n := v.(type) {
	case *RefVal:
		return which(n)
	case *MapVal:
		for _, k := range n.keys {
			if in(n.peg[k]) {
				return true
			}
		}
	case *ListVal:
		return slices.ContainsFunc(n.peg, in)
	case *ConjunctVal:
		return slices.ContainsFunc(n.peg, in)
	case *DisjunctVal:
		return slices.ContainsFunc(n.peg, in)
	case *FuncVal:
		return slices.ContainsFunc(n.peg, in)
	case *PlusOpVal:
		return slices.ContainsFunc(n.peg, in)
	}
	return false
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
	prefs := []int{}
	lead := -1
	for vI := 0; vI < len(d.peg); vI++ {
		if v, ok := d.peg[vI].(*DisjunctVal); ok {
			sub := v.rankPrefs(ctx)
			if nil != sub && sub.Nil() {
				return sub
			}
			if sp, ok := sub.(*PrefVal); ok {
				d.peg[vI] = sp
			}
		}
		if p, ok := d.peg[vI].(*PrefVal); ok {
			prefs = append(prefs, vI)
			if -1 == lead || p.rank < lead {
				lead = p.rank
			}
		}
	}

	// Only the defaults the rank rule picks fold: foldArms in spec/Aontu/Meet.lean.
	at := -1
	for _, vI := range prefs {
		pref, ok := d.peg[vI].(*PrefVal)
		if !ok || lead != pref.rank {
			continue
		}
		if -1 == at {
			at = vI
			continue
		}

		// Twins that differ in their output records do not fold into one.
		var folded Val
		if sameRec(pref, d.peg[at]) {
			folded = pref.Unify(d.peg[at], ctx)
		} else {
			folded = makeNilErr(ctx, "pref_rank_clash", pref, d.peg[at])
		}
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

// genAlike reads the members plain first: values that differ stay apart,
// though an output option could write them alike.
func (d *DisjunctVal) genAlike(ctx *Ctx) (any, bool) {
	out, same := d.genSame(ctx, true)
	if !same || (nil != ctx && ctx.plain) {
		return out, same
	}
	return d.genSame(ctx, false)
}

// genSame generates every member in isolation and answers the one
// value they all produce, or same=false when any refuses, generates
// nothing, or differs.
func (d *DisjunctVal) genSame(ctx *Ctx, plain bool) (any, bool) {
	var first any
	for i, m := range d.peg {
		gctx := &Ctx{}
		if nil != ctx {
			ctx.trialsOf()
			c := *ctx
			gctx = &c
		}
		gctx.err = nil
		gctx.collect = true
		gctx.plain = plain
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

func dedup(vals []Val, ranked bool) []Val {
	var out []Val
	for _, v := range vals {
		dup := false
		for eI, e := range out {
			if valSame(e, v) && sameRec(e, v) {
				dup = true
				out[eI] = keepRiders(e, v, true)
				break
			}
			ep, eok := e.(*PrefVal)
			vp, vok := v.(*PrefVal)
			if eok && vok && valSame(prefInnerPeg(ep), prefInnerPeg(vp)) && sameRec(e, v) {
				dup = true
				if vp.rank < ep.rank {
					out[eI] = keepRiders(v, e, true)
				} else {
					out[eI] = keepRiders(e, v, true)
				}
				break
			}
			// A plain arm the ranked meet makes beside a preferred one of the
			// same value adds nothing to it.
			if ranked && eok != vok && valSame(prefInnerPeg(e), prefInnerPeg(v)) && sameRec(e, v) {
				dup = true
				if vok {
					out[eI] = keepRiders(v, e, true)
				} else {
					out[eI] = keepRiders(e, v, true)
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

// keepRiders gives a dedup's survivor the dropped member's riders, at
// every depth, so the join is as order-free as the meet, and
// its links' templates where the output takes both twins alike.
func keepRiders(keep, drop Val, sends bool) Val {
	if !ridden(drop) {
		return keep
	}
	out := clonePath(keep, keep.vpath())
	ride(out, keep, drop)
	if kp, ok := keep.(*PrefVal); ok {
		if dp, ok := drop.(*PrefVal); ok && kp.rank != dp.rank {
			sends = false
		}
	}
	if sends {
		li := out.linkInfo()
		li.flows = joinFlows(li.flows, drop.linkInfo().flows)
		out.setLinkInfo(li)
	}
	if dp, ok := drop.(*PrefVal); ok {
		if _, kp := out.(*PrefVal); !kp {
			// A twin of a higher rank holds one more preference layer.
			return keepRiders(out, dp.peg, sends)
		}
	}
	switch o := out.(type) {
	case *MapVal:
		for _, k := range o.keys {
			o.peg[k] = keepRiders(o.peg[k], drop.(*MapVal).peg[k], sends)
		}
	case *ListVal:
		for i := range o.peg {
			o.peg[i] = keepRiders(o.peg[i], drop.(*ListVal).peg[i], sends)
		}
	case *PrefVal:
		o.peg = keepRiders(o.peg, drop.(*PrefVal).peg, sends)
	}
	return out
}

func ridden(v Val) bool {
	if nil != v.deprecRec() || nil != v.metaRec() || 0 < len(v.linkInfo().flows) || nil != v.declRec() {
		return true
	}
	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			if ridden(n.peg[k]) {
				return true
			}
		}
	case *ListVal:
		for _, e := range n.peg {
			if ridden(e) {
				return true
			}
		}
	case *PrefVal:
		return ridden(n.peg)
	}
	return false
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
	if isAbsent(a) || isAbsent(b) {
		return isAbsent(a) && isAbsent(b)
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

// THE RANKED MEET (meetNodes in spec/Aontu/Meet.lean): where a default
// meets another term, the side with the stronger rank goes outermost and
// the other meets each of its arms, so a weaker default stands under a
// stronger one (rulings 41 and 42), and two that lead with one rank meet
// as nodeTie does (decision 43). An arm's rank counts its stars.
type rankedArm struct {
	rank int
	val  Val
	src  []Val
}

func meetRanked(ctx *Ctx, a, b Val) Val {
	arms := meetArms(ctx, a, b)
	if 0 == len(arms) {
		return makeNilErr(ctx, "empty", a, b)
	}
	return armsVal(a, arms)
}

func nodeOf(v Val) bool {
	switch v.(type) {
	case *DisjunctVal, *PrefVal:
		return true
	}
	return false
}

// A preferred arm's preference layers carry its riders through the meet.
func armOf(v Val) []rankedArm {
	switch n := v.(type) {
	case *PrefVal:
		return []rankedArm{{n.rank + 1, prefInnerPeg(n), prefLayers(n)}}
	case *DisjunctVal:
		out := []rankedArm{}
		for _, m := range n.peg {
			out = append(out, armOf(m)...)
		}
		return out
	}
	return []rankedArm{{0, v, nil}}
}

func prefLayers(v Val) []Val {
	out := []Val{}
	for p, ok := v.(*PrefVal); ok; p, ok = p.peg.(*PrefVal) {
		out = append(out, p)
	}
	return out
}

// A lone preference `*x` is `x | super(x)`.
func armsOf(v Val) []rankedArm {
	if p, ok := v.(*PrefVal); ok {
		return []rankedArm{{p.rank + 1, prefInnerPeg(p), nil}, {0, p.superpeg, nil}}
	}
	return armOf(v)
}

func leadRank(v Val) int {
	lead := 0
	for _, a := range armsOf(v) {
		if 0 < a.rank && (0 == lead || a.rank < lead) {
			lead = a.rank
		}
	}
	return lead
}

func meetArms(ctx *Ctx, a, b Val) []rankedArm {
	if !nodeOf(a) && !nodeOf(b) {
		met := trialUnify(ctx, a, b)
		if nil == met {
			return nil
		}
		return armsOf(met)
	}
	ra, rb := leadRank(a), leadRank(b)
	if 0 < ra && ra == rb {
		return tieArms(ctx, ra, a, b)
	}
	if 0 < ra && (0 == rb || ra < rb) || 0 == rb && nodeOf(a) {
		return spreadArms(a, armsOf(a), func(x Val) []rankedArm { return meetArms(ctx, x, b) })
	}
	return spreadArms(a, armsOf(b), func(y Val) []rankedArm { return meetArms(ctx, a, y) })
}

func spreadArms(home Val, arms []rankedArm, meet func(Val) []rankedArm) []rankedArm {
	out := []rankedArm{}
	for _, a := range arms {
		out = append(out, rankArms(home, a.rank, meet(a.val), a.src)...)
	}
	return out
}

func rankArms(home Val, r int, arms []rankedArm, src []Val) []rankedArm {
	if 0 == len(arms) {
		return nil
	}
	if 0 == r {
		return arms
	}
	return []rankedArm{{r, armsVal(home, arms), src}}
}

func tieArms(ctx *Ctx, r int, a, b Val) []rankedArm {
	at := func(v Val, want bool) []rankedArm {
		out := []rankedArm{}
		for _, p := range armsOf(v) {
			if want == (p.rank == r) {
				out = append(out, p)
			}
		}
		return out
	}
	pairs := [][]rankedArm{}
	srcs := [][]Val{}
	live := false
	for _, p := range at(a, true) {
		for _, q := range at(b, true) {
			m := meetArms(ctx, p.val, q.val)
			live = live || 0 < len(m)
			pairs = append(pairs, m)
			srcs = append(srcs, append(append([]Val{}, p.src...), q.src...))
		}
	}
	k := r
	if live {
		k = r + 1
	}
	arms := []rankedArm{}
	for i, m := range pairs {
		arms = append(arms, rankArms(a, r, m, srcs[i])...)
	}
	for _, p := range at(a, true) {
		arms = append(arms, rankArms(a, k, spreadArms(a, at(b, false),
			func(y Val) []rankedArm { return meetArms(ctx, p.val, y) }), p.src)...)
	}
	for _, q := range at(b, true) {
		arms = append(arms, rankArms(a, k, spreadArms(a, at(a, false),
			func(x Val) []rankedArm { return meetArms(ctx, x, q.val) }), q.src)...)
	}
	rest := meetArms(ctx, armsVal(a, at(a, false)), armsVal(a, at(b, false)))
	if live {
		arms = rankArms(a, r, arms, nil)
	}
	return append(arms, rest...)
}

func armsVal(home Val, arms []rankedArm) Val {
	pegs := make([]Val, len(arms))
	done := true
	for i, a := range arms {
		v := a.val
		done = done && DONE == v.Dc()
		for rI := 0; rI < a.rank; rI++ {
			p := newPref(v)
			at := v
			if rI == a.rank-1 && 0 < len(a.src) {
				at = a.src[0]
			}
			rankedPlace(at, &p.base)
			v = p
		}
		for _, layer := range a.src {
			ride(v, layer, nil)
		}
		pegs[i] = v
	}
	if pegs = dedup(pegs, true); 1 == len(pegs) {
		one := clonePath(prefInnerPeg(pegs[0]), nil)
		ride(one, pegs[0], nil)
		return one
	}
	out := newDisjunct(pegs)
	rankedPlace(home, &out.base)
	if done {
		out.setDc(DONE)
	} else {
		out.setDc(home.Dc() + 1)
	}
	return out
}

// What the ranked meet makes stands where the meet does, as TypeScript's
// Val.place sets it.
func rankedPlace(home Val, b *base) {
	b.path = cp(home.vpath())
	b.site.sp, b.site.spu, b.site.url, b.site.src = home.pos(), home.posu(), home.srcurl(), home.srctext()
	b.fwrt = home.written()
	b.finner = home.innerOf()
}

// An arm that holds a written nil at a member it must have refuses (ruling 54).
func holdsUnmetNil(v Val) bool {
	unmet := func(c Val) bool {
		n, ok := c.(*NilVal)
		return (ok && "literal_nil" == n.why) || holdsUnmetNil(c)
	}
	switch t := v.(type) {
	case *MapVal:
		for _, k := range t.keys {
			if !slices.Contains(t.optional, k) && unmet(t.peg[k]) {
				return true
			}
		}
	case *ListVal:
		return slices.ContainsFunc(t.peg, unmet)
	}
	return false
}
