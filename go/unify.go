/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"slices"
	"sort"
	"strconv"
	"strings"
)

// A bare hole as a spread's template leads its meet: it is the member.
func meetTemplate(ctx *Ctx, member, tmpl Val) Val {
	if _, ok := tmpl.(*PlaceVal); ok && !ctx.matchRead {
		return unite(ctx, tmpl, member)
	}
	return unite(ctx, member, tmpl)
}

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
	if nil != out && !out.Nil() {
		out = rideOn(out, a, b)
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
		// No `a.Dc() == DONE` check: the fast path at the top already
		// returned for that case, so nothing reaching here is done.
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
	if drives(b) {
		return drive(b, a)
	}
	// These answer from either side, but a hole in a match matches nothing.
	switch b.(type) {
	case *ConstraintKindVal, *EmptyVal, *SealVal:
		if !drives(a) {
			return drive(b, a)
		}
	case *PlaceVal:
		if !drives(a) && !ctx.matchRead {
			return drive(b, a)
		}
	}
	return drive(a, b)
}

func drives(v Val) bool {
	return isConjunct(v) || isDisjunct(v) || isPref(v) || isRef(v) || isVar(v) || isFunc(v) ||
		isExpect(v) || isRefer(v) || isGraphAtom(v) || isRecurse(v) || isDrivingOp(v)
}

const maxUniteDepth = 1000

// linkSite is a link the output takes, where it stands, and how to put a
// value in its place.
type linkSite struct {
	link *ScalarVal
	at   []string
	put  func(Val)
}

// linksOf is the links a result holds where the output reads them:
// through maps, lists, marks and meets, the value a preference stands
// as, and the arms of a disjunction the rank rule picks, those of the
// lowest rank where any has one and every arm where none has. A
// spread's template holds no position, so its links are its members'.
func linksOf(root Val) []linkSite {
	var out []linkSite
	var visit func(n Val, put func(Val), at []string)
	visit = func(n Val, put func(Val), at []string) {
		switch v := n.(type) {
		case *ScalarVal:
			if nil != v.lk.to {
				out = append(out, linkSite{v, at, put})
			}
		case *MapVal:
			for _, k := range v.keys {
				k := k
				visit(v.peg[k], func(x Val) { v.peg[k] = x }, append(cp(at), k))
			}
		case *ListVal:
			for i := range v.peg {
				i := i
				visit(v.peg[i], func(x Val) { v.peg[i] = x }, append(cp(at), itoa(i)))
			}
		case *ConjunctVal:
			for i := range v.peg {
				i := i
				visit(v.peg[i], func(x Val) { v.peg[i] = x }, at)
			}
		case *DisjunctVal:
			rank := -1
			for _, a := range v.peg {
				if p, ok := a.(*PrefVal); ok && (0 > rank || p.rank < rank) {
					rank = p.rank
				}
			}
			for i, a := range v.peg {
				p, ok := a.(*PrefVal)
				if 0 > rank || (ok && rank == p.rank) {
					i := i
					visit(a, func(x Val) { v.peg[i] = x }, at)
				}
			}
		case *PrefVal:
			visit(v.peg, func(x Val) { v.peg = x }, at)
		case *GraphAtomVal:
			if nil != v.held {
				visit(v.held, func(x Val) { v.held = x }, at)
			}
		}
	}
	visit(root, func(Val) {}, nil)
	return out
}

// flowID: a template is the same as another only with the same
// templates in the links it holds, which its canon leaves out.
func flowID(key string, t Val, open map[Val]bool) string {
	if open[t] { //coverage:ignore a template is made before the link that carries it
		return key
	}
	open[t] = true
	var inner []string
	for _, l := range linksOf(t) {
		for _, f := range l.link.lk.flows {
			inner = append(inner, flowID(f.key, f.t, open))
		}
	}
	delete(open, t)
	sort.Strings(inner)
	id := key + "\x01" + t.Canon()
	if 0 < len(inner) {
		id += "\x02" + strings.Join(inner, "\x03")
	}
	return id
}

type flowAt struct {
	to []string
	t  Val
	id string
}

// flowsOf is the templates of the links the output takes whose targets
// the result holds, each once, in a fixed order.
func flowsOf(root Val, links []linkSite) []flowAt {
	seen := map[string]flowAt{}
	for _, l := range links {
		for _, f := range l.link.lk.flows {
			id := flowID(f.key, f.t, map[Val]bool{})
			to := strings.Split(f.key, "\x00")
			if _, dup := seen[id]; !dup {
				if _, ok := findAt(root, to); ok {
					seen[id] = flowAt{to, f.t, id}
				}
			}
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]flowAt, 0, len(ids))
	for _, id := range ids {
		out = append(out, seen[id])
	}
	return out
}

// flowDoc is what meets each template at its target and asks nothing
// else: an open map holding the step's key as optional, or a list
// holding `any` before the step's position, as the result holds the
// container, down to the template.
func flowDoc(root Val, flows []flowAt, depth int) Val {
	var here []Val
	var below []flowAt
	for _, f := range flows {
		if depth == len(f.to) {
			here = append(here, instanceClone(f.t, f.t.vpath()))
		} else {
			below = append(below, f)
		}
	}
	if 0 < len(below) {
		var steps []string
		for _, f := range below {
			if !slices.Contains(steps, f.to[depth]) {
				steps = append(steps, f.to[depth])
			}
		}
		path := cp(below[0].to[:depth])
		inner := func(k string) Val {
			var sub []flowAt
			for _, f := range below {
				if k == f.to[depth] {
					sub = append(sub, f)
				}
			}
			at, _ := findAt(root, []string{k})
			return flowDoc(at.val, sub, depth+1)
		}
		if _, ok := root.(*ListVal); ok {
			last := 0
			for _, k := range steps {
				i, _ := strconv.Atoi(k)
				last = max(last, i)
			}
			items := make([]Val, 0, last+1)
			for i := 0; i <= last; i++ {
				if slices.Contains(steps, itoa(i)) {
					items = append(items, inner(itoa(i)))
				} else {
					items = append(items, top())
				}
			}
			l := newList(items)
			l.path = path
			here = append(here, l)
		} else {
			m := newMap()
			for _, k := range steps {
				m.set(k, inner(k))
			}
			m.optional = steps
			m.path = path
			here = append(here, m)
		}
	}
	if 1 == len(here) {
		return here[0]
	}
	return newConjunct(here)
}

// holdsLink is whether a tree holds a link anywhere, so that its
// evaluation has to start again with templates met in.
func holdsLink(v Val, seen map[Val]bool) bool {
	if nil == v || seen[v] {
		return false
	}
	seen[v] = true
	var kids []Val
	switch n := v.(type) {
	case *ReferVal, *RelVal:
		return true
	case *ScalarVal:
		return nil != n.lk.to
	case *FuncVal:
		if "refer" == n.name || "rel" == n.name {
			return true
		}
		kids = n.peg
	case *MapVal:
		for _, k := range n.keys {
			kids = append(kids, n.peg[k])
		}
		kids = append(kids, n.spread)
	case *ListVal:
		kids = append(append(kids, n.peg...), n.spread)
	case *ConjunctVal:
		kids = n.peg
	case *DisjunctVal:
		kids = n.peg
	case *PlusOpVal:
		kids = n.peg
	case *PrefVal:
		kids = []Val{n.peg}
	}
	for _, k := range kids {
		if holdsLink(k, seen) {
			return true
		}
	}
	return false
}

func unifyRoot(root Val, ctx *Ctx) Val {
	if root.Nil() {
		return root
	}
	ctx.trialsOf()
	if over := aliasBudget(ctx, root); nil != over {
		return over
	}
	if nil == ctx.snapmap {
		ctx.snapmap = map[string]Val{}
	}
	res := root
	// The pass budget: the spec constant unless the trust profile set
	// one (ctx.budgetPasses, zero = default).
	maxcc := ctx.budgetPasses
	if 0 == maxcc {
		maxcc = 9
	}
	// A document with links is evaluated in rounds: each round the
	// document as written, with the templates of the links the last
	// round's output takes met at their targets, until no template is
	// new. A copy of the first tree is kept for the rounds after it.
	errBase := len(ctx.err)
	var pristine Val
	if holdsLink(root, map[Val]bool{}) {
		pristine = instanceClone(root, root.vpath())
	}
	applied := ""
	var links []linkSite
	for round := 0; ; round++ {
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

		links = linksOf(res)
		var flows []flowAt
		if nil != pristine {
			flows = flowsOf(res, links)
		}
		ids := make([]string, 0, len(flows))
		for _, f := range flows {
			ids = append(ids, f.id)
		}
		now := strings.Join(ids, "\n")
		if now == applied {
			break
		}
		if maxcc <= round {
			if 0 == len(ctx.err) {
				sent := strings.Split(applied, "\n")
				var paths []string
				for _, f := range flows {
					p := "$." + strings.Join(f.to, ".")
					if !slices.Contains(sent, f.id) && !slices.Contains(paths, p) {
						paths = append(paths, p)
					}
				}
				makeNilErrFull(ctx, "budget_passes", nil, nil, "resolve",
					map[string]string{"limit": strconv.Itoa(maxcc), "paths": strings.Join(paths, " ")})
			}
			break
		}
		applied = now
		ctx.err = ctx.err[:errBase]
		ctx.snapmap = map[string]Val{}
		res = newConjunct([]Val{instanceClone(pristine, pristine.vpath()), flowDoc(res, flows, 0)})
	}

	// A link the output takes names something the document holds.
	for _, l := range links {
		if _, ok := findAt(res, l.link.lk.to); !ok {
			code := l.link.lk.code
			if "" == code {
				code = "refer_unresolved"
			}
			n := makeNilErrFull(ctx, code, l.link, nil, "refer",
				map[string]string{"addr": l.link.peg.(string)})
			n.path = l.at
			l.put(n)
		}
	}

	// The settled tree's alias references canon as the values they name
	// (go/alias.go): attached once, after the last pass, from the
	// snapshot store this run kept.
	expandAliases(res, ctx.snapmap, ctx.err)
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
	return ok && (waitsOnHole(v) || holdsStaged(v))
}
