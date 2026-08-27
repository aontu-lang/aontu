/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// REACHABILITY OVER THE ENTITY GRAPH (the review's finding J,
// use-cases/REVIEW.md) — the Go twin of ts/src/reach.ts. See that file
// for why this is a verb rather than a constraint, and why it is
// transitive rather than reflexive-transitive.

import (
	"sort"
	"strings"
)

// ReachVerdict is reaches | unreachable | error.
type ReachVerdict = string

// ReachReport is the answer for one document, mirroring ReachReport in
// ts/src/reach.ts field for field.
type ReachReport struct {
	Verdict ReachVerdict `json:"verdict"`

	// Path is the path found, as entity names from the source to the
	// destination, both included. Present ONLY on `reaches`: a path is
	// the evidence for the answer, and there is no evidence for a
	// negative one.
	Path []string `json:"path,omitempty"`

	// Errors is WHY the graph could not be looked at, in vet's finding
	// shape. Present ONLY on `error`.
	Errors []VetFinding `json:"errors,omitempty"`
}

// ReachOptions mirrors ReachOptions in ts/src/reach.ts.
type ReachOptions struct {
	// Relation follows only edges under this relation. Empty means
	// follow every edge, which is the whole graph and the commoner
	// question.
	Relation string
}

// reachEndpointFinding is the refusal for an endpoint that names no
// entity. NOT "unreachable": answering `no` would report a typo as a
// fact about the model.
func reachEndpointFinding(name string, known []string) VetFinding {
	f := VetFinding{
		Code:     "refer_unresolved",
		Class:    "reference",
		Severity: "error",
		Path:     "$",
		Message:  name + " names no entity in this document.",
		Sites:    []VetSite{},
	}
	if 0 < len(known) {
		note := "known entities: " + strings.Join(known, ", ")
		f.Note = &note
	}
	return f
}

// Reach answers whether `to` is reachable from `from` over the entity
// graph of src.
func (a *Aontu) Reach(src, from, to string, opts *ReachOptions) ReachReport {
	options := ReachOptions{}
	if nil != opts {
		options = *opts
	}

	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return ReachReport{Verdict: "error",
			Errors: []VetFinding{parseFinding(a.File, VetRoleData, perr)}}
	}

	root, ctx, _ := a.unifyCtx(parsed, nil, src)
	// A document that does not stand up is not a document with an
	// unreachable pair: the errors it already has are the answer.
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return ReachReport{Verdict: "error",
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	graph := GraphOf(root)
	known := make([]string, 0, len(graph.Entities))
	for _, e := range graph.Entities {
		known = append(known, e.ID)
	}
	sort.Strings(known)

	has := func(name string) bool {
		for _, k := range known {
			if k == name {
				return true
			}
		}
		return false
	}
	errs := []VetFinding{}
	for _, n := range []string{from, to} {
		if !has(n) {
			errs = append(errs, reachEndpointFinding(n, known))
		}
	}
	if 0 < len(errs) {
		return ReachReport{Verdict: "error", Errors: errs}
	}

	// The successor map, restricted to one relation when the caller
	// asked for one. Sorted, so the path the search finds is the same
	// one in both ports.
	succ := map[string][]string{}
	for _, e := range graph.Edges {
		if "" == e.From || ("" != options.Relation && options.Relation != e.Key) {
			continue
		}
		dest := entityOfAddr(e.To)
		dup := false
		for _, d := range succ[e.From] {
			if d == dest {
				dup = true
				break
			}
		}
		if !dup {
			succ[e.From] = append(succ[e.From], dest)
		}
	}
	for _, list := range succ {
		sort.Strings(list)
	}

	// BREADTH-FIRST, so the path reported is a SHORTEST one, and with
	// the successors sorted, a determined one.
	prev := map[string]string{}
	seen := map[string]bool{}
	front := []string{from}
	for 0 < len(front) {
		next := []string{}
		for _, node := range front {
			for _, dest := range succ[node] {
				if dest == to {
					path := []string{dest}
					step := node
					for step != from {
						path = append([]string{step}, path...)
						step = prev[step]
					}
					path = append([]string{from}, path...)
					return ReachReport{Verdict: "reaches", Path: path}
				}
				if !seen[dest] {
					seen[dest] = true
					prev[dest] = node
					next = append(next, dest)
				}
			}
		}
		front = next
	}

	return ReachReport{Verdict: "unreachable"}
}
