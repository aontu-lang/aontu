/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
	"strings"
)

// RELATION GRAPH VERDICTS (RELATIONS.0.md §3.3, replacing the G4
// phase 5 magic-key pass; the Go side of ts/src/relation.ts):
// acyclicity and inverse consistency over the edge set, DECLARED by
// the graph atoms -- `acyclic()` and `inverse(name)` conjoined at the
// field whose key is the predicate -- and decided AFTER unification,
// never by it.
//
// Why not in the lattice. Both properties are GLOBAL and NON-MONOTONE:
// an acyclic graph becomes cyclic when one more edge unifies in, and an
// inverse that is present becomes absent when the far side is narrowed.
// The lattice guarantee is that more information never falsifies what
// has been observed, so a constraint that could be true and then false
// is not a constraint the lattice may hold. The atoms therefore only
// REGISTER during unification (GraphAtomVal.register, onto
// Ctx.reldecls), and the verdict lands at GENERATION -- the sizing
// atoms' model -- where no more information can arrive. The
// `relations` verb reports the same verdict from the same
// declarations: one decision, two surfaces. The old `relations:`
// magic key is GONE, discharging ADR-010's grandfather clause.

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
func entityOfAddr(addr string) string {
	if i := strings.IndexByte(addr, '.'); 0 <= i {
		return addr[:i]
	}
	return addr
}

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
// relationFindings is the verdict itself, pure over what the
// evaluation produced: the registered declarations and the edge set.
// Shared by the generation hook (relationErrors) and the `relations`
// verb, so the two surfaces cannot disagree. Mirrors relationFindings
// in ts/src/relation.ts.
func relationFindings(decls map[string]*relDecl, graph Graph) []RelationFinding {
	findings := []RelationFinding{}

	// The edge set, indexed the two ways the checks read it.
	byRelation := map[string][]Edge{}
	pairs := map[string]bool{}
	for _, e := range graph.Edges {
		if "" == e.From {
			// An edge outside every entity has no source to be a
			// relation OF.
			continue
		}
		byRelation[e.Key] = append(byRelation[e.Key], e)
		pairs[e.Key+" "+e.From+" "+entityOfAddr(e.To)] = true
	}

	// Predicates in sorted order, so the findings arrive the same way
	// in both ports (the registry is a Go map, randomly ordered).
	names := make([]string, 0, len(decls))
	for name := range decls {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		decl := decls[name]
		mine := byRelation[name]

		if decl.acyclic {
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

			// The roots are visited in sorted order, and a node
			// already settled is not revisited, so one cycle is
			// reported once and the SAME one in both ports.
			done := map[string]bool{}
			for _, from := range roots {
				cycle := findCycle(from, succ, done)
				if nil != cycle {
					// The cycle's first node is a key of succ, and
					// every key of succ came from an edge's From, so
					// the edge is there.
					at := ""
					for _, e := range mine {
						if e.From == cycle[0] {
							at = e.At
							break
						}
					}
					findings = append(findings, RelationFinding{
						Code:     "relation_cycle",
						Relation: name,
						At:       at,
						Detail:   cycle,
					})
					break
				}
			}
		}

		inverses := make([]string, 0, len(decl.inverses))
		for inv := range decl.inverses {
			inverses = append(inverses, inv)
		}
		sort.Strings(inverses)
		for _, inv := range inverses {
			for _, e := range mine {
				to := entityOfAddr(e.To)
				if !pairs[inv+" "+to+" "+e.From] {
					findings = append(findings, RelationFinding{
						Code:     "relation_inverse_missing",
						Relation: name,
						At:       e.At,
						Detail:   []string{e.From, to, inv},
					})
				}
			}
		}
	}

	// SORTED, because a report is read by a machine that diffs it: by
	// the position of the offending edge, then by code, then by the
	// detail (two inverse declarations on one predicate can flag one
	// edge twice).
	sort.SliceStable(findings, func(i, j int) bool {
		a, b := findings[i], findings[j]
		if a.At != b.At {
			return a.At < b.At
		}
		if a.Code != b.Code {
			return a.Code < b.Code
		}
		return strings.Join(a.Detail, " ") < strings.Join(b.Detail, " ")
	})

	return findings
}

// relationErrors is the generation hook (Aontu.GenerateVars, between
// unification success and value generation): the first finding becomes
// a LOCATED evaluation error at the offending edge, exactly as an
// unmet sizing atom refuses at generation. Findings name entities and
// positions the document spelled, so the walk to the site cannot miss.
// Mirrors relationErrors in ts/src/relation.ts (which files every
// finding; the Go generation path returns its first error, as the bag
// walks do).
func relationErrors(ctx *Ctx, root Val) error {
	if nil == ctx || 0 == len(ctx.reldecls) {
		return nil
	}
	findings := relationFindings(ctx.reldecls, GraphOf(root))
	if 0 == len(findings) {
		return nil
	}
	// EVERY finding becomes a collected error, exactly as the TS hook
	// adderr's each one (two inverse declarations on one predicate
	// refuse twice, and the report says both names); makeNilErrFull
	// records on ctx, and errmsg renders them all, `------`-joined,
	// as any multi-error document renders.
	for _, f := range findings {
		node := root
		if 2 < len(f.At) {
			for _, seg := range strings.Split(f.At[2:], ".") {
				// Graph atoms hold the field's value -- possibly nested,
				// one atom carrying another -- and the path steps through
				// them exactly as the graph walk does.
				for {
					ga, ok := node.(*GraphAtomVal)
					if !ok {
						break
					}
					node = ga.held
				}
				switch n := node.(type) {
				case *MapVal:
					node = n.peg[seg]
				case *ListVal:
					ix, _ := strconv.Atoi(seg)
					node = n.peg[ix]
				}
			}
			// No unwrap AFTER the walk: a finding's At names an edge
			// element, and an edge's element is a string -- an
			// atom-wrapped element mints no edge in the first place
			// (the graph visit descends atoms only at field values),
			// so the walk cannot end on an atom.
		}
		makeNilErrFull(ctx, f.Code, node, nil, "relate", map[string]string{
			"relation": f.Relation,
			"detail":   strings.Join(f.Detail, " -> "),
		})
	}
	return &AontuError{Msg: ctx.errmsg(), Code: findings[0].Code}
}

// RelationCheck runs the relation checks over one document: evaluate,
// then report the same verdict generation enforces.
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

	if 0 == len(ctx.reldecls) {
		return RelationReport{Verdict: "pass", Findings: []RelationFinding{}}
	}

	findings := relationFindings(ctx.reldecls, GraphOf(root))
	verdict := "pass"
	if 0 < len(findings) {
		verdict = "fail"
	}
	return RelationReport{Verdict: verdict, Findings: findings}
}
