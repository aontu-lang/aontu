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
	l.sp = unsited
	return l
}

// superior answers top for a bag, as it always has. Its one caller
// was the preference gate, which asks superOf now (ADR-011 R4) and
// lifts a bag child by child instead; the method stays because the
// Val interface requires it.
// (superOf answers for this type before the fallthrough.)
func (l *ListVal) superior() Val { return top() } //coverage:ignore

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
		// Mirrors the MapVal.Gen child handling (which mirrors TS
		// BagVal.gen): non-generable elements error at the bag level
		// (or truncate under collect); a nil that doesn't stand for
		// JSON null contributes nothing.
		if !genable(e) {
			// Code follows the TS BagVal.gen choice (see MapVal.Gen).
			// Rendered via a NilVal for the full TS-style message, with
			// the element index as the key detail (TS BagVal.gen passes
			// the bag key either way).
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
					nb.sp = ev.parent.pos()
					nb.spu = ev.parent.posu()
					nb.surl = ev.parent.srcurl()
					vb = nb
				}
				va = ev.peg
			}
			details := map[string]string{"key": strconv.Itoa(i)}
			// Recorded before the truncating break, as in MapVal.Gen.
			if ctx != nil && ctx.collect {
				makeNilErrFull(ctx, code, va, vb, "", details)
				break
			}
			src, file := "", ""
			if ctx != nil {
				src, file = ctx.src, ctx.file
			}
			n := makeNilErrFull(nil, code, va, vb, "", details)
			return nil, &AontuError{Msg: n.FullMessage(src, file), Code: code}
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
	// A sizing residual (`length`, `unique`) sorts AFTER containers in a
	// conjunct so that it counts the MERGED list rather than the first
	// fragment (sizingCjo in constraint.go). That makes the list the
	// accumulator and the constraint its peer, the reverse of the usual
	// order -- and the reading belongs to the constraint either way, so
	// hand it straight back.
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(l, ctx)
	}
	// A DISJUNCT ALTERNATIVE MATCHES ITS OWN LENGTH (BUGS.md §52
	// regime 4, the X-C3 adjudication): in a trial, a literal list
	// with no spread admits only a peer list of the same length -- a
	// spread makes it variadic. Outside trials the ordinary
	// elementwise merge stands (two statements of one list are one
	// list), so `[] | [&: T]` stops admitting every list through the
	// empty arm while `a: [] a: [1]` still merges.
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
		out.sp = l.sp
		out.spu = l.spu
		out.surl = l.surl
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
		// APPLIED ONCE PER ELEMENT, the guard MapVal.Unify has carried
		// since the spread was written: an element that already holds
		// this template's contribution is progressed by self-unification
		// instead of having the template met into it a second time.
		// Re-applying is the identity for a template that has already
		// RESOLVED, which is why the missing guard went unnoticed here
		// — but a template that residuates (`&: id(key(1))`, G8 phase 0)
		// is not yet a value to be idempotent about, so each pass
		// conjoined another copy and the element's canon DOUBLED per
		// pass. The old `ctx.cc < 3` key delay hid it by ending the
		// growth at three passes; the staging rule waits for the model
		// to settle, and a model whose canon doubles every pass never
		// does. Mirrors ts/src/val/ListVal.ts.
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
		// The meet is the LIST against a non-list, so it happens at the
		// list's own slot -- restore it. The element loops above overwrite
		// ctx.slot with an element slot and only the in-branch paths put
		// it back, so a stale index survived into this branch and
		// makeNilErr's slot-extension then stamped it: `a:[10,"bad"] &
		// {a:[...]}` reported `$.a.1`, an element that is not party to the
		// failure, where TypeScript reported `$.a` (BUGS.md 47).
		ctx.slot = dbase
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
