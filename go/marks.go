/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// propagateMarks copies type/hide marks from one Val to another (mirrors
// propagateMarks in ts/src/utility.ts).
func propagateMarks(from, to Val) {
	if from.markedType() {
		to.setMarkType(true)
	}
	if from.markedHide() {
		to.setMarkHide(true)
	}
}

// markOn gives a meet the marks of both its sides (ruling 38), any's
// included, a top taking them on a fresh top as rideOn gives the riders.
func markOn(out, a, b Val) Val {
	mt := (nil != a && a.markedType()) || (nil != b && b.markedType())
	mh := (nil != a && a.markedHide()) || (nil != b && b.markedHide())
	if (!mt || out.markedType()) && (!mh || out.markedHide()) {
		return out
	}
	if isTop(out) {
		out = clonePath(out, out.vpath())
	}
	if mt {
		out.setMarkType(true)
	}
	if mh {
		out.setMarkHide(true)
	}
	return out
}

// unmarkedTemplate strips the marks around a spread's template (ruling
// 39), through a meet and the other riders, caching what it rebuilds
// since members record their template by identity.
func unmarkedTemplate(t Val) Val {
	fv, isFunc := t.(*FuncVal)
	if isFunc && (fv.name == "hide" || fv.name == "type") && len(fv.peg) > 0 {
		return unmarkedTemplate(fv.peg[0])
	}
	if isFunc && (riderFuncs[fv.name] || fv.name == "ident") && len(fv.peg) > 0 {
		if fv.unmarked != nil {
			return fv.unmarked
		}
		inner := unmarkedTemplate(fv.peg[0])
		if inner == fv.peg[0] {
			return fv
		}
		nf := *fv
		nf.peg = append([]Val{inner}, fv.peg[1:]...)
		fv.unmarked = &nf
		return fv.unmarked
	}
	cj, ok := t.(*ConjunctVal)
	if !ok {
		return t
	}
	if cj.unmarked != nil {
		return cj.unmarked
	}
	terms := make([]Val, len(cj.peg))
	changed := false
	for i, p := range cj.peg {
		terms[i] = unmarkedTemplate(p)
		changed = changed || terms[i] != p
	}
	if !changed {
		return cj
	}
	cj.unmarked = newConjunct(terms)
	return cj.unmarked
}

// walkMark sets or clears the type/hide marks on a Val and all of its
// descendants (the walk used by type(), hide() and copy()).
func walkMark(v Val, setType, typeVal, setHide, hideVal bool) {
	walkMarkVals(v, func(n Val) {
		if setType {
			n.setMarkType(typeVal)
		}
		if setHide {
			n.setMarkHide(hideVal)
		}
	})
}

func walkMarkVals(v Val, fn func(Val)) {
	fn(v)
	switch n := v.(type) {
	case *MapVal:
		for _, k := range n.keys {
			walkMarkVals(n.peg[k], fn)
		}
	case *ListVal:
		for _, e := range n.peg {
			walkMarkVals(e, fn)
		}
	case *ConjunctVal:
		for _, t := range n.peg {
			walkMarkVals(t, fn)
		}
	case *DisjunctVal:
		for _, t := range n.peg {
			walkMarkVals(t, fn)
		}
	case *PrefVal:
		walkMarkVals(n.peg, fn)
	case *FuncVal:
		for _, a := range n.peg {
			walkMarkVals(a, fn)
		}
	}
}

func hasMark(v Val) bool {
	out := false
	walkMarkVals(v, func(n Val) {
		if n.markedType() || n.markedHide() {
			out = true
		}
	})
	return out
}

func copyMarks(to, from Val) {
	to.setMarkType(from.markedType())
	to.setMarkHide(from.markedHide())
	to.setDeprecRec(from.deprecRec())
	to.setMetaRec(from.metaRec())
	to.setViaRec(from.viaRec())
	to.setIdentRec(from.identRec())
	to.setLinkAddr(from.linkAddr())
	to.setLinkInfo(from.linkInfo())
	// THE RENDER RIDERS TRAVEL WITH THE CLONE (P7), for the reason the
	// deprecation record does: a clone of a value read at `$.schema`
	// was read at `$.schema`, and a clone of an emitted piece is still
	// that dispatch's. Both are empty unless the run is instrumented.
	to.setReadAddr(from.readAddr())
	to.setEmitOrig(from.emitOrig())
}
