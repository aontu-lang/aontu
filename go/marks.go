/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "sort"

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

func canonRiders(v Val) string {
	c := v.Canon()
	d := v.deprecRec()
	if nil == d {
		return c
	}
	keys := make([]string, 0, len(d))
	for k := range d {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	rec := ""
	for i, k := range keys {
		if 0 < i {
			rec += ","
		}
		rec += jsonString(k) + ":" + jsonString(d[k])
	}
	if "" == rec {
		return "deprecate(" + c + ")"
	}
	return "deprecate(" + c + ",{" + rec + "})"
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
	to.setLinkAddr(from.linkAddr())
	// THE RENDER RIDERS TRAVEL WITH THE CLONE (P7), for the reason the
	// deprecation record does: a clone of a value read at `$.schema`
	// was read at `$.schema`, and a clone of an emitted piece is still
	// that dispatch's. Both are empty unless the run is instrumented.
	to.setReadAddr(from.readAddr())
	to.setEmitOrig(from.emitOrig())
	to.setAliasOrigin(from.aliasOrigin())
}
