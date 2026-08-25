/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE PLACEHOLDER `_` (G8 phase 3, the Go side of
// ts/src/val/PlaceVal.ts): a HOLE in a call, filled by whatever the
// call is unified with.
//
//	x: {&: {m: _ + 2}}   x: a: m: 1     ->  a: m: 3
//	greeting: upper(_) & hello          ->  "HELLO"
//
// ALONE, `_` IS TOP WITH A MARK: it admits everything and is filled by
// its peer. What makes it different is that a CALL can see it, and a
// call that holds one waits for a peer to fill it instead of resolving
// around it.

// PlaceVal is the hole.
type PlaceVal struct{ base }

func newPlace() *PlaceVal {
	p := &PlaceVal{}
	p.sp = unsited
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

// hasPlace reports whether v CONTAINS a hole. Asked of a call before it
// resolves: a call holding one must wait for a peer to fill it.
func hasPlace(v Val) bool {
	switch n := v.(type) {
	case *PlaceVal:
		return true
	case *FuncVal:
		for _, a := range n.peg {
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

// fillPlace is the same tree with every hole filled by fill. Answers
// the value UNCHANGED when it holds no hole, so a caller can test
// identity to know whether anything was filled -- and so a tree with no
// hole is never needlessly rebuilt.
func fillPlace(v Val, fill Val) Val {
	if _, ok := v.(*PlaceVal); ok {
		return fill
	}
	if !hasPlace(v) {
		return v
	}

	switch n := v.(type) {
	case *FuncVal:
		out := *n
		out.peg = fillPlaceEach(n.peg, fill)
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
	out := make([]Val, 0, len(vals))
	for _, v := range vals {
		out = append(out, fillPlace(v, fill))
	}
	return out
}
