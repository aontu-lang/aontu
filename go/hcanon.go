/* Copyright (c) 2025 Richard Rodger, MIT License */


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
		keys := make([]string, 0, len(b.keys))
		for _, k := range b.keys {
			if !b.isAliasKey(k) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		text := func(t Val) string { return hcanonRender(t, inner) }
		out.WriteByte('{')
		out.WriteString(spreadText(b.spread, 0 < len(keys), text))
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
		s = relateText(b) + s
	case *ListVal:
		var out strings.Builder
		text := func(t Val) string { return hcanonRender(t, inner) }
		out.WriteByte('[')
		out.WriteString(spreadText(b.spread, 0 < len(b.peg), text))
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
		s = relateText(b) + s
	case *PrefVal:
		s = "*" + hcanonRender(b.peg, inner)
	case *ConjunctVal:
		s = hcanonJunction(b.peg, "&", inner)
	case *DisjunctVal:
		s = hcanonJunction(b.peg, "|", inner)
	case *RefVal:
		if nil != b.expansion {
			s = hcanonRender(b.expansion, inner)
		} else {
			s = v.Canon()
		}
	default:
		s = v.Canon()
	}

	if mtype && !inh.mtype {
		s = "type(" + s + ")"
	}
	if mhide && !inh.mhide {
		s = "hide(" + s + ")"
	}

	// The riders go outermost, as CanonRiders renders them: the
	// wrappers are reparseable calls, so the order only has to be fixed.
	return riderText(s, v)
}

// hcanonJunction joins junction members, keeping junctChildCanon's
// parenthesisation rule exactly: a child that is itself a junction
// with more than one term keeps its parens so the text reparses with
// the same structure.
func hcanonJunction(members []Val, sym string, inner hcanonMarks) string {
	terms, parts := spelled(members, func(m Val) string {
		wrap := false
		switch t := m.(type) {
		case *ConjunctVal:
			wrap = len(t.peg) > 1
		case *DisjunctVal:
			wrap = len(t.peg) > 1
		}
		if wrap {
			return "(" + hcanonRender(m, inner) + ")"
		}
		return hcanonRender(m, inner)
	})
	// As canon writes a meet: terms of one rank in code-point order.
	if "&" == sym {
		parts = meetOrder(terms, parts)
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

func CanonHash(v Val) string {
	sum := sha256.Sum256([]byte(Hcanon(v)))
	return "aon1-" + base64.RawURLEncoding.EncodeToString(sum[:])
}
