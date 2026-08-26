/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// THE GENERATION COMBINATORS (G8 phase 1, the Go side of
// ts/src/val/PackFuncVal.ts and ts/src/val/EachFuncVal.ts,
// docs/capability-review/g8-generation.md).
//
//	pack(data, tmpl)  one KEYED child per child of data
//	each(data, tmpl?) one LIST ELEMENT per child of data
//
// Both clone their template per destination -- an independent copy for
// each generated child, because a generator's template IS the child and
// a child is a position -- and both wait for the model to settle before
// they fire (the staging rule, G8 phase 0): a data
// argument that is merely `done` once can still be merged into by a
// sibling, an include or a spread, and children generated from a
// half-merged bag would be missing.
//
// TOTALITY. Both iterate a finite, settled bag and neither can call
// itself: the number of children either can produce is fixed by data
// that already exists. Nothing here recurses, which is the guarantee
// the combinators exist to keep.

// packKeys is the keys a data bag names, or the code naming what is
// wrong with it. For a list the strings themselves are the keys: keys
// are DATA, never position, or reordering the list would churn every
// generated child (the Terraform `count` lesson).
func packKeys(data Val) ([]string, string) {
	switch d := data.(type) {
	case *MapVal:
		return append([]string{}, d.keys...), ""
	case *ListVal:
		out := make([]string, 0, len(d.peg))
		for _, el := range d.peg {
			sv, ok := el.(*ScalarVal)
			if !ok || KindString != sv.kind {
				return nil, "pack_key"
			}
			s, _ := sv.peg.(string)
			out = append(out, s)
		}
		return out, ""
	}
	return nil, "pack_data"
}

// eachValues is the children a data bag holds, in the order the result
// must carry them: source order for a list, sorted-key order for a map.
// A generated list whose order depended on insertion history would
// differ between two runs of one document, and between the two ports.
func eachValues(data Val) ([]Val, string) {
	switch d := data.(type) {
	case *MapVal:
		names := append([]string{}, d.keys...)
		sort.Strings(names)
		out := make([]Val, 0, len(names))
		for _, k := range names {
			out = append(out, d.peg[k])
		}
		return out, ""
	case *ListVal:
		return append([]Val{}, d.peg...), ""
	}
	return nil, "each_data"
}

func packFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	keys, bad := packKeys(data)
	if "" != bad {
		return makeNilErr(ctx, bad, f, nil)
	}

	var tmpl Val = top()
	if 1 < len(args) {
		tmpl = args[1]
	}

	out := newMap()
	for ki, key := range keys {
		kslot := append(cp(base), key)
		// THE PLACEHOLDER BINDS THE SOURCE CHILD (G8 phase 3): inside a
		// generator's template `_` is the datum this child is being
		// made FROM. For a map that is the child's value; for a list of
		// names it is the name, which is also the key -- so `_` and
		// key() agree there, and differ the moment the data is a map.
		var source Val
		if m, ok := data.(*MapVal); ok {
			source = m.peg[key]
		} else if l, ok := data.(*ListVal); ok {
			source = l.peg[ki]
		}
		// CLONED, never shared. A spread may share a template that
		// holds nothing path-dependent; a generator's template IS the
		// child, and a child is a position (see the TS
		// PackFuncVal.resolve comment).
		// A FULL INSTANCE, to the leaves (instanceClone, ADR-005): a
		// bare clone shares the inner structure of any call, preference
		// or operation in the template, so the first child's resolution
		// of a shared key()/ref answered for every child (BUGS.md §8, §9).
		child := fillPlace(instanceClone(tmpl, kslot), source)
		if prev, seen := out.peg[key]; seen {
			// Duplicate generated keys are not an error: the colliding
			// children unify, exactly as duplicate source keys merge.
			ctx.slot = kslot
			out.peg[key] = unite(ctx, prev, child)
			continue
		}
		out.keys = append(out.keys, key)
		out.peg[key] = child
	}
	out.setvpath(cp(base))
	return out
}

func eachFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	vals, bad := eachValues(data)
	if "" != bad {
		return makeNilErr(ctx, bad, f, nil)
	}

	var tmpl Val
	if 1 < len(args) {
		tmpl = args[1]
	}

	elems := make([]Val, 0, len(vals))
	for i, v := range vals {
		islot := append(cp(base), itoa(i))
		// The element is the source child CLONED, not shared: it is a
		// second position holding that value, and a position is where
		// path-dependent content resolves. The clone keeps the identity
		// if the child carries one (G4 phase 1) -- a listed entity is
		// still that entity.
		el := clonePath(v, islot)
		if nil != tmpl {
			ctx.slot = islot
			// `_` inside the template binds the source child (G8 phase
			// 3), which for each() is the element itself.
			// A full instance per element (instanceClone, ADR-005).
			el = unite(ctx, el, fillPlace(instanceClone(tmpl, islot), v))
		}
		elems = append(elems, el)
	}
	out := newList(elems)
	out.setvpath(cp(base))
	return out
}

// SELECTION (G8 phase 2, the Go side of ts/src/val/FilterFuncVal.ts and
// ts/src/val/MatchFuncVal.ts).
//
//	filter(data, cond)                the children that ALREADY satisfy cond
//	match(v, p1, r1, …, d?)           the result of the first pattern v matches
//
// Both select by trying a meet and reading the outcome, never by a
// predicate language: a condition and a pattern are ordinary Aontu
// values, so the constraint atoms compose with them for free.

// trialUnify is a TRIAL meet: does a unify with b, and if so as what?
// Failure is an ANSWER rather than an error, so the error list is
// swapped for a throwaway one exactly as DisjunctVal's member trials do
// (disjunct.go). Mirrors trialUnify in ts/src/val/FuncBaseVal.ts.
func trialUnify(ctx *Ctx, a, b Val) Val {
	saved := ctx.err
	ctx.err = []*NilVal{}
	out := unite(ctx, a, b)
	failed := 0 < len(ctx.err) || (nil != out && out.Nil())
	ctx.err = saved
	if failed {
		return nil
	}
	return out
}

func filterFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	var data Val = top()
	if 0 < len(args) {
		data = args[0]
	}
	var cond Val = top()
	if 1 < len(args) {
		cond = args[1]
	}

	// A child is kept when the condition CHANGES NOTHING: the meet
	// succeeds AND its answer is the child itself, which is to say the
	// child already satisfies the condition. Mere unifiability is not
	// the test and cannot be -- a map is open, so `{p:2}` unifies with
	// `{debug:true}` by GAINING the key, and a filter that keeps
	// everything that could be made to match keeps everything. Canon is
	// the comparison because canon is what "the same value" means here.
	keeps := func(child Val, slot []string) bool {
		ctx.slot = slot
		// `_` inside the condition binds the child being tested (G8
		// phase 3), so a condition can be about the child as a whole
		// rather than only about its shape.
		// The condition is cloned as a FULL instance per trial
		// (instanceClone, ADR-005) — a bare clone shares call/pref
		// innards across trials.
		test := fillPlace(instanceClone(cond, slot), child)
		met := trialUnify(ctx, clonePath(child, slot), test)
		return nil != met && met.Canon() == child.Canon()
	}

	switch d := data.(type) {
	case *MapVal:
		out := newMap()
		for _, k := range d.keys {
			kslot := append(cp(base), k)
			if keeps(d.peg[k], kslot) {
				out.keys = append(out.keys, k)
				out.peg[k] = clonePath(d.peg[k], kslot)
			}
		}
		out.setvpath(cp(base))
		return out
	case *ListVal:
		elems := []Val{}
		for _, e := range d.peg {
			// The element context is the position it will END UP at,
			// which is its index in the RESULT: dropping the third of
			// five moves the fourth up.
			islot := append(cp(base), itoa(len(elems)))
			if keeps(e, islot) {
				elems = append(elems, clonePath(e, islot))
			}
		}
		out := newList(elems)
		out.setvpath(cp(base))
		return out
	}

	return makeNilErr(ctx, "filter_data", f, nil)
}

// matchHasDefault reports whether the last argument is a trailing
// default rather than half of a pattern/result pair.
func matchHasDefault(peg []Val) bool {
	return 0 == len(peg)%2
}

// effectiveScrutinee is THE DEFAULTED-SCRUTINEE RULE (ADR-004,
// use-cases/BUGS.md §5): the generation-effective view of a settled
// scrutinee. A preference -- or a disjunction carrying one -- means
// "this value unless something overrides it", and by resolve time the
// model has SETTLED (staging rule), so nothing will: the value
// generation is about to emit is the value the patterns must be tested
// against. Testing against the still-open preference instead let a
// pattern SELECT an arm by overriding the default. A pref-free
// scrutinee (open disjunction included) is untouched. Mirrors
// effectiveScrutinee in ts/src/val/MatchFuncVal.ts.
func effectiveScrutinee(v Val) Val {
	out := v
	if d, ok := out.(*DisjunctVal); ok {
		// Generation picks the LOWEST rank (subEffectiveDefault in
		// subsume.go; `a:**1|*2` generates 2). rankPrefs leaves at most
		// one pref standing in a settled disjunct, so the scan is
		// defensive.
		var best *PrefVal
		for _, m := range d.peg {
			if p, ok := m.(*PrefVal); ok && (nil == best || p.rank < best.rank) {
				best = p
			}
		}
		if nil == best {
			return v
		}
		out = best
	}
	return prefInnerPeg(out)
}

func matchFunc(ctx *Ctx, f *FuncVal, base []string, args []Val) Val {
	scrutinee := effectiveScrutinee(args[0])
	last := len(args)
	if matchHasDefault(args) {
		last--
	}

	tried := []string{}
	for i := 1; i < last; i += 2 {
		tried = append(tried, args[i].Canon())
		ctx.slot = base
		if nil != trialUnify(ctx,
			clonePath(scrutinee, base), clonePath(args[i], base)) {
			// The RESULT is the answer: a match MAPS a value to another
			// value rather than narrowing the scrutinee by the arm (see
			// the TS MatchFuncVal header for why the design's `v & p & r`
			// cannot be what a match is for).
			return clonePath(args[i+1], base)
		}
	}

	if matchHasDefault(args) {
		return clonePath(args[len(args)-1], base)
	}

	return makeNilErrFull(ctx, "match_none", f, nil, "resolve",
		map[string]string{
			"value": scrutinee.Canon(),
			"tried": strings.Join(tried, " "),
		})
}

// stagedArgIdx is the arguments a staged func must have DRIVEN before
// it can fire: the ones whose value the decision reads. Everything
// else -- a generator's template, a match arm's result -- is left
// standing until it is chosen.
func stagedArgIdx(f *FuncVal) []int {
	switch f.name {
	case "pack", "each":
		return []int{0}
	case "filter":
		// The DATA only. The condition is a template, tested against
		// each child at that child's position, so it may hold a `_` or
		// a relative reference — neither of which has an answer at the
		// call site (see the TS FilterFuncVal.prepare comment).
		return []int{0}
	case "match":
		out := []int{0}
		last := len(f.peg)
		if matchHasDefault(f.peg) {
			last--
		}
		for i := 1; i < last; i += 2 {
			out = append(out, i)
		}
		return out
	}
	// key() has nothing to settle but its own position.
	return nil
}

// stagedDrive advances a staged func's decision arguments IN PLACE,
// every pass rather than only on the settle pass: they are part of the
// model that has to settle. Answers whether they are all done, which is
// the other half of "ready to fire". Mirrors driveStagedArgs in
// ts/src/val/FuncBaseVal.ts.
func stagedDrive(ctx *Ctx, f *FuncVal, base []string) bool {
	ready := true
	// THE SNAPSHOT WAITS FOR THE SOURCE (see Ctx.argsnap): every ref
	// resolution inside this drive defers its copy until the target has
	// settled in the tree. Saved/restored rather than simply cleared:
	// a staged func nested inside another's data argument drives its
	// own argument with the flag already up, exactly as TS's
	// prototype-inherited ctx flag behaves.
	saved := ctx.argsnap
	ctx.argsnap = true
	defer func() { ctx.argsnap = saved }()
	// Every index stagedArgIdx answers is derived from len(f.peg), and
	// arity is checked at parse, so there is no bound to test here.
	for _, i := range stagedArgIdx(f) {
		if f.peg[i].Dc() != DONE {
			ctx.slot = base
			driven := unite(ctx, f.peg[i], top())
			if driven != f.peg[i] {
				// COPY ON WRITE. A clone shares its arguments with the
				// value it was cloned from (clonePath, for the sharing
				// artifacts the ghost cases depend on), so writing a
				// driven argument straight back would write it into
				// every sibling clone too — and a generator's template,
				// cloned once per destination, is exactly a set of
				// siblings that must answer differently. Each staged
				// func takes ownership of its arguments the first time
				// it advances one.
				peg := append([]Val{}, f.peg...)
				peg[i] = driven
				f.peg = peg
			}
		}
		ready = ready && f.peg[i].Dc() == DONE
	}
	return ready
}
