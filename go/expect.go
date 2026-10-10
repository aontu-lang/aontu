/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

type ExpectVal struct {
	base
	peg    Val
	peer   Val    // accumulated concrete peer values
	parent Val    // the bag that created it; its site locates the error
	key    string // the peer key the expectation arrived under
}

func (e *ExpectVal) superior() Val { return top() }

func (e *ExpectVal) Canon() string { return e.peg.Canon() }

// Gen is unreachable: BagVal-level Gen intercepts an expect child (the
// *_spread_required branch) before ever calling child.Gen, for
// optional and required keys alike — the same interception order as TS
// BagVal.gen, whose ExpectVal.gen is likewise dead code. Silent,
// mirroring the FuncVal.Gen pattern for never-generated residue.
func (e *ExpectVal) Gen(ctx *Ctx) (any, error) {
	return nil, nil
}

func (e *ExpectVal) Unify(peer Val, ctx *Ctx) Val {
	if peer != nil && !isTop(peer) {
		in, theirs := peer, peer
		if other, ok := peer.(*ExpectVal); ok {
			in, theirs = other.peg, other.peer
		}
		peeru := unite(ctx, in, e.peg)
		acc := theirs
		if e.peer != nil {
			acc = e.peer
			if theirs != nil {
				acc = unite(ctx, e.peer, theirs)
			}
		}
		if expectGenable(peeru) {
			peeru.setDc(DONE)
			return peeru
		}
		ne := &ExpectVal{peg: peeru, peer: acc, parent: e.parent, key: e.key}
		ne.dc = DONE
		return ne
	}
	e.dc = DONE
	return e
}

func isExpect(v Val) bool {
	_, ok := v.(*ExpectVal)
	return ok
}

func expectGenable(v Val) bool {
	switch v.(type) {
	case *ScalarVal, *MapVal, *ListVal, *ConjunctVal, *DisjunctVal,
		*FuncVal, *NilVal, *PrefVal, *RefVal,
		*ReferVal, *RelVal, *GraphAtomVal, *RecurseVal:
		return true
	}
	return false
}
