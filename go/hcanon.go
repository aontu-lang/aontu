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
		out.WriteByte('{')
		if b.spread != nil {
			out.WriteString("&:")
			out.WriteString(hcanonRender(b.spread, inner))
			if len(b.keys) > 0 {
				out.WriteByte(',')
			}
		}
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

	// The riders ride outermost, as canonRiders renders them (the
	// wrappers are all reparseable calls, so order only has to be FIXED,
	// matching ts/src/hcanon.ts).
	return wrapRiders(s, v)
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

func CanonHash(v Val) string {
	sum := sha256.Sum256([]byte(Hcanon(v)))
	return "aon1-" + base64.RawURLEncoding.EncodeToString(sum[:])
}
