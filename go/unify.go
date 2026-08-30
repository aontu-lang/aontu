/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
	"strings"
)

// unite is the binary unification dispatcher, mirroring the TS
// `unite` in ts/src/unify.ts (minus cycle-detection, which the core
// subset does not need without references). TOP is the unit element;
// complex Vals (conjunct/disjunct/pref) drive their own unify.
func unite(ctx *Ctx, a, b Val) Val {
	// The path this meet happens at, read BEFORE uniteRaw scopes the
	// slot hint away. The slot is the TS ctx.path equivalent; with no
	// hint, a value sits at its own stored path (the same fallback
	// MapVal.Unify makes).
	var provPath []string
	if nil != ctx.prov {
		provPath = ctx.slot
		if nil == provPath && nil != a {
			provPath = a.vpath()
		}
	}

	out := uniteRaw(ctx, a, b)

	// The provenance record (G7 phase 4), at the one place every meet
	// passes through — the same reason the deprecation rider below
	// lives here. Off by default: an uninstrumented run pays one nil
	// check, and an instrumented one pays site materialisation
	// knowingly.
	if nil != ctx.prov {
		ctx.prov.record(provPath, a, b, out)
	}
	// The deprecation record survives EVERY meet (G3 phase 4): the
	// boolean marks have their own sweeps (conjunct, the bag walks),
	// but a record lost in one meet shape is a use the tooling never
	// warns about, so it rides here, at the one place all meets pass
	// through. First record wins; TOP and nil stay clean (TOP is the
	// unit, and an error needs no deprecation). Mirrors the rider at
	// the tail of unite in ts/src/unify.ts.
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
	return out
}

func uniteRaw(ctx *Ctx, a, b Val) Val {
	// Fast path, ABOVE the depth counter: a value that is already done,
	// unified with TOP, is itself. The TS unite has the same shape --
	// its fast paths return before its counter increments -- and the
	// counters have to charge the same entries or the shared depth
	// budget bites at different documents in the two ports. Counting it
	// here cost one frame per document (the scalar leaf of a nested
	// bag), which is exactly the constant-1 offset issue #46 recorded.
	if a != nil && (b == nil || isTop(b)) && a.Dc() == DONE {
		return a
	}

	// Bound recursion to break reference cycles (the TS unite uses a
	// per-path seen-map with its revisit constant; a depth guard is
	// sufficient here). The bound is the depth budget: the spec constant
	// unless the trust profile set one (ctx.budgetDepth, zero = default).
	maxDepth := ctx.budgetDepth
	if 0 == maxDepth {
		maxDepth = maxUniteDepth
	}
	ctx.depth++
	defer func() { ctx.depth-- }()
	if ctx.depth > maxDepth {
		return makeNilErr(ctx, "unify_cycle", a, b)
	}

	// Scope the caller's slot hint to the single dispatched Unify call:
	// nested unites inside that Unify see only the slots the Unify
	// itself sets, and a hint never leaks across sibling drives.
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
	// The refer residual (G4 phase 2) DRIVES, like the other residuals
	// here: its peer is a plain string, which knows nothing about entity
	// addresses, so letting the string drive would drop the address and
	// leave the constraint standing. Mirrors the same arm in
	// ts/src/unify.ts.
	// An operator holding a HOLE (G8 phase 3) drives for the same
	// reason: its peer is what FILLS it, and a scalar asked to unify
	// with `_ + 2` sees an operator rather than a hole and refuses it
	// on kind. Narrow to placeheld operators on purpose -- every other
	// operator meets its peer the way it always has, through the
	// conjunct fold that drives it.
	// A graph atom DRIVES (RELATIONS P2): its peer is the value it
	// carries -- a container, a rel, a scalar -- and none of them know
	// the atom; the atom knows to absorb.
	if isConjunct(b) || isDisjunct(b) || isPref(b) || isRef(b) || isVar(b) || isFunc(b) || isExpect(b) || isRefer(b) ||
		isGraphAtom(b) || isRecurse(b) || isPlaceheldOp(b) {
		return drive(b, a)
	}
	return drive(a, b)
}

// Structural recursion budget: how deep unite may nest before the
// evaluator reports `unify_cycle`. SHARED LANGUAGE SURFACE -- the TS
// MAXDEPTH (ts/src/unify.ts) carries the same number, and
// test/spec/budget.tsv pins the boundary in both, so changing it is a
// spec-visible change in both ports at once.
//
// Lowered from 2000 when TypeScript gained its own explicit budget:
// V8 exhausts its call stack past depth ~1500 in that evaluator, so
// 2000 was unreachable there and the two ports would have disagreed on
// every document between the limits. 1000 sits above every real
// document (the whole shared suite peaks at 603) and below both hosts'
// limits, so the budget decides the verdict rather than the runtime.
const maxUniteDepth = 1000

// unifyRoot runs the fixpoint loop: repeatedly unify the result with
// TOP until it converges (Dc == DONE) or an error is collected. ctx.root
// is refreshed each pass so references resolve against the latest tree.
// THE TYPE FLOW, APPLIED (G4 phase 2). `refer(t)` unifies `t` INTO the
// node it addresses, which is a write at a position the meet is not
// currently at -- the one non-local effect in the evaluator.
//
// It cannot be only a write made during the pass. A pass BUILDS a new
// tree from the old one, and a subtree rebuilt by the pass (which is
// exactly what happens when the link sits inside its own target, or
// when two nodes link at each other) drops a write made into the
// previous one. So each flow is also RECORDED, keyed by the target's
// path, and re-applied to the pass's own result here.
//
// Keyed by PATH, so there is no registry of names to collide in
// (ADR-013) -- the key is the position the address resolved to, and
// re-uniting the same type at the same position is idempotent, which is
// what makes replaying every recorded flow every pass correct rather
// than merely cheap. Mirrors applyFlows in ts/src/unify.ts.
func applyFlows(ctx *Ctx, root Val) Val {
	// NOTHING TO APPLY is the common case -- a document with no links
	// pays one map length per pass, and the walk never runs.
	if 0 == len(ctx.referflows) {
		return root
	}
	// Sorted, so two flows landing at overlapping positions arrive in
	// the same order in both ports (Go map order is random).
	keys := make([]string, 0, len(ctx.referflows))
	for k := range ctx.referflows {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := strings.Split(key, "\x00")
		site, ok := findAt(root, path)
		// The position may not be in THIS pass's tree yet (a forward
		// link whose target a later conjunct introduces); the record
		// survives to the next pass, where it will be.
		if !ok || nil == site.parent {
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

		// THE STAGING RULE (G8 phase 0,
		// docs/capability-review/g8-generation.md, mirroring
		// ts/src/unify.ts), stated once, here, for every value whose
		// answer depends on WHERE IT IS. Such a value residuates while
		// the model is still moving and fires on the first pass whose
		// input is IDENTICAL to the previous pass's input: nothing
		// moved, so nothing will move it again, and the position it
		// reports is the position it ends at.
		//
		// Why the whole model and not the value's own path. A spread, a
		// reference or a move() can place a value under a path it has
		// already been driven at and THEN change what encloses it --
		// move() hides its source one pass AFTER it copies it, and a
		// key() that answered on the strength of its path alone would
		// answer for the ghost.
		ctx.settle = settle

		// Snapshot BEFORE the final pass (the loop condition has already
		// established the tree is not done), so exhaustion can tell
		// "still refining" from "stable residue" below. Taken at the
		// final pass's ENTRY rather than the previous pass's exit — the
		// same value when the budget allows two passes, and the only
		// possible value when the trust profile sets passes to 1, where
		// the old placement (cc == maxcc-2, never true) made exhaustion
		// silent, exactly the truncation docs/trust.md forbids.
		// lastCanon IS that entry canon whenever a previous pass
		// rendered one, so this costs nothing extra. Mirrors
		// ts/src/unify.ts.
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

		// MULTI-ERROR COLLECTION (G2 phase 6): the pass loop CONTINUES
		// past an erroring pass, so independent failures a later pass
		// would reach are collected in the same run — the break that
		// stood here made every multi-error report truncated at the
		// first erroring pass. What controls the cascade: a nil is
		// ABSORBING (unite's Nil arms return the existing nil, no new
		// error), so one failure stays ONE nil however many later meets
		// touch it. Mirrors ts/src/unify.ts; pinned by vet.tsv's
		// multi-* rows.

		// The staging signal for the NEXT pass, rendered here rather
		// than at the top of the loop so a model that is FINISHED is
		// never rendered at all: Canon walks references, and the only
		// trees that close a cycle are hand-built ones (the pass loop is
		// what a test drives them through), which converge in one pass
		// and must not be walked to decide a question that no longer
		// arises.
		if res.Dc() != DONE {
			nowCanon := res.Canon()
			settle = sawLast && lastCanon == nowCanon
			lastCanon = nowCanon
			sawLast = true
		}
	}
	// The pass budget is spent AND the final pass still made progress:
	// the model was cut off while converging, and no other error
	// explains why. Silent truncation would surface later as ordinary
	// incompleteness, so exhaustion is a semantic error of its own
	// (class budget, docs/trust.md clause 2). A STABLE residue (the
	// final pass changed nothing -- e.g. a stuck `1+true`) is not a
	// budget failure: it stays silent here and surfaces at generate as
	// before. Mirrors the budget_passes emission at the TS pass-loop
	// exit (ts/src/unify.ts).
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

// isPlaceheldOp reports whether v is an operator holding a placeholder
// hole (G8 phase 3, see place.go).
func isPlaceheldOp(v Val) bool {
	_, ok := v.(*PlusOpVal)
	return ok && hasPlace(v)
}
