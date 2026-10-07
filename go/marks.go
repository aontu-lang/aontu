/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

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
	return wrapRiders(v.Canon(), v)
}

// unionRider is a rider's meet: key by key, the union of their value
// sets, kept sorted by canon so that the meet commutes.
func unionRider[T any](a, b map[string][]T, canon func(T) string) map[string][]T {
	if nil == a || nil == b {
		if nil == a {
			return b
		}
		return a
	}
	out := make(map[string][]T, len(a)+len(b))
	for k, vs := range a {
		out[k] = vs
	}
	for k, vs := range b {
		byCanon := map[string]T{}
		for _, t := range append(append([]T{}, a[k]...), vs...) {
			if _, has := byCanon[canon(t)]; !has {
				byCanon[canon(t)] = t
			}
		}
		keys := make([]string, 0, len(byCanon))
		for c := range byCanon {
			keys = append(keys, c)
		}
		sort.Strings(keys)
		merged := make([]T, 0, len(keys))
		for _, c := range keys {
			merged = append(merged, byCanon[c])
		}
		out[k] = merged
	}
	return out
}

// riderLayers writes a rider as records, the i-th holding each key's
// i-th value, which a reparse unions back to the same rider.
func riderLayers[T any](r map[string][]T, render func(T) string) []string {
	keys := make([]string, 0, len(r))
	for k := range r {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := []string{}
	for i := 0; ; i++ {
		parts := []string{}
		for _, k := range keys {
			if i < len(r[k]) {
				parts = append(parts, jsonString(k)+":"+render(r[k][i]))
			}
		}
		if 0 == len(parts) {
			return out
		}
		out = append(out, "{"+strings.Join(parts, ",")+"}")
	}
}

func valCanon(v Val) string   { return v.Canon() }
func strSelf(s string) string { return s }

// plainData: what JSON can hold, with nothing left to resolve.
func plainData(v Val) bool {
	switch t := v.(type) {
	case *ScalarVal:
		return true
	case *ListVal:
		for _, e := range t.peg {
			if !plainData(e) {
				return false
			}
		}
		return nil == t.spread
	case *MapVal:
		for _, k := range t.keys {
			if !plainData(t.peg[k]) {
				return false
			}
		}
		return nil == t.spread && 0 == len(t.optional)
	}
	return false
}

// metaTexts reads a text key's values off v's meta() rider.
func metaTexts(v Val, key string) []string {
	var out []string
	for _, m := range v.metaRec()[key] {
		out = append(out, m.(*ScalarVal).peg.(string))
	}
	return out
}

func metaText(v Val) bool {
	s, ok := v.(*ScalarVal)
	return ok && KindString == s.kind
}

func metaFlag(v Val) bool {
	s, ok := v.(*ScalarVal)
	return ok && KindBoolean == s.kind
}

// metaKeys is the record's whole vocabulary, each key with the values it
// may hold (G12 design, section 12).
var metaKeys = map[string]func(Val) bool{
	"title": metaText, "description": metaText, "comment": metaText,
	"format": metaText, "contentEncoding": metaText,
	"contentMediaType": metaText, "readOnly": metaFlag, "writeOnly": metaFlag,
	"default": plainData, "contentSchema": plainData,
	"examples": func(v Val) bool { _, ok := v.(*ListVal); return ok && plainData(v) },
	"x":        func(v Val) bool { _, ok := v.(*MapVal); return ok && plainData(v) },
}

// deprecationMessage is the one-line prose for a deprecation record,
// shared by vet's warning findings and the LSP's tagged diagnostics.
func deprecationMessage(rec map[string][]string) string {
	msg := "deprecated"
	if m := strings.Join(rec["msg"], "; "); "" != m {
		msg += ": " + m
	}
	if u, ok := rec["use"]; ok {
		msg += " (use " + strings.Join(u, "; ") + ")"
	}
	if sv, ok := rec["since"]; ok {
		msg += " (since " + strings.Join(sv, "; ") + ")"
	}
	return msg
}

// carryRiders lands the riders of a meet's operands on its result.
func hasRiders(v Val) bool {
	return nil != v && (nil != v.deprecRec() || nil != v.metaRec())
}

func carryRiders(out, a, b Val) {
	d, m := out.deprecRec(), out.metaRec()
	for _, v := range []Val{a, b} {
		if nil != v {
			d = unionRider(d, v.deprecRec(), strSelf)
			m = unionRider(m, v.metaRec(), valCanon)
		}
	}
	out.setDeprecRec(d)
	out.setMetaRec(m)
}

func wrapRiders(c string, v Val) string {
	if d := v.deprecRec(); nil != d {
		ls := riderLayers(d, jsonString)
		if 0 == len(ls) {
			c = "deprecate(" + c + ")"
		}
		for _, l := range ls {
			c = "deprecate(" + c + "," + l + ")"
		}
	}
	if m := v.metaRec(); nil != m {
		c = "meta(" + strings.Join(append([]string{c}, riderLayers(m, valCanon)...), ",") + ")"
	}
	return c
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
	to.setLinkAddr(from.linkAddr())
	// THE RENDER RIDERS TRAVEL WITH THE CLONE (P7), for the reason the
	// deprecation record does: a clone of a value read at `$.schema`
	// was read at `$.schema`, and a clone of an emitted piece is still
	// that dispatch's. Both are empty unless the run is instrumented.
	to.setReadAddr(from.readAddr())
	to.setEmitOrig(from.emitOrig())
	to.setAliasOrigin(from.aliasOrigin())
}
