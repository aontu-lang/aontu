/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


// PlaceVal is the hole.
type PlaceVal struct{ base }

func newPlace() *PlaceVal {
	p := &PlaceVal{}
	p.site.sp = unsited
	return p
}

func (p *PlaceVal) Canon() string { return "_" }

// A hole admits everything, so nothing sits above it -- the same
// answer TOP gives, for the same reason.
func (p *PlaceVal) superior() Val { return p }

// Silent, exactly as TopVal.Gen is: the enclosing bag decides whether
// an unfilled hole is an error (a direct child) or dropped (under a
// pref or optional subtree).
func (p *PlaceVal) Gen(ctx *Ctx) (any, error) { return nil, nil }

func (p *PlaceVal) Unify(peer Val, ctx *Ctx) Val {
	// The peer FILLS the hole. Against TOP there is nothing to fill it
	// with, so it waits -- and waiting is not done, or a call holding
	// it would resolve around it.
	if peer == nil || isTop(peer) {
		p.notdone()
		return p
	}
	return peer
}

func boundArgStart(v Val) int {
	if fv, ok := v.(*FuncVal); ok {
		if "pack" == fv.name || "filter" == fv.name ||
			"emit" == fv.name || "each" == fv.name {
			return 1
		}
	}
	return int(^uint(0) >> 1) // max int
}

func hasPlace(v Val) bool {
	switch n := v.(type) {
	case *PlaceVal:
		return true
	case *FuncVal:
		bound := boundArgStart(n)
		for i, a := range n.peg {
			if bound <= i {
				break
			}
			if hasPlace(a) {
				return true
			}
		}
	case *PlusOpVal:
		for _, a := range n.peg {
			if hasPlace(a) {
				return true
			}
		}
	case *ConjunctVal:
		for _, a := range n.peg {
			if hasPlace(a) {
				return true
			}
		}
	case *DisjunctVal:
		for _, a := range n.peg {
			if hasPlace(a) {
				return true
			}
		}
	case *PrefVal:
		return hasPlace(n.peg)
	case *MapVal:
		for _, k := range n.keys {
			if hasPlace(n.peg[k]) {
				return true
			}
		}
	case *ListVal:
		for _, e := range n.peg {
			if hasPlace(e) {
				return true
			}
		}
	}
	return false
}

func fillPlace(v Val, fill Val) Val {
	if p, ok := v.(*PlaceVal); ok {
		// A FILL IS A POSITION: the hole knows where it sits in the
		// instance, the datum arriving in it does not. Mirrors
		// fillPlace in ts/src/val/PlaceVal.ts.
		out := clonePath(fill, cp(p.path))
		out.setvpath(cp(p.path))
		return out
	}
	if !hasPlace(v) {
		return v
	}

	switch n := v.(type) {
	case *FuncVal:
		out := *n
		// A generator's binding arguments are left untouched
		// (boundArgStart): those holes are the inner generator's to
		// fill with its OWN source children when it fires.
		out.peg = fillPlaceArgs(n.peg, fill, boundArgStart(n))
		out.dc = 0
		return &out
	case *PlusOpVal:
		out := *n
		out.peg = fillPlaceEach(n.peg, fill)
		out.dc = 0
		return &out
	case *ConjunctVal:
		out := *n
		out.peg = fillPlaceEach(n.peg, fill)
		out.dc = 0
		return &out
	case *DisjunctVal:
		out := *n
		out.peg = fillPlaceEach(n.peg, fill)
		out.dc = 0
		return &out
	case *PrefVal:
		out := *n
		out.peg = fillPlace(n.peg, fill)
		out.dc = 0
		return &out
	case *MapVal:
		out := *n
		out.keys = cp(n.keys)
		out.peg = map[string]Val{}
		for _, k := range n.keys {
			out.peg[k] = fillPlace(n.peg[k], fill)
		}
		out.dc = 0
		return &out
	case *ListVal:
		out := *n
		out.peg = fillPlaceEach(n.peg, fill)
		out.dc = 0
		return &out
	}

	// UNREACHABLE: hasPlace above answered true, and it answers true
	// only for the kinds this switch covers. The return is here because
	// Go needs one.
	return v //coverage:ignore hasPlace true implies a case above
}

func fillPlaceEach(vals []Val, fill Val) []Val {
	return fillPlaceArgs(vals, fill, len(vals))
}

// fillPlaceArgs fills holes in the first `bound` values and carries the
// rest through unchanged — the generator-template boundary of the
// FuncVal arm above.
func fillPlaceArgs(vals []Val, fill Val, bound int) []Val {
	out := make([]Val, 0, len(vals))
	for i, v := range vals {
		if bound <= i {
			out = append(out, v)
			continue
		}
		out = append(out, fillPlace(v, fill))
	}
	return out
}

func holdsStaged(v Val) bool {
	switch n := v.(type) {
	case *FuncVal:
		if stagedFuncs[n.name] {
			return true
		}
		for _, a := range n.peg {
			if holdsStaged(a) {
				return true
			}
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			if holdsStaged(t) {
				return true
			}
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			if holdsStaged(t) {
				return true
			}
		}
	case *PrefVal:
		return holdsStaged(n.peg)
	case *MapVal:
		for _, k := range n.keys {
			if holdsStaged(n.peg[k]) {
				return true
			}
		}
		return holdsStaged(n.spread)
	case *ListVal:
		for _, e := range n.peg {
			if holdsStaged(e) {
				return true
			}
		}
		return holdsStaged(n.spread)
	case *PlusOpVal:
		for _, a := range n.peg {
			if holdsStaged(a) {
				return true
			}
		}
	}
	return false
}
