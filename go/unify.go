/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
	"strings"
)

func unite(ctx *Ctx, a, b Val) Val {
	var provPath []string
	if nil != ctx.prov {
		provPath = ctx.slot
		if nil == provPath && nil != a {
			provPath = a.vpath()
		}
	}

	out := uniteRaw(ctx, a, b)

	if nil != ctx.prov {
		ctx.prov.record(provPath, a, b, out)
	}
	if nil != out && !isTop(out) && !out.Nil() && nil == out.deprecRec() {
		var dep map[string]string
		if nil != a {
			dep = a.deprecRec()
		}
		if nil == dep && nil != b {
			dep = b.deprecRec()
		}
		if nil != dep {
			out.setDeprecRec(dep)
		}
	}
	if nil != ctx.reads && nil != out && !isTop(out) && !out.Nil() {
		if "" == out.readAddr() {
			org := ""
			if nil != a {
				org = a.readAddr()
			}
			if "" == org && nil != b {
				org = b.readAddr()
			}
			if "" != org {
				out.setReadAddr(org)
			}
		}
	}
	return out
}

func uniteRaw(ctx *Ctx, a, b Val) Val {
	// ABSENCE IS THE UNIT OF THE MEET (ADR-034). The dispatch below is
	// the LEFT operand's, so `&` commutes only if it is answered here.
	if nil != a && nil != b {
		if x, ok := a.(*AbsentVal); ok {
			return x.Unify(b, ctx)
		}
		if x, ok := b.(*AbsentVal); ok {
			return x.Unify(a, ctx)
		}
	}

	if a != nil && (b == nil || isTop(b)) && a.Dc() == DONE {
		return a
	}

	maxDepth := ctx.budgetDepth
	if 0 == maxDepth {
		maxDepth = maxUniteDepth
	}
	ctx.depth++
	defer func() { ctx.depth-- }()
	if ctx.depth > maxDepth {
		return makeNilErr(ctx, "unify_cycle", a, b)
	}

	// Scope the caller's slot hint to the single dispatched Unify call,
	// so a hint never leaks across sibling drives.
	slot := ctx.slot
	ctx.slot = nil
	drive := func(v Val, peer Val) Val {
		ctx.slot = slot
		out := v.Unify(peer, ctx)
		ctx.slot = nil
		return out
	}

	if a == nil {
		return b
	}
	if b == nil || isTop(b) {
		// No `a.Dc() == DONE` check here: the fast path at the top of the
		// function already returned for that case, so anything reaching
		// this line is not done.
		return drive(a, top())
	}
	if isTop(a) {
		ctx.slot = slot
		return unite(ctx, b, top())
	}
	if a.Nil() {
		return a
	}
	if b.Nil() {
		return b
	}
	if isConjunct(a) || isExpect(a) {
		return drive(a, b)
	}
	if isConjunct(b) || isDisjunct(b) || isPref(b) || isRef(b) || isVar(b) || isFunc(b) || isExpect(b) || isRefer(b) ||
		isGraphAtom(b) || isRecurse(b) || isDrivingOp(b) {
		return drive(b, a)
	}
	return drive(a, b)
}

const maxUniteDepth = 1000

func applyFlows(ctx *Ctx, root Val) Val {
	// NOTHING TO APPLY is the common case -- a document with no links
	// pays one map length per pass, and the walk never runs.
	if 0 == len(ctx.referflows) {
		return root
	}
	keys := make([]string, 0, len(ctx.referflows))
	for k := range ctx.referflows {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := strings.Split(key, "\x00")
		site, ok := findAt(root, path)
		if !ok { //coverage:ignore a recorded path always resolves; see above
			continue
		}
		merged := unite(ctx, site.val, ctx.referflows[key])
		switch p := site.parent.(type) {
		case *MapVal:
			p.set(site.key, merged)
		case *ListVal:
			if i, err := strconv.Atoi(site.key); nil == err {
				p.peg[i] = merged
			}
		}
	}
	return root
}

func unifyRoot(root Val, ctx *Ctx) Val {
	if root.Nil() {
		return root
	}
	if over := aliasBudget(ctx, root); nil != over {
		return over
	}
	res := root
	// The pass budget: the spec constant unless the trust profile set
	// one (ctx.budgetPasses, zero = default).
	maxcc := ctx.budgetPasses
	if 0 == maxcc {
		maxcc = 9
	}
	prevCanon := ""
	sawPrev := false
	lastCanon := ""
	sawLast := false
	settle := false
	for cc := 0; cc < maxcc && res.Dc() != DONE; cc++ {
		ctx.root = res
		ctx.depth = 0
		ctx.cc = cc

		ctx.settle = settle

		if cc == maxcc-1 {
			if sawLast {
				prevCanon = lastCanon
			} else {
				prevCanon = res.Canon()
			}
			sawPrev = true
		}

		res = unite(ctx, res, top())

		// The recorded type flows, re-applied to the tree THIS pass
		// built: a pass rebuilds subtrees, and a flow written into the
		// previous pass's tree does not survive that. Mirrors the
		// applyFlows call in the TS pass loop.
		res = applyFlows(ctx, res)

		if res.Dc() != DONE {
			nowCanon := res.Canon()
			settle = sawLast && lastCanon == nowCanon
			lastCanon = nowCanon
			sawLast = true
		}
	}
	if res.Dc() != DONE && len(ctx.err) == 0 && sawPrev && prevCanon != res.Canon() {
		// The hint names the budget and the still-refining paths
		// ({limit}/{paths}), as the TS residuePaths details do.
		paths := residuePaths(res, 4)
		joined := strings.Join(paths, " ")
		if joined == "" {
			joined = "$"
		}
		makeNilErrFull(ctx, "budget_passes", nil, nil, "resolve",
			map[string]string{"limit": strconv.Itoa(maxcc), "paths": joined})
	}
	// The settled tree's alias references canon as the values they name
	// (go/alias.go): attached once, after the last pass, from the
	// snapshot store this run kept.
	expandAliases(res, ctx.snapmap)
	ctx.root = res
	return res
}

// residuePaths is the Go twin of the TS residuePaths (ts/src/unify.ts):
// the first max non-done nodes of the residue, as $.dotted.paths,
// depth-first over bag children only.
func residuePaths(v Val, max int) []string {
	var out []string
	var visit func(n Val, isroot bool)
	visit = func(n Val, isroot bool) {
		if n == nil || max <= len(out) {
			return
		}
		if !isroot && n.Dc() != DONE {
			p := "$"
			if vp := n.vpath(); len(vp) > 0 {
				p = "$." + strings.Join(vp, ".")
			}
			out = append(out, p)
		}
		switch t := n.(type) {
		case *MapVal:
			for _, k := range t.keys {
				visit(t.peg[k], false)
			}
		case *ListVal:
			for _, e := range t.peg {
				visit(e, false)
			}
		}
	}
	visit(v, true)
	return out
}

// isDrivingOp: an op DRIVES while it holds a placeholder hole (G8
// phase 3, see place.go) or an operand that has not decided.
func isDrivingOp(v Val) bool {
	_, ok := v.(*PlusOpVal)
	return ok && (hasPlace(v) || holdsStaged(v))
}
