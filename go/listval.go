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
		b.WriteString(l.spread.Canon())
		if len(l.peg) > 0 {
			b.WriteByte(',')
		}
	}
	for i, e := range l.peg {
		if i > 0 {
			b.WriteByte(',')
		}
		// canonRiders, not Canon: a deprecated element renders back
		// as its `deprecate(x, m)` call, reparseably (G3).
		b.WriteString(canonRiders(e))
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
		nil == l.spread && nil == pl.spread &&
		len(l.peg) != len(pl.peg) {
		return makeNilErrFull(ctx, "list_length", l, peer, "", nil)
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
		out.path = cp(l.path)
		out.site.sp = l.site.sp
		out.site.spu = l.site.spu
		out.site.url = l.site.url
		out.spread = l.spread
	}
	done := true

	if pl, ok := peer.(*ListVal); ok {
		if out.spread == nil {
			out.spread = pl.spread
		} else if pl.spread != nil {
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
		if !isTop(spreadCj) && sprOf(e) == spreadCj {
			if e.Dc() == DONE {
				ev = e
			} else {
				ctx.slot = islot
				ev = unite(ctx, e, top())
			}
			setSprOn(ev, spreadCj)
		} else {
			sc := spreadCloneFor(spreadCj, islot, ctx)
			ctx.slot = islot
			ev = unite(ctx, e, sc)
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
		for i, pe := range pl.peg {
			if l.closed && i >= len(l.peg) {
				return makeNilErr(ctx, "closed", pe, nil)
			}
			islot := append(cp(dbase), itoa(i))
			var uv Val
			if i < len(out.peg) {
				ctx.slot = islot
				uv = unite(ctx, out.peg[i], pe)
				out.peg[i] = uv
			} else {
				ctx.slot = islot
				uv = unite(ctx, pe, top())
				if l.spread != nil {
					sc := spreadCloneFor(spreadCj, islot, ctx)
					ctx.slot = islot
					uv = unite(ctx, uv, sc)
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
