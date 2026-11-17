/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


// GraphAtomVal is a graph atom met with nothing: the declaration alone.
// Met with a value it hands the value back as it is, and the meet's
// riders carry the declaration on to it, as they carry `meta()` and
// `deprecate()`. Mirrors ts/src/val/GraphAtomVal.ts.
type GraphAtomVal struct {
	base
}

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

func newGraphAtom(d *declRecord) *GraphAtomVal {
	g := &GraphAtomVal{}
	g.site.sp = unsited
	g.decl = d
	g.dc = DONE
	return g
}

func (g *GraphAtomVal) cjo() int      { return 46000 }
func (g *GraphAtomVal) superior() Val { return top() }

func (g *GraphAtomVal) Unify(peer Val, ctx *Ctx) Val {
	// Atoms meet on a fresh value, since each may be written elsewhere.
	if isGraphAtom(peer) {
		return clonePath(g, g.path)
	}
	if isTop(peer) {
		return g
	}
	return peer
}

func (g *GraphAtomVal) Canon() string { return graphAtomsText(g.decl) }

// Gen is silent, as an unmet relate() is: the verdict is the relation's.
func (g *GraphAtomVal) Gen(ctx *Ctx) (any, error) { return nil, nil }

func isGraphAtom(v Val) bool {
	_, ok := v.(*GraphAtomVal)
	return ok
}
