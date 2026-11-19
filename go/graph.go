/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// Edge is one checked link. Mirrors Edge in ts/src/graph.ts.
type Edge struct {
	From string `json:"from"`
	Key  string `json:"key"`
	To   string `json:"to"`
	// At is where the link is, as a `$.dotted.path`.
	At     string `json:"at"`
	Hidden bool   `json:"hidden,omitempty"`
}

type Graph struct {
	Edges    []Edge   `json:"edges"`
	Disjunct []string `json:"disjunct,omitempty"`
}

// relDecl is what the graph atoms met at one key name declare (RelDecl in ts/src/graph.ts).
type relDecl struct {
	acyclic  bool
	inverses map[string]bool
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

func graphWalk(root Val) ([]Edge, []string, map[string]*relDecl) {
	edges := []Edge{}
	disjunct := []string{}
	decls := map[string]*relDecl{}
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

		// A graph atom declares where it is met, as a link is an edge:
		// never below an unresolved disjunction.
		if d := node.declRec(); nil != d && !undecided &&
			0 < len(path) && predicateNameOK(path[len(path)-1]) {
			name := path[len(path)-1]
			rd := decls[name]
			if nil == rd {
				rd = &relDecl{inverses: map[string]bool{}}
				decls[name] = rd
			}
			rd.acyclic = rd.acyclic || d.acyclic
			for _, k := range d.inverses {
				rd.inverses[k] = true
			}
		}

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
	return edges, disjunct, decls
}

func GraphOf(root Val) Graph {
	edges, disjunct, _ := graphWalk(root)
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

// declsOf reads every graph atom the finished value holds, by the key it is met at.
func declsOf(root Val) map[string]*relDecl {
	_, _, decls := graphWalk(root)
	return decls
}
