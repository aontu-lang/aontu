/* Copyright (c) 2025 Richard Rodger, MIT License */

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
	Len  int    `json:"len"`
	Row  int    `json:"row"`
}

type WhyConjunct struct {
	Canon string  `json:"canon"`
	Rank  *int    `json:"rank,omitempty"`
	Role  string  `json:"role"`
	Site  WhySite `json:"site"`
	Src   string  `json:"src"`
}

type WhyRecord struct {
	Conjuncts []WhyConjunct `json:"conjuncts"`
	Path      string        `json:"path"`
	Value     string        `json:"value"`
}

type whyContribution struct {
	WhyConjunct
	val Val
}

type whyPathRecord struct {
	conjuncts []whyContribution
	// Ids of values PRODUCED by a meet at this path: an operand among
	// them is an intermediate result, not a source contribution.
	made map[Val]bool
	seen map[Val]bool
}

// Provenance is the recorder itself. Mirrors the class in
// ts/src/provenance.ts.
type Provenance struct {
	paths map[string]*whyPathRecord
	// The entry source, for turning a byte offset into row and column.
	src   string
	texts map[string]string
}

func newProvenance(src string, texts map[string]string) *Provenance {
	return &Provenance{
		paths: map[string]*whyPathRecord{},
		src:   src,
		texts: texts,
	}
}

func (p *Provenance) writtenFrom(v Val) {
	if nil == v || v.written() {
		return
	}
	v.setWritten()
	for _, k := range whyKids(v) {
		p.writtenFrom(k)
	}
	// OUTERMOST WINS: the walk is top-down, so a value already pointed
	// at a container is inside that one and this one, and the answer the
	// author wants is the whole written statement. See base.finner.
	for _, k := range samePathKids(v) {
		if nil == k.innerOf() {
			k.setInnerOf(v)
		}
	}
}

func samePathKids(v Val) []Val {
	switch b := v.(type) {
	case *DisjunctVal:
		return b.peg
	case *PrefVal:
		if nil == b.peg {
			return nil
		}
		return []Val{b.peg}
	case *FuncVal:
		return b.peg
	case *PlusOpVal:
		return b.peg
	}
	return nil
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

// whyRoleRank orders the roles by how much they tell the reader, for
// the deduplication in `at`: a role that names HOW a value reached the
// path says more than "written here".
func whyRoleRank(role string) int {
	switch role {
	case WhySpread:
		return 0
	case WhyRef:
		return 1
	case WhyPref:
		return 2
	}
	return 3
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
			made: map[Val]bool{},
			seen: map[Val]bool{},
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
	if nil == v || isTop(v) || v.Nil() ||
		rec.made[v] || rec.seen[v] {
		return
	}
	// Not the author's: see base.fwrt.
	if !v.written() && !v.fromSpread() {
		return
	}

	// PART OF a written value is not a value beside it: report the
	// whole statement the author wrote, whichever piece of it the
	// fixpoint happened to meet here. See base.finner.
	outer := v
	for up := outer.innerOf(); nil != up; up = outer.innerOf() {
		outer = up
	}
	if outer != v {
		p.contribute(rec, outer)
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

	row, col := -1, -1
	if 0 <= v.pos() {
		text, have := p.src, true
		if file := v.srcurl(); "" != file {
			text, have = p.texts[file]
		}
		if have {
			row, col = rowCol(text, v.pos())
		}
	}
	c := whyContribution{
		WhyConjunct: WhyConjunct{
			Canon: v.Canon(),
			Role:  p.whyRole(v),
			Site: WhySite{
				Col: col, File: v.srcurl(), Len: v.srclen(), Row: row,
			},
			Src: v.srctext(),
		},
		val: v,
	}
	if pv, isp := v.(*PrefVal); isp {
		rank := pv.rank
		c.Rank = &rank
	}
	rec.conjuncts = append(rec.conjuncts, c)
}

func (p *Provenance) stands(path []string, v Val) {
	rec, ok := p.paths[strings.Join(path, ".")]
	if ok && 0 < len(rec.conjuncts) {
		return
	}
	p.record(path, v, nil, nil)
}

func (p *Provenance) at(path []string) []WhyConjunct {
	rec, ok := p.paths[strings.Join(path, ".")]
	if !ok {
		return []WhyConjunct{}
	}
	sorted := append([]whyContribution{}, rec.conjuncts...)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i].WhyConjunct, sorted[j].WhyConjunct
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

	kept := []*WhyConjunct{}
	shown := map[string]*WhyConjunct{}
	for _, c := range sorted {
		one := c.WhyConjunct
		if 0 > c.Site.Row {
			kept = append(kept, &one)
			continue
		}
		key := strings.Join([]string{
			c.Src, c.Site.File,
			itoa(c.Site.Row), itoa(c.Site.Col), itoa(c.Site.Len),
		}, "\x00")
		had, seen := shown[key]
		if !seen {
			kept = append(kept, &one)
			shown[key] = &one
			continue
		}
		if whyRoleRank(c.Role) < whyRoleRank(had.Role) {
			had.Role = c.Role
		}
	}
	out := make([]WhyConjunct, 0, len(kept))
	for _, c := range kept {
		out = append(out, *c)
	}
	return out
}
