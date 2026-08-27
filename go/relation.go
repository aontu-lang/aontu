/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// RELATION GRAPH CHECKS (G4 phase 5,
// docs/capability-review/g4-identity-relations.md, and the Go side of
// ts/src/relation.ts): acyclicity and inverse consistency over the edge
// set, checked AFTER unification and never by it.
//
// Why not in the lattice. Both properties are GLOBAL and NON-MONOTONE:
// an acyclic graph becomes cyclic when one more edge unifies in, and an
// inverse that is present becomes absent when the far side is narrowed.
// The lattice guarantee is that more information never falsifies what
// has been observed, so a constraint that could be true and then false
// is not a constraint the lattice may hold.
//
// A relation is DECLARED as data, under the `relations` key of the
// document root, which is the `std/system` vocabulary's convention.
// Nothing in the engine knows that name; this pass does, and says so.

// RelationFinding is one broken relation property.
// Field order is LEXICOGRAPHIC, the canonical emitter's order — the
// TypeScript port's exactJSON sorts keys, and a report is read by a
// machine that diffs it.
type RelationFinding struct {
	// At is where the offending edge is written, as a `$.dotted.path`.
	At   string `json:"at"`
	Code string `json:"code"`
	// Detail is, for a cycle, the entities it runs through in the order
	// the walk found them, closing back on the first; for a missing
	// inverse, the two ends and the relation that should have mirrored
	// it.
	Detail []string `json:"detail"`
	// Relation the finding is about.
	Relation string `json:"relation"`
}

// RelationReport is the relation checks for one document.
type RelationReport struct {
	// Errors is WHY the graph could not be looked at, in the same
	// finding shape Vet reports in (the review's finding F). Findings is
	// about the GRAPH and stays that way; a document that does not stand
	// up has no graph to have findings about, and an `error` verdict
	// used to arrive with an empty list -- something is wrong, and
	// nothing about what. Present ONLY on an `error` verdict.
	Errors   []VetFinding      `json:"errors,omitempty"`
	Findings []RelationFinding `json:"findings"`
	Verdict  string            `json:"verdict"`
}

// declaredRelation is one declared relation, as the document spells it.
type declaredRelation struct {
	name    string
	inverse string
	acyclic bool
}

// entityOfAddr is the entity an address names — everything before the
// first dot. An edge into `svc/auth.ports.http` is an edge to
// `svc/auth`: a relation holds between ENTITIES, and the path inside
// one says which part of it the link reaches.
func entityOfAddr(addr string) string {
	if i := strings.IndexByte(addr, '.'); 0 <= i {
		return addr[:i]
	}
	return addr
}

func declaredRelations(root Val) []declaredRelation {
	m, ok := root.(*MapVal)
	if !ok {
		return nil
	}
	rels, ok := m.peg["relations"].(*MapVal)
	if !ok {
		return nil
	}
	names := append([]string{}, rels.keys...)
	sort.Strings(names)

	out := []declaredRelation{}
	for _, name := range names {
		r, ok := rels.peg[name].(*MapVal)
		if !ok {
			continue
		}
		d := declaredRelation{name: name}
		if sv, ok := r.peg["inverse"].(*ScalarVal); ok && KindString == sv.kind {
			d.inverse, _ = sv.peg.(string)
		}
		if sv, ok := r.peg["acyclic"].(*ScalarVal); ok {
			b, _ := sv.peg.(bool)
			d.acyclic = b
		}
		out = append(out, d)
	}
	return out
}

// findCycle is the first cycle reachable from start, as the entities it
// runs through, or nil. Depth-first with the path as the stack, and the
// successors visited in sorted order, so the cycle a report names is
// the same one in both ports.
func findCycle(start string, succ map[string][]string, done map[string]bool) []string {
	stack := []string{}
	onStack := map[string]bool{}

	var walk func(node string) []string
	walk = func(node string) []string {
		if onStack[node] {
			for i, n := range stack {
				if n == node {
					return append(append([]string{}, stack[i:]...), node)
				}
			}
		}
		if done[node] {
			return nil
		}
		done[node] = true
		stack = append(stack, node)
		onStack[node] = true
		for _, next := range succ[node] {
			if found := walk(next); nil != found {
				return found
			}
		}
		stack = stack[:len(stack)-1]
		delete(onStack, node)
		return nil
	}

	return walk(start)
}

// RelationCheck runs the relation checks over one document.
func (a *Aontu) RelationCheck(src string) RelationReport {
	// Parsed and unified in two steps rather than through Unify, so the
	// failure can be REPORTED: the context carries the engine's own
	// first error, and Unify hands back only that something went wrong.
	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return RelationReport{Verdict: "error", Findings: []RelationFinding{},
			Errors: []VetFinding{parseFinding(a.File, VetRoleData, perr)}}
	}

	root, ctx, _ := a.unifyCtx(parsed, nil, src)

	// A document that does not stand up is not a document with a bad
	// graph: the errors it already has are the answer, and blaming its
	// relations on top would be noise.
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return RelationReport{Verdict: "error", Findings: []RelationFinding{},
			Errors: []VetFinding{failureFinding(ctx, a.File, src)}}
	}

	declared := declaredRelations(root)
	if 0 == len(declared) {
		return RelationReport{Verdict: "pass", Findings: []RelationFinding{}}
	}

	edges := GraphOf(root).Edges
	findings := []RelationFinding{}

	// The edge set, indexed the two ways the checks read it.
	byRelation := map[string][]Edge{}
	pairs := map[string]bool{}
	for _, e := range edges {
		if "" == e.From {
			// An edge outside every entity has no source to be a
			// relation OF.
			continue
		}
		byRelation[e.Key] = append(byRelation[e.Key], e)
		pairs[e.Key+" "+e.From+" "+entityOfAddr(e.To)] = true
	}

	for _, rel := range declared {
		mine := byRelation[rel.name]

		if rel.acyclic {
			succ := map[string][]string{}
			for _, e := range mine {
				succ[e.From] = append(succ[e.From], entityOfAddr(e.To))
			}
			roots := make([]string, 0, len(succ))
			for from, list := range succ {
				sort.Strings(list)
				roots = append(roots, from)
			}
			sort.Strings(roots)

			// The roots are visited in sorted order, and a node already
			// settled is not revisited, so one cycle is reported once
			// and the SAME one in both ports.
			done := map[string]bool{}
			for _, from := range roots {
				cycle := findCycle(from, succ, done)
				if nil == cycle {
					continue
				}
				// The cycle's first node is a key of `succ`, and every
				// key of `succ` came from an edge's From, so the edge is
				// there.
				at := ""
				for _, e := range mine {
					if e.From == cycle[0] {
						at = e.At
						break
					}
				}
				findings = append(findings, RelationFinding{
					Code:     "relation_cycle",
					Relation: rel.name,
					At:       at,
					Detail:   cycle,
				})
				break
			}
		}

		if "" != rel.inverse {
			for _, e := range mine {
				to := entityOfAddr(e.To)
				if !pairs[rel.inverse+" "+to+" "+e.From] {
					findings = append(findings, RelationFinding{
						Code:     "relation_inverse_missing",
						Relation: rel.name,
						At:       e.At,
						Detail:   []string{e.From, to, rel.inverse},
					})
				}
			}
		}
	}

	// SORTED, because a report is read by a machine that diffs it: by
	// the position the offending edge is written at, then by code. No
	// third key: one edge sits under one key and one key is one
	// relation, so two findings can share (at, code) only by being the
	// same finding. The sort is STABLE, and the relations were iterated
	// in sorted order, so what order remains is fixed anyway.
	sort.SliceStable(findings, func(i, j int) bool {
		if findings[i].At != findings[j].At {
			return findings[i].At < findings[j].At
		}
		return findings[i].Code < findings[j].Code
	})

	verdict := "pass"
	if 0 < len(findings) {
		verdict = "fail"
	}
	return RelationReport{Verdict: verdict, Findings: findings}
}
