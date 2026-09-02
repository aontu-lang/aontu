/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE VIEWS -- the Go twin of ts/src/view.ts. See that file for what
// each kind draws, why a report and never the Val tree is the only
// input, and the loss report; what the two ports must agree on -- the
// rendered text, the loss report and the refusals -- is
// test/spec/view.tsv.

import (
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ViewVerdict is rendered | lossy | error.
type ViewVerdict = string

// ViewLoss is one row of the loss report.
type ViewLoss struct {
	Code   string   `json:"code"`
	Count  int      `json:"count"`
	Detail []string `json:"detail,omitempty"`
}

// ViewDoc is a further document of a poset, beside the entry.
type ViewDoc struct {
	Src string
	// Path is where it came from, so a relative include inside it
	// resolves and so its label (the file name without `.aon`) is
	// known.
	Path string
	// Name is the label to draw, overriding the one derived from Path.
	Name string
}

// ViewReport is the answer for one figure, mirroring ViewReport in
// ts/src/view.ts field for field.
type ViewReport struct {
	Verdict ViewVerdict `json:"verdict"`
	Kind    string      `json:"kind"`

	// Text is the figure. Present ONLY on `rendered` and `lossy` --
	// and present EMPTY for a document with nothing to draw, because an
	// empty drawing of a model with nothing in it is the honest one.
	Text *string `json:"text,omitempty"`

	// Loss is the loss report, in code order. Empty on `error`.
	Loss []ViewLoss `json:"loss"`

	// Errors is WHY the figure could not be drawn, in vet's finding
	// shape. Present ONLY on `error`.
	Errors []VetFinding `json:"errors,omitempty"`
}

// ViewOptions mirrors ViewOptions in ts/src/view.ts. Zero values mean
// absent; a zero MaxRows means the default (sixty) and a zero MaxCols
// means no limit, in both ports.
type ViewOptions struct {
	Kind    string
	As      string
	At      string
	MaxRows int

	Relation string
	Roots    []string

	Order   string
	Closure bool

	Relations []string
	GroupBy   string
	Label     string
	Layers    []string
	// Edges is which of the relation's edges the layer figure draws:
	// "upward" (the violations), "all" or "none". Empty means the
	// profile's own default -- "all" for mermaid, which lays edges out
	// itself, "upward" for the fixed grids.
	Edges string

	Sets      string
	Member    string
	Universe  string
	MinDegree int
	MaxCols   int

	MinSize int

	Profile string
	Docs    []ViewDoc

	// Out is the file the figure belongs in. THE LIBRARY NEVER WRITES:
	// this is carried through to the caller, which does -- and, for a
	// view document, only once every figure of the set rendered.
	Out string

	// Views is the VIEW DOCUMENT's declarations (VIEWS.0.md, "6. The
	// view document"): the path of a map whose values declare figures.
	// ViewSet reads it; View ignores it, because one call draws one
	// figure.
	Views string
}

// viewKinds lists each kind's profiles, the first being its default.
var viewKinds = []string{"tree", "matrix", "graph", "layer", "sets", "layers", "ladder", "poset"}

var viewProfiles = map[string][]string{
	"tree":   {"text", "svg"},
	"matrix": {"text", "svg"},
	"graph":  {"mermaid", "dot", "er"},
	"layer":  {"text", "mermaid", "svg"},
	"sets":   {"text", "svg"},
	"layers": {"text", "svg"},
	"ladder": {"mermaid", "dot"},
	"poset":  {"mermaid", "dot"},
}

// Loss codes that describe the drawing rather than a gap in it.
var viewInformational = map[string]bool{
	"edges_deduped": true, "inverse_suppressed": true, "crossings": true,
}

const viewDefaultMaxRows = 60

// The separator inside a composite map key: a character no path holds.
const viewSep = "\x00"

// ---------------------------------------------------------------------
// Findings

func viewFinding(code, class, path, message, note string) VetFinding {
	f := VetFinding{
		Code:     code,
		Class:    class,
		Severity: "error",
		Path:     path,
		Message:  message,
		Sites:    []VetSite{},
	}
	if "" != note {
		f.Note = strPtr(note)
	}
	return f
}

func viewRelationFinding(relation string, have []string) VetFinding {
	return viewFinding("view_relation_unknown", "reference", "$",
		relation+" names no relation with edges in this document.",
		"relations with edges: "+strings.Join(have, ", "))
}

func viewRootFinding(root, relation string, nodes []string) VetFinding {
	rel := ""
	if "" != relation {
		rel = relation + " "
	}
	note := ""
	if 0 < len(nodes) {
		note = "nodes in the graph: " + strings.Join(nodes, ", ")
	}
	return viewFinding("refer_unresolved", "reference", "$",
		root+" is not a node of the "+rel+"graph.", note)
}

func viewRowsFinding(rows, max int, narrow string) VetFinding {
	return viewFinding("view_rows_exceeded", "budget", "$",
		"The figure has "+strconv.Itoa(rows)+" rows, above --max-rows "+
			strconv.Itoa(max)+"; narrow it with "+narrow+", or raise the limit.",
		"rows: "+strconv.Itoa(rows)+", max: "+strconv.Itoa(max))
}

func viewLineBreakFinding(path string) VetFinding {
	return viewFinding("view_line_break", "parse", path,
		"A label holds a line terminator, which no figure line can carry.", "")
}

// ---------------------------------------------------------------------
// The edge set as the figures read it

// viewTriple is one distinct fact of the graph: a `(from, key, to)`
// triple, however many positions wrote it.
type viewTriple struct {
	from, key, to string
}

// viewUnder is a prefix test on PATHS, not strings.
func viewUnder(path, at string) bool {
	return "" == at || path == at || strings.HasPrefix(path, at+".")
}

// viewTriples is the deduplicated edge set, with the hidden
// contributions and the out-of-scope edges removed and the loss report
// told. See triplesOf in ts/src/view.ts.
func viewTriples(edges []Edge, at string, loss *[]ViewLoss) []viewTriple {
	hidden := []string{}
	seen := map[string]viewTriple{}
	positions := 0
	for _, e := range edges {
		if e.Hidden {
			hidden = append(hidden, e.At)
			continue
		}
		if !viewUnder(e.From, at) || !viewUnder(e.To, at) {
			continue
		}
		positions++
		seen[e.From+viewSep+e.Key+viewSep+e.To] = viewTriple{e.From, e.Key, e.To}
	}
	if 0 < len(hidden) {
		sort.Strings(hidden)
		*loss = append(*loss, ViewLoss{Code: "hidden_contribution", Count: len(hidden), Detail: hidden})
	}
	out := []viewTriple{}
	for _, t := range seen {
		out = append(out, t)
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.from != b.from {
			return a.from < b.from
		}
		if a.key != b.key {
			return a.key < b.key
		}
		return a.to < b.to
	})
	if len(out) < positions {
		*loss = append(*loss, ViewLoss{
			Code: "edges_deduped", Count: positions - len(out),
			Detail: []string{strconv.Itoa(positions) + " written positions -> " +
				strconv.Itoa(len(out)) + " distinct triples"},
		})
	}
	return out
}

// viewKeys is the relations with edges, in code-point order.
func viewKeys(triples []viewTriple) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, e := range triples {
		if !seen[e.key] {
			seen[e.key] = true
			out = append(out, e.key)
		}
	}
	sort.Strings(out)
	return out
}

// viewNodes is the node set the drawn edges CONNECT, in code-point
// order.
func viewNodes(from, to []string) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(n string) {
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	for i := range from {
		add(from[i])
		add(to[i])
	}
	sort.Strings(out)
	return out
}

func viewTripleNodes(triples []viewTriple) []string {
	from, to := []string{}, []string{}
	for _, e := range triples {
		from = append(from, e.from)
		to = append(to, e.to)
	}
	return viewNodes(from, to)
}

// shortLabels is THE SHORTEST SUFFIX THAT IS STILL UNIQUE, as a node's
// visible label. See labelsOf in ts/src/view.ts.
func shortLabels(nodes []string) map[string]string {
	segs := map[string][]string{}
	for _, n := range nodes {
		segs[n] = strings.Split(strings.TrimPrefix(strings.TrimPrefix(n, "$"), "."), ".")
	}
	out := map[string]string{}
	for _, n := range nodes {
		parts := segs[n]
		for take := 1; ; take++ {
			cand := suffixFrom(parts, take)
			clash := false
			for _, m := range nodes {
				if m != n && suffixFrom(segs[m], take) == cand {
					clash = true
					break
				}
			}
			if !clash {
				out[n] = cand
				break
			}
		}
	}
	return out
}

func suffixFrom(parts []string, take int) string {
	start := len(parts) - take
	if 0 > start {
		start = 0
	}
	return strings.Join(parts[start:], ".")
}

// viewReach is reachability over a directed edge set: node -> the set
// of nodes it reaches in one or more steps.
func viewReach(nodes []string, succ map[string][]string) map[string]map[string]bool {
	out := map[string]map[string]bool{}
	for _, n := range nodes {
		seen := map[string]bool{}
		stack := append([]string{}, succ[n]...)
		for 0 < len(stack) {
			m := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if !seen[m] {
				seen[m] = true
				stack = append(stack, succ[m]...)
			}
		}
		out[n] = seen
	}
	return out
}

// ---------------------------------------------------------------------
// Text helpers

func viewLen(s string) int { return utf8.RuneCountInString(s) }

func viewPad(s string, n int) string {
	if viewLen(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-viewLen(s))
}

func viewLpad(s string, n int) string {
	if viewLen(s) >= n {
		return s
	}
	return strings.Repeat(" ", n-viewLen(s)) + s
}

func viewWidest(ss []string) int {
	w := 0
	for _, s := range ss {
		if viewLen(s) > w {
			w = viewLen(s)
		}
	}
	return w
}

// ---------------------------------------------------------------------
// Identifiers and escapes

func viewLetter(c rune) bool { return ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') }
func viewDigit(c rune) bool  { return '0' <= c && c <= '9' }

// viewIdent is the injective identifier encoding: `n_` + the name when
// it is an ASCII identifier, else `nq_` + the name with every other
// code point as `_` and its lower-case hex.
func viewIdent(name string) string {
	cps := []rune(name)
	plain := 0 < len(cps) && viewLetter(cps[0])
	for _, c := range cps {
		if !(viewLetter(c) || viewDigit(c) || '_' == c) {
			plain = false
		}
	}
	if plain {
		return "n_" + name
	}
	out := "nq_"
	for _, c := range cps {
		if viewLetter(c) || viewDigit(c) {
			out += string(c)
		} else {
			out += "_" + viewLpad(strconv.FormatInt(int64(c), 16), 2)
		}
	}
	return out
}

var mermaidEsc = map[rune]string{
	34: "#34;", 35: "#35;", 38: "#38;", 60: "#60;", 62: "#62;",
	123: "#123;", 124: "#124;", 125: "#125;",
}

var dotEsc = map[rune]string{34: "\\\"", 92: "\\\\"}

func viewEscape(text string, table map[rune]string) string {
	var out strings.Builder
	for _, c := range text {
		if rep, ok := table[c]; ok {
			out.WriteString(rep)
		} else {
			out.WriteRune(c)
		}
	}
	return out.String()
}

func viewHasLineBreak(text string) bool {
	return strings.ContainsAny(text, "\n\r\u2028\u2029")
}

// ---------------------------------------------------------------------
// The tree

// drawnEdge is one edge as the tree draws it: a declared inverse pair
// collapsed to one edge, and the label the branch carries.
type drawnEdge struct {
	from, to, label string
}

// collapseEdges is THE EDGE SET WITH DECLARED INVERSE PAIRS COLLAPSED
// to one logical edge, the tree's way. See collapse in ts/src/view.ts.
func collapseEdges(triples []viewTriple, relation string) []drawnEdge {
	pairs := map[string][]viewTriple{}
	order := []string{}
	for _, e := range triples {
		a, b := e.from, e.to
		if b < a {
			a, b = b, a
		}
		pair := a + viewSep + b
		if _, ok := pairs[pair]; !ok {
			order = append(order, pair)
		}
		pairs[pair] = append(pairs[pair], e)
	}

	out := []drawnEdge{}
	for _, pair := range order {
		group := pairs[pair]
		keys := viewKeys(group)
		named := "" != relation && contains(keys, relation)
		winner := keys[0]
		label := strings.Join(keys, "/")
		if named {
			winner = relation
			label = relation
		}
		for _, e := range group {
			if e.key == winner {
				out = append(out, drawnEdge{from: e.from, to: e.to, label: label})
			}
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].from != out[j].from {
			return out[i].from < out[j].from
		}
		return out[i].to < out[j].to
	})
	return out
}

type treeKid struct {
	to, label string
}

type treeFrame struct {
	node, prefix string
	at, row      int
}

// drawTree is THE DEPENDENCY TREE: the drawn edges, walked from each
// root, indented. See drawTree in ts/src/view.ts for the two marks and
// the root rule.
func drawTree(all []drawnEdge, relation string, roots []string, max int, as string) (string, []VetFinding) {
	kept := all
	if "" != relation {
		kept = []drawnEdge{}
		for _, e := range all {
			if e.label == relation {
				kept = append(kept, e)
			}
		}
	}

	if "" != relation && 0 == len(kept) && 0 < len(all) {
		seen := map[string]bool{}
		have := []string{}
		for _, e := range all {
			for _, k := range strings.Split(e.label, "/") {
				if !seen[k] {
					seen[k] = true
					have = append(have, k)
				}
			}
		}
		sort.Strings(have)
		return "", []VetFinding{viewRelationFinding(relation, have)}
	}

	from, to := []string{}, []string{}
	for _, e := range kept {
		from = append(from, e.from)
		to = append(to, e.to)
	}
	nodes := viewNodes(from, to)
	if max < len(nodes) {
		return "", []VetFinding{viewRowsFinding(len(nodes), max, "--at, --relation or --root")}
	}
	labels := shortLabels(nodes)
	label := func(n string) string { return labels[n] }

	kids := map[string][]treeKid{}
	for _, n := range nodes {
		kids[n] = []treeKid{}
	}
	for _, e := range kept {
		kids[e.from] = append(kids[e.from], treeKid{to: e.to, label: e.label})
	}
	for _, list := range kids {
		sort.SliceStable(list, func(i, j int) bool {
			return label(list[i].to) < label(list[j].to)
		})
	}

	labelsSeen := map[string]bool{}
	for _, e := range kept {
		labelsSeen[e.label] = true
	}
	many := 1 < len(labelsSeen)
	byLabel := func(ns []string) {
		sort.SliceStable(ns, func(i, j int) bool { return label(ns[i]) < label(ns[j]) })
	}

	var named []string
	if 0 < len(roots) {
		missing := []string{}
		for _, r := range roots {
			if _, ok := kids[r]; !ok {
				missing = append(missing, r)
			}
		}
		if 0 < len(missing) {
			errs := []VetFinding{}
			for _, r := range missing {
				errs = append(errs, viewRootFinding(r, relation, nodes))
			}
			return "", errs
		}
		seen := map[string]bool{}
		for _, r := range roots {
			if !seen[r] {
				seen[r] = true
				named = append(named, r)
			}
		}
		byLabel(named)
	} else {
		depended := map[string]bool{}
		for _, e := range kept {
			if e.to != e.from {
				depended[e.to] = true
			}
		}
		for _, n := range nodes {
			if !depended[n] {
				named = append(named, n)
			}
		}
		byLabel(named)
	}

	out := []string{}
	rows := []*treeRow{}
	expanded := map[string]bool{}

	draw := func(root string) {
		if 0 < len(out) {
			out = append(out, "")
			rows = append(rows, nil)
		}
		out = append(out, label(root))
		rows = append(rows, &treeRow{depth: 0, text: label(root), mark: "", parent: len(rows)})
		expanded[root] = true

		chain := map[string]bool{root: true}
		stack := []*treeFrame{{node: root, prefix: "", at: 0, row: len(rows) - 1}}
		for 0 < len(stack) {
			frame := stack[len(stack)-1]
			list := kids[frame.node]
			if frame.at >= len(list) {
				delete(chain, frame.node)
				stack = stack[:len(stack)-1]
				continue
			}
			edge := list[frame.at]
			frame.at++
			last := frame.at == len(list)
			loop := chain[edge.to]
			seen := expanded[edge.to]
			grown := 0 < len(kids[edge.to])
			branch := "├── "
			indent := "│   "
			if last {
				branch = "└── "
				indent = "    "
			}
			text := label(edge.to)
			if many {
				text += " (" + edge.label + ")"
			}
			mark := ""
			if loop {
				mark = " (cycle)"
			} else if seen && grown {
				mark = " (*)"
			}
			out = append(out, frame.prefix+branch+text+mark)
			rows = append(rows, &treeRow{depth: len(stack), text: text, mark: mark, parent: frame.row})
			if loop || seen {
				continue
			}
			expanded[edge.to] = true
			chain[edge.to] = true
			stack = append(stack, &treeFrame{node: edge.to, prefix: frame.prefix + indent, at: 0,
				row: len(rows) - 1})
		}
	}

	for _, root := range named {
		draw(root)
	}

	if 0 == len(roots) {
		for _, n := range nodes {
			if !expanded[n] {
				draw(n)
			}
		}
	}

	if "svg" == as {
		return treeSvg(rows, len(nodes)), nil
	}
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The matrix

// viewPartition is THE PARTITION ORDER: leaves first, layer by layer,
// with the least node placed alone where a cycle blocks the walk. See
// partition in ts/src/view.ts.
func viewPartition(nodes []string, succ map[string][]string,
	reach map[string]map[string]bool, label func(string) string,
	loss *[]ViewLoss) []string {
	order := append([]string{}, nodes...)
	sort.SliceStable(order, func(i, j int) bool { return label(order[i]) < label(order[j]) })
	placed := map[string]bool{}
	out := []string{}
	blocks := []string{}
	for len(out) < len(order) {
		ready := []string{}
		for _, n := range order {
			if placed[n] {
				continue
			}
			ok := true
			for _, s := range succ[n] {
				if s != n && !placed[s] {
					ok = false
					break
				}
			}
			if ok {
				ready = append(ready, n)
			}
		}
		if 0 < len(ready) {
			for _, n := range ready {
				placed[n] = true
				out = append(out, n)
			}
			continue
		}
		least := ""
		for _, n := range order {
			if !placed[n] {
				least = n
				break
			}
		}
		scc := []string{}
		for _, n := range order {
			if !placed[n] && (n == least || (reach[least][n] && reach[n][least])) {
				scc = append(scc, label(n))
			}
		}
		blocks = append(blocks, strings.Join(scc, " "))
		placed[least] = true
		out = append(out, least)
	}
	if 0 < len(blocks) {
		*loss = append(*loss, ViewLoss{Code: "cycle_block", Count: len(blocks), Detail: blocks})
	}
	return out
}

// viewPickRelation is the relation a matrix draws: the one named, else
// the only one with edges, else a refusal.
func viewPickRelation(relation string, keys []string) (string, *VetFinding) {
	if "" != relation {
		if contains(keys, relation) || 0 == len(keys) {
			return relation, nil
		}
		f := viewRelationFinding(relation, keys)
		return "", &f
	}
	if 1 < len(keys) {
		f := viewFinding("view_relation_ambiguous", "reference", "$",
			"The document has several relations with edges; name one with --relation.",
			"relations with edges: "+strings.Join(keys, ", "))
		return "", &f
	}
	if 0 == len(keys) {
		return "", nil
	}
	return keys[0], nil
}

func drawMatrix(triples []viewTriple, decls map[string]*relDecl,
	relation, order string, closure bool, as string, max int, loss *[]ViewLoss) (string, []VetFinding) {
	relation, perr := viewPickRelation(relation, viewKeys(triples))
	if nil != perr {
		return "", []VetFinding{*perr}
	}
	rel := []viewTriple{}
	for _, e := range triples {
		if e.key == relation {
			rel = append(rel, e)
		}
	}
	nodes := viewTripleNodes(rel)
	if max < len(nodes) {
		return "", []VetFinding{viewRowsFinding(len(nodes), max, "--at or --relation")}
	}
	labels := shortLabels(nodes)
	label := func(n string) string { return labels[n] }

	succ := map[string][]string{}
	for _, n := range nodes {
		succ[n] = []string{}
	}
	direct := map[string]bool{}
	for _, e := range rel {
		succ[e.from] = append(succ[e.from], e.to)
		direct[e.from+viewSep+e.to] = true
	}
	reach := viewReach(nodes, succ)

	inverses := map[string]bool{}
	if d, ok := decls[relation]; ok {
		inverses = d.inverses
	}
	mirrored := func(from, to string) bool {
		if 0 == len(inverses) {
			return true
		}
		for _, e := range triples {
			if e.from == to && e.to == from && inverses[e.key] {
				return true
			}
		}
		return false
	}

	var seq []string
	if "partition" == order {
		seq = viewPartition(nodes, succ, reach, label, loss)
	} else {
		seq = append([]string{}, nodes...)
		sort.SliceStable(seq, func(i, j int) bool { return label(seq[i]) < label(seq[j]) })
	}

	idx := []string{}
	labelled := []string{}
	for i, n := range seq {
		idx = append(idx, strconv.Itoa(i+1))
		labelled = append(labelled, label(n))
	}
	iw := viewWidest(idx)
	w := viewWidest(labelled)
	lines := []string{}

	for d := 0; d < iw; d++ {
		cells := []string{}
		for _, s := range idx {
			cells = append(cells, string([]rune(viewLpad(s, iw))[d]))
		}
		lines = append(lines, strings.Repeat(" ", w+1+iw+1)+strings.Join(cells, " "))
	}

	above := 0
	grid := [][]string{}
	for ri, r := range seq {
		cells := []string{}
		for ci, c := range seq {
			isDirect := direct[r+viewSep+c]
			if isDirect && ci > ri {
				above++
			}
			cell := "."
			if isDirect {
				if mirrored(r, c) {
					cell = "X"
				} else {
					cell = "!"
				}
			} else if ri == ci {
				cell = "\\"
			} else if closure && reach[r][c] {
				cell = "+"
			}
			cells = append(cells, cell)
		}
		grid = append(grid, cells)
		lines = append(lines, viewPad(label(r), w)+" "+viewLpad(idx[ri], iw)+" "+strings.Join(cells, " "))
	}
	footer := "# above-diagonal direct cells: " + strconv.Itoa(above)
	lines = append(lines, footer)
	if "svg" == as {
		return matrixSvg(labelled, idx, grid, footer,
			"Dependency matrix"+svgOver(relation)+": "+strconv.Itoa(len(seq))+" rows, "+
				strconv.Itoa(above)+" direct cells above the diagonal"), nil
	}
	return strings.Join(lines, "\n"), nil
}

// ---------------------------------------------------------------------
// The node-link graph

type graphNode struct {
	path, label, id string
	group           string
	grouped         bool
}

// viewFieldOf is a node's field, as label text: the value of a scalar
// leaf at `path.field`, taken as its canon for anything but a string.
func viewFieldOf(root Val, path, field string) (string, bool) {
	v := anchorAt(root, path+"."+field)
	sv, ok := v.(*ScalarVal)
	if !ok {
		return "", false
	}
	if s, isStr := sv.peg.(string); isStr {
		return s, true
	}
	return sv.Canon(), true
}

func drawGraph(triples []viewTriple, decls map[string]*relDecl, root Val,
	relations []string, groupBy, labelField, as string, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	keys := viewKeys(triples)
	for _, r := range relations {
		if !contains(keys, r) {
			return "", []VetFinding{viewRelationFinding(r, keys)}
		}
	}
	kept := triples
	if 0 < len(relations) {
		kept = []viewTriple{}
		for _, e := range triples {
			if contains(relations, e.key) {
				kept = append(kept, e)
			}
		}
	}

	declared := func(key, mirror string) bool {
		d, ok := decls[key]
		return ok && d.inverses[mirror]
	}
	edges := []viewTriple{}
	suppressed := 0
	for _, e := range kept {
		mirror := false
		for _, m := range kept {
			if m.from == e.to && m.to == e.from && declared(m.key, e.key) {
				mirror = true
				break
			}
		}
		if mirror {
			suppressed++
		} else {
			edges = append(edges, e)
		}
	}
	if 0 < suppressed {
		*loss = append(*loss, ViewLoss{Code: "inverse_suppressed", Count: suppressed})
	}

	paths := viewTripleNodes(edges)
	if max < len(paths) {
		return "", []VetFinding{viewRowsFinding(len(paths), max, "--at or --relation")}
	}
	labels := shortLabels(paths)

	unresolved := []string{}
	nodes := []*graphNode{}
	byPath := map[string]*graphNode{}
	for _, p := range paths {
		n := &graphNode{path: p, label: labels[p], id: viewIdent(labels[p])}
		if "" != groupBy {
			if g, ok := viewFieldOf(root, p, groupBy); ok {
				n.group, n.grouped = g, true
			} else {
				unresolved = append(unresolved, p+"."+groupBy)
			}
		}
		if "" != labelField {
			if l, ok := viewFieldOf(root, p, labelField); ok {
				n.label = l
			} else {
				unresolved = append(unresolved, p+"."+labelField)
			}
		}
		nodes = append(nodes, n)
		byPath[p] = n
	}
	if 0 < len(unresolved) {
		sort.Strings(unresolved)
		*loss = append(*loss, ViewLoss{Code: "unresolved_field", Count: len(unresolved), Detail: unresolved})
	}

	for _, n := range nodes {
		if viewHasLineBreak(n.label) || viewHasLineBreak(n.group) {
			return "", []VetFinding{viewLineBreakFinding(n.path)}
		}
	}

	groupSeen := map[string]bool{}
	groups := []string{}
	for _, n := range nodes {
		if n.grouped && !groupSeen[n.group] {
			groupSeen[n.group] = true
			groups = append(groups, n.group)
		}
	}
	sort.Strings(groups)
	byLabel := func(ns []*graphNode) []*graphNode {
		sort.SliceStable(ns, func(i, j int) bool {
			if ns[i].label != ns[j].label {
				return ns[i].label < ns[j].label
			}
			return ns[i].path < ns[j].path
		})
		return ns
	}
	inGroup := func(g string) []*graphNode {
		ns := []*graphNode{}
		for _, n := range nodes {
			if n.grouped && n.group == g {
				ns = append(ns, n)
			}
		}
		return byLabel(ns)
	}
	emitted := []*graphNode{}
	for _, g := range groups {
		emitted = append(emitted, inGroup(g)...)
	}
	loose := []*graphNode{}
	for _, n := range nodes {
		if !n.grouped {
			loose = append(loose, n)
		}
	}
	loose = byLabel(loose)
	emitted = append(emitted, loose...)

	at := map[string]int{}
	for i, n := range emitted {
		at[n.path] = i
	}
	drawn := append([]viewTriple{}, edges...)
	sort.SliceStable(drawn, func(i, j int) bool {
		a, b := drawn[i], drawn[j]
		if byPath[a.from].label != byPath[b.from].label {
			return byPath[a.from].label < byPath[b.from].label
		}
		if byPath[a.to].label != byPath[b.to].label {
			return byPath[a.to].label < byPath[b.to].label
		}
		return a.key < b.key
	})

	crossings := 0
	span := func(e viewTriple) (int, int) {
		a, b := at[e.from], at[e.to]
		if a < b {
			return a, b
		}
		return b, a
	}
	for i := 0; i < len(drawn); i++ {
		for j := i + 1; j < len(drawn); j++ {
			a1, b1 := span(drawn[i])
			a2, b2 := span(drawn[j])
			if (a1 < a2 && a2 < b1 && b1 < b2) || (a2 < a1 && a1 < b2 && b2 < b1) {
				crossings++
			}
		}
	}
	if 0 < crossings {
		*loss = append(*loss, ViewLoss{Code: "crossings", Count: crossings})
	}

	id := func(p string) string { return byPath[p].id }
	out := []string{}
	switch as {
	case "mermaid":
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "flowchart LR")
		for gi, g := range groups {
			out = append(out, "  subgraph g"+strconv.Itoa(gi)+"[\""+esc(g)+"\"]")
			for _, n := range inGroup(g) {
				out = append(out, "    "+n.id+"[\""+esc(n.label)+"\"]")
			}
			out = append(out, "  end")
		}
		for _, n := range loose {
			out = append(out, "  "+n.id+"[\""+esc(n.label)+"\"]")
		}
		for _, e := range drawn {
			out = append(out, "  "+id(e.from)+" -->|\""+esc(e.key)+"\"| "+id(e.to))
		}
	case "dot":
		esc := func(s string) string { return viewEscape(s, dotEsc) }
		out = append(out, "digraph G {", "  rankdir=LR;", "  node [shape=box];")
		for gi, g := range groups {
			out = append(out, "  subgraph cluster_g"+strconv.Itoa(gi)+" {", "    label=\""+esc(g)+"\";")
			for _, n := range inGroup(g) {
				out = append(out, "    "+n.id+" [label=\""+esc(n.label)+"\"];")
			}
			out = append(out, "  }")
		}
		for _, n := range loose {
			out = append(out, "  "+n.id+" [label=\""+esc(n.label)+"\"];")
		}
		for _, e := range drawn {
			out = append(out, "  "+id(e.from)+" -> "+id(e.to)+" [label=\""+esc(e.key)+"\"];")
		}
		out = append(out, "}")
	default:
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "erDiagram")
		for _, e := range drawn {
			out = append(out, "  "+id(e.from)+" }o--o{ "+id(e.to)+" : \""+esc(e.key)+"\"")
		}
	}
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The architecture layers

type viewBand struct {
	name  string
	nodes []*graphNode
}

// drawLayer is THE LAYER DIAGRAM: one band per value of the group
// field, stacked in the partition order of the layer-level graph
// (reversed, so the band nothing depends on is on top), with the
// relation's upward edges named under the figure. See drawLayer in
// ts/src/view.ts.
func drawLayer(triples []viewTriple, root Val, relation, groupBy string, layers []string,
	edges, as string, max int, loss *[]ViewLoss) (string, []VetFinding) {
	if "" == groupBy {
		return "", []VetFinding{viewFinding("view_group_required", "reference", "$",
			"The layer diagram needs the field that names each node's layer; name it with --group-by.", "")}
	}
	relation, perr := viewPickRelation(relation, viewKeys(triples))
	if nil != perr {
		return "", []VetFinding{*perr}
	}
	rel := []viewTriple{}
	for _, e := range triples {
		if e.key == relation {
			rel = append(rel, e)
		}
	}
	paths := viewTripleNodes(rel)
	if max < len(paths) {
		return "", []VetFinding{viewRowsFinding(len(paths), max, "--at or --relation")}
	}
	labels := shortLabels(paths)

	unresolved := []string{}
	nodes := []*graphNode{}
	byPath := map[string]*graphNode{}
	for _, p := range paths {
		n := &graphNode{path: p, label: labels[p], id: viewIdent(labels[p]), group: "-"}
		if g, ok := viewFieldOf(root, p, groupBy); ok {
			n.group = g
		} else {
			unresolved = append(unresolved, p+"."+groupBy)
		}
		nodes = append(nodes, n)
		byPath[p] = n
	}
	if 0 < len(unresolved) {
		sort.Strings(unresolved)
		*loss = append(*loss, ViewLoss{Code: "unresolved_field", Count: len(unresolved), Detail: unresolved})
	}
	for _, n := range nodes {
		if viewHasLineBreak(n.group) {
			return "", []VetFinding{viewLineBreakFinding(n.path)}
		}
	}

	nameSeen := map[string]bool{}
	names := []string{}
	none := false
	for _, n := range nodes {
		if "-" == n.group {
			none = true
		} else if !nameSeen[n.group] {
			nameSeen[n.group] = true
			names = append(names, n.group)
		}
	}
	sort.Strings(names)
	succ := map[string][]string{}
	for _, g := range names {
		succ[g] = []string{}
	}
	for _, e := range rel {
		from, to := byPath[e.from].group, byPath[e.to].group
		if from != to && "-" != from && "-" != to &&
			!contains(layers, from) && !contains(layers, to) {
			succ[from] = append(succ[from], to)
		}
	}
	// Named bands first, in the order given; the rest derived, and the
	// unresolved band last.
	order := []string{}
	rest := []string{}
	for _, g := range layers {
		if contains(names, g) {
			order = append(order, g)
		}
	}
	for _, g := range names {
		if !contains(order, g) {
			rest = append(rest, g)
		}
	}
	same := func(g string) string { return g }
	placed := viewPartition(rest, succ, viewReach(rest, succ), same, loss)
	for i := len(placed) - 1; 0 <= i; i-- {
		order = append(order, placed[i])
	}
	if none {
		order = append(order, "-")
	}
	bands := []viewBand{}
	level := map[string]int{}
	for i, name := range order {
		level[name] = i
		ns := []*graphNode{}
		for _, n := range nodes {
			if n.group == name {
				ns = append(ns, n)
			}
		}
		// Labels are unique in a drawing, so they order a band on their
		// own.
		sort.SliceStable(ns, func(x, y int) bool { return ns[x].label < ns[y].label })
		bands = append(bands, viewBand{name: name, nodes: ns})
	}

	drawn := append([]viewTriple{}, rel...)
	sort.SliceStable(drawn, func(i, j int) bool {
		a, b := drawn[i], drawn[j]
		if byPath[a.from].label != byPath[b.from].label {
			return byPath[a.from].label < byPath[b.from].label
		}
		return byPath[a.to].label < byPath[b.to].label
	})
	down, side, up := 0, 0, 0
	classed := []viewDrawing{}
	for _, e := range drawn {
		fi, ti := level[byPath[e.from].group], level[byPath[e.to].group]
		way := "upward"
		if fi < ti {
			down++
			way = "downward"
		} else if fi == ti {
			side++
			way = "sideways"
		} else {
			up++
		}
		classed = append(classed, viewDrawing{edge: e, way: way})
	}

	// WHICH EDGES ARE SHOWN. Mermaid lays edges out itself and drew
	// every one before this option existed; the fixed grids drew the
	// upward ones, which are the violations the bands cannot show on
	// their own.
	if "" == edges {
		edges = "upward"
		if "mermaid" == as {
			edges = "all"
		}
	}
	shown := []viewDrawing{}
	if "all" == edges {
		shown = classed
	} else if "upward" == edges {
		for _, c := range classed {
			if "upward" == c.way {
				shown = append(shown, c)
			}
		}
	}

	// A document with no edges has no relation to count under; the
	// footer names the absence as the panels do.
	named := relation
	if "" == named {
		named = "-"
	}
	footer := []string{"# " + named + ": " + strconv.Itoa(down) + " downward, " +
		strconv.Itoa(side) + " sideways, " + strconv.Itoa(up) + " upward"}
	for _, c := range shown {
		footer = append(footer, "# "+c.way+": "+byPath[c.edge.from].label+
			" -> "+byPath[c.edge.to].label)
	}
	if "svg" == as {
		return layerSvg(bands, shown, footer,
			"Architecture layers"+svgOver(relation)+": "+strconv.Itoa(len(bands))+" bands, "+
				strconv.Itoa(up)+" upward edges"), nil
	}
	out := []string{}
	if "text" == as {
		bandNames := []string{}
		for _, b := range bands {
			bandNames = append(bandNames, b.name)
		}
		w := viewWidest(bandNames)
		rows := []string{}
		for _, b := range bands {
			ls := []string{}
			for _, n := range b.nodes {
				ls = append(ls, n.label)
			}
			rows = append(rows, viewPad(b.name, w)+"  "+strings.Join(ls, "  "))
		}
		inner := viewWidest(rows)
		rule := "+" + strings.Repeat("-", inner+2) + "+"
		out = append(out, rule)
		for _, row := range rows {
			out = append(out, "| "+viewPad(row, inner)+" |", rule)
		}
		out = append(out, footer...)
	} else {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "flowchart TB")
		for i, b := range bands {
			out = append(out, "  subgraph g"+strconv.Itoa(i)+"[\""+esc(b.name)+"\"]", "    direction LR")
			for _, n := range b.nodes {
				out = append(out, "    "+n.id+"[\""+esc(n.label)+"\"]")
			}
			out = append(out, "  end")
		}
		for _, c := range shown {
			if "upward" == c.way {
				out = append(out, "  "+byPath[c.edge.from].id+" -.->|\"upward\"| "+
					byPath[c.edge.to].id)
			} else {
				out = append(out, "  "+byPath[c.edge.from].id+" --> "+byPath[c.edge.to].id)
			}
		}
	}
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The set panel, shared by `sets` and `layers`

// viewColumn is one intersection column: the sets it lies in, and its
// elements, as shown.
type viewColumn struct {
	sig   []bool
	items []string
}

type viewPanel struct {
	header string
	names  []string
	sizes  []int
	cols   []viewColumn
	bars   bool
	none   string
}

// viewColumns groups elements by their exact membership signature;
// columns by degree descending, then cardinality descending, then
// signature (the names of the sets it lies in) in code-point order.
func viewColumns(names []string, members map[string]map[string]bool,
	elements []string, shown func(string) string) []viewColumn {
	sorted := append([]string{}, elements...)
	sort.SliceStable(sorted, func(i, j int) bool { return shown(sorted[i]) < shown(sorted[j]) })
	groups := map[string]*viewColumn{}
	order := []string{}
	for _, el := range sorted {
		sig := []bool{}
		key := ""
		for _, n := range names {
			in := members[n][el]
			sig = append(sig, in)
			if in {
				key += "1"
			} else {
				key += "0"
			}
		}
		col, ok := groups[key]
		if !ok {
			col = &viewColumn{sig: sig}
			groups[key] = col
			order = append(order, key)
		}
		col.items = append(col.items, shown(el))
	}
	out := []viewColumn{}
	for _, key := range order {
		out = append(out, *groups[key])
	}
	degree := func(c viewColumn) int {
		d := 0
		for _, b := range c.sig {
			if b {
				d++
			}
		}
		return d
	}
	sigText := func(c viewColumn) string {
		in := []string{}
		for i, b := range c.sig {
			if b {
				in = append(in, names[i])
			}
		}
		return strings.Join(in, " ")
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if degree(a) != degree(b) {
			return degree(a) > degree(b)
		}
		if len(a.items) != len(b.items) {
			return len(a.items) > len(b.items)
		}
		return sigText(a) < sigText(b)
	})
	return out
}

func renderPanel(p viewPanel) string {
	w := viewWidest(p.names)
	out := []string{p.header, ""}
	most := 0
	for _, n := range p.sizes {
		if n > most {
			most = n
		}
	}
	for i, n := range p.names {
		line := viewPad(n, w) + "  "
		if p.bars {
			line += viewPad(strings.Repeat("#", p.sizes[i]), most) + "  "
		}
		out = append(out, line+strconv.Itoa(p.sizes[i]))
	}
	out = append(out, "")
	for i, n := range p.names {
		cells := []string{}
		for _, c := range p.cols {
			if c.sig[i] {
				cells = append(cells, "*")
			} else {
				cells = append(cells, ".")
			}
		}
		out = append(out, viewPad(n, w)+" | "+strings.Join(cells, " "))
	}
	out = append(out, viewPad("", w)+" +"+strings.Repeat("-", 2*len(p.cols)))
	if p.bars {
		tallest := 0
		for _, c := range p.cols {
			if len(c.items) > tallest {
				tallest = len(c.items)
			}
		}
		// The bars, tallest column first; a line ends at its last bar.
		for h := tallest; 0 < h; h-- {
			line := viewPad("", w) + " |"
			for _, c := range p.cols {
				if h <= len(c.items) {
					line += " #"
				} else {
					line += "  "
				}
			}
			out = append(out, strings.TrimRight(line, " "))
		}
	}
	counts := []string{}
	for _, c := range p.cols {
		counts = append(counts, strconv.Itoa(len(c.items)))
	}
	out = append(out, viewPad("", w)+"   "+strings.Join(counts, " "))
	out = append(out, "")
	for i, c := range p.cols {
		out = append(out, "  "+panelColumnLine(p, i, c))
	}
	return strings.Join(out, "\n")
}

// viewElide elides the columns beyond `--max-cols`, counted. Zero
// means no limit, in both ports.
func viewElide(cols []viewColumn, maxCols int, loss *[]ViewLoss) []viewColumn {
	if 0 == maxCols || len(cols) <= maxCols {
		return cols
	}
	*loss = append(*loss, ViewLoss{Code: "cols_elided", Count: len(cols) - maxCols})
	return cols[:maxCols]
}

// viewGenAt is the generated value at a path, walked plainly.
func viewGenAt(gen any, path string) (any, bool) {
	v := gen
	for _, part := range queryPathParts(path) {
		switch n := v.(type) {
		case map[string]any:
			next, ok := n[part]
			if !ok {
				return nil, false
			}
			v = next
		case []any:
			i, err := strconv.Atoi(part)
			if nil != err || i < 0 || len(n) <= i {
				return nil, false
			}
			v = n[i]
		default:
			return nil, false
		}
	}
	return v, true
}

func viewShapeFinding(path, message string) VetFinding {
	return viewFinding("view_sets_shape", "reference", path, message, "")
}

// viewStrings is a generated list as strings, or false when any
// element is not one.
func viewStrings(xs []any) ([]string, bool) {
	out := []string{}
	for _, x := range xs {
		s, ok := x.(string)
		if !ok {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}

func drawSets(gen any, sets, member, universe string, minDegree, maxCols int, as string, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	fam, _ := viewGenAt(gen, sets)
	family, ok := fam.(map[string]any)
	if !ok {
		return "", []VetFinding{viewShapeFinding(sets, "The set family is not a map.")}
	}
	names := []string{}
	for n := range family {
		names = append(names, n)
	}
	sort.Strings(names)
	if max < len(names) {
		return "", []VetFinding{viewRowsFinding(len(names), max, "--sets")}
	}
	members := map[string]map[string]bool{}
	elemSeen := map[string]bool{}
	elements := []string{}
	add := func(x string) {
		if !elemSeen[x] {
			elemSeen[x] = true
			elements = append(elements, x)
		}
	}
	for _, n := range names {
		set, _ := family[n].(map[string]any)
		raw, _ := set[member].([]any)
		list, ok := viewStrings(raw)
		if _, isList := set[member].([]any); !ok || !isList {
			return "", []VetFinding{viewShapeFinding(sets+"."+n+"."+member,
				"A set's members must be a list of strings.")}
		}
		members[n] = map[string]bool{}
		for _, x := range list {
			members[n][x] = true
			add(x)
		}
	}
	if "" != universe {
		u, _ := viewGenAt(gen, universe)
		var all []string
		ok := false
		switch un := u.(type) {
		case []any:
			all, ok = viewStrings(un)
		case map[string]any:
			all = []string{}
			for k := range un {
				all = append(all, universe+"."+k)
			}
			sort.Strings(all)
			ok = true
		}
		if !ok {
			return "", []VetFinding{viewShapeFinding(universe,
				"The universe must be a map or a list of strings.")}
		}
		for _, x := range all {
			add(x)
		}
	}
	addressed := []string{}
	for _, x := range elements {
		if strings.HasPrefix(x, "$.") {
			addressed = append(addressed, x)
		}
	}
	sort.Strings(addressed)
	short := shortLabels(addressed)
	shown := func(x string) string {
		if s, ok := short[x]; ok {
			return s
		}
		return x
	}
	cols := viewColumns(names, members, elements, shown)
	if 0 < minDegree {
		kept := []viewColumn{}
		for _, c := range cols {
			d := 0
			for _, b := range c.sig {
				if b {
					d++
				}
			}
			if minDegree <= d {
				kept = append(kept, c)
			}
		}
		cols = kept
	}
	cols = viewElide(cols, maxCols, loss)
	// A set name or an element is a generated string, and a string can
	// hold a line terminator; no line of the panel can.
	for _, s := range append(append([]string{}, names...), elements...) {
		if viewHasLineBreak(s) {
			return "", []VetFinding{viewLineBreakFinding(sets)}
		}
	}
	sizes := []int{}
	for _, n := range names {
		sizes = append(sizes, len(members[n]))
	}
	header := "# upset  sets=" + sets + "(" + strconv.Itoa(len(names)) + ")  member=" + member +
		"  elements=" + strconv.Itoa(len(elements))
	if "" != universe {
		header += "  universe=" + universe
	}
	panel := viewPanel{
		header: header, names: names, sizes: sizes, cols: cols,
		bars: true, none: "   (in no set)",
	}
	if "svg" == as {
		return panelSvg(panel, "Set panel over "+sets+": "+strconv.Itoa(len(names))+" sets, "+
			strconv.Itoa(len(elements))+" elements, "+strconv.Itoa(len(cols))+" intersections"), nil
	}
	return renderPanel(panel), nil
}

// viewDocName is the file a contribution names, as the panel shows it:
// relative to the entry document's directory, the entry itself by its
// own name.
func viewDocName(file, entry string) string {
	if "" == file || file == entry {
		if "" == entry {
			return "-"
		}
		return filepath.Base(entry)
	}
	if filepath.IsAbs(file) && "" != entry {
		abs, err := filepath.Abs(entry)
		if nil != err { //coverage:ignore Abs fails only on an unreadable cwd
			abs = entry
		}
		rel, err := filepath.Rel(filepath.Dir(abs), file)
		if nil != err { //coverage:ignore Rel fails only across volumes
			return file
		}
		return rel
	}
	return file
}

// drawLayers is the set panel over the provenance record: every path
// something met at AND THE DOCUMENT HAS A VALUE AT, by the documents
// that met there. See drawLayers in ts/src/view.ts.
func drawLayers(prov *Provenance, root Val, entry, at string, minSize, maxCols int, as string, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	members := map[string]map[string]bool{}
	paths := []string{}
	atParts := queryPathParts(at)
	keys := []string{}
	for key := range prov.paths {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		rec := prov.paths[key]
		if 0 == len(rec.conjuncts) || nil == anchorAt(root, "$."+key) {
			continue
		}
		parts := []string{}
		if "" != key {
			parts = strings.Split(key, ".")
		}
		skip := false
		for i, p := range atParts {
			if len(parts) <= i || parts[i] != p {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		shown := "$"
		if 0 < len(parts) {
			shown = strings.Join(parts, ".")
		}
		paths = append(paths, shown)
		for _, c := range rec.conjuncts {
			d := viewDocName(c.Site.File, entry)
			if nil == members[d] {
				members[d] = map[string]bool{}
			}
			members[d][shown] = true
		}
	}
	names := []string{}
	for n := range members {
		names = append(names, n)
	}
	sort.Strings(names)
	if max < len(names) {
		return "", []VetFinding{viewRowsFinding(len(names), max, "--at")}
	}
	cols := viewColumns(names, members, paths, func(p string) string { return p })
	if 0 < minSize {
		kept := []viewColumn{}
		for _, c := range cols {
			if minSize <= len(c.items) {
				kept = append(kept, c)
			}
		}
		cols = kept
	}
	cols = viewElide(cols, maxCols, loss)
	sizes := []int{}
	for _, n := range names {
		sizes = append(sizes, len(members[n]))
	}
	file := "-"
	if "" != entry {
		file = filepath.Base(entry)
	}
	panel := viewPanel{
		header: "# layers  file=" + file + "  documents=" + strconv.Itoa(len(names)) +
			"  paths=" + strconv.Itoa(len(paths)),
		names: names, sizes: sizes, cols: cols, bars: false, none: "",
	}
	if "svg" == as {
		return panelSvg(panel, "Document layers: "+strconv.Itoa(len(names))+" documents, "+
			strconv.Itoa(len(paths))+" paths, "+strconv.Itoa(len(cols))+" intersections"), nil
	}
	return renderPanel(panel), nil
}

// ---------------------------------------------------------------------
// The meet ladder

func (a *Aontu) drawLadder(src, at, as string, max int) (string, []VetFinding) {
	if "" == at {
		return "", []VetFinding{viewFinding("view_at_required", "reference", "$",
			"The ladder needs the path to draw; name it with --at.", "")}
	}
	rep := a.Why(src, at)
	if nil == rep.Record {
		return "", rep.Findings
	}
	rungs := append([]WhyConjunct{}, rep.Record.Conjuncts...)
	rank := func(c WhyConjunct) int {
		if nil == c.Rank {
			return 0
		}
		return *c.Rank
	}
	sort.SliceStable(rungs, func(i, j int) bool {
		x, y := rungs[i], rungs[j]
		if rank(x) != rank(y) {
			return rank(x) > rank(y)
		}
		if x.Site.File != y.Site.File {
			return x.Site.File < y.Site.File
		}
		if x.Site.Row != y.Site.Row {
			return x.Site.Row < y.Site.Row
		}
		return x.Site.Col < y.Site.Col
	})
	if max < len(rungs) {
		return "", []VetFinding{viewRowsFinding(len(rungs), max, "a narrower --at")}
	}
	// An unnamed source is shown as nothing, not as `.` -- the base of
	// an empty path is empty in the canonical port.
	where := func(c WhyConjunct) string {
		file := ""
		if "" != c.Site.File {
			file = filepath.Base(c.Site.File)
		}
		return file + ":" + strconv.Itoa(c.Site.Row) + ":" + strconv.Itoa(c.Site.Col)
	}

	out := []string{}
	if "mermaid" == as {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "graph TD", "  top((\"top\"))")
		for i, c := range rungs {
			out = append(out, "  c"+strconv.Itoa(i)+"[\""+esc(c.Canon)+"<br/>"+c.Role+" | "+esc(where(c))+"\"]")
		}
		out = append(out, "  val{{\""+esc(rep.Record.Value)+"\"}}")
		prev := "top"
		for i := range rungs {
			out = append(out, "  "+prev+" --> c"+strconv.Itoa(i))
			prev = "c" + strconv.Itoa(i)
		}
		out = append(out, "  "+prev+" --> val")
	} else {
		esc := func(s string) string { return viewEscape(s, dotEsc) }
		out = append(out, "digraph G {", "  rankdir=TB;", "  node [shape=box];",
			"  top [shape=circle, label=\"top\"];")
		for i, c := range rungs {
			out = append(out, "  c"+strconv.Itoa(i)+" [label=\""+esc(c.Canon)+"\\n"+c.Role+" | "+esc(where(c))+"\"];")
		}
		out = append(out, "  val [shape=hexagon, label=\""+esc(rep.Record.Value)+"\"];")
		prev := "top"
		for i := range rungs {
			out = append(out, "  "+prev+" -> c"+strconv.Itoa(i)+";")
			prev = "c" + strconv.Itoa(i)
		}
		out = append(out, "  "+prev+" -> val;", "}")
	}
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The subsumption poset

type viewPosetDoc struct {
	src, path, label string
}

type viewClass struct {
	members []int
	label   string
}

// viewCompare is one pairwise comparison of the poset: the verdict,
// and the reason code when undecided. A parameter so a test can hand
// the drawing a verdict matrix the checker cannot be made to produce.
type viewCompare func(general, specific viewPosetDoc) (string, string)

func (a *Aontu) compareBySubsume(at, profile string) viewCompare {
	return func(general, specific viewPosetDoc) (string, string) {
		r := Subsume(general.src, specific.src, &SubsumeOptions{
			Trust: a.Trust, Profile: profile, At: at,
			GeneralPath: general.path, SpecificPath: specific.path,
		})
		code := "undecided"
		if 0 < len(r.Findings) {
			code = r.Findings[0].Code
		}
		return r.Verdict, code
	}
}

func (a *Aontu) drawPoset(docs []viewPosetDoc, at, profile, as string, max int,
	loss *[]ViewLoss, compare viewCompare) (string, []VetFinding) {
	n := len(docs)
	verdict := make([][]string, n)
	code := make([][]string, n)
	broken := false
	for i := range docs {
		verdict[i] = make([]string, n)
		code[i] = make([]string, n)
		for j := range docs {
			verdict[i][j] = SubsumeYes
			if i == j {
				continue
			}
			verdict[i][j], code[i][j] = compare(docs[i], docs[j])
			broken = broken || SubsumeError == verdict[i][j]
		}
	}
	if broken {
		errs := []VetFinding{}
		for _, d := range docs {
			errs = append(errs, a.viewDocFailure(d, at)...)
		}
		return "", errs
	}
	ge := func(i, j int) bool { return SubsumeYes == verdict[i][j] }

	classes := []*viewClass{}
	for i := 0; i < n; i++ {
		var found *viewClass
		for _, c := range classes {
			if ge(i, c.members[0]) && ge(c.members[0], i) {
				found = c
				break
			}
		}
		if nil == found {
			classes = append(classes, &viewClass{members: []int{i}})
		} else {
			found.members = append(found.members, i)
		}
	}
	for _, c := range classes {
		sort.SliceStable(c.members, func(x, y int) bool {
			return docs[c.members[x]].label < docs[c.members[y]].label
		})
		labels := []string{}
		for _, m := range c.members {
			labels = append(labels, docs[m].label)
		}
		c.label = strings.Join(labels, " = ")
	}
	sort.SliceStable(classes, func(x, y int) bool { return classes[x].label < classes[y].label })
	if max < len(classes) {
		return "", []VetFinding{viewRowsFinding(len(classes), max, "fewer documents")}
	}
	for _, c := range classes {
		if viewHasLineBreak(c.label) {
			return "", []VetFinding{viewLineBreakFinding("$")}
		}
	}

	k := len(classes)
	rep := func(ci int) int { return classes[ci].members[0] }
	closure := make([][]bool, k)
	for lo := 0; lo < k; lo++ {
		closure[lo] = make([]bool, k)
		for hi := 0; hi < k; hi++ {
			closure[lo][hi] = lo != hi && ge(rep(hi), rep(lo))
		}
	}
	for m := 0; m < k; m++ {
		for i := 0; i < k; i++ {
			for j := 0; j < k; j++ {
				if closure[i][m] && closure[m][j] {
					closure[i][j] = true
				}
			}
		}
	}

	covers := [][2]int{}
	intransitive := []string{}
	for lo := 0; lo < k; lo++ {
		for hi := 0; hi < k; hi++ {
			if !closure[lo][hi] {
				continue
			}
			if SubsumeNo == verdict[rep(hi)][rep(lo)] {
				intransitive = append(intransitive, classes[lo].label+" < "+classes[hi].label)
			}
			viaMid := false
			for mid := 0; mid < k; mid++ {
				if mid != lo && mid != hi && closure[lo][mid] && closure[mid][hi] {
					viaMid = true
					break
				}
			}
			if !viaMid {
				covers = append(covers, [2]int{lo, hi})
			}
		}
	}
	if 0 < len(intransitive) {
		*loss = append(*loss, ViewLoss{Code: "order_intransitive", Count: len(intransitive), Detail: intransitive})
	}

	type dashedEdge struct {
		s, g int
		code string
	}
	dashed := []dashedEdge{}
	maybeEqual := []string{}
	for g := 0; g < k; g++ {
		for s := 0; s < k; s++ {
			if g == s || SubsumeUndecided != verdict[rep(g)][rep(s)] {
				continue
			}
			if closure[s][g] || closure[g][s] {
				maybeEqual = append(maybeEqual, classes[s].label+" ~ "+classes[g].label)
			} else {
				dashed = append(dashed, dashedEdge{s, g, code[rep(g)][rep(s)]})
			}
		}
	}
	if 0 < len(dashed) {
		detail := []string{}
		for _, d := range dashed {
			detail = append(detail, classes[d.s].label+" ~ "+classes[d.g].label+" ("+d.code+")")
		}
		*loss = append(*loss, ViewLoss{Code: "order_undecided", Count: len(dashed), Detail: detail})
	}
	if 0 < len(maybeEqual) {
		*loss = append(*loss, ViewLoss{Code: "order_maybe_equal", Count: len(maybeEqual), Detail: maybeEqual})
	}

	if "" == profile {
		profile = "defaults"
	}
	head := "aontu subsumption poset"
	if "" != at {
		head += "  at=" + at
	}
	head += "  profile=" + profile + "  documents=" + strconv.Itoa(n) + "  nodes=" + strconv.Itoa(k)
	out := []string{}
	if "mermaid" == as {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "%% "+head, "graph BT")
		for i, c := range classes {
			out = append(out, "  n"+strconv.Itoa(i)+"[\""+esc(c.label)+"\"]")
		}
		for _, cv := range covers {
			out = append(out, "  n"+strconv.Itoa(cv[0])+" --> n"+strconv.Itoa(cv[1]))
		}
		for _, d := range dashed {
			out = append(out, "  n"+strconv.Itoa(d.s)+" -.->|\""+esc(d.code)+"\"| n"+strconv.Itoa(d.g))
		}
	} else {
		esc := func(s string) string { return viewEscape(s, dotEsc) }
		out = append(out, "// "+head, "digraph G {", "  rankdir=BT;", "  node [shape=box];")
		for i, c := range classes {
			out = append(out, "  n"+strconv.Itoa(i)+" [label=\""+esc(c.label)+"\"];")
		}
		for _, cv := range covers {
			out = append(out, "  n"+strconv.Itoa(cv[0])+" -> n"+strconv.Itoa(cv[1])+";")
		}
		for _, d := range dashed {
			out = append(out, "  n"+strconv.Itoa(d.s)+" -> n"+strconv.Itoa(d.g)+" [style=dashed, label=\""+esc(d.code)+"\"];")
		}
		out = append(out, "}")
	}
	return strings.Join(out, "\n"), nil
}

// viewDocFailure is why a poset could not be drawn: the documents that
// do not stand up on their own, or the anchor a document lacks.
func (a *Aontu) viewDocFailure(d viewPosetDoc, at string) []VetFinding {
	b := aontuForPathTrust(d.path, a.Trust)
	b.File = d.path
	root, _, errs := b.viewLoad(d.src, nil)
	if nil != errs {
		return errs
	}
	if "" != at && nil == anchorAt(root, at) {
		return []VetFinding{viewFinding("no_path", "reference", at,
			d.label+" has no value at "+at+".", "")}
	}
	return []VetFinding{}
}

// ---------------------------------------------------------------------
// The verb

// viewLoad is one evaluation, parsed and unified separately so the
// provenance recorder can stamp the parsed tree before the fixpoint
// runs (Why's precedent).
func (a *Aontu) viewLoad(src string, prov *Provenance) (Val, *Ctx, []VetFinding) {
	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return nil, nil, []VetFinding{parseFinding(a.File, VetRoleData, perr)}
	}
	var ctx *Ctx
	var root Val
	if nil != prov {
		if "" != a.File {
			stampURL(parsed, a.File)
		}
		for k, v := range a.IncludeText {
			prov.texts[k] = v
		}
		if "" != a.File {
			prov.texts[a.File] = src
		}
		prov.src = src
		prov.writtenFrom(parsed)
		ctx = &Ctx{root: parsed, src: src, file: a.File, prov: prov}
		if nil != a.Trust {
			ctx.budgetPasses = a.Trust.Budget.Passes
			ctx.budgetDepth = a.Trust.Budget.Depth
		}
		root = unifyRoot(parsed, ctx)
		ctx.root = root
	} else {
		root, ctx, _ = a.unifyCtx(parsed, nil, src)
	}
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return nil, nil, []VetFinding{failureFinding(ctx, a.File, src, root)}
	}
	return root, ctx, nil
}

// View draws a figure of one document (or, for the poset, of a set of
// them). Mirrors view in ts/src/view.ts.
func (a *Aontu) View(src string, opts *ViewOptions) ViewReport {
	options := ViewOptions{}
	if nil != opts {
		options = *opts
	}
	kind := options.Kind
	if "" == kind {
		kind = "tree"
	}
	loss := []ViewLoss{}

	done := func(text string, errs []VetFinding) ViewReport {
		if nil != errs {
			return ViewReport{Verdict: "error", Kind: kind, Loss: []ViewLoss{}, Errors: errs}
		}
		sort.SliceStable(loss, func(i, j int) bool { return loss[i].Code < loss[j].Code })
		verdict := "rendered"
		for _, l := range loss {
			if !viewInformational[l.Code] {
				verdict = "lossy"
			}
		}
		return ViewReport{Verdict: verdict, Kind: kind, Text: &text, Loss: loss}
	}

	profiles, known := viewProfiles[kind]
	if !known {
		return done("", []VetFinding{viewFinding("view_kind_unknown", "reference", "$",
			kind+" is not a figure kind.", "kinds: "+strings.Join(viewKinds, ", "))})
	}
	as := options.As
	if "" == as {
		as = profiles[0]
	}
	if !contains(profiles, as) {
		return done("", []VetFinding{viewFinding("view_profile_unknown", "reference", "$",
			"The "+kind+" figure does not render as "+as+".",
			"profiles: "+strings.Join(profiles, ", "))})
	}
	max := options.MaxRows
	if 0 == max {
		max = viewDefaultMaxRows
	}

	if "poset" == kind {
		all := append([]ViewDoc{{Src: src, Path: a.File}}, options.Docs...)
		docs := []viewPosetDoc{}
		for i, d := range all {
			label := d.Name
			if "" == label {
				label = "doc" + strconv.Itoa(i+1)
				if "" != d.Path {
					label = strings.TrimSuffix(filepath.Base(d.Path), ".aon")
				}
			}
			docs = append(docs, viewPosetDoc{src: d.Src, path: d.Path, label: label})
		}
		return done(a.drawPoset(docs, options.At, options.Profile, as, max, &loss,
			a.compareBySubsume(options.At, options.Profile)))
	}
	if "ladder" == kind {
		return done(a.drawLadder(src, options.At, as, max))
	}

	var prov *Provenance
	if "layers" == kind {
		prov = newProvenance(src, map[string]string{})
	}
	root, ctx, errs := a.viewLoad(src, prov)
	if nil != errs {
		return done("", errs)
	}
	return done(a.drawLoaded(root, ctx, nil, prov, kind, as, &options, max, &loss))
}

// viewGen boxes a generated value, so a caller that already holds one
// (a view document reads its declarations out of one) hands it over
// rather than generating again. See drawLoaded in ts/src/view.ts.
type viewGen struct {
	value any
}

// drawLoaded is THE KINDS THAT DRAW FROM A LOADED MODEL, so a view
// document can load once and draw N figures from the one evaluation.
func (a *Aontu) drawLoaded(root Val, ctx *Ctx, gen *viewGen, prov *Provenance,
	kind, as string, options *ViewOptions, max int, loss *[]ViewLoss) (string, []VetFinding) {
	if "layers" == kind {
		return drawLayers(prov, root, a.File, options.At, options.MinSize, options.MaxCols, as, max, loss)
	}
	if "sets" == kind {
		if "" == options.Sets || "" == options.Member {
			return "", []VetFinding{viewFinding("view_sets_required", "reference", "$",
				"The set panel needs --sets and --member.", "")}
		}
		var value any
		if nil == gen {
			// GENERATION CAN FAIL WHERE UNIFICATION DID NOT: the panel
			// reads generated values, so a document that is not concrete
			// is an error here, exactly as `aontu file.aon` on it is.
			v, gerr := root.Gen(ctx)
			if nil != gerr {
				return "", queryFailed(gerr, "$").Findings
			}
			value = v
		} else {
			value = gen.value
		}
		return drawSets(value, options.Sets, options.Member, options.Universe,
			options.MinDegree, options.MaxCols, as, max, loss)
	}

	triples := viewTriples(GraphOf(root).Edges, options.At, loss)
	decls := ctx.reldecls
	if "matrix" == kind {
		order := options.Order
		if "" == order {
			order = "canon"
		}
		return drawMatrix(triples, decls, options.Relation, order, options.Closure, as, max, loss)
	}
	if "graph" == kind {
		return drawGraph(triples, decls, root, options.Relations,
			options.GroupBy, options.Label, as, max, loss)
	}
	if "layer" == kind {
		return drawLayer(triples, root, options.Relation, options.GroupBy, options.Layers,
			options.Edges, as, max, loss)
	}
	return drawTree(collapseEdges(triples, options.Relation), options.Relation, options.Roots, max, as)
}

// ViewTree is the tree view of one document: View with the kind fixed.
func (a *Aontu) ViewTree(src string, opts *ViewOptions) ViewReport {
	options := ViewOptions{}
	if nil != opts {
		options = *opts
	}
	options.Kind = "tree"
	return a.View(src, &options)
}
