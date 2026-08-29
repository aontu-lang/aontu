/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// THE DERIVED STRUCTURES (G4 phase 3,
// docs/capability-review/g4-identity-relations.md, and the Go side of
// ts/src/graph.ts): an evaluated document has, besides its value, a
// GRAPH — an entity index (id → the tree paths that hold it) and an
// edge set (the checked links, each from one entity to one address).
//
// G4's deliverable is that these exist and are DETERMINISTIC. What is
// built on them — impact analysis ("what reaches svc_auth?"),
// reachability, context-window-sized entity slices — is a traversal,
// and its exposure as verbs and projections belongs to G7. Relation
// properties (acyclicity, inverse consistency) are G4 phase 5's, and
// consume exactly this edge set.

// EntityEntry is one id and every tree path that holds it. More than
// one path is the normal case: the merge puts the entity's value at
// every position that declared it.
type EntityEntry struct {
	ID    string   `json:"id"`
	Paths []string `json:"paths"`
}

// Edge is one checked link.
type Edge struct {
	// From is the entity the link is INSIDE — the nearest identified
	// ancestor, or "" for a link outside every entity. This is the
	// entity/component distinction: a node without an id is a component
	// of its nearest identified ancestor.
	From string `json:"from"`
	// Key is the RELATION: the nearest map key on the way down from the
	// entity, so a link inside a list (`dependsOn: [&: refer(),
	// svc_auth]`) is an edge under `dependsOn` rather than under `0`.
	Key string `json:"key"`
	// To is the address, as the link spells it.
	To string `json:"to"`
	// At is where the link is, as a `$.dotted.path`.
	At string `json:"at"`
}

// Graph is an evaluated document's entity index and edge set.
type Graph struct {
	Entities []EntityEntry `json:"entities"`
	Edges    []Edge        `json:"edges"`
}

func graphPath(path []string) string {
	if 0 == len(path) {
		return "$"
	}
	return "$." + strings.Join(path, ".")
}

// relationKey is the nearest map key on the path below an entity: list
// indices are positions within a relation, not relations of their own.
func relationKey(tail []string) string {
	for i := len(tail) - 1; 0 <= i; i-- {
		if !allDigits(tail[i]) {
			return tail[i]
		}
	}
	return ""
}

// GraphOf is the graph of an evaluated tree. Walks POSITIONS, not
// values: two positions of one entity share a value object after the
// merge, so a walk guarded by object identity would find the entity
// once and miss every other place it is declared. The guard is
// therefore the ancestor chain — which is what a cycle actually is.
func GraphOf(root Val) Graph {
	byID := map[string][]string{}
	edges := []Edge{}
	ancestors := map[Val]bool{}

	var visit func(node Val, path []string, entity string, tail []string)
	visit = func(node Val, path []string, entity string, tail []string) {
		if nil == node || ancestors[node] {
			return
		}

		inside, below := entity, tail
		if name := node.entityName(); "" != name {
			byID[name] = append(byID[name], graphPath(path))
			// A nested entity is not a component of the one above it:
			// the key path restarts at the identified node.
			inside, below = name, nil
		}

		if link := node.linkAddr(); "" != link {
			// A rel()-minted link carries its PREDICATE -- the key the
			// rel() sat on, declared in the schema -- and that beats
			// the path inference, which answered wrongly for
			// map-valued relations. refer()-minted links keep the
			// inference until P3 retires them. Mirrors ts/src/graph.ts.
			key := relationKey(below)
			if bb, ok := node.(interface{ relKey() string }); ok && "" != bb.relKey() {
				key = bb.relKey()
			}
			edges = append(edges, Edge{
				From: inside,
				Key:  key,
				To:   link,
				At:   graphPath(path),
			})
		}

		// A graph atom is TRANSPARENT here (RELATIONS P2): it carries
		// the field's value at the field's own position, and the graph
		// is about the value.
		if ga, ok := node.(*GraphAtomVal); ok && nil != ga.held {
			visit(ga.held, path, inside, below)
		}

		switch n := node.(type) {
		case *MapVal:
			ancestors[node] = true
			for _, k := range n.keys {
				visit(n.peg[k], append(cp(path), k), inside, append(cp(below), k))
			}
			delete(ancestors, node)
		case *ListVal:
			ancestors[node] = true
			for i, e := range n.peg {
				visit(e, append(cp(path), itoa(i)), inside, append(cp(below), itoa(i)))
			}
			delete(ancestors, node)
		}
	}

	visit(root, nil, "", nil)

	// DETERMINISTIC by construction, not by luck — which matters more
	// here than anywhere: Go map order is random, so an index built
	// from one without this would differ run to run and between the
	// ports (ADR-001).
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	entities := make([]EntityEntry, 0, len(ids))
	for _, id := range ids {
		paths := byID[id]
		sort.Strings(paths)
		entities = append(entities, EntityEntry{ID: id, Paths: paths})
	}

	sort.Slice(edges, func(i, j int) bool { return edges[i].At < edges[j].At })

	return Graph{Entities: entities, Edges: edges}
}
