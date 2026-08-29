/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE RECURSIVE RESIDUAL (docs/design/RECURSION.0.md; the Go side of
// ts/src/val/RecurseVal.ts): where RefVal's prefix test used to
// answer `path_cycle` for a self-reference -- `$.Node` written
// anywhere inside `Node` -- it now answers this value: a deferred
// reference carrying the target path, exactly as a constraint atom
// carries its bound. No new syntax: the reference the author wrote
// simply MEANS the fixpoint.
//
// The three moments of every residual: at unification, EXPAND ONE
// LEVEL PER MEET WITH STRUCTURE (per destination, under ADR-005's
// clone discipline; data is finite, so expansion terminates, with the
// depth budget as backstop); in canon and the aon1- hash, SYMBOLIC
// (the mu-form, finite and round-tripping); at generation, an
// unexpanded residual in a demanded position refuses with
// recursion_unexpanded -- guardedness is EMERGENT (next?: drops,
// *null | $.Node generates).

import "strings"

type RecurseVal struct {
	base
	// The target path, absolute from the root, as the reference
	// spelled it.
	target []string
	// Expansion depth so far along this chain, charged against the
	// depth budget (the T-1 backstop).
	xc int
}

func newRecurse(target []string, xc int) *RecurseVal {
	r := &RecurseVal{target: target, xc: xc}
	r.sp = unsited
	// A settled residual: a type() body carrying one must settle, and
	// an unmet recursion is its own value until data arrives.
	r.dc = DONE
	return r
}

// LAST in a conjunct fold, after even the graph atoms: the residual
// wants to see the assembled concrete structure it expands against.
func (r *RecurseVal) cjo() int      { return 47000 }
func (r *RecurseVal) superior() Val { return top() }

// body is the schema value the target names, from the ROOT: the
// fixpoint is over the finished definition, and the definition's own
// residual keeps it finite.
func (r *RecurseVal) body(ctx *Ctx) Val {
	if nil == ctx {
		return nil
	}
	// The root walk first; when the residual was LIFTED out of its
	// defining tree (vet's anchored meet), the root does not contain
	// the target, and ctx.fixroot is the settled tree the lifter kept
	// for exactly this walk.
	if node := walkTarget(ctx.root, r.target); nil != node {
		return node
	}
	return walkTarget(ctx.fixroot, r.target)
}

// walkTarget descends a tree by the residual's absolute target path,
// answering the definition node or nil.
func walkTarget(root Val, target []string) Val {
	node := root
	for _, seg := range target {
		switch n := node.(type) {
		case *MapVal:
			node = n.peg[seg]
		default:
			return nil
		}
	}
	return node
}

func (r *RecurseVal) sameTarget(p *RecurseVal) bool {
	if len(r.target) != len(p.target) {
		return false
	}
	for i, s := range r.target {
		if s != p.target[i] {
			return false
		}
	}
	return true
}

func (r *RecurseVal) Unify(peer Val, ctx *Ctx) Val {
	// The self-drive: nothing to advance -- the residual waits for
	// structure. (A nil-valued peer never arrives; unite's ladder
	// absorbs it.)
	if nil == peer || isTop(peer) {
		return r
	}

	// The same fixpoint twice is one fixpoint; different targets --
	// mutual recursion meeting -- are BOTH held, each expanding as
	// data arrives, through the fold that keeps a conjunct's members
	// separate.
	if pr, ok := peer.(*RecurseVal); ok {
		if r.sameTarget(pr) {
			return r
		}
		out := newConjunct([]Val{r, peer})
		copyMarks(out, r)
		out.path = cp(r.path)
		return out
	}

	// CONCRETE STRUCTURE: expand one level against it.
	concrete := false
	switch peer.(type) {
	case *MapVal, *ListVal, *ScalarVal:
		concrete = true
	}
	if concrete {
		maxDepth := ctx.budgetDepth
		if 0 == maxDepth {
			maxDepth = maxUniteDepth
		}
		if maxDepth <= r.xc {
			return makeNilErrFull(ctx, "recursion_budget", r, peer, "recurse",
				map[string]string{"target": "$." + strings.Join(r.target, ".")})
		}
		bodyv := r.body(ctx)
		if nil == bodyv {
			// The definition has not assembled yet (an early pass):
			// hold the peer beside the residual and try again when it
			// has.
			out := newConjunct([]Val{r, peer})
			copyMarks(out, r)
			out.path = cp(r.path)
			return out
		}
		// ADR-005's clone discipline: the expansion is a
		// per-destination instantiation, so the definition itself is
		// never written into. The clone's type/hide marks are CLEARED
		// at every depth, exactly as a plain reference copy clears
		// them: the schema is hidden, the instances it expands into
		// are the output.
		level := clonePath(bodyv, cp(r.path))
		walkMark(level, true, false, true, false)
		walkClearEntity(level)
		bumpRecurse(level, r.xc+1)
		return unite(ctx, level, peer)
	}

	// Anything else -- a func still resolving, a reference, a
	// constraint -- waits beside the residual.
	out := newConjunct([]Val{r, peer})
	copyMarks(out, r)
	out.path = cp(r.path)
	return out
}

func (r *RecurseVal) Canon() string {
	return "$." + strings.Join(r.target, ".")
}

func (r *RecurseVal) Gen(ctx *Ctx) (any, error) {
	// An unexpanded residual in a demanded position refuses;
	// guardedness is emergent -- under an optional key the bag's
	// isolated context swallows this and drops the key.
	n := makeNilErrFull(ctx, "recursion_unexpanded", r, nil, "recurse",
		map[string]string{"target": "$." + strings.Join(r.target, ".")})
	if nil != ctx && ctx.collect {
		return nil, nil
	}
	src, file := "", ""
	if nil != ctx {
		src, file = ctx.src, ctx.file
	}
	return nil, &AontuError{Msg: n.FullMessage(src, file), Code: "recursion_unexpanded"}
}

// containsRecurseOf answers whether a definition holds a residual of
// the given target -- i.e. the definition is (transitively) the
// fixpoint that target names. A reference RESOLVING to such a
// definition must itself answer the residual: cloned instead, every
// reparse of a canon unrolled the schema one more level and canon
// never converged.
func containsRecurseOf(v Val, target []string, depth int) bool {
	if nil == v || 8 < depth {
		return false
	}
	switch n := v.(type) {
	case *RecurseVal:
		if len(n.target) != len(target) {
			return false
		}
		for i, s := range n.target {
			if s != target[i] {
				return false
			}
		}
		return true
	case *RefVal:
		// A RAW REFERENCE to the target IS the recursion, minted or
		// not: the answer must not depend on whether the definition's
		// own prefix position has been visited yet. Without this arm
		// the answer was ORDER-DEPENDENT -- reparsing a generated
		// canon puts the instance before the definition, its trailing
		// `$.spec.Step` leaves resolved before `Step.then` had minted,
		// and each resolve cloned one more unrolled level until the
		// unify depth guard (unify_cycle) killed the document.
		if len(n.peg) != len(target) {
			return false
		}
		for i, p := range n.peg {
			seg, ok := p.(string)
			if !ok || seg != target[i] {
				return false
			}
		}
		return true
	case *MapVal:
		for _, k := range n.keys {
			if containsRecurseOf(n.peg[k], target, depth+1) {
				return true
			}
		}
		if nil != n.spread && containsRecurseOf(n.spread, target, depth+1) {
			return true
		}
	case *ListVal:
		for _, e := range n.peg {
			if containsRecurseOf(e, target, depth+1) {
				return true
			}
		}
		if nil != n.spread && containsRecurseOf(n.spread, target, depth+1) {
			return true
		}
	case *ConjunctVal:
		for _, e := range n.peg {
			if containsRecurseOf(e, target, depth+1) {
				return true
			}
		}
	case *DisjunctVal:
		for _, e := range n.peg {
			if containsRecurseOf(e, target, depth+1) {
				return true
			}
		}
	}
	return false
}

func isRecurse(v Val) bool {
	_, ok := v.(*RecurseVal)
	return ok
}

// bumpRecurse stamps the expansion depth onto every residual inside a
// freshly cloned level, so descent is charged along the chain.
func bumpRecurse(v Val, xc int) {
	switch n := v.(type) {
	case *RecurseVal:
		if n.xc < xc {
			n.xc = xc
		}
	case *MapVal:
		for _, k := range n.keys {
			bumpRecurse(n.peg[k], xc)
		}
		if nil != n.spread {
			bumpRecurse(n.spread, xc)
		}
	case *ListVal:
		for _, e := range n.peg {
			bumpRecurse(e, xc)
		}
		if nil != n.spread {
			bumpRecurse(n.spread, xc)
		}
	case *ConjunctVal:
		for _, e := range n.peg {
			bumpRecurse(e, xc)
		}
	}
}
