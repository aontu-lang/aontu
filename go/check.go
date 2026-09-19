/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strconv"
	"strings"
)

type Problem struct {
	// Pos is the byte offset into the source of the offending value, or
	// -1 when no position is known.
	Pos int

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

	for _, n := range ctx.err {
		if !seen[Val(n)] {
			seen[Val(n)] = true
			nils = append(nils, n)
		}
	}

	out := make([]Problem, 0, len(nils))
	for _, n := range nils {
		p := Problem{Pos: n.site.sp, Len: 1, Why: n.why, Class: n.Class(), Message: n.Message()}
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

type ValueSpan struct {
	Pos   int
	Len   int
	Canon string
	Kind  string
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

func collectDeprecatedVals(root Val) []deprecatedVal {
	out := []deprecatedVal{}
	walkBagVals(root, func(n Val, path []string) {
		if nil != n.deprecRec() {
			out = append(out, deprecatedVal{v: n, path: append([]string{}, path...)})
		}
	})
	return out
}

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
