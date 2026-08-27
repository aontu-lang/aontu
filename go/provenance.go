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
	seen map[Val]bool
}

// Provenance is the recorder itself. Mirrors the class in
// ts/src/provenance.ts.
type Provenance struct {
	paths map[string]*whyPathRecord
	// The entry source, for turning a byte offset into row and column.
	src string
	// The text of every file the parse READ, by the name a site
	// carries. A value's position is an offset into the source it was
	// parsed from, so a contribution written in an included file has to
	// be counted in THAT file -- counting it in the entry names a real
	// line that says something else (the review's finding F, applied to
	// this surface). Vet solves the same problem the same way, with
	// vetSources; Aontu.IncludeText is where both get the map.
	texts map[string]string
}

func newProvenance(src string, texts map[string]string) *Provenance {
	return &Provenance{
		paths: map[string]*whyPathRecord{},
		src:   src,
		texts: texts,
	}
}

// writtenFrom stamps the parsed tree with the AUTHORED mark: everything
// the author wrote, before unification starts. A value minted during
// unification is the engine's own work, not a contribution the author
// can be pointed at; a CLONE of a marked value keeps the mark, because
// it is the same written value somewhere else (base.fwrt). Called once,
// before unify, by Why.
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

// samePathKids are the children that stand at the SAME path as v: a
// junction's members, a preference's inner value, a function's
// arguments. NOT a bag's children (they stand at their own, deeper
// paths) and NOT a conjunct's terms (a conjunct is the statement that
// several things must all hold, and each term is one of them).
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
	// TOP is the unit element and a nil is a failure, neither of which
	// is information the author wrote. A value an earlier meet MADE is
	// an intermediate; the source that made it is already recorded.
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

	// COUNTED IN THE FILE THE VALUE CAME FROM, and -1:-1 when this run
	// holds no text for that file: an offset resolved against another
	// document names a real line that says something else, which is
	// worse than saying nothing (see Provenance.texts).
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

// stands records THE VALUE THAT STANDS at a path as a contribution when
// nothing met there and the author wrote it. A meet is where
// information vanishes, so a meet is what the recorder watches -- but a
// generator PLACES a value without meeting anything, and `why` then
// answered "(no contributions: nothing met at this path)" over a value
// it had just printed. That is literally true and practically false:
// the author is asking where the value came from, and it came from
// somewhere they can be shown (use-cases/BUGS.md §23).
//
// Only when the record is otherwise EMPTY. Where something did meet,
// the standing value is that meet's result -- an intermediate, and the
// recorder's oldest rule is that a result is not a source.
func (p *Provenance) stands(path []string, v Val) {
	rec, ok := p.paths[strings.Join(path, ".")]
	if ok && 0 < len(rec.conjuncts) {
		return
	}
	p.record(path, v, nil, nil)
}

// at answers the record at one path. Empty when nothing met there and
// nothing the author wrote stands there either — which is a true and
// useful answer rather than an error.
//
// ONLY WHOLE WRITTEN VALUES are contributions: a Val's own Unify
// re-enters unite at the same path (a disjunct trials each member
// there), and those members are PARTS OF one written value. That is
// settled BEFORE a member is ever pushed, by the base.finner fact
// stamped over the document (see contribute), which is why no filter
// runs here: a per-path "inside" set used to do it, and it could only
// work where the container itself happened to meet something at the
// same path -- the order-dependence finding E records.
//
// SOURCE ORDER, not meet order: the two are the same in simple cases
// and diverge with the fixpoint's fold order, which is an engine detail
// and a parity risk. Sites are parse data, identical in both ports.
func (p *Provenance) at(path []string) []WhyConjunct {
	rec, ok := p.paths[strings.Join(path, ".")]
	if !ok {
		return []WhyConjunct{}
	}
	// ONE WRITTEN TOKEN IS ONE CONTRIBUTION, and the SITE is what
	// identifies it -- not the value's identity, and not the canon.
	//
	// Not the identity, because provenance travels through clones now:
	// a written value and a clone of it are the same statement in the
	// same place, and a path that met both would list it twice.
	//
	// Not the canon, because the same written value reaches a path at
	// different stages of narrowing -- `3|(1|2)` as the author wrote it
	// and `3|1|2` after a fold -- and both name one token.
	//
	// Not the role either: the role says how the value REACHED this
	// path, not which value it is, and one written value can reach a
	// path both ways (a template applied to a key whose value is also
	// written there). Keeping the literal would throw away the more
	// informative half, so the roles have a precedence.
	//
	// ONLY WHERE THE SITE IS REAL. An unsited contribution (row -1)
	// cannot be told apart from another unsited one, so those are kept
	// as they come rather than collapsed into whichever arrived first.
	// SORTED FIRST, so which of two contributions at one site survives
	// the deduplication is decided by the order the record is READ in
	// -- source order, with the canon breaking a tie -- and not by the
	// order the fixpoint happened to meet them, which is an engine
	// detail and would put the two ports on different answers.
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
