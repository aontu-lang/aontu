/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE GRAPH ATOMS (RELATIONS.0.md §3.3): `acyclic()` and
// `inverse(name)`, conjoined at the same field as the `rel()` they
// govern. Their model is the sizing atoms -- a property that cannot be
// decided while information can still arrive is HELD during
// unification and DECIDED at generation, where no more can.
//
// During unification they are lattice-inert: both properties are
// global and non-monotone (one more edge can make an acyclic graph
// cyclic), and the lattice guarantee -- more information never
// falsifies what has been observed -- forbids a constraint that could
// answer true and then false. So the atoms only REGISTER the
// declaration on the context and CARRY the field's value (the
// sizing-constraint shape: the atom absorbs its fold neighbours, so
// the pairwise fold still merges the value across it). The verdict
// lands at generation (relationFindings, relation.go) and is reported
// identically by the `relations` verb -- one decision, two surfaces.
// Mirrors GraphAtomVal in ts/src/val/GraphAtomVal.ts.

import (
	"strconv"
)

// relDecl is what one predicate's atoms declared: additive, exactly as
// two statements of one map are.
type relDecl struct {
	acyclic  bool
	inverses map[string]bool
}

type GraphAtomVal struct {
	base
	akind   string // "acyclic" | "inverse"
	invname string
	// The value the atom rides on; nil until the atom meets one.
	held Val
}

// predicateNameOK is the D-1 relation-predicate grammar
// (docs/design/RELATIONS.0.md §3.2): a letter or `_`, then letters,
// digits, `_` or `-`. Entity names are gone with ADR-014; PREDICATE
// names are not -- a relation is a vocabulary term, not an address.
// Written as an explicit loop rather than a regexp so the two ports
// cannot drift on a character class. Mirrors PREDICATE_NAME in
// ts/src/val/ReferFuncVal.ts.
func predicateNameOK(s string) bool {
	if "" == s {
		return false
	}
	for i, r := range s {
		switch {
		case 'a' <= r && r <= 'z':
		case 'A' <= r && r <= 'Z':
		case '_' == r:
		case '0' <= r && r <= '9':
			if 0 == i {
				return false
			}
		case '-' == r:
			if 0 == i {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// predicateName is the predicate name an argument spells, or ok=false
// when it does not spell one. A bare `dependedOnBy` parses as a string,
// as does `"dep-on"`; anything else is not a name.
func predicateName(v Val) (string, bool) {
	sv, ok := v.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return "", false
	}
	s, ok := sv.peg.(string)
	if !ok { //coverage:ignore a string-kind scalar always holds a string
		return "", false
	}
	if !predicateNameOK(s) {
		return "", false
	}
	return s, true
}

func newGraphAtom(akind, invname string, held Val) *GraphAtomVal {
	g := &GraphAtomVal{akind: akind, invname: invname, held: held}
	g.sp = unsited
	// A settled residual, like an unmet rel(): the bare atom is its
	// own value, and a type() body carrying one must settle. Holding
	// an unsettled value, it is exactly as done as the value.
	g.dc = DONE
	if nil != held && DONE != held.Dc() {
		g.dc = 0
	}
	return g
}

func (g *GraphAtomVal) cjo() int      { return 46000 }
func (g *GraphAtomVal) superior() Val { return top() }

// register records the declaration for the predicate the atom sits on
// -- the last segment of its path, when that segment is a D-1 NAME (an
// atom landed anywhere else declares nothing). Idempotent, at every
// drive, so whichever pass first sees the atom at its landed position
// records it. The registry is lazily made on the shared *Ctx.
func (g *GraphAtomVal) register(ctx *Ctx) {
	if nil == ctx || 0 == len(g.path) {
		return
	}
	seg := g.path[len(g.path)-1]
	if !predicateNameOK(seg) {
		return
	}
	if nil == ctx.reldecls {
		ctx.reldecls = map[string]*relDecl{}
	}
	d := ctx.reldecls[seg]
	if nil == d {
		d = &relDecl{inverses: map[string]bool{}}
		ctx.reldecls[seg] = d
	}
	if "acyclic" == g.akind {
		d.acyclic = true
	} else if "" != g.invname {
		d.inverses[g.invname] = true
	}
}

// carry is a rebuilt atom around a new held, at this atom's position.
func (g *GraphAtomVal) carry(held Val) *GraphAtomVal {
	out := newGraphAtom(g.akind, g.invname, held)
	copyMarks(out, g)
	out.sp, out.spu, out.surl = g.sp, g.spu, g.surl
	out.path = cp(g.path)
	return out
}

func (g *GraphAtomVal) Unify(peer Val, ctx *Ctx) Val {
	g.register(ctx)

	// The self-drive: the dispatcher hands a not-done result top() to
	// finish converging, and the held is what still has work to do. (A
	// nil-valued peer never arrives -- unite's ladder absorbs it.)
	if nil == peer || isTop(peer) {
		if nil == g.held {
			return g
		}
		if DONE == g.held.Dc() {
			// Doneness is monotone, so recording it in place is safe
			// -- and without it the bag walk keeps asking and
			// generation refuses a finished value.
			g.dc = DONE
			return g
		}
		// The self-drive refines IN PLACE (the MapVal top-peer
		// pattern): a fresh atom per pass changes object identity, so
		// spread apply-once stamps and the entity merge's fast paths
		// stop holding, and the enclosing bags re-open every pass --
		// the service catalog never converged.
		held := unite(ctx, g.held, nil)
		if held.Nil() {
			return held
		}
		g.held = held
		if DONE == held.Dc() {
			g.dc = DONE
		}
		return g
	}

	// The SAME declaration twice is one declaration; their helds merge.
	if pg, ok := peer.(*GraphAtomVal); ok &&
		pg.akind == g.akind && pg.invname == g.invname {
		var held Val
		switch {
		case nil == g.held:
			held = pg.held
		case nil == pg.held:
			held = g.held
		default:
			held = unite(ctx, g.held, pg.held)
		}
		if nil == held {
			return g
		}
		if held.Nil() {
			return held
		}
		return g.carry(held)
	}

	// Anything else -- the rel, the container, a different atom -- is
	// ABSORBED: the atom carries the value and the fold's pairwise
	// walk merges across it.
	var held Val
	if nil == g.held {
		held = peer
	} else {
		held = unite(ctx, g.held, peer)
	}
	if held.Nil() {
		return held
	}
	return g.carry(held)
}

func (g *GraphAtomVal) Canon() string {
	own := "acyclic()"
	if "inverse" == g.akind {
		own = "inverse(" + strconv.Quote(g.invname) + ")"
	}
	if nil == g.held {
		return own
	}
	return g.held.Canon() + "&" + own
}

func (g *GraphAtomVal) Gen(ctx *Ctx) (any, error) {
	// The atom is transparent at generation -- its verdict is global
	// (relationFindings), never a value at this field -- and a BARE
	// atom is silent, exactly as an unmet rel() is.
	if nil == g.held {
		return nil, nil
	}
	return g.held.Gen(ctx)
}

func isGraphAtom(v Val) bool {
	_, ok := v.(*GraphAtomVal)
	return ok
}
