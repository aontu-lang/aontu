/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)

// Problem describes a single source problem found by Check: a NilVal
// (unification conflict, unresolved reference, unknown function, …)
// present in the unified result tree. It carries the source byte offset
// so tooling — notably the LSP server in ../go/lsp — can render editor
// diagnostics. A valid but non-concrete document (e.g. a bare `a:string`
// schema) yields no Problems: only genuine errors become NilVals.
type Problem struct {
	// Pos is the byte offset into the source of the offending value, or
	// -1 when no position is known.
	Pos int

	// Len is the byte length of the offending value's SOURCE TEXT
	// (always >= 1), used to size the diagnostic range. Bytes, not
	// UTF-16 units, because it is added to the byte offset Pos before
	// the pair is converted (go/lsp/lsp.go idx.position).
	//
	// The canonical form is the FALLBACK, not the measure: canon is not
	// source text, so sizing `0x1F` (canon `31`) by canon underlines two
	// characters of a four-character literal. Where a value carries no
	// stamped source text -- one propagated onto a result rather than
	// written by a document -- canon is all there is, and an approximate
	// underline still beats none. A REPORT never guesses this way; see
	// the note on VetSite.Len.
	Len int

	// Why is the engine error code (e.g. "scalar_value", "no_path",
	// "unknown_function").
	Why string

	// Class is Why's class from the shared registry
	// (test/spec/errcodes.tsv): conflict | incomplete | reference |
	// parse | budget | internal.
	Class string

	// Message is the human-readable error message.
	Message string
}

// Check parses and unifies src and reports every problem found, without
// stopping at the first. Unlike Generate it does not fail on non-concrete
// values — a schema such as `a:string` is valid and yields no problems.
// A parse (syntax) error is returned as a single Problem with Pos -1.
func (a *Aontu) Check(src string) []Problem {
	return a.CheckVars(src, nil)
}

// CheckVars is Check with $name variables resolved from vars.
func (a *Aontu) CheckVars(src string, vars map[string]Val) []Problem {
	v, perr := a.parseEntry(src)
	if perr != nil {
		// The SPECIFIC code, not a generic "parse": the canonical
		// port's first code for an unparseable source is the inner
		// nil's (`syntax`, `include_denied`, ...) — the same code errc
		// rows pin — so the diagnostic a client branches on matches.
		code := "parse"
		if ae, ok := perr.(*AontuError); ok && "" != ae.Code {
			code = ae.Code
		}
		return []Problem{{Pos: -1, Len: 1, Why: code, Class: codeClass(code), Message: perr.Error()}}
	}

	ctx := &Ctx{root: v, vars: vars, src: src}
	res := unifyRoot(v, ctx)
	ctx.root = res

	var nils []*NilVal
	seen := map[Val]bool{}
	collectNils(res, &nils, seen)

	// Errors recorded on the context but not present in the tree — e.g.
	// a budget_passes exhaustion nil, which is about the whole
	// evaluation rather than any node — would otherwise be invisible
	// here, and the trust contract forbids silent truncation
	// (docs/trust.md clause 2). Tree nils are already on ctx.err too,
	// so dedup by identity. Mirrors the ctx-err union in TS
	// computeDiagnostics (ts/src/lsp.ts).
	for _, n := range ctx.err {
		if !seen[Val(n)] {
			seen[Val(n)] = true
			nils = append(nils, n)
		}
	}

	out := make([]Problem, 0, len(nils))
	for _, n := range nils {
		p := Problem{Pos: n.sp, Len: 1, Why: n.why, Class: n.Class(), Message: n.Message()}
		if p.Pos < 0 {
			p.Pos = -1
		}
		if n.primary != nil {
			p.Len = srcSpanLen(n.primary)
		}
		out = append(out, p)
	}
	return out
}

// srcSpanLen is the BYTE length to underline for a value: its source
// text where it has one, its canon otherwise, and never less than 1.
//
// Bytes, not UTF-16 units, because every caller adds it to a byte offset
// before the pair is converted (go/lsp/lsp.go idx.position). The report
// side counts UTF-16 instead, and takes it from srclen.
//
// The canon is the FALLBACK, not the measure: canon is not source text,
// so sizing `0x1F` (canon `31`) by canon underlines two characters of a
// four-character literal. One function for all three diagnostic paths --
// problems, hover spans and deprecations -- because the third was left
// on canon when the first two were fixed, and the two servers then
// underlined different ranges for the same document.
// Written as a default that is REFINED rather than three returns: the
// floor is a defensive default (a value with neither text nor canon is
// not constructible today), and as its own return arm nothing reached
// it and the coverage gate said so. This shape carries the same rule
// with no unreachable block.
func srcSpanLen(v Val) int {
	n := 1
	if c := v.Canon(); 0 < len(c) {
		n = len(c)
	}
	if t := v.srctext(); "" != t {
		n = len(t)
	}
	return n
}

// ValueSpan locates a concrete value in source: the byte offset and the
// byte length of its source text, plus its canon and a short kind
// label. Containers (maps/lists) are excluded — their source span is not
// reliably reconstructable from a single position — so spans describe
// scalars, scalar kinds, references, etc. Used for LSP hover (go/lsp).
type ValueSpan struct {
	Pos   int
	Len   int
	Canon string
	Kind  string
	// Path is where the value sits in the document, for the hover
	// provenance G7 phase 7 appends. Empty for a value with no path
	// (the root, or a value the walk reached through a shared clone).
	Path []string
}

// Spans parses and unifies src and returns a ValueSpan for every
// positioned non-container value in the result, so tooling can locate the
// value under a cursor. Returns nil on a parse error.
func (a *Aontu) Spans(src string) []ValueSpan {
	v, perr := a.parseEntry(src)
	if perr != nil {
		return nil
	}
	ctx := &Ctx{root: v, src: src}
	res := unifyRoot(v, ctx)
	ctx.root = res

	var out []ValueSpan
	collectSpans(res, &out, map[Val]bool{})
	return out
}

func collectSpans(v Val, out *[]ValueSpan, seen map[Val]bool) {
	if v == nil || seen[v] {
		return
	}
	seen[v] = true

	switch t := v.(type) {
	case *MapVal:
		for _, k := range t.keys {
			collectSpans(t.peg[k], out, seen)
		}
		if t.spread != nil {
			collectSpans(t.spread, out, seen)
		}
		return
	case *ListVal:
		for _, e := range t.peg {
			collectSpans(e, out, seen)
		}
		if t.spread != nil {
			collectSpans(t.spread, out, seen)
		}
		return
	case *ConjunctVal:
		for _, e := range t.peg {
			collectSpans(e, out, seen)
		}
	case *DisjunctVal:
		for _, e := range t.peg {
			collectSpans(e, out, seen)
		}
	}

	if p := v.pos(); p >= 0 {
		c := v.Canon()
		if len(c) > 0 {
			*out = append(*out, ValueSpan{
				Pos: p, Len: srcSpanLen(v), Canon: c, Kind: valKind(v),
				Path: v.vpath(),
			})
		}
	}
}

// valKind is a short human label for a Val's kind, shown in hovers.
func valKind(v Val) string {
	switch t := v.(type) {
	case *ScalarVal:
		// A concrete value always carries a numeric LEAF kind, so a
		// binary64 value hovers as "float"; "number" is the supertype
		// and labels a ScalarKindVal (reported as "type") only.
		return t.kind.String()
	case *ScalarKindVal:
		return "type"
	case *ConstraintVal:
		return "constraint"
	case *RefVal:
		return "reference"
	case *NilVal:
		return "error"
	case *ConjunctVal:
		return "conjunct"
	case *DisjunctVal:
		return "disjunct"
	case *PrefVal:
		return "pref"
	case *FuncVal:
		return "function"
	case *TopVal:
		return "top"
	}
	return "value"
}

// Deprecation is one value carrying the deprecate() record after
// evaluation (G3 phase 4): its source position, the byte length of its
// canonical rendering (for a highlight range), and the record itself.
type Deprecation struct {
	Pos    int
	Len    int
	Record map[string]string
}

// deprecatedVal is one record-carrying value found by the shared walk.
type deprecatedVal struct {
	v    Val
	path []string
}

// collectDeprecatedVals walks an evaluated tree for every value
// carrying the deprecation record (G3 phase 4) — the one walk behind
// the Deprecations API and vet's `deprecated` warnings, mirroring
// collectDeprecations in ts/src/utility.ts. The nil guard is for a
// bag slot a degenerate construction can leave empty.
func collectDeprecatedVals(root Val) []deprecatedVal {
	out := []deprecatedVal{}
	walkBagVals(root, func(n Val, path []string) {
		if nil != n.deprecRec() {
			out = append(out, deprecatedVal{v: n, path: append([]string{}, path...)})
		}
	})
	return out
}

// walkBagVals visits every Val reachable through bag children, with
// its path — the walk under collectDeprecatedVals and vet's
// default-validity lint. The nil guard is for a bag slot a degenerate
// construction can leave empty (pinned by
// TestCollectDeprecatedValsNilSlot). Mirrors walkBagVals in
// ts/src/utility.ts.
func walkBagVals(root Val, fn func(v Val, path []string)) {
	var walk func(n Val, path []string)
	walk = func(n Val, path []string) {
		if nil == n {
			return
		}
		fn(n, path)
		switch b := n.(type) {
		case *MapVal:
			for _, k := range b.keys {
				walk(b.peg[k], append(path, k))
			}
		case *ListVal:
			for i, e := range b.peg {
				walk(e, append(path, itoa(i)))
			}
		}
	}
	walk(root, nil)
}

// DeprecationsVars evaluates src (with $name variables from vars, which
// may be nil) and returns every sited value carrying the deprecation
// record — the declaration and, because the record rides meets and
// reference clones, every use resolving through it. A source that does
// not evaluate answers no deprecations: the diagnostics surface already
// reports why. Mirrors the walkDep pass in ts/src/lsp.ts
// computeDiagnostics.
func (a *Aontu) DeprecationsVars(src string, vars map[string]Val) []Deprecation {
	v, perr := a.parseEntry(src)
	if perr != nil {
		return nil
	}
	ctx := &Ctx{root: v, vars: vars, src: src}
	res := unifyRoot(v, ctx)

	out := []Deprecation{}
	for _, d := range collectDeprecatedVals(res) {
		if 0 <= d.v.pos() {
			out = append(out, Deprecation{
				Pos: d.v.pos(), Len: srcSpanLen(d.v), Record: d.v.deprecRec(),
			})
		}
	}
	return out
}

// DeprecatedAt reports whether the evaluated document carries the
// deprecation record at the given finding path ("$.a.b"). Used by the
// breaking verb's --allow-deprecated-removal downgrade (G3 phase 4):
// the verb's package cannot reach the tree's fields itself. A source
// that does not evaluate answers false.
func (a *Aontu) DeprecatedAt(src, path string) bool {
	v, perr := a.parseEntry(src)
	if perr != nil {
		return false
	}
	ctx := &Ctx{root: v, src: src}
	res := unifyRoot(v, ctx)

	segs := []string{}
	trimmed := strings.TrimPrefix(path, "$")
	for _, p := range strings.Split(trimmed, ".") {
		if "" != p {
			segs = append(segs, p)
		}
	}
	node := res
	for _, seg := range segs {
		switch b := node.(type) {
		case *MapVal:
			node = b.peg[seg]
		case *ListVal:
			i, err := strconv.Atoi(seg)
			if nil != err || i < 0 || len(b.peg) <= i {
				return false
			}
			node = b.peg[i]
		default:
			return false
		}
		if nil == node {
			return false
		}
	}
	return nil != node.deprecRec()
}
