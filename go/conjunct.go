/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"slices"
	"sort"
	"strings"
)

// ConjunctVal is the unification (&) of its terms.
type ConjunctVal struct {
	base
	peg []Val
	// waits: a residual's meet before its definition has assembled.
	waits bool
	// unmarked: this spread template without its marks (unmarkedTemplate).
	unmarked Val
	// chained: one step of an `&` chain as the parser read it, no parenthesis around it yet.
	chained bool
	own     bool
}

func newConjunct(terms []Val) *ConjunctVal {
	c := &ConjunctVal{peg: terms}
	c.site.sp = -1
	return c
}

func (c *ConjunctVal) cjo() int      { return 40000 }
func (c *ConjunctVal) superior() Val { return top() }

func (c *ConjunctVal) Canon() string {
	terms, parts := spelled(c.peg, junctChildCanon)
	return strings.Join(meetOrder(terms, parts), "&")
}

// spelled is a meet's terms with their texts, where they have one.
func spelled(peg []Val, text func(Val) string) ([]Val, []string) {
	terms := make([]Val, 0, len(peg))
	parts := make([]string, 0, len(peg))
	for _, t := range peg {
		if s := text(t); "" != s {
			terms = append(terms, t)
			parts = append(parts, s)
		}
	}
	return terms, parts
}

// templateKey is a template's canon and the pending links canon leaves out.
func templateKey(cj Val) string {
	key := cj.Canon()
	links := []Val{cj}
	if c, ok := cj.(*ConjunctVal); ok {
		links = c.peg
	}
	for _, t := range links {
		if l, ok := t.(*PendingLinkVal); ok {
			key += "\x00"
			if nil != l.tval {
				key += l.tval.Canon()
			}
		}
	}
	return key
}

// spreadText is a bag's template as canon writes it, where it has a text.
func spreadText(sp Val, members bool, text func(Val) string) string {
	if nil == sp {
		return ""
	}
	s := text(sp)
	if "" == s {
		return ""
	}
	if members {
		return "&:" + s + ","
	}
	return "&:" + s
}

// meetOrder: a meet is one value whatever order its terms were met in, so
// terms of one rank are written in code-point order.
func meetOrder(terms []Val, parts []string) []string {
	idx := make([]int, len(terms))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		ca, cb := terms[idx[a]].cjo(), terms[idx[b]].cjo()
		if ca != cb {
			return ca < cb
		}
		return parts[idx[a]] < parts[idx[b]]
	})
	out := make([]string, len(parts))
	for i, j := range idx {
		out[i] = parts[j]
	}
	return out
}

func junctChildCanon(v Val) string {
	switch t := v.(type) {
	case *ConjunctVal:
		if len(t.peg) > 1 {
			return "(" + CanonRiders(t) + ")"
		}
	case *DisjunctVal:
		if len(t.peg) > 1 {
			return "(" + CanonRiders(t) + ")"
		}
	}
	return CanonRiders(v)
}

func (c *ConjunctVal) Gen(ctx *Ctx) (any, error) {
	if con, bag, ok := sizingResidue(c); ok {
		settled := con.settleContainer(bag, ctx)
		if n, isNil := settled.(*NilVal); isNil {
			if nil != ctx {
				ctx.adderr(n)
				if ctx.collect {
					return nil, nil
				}
				return nil, &AontuError{
					Msg: n.FullMessage(ctx.src, ctx.file, ctx.texts), Code: n.why}
			}
			return nil, &AontuError{Msg: n.FullMessage("", "", nil), Code: n.why}
		}
		return settled.Gen(ctx)
	}

	// An unresolved conjunct is not a concrete value. Code mirrors TS
	// ConjunctVal.gen ('conjunct').
	return nil, residueWalkOn(ctx, c, "conjunct")
}

func (c *ConjunctVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	// The conjunct's members are driven at the conjunct's own location
	// (TS folds with the same undescended ctx).
	slot := ctx.slot

	var carried []Val
	terms := norm(c.peg, &carried, isTop(peer))

	if dataBag(peer) && slices.ContainsFunc(terms, sealish) {
		if alone := c.apart(terms, peer, ctx); nil != alone {
			return alone
		}
	}

	upeer := make([]Val, len(terms))
	for i, t := range terms {
		if t.Dc() == DONE && isTop(peer) {
			upeer[i] = t
		} else {
			ctx.slot = slot
			upeer[i] = unite(ctx, t, peer)
		}
		if upeer[i].Nil() {
			return upeer[i]
		}
	}

	upeer = norm(upeer, &carried, false)

	var outvals []Val
	open := false
	if len(upeer) == 0 {
		return top()
	}
	t0 := upeer[0]
	for pI := 0; pI < len(upeer); pI++ {
		var t1 Val
		if pI+1 < len(upeer) {
			t1 = upeer[pI+1]
		}
		if t1 == nil {
			outvals = append(outvals, t0)
			continue
		}
		ctx.slot = slot
		val := unite(ctx, t0, t1)
		_, t0dj := t0.(*DisjunctVal)
		_, t1dj := t1.(*DisjunctVal)
		_, _, residue := sizingResidue(val)
		cj, ok := val.(*ConjunctVal)
		moved := residue && !sameTerms(cj, t0, t1)
		if ok && !moved && (!t0dj && !t1dj || sameTerms(cj, t0, t1)) {
			// A conjunct answer is no progress, unless it is a sizing
			// residue of other terms: a decided disjunction or one level
			// of an expanded recursion is the meet so far.
			open = open || cj.waits
			outvals = append(outvals, t0)
			t0 = t1
		} else if val.Nil() {
			return val
		} else {
			t0 = val
		}
	}

	var out Val
	switch len(outvals) {
	case 0: //coverage:ignore a fold over >=1 term always appends
		out = top()
	case 1:
		out = outvals[0]
	default:
		nc := newConjunct(outvals)
		// The re-wrap lives where the fold ran (TS builds its wrapper
		// with the ctx, which stamps the path): budget_passes names a
		// still-refining node by this path, so a pathless wrapper
		// reported `$` where TypeScript reports the node's location.
		nc.path = cp(c.path)
		nc.site.sp, nc.site.spu, nc.site.url = c.site.sp, c.site.spu, c.site.url
		nc.own = c.own
		out = nc
	}
	// Only the terms left after the fold decide, and a residual still
	// waiting for its definition keeps the meet open.
	done := !open
	for _, v := range outvals {
		done = done && v.Dc() == DONE
	}
	if done {
		out.setDc(DONE)
	} else {
		out.setDc(c.dc + 1)
	}

	// Marks propagate from the conjunct and its terms to the result, so
	// e.g. type({}) & {y:1} stays a type value (excluded from gen).
	mt := c.mtype || peer.markedType()
	mh := c.mhide || peer.markedHide()
	for _, t := range upeer {
		mt = mt || t.markedType()
		mh = mh || t.markedHide()
	}
	if mt {
		out.setMarkType(true)
	}
	if mh {
		out.setMarkHide(true)
	}
	// A meet flattened in leaves its riders on the whole (ADR-052).
	for _, cv := range carried {
		out = rideOn(ctx, out, cv, nil)
	}
	return out
}

// A directive's seal covers the place's own terms, not the data's (decision 44): they meet first.
func (c *ConjunctVal) apart(terms []Val, peer Val, ctx *Ctx) Val {
	if slices.ContainsFunc(terms, func(t Val) bool { _, isRef := t.(*RefVal); return isRef }) {
		c.own = true
		out := newConjunct([]Val{c, peer})
		out.path = cp(c.path)
		out.site.sp, out.site.spu, out.site.url = c.site.sp, c.site.spu, c.site.url
		out.setDc(c.dc + 1)
		return out
	}
	for _, t := range terms {
		_, isMap := t.(*MapVal)
		_, isList := t.(*ListVal)
		if !sealish(t) && !isMap && !isList {
			return nil
		}
	}
	met := c.Unify(top(), ctx)
	if _, waits := met.(*ConjunctVal); waits {
		return nil
	}
	return unite(ctx, met, peer)
}

// A bag of the data vet meets the schema with.
func dataBag(v Val) bool {
	switch b := v.(type) {
	case *MapVal:
		return b.isData
	case *ListVal:
		return b.isData
	}
	return false
}

// A bare directive still to fold, or a bag one sealed.
func sealish(t Val) bool {
	switch b := t.(type) {
	case *SealVal:
		return true
	case *MapVal:
		return b.dirSealed
	case *ListVal:
		return b.dirSealed
	}
	return bareDirective(t)
}

func sameTerms(cj *ConjunctVal, t0, t1 Val) bool {
	has := func(t Val) bool { return cj.peg[0] == t || cj.peg[1] == t }
	return 2 == len(cj.peg) && has(t0) && has(t1)
}

func bareDirective(t Val) bool {
	f, isF := t.(*FuncVal)
	return isF && ("close" == f.name || "open" == f.name) && 0 == len(f.peg)
}

func holdsRef(v Val) bool {
	found := false
	walkVals(v, func(t Val) bool {
		_, isRef := t.(*RefVal)
		found = found || isRef
		return !found
	}, map[Val]bool{})
	return found
}

// A bare directive in the argument of copy, pref or super acts where the value lands, beside the
// call (decision 46); not in a meet with a peer or beside a path, which may hold or read the data.
// An open() leaves only copy's, as the value of pref or super keeps its argument's seals.
func landed(t Val, lift bool) []Val {
	f, ok := t.(*FuncVal)
	if !lift || !ok || ("copy" != f.name && "pref" != f.name && "super" != f.name) || 1 != len(f.peg) ||
		holdsRef(f.peg[0]) {
		return []Val{t}
	}
	inner := placeTerms(f.peg[0])
	var dirs, rest []Val
	for _, u := range inner {
		if bareDirective(u) && ("copy" == f.name || "close" == u.(*FuncVal).name) {
			dirs = append(dirs, u)
		} else {
			rest = append(rest, u)
		}
	}
	if 0 == len(dirs) || 0 == len(rest) {
		return []Val{t}
	}
	arg := rest[0]
	if 1 < len(rest) {
		arg = newConjunct(rest)
	}
	call := newFunc(f.name, []Val{arg})
	call.site, call.path, call.mtype, call.mhide = f.site, f.path, f.mtype, f.mhide
	return append(dirs, call)
}

// The terms a meet holds at its place, written as a chain or not.
func placeTerms(v Val) []Val {
	cj, ok := v.(*ConjunctVal)
	if !ok {
		return landed(v, true)
	}
	var terms []Val
	for _, t := range cj.peg {
		terms = append(terms, placeTerms(t)...)
	}
	return terms
}

// norm flattens nested conjuncts and orders terms by cjo so that
// unification is order-independent (lower cjo sorts first).
func norm(terms []Val, carried *[]Val, lift bool) []Val {
	var expand []Val
	for _, t := range terms {
		if cj, ok := t.(*ConjunctVal); ok && !cj.own {
			if rides(cj) {
				*carried = append(*carried, cj)
			}
			for _, u := range cj.peg {
				expand = append(expand, landed(u, lift)...)
			}
		} else {
			expand = append(expand, landed(t, lift)...)
		}
	}
	sort.SliceStable(expand, func(i, j int) bool {
		return expand[i].cjo() < expand[j].cjo()
	})
	// A repeated waiting match adds nothing, nor a residual met again.
	seen := map[string]bool{}
	out := expand[:0]
	for _, t := range expand {
		key := ""
		if f, ok := t.(*FuncVal); ok && "match" == f.name && DONE != f.Dc() {
			key = f.Canon()
		} else if r, ok := t.(*RecurseVal); ok {
			key = "\x00" + strings.Join(r.target, "\x00")
		}
		if "" != key {
			if seen[key] {
				continue
			}
			seen[key] = true
		}
		out = append(out, t)
	}
	return out
}
