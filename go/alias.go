/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "sort"

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
