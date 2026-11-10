/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "slices"

// PlaceVal is the hole.
type PlaceVal struct {
	base
}

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

// A hole left unbound stands for any value, as the definition reads an
// unused declaration's body: against TOP it waits, never done, so a call
// holding it is never made around it.
func (p *PlaceVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		p.notdone()
		return p
	}
	return peer
}

func boundArgStart(v Val) int {
	if fv, ok := v.(*FuncVal); ok {
		return boundFrom(fv.name)
	}
	return int(^uint(0) >> 1) // max int
}

// The calls whose arguments from the second on are templates.
func boundFrom(name string) int {
	if "pack" == name || "filter" == name || "emit" == name ||
		"each" == name || "apply" == name {
		return 1
	}
	return int(^uint(0) >> 1) // max int
}

// unboundHole finds a hole nothing binds where it is written (ruling
// 34): one outside the template of a generator, an apply or a filter's
// condition, one in a spread's template, and a name whose body holds
// one, though not as an emit's table. It is reported at the member it
// is written in.
func unboundHole(ctx *Ctx, root Val) *NilVal {
	decls := map[string]Val{}
	declsIn(root, decls, map[Val]bool{})
	holed := map[string]bool{}
	for grew := true; grew; {
		grew = false
		for key, body := range decls {
			if holed[key] {
				continue
			}
			if hole, _ := looseIn(body, holed, false, nil, false); nil != hole {
				holed[key] = true
				grew = true
			}
		}
	}
	hole, path := looseIn(root, holed, false, nil, false)
	if nil == hole {
		return nil
	}
	n := makeNilErrFull(ctx, "hole_unbound", hole, nil, "parse", nil)
	n.path = path
	return n
}

func declsIn(v Val, decls map[string]Val, seen map[Val]bool) {
	if nil == v || seen[v] {
		return
	}
	seen[v] = true
	if m, ok := v.(*MapVal); ok {
		for _, k := range m.aliasKeys {
			decls[k] = m.peg[k]
		}
	}
	for _, c := range partsOf(v) {
		declsIn(c, decls, seen)
	}
}

func partsOf(v Val) []Val {
	switch n := v.(type) {
	case *MapVal:
		parts := make([]Val, 0, len(n.keys)+1)
		for _, k := range n.keys {
			parts = append(parts, n.peg[k])
		}
		return append(parts, n.spread)
	case *ListVal:
		return append(append([]Val{}, n.peg...), n.spread)
	case *FuncVal:
		return n.peg
	case *NilVal:
		if nil != n.refusedCall {
			return n.refusedCall.peg
		}
	case *ConstraintVal:
		if nil != n.pending {
			return n.pending.args
		}
	case *ConjunctVal:
		return n.peg
	case *DisjunctVal:
		return n.peg
	case *PlusOpVal:
		return n.peg
	case *PrefVal:
		return []Val{n.peg}
	}
	return nil
}

// The path steps through members only: a list or a map inside a call's
// arguments is no member, and the engines shape those differently.
func looseIn(v Val, holed map[string]bool, tmpl bool, path []string, calls bool) (Val, []string) {
	step := func(k string) []string {
		if calls {
			return path
		}
		return append(path[:len(path):len(path)], k)
	}
	switch n := v.(type) {
	case *PlaceVal:
		if tmpl {
			return nil, nil
		}
		return n, path
	case *RefVal:
		if key, named := n.aliasKey(); named && holed[key] {
			return n, path
		}
		return nil, nil
	case *FuncVal:
		from := boundFrom(n.name)
		for i, a := range n.peg {
			if "emit" == n.name && 1 == i && namedRef(a) {
				continue
			}
			if hole, at := looseIn(a, holed, tmpl || from <= i, path, true); nil != hole {
				return hole, at
			}
		}
		return nil, nil
	case *NilVal:
		if nil != n.refusedCall {
			return looseIn(n.refusedCall, holed, tmpl, path, calls)
		}
		return nil, nil
	case *MapVal:
		for _, k := range n.keys {
			if slices.Contains(n.aliasKeys, k) {
				continue
			}
			if hole, at := looseIn(n.peg[k], holed, tmpl, step(k), calls); nil != hole {
				return hole, at
			}
		}
		return looseIn(n.spread, holed, false, path, calls)
	case *ListVal:
		for i, e := range n.peg {
			if hole, at := looseIn(e, holed, tmpl, step(itoa(i)), calls); nil != hole {
				return hole, at
			}
		}
		return looseIn(n.spread, holed, false, path, calls)
	case *ConstraintVal, *PlusOpVal:
		calls = true
	}
	for _, c := range partsOf(v) {
		if hole, at := looseIn(c, holed, tmpl, path, calls); nil != hole {
			return hole, at
		}
	}
	return nil, nil
}

func namedRef(v Val) bool {
	rv, ok := v.(*RefVal)
	if !ok {
		return false
	}
	_, named := rv.aliasKey()
	return named
}

// A call waits on a hole outside its container arguments, which fill their own.
func waitsOnHole(v Val) bool { return holeIn(v, false) }

func holeIn(v Val, bags bool) bool {
	switch n := v.(type) {
	case *PlaceVal:
		return true
	case *FuncVal:
		bound := boundArgStart(n)
		for i, a := range n.peg {
			if bound <= i {
				break
			}
			if holeIn(a, bags) {
				return true
			}
		}
	case *PlusOpVal:
		for _, a := range n.peg {
			if holeIn(a, bags) {
				return true
			}
		}
	case *ConjunctVal:
		for _, a := range n.peg {
			if holeIn(a, bags) {
				return true
			}
		}
	case *DisjunctVal:
		for _, a := range n.peg {
			if holeIn(a, bags) {
				return true
			}
		}
	case *PrefVal:
		return holeIn(n.peg, bags)
	case *MapVal:
		for _, k := range n.keys {
			if bags && holeIn(n.peg[k], bags) {
				return true
			}
		}
	case *ListVal:
		for _, e := range n.peg {
			if bags && holeIn(e, bags) {
				return true
			}
		}
	}
	return false
}

// fillPlace binds each hole an instance's template holds to the value it
// is made from: not one in a nested generator's template, which is that
// generator's own.
func fillPlace(v Val, fill Val) Val {
	if p, ok := v.(*PlaceVal); ok {
		// A FILL IS A POSITION: the hole knows where it sits in the
		// instance, the datum arriving in it does not. Mirrors
		// fillPlace in ts/src/val/PlaceVal.ts.
		out := clonePath(fill, cp(p.path))
		out.setvpath(cp(p.path))
		return out
	}
	if !holeIn(v, true) {
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

	// UNREACHABLE: holeIn answered true, which it does only for the
	// kinds this switch covers; the return is here because Go needs one.
	return v //coverage:ignore holeIn true implies a case above
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
