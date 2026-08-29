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

// canonEntity is the IDENTITY wrapper (G4 phase 1): `id("svc_auth")&{…}`,
// written as the conjunct an author writes, so canon reparses to the
// same entity. This deliberately differs from the type/hide MARKS,
// which canon drops (test/spec/marks.tsv, row `type-canon`): identity
// is semantic content, and G6's canon-hash must see it — two documents
// that disagree about which entity a node IS do not mean the same
// thing and must not hash alike.
//
// The name is JSON-quoted whatever it spells: `-` is not a bare-text
// character (test/spec/op-chars.tsv pins `a:6-2` as a parse error), so
// an unquoted `id(team-pay)` would not reparse. Mirrors canonEntity in
// ts/src/utility.ts.
func canonEntity(v Val) string {
	c := v.Canon()
	if "" == v.entityName() {
		return c
	}
	return "id(" + jsonString(v.entityName()) + ")&" + c
}

// canonRiders renders a value's canonical form wrapped in the RIDERS it
// carries — the identity (G4 phase 1) and the deprecation record (G3
// phase 4) — reparseably, so `id(name) & x` and `deprecate(x, m)`
// survive canon. Bags render their children through this
// (MapVal/ListVal Canon), which is where a marked FIELD — the realistic
// case — lives. Mirrors canonRiders in ts/src/utility.ts.
func canonRiders(v Val) string {
	c := canonEntity(v)
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

// walkClearEntity drops the identity from a value and everything under
// it (G4 phase 1, clearing rules 1 and 2). A reference's clone and a
// copy() are COPIES of an entity, not the entity: leaving the id on
// would merge the copy straight back into the original — making
// `copy()` a no-op for exactly the values it exists to detach, and
// making `w:b:$.q.a & {y:2,z:3}` (row `ref-and-merge`,
// test/spec/ref.tsv) push `y:2` back into `q.a`. It rides the same walk
// as the mark clearing, and is called at the same two sites, mirroring
// the `val.entity = undefined` lines in ts/src/val/RefVal.ts and
// ts/src/val/CopyFuncVal.ts.
func walkClearEntity(v Val) {
	// The LINK is NOT cleared here (G4 phase 3). An identity says what a
	// value IS, so a copy of an entity must not be that entity; a link
	// says what a value POINTS AT, and a copy of a link points at the
	// same thing. It is also the only answer the two ports can agree
	// on: a clone taken before the refer resolves carries a pending
	// residual that resolves — and stamps — on its own.
	walkMarkVals(v, func(n Val) { n.setEntityName("") })
}

// walkMarkVals applies fn to a value and every value under it — the one
// recursion shape the mark and identity walks share. It descends into
// junction terms and FUNCTION ARGUMENTS as well as bag children,
// because the TS `walk` in ts/src/utility.ts does: a mark walk that
// stopped at bags would miss the (possibly shared) arg trees of a
// pending call.
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

// hasMark reports whether a value or anything under it carries a
// type/hide mark — the question `refer`'s flow asks before paying for a
// clone (G4 phase 2): a flow type with no marks needs no clearing, and
// cloning one anyway moved the site an error names.
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
	to.setEntityName(from.entityName())
	to.setLinkAddr(from.linkAddr())
}
