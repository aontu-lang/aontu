/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"strconv"
	"strings"
)

// A path steps through these as through the value they hold.
var cycleRiders = map[string]bool{
	"hide": true, "type": true, "meta": true, "deprecate": true,
	"ident": true, "close": true, "open": true,
}

var indexStepRe = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

type cycleEdge struct {
	ref *RefVal
	to  []string
}

type cycleFrame struct {
	id    string
	path  []string
	edges []cycleEdge
	at    int
	ref   *RefVal
}

// THE ALIAS-CYCLE RULE (decisions 1, 2 and 7 of sketch/DEFINITION.0.md
// section 7): a name or a path that reaches itself with no key and no
// element between has no finite derivation, so it is refused before
// evaluation instead of by a budget. A name is a path from the root, so
// one graph holds both, and a step into a member is the guard.
func aliasCycle(ctx *Ctx, root Val) *NilVal {
	roots := cycleRootMaps(root)
	if 0 == len(roots) {
		return nil
	}
	state := map[string]int{}

	// The search keeps its own stack, as the TypeScript port must: a
	// chain of names can run deeper than the host's.
	stack := []*cycleFrame{}
	enter := func(path []string) *cycleFrame {
		id := strings.Join(path, "\x00")
		switch state[id] {
		case 1:
			for _, frame := range stack {
				if frame.id == id {
					return frame
				}
			}
		case 0:
			state[id] = 1
			stack = append(stack, &cycleFrame{id: id, path: path, edges: cycleEdges(roots, path)})
		}
		return nil
	}

	// A cycle is reported where the document first reaches it, as the
	// engines report one they meet while evaluating.
	terms := make([]Val, 0, len(roots))
	for _, m := range roots {
		terms = append(terms, m)
	}
	for _, start := range cyclePositions(terms, nil, nil) {
		found := enter(start)
		for nil == found && 0 < len(stack) {
			top := stack[len(stack)-1]
			if top.at < len(top.edges) {
				edge := top.edges[top.at]
				top.at++
				top.ref = edge.ref
				found = enter(edge.to)
			} else {
				state[top.id] = 2
				stack = stack[:len(stack)-1]
			}
		}
		if nil != found {
			n := makeNilErr(ctx, "path_cycle", found.ref, nil)
			n.path = found.path
			return n
		}
	}
	return nil
}

func cycleEdges(roots []*MapVal, path []string) []cycleEdge {
	out := []cycleEdge{}
	for _, term := range cycleTermsAt(roots, path) {
		for _, u := range cycleUnguarded(term, true, nil) {
			if to, ok := cycleTarget(u.ref, u.placed); ok {
				out = append(out, cycleEdge{u.ref, to})
			}
		}
	}
	return out
}

func cycleRootMaps(v Val) []*MapVal {
	switch n := v.(type) {
	case *MapVal:
		return []*MapVal{n}
	case *ConjunctVal:
		out := []*MapVal{}
		for _, t := range n.peg {
			out = append(out, cycleRootMaps(t)...)
		}
		return out
	}
	return nil
}

// The place a reference names, or none where it can't say statically:
// a variable step, or a relative path whose place depends on where a
// call or a template stands.
func cycleTarget(ref *RefVal, placed bool) ([]string, bool) {
	if !ref.absolute && !placed {
		return nil, false
	}
	parts := make([]string, 0, len(ref.peg))
	for _, p := range ref.peg {
		s, ok := p.(string)
		if !ok {
			return nil, false
		}
		parts = append(parts, s)
	}
	if !ref.absolute {
		parts = append(append([]string{}, ref.path[:max(len(ref.path)-1, 0)]...), parts...)
	}
	return reduceDots(parts)
}

func cycleTermsAt(roots []*MapVal, path []string) []Val {
	at := make([]Val, 0, len(roots))
	for _, m := range roots {
		at = append(at, m)
	}
	for _, step := range path {
		next := []Val{}
		for _, t := range at {
			for _, v := range cycleUnwrap(t) {
				switch n := v.(type) {
				case *MapVal:
					if w, ok := n.peg[step]; ok {
						next = append(next, w)
					}
				case *ListVal:
					if indexStepRe.MatchString(step) {
						if i, err := strconv.Atoi(step); nil == err && i < len(n.peg) {
							next = append(next, n.peg[i])
						}
					}
				}
			}
		}
		at = next
	}
	return at
}

func cycleUnwrap(v Val) []Val {
	switch n := v.(type) {
	case *ConjunctVal:
		out := []Val{}
		for _, t := range n.peg {
			out = append(out, cycleUnwrap(t)...)
		}
		return out
	case *FuncVal:
		if cycleRiders[n.name] && 0 < len(n.peg) {
			return cycleUnwrap(n.peg[0])
		}
	}
	return []Val{v}
}

type cycleRef struct {
	ref    *RefVal
	placed bool
}

// The references a term holds with no key and no element between, each
// with whether a relative one still stands where it is written. Only a
// trial's count and branches are read, so `contains` keeps its member
// term and `rest` all but a cover's `if`, as the definition reads them.
func cycleUnguarded(v Val, placed bool, out []cycleRef) []cycleRef {
	var kids []Val
	switch n := v.(type) {
	case *RefVal:
		return append(out, cycleRef{n, placed})
	case *ConstraintVal:
		kids, placed = cycleTrialArgs(n), false
	case *FuncVal:
		if "path" != n.name {
			kids = n.peg
		}
		placed = false
	case *ConjunctVal:
		kids = n.peg
	case *DisjunctVal:
		kids = n.peg
	case *PlusOpVal:
		kids = n.peg
	case *PrefVal:
		kids = []Val{n.peg}
	}
	for _, k := range kids {
		if nil != k {
			out = cycleUnguarded(k, placed, out)
		}
	}
	return out
}

func cycleTrialArgs(c *ConstraintVal) []Val {
	out := []Val{}
	if nil != c.pending {
		args := c.pending.args
		switch c.pending.atom {
		case "contains":
			if 1 < len(args) {
				out = append(out, args[1:]...)
			}
		case "rest":
			for _, a := range args[min(1, len(args)):] {
				if m, ok := a.(*MapVal); ok {
					if w, has := m.peg["if"]; has {
						out = append(out, w)
					}
				}
			}
		default:
			out = append(out, args...)
		}
	}
	for _, m := range c.musts {
		out = append(out, m.v)
	}
	return out
}

// Every place the document writes, in the order it writes them.
func cyclePositions(terms []Val, path []string, out [][]string) [][]string {
	for _, t := range terms {
		for _, v := range cycleUnwrap(t) {
			switch n := v.(type) {
			case *MapVal:
				for _, k := range n.keys {
					at := append(append([]string{}, path...), k)
					out = append(out, at)
					out = cyclePositions([]Val{n.peg[k]}, at, out)
				}
			case *ListVal:
				for i, e := range n.peg {
					at := append(append([]string{}, path...), strconv.Itoa(i))
					out = append(out, at)
					out = cyclePositions([]Val{e}, at, out)
				}
			}
		}
	}
	return out
}
