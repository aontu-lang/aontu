/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strconv"

func cp(p []string) []string { return append([]string{}, p...) }

func itoa(i int) string { return strconv.Itoa(i) }

// setPaths assigns the path from root to every Val in a freshly parsed
// tree (mirrors the path tracking that ts/src/lang.ts does during
// parse). References use these paths for relative resolution and cycle
// detection.
func setPaths(v Val, path []string) {
	v.setvpath(path)
	switch n := v.(type) {
	case *MapVal:
		if n.spread != nil {
			setPaths(n.spread, path)
			// The spread constraint's ROOT is pathed under a literal
			// "&" segment (TS parses spreads at `x.&`): a relative ref
			// used as a spread (`&:.y`) then resolves one level deeper
			// than the map — through the map's own pending value — and
			// correctly stays unresolved instead of finding the
			// enclosing node itself.
			n.spread.setvpath(append(cp(path), "&"))
		}
		for _, k := range n.keys {
			setPaths(n.peg[k], append(cp(path), k))
		}
	case *ListVal:
		if n.spread != nil {
			setPaths(n.spread, path)
			n.spread.setvpath(append(cp(path), "&"))
		}
		for i, e := range n.peg {
			setPaths(e, append(cp(path), itoa(i)))
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			setPaths(t, path)
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			setPaths(t, path)
		}
	case *PrefVal:
		setPaths(n.peg, path)
	case *PlusOpVal:
		for _, t := range n.peg {
			setPaths(t, path)
		}
	case *FuncVal:
		for _, a := range n.peg {
			setPaths(a, path)
		}
	case *ConstraintVal:
		// A pending atom's arguments (G1 phase 4) carry refs that
		// resolve — and report — from the atom's own location. Without
		// this arm an unresolvable `min($.zz)` located its no_path at
		// the ROOT while TypeScript locates it at the constraint.
		if nil != n.pending {
			for _, a := range n.pending.args {
				setPaths(a, path)
			}
		}
		for _, m := range n.musts {
			setPaths(m.v, path)
		}
	}
}

// overlayPath rebases a cloned node's path: the destination walk path
// overwrites the leading segments of the node's original path, and the
// original TAIL beyond the destination's length is kept (the TS
// Val.clone path behaviour). A transplant to a SHALLOWER destination
// therefore keeps trailing source segments — `x:a:{k:key()} y:$.x.a`
// gives y's key() the path [y,k,k] (dest [y,k] + orig tail [k]), so
// key(1) resolves to "k", exactly as in TS.
func overlayPath(dest, orig []string) []string {
	if len(orig) <= len(dest) {
		return cp(dest)
	}
	out := make([]string, len(orig))
	copy(out, dest)
	copy(out[len(dest):], orig[len(dest):])
	return out
}

// repathArg re-paths a (possibly shared) func-arg tree to the driving
// location, mirroring the effective paths a TS ctx re-descent would
// assign: the node's own path is OVERLAID on the base (tails beyond the
// base survive, as in Val.clone's ctx-cut), while bag children descend
// with a clean base+key (ctx.descend). The stored paths of a shared
// tree therefore always reflect the LAST driver, which is exactly the
// TS behaviour for shared clones.
//
// Exception: a key() func that has stopped residuating (the settle pass,
// THE STAGING RULE — see Ctx.settle) keeps its stored path. In TS paths
// are only ever written by clones, and key()'s ctx-repathing clone
// happens exclusively while it residuates — on the settle pass it
// resolves with the LAST residuation clone's path, no matter which
// driver reaches it first.
func repathArg(v Val, base []string, settle bool) {
	if fv, ok := v.(*FuncVal); ok && fv.name == "key" && settle {
		return
	}
	v.setvpath(overlayPath(base, v.vpath()))
	switch n := v.(type) {
	case *MapVal:
		if n.spread != nil {
			repathArg(n.spread, base, settle)
		}
		for _, k := range n.keys {
			repathArg(n.peg[k], append(cp(base), k), settle)
		}
	case *ListVal:
		if n.spread != nil {
			repathArg(n.spread, base, settle)
		}
		for i, e := range n.peg {
			repathArg(e, append(cp(base), itoa(i)), settle)
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			repathArg(t, base, settle)
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			repathArg(t, base, settle)
		}
	case *PrefVal:
		repathArg(n.peg, base, settle)
	case *PlusOpVal:
		for _, t := range n.peg {
			repathArg(t, base, settle)
		}
	case *FuncVal:
		for _, a := range n.peg {
			repathArg(a, base, settle)
		}
	}
}

// clonePath deep-clones a Val, rebasing the subtree at the given path
// (mirrors Val.clone in ts/src/val/Val.ts, used when a reference
// resolves to a target). Done-state is preserved. The TOP of the clone
// is marked clone-minted (posu; TS Val.clone's `url ?? ”`), which
// gates the error-operand position flip in makeNilErr; children keep
// their source marks, as TS's shallow clone shares the originals.
func clonePath(v Val, path []string) Val {
	out := clonePathRec(v, path)
	out.setPosu(true)
	return out
}

func clonePathRec(v Val, path []string) Val {
	if v == nil {
		return nil
	}
	out := clonePathKind(v, path)
	// The SOURCE NAME travels with every clone, whatever its kind: TS's
	// Val.clone copies the whole site, url included, so a value carried
	// into another document by a ref still says which document wrote it
	// (val.go, base.surl). Done here rather than in each arm below
	// because a kind that forgot it would mislabel a report site --
	// silently, and only in the two-document vet run.
	out.setSrcurl(v.srcurl())
	// AND THE SOURCE SPAN, for the same reason and in the same place:
	// TS's Val.clone copies the whole site, so a clone keeps the extent
	// along with the row and column it already keeps. Only the CLONE
	// carries it -- a wrapper that returns a new value built around
	// another (close, type, deprecate) must not push its own text onto
	// what it wraps, which would claim source the value never occupied.
	out.setSrctext(v.srctext())
	return out
}

func clonePathKind(v Val, path []string) Val {
	switch n := v.(type) {
	case *TopVal:
		// Return a fresh TOP so marks (e.g. hide(top)) don't leak onto
		// the shared singleton.
		out := newTop()
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *NilVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ScalarVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ScalarKindVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ReferVal:
		// The residual's own state — the type to flow, the address it has
		// met, the constraints it holds — travels with the clone, and the
		// clone is an INDEPENDENT value: without this arm the fall-through
		// shared one residual between a reference and its target, so two
		// positions that later constrained it differently would interfere.
		c := *n
		c.path = cp(path)
		return &c
	case *ConstraintVal:
		// Residuals are immutable after construction (constraint.go), so
		// bounds and exclusions are shared, like a ScalarKindVal's marker.
		c := *n
		c.path = cp(path)
		return &c
	case *ExpectVal:
		// TS Val.clone rebuilds an ExpectVal from the generic spec (peg,
		// marks, path) alone — the expectation-only state (accumulated
		// peer, creating parent, key) is NOT part of the spec and starts
		// unset in the clone, so an independent destination accumulates
		// its own peers and places its own error.
		out := &ExpectVal{peg: n.peg}
		out.dc = n.dc
		out.sp = n.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *MapVal:
		out := newMap()
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		// The source site travels with the clone (TS Val.clone copies
		// site.row/col), so a ref-carried bag still frames at its brace.
		out.sp = n.sp
		out.closed = n.closed
		out.optional = append([]string{}, n.optional...)
		if n.spread != nil {
			out.spread = clonePath(n.spread, path)
		}
		copyMarks(out, n)
		for _, k := range n.keys {
			out.set(k, clonePath(n.peg[k], append(cp(path), k)))
		}
		return out
	case *ListVal:
		out := &ListVal{}
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		out.sp = n.sp
		out.closed = n.closed
		if n.spread != nil {
			out.spread = clonePath(n.spread, path)
		}
		copyMarks(out, n)
		for i, e := range n.peg {
			out.peg = append(out.peg, clonePath(e, append(cp(path), itoa(i))))
		}
		return out
	case *ConjunctVal:
		out := newConjunct(nil)
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, clonePath(t, path))
		}
		return out
	case *DisjunctVal:
		out := newDisjunct(nil)
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, clonePath(t, path))
		}
		return out
	case *PrefVal:
		// The peg is SHARED, not cloned (TS PrefVal.clone inherits
		// Val.clone's `peg: this.peg`): a cloned pref spread template
		// resolves its inner value at the TEMPLATE's own paths — e.g. a
		// `.K` ref inside `&:*[$obj,.K,0]` resolves (and errors) against
		// the template location, exactly as in TS.
		//
		// familypeg IS CARRIED. It is the override GATE (see pref.go): a
		// concrete peer replaces a preference only within the preferred
		// value's family, so `*1 & 2` is 2 while `*1 & {}` is an error.
		// Dropping it here did not weaken the gate, it REMOVED it --
		// unite(ctx, nil, peer) returns the peer verbatim, so every peer
		// overrode, and a cloned `*1` silently accepted a map, a string, a
		// boolean or a list.
		//
		// Uncloned prefs were unaffected, which is why the suite stayed
		// green: the field was added by the number tower and this case
		// predates it, so only values reaching a PrefVal through a spread
		// template, a $ref or a copy() lost the gate.
		out := &PrefVal{
			peg: n.peg, superpeg: n.superpeg, familypeg: n.familypeg, rank: n.rank}
		out.dc = n.dc
		out.sp = n.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *RefVal:
		out := &RefVal{absolute: n.absolute, prefix: n.prefix, hideFound: n.hideFound, copyFound: n.copyFound}
		out.dc = n.dc
		out.sp = n.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		out.peg = append([]any{}, n.peg...)
		return out
	case *VarVal:
		out := &VarVal{peg: n.peg}
		out.dc = n.dc
		out.sp = n.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *PlusOpVal:
		out := &PlusOpVal{}
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, clonePath(t, path))
		}
		return out
	case *FuncVal:
		out := &FuncVal{name: n.name, prepared: n.prepared}
		out.dc = n.dc
		out.sp = n.sp
		out.path = overlayPath(path, n.path)
		out.spr = n.spr
		copyMarks(out, n)
		// The args are SHARED, not cloned (TS Val.clone passes
		// `peg: this.peg` by reference): a moved/copied pending func and
		// its source display the same arg objects, so the destination's
		// resolution of a shared arg map shows through in the frozen
		// source's canon (the ghost-innard sharing artifacts). The args
		// are re-pathed to the clone's location when the clone resolves
		// them (see FuncVal.Unify), mirroring the ctx-path-driven
		// re-descent in TS.
		out.peg = n.peg
		return out
	}
	return v
}
