/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// THE DERIVED STRUCTURE (G4 phase 3,
// docs/capability-review/g4-identity-relations.md, and the Go side of
// ts/src/graph.ts): an evaluated document has, besides its value, a
// GRAPH — the set of checked links, each from one tree position to
// another.
//
// The graph is PATH-NATIVE (ADR-014). There is no second namespace to
// index: a node's address is its path, so the node a link starts at is
// derived from where the link sits rather than declared by a mark.
//
// G4's deliverable is that this exists and is DETERMINISTIC. What is
// built on it — impact analysis ("what reaches $.services.auth?"),
// reachability, context-window-sized slices — is a traversal, and its
// exposure as verbs and projections belongs to G7. Relation properties
// (acyclicity, inverse consistency) are G4 phase 5's, and consume
// exactly this edge set.

// Edge is one checked link. Mirrors Edge in ts/src/graph.ts.
type Edge struct {
	// From is the node the link starts at, as a `$.dotted.path`: the
	// link's own position with the relation key and any list indices
	// stripped. `$` when the link sits at the top of the document.
	From string `json:"from"`
	// Key is the RELATION: the key the link hangs under, so a link
	// inside a list (`dependsOn: [refer() & "$.a"]`) is an edge under
	// `dependsOn` rather than under `0`. A rel()-minted link carries its
	// predicate declared rather than inferred.
	Key string `json:"key"`
	// To is the address the link resolved to, as a `$.dotted.path`.
	To string `json:"to"`
	// At is where the link is, as a `$.dotted.path`.
	At string `json:"at"`
	// Hidden is set when the link sits inside a `hide()`-marked subtree.
	// The link is still checked and still an edge, but a figure that
	// draws it DISCLOSES what the document hides, so the view extractors
	// skip it and report it as `hidden_contribution`.
	Hidden bool `json:"hidden,omitempty"`
}

// Graph is an evaluated document's edge set. There is no entity index,
// because there is no second namespace to index (ADR-014): a node's
// address is its path.
type Graph struct {
	Edges []Edge `json:"edges"`
	// Disjunct holds the positions of links written under an UNRESOLVED
	// DISJUNCTION. ADR-007: an unresolved disjunction is not a value, so
	// a link beneath one of its arms is not a fact and is not an edge --
	// but it is not nothing either, and a figure that silently dropped
	// it would be the failure the views exist to avoid. Absent when
	// there are none, so a graph of a decided document is the shape it
	// always was.
	Disjunct []string `json:"disjunct,omitempty"`
}

func graphPath(path []string) string {
	if 0 == len(path) {
		return "$"
	}
	return "$." + strings.Join(path, ".")
}

// cutEdge is the node a link starts at and the relation it hangs under,
// derived from the link's own position.
//
// A DECLARED predicate (rel()-minted) is authoritative: the link is cut
// at the key the rel() sat on, wherever that is on the way down, which
// is what makes a MAP-valued relation report the relation rather than
// the inner label. Without one the relation is INFERRED: strip the list
// indices, and the first real key above the link is it. Mirrors `cut`
// in ts/src/graph.ts.
func cutEdge(at []string, relkey string) (string, string) {
	if "" != relkey {
		for i := len(at) - 1; 0 <= i; i-- {
			if at[i] == relkey {
				return graphPath(at[:i]), relkey
			}
		}
	}
	i := len(at) - 1
	for ; 0 <= i && allDigits(at[i]); i-- {
	}
	if 0 > i {
		return graphPath(nil), relkey
	}
	key := relkey
	if "" == key {
		key = at[i]
	}
	return graphPath(at[:i]), key
}

// GraphOf is the graph of an evaluated tree. Walks POSITIONS, not
// values: a reference or a spread can put one value object at several
// positions, and a walk guarded by object identity would find the first
// and miss every other place it is reached. The guard is therefore the
// ancestor chain — which is what a cycle actually is.
func GraphOf(root Val) Graph {
	edges := []Edge{}
	disjunct := []string{}
	ancestors := map[Val]bool{}

	// ONE WALK, with `undecided` saying which side of ADR-007 it is on:
	// below an unresolved disjunction every link is a position the
	// document has not decided, and nothing there is an edge.
	var visit func(node Val, path []string, hidden, undecided bool)
	visit = func(node Val, path []string, hidden, undecided bool) {
		if nil == node || ancestors[node] {
			return
		}

		hidden = hidden || node.markedHide()

		if link := node.linkAddr(); "" != link && undecided {
			disjunct = append(disjunct, graphPath(path))
		} else if "" != link {
			relkey := ""
			if bb, ok := node.(interface{ relKey() string }); ok {
				relkey = bb.relKey()
			}
			from, key := cutEdge(path, relkey)
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
			visit(ga.held, path, hidden, undecided)
		}

		switch n := node.(type) {
		// An unresolved conjunction holds its terms at the SAME
		// position; every link among them is written there, and is an
		// edge.
		case *ConjunctVal:
			ancestors[node] = true
			for _, t := range n.peg {
				visit(t, path, hidden, undecided)
			}
			delete(ancestors, node)
		// AN UNRESOLVED DISJUNCTION IS NOT A VALUE (ADR-007), so a link
		// under one of its arms is not an edge. It is COUNTED, with its
		// position, so a figure can report what the document leaves
		// undecided rather than drawing it or dropping it in silence.
		case *DisjunctVal:
			ancestors[node] = true
			for _, arm := range n.peg {
				visit(arm, path, hidden, true)
			}
			delete(ancestors, node)
		case *MapVal:
			ancestors[node] = true
			for _, k := range n.keys {
				visit(n.peg[k], append(cp(path), k), hidden, undecided)
			}
			delete(ancestors, node)
		case *ListVal:
			ancestors[node] = true
			for i, e := range n.peg {
				visit(e, append(cp(path), itoa(i)), hidden, undecided)
			}
			delete(ancestors, node)
		}
	}

	visit(root, nil, false, false)

	// DETERMINISTIC by construction, not by luck — which matters more
	// here than anywhere: Go map order is random, so anything built from
	// one without this would differ run to run and between the ports
	// (ADR-001). Edges sort by the position they are written at, which
	// is unique — one link, one place.
	// That holds through a conjunction too: its terms share the
	// position, and two links there would have had to unify into one.
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
