/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
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
	// target is what the FAR END must satisfy, if the relation says.
	// nil when the relation declares none, and when it declares `top`
	// -- which constrains nothing and would report nothing, so reading
	// it as a declaration would only cost a meet per edge.
	target Val
}

// entityOfAddr is the entity an address names — everything before the
// first dot. An edge into `svc_auth.ports.http` is an edge to
// `svc_auth`: a relation holds between ENTITIES, and the path inside
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
		if t, ok := r.peg["target"]; ok && nil != t && !isTop(t) {
			d.target = t
		}
		out = append(out, d)
	}
	return out
}

// addressedNode is the node an address names, or nil. The entity's own
// position comes from the graph (a merged entity sits at every position
// that declared it, and they hold the same value, so the FIRST in the
// graph's sorted list is as good as any and is the same one in both
// ports); the rest of the address walks into it, exactly as the
// address's own grammar says. Mirrors `addressed` in ts/src/relation.ts.
func addressedNode(root Val, graph Graph, addr string) Val {
	name := entityOfAddr(addr)
	segs := []string{}
	found := false
	for _, e := range graph.Entities {
		if e.ID == name {
			found = true
			if "$" != e.Paths[0] {
				segs = strings.Split(e.Paths[0][2:], ".")
			}
			break
		}
	}
	if !found { //coverage:ignore an edge exists only because refer() RESOLVED its full address, so the walk cannot miss: an address that does not walk is refer_unresolved at unification and the document never reaches the graph (probed for a missing key, a scalar mid-path, and an out-of-range index, in both ports)
		return nil
	}
	if i := strings.IndexByte(addr, '.'); 0 <= i {
		segs = append(segs, strings.Split(addr[i+1:], ".")...)
	}
	// A LIST INDEX IS A SEGMENT TOO. TypeScript walks `node.peg[seg]`,
	// which reaches a list element as readily as a map key, and a Go
	// walk that only knew maps SILENTLY SKIPPED the check for any link
	// into a list (`refer(), "b.items.0"`) -- passing a far end it had
	// not looked at, which is the fail-open shape this review exists to
	// retire.
	node := root
	for _, seg := range segs {
		switch n := node.(type) {
		case *MapVal:
			next, ok := n.peg[seg]
			if !ok || nil == next { //coverage:ignore same: the address resolved
				return nil
			}
			node = next
		case *ListVal:
			i, err := strconv.Atoi(seg)
			if nil != err || i < 0 || len(n.peg) <= i { //coverage:ignore same: the address resolved
				return nil
			}
			node = n.peg[i]
		default: //coverage:ignore same: the address resolved, so no segment lands on a scalar
			return nil
		}
	}
	return node
}

// meetsTarget answers whether the far end satisfies the declared
// target, as the code of the refusal or "" for a pass. A TEST, never a
// flow: the check reports on a finished model and writing into it would
// be generation, which `relations` does not do (the same rule that
// keeps it from writing an author's inverse for them). Both sides are
// CLONED into a throwaway context and the meet is taken there.
//
// `refer(t)` is the other half of this and does flow, at the site. The
// two agree on what "satisfies" means -- a meet that is not a nil --
// which is what lets a relation declare once what every site would
// otherwise repeat. Mirrors `meets` in ts/src/relation.ts.
// `root` is the DOCUMENT, not the node: a target lifted out of the
// model (`target: $.std.Service`) can still hold a reference that
// resolves against the document, and a probe rooted at the far end
// answers `no_path` for it.
func meetsTarget(root, node, target Val) string {
	ctx := &Ctx{root: root, collect: true}
	out := unite(ctx,
		clonePath(node, cp(node.vpath())),
		clonePath(target, cp(target.vpath())))
	if nil != out && out.Nil() {
		if n, ok := out.(*NilVal); ok {
			return n.why
		}
	}
	if 0 < len(ctx.err) {
		return ctx.err[0].why
	}

	// A MEET THAT LEAVES A HOLE IS NOT SATISFACTION. `target:
	// {kind: service, port: integer}` against a far end with no `port`
	// does not CONFLICT -- the meet simply carries `integer` into a key
	// that had none -- and a check that stopped at "no conflict" would
	// pass a far end missing half of what the relation demands.
	//
	// What `refer(t)` does at the site is the yardstick: it flows `t`
	// in, and the document then fails to generate, because `integer` is
	// not a value. So the same question is asked here, and the answer
	// is compared with the far end ALONE, so a node already incomplete
	// for its own reasons is not blamed on the relation pointing at it.
	// The REASON reported is the engine's own code, not a name invented
	// here. Mirrors `meets` in ts/src/relation.ts.
	if "" == genProbe(root, clonePath(node, cp(node.vpath()))) {
		return genProbe(root, out)
	}
	return ""
}

// genProbe is the code of the first generation failure of v, or "".
func genProbe(root, v Val) string {
	// COLLECT MODE, so the failure arrives on the context rather than as
	// an error -- which is the whole point of the mode (residueErr), and
	// why the returned error is discarded here rather than examined.
	gctx := &Ctx{root: root, collect: true}
	_, _ = v.Gen(gctx)
	if 0 < len(gctx.err) {
		return gctx.err[0].why
	}
	return ""
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
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	declared := declaredRelations(root)
	if 0 == len(declared) {
		return RelationReport{Verdict: "pass", Findings: []RelationFinding{}}
	}

	graph := GraphOf(root)
	edges := graph.Edges
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

		// TARGET: the far end IS what the relation says it is (the
		// review's finding J). The declaration used to be inert --
		// `target` was read by nothing, on the reasoning that `refer(t)`
		// already flows the type in at the site. It does, and that is
		// exactly why the declaration was worth nothing: the site has to
		// REPEAT it, and the idiom that avoids repeating it
		// (`refer($.std.Service)`) tripped the fixpoint until §19 was
		// fixed, so every real model wrote bare `refer()` and a
		// typed-endpoint declaration checked nothing.
		//
		// Reported per EDGE, not per entity: an entity reached by two
		// relations must satisfy both, and the report points at the link
		// that made the demand.
		if nil != rel.target {
			for _, e := range mine {
				// An address that names nothing is `refer`'s own finding,
				// and it has already been made: an unresolved link is a
				// nil in the tree, so this document would not have
				// reached the graph.
				node := addressedNode(root, graph, e.To)
				if nil == node { //coverage:ignore addressedNode cannot miss; see its own markers
					continue
				}
				if why := meetsTarget(root, node, rel.target); "" != why {
					findings = append(findings, RelationFinding{
						Code:     "relation_target_unmet",
						Relation: rel.name,
						At:       e.At,
						Detail:   []string{e.From, e.To, why},
					})
				}
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
