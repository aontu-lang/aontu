/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// REACHABILITY OVER THE LINK GRAPH (the review's finding J,
// use-cases/REVIEW.md) — the Go twin of ts/src/reach.ts. See that file
// for why this is a verb rather than a constraint, and why it is
// transitive rather than reflexive-transitive.

import (
	"sort"
	"strconv"
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
		Message:  name + " names no node in this document.",
		Sites:    []VetSite{},
	}
	if 0 < len(known) {
		note := "nodes with links: " + strings.Join(known, ", ")
		f.Note = &note
	}
	return f
}

// parseNodePath is the segments a `$.dotted` endpoint spells, or
// ok=false when it is not one. Reachability is between TREE POSITIONS
// (ADR-013), so an endpoint is a path and nothing else -- the same
// spelling the report prints back. Mirrors parseNodePath in
// ts/src/reach.ts.
func parseNodePath(s string) ([]string, bool) {
	if "$" == s {
		return nil, true
	}
	if !strings.HasPrefix(s, "$.") {
		return nil, false
	}
	parts := strings.Split(s[2:], ".")
	for _, p := range parts {
		if !addrSegmentOK(p) {
			return nil, false
		}
	}
	return parts, true
}

// nodeAt reports whether a path names a node of the evaluated tree. An
// endpoint that exists but has no edges is a perfectly good question
// with the answer `unreachable`; only one that names NOTHING is an
// error. Mirrors nodeAt in ts/src/reach.ts.
func nodeAt(root Val, path []string) bool {
	node := root
	for _, seg := range path {
		var next Val
		switch n := node.(type) {
		case *MapVal:
			next = n.peg[seg]
		case *ListVal:
			if i, err := strconv.Atoi(seg); nil == err && 0 <= i && i < len(n.peg) {
				next = n.peg[i]
			}
		}
		if nil == next {
			return false
		}
		node = next
	}
	return nil != node
}

// Reach answers whether `to` is reachable from `from` over the link
// graph of src. Endpoints are `$.dotted` node paths (ADR-013).
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
	// The nodes the graph actually touches, for the error note: a
	// document has every path in it, and listing them all would drown
	// the one fact a mistyped endpoint needs.
	seen := map[string]bool{}
	linked := []string{}
	for _, e := range graph.Edges {
		for _, p := range []string{e.From, e.To} {
			if !seen[p] {
				seen[p] = true
				linked = append(linked, p)
			}
		}
	}
	sort.Strings(linked)

	errs := []VetFinding{}
	for _, n := range []string{from, to} {
		parts, pok := parseNodePath(n)
		if !pok || !nodeAt(root, parts) {
			errs = append(errs, reachEndpointFinding(n, linked))
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
		if "" != options.Relation && options.Relation != e.Key {
			continue
		}
		dest := e.To
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
	visited := map[string]bool{}
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
				if !visited[dest] {
					visited[dest] = true
					prev[dest] = node
					next = append(next, dest)
				}
			}
		}
		front = next
	}

	return ReachReport{Verdict: "unreachable"}
}
