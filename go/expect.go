/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// ExpectVal is the exact port of ts/src/val/ExpectVal.ts (issue #27):
// the marker a map creates when a PEER key arrives whose value is not
// generable on its own — a kind, top, a var, a constraint residual —
// most commonly a spread template field applied to a child that never
// receives a concrete value (`m:{&:{r:string} a:{}}`). The bag's Gen
// distinguishes this residue as mapval_spread_required /
// listval_spread_required (versus the generic *_no_gen), and the
// expectation escapes to a real value the moment a concrete peer
// arrives (see Unify).
//
// Created ONLY by the MapVal peer-key loop (TS handleExpectedVal is
// called from MapVal.unify alone), so a list child is never an
// ExpectVal and listval_spread_required stays exactly as reachable as
// it is in TypeScript: registered vocabulary, no raise site today.
type ExpectVal struct {
	base
	peg    Val    // the expectation (the non-generable value)
	peer   Val    // accumulated concrete peer values
	parent Val    // the bag that created it; its site locates the error
	key    string // the peer key the expectation arrived under
}

func (e *ExpectVal) superior() Val { return top() }

// Canon is THE EXPECTATION ITSELF — the peg the peer must satisfy —
// exactly as in TS. It used to render as nothing, so a map holding an
// expect for key r canoned as `{"r":}`: text that is not a document and
// could not be reparsed, breaking canon's round-trip contract in both
// engines (issue #43).
//
// Not `top`, which was the first fix here and was wrong. An ExpectVal is
// created for EVERY peer-introduced non-generable key, not just for `&:`
// spread children — `m:{x:1} m:{y:string}` makes one at y with no spread
// in sight — so rendering `top` erased the `string` and the canon
// reparsed into a document that accepts values the original rejects. A
// canon that silently drops a constraint is worse than one that fails to
// parse.
//
// Which is why `peg` is kept the WHOLE expectation as peers arrive
// (BUGS.md 48) rather than only what was first written: see Unify.
func (e *ExpectVal) Canon() string { return e.peg.Canon() }

// Gen is unreachable: BagVal-level Gen intercepts an expect child (the
// *_spread_required branch) before ever calling child.Gen, for
// optional and required keys alike — the same interception order as TS
// BagVal.gen, whose ExpectVal.gen is likewise dead code. Silent,
// mirroring the FuncVal.Gen pattern for never-generated residue.
func (e *ExpectVal) Gen(ctx *Ctx) (any, error) {
	return nil, nil
}

// Unify mirrors TS ExpectVal.unify: accumulate concrete peers, meet
// them with the expectation, and ESCAPE to the united value as soon as
// it is generable (`m:{&:{r:string} a:{r:x}}` resolves a.r to "x").
// Until then the expect itself stays, done.
//
// PURE, deliberately (the unequal-spread crosswire, BUGS.md §6-§7,
// mirroring ts/src/val/ExpectVal.ts). The old body accumulated e.peer
// IN PLACE — invisible while an expectation only lived at one
// destination, but the spread-combination meet (MapVal.Unify) bakes an
// ExpectVal INTO the combined template, and a path-independent template
// is SHARED across every destination (spreadCloneFor). One stateful
// node in a shared template unified each sibling's own data with the
// next sibling's. An expectation that must keep accumulated state now
// answers with a NEW node, leaving the shared template untouched.
func (e *ExpectVal) Unify(peer Val, ctx *Ctx) Val {
	if peer != nil && !isTop(peer) {
		// THE PEER MEETS THE WHOLE EXPECTATION. `peg` already carries
		// every peer met so far (see below), so meeting the incoming
		// peer against the ACCUMULATED `peer` first -- as this did --
		// refused against only the atom that happened to reject:
		// `b:type({}) b:{u8:integer&min(0)&max(255)} a:$.b.u8&max(15)
		// a:20` said `with value: max(15)` where TypeScript said
		// `integer&min(0)&max(15)`, the residual the error's own hint
		// promises (BUGS.md 48). A conflict with `peg` is a conflict
		// with the accumulation too, since peg subsumes it, so nothing
		// stops being refused -- only the sentence changes.
		peeru := unite(ctx, peer, e.peg)
		if expectGenable(peeru) {
			peeru.setDc(DONE)
			return peeru
		}
		// Accumulated for the `expect` finding's operand only, now that
		// the meet is decided above.
		acc := peer
		if e.peer != nil {
			acc = unite(ctx, e.peer, peer)
		}
		// THE MEET IS THE NEW PEG (BUGS.md 48). An expectation that has
		// met a peer without being freed by it stands for `peg & peer`
		// from then on -- that is what a later peer must satisfy, and
		// what Canon has to state. Rebuilding from the ORIGINAL peg
		// dropped the peer everywhere the node was later copied (the bag
		// re-wrap in MapVal.Unify, clone), so `b:{z:1} b:{u8:min(0)}
		// a:$.b.u8&max(15)` -- whose reference resolves a pass late, so
		// `max(15)` arrives as a peer -- canoned as `min(0)`. That text
		// reparses into a document admitting 20, which the original
		// rejects, and hashed differently in each port. Storing the meet
		// in `peg` needs no new field and no carrying: every copy site
		// already preserves `peg`.
		//
		// Purity is untouched -- this is a NEW node, so a shared
		// template's own expectation keeps the peg it was written with
		// (6-7).
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

// expectGenable is the TS `isGenable` flag set, verbatim: the classes
// carrying `isGenable = true` in ts/src/val (ScalarVal, BagVal,
// ConjunctVal, DisjunctVal, FuncBaseVal, NilVal, PrefVal, RefVal).
// Ops (OpBaseVal), vars, kinds, constraints, top and expects are not.
// This is DELIBERATELY a different set from the bag-Gen `genable`
// (which classifies what a bag can EMIT — conjuncts and funcs fail
// there); this one classifies what escapes an expectation.
func expectGenable(v Val) bool {
	switch v.(type) {
	case *ScalarVal, *MapVal, *ListVal, *ConjunctVal, *DisjunctVal,
		*FuncVal, *NilVal, *PrefVal, *RefVal:
		return true
	}
	return false
}
