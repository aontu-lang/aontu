/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)

// ListVal is an ordered list of element Vals. Unification is
// element-wise by index; a longer peer extends the result.
type ListVal struct {
	base
	peg    []Val
	closed bool
	opened bool
	spread Val // &: spread applied to every element
}

func newList(elems []Val) *ListVal {
	l := &ListVal{peg: elems}
	l.site.sp = unsited
	return l
}

func (l *ListVal) superior() Val { return top() } //coverage:ignore no caller: superOf lifts a bag child by child (ADR-011 R4)

func (l *ListVal) Canon() string {
	var b strings.Builder
	b.WriteByte('[')
	if l.spread != nil {
		b.WriteString("&:")
		b.WriteString(CanonRiders(l.spread))
		if len(l.peg) > 0 {
			b.WriteByte(',')
		}
	}
	for i, e := range l.peg {
		if i > 0 {
			b.WriteByte(',')
		}
		// CanonRiders, not Canon: a deprecated element renders back
		// as its `deprecate(x, m)` call, reparseably (G3).
		b.WriteString(CanonRiders(e))
	}
	b.WriteByte(']')
	return b.String()
}

func (l *ListVal) Gen(ctx *Ctx) (any, error) {
	if (l.mtype || l.mhide) && !probing(ctx) {
		return nil, nil
	}
	out := make([]any, 0, len(l.peg))
	for i, e := range l.peg {
		e = placeShared(e, append(cp(l.path), itoa(i)))
		if (e.markedType() || e.markedHide()) && !probing(ctx) {
			continue
		}
		if !genable(e) {
			code := "listval_no_gen"
			if l.closed {
				code = "listval_required"
			}
			va, vb := e, Val(nil)
			if ev, ok := e.(*ExpectVal); ok {
				// The TS isExpect branch, list prefix. Only maps create
				// expects (see go/expect.go), so this is exactly as
				// reachable as it is in TS — the shared BagVal.gen shape,
				// mirrored for both bags.
				code = "listval_spread_required"
				if ev.parent != nil {
					nb := newNil("")
					nb.site.sp = ev.parent.pos()
					nb.site.spu = ev.parent.posu()
					nb.site.url = ev.parent.srcurl()
					vb = nb
				}
				va = ev.peg
			}
			details := map[string]string{"key": strconv.Itoa(i)}
			// Recorded before the truncating break, as in MapVal.Gen --
			// and in BOTH modes, for the reason given there: the bag
			// records and walks on so sibling subtrees each contribute
			// a finding, and the raise belongs to the caller.
			makeNilErrFull(ctx, code, va, vb, "", details)
			break
		}
		ev, err := e.Gen(ctx)
		if err != nil {
			if ctx != nil && ctx.collect {
				ctx.dropped = true
				continue
			}
			return nil, err
		}
		if ev == nil && !gensNull(ctx, e) {
			continue
		}
		out = append(out, ev)
	}
	return out, nil
}

func (l *ListVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(l, ctx)
	}
	if pl, ok := peer.(*ListVal); ok && nil != ctx && ctx.trial &&
		nil == l.spread && nil == pl.spread {
		mineNow, mok := standingOf(l, l.peg)
		theirsNow, tok := standingOf(pl, pl.peg)
		if mok && tok && len(mineNow) != len(theirsNow) {
			return makeNilErrFull(ctx, "list_length", l, peer, "", nil)
		}
	}
	// A rel() peer drives for the same reason: the relation constraint
	// rewrites this list leaf by leaf (RELATIONS.0.md §3.2).
	if pr, ok := peer.(*RelVal); ok {
		return pr.Unify(l, ctx)
	}
	if pl, ok := peer.(*ListVal); ok && !l.closed && pl.closed {
		return pl.Unify(l, ctx)
	}
	// A TOP peer refines the list IN PLACE (mirrors `out = peer.isTop ?
	// this : new ListVal(...)` in TS ListVal.unify) — see the matching
	// comment in MapVal.Unify.
	var out *ListVal
	if isTop(peer) {
		out = l
	} else {
		out = &ListVal{}
		out.closed = l.closed
		out.opened = l.opened
		out.path = cp(l.path)
		out.site.sp = l.site.sp
		out.site.spu = l.site.spu
		out.site.url = l.site.url
		out.site.src = l.site.src
		out.spread = l.spread
	}
	done := true

	if pl, ok := peer.(*ListVal); ok {
		if out.spread == nil {
			out.spread = pl.spread
		} else if pl.spread != nil && out.spread.Canon() != pl.spread.Canon() {
			out.spread = unite(ctx, out.spread, pl.spread)
		}
	}
	var spreadCj Val = top()
	if out.spread != nil {
		spreadCj = out.spread
	}

	// Driven base (see the matching comment in MapVal.Unify).
	dbase := ctx.slot
	if dbase == nil {
		dbase = l.path
	}

	inplace := out == l
	for i, e := range l.peg {
		// List marks ratchet onto elements each pass (the
		// propagateMarks(this, child) in TS ListVal.unify).
		if l.mtype && !e.markedType() {
			e.setMarkType(true)
		}
		if l.mhide && !e.markedHide() {
			e.setMarkHide(true)
		}
		islot := append(cp(dbase), itoa(i))
		var ev Val
		if !isTop(spreadCj) && (isAbsent(e) || undecided(e)) {
			ev = e
			if !isAbsent(e) {
				ctx.slot = islot
				ev = unite(ctx, e, top())
				// Decided to be there: the template applies next pass.
				if !isAbsent(ev) {
					done = false
				}
			}
		} else if !isTop(spreadCj) && sprOf(e) == spreadCj {
			if e.Dc() == DONE {
				ev = e
			} else {
				ctx.slot = islot
				ev = unite(ctx, e, top())
			}
			setSprOn(ev, spreadCj)
		} else if pl, ok := peer.(*ListVal); ok && !isTop(spreadCj) && i < len(pl.peg) &&
			sprOf(pl.peg[i]) == spreadCj {
			ev = e
		} else {
			sc := spreadCloneFor(spreadCj, islot, ctx)
			ctx.slot = islot
			ev = meetTemplate(ctx, e, sc)
			if !isTop(spreadCj) && !ev.Nil() {
				setSprOn(ev, spreadCj)
			}
		}
		if inplace {
			out.peg[i] = ev
		} else {
			out.peg = append(out.peg, ev)
		}
		if ev.Dc() != DONE {
			done = false
		}
	}

	mine, mok := standingOf(l, out.peg)
	if mok && len(mine) != len(out.peg) {
		out.peg = placedAt(out, mine)
	}

	var bad Val
	if pl, ok := peer.(*ListVal); ok {
		out.closed = l.closed || pl.closed
		// Self-unify the peer against TOP first (the `upeer` step in TS
		// ListVal.unify) — see the matching comment in MapVal.Unify.
		if pl.Dc() != DONE {
			ctx.slot = dbase
			if upl, uok := unite(ctx, pl, top()).(*ListVal); uok {
				pl = upl
			}
		}
		// Pairing by position waits until each list knows which of its
		// elements stand, which a maybe knows only once the tree settles.
		theirs, tok := standingOf(pl, pl.peg)
		if (!mok || !tok) && !ctx.settle {
			out.setDc(l.dc + 1)
			held := newConjunct([]Val{out, pl})
			held.path = cp(l.path)
			held.site.sp, held.site.spu, held.site.url = l.site.sp, l.site.spu, l.site.url
			return held
		}
		peerPeg := pl.peg
		if tok && len(theirs) != len(pl.peg) {
			peerPeg = placedAt(pl, theirs)
		}
		for i, pe := range peerPeg {
			// A spread declares every element; each past a closed list's end is refused.
			if l.closed && l.spread == nil && i >= len(l.peg) {
				bad = makeNilErr(ctx, "closed", pe, nil)
			}
			islot := append(cp(dbase), itoa(i))
			var uv Val
			if i < len(out.peg) {
				ctx.slot = islot
				if l.closed {
					out.peg[i] = sealChild(out.peg[i])
				}
				uv = unite(ctx, out.peg[i], pe)
				// The spread meets an element once, and meeting a marked one
				// keeps the mark: met again, a recursive spread re-expanded.
				if !isTop(spreadCj) && !uv.Nil() && (sprOf(out.peg[i]) == spreadCj || sprOf(pe) == spreadCj) {
					setSprOn(uv, spreadCj)
				}
				out.peg[i] = uv
			} else {
				ctx.slot = islot
				uv = unite(ctx, pe, top())
				if l.spread != nil && undecided(uv) {
					done = false
				} else if l.spread != nil && !isAbsent(uv) {
					sc := spreadCloneFor(spreadCj, islot, ctx)
					ctx.slot = islot
					uv = meetTemplate(ctx, uv, sc)
					if !isTop(spreadCj) && !uv.Nil() {
						setSprOn(uv, spreadCj)
					}
				}
				out.peg = append(out.peg, uv)
			}
			if uv.Dc() != DONE {
				done = false
			}
		}
	} else if !isTop(peer) {
		ctx.slot = dbase
		// The container KIND delegates to its own arm, exactly as a
		// scalar delegates to a ScalarKindVal peer (PATHS.0.md).
		if ck, ok := peer.(*MapKindVal); ok {
			return ck.Unify(l, ctx)
		}
		if ck, ok := peer.(*ListKindVal); ok {
			return ck.Unify(l, ctx)
		}
		return makeNilErr(ctx, "list", l, peer)
	}
	if nil != bad {
		return bad
	}

	if out.closed {
		for i := range out.peg {
			ctx.slot = append(cp(dbase), itoa(i))
			out.peg[i] = sealChild(out.peg[i])
		}
	}

	if done {
		out.setDc(DONE)
	} else {
		out.setDc(l.dc + 1)
	}
	propagateMarks(l, out)
	if !isTop(peer) {
		propagateMarks(peer, out)
	}
	return out
}

// standingOf is the elements a list holds a position for: none for
// absence, nor for one its own mark leaves out, a mark the list doesn't
// carry. It is false while an element is undecided, since its answer
// moves every position after it.
func standingOf(marks *ListVal, peg []Val) ([]Val, bool) {
	out := make([]Val, 0, len(peg))
	for _, e := range peg {
		if undecided(e) || markCall(e) {
			return nil, false
		}
		if !isAbsent(e) && !(e.markedHide() && !marks.mhide) && !(e.markedType() && !marks.mtype) {
			out = append(out, e)
		}
	}
	return out, true
}

func markCall(v Val) bool {
	f, ok := v.(*FuncVal)
	return ok && ("hide" == f.name || "type" == f.name)
}

func placedAt(l *ListVal, kept []Val) []Val {
	out := make([]Val, len(kept))
	for i, e := range kept {
		at := append(cp(l.path), itoa(i))
		if pathEq(e.vpath(), at) {
			out[i] = e
		} else {
			out[i] = clonePath(e, at)
		}
	}
	return out
}

// A container template waits for a member that has not decided (ADR-043).
func undecided(v Val) bool {
	f, ok := v.(*FuncVal)
	return ok && "maybe" == f.name && DONE != f.Dc()
}
