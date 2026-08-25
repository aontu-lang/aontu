/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE PROVENANCE RECORDER (G7 phase 4, the Go side of
// ts/src/provenance.ts): what CONTRIBUTED to the value at a path, in
// order, with the site each contribution was written at. `why` is the
// positive twin of G2's error report — errors explain what failed to
// unify, this explains what did.
//
// The recorder rides the CONTEXT and is off by default: unite pays one
// nil check on the normal path, and an instrumented run pays site
// materialisation knowingly. It records at unite and nowhere else,
// because that is the one place every meet passes through — the same
// reason G3's deprecation rider lives there.

package aontu

import (
	"sort"
	"strings"
)

const (
	WhyLiteral = "literal"
	WhySpread  = "spread"
	WhyRef     = "ref"
	WhyPref    = "pref"
)

// WhySite is the G2 site object, minus its data/schema role: a
// contribution's role is its own, and a `why` run has one document.
type WhySite struct {
	Col  int    `json:"col"`
	File string `json:"file"`
	// Len is the extent in UTF-16 code units, or -1 when unknown. The
	// same field, and the same meaning, as VetSite.Len (go/vet.go).
	Len int `json:"len"`
	Row int `json:"row"`
}

type WhyConjunct struct {
	Canon string  `json:"canon"`
	Role  string  `json:"role"`
	Site  WhySite `json:"site"`
	// Src is the SOURCE TEXT this contribution was written as.
	//
	// Canon is the value; Src is the spelling. They are not the same
	// thing, and the difference is the whole reason this record exists:
	// `port: 0x1F` contributes canon `31` from source `0x1F`, so a
	// reader told only the canon cannot find, verify or replace what was
	// actually written. Empty when the contribution occupies no source
	// -- a value unification minted rather than a document wrote.
	//
	// LEXICOGRAPHIC field order, as everywhere the two emitters must
	// agree byte for byte: src sorts after site.
	Src string `json:"src"`
}

type WhyRecord struct {
	Conjuncts []WhyConjunct `json:"conjuncts"`
	Path      string        `json:"path"`
	Value     string        `json:"value"`
}

type whyContribution struct {
	WhyConjunct
	// The value itself: Go has no per-Val id (TypeScript's Val.id),
	// and pointer identity says the same thing here — every Val is a
	// pointer, and one run never reuses an address for two values.
	val Val
}

type whyPathRecord struct {
	conjuncts []whyContribution
	// Ids of values PRODUCED by a meet at this path: an operand among
	// them is an intermediate result, not a source contribution.
	made map[Val]bool
	// Values structurally INSIDE a contribution: a disjunct's members,
	// a constraint's atoms.
	inside map[Val]bool
	seen   map[Val]bool
}

// Provenance is the recorder itself. Mirrors the class in
// ts/src/provenance.ts.
type Provenance struct {
	paths map[string]*whyPathRecord
	// Ids of the values the AUTHOR WROTE: everything in the parsed
	// tree, stamped before unification starts. A value minted during
	// unification is the engine's own work, not a contribution the
	// author can be pointed at. The one exception is a SPREAD clone,
	// which is an authored template re-minted per key and says so.
	written map[Val]bool
	// The entry source, for turning a byte offset into row and column.
	src string
}

func newProvenance(src string) *Provenance {
	return &Provenance{
		paths:   map[string]*whyPathRecord{},
		written: map[Val]bool{},
		src:     src,
	}
}

// writtenFrom stamps the parsed tree. Called once, before unify, by Why.
func (p *Provenance) writtenFrom(v Val) {
	if nil == v || p.written[v] {
		return
	}
	p.written[v] = true
	for _, k := range whyKids(v) {
		p.writtenFrom(k)
	}
}

// whyKids is the structural walk both the written stamp and the
// inside-set share: bag children and spread, junction members, func
// arguments, a preference's value.
func whyKids(v Val) []Val {
	switch b := v.(type) {
	case *MapVal:
		out := make([]Val, 0, len(b.keys)+1)
		for _, k := range b.keys {
			out = append(out, b.peg[k])
		}
		if nil != b.spread {
			out = append(out, b.spread)
		}
		return out
	case *ListVal:
		out := append([]Val{}, b.peg...)
		if nil != b.spread {
			out = append(out, b.spread)
		}
		return out
	case *ConjunctVal:
		return b.peg
	case *DisjunctVal:
		return b.peg
	case *PrefVal:
		return []Val{b.peg}
	case *FuncVal:
		return b.peg
	case *PlusOpVal:
		return b.peg
	}
	return nil
}

func (p *Provenance) whyRole(v Val) string {
	if v.fromSpread() {
		return WhySpread
	}
	switch v.(type) {
	case *RefVal:
		return WhyRef
	case *PrefVal:
		return WhyPref
	}
	return WhyLiteral
}

// record is one meet. Both operands are candidate contributions; the
// result is remembered so a later meet does not mistake it for a
// source.
func (p *Provenance) record(path []string, a, b, out Val) {
	key := strings.Join(path, ".")
	rec, ok := p.paths[key]
	if !ok {
		rec = &whyPathRecord{
			made:   map[Val]bool{},
			inside: map[Val]bool{},
			seen:   map[Val]bool{},
		}
		p.paths[key] = rec
	}

	p.contribute(rec, a)
	p.contribute(rec, b)

	if nil != out && out != a && out != b {
		rec.made[out] = true
	}
}

func (p *Provenance) contribute(rec *whyPathRecord, v Val) {
	// TOP is the unit element and a nil is a failure, neither of which
	// is information the author wrote. A value an earlier meet MADE is
	// an intermediate; the source that made it is already recorded.
	if nil == v || isTop(v) || v.Nil() ||
		rec.made[v] || rec.seen[v] {
		return
	}
	// Not the author's: see `written`.
	if !p.written[v] && !v.fromSpread() {
		return
	}
	// A CONJUNCT is not one contribution, it is the statement that
	// several must all hold — duplicate keys merged at parse, an
	// explicit `a & b`. Its own site is nowhere (the merge has no
	// source position), while its terms each have one, which is what
	// the author needs to be shown.
	if cj, isc := v.(*ConjunctVal); isc {
		rec.seen[v] = true
		for _, term := range cj.peg {
			p.contribute(rec, term)
		}
		return
	}

	rec.seen[v] = true
	// Everything INSIDE this value is part of it, not a further
	// contribution beside it.
	whyInsideIds(v, rec.inside)

	row, col := -1, -1
	if 0 <= v.pos() {
		row, col = rowCol(p.src, v.pos())
	}
	rec.conjuncts = append(rec.conjuncts, whyContribution{
		WhyConjunct: WhyConjunct{
			Canon: v.Canon(),
			Role:  p.whyRole(v),
			Site: WhySite{
				Col: col, File: v.srcurl(), Len: v.srclen(), Row: row,
			},
			Src: v.srctext(),
		},
		val: v,
	})
}

func whyInsideIds(v Val, out map[Val]bool) {
	for _, k := range whyKids(v) {
		if nil != k && !out[k] {
			out[k] = true
			whyInsideIds(k, out)
		}
	}
}

// at answers the record at one path. Empty when nothing met there — a
// value written once and never unified against anything has no
// conjuncts, which is a true and useful answer rather than an error.
//
// ONLY WHOLE WRITTEN VALUES are contributions: a Val's own Unify
// re-enters unite at the same path (a disjunct trials each member
// there), and those members are PARTS OF one written value.
//
// SOURCE ORDER, not meet order: the two are the same in simple cases
// and diverge with the fixpoint's fold order, which is an engine detail
// and a parity risk. Sites are parse data, identical in both ports.
func (p *Provenance) at(path []string) []WhyConjunct {
	rec, ok := p.paths[strings.Join(path, ".")]
	if !ok {
		return []WhyConjunct{}
	}
	out := []WhyConjunct{}
	for _, c := range rec.conjuncts {
		if !rec.inside[c.val] {
			out = append(out, c.WhyConjunct)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Site.File != b.Site.File {
			return a.Site.File < b.Site.File
		}
		if a.Site.Row != b.Site.Row {
			return a.Site.Row < b.Site.Row
		}
		if a.Site.Col != b.Site.Col {
			return a.Site.Col < b.Site.Col
		}
		return a.Canon < b.Canon
	})
	return out
}
