/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// unionRiders is the meet of rider records (ADR-051): each key holds a
// sorted set of distinct values, keyed by `key`, so the meet is
// commutative, idempotent, and never refuses.
func unionRiders[T any](key func(T) string, recs ...map[string][]T) map[string][]T {
	held := false
	sets := map[string]map[string]T{}
	for _, r := range recs {
		if nil == r {
			continue
		}
		held = true
		for k, vs := range r {
			if nil == sets[k] {
				sets[k] = map[string]T{}
			}
			for _, v := range vs {
				if _, has := sets[k][key(v)]; !has {
					sets[k][key(v)] = v
				}
			}
		}
	}
	if !held {
		return nil
	}
	out := map[string][]T{}
	for k, set := range sets {
		ids := make([]string, 0, len(set))
		for id := range set {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		vs := make([]T, len(ids))
		for i, id := range ids {
			vs[i] = set[id]
		}
		out[k] = vs
	}
	return out
}

func sameString(s string) string { return s }

func valCanon(v Val) string { return v.Canon() }

// riderLayers is the records a rider is written as: the first holds each
// key's first value, the second each key's second, so a reparse unions
// them back.
func riderLayers[T any](rec map[string][]T) []map[string]T {
	n := 0
	for _, vs := range rec {
		if n < len(vs) {
			n = len(vs)
		}
	}
	out := make([]map[string]T, n)
	for i := range out {
		out[i] = map[string]T{}
		for k, vs := range rec {
			if i < len(vs) {
				out[i][k] = vs[i]
			}
		}
	}
	return out
}

func layerText[T any](layer map[string]T, text func(T) string) string {
	keys := make([]string, 0, len(layer))
	for k := range layer {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = jsonString(k) + ":" + text(layer[k])
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// riderText wraps a value's rendering in its riders: the deprecation
// record, then the annotation record, each as the reparseable call that
// carries it.
func riderText(s string, v Val) string {
	if d := v.deprecRec(); nil != d {
		layers := riderLayers(d)
		if 0 == len(layers) {
			s = "deprecate(" + s + ")"
		}
		for _, l := range layers {
			s = "deprecate(" + s + "," + layerText(l, jsonString) + ")"
		}
	}
	if m := v.metaRec(); nil != m {
		parts := []string{s}
		for _, l := range riderLayers(m) {
			parts = append(parts, layerText(l, valCanon))
		}
		s = "meta(" + strings.Join(parts, ",") + ")"
	}
	return s
}

// CanonRiders is a value's canon inside its own riders, as its holder
// renders it: a container its members, the document its root.
func CanonRiders(v Val) string {
	return riderText(v.Canon(), v)
}

// ride gives the meet's result the union of its operands' riders.
func ride(out, a, b Val) {
	recs := []map[string][]string{out.deprecRec()}
	metas := []map[string][]Val{out.metaRec()}
	for _, v := range []Val{a, b} {
		if nil != v {
			recs = append(recs, v.deprecRec())
			metas = append(metas, v.metaRec())
		}
	}
	if dep := unionRiders(sameString, recs...); nil != dep {
		out.setDeprecRec(dep)
	}
	if meta := unionRiders(valCanon, metas...); nil != meta {
		out.setMetaRec(meta)
	}
}

// deprecationMessage is the one-line prose for a deprecation record;
// records met on one value read as one, each field's values joined.
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

// metaKeys is what each annotation key holds; `x` carries the keywords
// JSON Schema does not name, as a map of their values.
var metaKeys = map[string]string{
	"title": "string", "description": "string", "comment": "string", "format": "string",
	"contentEncoding": "string", "contentMediaType": "string",
	"readOnly": "boolean", "writeOnly": "boolean",
	"examples": "list", "x": "map",
	"default": "data", "contentSchema": "data",
}

// metaRecord reads a record whose every key is an annotation key holding
// its kind of concrete data; ok is false where any one does not.
func metaRecord(r Val) (map[string][]Val, bool) {
	m, isMap := r.(*MapVal)
	if !isMap || !isData(r) {
		return nil, false
	}
	out := map[string][]Val{}
	for _, k := range m.keys {
		v := m.peg[k]
		sv, scalar := v.(*ScalarVal)
		_, list := v.(*ListVal)
		_, mapped := v.(*MapVal)
		fits := false
		switch metaKeys[k] {
		case "data":
			fits = true
		case "string":
			fits = scalar && (KindString == sv.kind || KindPath == sv.kind)
		case "boolean":
			fits = scalar && KindBoolean == sv.kind
		case "list":
			fits = list
		case "map":
			fits = mapped
		}
		if !fits {
			return nil, false
		}
		out[k] = []Val{v}
	}
	return out, true
}

// isData reports concrete JSON data: a scalar, or a map or list of them
// with no spread and no optional key.
func isData(v Val) bool {
	switch n := v.(type) {
	case *ScalarVal:
		return true
	case *MapVal:
		if nil != n.spread || 0 < len(n.optional) {
			return false
		}
		for _, k := range n.keys {
			if !isData(n.peg[k]) {
				return false
			}
		}
		return true
	case *ListVal:
		if nil != n.spread {
			return false
		}
		for _, e := range n.peg {
			if !isData(e) {
				return false
			}
		}
		return true
	}
	return false
}

// metaTexts is the text values a value's annotation record holds under
// one key.
func metaTexts(v Val, key string) []string {
	out := []string{}
	for _, t := range v.metaRec()[key] {
		if sv, ok := t.(*ScalarVal); ok {
			if str, ok := sv.peg.(string); ok {
				out = append(out, str)
			}
		}
	}
	return out
}
