/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// ConjunctVal is the unification (&) of its terms.
type ConjunctVal struct {
	base
	peg []Val
}

func newConjunct(terms []Val) *ConjunctVal {
	c := &ConjunctVal{peg: terms}
	c.sp = -1
	return c
}

func (c *ConjunctVal) cjo() int      { return 40000 }
func (c *ConjunctVal) superior() Val { return top() }

func (c *ConjunctVal) Canon() string {
	parts := make([]string, len(c.peg))
	for i, t := range c.peg {
		parts[i] = junctChildCanon(t)
	}
	return strings.Join(parts, "&")
}

// junctChildCanon renders a junction child, parenthesising a child
// that is itself a junction with more than one term — the TS
// JunctionVal.canon rule — so nested structure survives in the text:
// `(1|2)&3` canons as `(1|2)&3`, not the differently-parsing `1|2&3`.
// Post-unification junctions are flattened by norm, so parens appear
// only where real nesting remains (parse-level canon, issue #30).
func junctChildCanon(v Val) string {
	switch t := v.(type) {
	case *ConjunctVal:
		if len(t.peg) > 1 {
			return "(" + t.Canon() + ")"
		}
	case *DisjunctVal:
		if len(t.peg) > 1 {
			return "(" + t.Canon() + ")"
		}
	}
	return v.Canon()
}

func (c *ConjunctVal) Gen(ctx *Ctx) (any, error) {
	// A RESIDUATED SIZING ATOM DECIDES HERE (the review's finding C,
	// use-cases/BUGS.md §16). `length`/`unique` over a container keep
	// the readings that more members could still change rather than
	// deciding against whatever the container held when it first
	// settled. Generation is where no more members can arrive, so it is
	// where the provisional reading becomes the verdict: the container
	// generates if the atom is satisfied, and the atom's OWN refusal is
	// raised if it is not -- the constraint's message being the one the
	// author needs, not a generic `conjunct`. Mirrors ConjunctVal.gen in
	// ts/src/val/ConjunctVal.ts.
	if con, bag, ok := sizingResidue(c); ok {
		settled := con.settleContainer(bag, ctx)
		if n, isNil := settled.(*NilVal); isNil {
			// Recorded on the context first and RAISED only when the
			// context is not collecting -- the residueErr discipline, so
			// a collecting caller (vet, the verbs) reads the refusal off
			// the context and a bare evaluation throws it.
			if nil != ctx {
				ctx.adderr(n)
				if ctx.collect {
					return nil, nil
				}
				return nil, &AontuError{
					Msg: n.FullMessage(ctx.src, ctx.file), Code: n.why}
			}
			return nil, &AontuError{Msg: n.FullMessage("", ""), Code: n.why}
		}
		return settled.Gen(ctx)
	}

	// An unresolved conjunct is not a concrete value. Code mirrors TS
	// ConjunctVal.gen ('conjunct').
	return nil, residueErr(ctx, c, "conjunct")
}

func (c *ConjunctVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	// The conjunct's members are driven at the conjunct's own location
	// (TS folds with the same undescended ctx).
	slot := ctx.slot

	terms := norm(c.peg)
	done := true

	// Unify each term against the peer.
	upeer := make([]Val, len(terms))
	for i, t := range terms {
		if t.Dc() == DONE && isTop(peer) {
			upeer[i] = t
		} else {
			ctx.slot = slot
			upeer[i] = unite(ctx, t, peer)
		}
		if upeer[i].Dc() != DONE {
			done = false
		}
		if upeer[i].Nil() {
			return upeer[i]
		}
	}

	upeer = norm(upeer)

	// Fold the terms together left to right.
	var outvals []Val
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
		if val.Dc() != DONE {
			done = false
		}
		if _, ok := val.(*ConjunctVal); ok {
			// Could not merge t0 and t1; keep t0, advance.
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
		out = nc
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
	return out
}

// norm flattens nested conjuncts and orders terms by cjo so that
// unification is order-independent (lower cjo sorts first).
func norm(terms []Val) []Val {
	var expand []Val
	for _, t := range terms {
		if cj, ok := t.(*ConjunctVal); ok {
			expand = append(expand, cj.peg...)
		} else {
			expand = append(expand, t)
		}
	}
	sort.SliceStable(expand, func(i, j int) bool {
		return expand[i].cjo() < expand[j].cjo()
	})
	return expand
}
