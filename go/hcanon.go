/* Copyright (c) 2025 Richard Rodger, MIT License */

// The HASH FORM (G6 phase 0, the Go side of ts/src/hcanon.ts): exactly
// the unify-level canon with the additions that close its semantic
// gaps — a CLOSED map or list renders wrapped (close({...}),
// close([...])) and the type/hide MARKS render as their builtin
// wrappers (type(x), hide(x)). Both reuse parseable syntax, so the
// hash form remains valid Aontu source and round-trips
// (test/spec/hcanon.tsv). User-facing Canon() is UNCHANGED.
//
// The marks propagate to every descendant at unification (walkMark),
// so a wrapper is emitted only where a mark STARTS: the walk carries
// the inherited marks down and a child whose mark the parent already
// carries renders bare.
//
// CanonHash (G6 phase 1) is the pin built on it:
//
//	"aon1-" + base64url( SHA-256( UTF-8( Hcanon(v) ) ) )
//
// (unpadded base64url, RFC 4648 section 5). The "aon1-" scheme id
// exists so a future semantically-stronger normal form is an upgrade,
// not a breakage.

package aontu

import (
	"crypto/sha256"
	"encoding/base64"
	"sort"
	"strings"
)

type hcanonMarks struct {
	mtype bool
	mhide bool
}

// hcanonRender is one node's rendering, carrying the marks the
// ANCESTORS already wrapped. Bags and junctions recurse structurally
// (their Canon methods render children through plain Canon, which
// would drop a nested close); everything else — scalars, kinds, funcs,
// refs, constraints — delegates to its own Canon, whose text is
// already in cross-port parity.
func hcanonRender(v Val, inh hcanonMarks) string {
	if nil == v {
		return "nil"
	}

	mtype := v.markedType()
	mhide := v.markedHide()
	inner := hcanonMarks{
		mtype: inh.mtype || mtype,
		mhide: inh.mhide || mhide,
	}

	var s string
	switch b := v.(type) {
	case *MapVal:
		var out strings.Builder
		out.WriteByte('{')
		if b.spread != nil {
			out.WriteString("&:")
			out.WriteString(hcanonRender(b.spread, inner))
			if len(b.keys) > 0 {
				out.WriteByte(',')
			}
		}
		// Alias declarations are dropped here for the same reason
		// MapVal.Canon drops them, and this is the surface where it
		// counts: `aon1-` pins MEANING, so a document written with
		// aliases and the same document written longhand must hash to
		// one string. Two renderers, one rule -- hcanon is not Canon
		// and does not inherit the filter.
		keys := make([]string, 0, len(b.keys))
		for _, k := range b.keys {
			if !b.isAliasKey(k) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		first := true
		for _, k := range keys {
			if !first {
				out.WriteByte(',')
			}
			first = false
			out.WriteString(jsonString(k))
			if b.isOptional(k) {
				out.WriteByte('?')
			}
			out.WriteByte(':')
			out.WriteString(hcanonRender(b.peg[k], inner))
		}
		out.WriteByte('}')
		s = out.String()
		if b.closed {
			s = "close(" + s + ")"
		}
	case *ListVal:
		var out strings.Builder
		out.WriteByte('[')
		if b.spread != nil {
			out.WriteString("&:")
			out.WriteString(hcanonRender(b.spread, inner))
			if len(b.peg) > 0 {
				out.WriteByte(',')
			}
		}
		for i, e := range b.peg {
			if i > 0 {
				out.WriteByte(',')
			}
			out.WriteString(hcanonRender(e, inner))
		}
		out.WriteByte(']')
		s = out.String()
		if b.closed {
			s = "close(" + s + ")"
		}
	case *PrefVal:
		s = "*" + hcanonRender(b.peg, inner)
	case *ConjunctVal:
		s = hcanonJunction(b.peg, "&", inner)
	case *DisjunctVal:
		s = hcanonJunction(b.peg, "|", inner)
	default:
		s = v.Canon()
	}

	// The IDENTITY is innermost, exactly as canon writes it (G4 phase
	// 1). It is IN the hash — a node declared `id(svc/auth)` and the
	// same node declared `id(svc/billing)` describe different systems,
	// and a pin that could not tell them apart would be a pin on the
	// shape rather than on the meaning. Mirrors ts/src/hcanon.ts.
	if e := v.entityName(); "" != e {
		s = "id(" + jsonString(e) + ")&" + s
	}

	if mtype && !inh.mtype {
		s = "type(" + s + ")"
	}
	if mhide && !inh.mhide {
		s = "hide(" + s + ")"
	}

	// The deprecation record rides outermost, as canonRiders
	// renders it (the wrappers are all reparseable calls, so order
	// only has to be FIXED, matching ts/src/hcanon.ts).
	if d := v.deprecRec(); nil != d {
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
			s = "deprecate(" + s + ")"
		} else {
			s = "deprecate(" + s + ",{" + rec + "})"
		}
	}

	return s
}

// hcanonJunction joins junction members, keeping junctChildCanon's
// parenthesisation rule exactly: a child that is itself a junction
// with more than one term keeps its parens so the text reparses with
// the same structure.
func hcanonJunction(members []Val, sym string, inner hcanonMarks) string {
	parts := make([]string, len(members))
	for i, m := range members {
		wrap := false
		switch t := m.(type) {
		case *ConjunctVal:
			wrap = len(t.peg) > 1
		case *DisjunctVal:
			wrap = len(t.peg) > 1
		}
		if wrap {
			parts[i] = "(" + hcanonRender(m, inner) + ")"
		} else {
			parts[i] = hcanonRender(m, inner)
		}
	}
	return strings.Join(parts, sym)
}

// Hcanon is the hash form of an EVALUATED Val (unify first;
// parse-level canon parenthesisation differs between the ports and is
// excluded by construction — AGENTS.md). Mirrors hcanon in
// ts/src/hcanon.ts.
func Hcanon(v Val) string {
	return hcanonRender(v, hcanonMarks{})
}

// CanonHash is the canon-hash pin. Scoped to the module evaluated
// STANDALONE: its own include closure resolved and unified at its own
// root, before any consumer context — which is what makes the pin
// transitive (an edit two includes deep changes the unified root,
// hence the hash). Mirrors canonHash in ts/src/hcanon.ts.
func CanonHash(v Val) string {
	sum := sha256.Sum256([]byte(Hcanon(v)))
	return "aon1-" + base64.RawURLEncoding.EncodeToString(sum[:])
}
