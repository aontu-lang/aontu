/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"slices"
	"strings"
)

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
	node := walkPlace(ctx.root, r.target)
	if nil == node {
		node = walkPlace(ctx.fixroot, r.target)
	}
	// A hide() or type() still to settle marks the definition, not what a use of it unfolds.
	for fv, ok := node.(*FuncVal); ok && pendingMarkWrapper(fv) && 0 < len(fv.peg); fv, ok = node.(*FuncVal) {
		node = fv.peg[0]
	}
	return node
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

// walkPlace is walkTarget in a tree still unifying: it reads a list's element, and through a
// seal or a hide() or type() still to settle, as a path does.
func walkPlace(root Val, at []string) Val {
	node := root
	for _, seg := range at {
		switch n := unmarked(node).(type) {
		case *MapVal:
			node = n.peg[seg]
		case *ListVal:
			idx, ok := listIndex(seg)
			if !ok || len(n.peg) <= idx {
				return nil
			}
			node = n.peg[idx]
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

func unmarked(v Val) Val {
	v = throughWrap(v)
	if fv, ok := v.(*FuncVal); ok && pendingMarkWrapper(fv) && 0 < len(fv.peg) {
		return throughWrap(fv.peg[0])
	}
	return v
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

	concrete := false
	switch peer.(type) {
	case *MapVal, *ListVal, *ScalarVal, *ScalarKindVal, *MapKindVal, *ListKindVal:
		concrete = true
	}

	// Its own expansion's copy is not data: decision 7 of sketch/DEFINITION.0.md section 7.
	key := strings.Join(r.target, "\x00")
	if concrete && key == peer.copiedBy() {
		return r
	}

	// CONCRETE STRUCTURE, or a kind, which picks the body's branch as
	// structure does: expand one level against it.
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
			out.waits = true
			return out
		}
		level := undeclared(instanceClone(bodyv, cp(r.path)))
		forceRootPath(level, cp(r.path))
		// A body that sits deeper than this place takes its paths from the place, as a copy does.
		if at := bodyv.vpath(); len(r.path) < len(at) && !slices.Contains(at, "&") {
			setPaths(level, cp(r.path))
		}
		walkMark(level, true, false, true, false)
		walkMarkVals(level, func(n Val) { n.setCopiedBy(key) })
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
	return reachesRecurse(v, target, depth, nil, map[string]bool{}, false)
}

// reachesRecurse follows each alias v names too, given the root.
func reachesRecurse(v Val, target []string, depth int, root Val, seen map[string]bool, links bool) bool {
	if nil == v || 8 < depth {
		return false
	}
	v = unmarked(v)
	switch n := v.(type) {
	case *RecurseVal:
		same := len(n.target) == len(target)
		for i := 0; same && i < len(target); i++ {
			same = n.target[i] == target[i]
		}
		// Another definition's residual reaches what that definition reaches.
		if key := strings.Join(n.target, "\x00"); !same && nil != root && !seen[key] {
			seen[key] = true
			return reachesRecurse(walkPlace(root, n.target), target, depth+1, root, seen, links)
		}
		return same
	case *RefVal:
		same := len(n.peg) == len(target)
		for i, p := range n.peg {
			seg, ok := p.(string)
			same = same && ok && seg == target[i]
		}
		if same || nil == root {
			return same
		}
		// A path reaches what its target reaches, as a name does.
		at := n.namedPlace()
		if key := strings.Join(at, "\x00"); nil != at && !seen[key] {
			seen[key] = true
			return reachesRecurse(walkPlace(root, at), target, depth+1, root, seen, links)
		}
		return false
	case *MapVal:
		for _, k := range n.keys {
			if reachesRecurse(n.peg[k], target, depth+1, root, seen, links) {
				return true
			}
		}
		if nil != n.spread && reachesRecurse(n.spread, target, depth+1, root, seen, links) {
			return true
		}
	case *ListVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen, links) {
				return true
			}
		}
		if nil != n.spread && reachesRecurse(n.spread, target, depth+1, root, seen, links) {
			return true
		}
	case *ConjunctVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen, links) {
				return true
			}
		}
	case *DisjunctVal:
		for _, e := range n.peg {
			if reachesRecurse(e, target, depth+1, root, seen, links) {
				return true
			}
		}
	}
	// A link's template is part of a name's body: the name inside it makes the body recursive.
	if name := aliasBareName(target[0]); links || (1 == len(target) && aliasRe.FindString(name) == name) {
		for _, t := range linkTemplates(v) {
			if reachesRecurse(t, target, depth+1, root, seen, links) {
				return true
			}
		}
	}
	return false
}

// The place a name or an absolute path of plain steps names.
func (rv *RefVal) namedPlace() []string {
	if key, ok := rv.aliasKey(); ok {
		return []string{key}
	}
	if !rv.absolute || 0 == len(rv.peg) {
		return nil
	}
	at := make([]string, len(rv.peg))
	for i, p := range rv.peg {
		seg, ok := p.(string)
		if !ok {
			return nil
		}
		at[i] = seg
	}
	return at
}

// The templates a relate() call, a relation or a link holds.
func linkTemplates(v Val) []Val {
	switch n := v.(type) {
	case *FuncVal:
		if "relate" == n.name {
			return n.peg
		}
	case *RelateVal:
		return []Val{n.tval}
	case *PendingLinkVal:
		return []Val{n.tval}
	case *ScalarVal:
		return n.lk.relates
	}
	return nil
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
