/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)


// Edge is one checked link. Mirrors Edge in ts/src/graph.ts.
type Edge struct {
	From string `json:"from"`
	Key string `json:"key"`
	To string `json:"to"`
	// At is where the link is, as a `$.dotted.path`.
	At string `json:"at"`
	Hidden bool `json:"hidden,omitempty"`
}

type Graph struct {
	Edges []Edge `json:"edges"`
	Disjunct []string `json:"disjunct,omitempty"`
}

func graphPath(path []string) string {
	if 0 == len(path) {
		return "$"
	}
	return "$." + strings.Join(path, ".")
}

func cutEdge(at []string) (string, string) {
	i := len(at) - 1
	for ; 0 <= i && allDigits(at[i]); i-- {
	}
	if 0 > i {
		return graphPath(nil), ""
	}
	return graphPath(at[:i]), at[i]
}

func GraphOf(root Val) Graph {
	edges := []Edge{}
	disjunct := []string{}
	ancestors := map[Val]bool{}

	// ONE WALK, with `undecided` saying which side of ADR-007 it is on:
	// below an unresolved disjunction every link is a position the
	// document has not decided, and nothing there is an edge.
	var visit func(node Val, path []string, hidden, undecided bool, under []string)
	visit = func(node Val, path []string, hidden, undecided bool, under []string) {
		if nil == node || ancestors[node] {
			return
		}

		hidden = hidden || node.markedHide()

		if link := node.linkAddr(); "" != link && undecided {
			disjunct = append(disjunct, graphPath(path))
		} else if "" != link {
			from, key := cutEdge(path)
			if !node.linkInfo().root && nil != under {
				from, key = graphPath(under[:len(under)-1]), under[len(under)-1]
			}
			edges = append(edges, Edge{
				From:   from,
				Key:    key,
				To:     link,
				At:     graphPath(path),
				Hidden: hidden,
			})
		}

		// A graph atom is TRANSPARENT here (RELATIONS P2): it carries
		// the field's value at the field's own position, and the graph
		// is about the value.
		if ga, ok := node.(*GraphAtomVal); ok && nil != ga.held {
			visit(ga.held, path, hidden, undecided, under)
		}

		// The field a `relate()` was written at names the relation of the
		// links below it, which is what canon writes, so the two agree.
		switch node.(type) {
		case *MapVal, *ListVal:
			if node.linkInfo().root {
				under = nil
				if 0 < len(path) && predicateNameOK(path[len(path)-1]) {
					under = path
				}
			}
		}

		switch n := node.(type) {
		// An unresolved conjunction holds its terms at the SAME
		// position; every link among them is written there, and is an
		// edge.
		case *ConjunctVal:
			ancestors[node] = true
			for _, t := range n.peg {
				visit(t, path, hidden, undecided, under)
			}
			delete(ancestors, node)
		case *DisjunctVal:
			ancestors[node] = true
			for _, arm := range n.peg {
				visit(arm, path, hidden, true, under)
			}
			delete(ancestors, node)
		case *MapVal:
			ancestors[node] = true
			for _, k := range n.keys {
				visit(n.peg[k], append(cp(path), k), hidden, undecided, under)
			}
			delete(ancestors, node)
		case *ListVal:
			ancestors[node] = true
			for i, e := range n.peg {
				visit(e, append(cp(path), itoa(i)), hidden, undecided, under)
			}
			delete(ancestors, node)
		}
	}

	visit(root, nil, false, false, nil)

	sort.Slice(edges, func(i, j int) bool { return edges[i].At < edges[j].At })

	if 0 < len(disjunct) {
		sort.Strings(disjunct)
		unique := []string{}
		for i, p := range disjunct {
			if 0 == i || disjunct[i-1] != p {
				unique = append(unique, p)
			}
		}
		return Graph{Edges: edges, Disjunct: unique}
	}
	return Graph{Edges: edges}
}
