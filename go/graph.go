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
// The graph is PATH-NATIVE (ADR-013). There is no second namespace to
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
}

// Graph is an evaluated document's edge set. There is no entity index,
// because there is no second namespace to index (ADR-013): a node's
// address is its path.
type Graph struct {
	Edges []Edge `json:"edges"`
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
	ancestors := map[Val]bool{}

	var visit func(node Val, path []string)
	visit = func(node Val, path []string) {
		if nil == node || ancestors[node] {
			return
		}

		if link := node.linkAddr(); "" != link {
			relkey := ""
			if bb, ok := node.(interface{ relKey() string }); ok {
				relkey = bb.relKey()
			}
			from, key := cutEdge(path, relkey)
			edges = append(edges, Edge{
				From: from,
				Key:  key,
				To:   link,
				At:   graphPath(path),
			})
		}

		// A graph atom is TRANSPARENT here (RELATIONS P2): it carries
		// the field's value at the field's own position, and the graph
		// is about the value.
		if ga, ok := node.(*GraphAtomVal); ok && nil != ga.held {
			visit(ga.held, path)
		}

		switch n := node.(type) {
		case *MapVal:
			ancestors[node] = true
			for _, k := range n.keys {
				visit(n.peg[k], append(cp(path), k))
			}
			delete(ancestors, node)
		case *ListVal:
			ancestors[node] = true
			for i, e := range n.peg {
				visit(e, append(cp(path), itoa(i)))
			}
			delete(ancestors, node)
		}
	}

	visit(root, nil)

	// DETERMINISTIC by construction, not by luck — which matters more
	// here than anywhere: Go map order is random, so anything built from
	// one without this would differ run to run and between the ports
	// (ADR-001). Edges sort by the position they are written at, which
	// is unique — one link, one place.
	sort.Slice(edges, func(i, j int) bool { return edges[i].At < edges[j].At })

	return Graph{Edges: edges}
}
