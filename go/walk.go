/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// One tree walk, three consumers: Check collects NilVals for the LSP's
// diagnostics (check.go), and the validation verb both stamps
// provenance and collects NilVals for findings (vet.go). The Go twin of
// ts/src/walk.ts, and written for the same reason: one traversal, not
// three copies of something with three easy ways to be subtly wrong.
//
// The `seen` set is a termination guard, not an optimisation: a
// unified tree is a graph (a resolved ref shares its target, a spread
// shares its template), so an unguarded walk does not terminate.
//
// The visitor returns false to prune the subtree below a node, which is
// how a nil collector stops at the nil rather than walking into the
// operands it carries.
//
// WHAT COUNTS AS A CHILD. TypeScript reads `v.peg` generically -- an
// array for lists, conjuncts, disjuncts and funcs, an object for maps
// -- plus the off-peg `spread.cj`. Go has no generic peg, so the kinds
// are named here; the list is setPaths' list (clone.go), which is the
// other place that has to reach every value a parse produced.
func walkVals(v Val, visit func(Val) bool, seen map[Val]bool) {
	if v == nil || seen[v] {
		return
	}
	seen[v] = true

	if !visit(v) {
		return
	}

	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			walkVals(n.peg[k], visit, seen)
		}
		if n.spread != nil {
			walkVals(n.spread, visit, seen)
		}
	case *ListVal:
		for _, e := range n.peg {
			walkVals(e, visit, seen)
		}
		if n.spread != nil {
			walkVals(n.spread, visit, seen)
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *PrefVal:
		walkVals(n.peg, visit, seen)
		// OFF-PEG, and reportable: the type yardstick and the family
		// gate a preference derives from its own value are what
		// `*1 & {}` conflicts with, so a caller that stamps provenance
		// (vet.go) has to reach them or the report cannot say which
		// document they came from (ts/src/walk.ts does the same).
		walkVals(n.superpeg, visit, seen)
		walkVals(n.familypeg, visit, seen)
	case *PlusOpVal:
		for _, t := range n.peg {
			walkVals(t, visit, seen)
		}
	case *FuncVal:
		for _, a := range n.peg {
			walkVals(a, visit, seen)
		}
	case *NilVal:
		// A FAILURE'S OPERANDS. They are not peg entries, and they are
		// exactly what a report names: a finding's sites are the nil's
		// primary and secondary (vet.go, siteOf). A visitor that PRUNES
		// at a nil never reaches them -- collectNils returns false and
		// this switch is behind that gate -- so a nil collector is
		// unaffected. A visitor that does not prune, and stamping
		// provenance is the one that does not, must reach them or a
		// broken schema's finding names no file at all. Mirrors the
		// same arm in ts/src/walk.ts.
		walkVals(n.primary, visit, seen)
		walkVals(n.secondary, visit, seen)
	case *ConstraintVal:
		// A pending atom's arguments are its peg in TypeScript
		// (`new ConstraintVal({peg: args})`), so the generic walk there
		// reaches them and this one must too. The musts and the folded
		// bounds are NOT peg entries in either port.
		if n.pending != nil {
			for _, a := range n.pending.args {
				walkVals(a, visit, seen)
			}
		}
		// The value a `must` checks against is off-peg too, and it is
		// the operand a failed check reports.
		for _, m := range n.musts {
			walkVals(m.v, visit, seen)
		}
	}
}

// stampURL names the source every value in a tree came from. Values
// carry no url of their own: one entry source needs no name, and the
// single-document entry points never supply one. The validation verb
// does, because it unifies TWO documents in one run and a report has to
// say which of them each site belongs to -- and, before that, which
// text the site's row and column are offsets into.
//
// Stamped BEFORE the two trees meet, which is what makes the answer
// provenance rather than a guess: after unification the values are
// interleaved, and no property of a value distinguishes them.
func stampURL(v Val, url string) {
	walkVals(v, func(n Val) bool {
		n.setSrcurl(url)
		return true
	}, map[Val]bool{})
}

// collectNils appends every NilVal reachable from v exactly once
// (deduplicated by identity, via the caller's `seen` set). A NilVal in a
// unified result always represents an error; valid non-concrete values
// (scalar kinds, refs, conjuncts that simply did not resolve) are never
// NilVals.
//
// The walk stops AT a nil rather than descending into it: the operands
// it carries are the failure's inputs, not further failures.
//
// The `seen` set is the caller's, not an internal detail: both callers
// go on to dedup context-only errors against the nils already found,
// which is only possible if they hold the set.
func collectNils(v Val, out *[]*NilVal, seen map[Val]bool) {
	walkVals(v, func(n Val) bool {
		if nv, ok := n.(*NilVal); ok {
			*out = append(*out, nv)
			return false
		}
		return true
	}, seen)
}
