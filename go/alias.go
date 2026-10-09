/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strings"
)

// The default expansion budget, raised by trust.budget.alias.
const maxAliasNodes = 1000000

// T-1 (ALIASES.0.md sections 7 and 9). Expansion TERMINATES -- no
// parameters, no recursion, a finite name set -- but a name that names
// names expands to the product of what they hold. The budget is on
// EXPANDED SIZE, charged from unifyRoot, the one seam every entry
// reaches: an editor checks on each keystroke, and so does a vet pass.
func aliasBudget(ctx *Ctx, root Val) *NilVal {
	// A DOCUMENT THAT INCLUDES parses to a conjunct, not a map: the
	// deferred terms are where an included file's names arrive.
	maps := []*MapVal{}
	var gather func(v Val)
	gather = func(v Val) {
		switch n := v.(type) {
		case *MapVal:
			maps = append(maps, n)
		case *ConjunctVal:
			for _, t := range n.peg {
				gather(t)
			}
		}
	}
	gather(root)
	if 0 == len(maps) {
		return nil
	}

	decl := map[string]Val{}
	for _, m := range maps {
		for _, k := range m.aliasKeys {
			decl[k] = m.peg[k]
		}
	}

	limit := ctx.budgetAlias
	if 0 == limit {
		limit = maxAliasNodes
	}
	size := map[string]int{}
	open := map[string]bool{}

	var valSize func(v Val) int
	// A cycle is refused at resolution, which has not run yet, so a name
	// already open costs nothing here rather than looping.
	nameSize := func(key string) int {
		if n, ok := size[key]; ok {
			return n
		}
		if open[key] {
			return 0
		}
		d, ok := decl[key]
		if !ok {
			return 0
		}
		open[key] = true
		n := valSize(d)
		delete(open, key)
		size[key] = n
		return n
	}

	valSize = func(v Val) int {
		if rv, ok := v.(*RefVal); ok {
			if key, named := rv.aliasKey(); named {
				return 1 + nameSize(key)
			}
			return 1
		}
		n := 1
		switch t := v.(type) {
		case *MapVal:
			for _, k := range t.keys {
				n += valSize(t.peg[k])
			}
			if nil != t.spread {
				n += valSize(t.spread)
			}
		case *ListVal:
			for _, e := range t.peg {
				n += valSize(e)
			}
			if nil != t.spread {
				n += valSize(t.spread)
			}
		case *ConjunctVal:
			for _, e := range t.peg {
				n += valSize(e)
			}
		case *DisjunctVal:
			for _, e := range t.peg {
				n += valSize(e)
			}
		}
		if limit < n {
			return limit + 1
		}
		return n
	}

	total := 0
	for _, m := range maps {
		for _, k := range m.keys {
			if _, isDecl := decl[k]; isDecl {
				continue
			}
			total += valSize(m.peg[k])
			if limit < total {
				break
			}
		}
	}

	if limit < total {
		return makeNilErrFull(ctx, "alias_budget", root, nil, "resolve",
			map[string]string{"budget": itoa(limit)})
	}
	return nil
}

// EVERY ALIAS REFERENCE NAMES A DECLARED NAME, whether or not anything
// reaches it. Resolution is lazy, so a reference inside a template that
// nothing instantiates is never tried and a misspelling compiles clean.
// Whether a NAME is declared does not depend on what the tree holds, so
// it is answered here instead. See docs/design/ALIASES.0.md
func aliasErrors(ctx *Ctx, root Val) error {
	rm, ok := root.(*MapVal)
	if !ok {
		return nil
	}
	declared := map[string]bool{}
	for _, k := range rm.aliasKeys {
		declared[k] = true
	}

	seen := map[Val]bool{}
	bad := 0

	var visit func(v Val)
	visit = func(v Val) {
		if nil == v || seen[v] {
			return
		}
		seen[v] = true

		switch n := v.(type) {
		case *RefVal:
			key, isAlias := n.aliasKey()
			if isAlias && !declared[key] {
				makeNilErrFull(ctx, "no_path", n, nil, "resolve", nil)
				bad++
			}

		case *MapVal:
			for _, k := range n.keys {
				visit(n.peg[k])
			}
			if nil != n.spread {
				visit(n.spread)
			}

		case *ListVal:
			for _, e := range n.peg {
				visit(e)
			}
			if nil != n.spread {
				visit(n.spread)
			}

		case *ConjunctVal:
			for _, e := range n.peg {
				visit(e)
			}

		case *DisjunctVal:
			for _, e := range n.peg {
				visit(e)
			}

		case *FuncVal:
			for _, e := range n.peg {
				visit(e)
			}

		case *PlusOpVal:
			for _, e := range n.peg {
				visit(e)
			}
		}
	}

	visit(root)

	if 0 == bad {
		return nil
	}
	return &AontuError{Msg: ctx.errmsg(), Code: "no_path"}
}

func expandAliases(root Val, snapmap map[string]Val, errs []*NilVal) {
	rm, ok := root.(*MapVal)
	if !ok {
		return
	}
	targetOf := func(ref *RefVal, key string) Val {
		if target, snapped := snapmap[refSnapKey(ref)]; snapped {
			return target
		}
		return rm.peg[key]
	}

	// Whether v holds a reference to the alias, through each reference's
	// own target in turn. A reference to an alias that reaches itself
	// keeps its name, as the residual it resolves to does: no rendering
	// loops, and none depends on whether the reference has resolved yet.
	var reaches func(v Val, key string, met map[Val]bool) bool
	reaches = func(v Val, key string, met map[Val]bool) bool {
		if nil == v || met[v] {
			return false
		}
		met[v] = true
		if ref, isRef := v.(*RefVal); isRef {
			k, isAlias := ref.aliasKey()
			return isAlias && (key == k || reaches(targetOf(ref, k), key, met))
		}
		// A residual of an alias stands for a reference to it.
		if rec, isRec := v.(*RecurseVal); isRec && 1 == len(rec.target) &&
			rm.isAliasKey(rec.target[0]) {
			return key == rec.target[0] || reaches(rm.peg[rec.target[0]], key, met)
		}
		for _, kid := range renderKids(v) {
			if reaches(kid, key, met) {
				return true
			}
		}
		return false
	}

	seen := map[Val]bool{}
	looped := map[aliasExpansion]bool{}
	var visit func(v Val)
	visit = func(v Val) {
		if nil == v || seen[v] {
			return
		}
		seen[v] = true
		ref, isRef := v.(*RefVal)
		if !isRef {
			for _, kid := range renderKids(v) {
				visit(kid)
			}
			return
		}
		key, isAlias := ref.aliasKey()
		if !isAlias {
			return
		}
		target := targetOf(ref, key)
		ref.expansion = target
		if nil != target {
			at := aliasExpansion{key, target}
			loops, known := looped[at]
			if !known {
				loops = reaches(target, key, map[Val]bool{})
				looped[at] = loops
			}
			if loops {
				ref.expansion = nil
			}
		}
		visit(target)
	}

	// A refusal's operands render in its sites, wherever they were copied.
	visit(root)
	for _, k := range rm.aliasKeys {
		visit(rm.peg[k])
	}
	for _, e := range errs {
		visit(e.primary)
		visit(e.secondary)
	}
}

type aliasExpansion struct {
	key    string
	target Val
}

// renderKids are the values a rendering descends into, a map's
// declarations aside.
func renderKids(v Val) []Val {
	switch n := v.(type) {
	case *MapVal:
		out := []Val{}
		for _, k := range n.keys {
			if !n.isAliasKey(k) {
				out = append(out, n.peg[k])
			}
		}
		if nil != n.spread {
			out = append(out, n.spread)
		}
		return out
	case *ListVal:
		out := append([]Val{}, n.peg...)
		if nil != n.spread {
			out = append(out, n.spread)
		}
		return out
	case *ConjunctVal:
		return n.peg
	case *DisjunctVal:
		return n.peg
	case *FuncVal:
		return n.peg
	case *PlusOpVal:
		return n.peg
	case *PrefVal:
		return []Val{n.peg}
	case *ExpectVal:
		return []Val{n.peg}
	case *ConstraintVal:
		out := []Val{}
		if nil != n.pending {
			out = append(out, n.pending.args...)
		}
		for _, m := range n.musts {
			out = append(out, m.v)
		}
		return append(out, n.settledTrials()...)
	}
	return nil
}

// AliasBinding is where a file binds a name, and what to show for it.
type AliasBinding struct {
	Name string
	Row  int // 1-based, as a site is
	Col  int
	Decl string
	From string // the include a destructure took it from, "" if local
}

// AliasScope reads THE NAMES A FILE BINDS from its TEXT rather than its
// tree: an editor asks while a document would not parse.
func AliasScope(src string) []AliasBinding {
	out := []AliasBinding{}
	code := strings.Split(aliasNonCodeRe.ReplaceAllStringFunc(src, func(s string) string {
		return aliasNonNewlineRe.ReplaceAllString(s, " ")
	}), "\n")
	for li, line := range strings.Split(src, "\n") {
		lead := len(line) - len(strings.TrimLeft(line, " \t"))
		rest := line[lead:]
		decl := strings.TrimSpace(line)
		tm := aliasTakeLineRe.FindStringSubmatchIndex(rest)
		if nil == tm {
			for _, m := range aliasBindingRe.FindAllStringSubmatchIndex(code[li], -1) {
				if code[li][m[1]-1] == '=' && m[1] < len(code[li]) && code[li][m[1]] == '=' {
					continue
				}
				out = append(out, AliasBinding{
					Name: line[m[2]:m[3]], Row: li + 1, Col: m[2] + 1, Decl: decl})
			}
			continue
		}
		// Whether the head IS a set is aliasSetItems's answer.
		binds, ok := aliasSetItems(rest[tm[2]:tm[3]])
		if !ok {
			continue
		}
		// The column is each item's own, so a set jumps to the name
		// asked for rather than to the pattern.
		at := lead
		for _, b := range binds {
			at += strings.Index(line[at:], b.local)
			out = append(out, AliasBinding{
				Name: b.local, Row: li + 1, Col: at + 1,
				Decl: decl, From: rest[tm[4]:tm[5]]})
			at += len(b.local)
		}
	}
	return out
}

var aliasBindingRe = regexp.MustCompile(`(?:^|[\s{[:,(])(` + aliasNamePat + `)[ \t]*[:=]`)
var aliasNonNewlineRe = regexp.MustCompile(`[^\n]`)
var aliasNonCodeRe = regexp.MustCompile(`"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|` + "`(?:\\\\[\\s\\S]|[^`\\\\])*(?:`|$)" + `|//[^\n]*|#[^\n]*|/\*[\s\S]*?(?:\*/|$)`)

// AliasNameAt is the alias name the text begins with, or "".
func AliasNameAt(text string) string {
	return aliasRe.FindString(text)
}
