/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


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
	r.site.sp = unsited
	// A settled residual: a type() body carrying one must settle, and
	// an unmet recursion is its own value until data arrives.
	r.dc = DONE
	return r
}

// LAST in a conjunct fold, after even the graph atoms: the residual
// wants to see the assembled concrete structure it expands against.
func (r *RecurseVal) cjo() int      { return 47000 }
func (r *RecurseVal) superior() Val { return top() }

func (r *RecurseVal) body(ctx *Ctx) Val {
	if nil == ctx {
		return nil
	}
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
		level := clonePath(bodyv, cp(r.path))
		walkMark(level, true, false, true, false)
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
	var texts map[string]string
	if nil != ctx {
		src, file, texts = ctx.src, ctx.file, ctx.texts
	}
	return nil, &AontuError{Msg: n.FullMessage(src, file, texts), Code: "recursion_unexpanded"}
}

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
	case *RefVal:
		if n.rxc < xc {
			n.rxc = xc
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
