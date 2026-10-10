/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import "strings"

type RecurseVal struct {
	base
	// The target path, absolute from the root, as the reference spelled it.
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
		switch n := throughRider(node).(type) {
		case *MapVal:
			node = n.peg[seg]
		case *ConjunctVal:
			node = declaration(n, seg)
		default:
			return nil
		}
		if nil == node {
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
	// The self-drive: the residual waits for structure. A nil-valued
	// peer never arrives; unite's ladder absorbs it.
	if nil == peer || isTop(peer) {
		return r
	}

	if pr, ok := peer.(*RecurseVal); ok && r.sameTarget(pr) {
		return r
	}

	// A disjunction distributes over the residual, branch by branch.
	if dj, ok := peer.(*DisjunctVal); ok {
		return dj.Unify(r, ctx)
	}

	// CONCRETE STRUCTURE, or a kind, which picks the body's branch as
	// structure does: expand one level against it.
	concrete := false
	switch peer.(type) {
	case *MapVal, *ListVal, *ScalarVal, *ScalarKindVal, *MapKindVal, *ListKindVal:
		concrete = true
	}
	if concrete {
		maxDepth := ctx.budgetDepth
		if 0 == maxDepth {
			maxDepth = maxUniteDepth
		}
		if maxDepth <= r.xc {
			return makeNilErrFull(ctx, "recursion_budget", r, peer, "recurse",
				map[string]string{"target": r.targetSpelling()})
		}
		bodyv := r.body(ctx)
		if nil == bodyv {
			// The definition has not assembled yet (an early pass): wait.
			out := newConjunct([]Val{r, peer})
			copyMarks(out, r)
			out.path = cp(r.path)
			return out
		}
		level := undeclared(instanceClone(bodyv, cp(r.path)))
		forceRootPath(level, cp(r.path))
		walkMark(level, true, false, true, false)
		bumpRecurse(level, r.xc+1)
		return unite(ctx, level, peer)
	}

	// Anything else waits beside the residual, and beside a settled
	// peer the meet is settled until data arrives.
	out := newConjunct([]Val{r, peer})
	copyMarks(out, r)
	out.path = cp(r.path)
	if DONE == peer.Dc() {
		out.setDc(DONE)
	}
	return out
}

func (r *RecurseVal) targetSpelling() string {
	segs := make([]string, len(r.target))
	for i, seg := range r.target {
		segs[i] = aliasPathSegment(seg)
	}
	// A residual spells as the reference that made it, an alias by name.
	if 1 == len(segs) && aliasNameRe.MatchString(segs[0]) {
		return segs[0]
	}
	return "$." + strings.Join(segs, ".")
}

func (r *RecurseVal) Canon() string {
	return r.targetSpelling()
}

func (r *RecurseVal) Gen(ctx *Ctx) (any, error) {
	// An unexpanded residual in a demanded position refuses;
	// guardedness is emergent -- under an optional key the bag's
	// isolated context swallows this and drops the key.
	n := makeNilErrFull(ctx, "recursion_unexpanded", r, nil, "recurse",
		map[string]string{"target": r.targetSpelling()})
	if nil != ctx {
		return nil, nil
	}
	return nil, &AontuError{Msg: n.FullMessage("", "", nil), Code: "recursion_unexpanded"}
}

func containsRecurseOf(v Val, target []string, depth int) bool {
	return reachesRecurse(v, target, depth, nil, map[string]bool{})
}

// reachesRecurse follows each alias v names too, given the root.
func reachesRecurse(v Val, target []string, depth int, root Val, seen map[string]bool) bool {
	if nil == v || 8 < depth {
		return false
	}
	v = throughRider(v)
	switch n := v.(type) {
	case *RecurseVal:
		same := len(n.target) == len(target)
		for i := 0; same && i < len(target); i++ {
			same = n.target[i] == target[i]
		}
		// Another alias's residual reaches what its declaration reaches.
		if !same && nil != root && 1 == len(n.target) && !seen[n.target[0]] {
			if name := aliasBareName(n.target[0]); aliasRe.FindString(name) == name {
				seen[n.target[0]] = true
				return reachesRecurse(walkTarget(root, n.target), target, depth+1, root, seen)
			}
		}
		return same
	case *RefVal:
		same := len(n.peg) == len(target)
		for i, p := range n.peg {
			seg, ok := p.(string)
			same = same && ok && seg == target[i]
		}
		if key, ok := n.aliasKey(); !same && ok && nil != root && !seen[key] {
			seen[key] = true
			return reachesRecurse(walkTarget(root, []string{key}), target, depth+1, root, seen)
		}
		return same
	case *MapVal:
		for _, k := range n.keys {
			if reachesRecurse(n.peg[k], target, depth+1, root, seen) {
				return true
			}
		}
		if nil != n.spread && reachesRecurse(n.spread, target, depth+1, root, seen) {
			return true
		}
	case *ListVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen) {
				return true
			}
		}
		if nil != n.spread && reachesRecurse(n.spread, target, depth+1, root, seen) {
			return true
		}
	case *ConjunctVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen) {
				return true
			}
		}
	case *DisjunctVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen) {
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
