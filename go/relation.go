/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strconv"
	"strings"
)


type RelationFinding struct {
	// At is where the offending edge is written, as a `$.dotted.path`.
	At   string `json:"at"`
	Code string `json:"code"`
	Detail []string `json:"detail"`
	// Relation the finding is about.
	Relation string `json:"relation"`
}

// RelationReport is the relation checks for one document.
type RelationReport struct {
	Declared *int `json:"declared,omitempty"`
	Errors   []VetFinding      `json:"errors,omitempty"`
	Findings []RelationFinding `json:"findings"`
	Verdict  string            `json:"verdict"`
}

// RelationOptions are the run's knobs. A nil value is the default run.
type RelationOptions struct {
	// Count fills RelationReport.Declared, so a caller can tell a graph
	// that CHECKED CLEAN from one there was nothing to check. Mirrors
	// the canonical port's RelationOptions.count.
	Count bool
}

// declaredRelation is one declared relation, as the document spells it.
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

func relationFindings(decls map[string]*relDecl, graph Graph) []RelationFinding {
	findings := []RelationFinding{}

	byRelation := map[string][]Edge{}
	pairs := map[string]bool{}
	for _, e := range graph.Edges {
		byRelation[e.Key] = append(byRelation[e.Key], e)
		pairs[e.Key+" "+e.From+" "+e.To] = true
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
				succ[e.From] = append(succ[e.From], e.To)
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
				to := e.To
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

func relationErrors(ctx *Ctx, root Val) error {
	if nil == ctx || 0 == len(ctx.reldecls) {
		return nil
	}
	findings := relationFindings(ctx.reldecls, GraphOf(root))
	if 0 == len(findings) {
		return nil
	}
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
	return a.RelationCheckOpts(src, nil)
}

func (a *Aontu) RelationCheckOpts(
	src string, opts *RelationOptions) RelationReport {
	options := RelationOptions{}
	if nil != opts {
		options = *opts
	}
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

	var declared *int
	if options.Count {
		n := len(ctx.reldecls)
		declared = &n
	}
	if 0 == len(ctx.reldecls) {
		return RelationReport{Verdict: "pass", Declared: declared,
			Findings: []RelationFinding{}}
	}

	ctx.trialsOf()
	gcopy := *ctx
	gctx := &gcopy
	gctx.err = nil
	gctx.collect = true
	root.Gen(gctx)
	if 0 < len(gctx.err) {
		return RelationReport{Verdict: "error", Findings: []RelationFinding{},
			Errors: []VetFinding{failureFinding(gctx, a.File, src, root)}}
	}

	findings := relationFindings(ctx.reldecls, GraphOf(root))
	verdict := "pass"
	if 0 < len(findings) {
		verdict = "fail"
	}
	return RelationReport{Verdict: verdict, Declared: declared,
		Findings: findings}
}
