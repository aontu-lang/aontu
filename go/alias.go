/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "sort"

// The default expansion budget, raised by trust.budget.alias.
const maxAliasNodes = 1000000

// T-1 (ALIASES.0.md sections 7 and 9). Expansion TERMINATES -- no
// parameters, no recursion, a finite name set -- but a name that names
// names expands to the product of what they hold. The budget is on
// EXPANDED SIZE and charged here, ahead of evaluation.
func aliasBudget(ctx *Ctx, root Val) error {
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
		if nil == v {
			return 0
		}
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
		en := newNil("alias_budget")
		en.details = map[string]string{"budget": itoa(limit)}
		en.sp = root.pos()
		ctx.adderr(en)
		return &AontuError{Msg: ctx.errmsg(), Code: "alias_budget",
			Details: en.details}
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

func expandAliases(root Val, snapmap map[string]Val) {
	rm, ok := root.(*MapVal)
	if !ok {
		return
	}

	seen := map[Val]bool{}

	var visit func(v Val, stack []string)
	visit = func(v Val, stack []string) {
		if nil == v || seen[v] {
			return
		}
		seen[v] = true

		switch n := v.(type) {
		case *RefVal:
			key, isAlias := n.aliasKey()
			if !isAlias {
				return
			}
			n.expansion = nil
			for _, s := range stack {
				if s == key {
					return
				}
			}
			target, snapped := snapmap[refSnapKey(n)]
			if !snapped {
				target = rm.peg[key]
			}
			if nil == target {
				return
			}
			n.expansion = target
			visit(target, append(append([]string{}, stack...), key))

		case *MapVal:
			// A declaration is reached through its references, each
			// under its own name, never as a child: a self-reference
			// inside it is a knot only from inside.
			keys := make([]string, 0, len(n.keys))
			for _, k := range n.keys {
				if !n.isAliasKey(k) {
					keys = append(keys, k)
				}
			}
			sort.Strings(keys)
			for _, k := range keys {
				visit(n.peg[k], stack)
			}
			if nil != n.spread {
				visit(n.spread, stack)
			}

		case *ListVal:
			for _, e := range n.peg {
				visit(e, stack)
			}
			if nil != n.spread {
				visit(n.spread, stack)
			}

		case *ConjunctVal:
			for _, e := range n.peg {
				visit(e, stack)
			}

		case *DisjunctVal:
			for _, e := range n.peg {
				visit(e, stack)
			}

		case *FuncVal:
			for _, e := range n.peg {
				visit(e, stack)
			}

		case *PlusOpVal:
			for _, e := range n.peg {
				visit(e, stack)
			}

		case *PrefVal:
			visit(n.peg, stack)

		case *ExpectVal:
			visit(n.peg, stack)
		}
	}

	visit(root, nil)
}
