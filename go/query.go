/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE QUERY SURFACE (G7 phase 2, the Go side of ts/src/query.ts):
// select one node of an evaluated document by path and render it — the
// slice an agent asks for, instead of the whole file as one JSON blob.
//
// Evaluation is still GLOBAL: the whole document is evaluated and then
// one node is selected. What Get buys is the SIZE OF THE ANSWER, not
// the cost of producing it.
//
// The projections are lattice ABSTRACTIONS: each view is a valid Aontu
// document that SUBSUMES the truth it summarises (under the `values`
// profile — a shape view erases defaults deliberately), which
// test/spec/query.tsv asserts row by row in both runners.

package aontu

import (
	"bytes"
	"encoding/json"
	"math"
	"sort"
	"strings"
)

const (
	QueryJSON  = "json"
	QueryCanon = "canon"
	QueryTypes = "types"
	QueryKeys  = "keys"
)

// QueryOptions are Get's knobs. Depth counts levels of structure kept
// below the selected node; everything deeper renders as `top`. Zero
// means "no limit" (the TypeScript side spells that undefined).
type QueryOptions struct {
	View  string
	Depth int
}

// QueryReport is the whole answer: the rendered slice, or G2-shaped
// findings. Get invents no error format (G7's own rule).
type QueryReport struct {
	Findings []VetFinding `json:"findings"`
	OK       bool         `json:"ok"`
	Out      string       `json:"out"`
}

const queryTop = "top"

// queryNearestKey is the "did you mean" half of the no_path contract:
// the closest sibling name by plain edit distance, or "" when nothing
// is close enough to be worth suggesting.
func queryNearestKey(want string, have []string) string {
	best := ""
	bestd := math.MaxInt32
	for _, k := range have {
		if d := queryEditDistance(want, k); d < bestd {
			bestd = d
			best = k
		}
	}
	// Half the name may differ, no more: past that the suggestion is
	// noise, and a wrong suggestion costs more than none.
	limit := len([]rune(want)) / 2
	if limit < 1 {
		limit = 1
	}
	if bestd <= limit {
		return best
	}
	return ""
}

func queryEditDistance(a, b string) int {
	ar, br := []rune(a), []rune(b)
	prev := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		diag := prev[0]
		prev[0] = i
		for j := 1; j <= len(br); j++ {
			tmp := prev[j]
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			prev[j] = queryMin3(prev[j]+1, prev[j-1]+1, diag+cost)
			diag = tmp
		}
	}
	return prev[len(br)]
}

func queryMin3(a, b, c int) int {
	if b < a {
		a = b
	}
	if c < a {
		a = c
	}
	return a
}

// queryPathParts is the split anchorAt walks: `$` and empty segments
// dropped, so `$`, `$.` and “ all name the root.
func queryPathParts(path string) []string {
	out := []string{}
	for _, p := range strings.Split(strings.TrimPrefix(path, "$"), ".") {
		if "" != p {
			out = append(out, p)
		}
	}
	return out
}

// queryProject renders the canon-shaped views. One walk, two knobs:
// `types` generalises each concrete leaf through the lattice, `depth`
// elides below its level.
func queryProject(v Val, view string, depth int) string {
	if depth <= 0 {
		return queryTop
	}
	switch b := v.(type) {
	case *MapVal:
		var out strings.Builder
		out.WriteByte('{')
		if b.spread != nil {
			out.WriteString("&:")
			out.WriteString(queryProject(b.spread, view, depth-1))
			if len(b.keys) > 0 {
				out.WriteByte(',')
			}
		}
		keys := append([]string(nil), b.keys...)
		sort.Strings(keys)
		for i, k := range keys {
			if i > 0 {
				out.WriteByte(',')
			}
			out.WriteString(jsonString(k))
			if b.isOptional(k) {
				out.WriteByte('?')
			}
			out.WriteByte(':')
			out.WriteString(queryProject(b.peg[k], view, depth-1))
		}
		out.WriteByte('}')
		return out.String()
	case *ListVal:
		var out strings.Builder
		out.WriteByte('[')
		if b.spread != nil {
			out.WriteString("&:")
			out.WriteString(queryProject(b.spread, view, depth-1))
			if len(b.peg) > 0 {
				out.WriteByte(',')
			}
		}
		for i, e := range b.peg {
			if i > 0 {
				out.WriteByte(',')
			}
			out.WriteString(queryProject(e, view, depth-1))
		}
		out.WriteByte(']')
		return out.String()

	// Junctions and prefs are TRANSPARENT: not a structural tier (so
	// they do not spend a level of depth) but not a leaf either (so
	// `*8080|integer` generalises to `*integer|integer` rather than
	// collapsing to `top` and throwing the alternatives away).
	case *PrefVal:
		return "*" + queryProject(b.peg, view, depth)
	case *ConjunctVal:
		return queryJunction(b.peg, "&", view, depth)
	case *DisjunctVal:
		return queryJunction(b.peg, "|", view, depth)

	// A LEAF. Under `types` a CONCRETE scalar lifts to its own kind --
	// superior() is the lattice's answer, so the view subsumes the truth
	// by construction. Everything else is already an abstraction (a kind
	// marker, a constraint, an unresolved reference) and is left alone:
	// lifting `integer` to `number` would generalise a shape view that
	// was already a shape.
	case *ScalarVal:
		if QueryTypes == view {
			return b.superior().Canon()
		}
		return b.Canon()
	}
	return v.Canon()
}

func queryJunction(members []Val, sym, view string, depth int) string {
	parts := make([]string, len(members))
	for i, m := range members {
		wrap := false
		switch t := m.(type) {
		case *ConjunctVal:
			wrap = len(t.peg) > 1
		case *DisjunctVal:
			wrap = len(t.peg) > 1
		}
		if wrap {
			parts[i] = "(" + queryProject(m, view, depth) + ")"
		} else {
			parts[i] = queryProject(m, view, depth)
		}
	}
	return strings.Join(parts, sym)
}

// queryKeyList is the `keys` listing: the node's own key names (or list
// indices), one per line, code-point ordered as canon orders them. A
// leaf has none, which is an empty answer rather than an error --
// "nothing below here" is a true statement about a scalar.
func queryKeyList(v Val) string {
	switch b := v.(type) {
	case *MapVal:
		keys := append([]string(nil), b.keys...)
		sort.Strings(keys)
		return strings.Join(keys, "\n")
	case *ListVal:
		out := make([]string, len(b.peg))
		for i := range b.peg {
			out[i] = itoa(i)
		}
		return strings.Join(out, "\n")
	}
	return ""
}

func queryFinding(code, path, message, note string) VetFinding {
	f := VetFinding{
		Code:     code,
		Class:    "reference",
		Severity: "error",
		Path:     path,
		Message:  message,
		Sites:    []VetSite{},
	}
	if "" != note {
		f.Note = &note
	}
	return f
}

// queryGenJSON serialises a generated value the way the CLI's own
// renderer does: an Encoder with HTML escaping OFF (not MarshalIndent,
// which rewrites <, > and & as \u00xx escapes the canonical TypeScript
// emitter does not), indented by two spaces.
func queryGenJSON(v any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil { //coverage:ignore a generated value is always encodable
		return "", err
	}
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

// Get evaluates the document, selects the node at path, and renders it.
// Mirrors get in ts/src/query.ts.
func (a *Aontu) Get(src, path string, opts *QueryOptions) QueryReport {
	options := QueryOptions{}
	if nil != opts {
		options = *opts
	}
	view := options.View
	if "" == view {
		view = QueryJSON
	}

	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return queryFailed(perr, "$")
	}
	root, ctx, uerr := a.unifyCtx(parsed, nil, src)
	if nil != uerr || nil == root || root.Nil() {
		return queryFailed(uerr, "$")
	}

	node := anchorAt(root, path)
	if nil == node {
		return QueryReport{
			OK:       false,
			Out:      "",
			Findings: []VetFinding{noPathFinding(root, path)},
		}
	}

	if QueryJSON == view {
		gen, gerr := node.Gen(ctx)
		if nil != gerr {
			return queryFailed(gerr, queryPathText(path))
		}
		text, jerr := queryGenJSON(gen)
		if nil != jerr { //coverage:ignore a generated value is always encodable
			return queryFailed(jerr, queryPathText(path))
		}
		return QueryReport{OK: true, Out: text, Findings: []VetFinding{}}
	}
	if QueryKeys == view {
		return QueryReport{OK: true, Out: queryKeyList(node), Findings: []VetFinding{}}
	}

	depth := options.Depth
	if depth <= 0 {
		depth = math.MaxInt32
	}
	return QueryReport{
		OK:       true,
		Out:      queryProject(node, view, depth),
		Findings: []VetFinding{},
	}
}

func queryNote(near string) string {
	if "" == near {
		return ""
	}
	return "did you mean " + near + "?"
}

// noPathFinding is the refusal for a path that names nothing, shared
// by Get and Why: WHICH segment failed, and what was there instead --
// the "did you mean" the no_path contract promises. Walking again is
// cheap (the tree is in hand) and is the only way to name the parent.
func noPathFinding(root Val, path string) VetFinding {
	parts := queryPathParts(path)
	at := root
	want := ""
	for _, part := range parts {
		next := anchorAt(at, part)
		if nil == next {
			want = part
			break
		}
		at = next
	}
	have := []string{}
	switch b := at.(type) {
	case *MapVal:
		have = append(have, b.keys...)
		sort.Strings(have)
	case *ListVal:
		for j := range b.peg {
			have = append(have, itoa(j))
		}
	}
	return queryFinding(
		"no_path",
		queryPathText(path),
		"The path "+path+" names nothing in this document.",
		queryNote(queryNearestKey(want, have)))
}

// queryPathText is the queried path, normalised the way anchorAt reads
// it -- so a finding names `$.a.b` whether the caller wrote that, `a.b`
// or `$.a.b.` -- and `$` for the root.
func queryPathText(path string) string {
	return subPathText(queryPathParts(path))
}

// queryFailed folds an evaluation failure into the report. A document
// that does not stand up has no node to select, and the engine's own
// diagnosis IS the report: Get adds nothing to it.
func queryFailed(err error, path string) QueryReport {
	code := "unify_failed"
	msg := "The document does not evaluate."
	if ae, ok := err.(*AontuError); ok && nil != ae {
		if "" != ae.Code {
			code = ae.Code
		}
		msg = ae.Msg
	}
	return QueryReport{
		OK:       false,
		Out:      "",
		Findings: []VetFinding{queryFinding(code, path, msg, "")},
	}
}

// EvalFailure is the ONE FINDING a document that does not stand up
// answers with: the engine's own diagnosis, in the finding shape every
// verb renders. Exported for the verbs outside this package that
// evaluate before they can do anything at all -- cmd/aontu's `hash`,
// which said only THAT the document does not evaluate and never why,
// while the canonical port printed the diagnosis (the review's finding
// F). Twin: evalFailure in ts/src/query.ts.
func EvalFailure(err error) VetFinding {
	return queryFailed(err, "$").Findings[0]
}

// WhyReport is the whole answer: the record, or G2-shaped findings.
type WhyReport struct {
	Findings []VetFinding `json:"findings"`
	OK       bool         `json:"ok"`
	Record   *WhyRecord   `json:"record,omitempty"`
}

// Why answers WHY the value at this path holds: evaluate with the
// provenance recorder on, select the node, and answer the ordered
// contributions that met there — the positive twin of G2's error
// report. Mirrors why in ts/src/query.ts.
func (a *Aontu) Why(src, path string) WhyReport {
	// Parse and unify SEPARATELY, so the parsed tree can be stamped
	// before the fixpoint runs: a contribution is a value the author
	// wrote, and after unification there is no longer any way to tell
	// one from a value the engine minted on the way.
	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return whyFailed(perr)
	}
	// Stamp the entry document with its own file name, as vet stamps
	// the schema and data documents (stampURL): a contribution's site
	// names the file it was written in, and the TypeScript side gets
	// the same from the parse `path` option.
	if "" != a.File {
		stampURL(parsed, a.File)
	}

	// The entry's own text under its own name, plus every file the parse
	// read: a contribution's offset is counted in the file it was
	// written in (Provenance.texts).
	texts := map[string]string{}
	for k, v := range a.IncludeText {
		texts[k] = v
	}
	if "" != a.File {
		texts[a.File] = src
	}
	prov := newProvenance(src, texts)
	prov.writtenFrom(parsed)

	ctx := &Ctx{root: parsed, src: src, file: a.File, prov: prov}
	if nil != a.Trust {
		ctx.budgetPasses = a.Trust.Budget.Passes
		ctx.budgetDepth = a.Trust.Budget.Depth
	}
	root := unifyRoot(parsed, ctx)
	ctx.root = root
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		var uerr error
		if 0 < len(ctx.err) {
			uerr = &AontuError{Msg: ctx.errmsg(), Code: ctx.err[0].why}
		}
		return whyFailed(uerr)
	}

	node := anchorAt(root, path)
	if nil == node {
		return WhyReport{
			OK:       false,
			Findings: []VetFinding{noPathFinding(root, path)},
		}
	}

	// The value that stands here is a contribution when nothing met
	// (see Provenance.stands): a generator places a value without a
	// meet, and "nothing met at this path" is not an answer to "where
	// did this come from".
	parts := queryPathParts(path)
	prov.stands(parts, node)

	return WhyReport{
		OK: true,
		Record: &WhyRecord{
			Conjuncts: prov.at(parts),
			Path:      queryPathText(path),
			Value:     node.Canon(),
		},
		Findings: []VetFinding{},
	}
}

func whyFailed(err error) WhyReport {
	r := queryFailed(err, "$")
	return WhyReport{OK: false, Findings: r.Findings}
}
