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

// pickedArms are the arms generation writes: the preference of the lowest rank, or every arm, which it writes only alike.
func pickedArms(arms []Val) []Val {
	var best *PrefVal
	for _, m := range arms {
		if p, ok := m.(*PrefVal); ok && (nil == best || p.rank < best.rank) {
			best = p
		}
	}
	if nil == best {
		return arms
	}
	return []Val{best}
}

func graphWalk(root Val, written bool) ([]Edge, []string, map[string]*relDecl, map[string]Val) {
	edges := []Edge{}
	disjunct := []string{}
	decls := map[string]*relDecl{}
	sites := map[string]Val{}
	ancestors := map[Val]bool{}

	// ONE WALK, with `undecided` saying which side of the disjunction it is on:
	// below an unresolved disjunction every link is a position the
	// document has not decided, and nothing there is an edge. Read as
	// `written`, the arms generation picks are decided and no other is read.
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
			if _, held := sites[graphPath(path)]; !held {
				sites[graphPath(path)] = node
			}
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
			arms := n.peg
			if written {
				arms = pickedArms(arms)
			}
			for _, arm := range arms {
				visit(arm, path, hidden, undecided || !written, under)
			}
			delete(ancestors, node)
		case *PrefVal:
			if written {
				ancestors[node] = true
				visit(n.peg, path, hidden, undecided, under)
				delete(ancestors, node)
			}
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
	return edges, disjunct, decls, sites
}

// writtenOf reads what generation writes, a default's edges and atoms among them, with the value each edge is written at.
func writtenOf(root Val) (Graph, map[string]*relDecl, map[string]Val) {
	edges, _, decls, sites := graphWalk(root, true)
	return Graph{Edges: edges}, decls, sites
}

func GraphOf(root Val) Graph {
	edges, disjunct, _, _ := graphWalk(root, false)

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
	_, _, decls, _ := graphWalk(root, false)
	return decls
}
