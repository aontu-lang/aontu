/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE TREE VIEW -- the Go twin of ts/src/view.ts. See that file for
// what is drawn, why the edge set is the only input, and the two marks
// the walk makes; what the two ports must agree on -- the rendered text
// and the refusals -- is test/spec/view.tsv.

import (
	"sort"
	"strings"
)

// ViewVerdict is rendered | error.
type ViewVerdict = string

// ViewReport is the answer for one document, mirroring ViewReport in
// ts/src/view.ts field for field.
type ViewReport struct {
	Verdict ViewVerdict `json:"verdict"`
	Kind    string      `json:"kind"`

	// Text is the figure. Present ONLY on `rendered` -- and present
	// EMPTY for a document with no edges, because an empty drawing of a
	// model with nothing to draw is the honest one.
	Text *string `json:"text,omitempty"`

	// Errors is WHY the figure could not be drawn, in vet's finding
	// shape. Present ONLY on `error`.
	Errors []VetFinding `json:"errors,omitempty"`
}

// ViewOptions mirrors ViewOptions in ts/src/view.ts.
type ViewOptions struct {
	// Relation draws the tree over this relation only. Empty means
	// every relation at once, each branch naming its relation where
	// more than one is drawn.
	Relation string
	// Roots draws only these subtrees. Empty means every root the edge
	// set derives: a node nothing depends on.
	Roots []string
}

// drawnEdge is one edge as drawn: a declared inverse pair collapsed to
// one edge, and the label the branch carries.
type drawnEdge struct {
	from, to, label string
}

// collapseEdges is the edge set with declared inverse pairs collapsed
// to one logical edge, and a mutual relation kept as the two facts it
// is. Mirrors `collapse` in ts/src/view.ts.
func collapseEdges(edges []Edge, relation string) []drawnEdge {
	// One directed edge per (from, to, key): the same link written at
	// several positions is one fact about the graph.
	seen := map[string]bool{}
	directed := []Edge{}
	for _, e := range edges {
		k := e.From + "\x00" + e.To + "\x00" + e.Key
		if !seen[k] {
			seen[k] = true
			directed = append(directed, e)
		}
	}

	order := []string{}
	pairs := map[string][]Edge{}
	for _, e := range directed {
		a, b := e.From, e.To
		if b < a {
			a, b = b, a
		}
		pair := a + "\x00" + b
		if _, ok := pairs[pair]; !ok {
			order = append(order, pair)
		}
		pairs[pair] = append(pairs[pair], e)
	}

	out := []drawnEdge{}
	for _, pair := range order {
		group := pairs[pair]
		// ONE KEY WINS THE PAIR, and every edge written under it stands:
		// the named relation, else the code-point-least key.
		kseen := map[string]bool{}
		keys := []string{}
		for _, e := range group {
			if !kseen[e.Key] {
				kseen[e.Key] = true
				keys = append(keys, e.Key)
			}
		}
		sort.Strings(keys)
		winner, label := keys[0], strings.Join(keys, "/")
		if "" != relation && kseen[relation] {
			winner, label = relation, relation
		}
		for _, e := range group {
			if e.Key == winner {
				out = append(out, drawnEdge{from: e.From, to: e.To, label: label})
			}
		}
	}

	// One winner per pair, so (from, to) is unique and orders the set.
	sort.Slice(out, func(i, j int) bool {
		x, y := out[i], out[j]
		if x.from != y.from {
			return x.from < y.from
		}
		return x.to < y.to
	})
	return out
}

// shortLabels is the shortest trailing-segment suffix that still tells
// each node from every other in the set. Mirrors `labelsOf` in
// ts/src/view.ts, including the unbounded search: at the full segment
// count the candidate is the whole path, which no other node shares.
func shortLabels(nodes []string) map[string]string {
	segs := map[string][]string{}
	for _, n := range nodes {
		s := strings.TrimPrefix(n, "$")
		s = strings.TrimPrefix(s, ".")
		segs[n] = strings.Split(s, ".")
	}
	out := map[string]string{}
	for _, n := range nodes {
		parts := segs[n]
		for take := 1; ; take++ {
			cand := strings.Join(parts[suffixFrom(len(parts), take):], ".")
			clash := false
			for _, m := range nodes {
				if m == n {
					continue
				}
				ms := segs[m]
				if strings.Join(ms[suffixFrom(len(ms), take):], ".") == cand {
					clash = true
					break
				}
			}
			if !clash {
				out[n] = cand
				break
			}
		}
	}
	return out
}

func suffixFrom(n, take int) int {
	if take > n {
		return 0
	}
	return n - take
}

// viewRelationFinding is the refusal for a relation that draws
// nothing: an empty tree and a misspelled name are the same file on
// disk. NOT refer_unresolved: a relation name is not an address.
func viewRelationFinding(relation string, have []string) VetFinding {
	note := "relations with edges: " + strings.Join(have, ", ")
	return VetFinding{
		Code:     "view_relation_unknown",
		Class:    "reference",
		Severity: "error",
		Path:     "$",
		Message:  relation + " names no relation with edges in this document.",
		Sites:    []VetSite{},
		Note:     &note,
	}
}

// viewRootFinding is the refusal for a root that is not a node of the
// DRAWN graph.
func viewRootFinding(root, relation string, nodes []string) VetFinding {
	which := ""
	if "" != relation {
		which = relation + " "
	}
	f := VetFinding{
		Code:     "refer_unresolved",
		Class:    "reference",
		Severity: "error",
		Path:     "$",
		Message:  root + " is not a node of the " + which + "graph.",
		Sites:    []VetSite{},
	}
	if 0 < len(nodes) {
		note := "nodes in the graph: " + strings.Join(nodes, ", ")
		f.Note = &note
	}
	return f
}

type viewKid struct {
	to, label string
}

type viewFrame struct {
	node, prefix string
	at           int
}

// drawTree is the spanning walk of the drawn edges from each root, with
// `(*)` where a subtree is elided and `(cycle)` where an edge closes a
// loop. Mirrors `drawTree` in ts/src/view.ts.
func drawTree(all []drawnEdge, relation string, roots []string) (string, []VetFinding) {
	kept := all
	if "" != relation {
		kept = []drawnEdge{}
		for _, e := range all {
			if e.label == relation {
				kept = append(kept, e)
			}
		}
		if 0 == len(kept) && 0 < len(all) {
			hseen := map[string]bool{}
			have := []string{}
			for _, e := range all {
				for _, k := range strings.Split(e.label, "/") {
					if !hseen[k] {
						hseen[k] = true
						have = append(have, k)
					}
				}
			}
			sort.Strings(have)
			return "", []VetFinding{viewRelationFinding(relation, have)}
		}
	}

	ns := map[string]bool{}
	nodes := []string{}
	for _, e := range kept {
		for _, n := range []string{e.from, e.to} {
			if !ns[n] {
				ns[n] = true
				nodes = append(nodes, n)
			}
		}
	}
	sort.Strings(nodes)
	lab := shortLabels(nodes)

	kids := map[string][]viewKid{}
	for _, e := range kept {
		kids[e.from] = append(kids[e.from], viewKid{to: e.to, label: e.label})
	}
	for _, list := range kids {
		sort.SliceStable(list, func(i, j int) bool {
			return lab[list[i].to] < lab[list[j].to]
		})
	}

	labels := map[string]bool{}
	for _, e := range kept {
		labels[e.label] = true
	}
	many := 1 < len(labels)
	byLabel := func(list []string) {
		sort.SliceStable(list, func(i, j int) bool {
			return lab[list[i]] < lab[list[j]]
		})
	}

	var named []string
	if 0 < len(roots) {
		errs := []VetFinding{}
		for _, r := range roots {
			if !ns[r] {
				errs = append(errs, viewRootFinding(r, relation, nodes))
			}
		}
		if 0 < len(errs) {
			return "", errs
		}
		rseen := map[string]bool{}
		for _, r := range roots {
			if !rseen[r] {
				rseen[r] = true
				named = append(named, r)
			}
		}
		byLabel(named)
	} else {
		// A root is a node nothing depends on; a self-edge does not
		// make a node depended upon for this purpose.
		depended := map[string]bool{}
		for _, e := range kept {
			if e.to != e.from {
				depended[e.to] = true
			}
		}
		for _, n := range nodes {
			if !depended[n] {
				named = append(named, n)
			}
		}
		byLabel(named)
	}

	out := []string{}
	expanded := map[string]bool{}

	draw := func(root string) {
		if 0 < len(out) {
			out = append(out, "")
		}
		out = append(out, lab[root])
		expanded[root] = true

		// ITERATIVE, with the ancestor chain carried as a set: a deep
		// dependency chain is a real shape, and the drawing must not
		// depend on how deep the host lets a stack go.
		chain := map[string]bool{root: true}
		stack := []viewFrame{{node: root, prefix: "", at: 0}}
		for 0 < len(stack) {
			frame := &stack[len(stack)-1]
			list := kids[frame.node]
			if frame.at >= len(list) {
				delete(chain, frame.node)
				stack = stack[:len(stack)-1]
				continue
			}
			edge := list[frame.at]
			frame.at++
			last := frame.at == len(list)
			loop := chain[edge.to]
			seen := expanded[edge.to]
			grown := 0 < len(kids[edge.to])
			line := frame.prefix
			if last {
				line += "└── "
			} else {
				line += "├── "
			}
			line += lab[edge.to]
			if many {
				line += " (" + edge.label + ")"
			}
			if loop {
				line += " (cycle)"
			} else if seen && grown {
				line += " (*)"
			}
			out = append(out, line)
			if loop || seen {
				continue
			}
			expanded[edge.to] = true
			chain[edge.to] = true
			prefix := frame.prefix + "│   "
			if last {
				prefix = frame.prefix + "    "
			}
			stack = append(stack, viewFrame{node: edge.to, prefix: prefix, at: 0})
		}
	}

	for _, root := range named {
		draw(root)
	}

	// EVERY NODE IS DRAWN: a component with no node nothing depends on
	// would otherwise vanish in silence.
	if 0 == len(roots) {
		for _, n := range nodes {
			if !expanded[n] {
				draw(n)
			}
		}
	}

	return strings.Join(out, "\n"), nil
}

// ViewTree draws the dependency tree of src's link graph.
func (a *Aontu) ViewTree(src string, opts *ViewOptions) ViewReport {
	options := ViewOptions{}
	if nil != opts {
		options = *opts
	}

	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return ViewReport{Verdict: "error", Kind: "tree",
			Errors: []VetFinding{parseFinding(a.File, VetRoleData, perr)}}
	}

	root, ctx, _ := a.unifyCtx(parsed, nil, src)
	// A document that does not stand up has no graph to draw: the
	// errors it already has are the answer.
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return ViewReport{Verdict: "error", Kind: "tree",
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	text, errs := drawTree(
		collapseEdges(GraphOf(root).Edges, options.Relation),
		options.Relation, options.Roots)
	if 0 < len(errs) {
		return ViewReport{Verdict: "error", Kind: "tree", Errors: errs}
	}
	return ViewReport{Verdict: "rendered", Kind: "tree", Text: &text}
}
