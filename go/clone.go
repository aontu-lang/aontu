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
		for _, nf := range n.nofs {
			for _, b := range nf.branches {
				setPaths(b, path)
			}
		}
		for _, w := range n.whens {
			for _, b := range []Val{w.c, w.t, w.e} {
				if nil != b {
					setPaths(b, path)
				}
			}
		}
		for _, a := range n.contains {
			setPaths(a.c, path)
		}
		for _, r := range n.rests {
			for _, arg := range restArgs(r) {
				setPaths(arg, path)
			}
		}
	}
}

func overlayPath(dest, orig []string) []string {
	if len(orig) <= len(dest) {
		return cp(dest)
	}
	out := make([]string, len(orig))
	copy(out, dest)
	copy(out[len(dest):], orig[len(dest):])
	return out
}

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

func clonePath(v Val, path []string) Val {
	return cloneAt(v, path, false)
}

func instanceClone(v Val, path []string) Val {
	return cloneAt(v, path, true)
}

func cloneAt(v Val, path []string, deep bool) Val {
	return cloneIn(v, path, deep, nil)
}

// cloneIn is cloneAt for a copy taken through references: each one the
// copy holds is inside the expansion of the targets within names.
func cloneIn(v Val, path []string, deep bool, within []string) Val {
	out := clonePathRec(v, path, deep, within)
	out.setPosu(true)
	return out
}

func clonePathRec(v Val, path []string, deep bool, within []string) Val {
	if v == nil {
		return nil
	}
	out := clonePathKind(v, path, deep, within)
	out.setSrcurl(v.srcurl())
	out.setSrctext(v.srctext())
	out.setPos(v.pos())
	out.setPosu(v.posu())
	if v.written() {
		out.setWritten()
	}
	if nil != v.innerOf() {
		out.setInnerOf(v.innerOf())
	}
	return out
}

func clonePathKind(v Val, path []string, deep bool, within []string) Val {
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
	case *MapKindVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ListKindVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ReferVal:
		c := *n
		c.path = cp(path)
		return &c
	case *ConstraintKindVal:
		c := *n
		c.path = cp(path)
		if nil != n.held {
			c.held = cloneIn(n.held, path, deep, within)
		}
		return &c
	case *RecurseVal:
		// The recursive residual clones per position for the same
		// reason: shared, an expansion at one instance carried the
		// DEFINITION's path into every error it raised there.
		c := *n
		c.path = cp(path)
		return &c
	case *EmptyVal:
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
		out := &ExpectVal{peg: n.peg}
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *MapVal:
		out := newMap()
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		// The source site travels with the clone (TS Val.clone copies
		// site.row/col), so a ref-carried bag still frames at its brace.
		out.site.sp = n.site.sp
		out.site.url = n.site.url
		out.site.src = n.site.src
		out.closed = n.closed
		out.opened = n.opened
		out.optional = append([]string{}, n.optional...)
		out.aliasKeys = append([]string{}, n.aliasKeys...)
		if n.spread != nil {
			out.spread = cloneIn(n.spread, path, deep, within)
		}
		copyMarks(out, n)
		for _, k := range n.keys {
			c := cloneIn(n.peg[k], append(cp(path), k), deep, within)
			// A child the template already applied to keeps that.
			if nil != n.spread && sprOf(n.peg[k]) == n.spread {
				setSprOn(c, out.spread)
			}
			out.set(k, c)
		}
		return out
	case *ListVal:
		out := &ListVal{}
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		out.site.sp = n.site.sp
		out.site.url = n.site.url
		out.site.src = n.site.src
		out.closed = n.closed
		out.opened = n.opened
		if n.spread != nil {
			out.spread = cloneIn(n.spread, path, deep, within)
		}
		copyMarks(out, n)
		for i, e := range n.peg {
			c := cloneIn(e, append(cp(path), itoa(i)), deep, within)
			if nil != n.spread && sprOf(e) == n.spread {
				setSprOn(c, out.spread)
			}
			out.peg = append(out.peg, c)
		}
		return out
	case *ConjunctVal:
		out := newConjunct(nil)
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, cloneIn(t, path, deep, within))
		}
		return out
	case *DisjunctVal:
		out := newDisjunct(nil)
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, cloneIn(t, path, deep, within))
		}
		return out
	case *PrefVal:
		peg := n.peg
		if deep {
			peg = cloneIn(n.peg, path, true, within)
		}
		// `narrowed` rides with it: it is the override space the meets
		// so far have left, and resuper() reapplies it whenever the gate
		// is recomputed. Dropping it widened a pinned default back out
		// (ADR-011 R1).
		out := &PrefVal{peg: peg, superpeg: n.superpeg,
			narrowed: n.narrowed, rank: n.rank}
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *RefVal:
		// rxc travels with the clone: a spread template is cloned per
		// destination, and each clone's residual must start where the
		// level it came from left off (BUGS.md §57).
		out := &RefVal{absolute: n.absolute, prefix: n.prefix, hideFound: n.hideFound, copyFound: n.copyFound,
			expansion: n.expansion, rxc: n.rxc, within: withinUnion(n.within, within)}
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		out.peg = append([]any{}, n.peg...)
		return out
	case *VarVal:
		out := &VarVal{peg: n.peg}
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *PlusOpVal:
		out := &PlusOpVal{}
		out.dc = n.dc
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		for _, t := range n.peg {
			out.peg = append(out.peg, cloneIn(t, path, deep, within))
		}
		return out
	case *PlaceVal:
		// A HOLE IS A POSITION. Left uncloned it kept the one path the
		// parse gave it, and the fill inserted there (fillPlace) then
		// carried its SOURCE paths into a destination that is somewhere
		// else, so a finding under the fill named a path that does not
		// exist.
		out := newPlace()
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		copyMarks(out, n)
		return out
	case *FuncVal:
		out := &FuncVal{name: n.name, prepared: n.prepared}
		out.dc = n.dc
		out.site.sp = n.site.sp
		out.path = overlayPath(path, n.path)
		out.spr = n.spr
		copyMarks(out, n)
		if deep {
			args := make([]Val, 0, len(n.peg))
			for _, a := range n.peg {
				args = append(args, cloneIn(a, path, true, within))
			}
			out.peg = args
		} else {
			out.peg = n.peg
		}
		return out
	}
	return v
}
