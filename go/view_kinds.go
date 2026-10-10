/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ViewPart is one part of a split figure: a whole figure of its own.
type ViewPart struct {
	Name string `json:"name"`
	Text string `json:"text"`
}

// viewGhosts maps a node drawn only because an edge reaches it from
// the selection to the part it lives in; "" is outside every part.
type viewGhosts map[string]string

func viewUnresolvedLoss(unresolved []string, loss *[]ViewLoss) {
	seen := map[string]bool{}
	detail := []string{}
	for _, u := range unresolved {
		if !seen[u] {
			seen[u] = true
			detail = append(detail, u)
		}
	}
	if 0 < len(detail) {
		sort.Strings(detail)
		*loss = append(*loss, ViewLoss{Code: "unresolved_field", Count: len(detail), Detail: detail})
	}
}

// viewSpell spells every code point keep refuses as `_`, its hex and
// `_` again, so the spelling is injective: `_` itself is never kept.
func viewSpell(name string, keep func(rune) bool) string {
	out := ""
	for _, c := range name {
		if keep(c) {
			out += string(c)
		} else {
			out += "_" + strconv.FormatInt(int64(c), 16) + "_"
		}
	}
	return out
}

func viewAlnum(c rune) bool {
	return ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') || ('0' <= c && c <= '9')
}

func viewGhostLabel(label, where string) string {
	if "" == where {
		return label + " (outside)"
	}
	return label + " (in " + where + ")"
}

// viewGraphPaths is the drawn nodes: what the edges connect and the
// members asked for.
func viewGraphPaths(edges []viewTriple, members []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, p := range append(viewTripleNodes(edges), members...) {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return out
}

func viewGraphNodes(paths []string, root Val, groupBy, labelField string,
	ghosts viewGhosts, unresolved *[]string) ([]*graphNode, *VetFinding) {
	labels := shortLabels(paths)
	nodes := []*graphNode{}
	for _, p := range paths {
		n := &graphNode{path: p, label: labels[p], id: viewIdent(labels[p])}
		if "" != groupBy {
			if g, ok := viewFieldOf(root, p, groupBy); ok {
				n.group, n.grouped = g, true
			} else {
				*unresolved = append(*unresolved, p+"."+groupBy)
			}
		}
		if "" != labelField {
			if l, ok := viewFieldOf(root, p, labelField); ok {
				n.label = l
			} else {
				*unresolved = append(*unresolved, p+"."+labelField)
			}
		}
		if where, ghost := ghosts[p]; ghost {
			n.ghost = true
			n.id = "x" + n.id
			n.label = viewGhostLabel(n.label, where)
		}
		nodes = append(nodes, n)
	}
	for _, n := range nodes {
		if viewHasLineBreak(n.label) || viewHasLineBreak(n.group) {
			f := viewLineBreakFinding(n.path)
			return nil, &f
		}
	}
	return nodes, nil
}

// viewGroupTitle is a group's title: its name, and with counts its
// member count, and with countBy its members counted by that field's
// value. A ghost is not a member.
func viewGroupTitle(name string, members []*graphNode, root Val, counts bool,
	countBy string, unresolved *[]string) string {
	real := 0
	by := map[string]int{}
	for _, n := range members {
		if n.ghost {
			continue
		}
		real++
		if "" != countBy {
			v, ok := viewFieldOf(root, n.path, countBy)
			if !ok {
				*unresolved = append(*unresolved, n.path+"."+countBy)
				v = "-"
			}
			by[v]++
		}
	}
	if "" != countBy && 0 < real {
		keys := []string{}
		for k := range by {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := []string{}
		for _, k := range keys {
			parts = append(parts, k+" "+strconv.Itoa(by[k]))
		}
		return name + " (" + strconv.Itoa(real) + ": " + strings.Join(parts, ", ") + ")"
	}
	if counts || "" != countBy {
		return name + " (" + strconv.Itoa(real) + ")"
	}
	return name
}

type viewGroup struct {
	id, name, title string
	nodes           []*graphNode
}

type viewEmitEdge struct {
	from, to, label string
}

func emitGraph(as string, groups []viewGroup, loose []*graphNode,
	edges []viewEmitEdge, columns map[string][]string) string {
	out := []string{}
	switch as {
	case "mermaid":
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "flowchart LR")
		for _, g := range groups {
			out = append(out, "  subgraph "+g.id+"[\""+esc(g.title)+"\"]")
			for _, n := range g.nodes {
				out = append(out, "    "+n.id+"[\""+esc(n.label)+"\"]")
			}
			out = append(out, "  end")
		}
		for _, n := range loose {
			out = append(out, "  "+n.id+"[\""+esc(n.label)+"\"]")
		}
		for _, d := range edges {
			out = append(out, "  "+d.from+" -->|\""+esc(d.label)+"\"| "+d.to)
		}
	case "dot":
		esc := func(s string) string { return viewEscape(s, dotEsc) }
		out = append(out, "digraph G {", "  rankdir=LR;", "  node [shape=box];")
		for _, g := range groups {
			out = append(out, "  subgraph cluster_"+g.id+" {", "    label=\""+esc(g.title)+"\";")
			for _, n := range g.nodes {
				out = append(out, "    "+n.id+" [label=\""+esc(n.label)+"\"];")
			}
			out = append(out, "  }")
		}
		for _, n := range loose {
			out = append(out, "  "+n.id+" [label=\""+esc(n.label)+"\"];")
		}
		for _, d := range edges {
			out = append(out, "  "+d.from+" -> "+d.to+" [label=\""+esc(d.label)+"\"];")
		}
		out = append(out, "}")
	default:
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "erDiagram")
		if nil != columns {
			all := []*graphNode{}
			for _, g := range groups {
				all = append(all, g.nodes...)
			}
			for _, n := range append(all, loose...) {
				attrs, has := columns[n.id]
				if !has {
					out = append(out, "  "+n.id+"[\""+esc(n.label)+"\"]")
					continue
				}
				out = append(out, "  "+n.id+"[\""+esc(n.label)+"\"] {")
				for _, a := range attrs {
					out = append(out, "    "+a)
				}
				out = append(out, "  }")
			}
		}
		for _, d := range edges {
			out = append(out, "  "+d.from+" }o--o{ "+d.to+" : \""+esc(d.label)+"\"")
		}
	}
	return strings.Join(out, "\n")
}

var viewAttrName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]*$`)
var viewCanonHead = regexp.MustCompile(`^[a-z]+`)

// viewErColumns is one ER attribute line per column, typed by the
// lattice: the value's own point, else the kind its canon starts with,
// else `any` and the column is counted as unplaced.
func viewErColumns(root Val, node *graphNode, field string, unplaced *[]string) ([]string, bool) {
	at := node.path + "." + field
	holder := anchorAt(root, at)
	if nil == holder {
		return nil, false
	}
	if _, isMap := throughDoc(holder).(*MapVal); !isMap {
		return nil, false
	}
	esc := func(s string) string { return viewEscape(s, mermaidEsc) }
	out := []string{}
	for _, entry := range docEntries(holder) {
		key := entry.key
		v := throughDoc(entry.child)
		canon := v.Canon()
		head := viewCanonHead.FindString(canon)
		fk := "" != v.linkAddr()
		_, isMap := v.(*MapVal)
		_, isList := v.(*ListVal)
		_, isTop := v.(*TopVal)
		typ := latticePoint(v)
		if isMap {
			typ = "map"
		} else if isList {
			typ = "list"
		} else if "" == typ {
			typ = "any"
			if containsString(latticeNodes, head) {
				typ = head
			}
		}
		if "any" == typ && !isTop {
			*unplaced = append(*unplaced, at+"."+key)
		}
		name := key
		if !viewAttrName.MatchString(key) || strings.HasPrefix(key, "q_") {
			name = "q_" + viewSpell(key, viewAlnum)
		}
		note := ""
		if name != key {
			note = key
		} else if !(fk || typ == canon || isMap || isList) {
			note = canon
			if 32 < viewLen(canon) {
				note = string([]rune(canon)[:29]) + "..."
			}
		}
		line := typ + " " + name
		if fk {
			line += " FK"
		}
		if "" != note {
			line += " \"" + esc(note) + "\""
		}
		out = append(out, line)
	}
	return out, true
}

type viewGraphOpts struct {
	relations          []string
	groupBy, label, as string
	members            []string
	ghosts             viewGhosts
	columns            string
	counts             bool
	countBy            string
	collapse           bool
}

func viewByLabel(ns []*graphNode) []*graphNode {
	sort.SliceStable(ns, func(i, j int) bool {
		if ns[i].label != ns[j].label {
			return ns[i].label < ns[j].label
		}
		return ns[i].path < ns[j].path
	})
	return ns
}

func viewKeep(triples []viewTriple, relations []string) ([]viewTriple, []VetFinding) {
	keys := viewKeys(triples)
	for _, r := range relations {
		if !contains(keys, r) {
			return nil, []VetFinding{viewRelationFinding(r, keys)}
		}
	}
	if 0 == len(relations) {
		return triples, nil
	}
	kept := []viewTriple{}
	for _, e := range triples {
		if contains(relations, e.key) {
			kept = append(kept, e)
		}
	}
	return kept, nil
}

func drawGraph(triples []viewTriple, decls map[string]*relDecl, root Val,
	o viewGraphOpts, max int, loss *[]ViewLoss) (string, []VetFinding) {
	kept, kerr := viewKeep(triples, o.relations)
	if nil != kerr {
		return "", kerr
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

	paths := viewGraphPaths(edges, o.members)
	if max < len(paths) {
		return "", []VetFinding{viewRowsFinding(len(paths), max, "--at or --relation", true)}
	}

	unresolved := []string{}
	nodes, nerr := viewGraphNodes(paths, root, o.groupBy, o.label, o.ghosts, &unresolved)
	if nil != nerr {
		return "", []VetFinding{*nerr}
	}
	// A ghost lives in another part, so no group of this one holds it.
	for _, n := range nodes {
		if n.ghost {
			n.group, n.grouped = "", false
		}
	}

	groupSeen := map[string]bool{}
	names := []string{}
	for _, n := range nodes {
		if n.grouped && !groupSeen[n.group] {
			groupSeen[n.group] = true
			names = append(names, n.group)
		}
	}
	sort.Strings(names)
	groups := []viewGroup{}
	for gi, g := range names {
		members := []*graphNode{}
		for _, n := range nodes {
			if n.grouped && n.group == g {
				members = append(members, n)
			}
		}
		members = viewByLabel(members)
		groups = append(groups, viewGroup{
			id: "g" + strconv.Itoa(gi), name: g,
			title: viewGroupTitle(g, members, root, o.counts || o.collapse, o.countBy, &unresolved),
			nodes: members,
		})
	}
	for _, g := range groups {
		if viewHasLineBreak(g.title) {
			return "", []VetFinding{viewLineBreakFinding(g.nodes[0].path)}
		}
	}
	loose := []*graphNode{}
	for _, n := range nodes {
		if !n.grouped {
			loose = append(loose, n)
		}
	}
	loose = viewByLabel(loose)
	emitted := []*graphNode{}
	for _, g := range groups {
		emitted = append(emitted, g.nodes...)
	}
	emitted = append(emitted, loose...)

	byPath := map[string]*graphNode{}
	for _, n := range nodes {
		byPath[n.path] = n
	}

	if o.collapse {
		viewUnresolvedLoss(unresolved, loss)
		return viewCollapseGraph(groups, loose, edges, byPath, o.as, loss), nil
	}

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

	var columns map[string][]string
	if "er" == o.as && "" != o.columns {
		columns = map[string][]string{}
		unplaced := []string{}
		for _, n := range emitted {
			if n.ghost {
				continue
			}
			if attrs, ok := viewErColumns(root, n, o.columns, &unplaced); ok {
				columns[n.id] = attrs
			} else {
				unresolved = append(unresolved, n.path+"."+o.columns)
			}
		}
		if 0 < len(unplaced) {
			*loss = append(*loss, ViewLoss{Code: "column_unplaced", Count: len(unplaced), Detail: unplaced})
		}
	}
	viewUnresolvedLoss(unresolved, loss)

	out := []viewEmitEdge{}
	for _, e := range drawn {
		out = append(out, viewEmitEdge{from: byPath[e.from].id, to: byPath[e.to].id, label: e.key})
	}
	return emitGraph(o.as, groups, loose, out, columns), nil
}

// viewCollapseGraph is THE SURFACE MAP: one node per group, titled with
// its count, and one edge per (group, relation, group) labelled with
// how many edges it stands for. An edge inside one group is not drawn,
// and is counted.
func viewCollapseGraph(groups []viewGroup, loose []*graphNode, edges []viewTriple,
	byPath map[string]*graphNode, as string, loss *[]ViewLoss) string {
	type place struct{ id, label string }
	home := map[string]place{}
	for _, g := range groups {
		for _, n := range g.nodes {
			home[n.path] = place{g.id, g.title}
		}
	}
	of := func(p string) (place, bool) {
		if h, ok := home[p]; ok {
			return h, true
		}
		return place{byPath[p].id, byPath[p].label}, false
	}
	type tally struct {
		from, to, key, order string
		n                    int
	}
	tallies := map[string]*tally{}
	keys := []string{}
	internal := 0
	for _, e := range edges {
		a, grouped := of(e.from)
		b, _ := of(e.to)
		if a.id == b.id && grouped {
			internal++
			continue
		}
		k := a.id + viewSep + e.key + viewSep + b.id
		if t, ok := tallies[k]; ok {
			t.n++
			continue
		}
		tallies[k] = &tally{from: a.id, to: b.id, key: e.key, n: 1,
			order: a.label + viewSep + b.label + viewSep + e.key}
		keys = append(keys, k)
	}
	if 0 < internal {
		*loss = append(*loss, ViewLoss{Code: "edges_internal", Count: internal})
	}
	sort.SliceStable(keys, func(i, j int) bool { return tallies[keys[i]].order < tallies[keys[j]].order })
	shown := []*graphNode{}
	for _, g := range groups {
		shown = append(shown, &graphNode{path: g.id, id: g.id, label: g.title})
	}
	shown = append(shown, loose...)
	out := []viewEmitEdge{}
	for _, k := range keys {
		t := tallies[k]
		out = append(out, viewEmitEdge{from: t.from, to: t.to, label: t.key + " (" + strconv.Itoa(t.n) + ")"})
	}
	var columns map[string][]string
	if "er" == as {
		columns = map[string][]string{}
	}
	return emitGraph(as, nil, shown, out, columns)
}

// ---------------------------------------------------------------------
// The lifecycle: states and the events between them

func drawState(triples []viewTriple, root Val, relations []string, labelField, as string,
	members []string, ghosts viewGhosts, roots []string, named bool, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	edges, kerr := viewKeep(triples, relations)
	if nil != kerr {
		return "", kerr
	}
	paths := viewGraphPaths(edges, members)
	if max < len(paths) {
		return "", []VetFinding{viewRowsFinding(len(paths), max, "--at or --relation", true)}
	}
	for _, r := range roots {
		if _, ghost := ghosts[r]; !contains(paths, r) || ghost {
			return "", []VetFinding{viewRootFinding(r, "", paths)}
		}
	}
	unresolved := []string{}
	nodes, nerr := viewGraphNodes(paths, root, "", labelField, ghosts, &unresolved)
	if nil != nerr {
		return "", []VetFinding{*nerr}
	}
	viewUnresolvedLoss(unresolved, loss)
	nodes = viewByLabel(nodes)
	byPath := map[string]*graphNode{}
	for _, n := range nodes {
		byPath[n.path] = n
	}

	// An initial state is one named as a root, or else one no other
	// state enters; a final state one that leaves to no other. A ghost is
	// neither: its own edges are drawn where it lives.
	initial, final := []*graphNode{}, []*graphNode{}
	for _, n := range nodes {
		if n.ghost {
			continue
		}
		entered, left := false, false
		for _, e := range edges {
			if e.to == n.path && e.from != n.path {
				entered = true
			}
			if e.from == n.path && e.to != n.path {
				left = true
			}
		}
		if (named && contains(roots, n.path)) || (!named && !entered) {
			initial = append(initial, n)
		}
		if !left {
			final = append(final, n)
		}
	}
	drawn := append([]viewTriple{}, edges...)
	sort.SliceStable(drawn, func(i, j int) bool {
		a, b := drawn[i], drawn[j]
		if byPath[a.from].label != byPath[b.from].label {
			return byPath[a.from].label < byPath[b.from].label
		}
		if a.key != b.key {
			return a.key < b.key
		}
		return byPath[a.to].label < byPath[b.to].label
	})

	out := []string{}
	if "mermaid" == as {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out = append(out, "stateDiagram-v2")
		for _, n := range nodes {
			out = append(out, "  state \""+esc(n.label)+"\" as "+n.id)
		}
		for _, n := range initial {
			out = append(out, "  [*] --> "+n.id)
		}
		for _, e := range drawn {
			out = append(out, "  "+byPath[e.from].id+" --> "+byPath[e.to].id+" : "+esc(e.key))
		}
		for _, n := range final {
			out = append(out, "  "+n.id+" --> [*]")
		}
	} else {
		for _, n := range initial {
			out = append(out, "[*] --> "+n.label)
		}
		for _, e := range drawn {
			out = append(out, byPath[e.from].label+" --"+e.key+"--> "+byPath[e.to].label)
		}
		for _, n := range final {
			out = append(out, n.label+" --> [*]")
		}
	}
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The swim lanes: a flow's steps, one lane per actor

type viewLaneOpts struct {
	relations          []string
	groupBy, label, as string
	layers             []string
	members            []string
	ghosts             viewGhosts
	counts             bool
	countBy            string
}

func drawLane(triples []viewTriple, root Val, o viewLaneOpts, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	if "" == o.groupBy {
		return "", []VetFinding{viewFinding("view_group_required", "reference", "$",
			"The swim lanes need the field that names each step's lane; name it with --group-by.", "")}
	}
	edges, kerr := viewKeep(triples, o.relations)
	if nil != kerr {
		return "", kerr
	}
	paths := viewGraphPaths(edges, o.members)
	if max < len(paths) {
		return "", []VetFinding{viewRowsFinding(len(paths), max, "--at or --relation", true)}
	}
	unresolved := []string{}
	nodes, nerr := viewGraphNodes(paths, root, o.groupBy, o.label, o.ghosts, &unresolved)
	if nil != nerr {
		return "", []VetFinding{*nerr}
	}
	byPath := map[string]*graphNode{}
	for _, n := range nodes {
		byPath[n.path] = n
	}

	// The steps in flow order: a step is placed once every step leading
	// to it is, least label first; a loop is entered at its least label,
	// and the edge that closes it runs back.
	waiting := viewByLabel(append([]*graphNode{}, nodes...))
	steps := []string{}
	placed := map[string]bool{}
	for len(steps) < len(paths) {
		free := ""
		for _, n := range waiting {
			if placed[n.path] {
				continue
			}
			ready := true
			for _, e := range edges {
				if e.to == n.path && e.from != n.path && !placed[e.from] {
					ready = false
					break
				}
			}
			if ready {
				free = n.path
				break
			}
		}
		if "" == free {
			for _, n := range waiting {
				if !placed[n.path] {
					free = n.path
					break
				}
			}
		}
		placed[free] = true
		steps = append(steps, free)
	}

	lane := func(n *graphNode) string {
		if n.grouped {
			return n.group
		}
		return "-"
	}
	seen := []string{}
	for _, p := range steps {
		if !contains(seen, lane(byPath[p])) {
			seen = append(seen, lane(byPath[p]))
		}
	}
	order := []string{}
	for _, g := range o.layers {
		if contains(seen, g) && !contains(order, g) {
			order = append(order, g)
		}
	}
	named := len(order)
	for _, g := range seen {
		if !contains(order[:named], g) && "-" != g {
			order = append(order, g)
		}
	}
	if contains(seen, "-") && !contains(order, "-") {
		order = append(order, "-")
	}
	lanes := []viewGroup{}
	for gi, g := range order {
		members := []*graphNode{}
		for _, p := range steps {
			if lane(byPath[p]) == g {
				members = append(members, byPath[p])
			}
		}
		lanes = append(lanes, viewGroup{id: "g" + strconv.Itoa(gi), name: g,
			title: viewGroupTitle(g, members, root, o.counts, o.countBy, &unresolved), nodes: members})
		if viewHasLineBreak(lanes[gi].title) {
			return "", []VetFinding{viewLineBreakFinding(members[0].path)}
		}
	}
	viewUnresolvedLoss(unresolved, loss)
	at := map[string]int{}
	for i, p := range steps {
		at[p] = i
	}
	drawn := append([]viewTriple{}, edges...)
	sort.SliceStable(drawn, func(i, j int) bool {
		a, b := drawn[i], drawn[j]
		if at[a.from] != at[b.from] {
			return at[a.from] < at[b.from]
		}
		if at[a.to] != at[b.to] {
			return at[a.to] < at[b.to]
		}
		return a.key < b.key
	})

	if "mermaid" == o.as {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out := []string{"flowchart LR"}
		for _, l := range lanes {
			out = append(out, "  subgraph "+l.id+"[\""+esc(l.title)+"\"]", "    direction LR")
			for _, n := range l.nodes {
				out = append(out, "    "+n.id+"[\""+esc(n.label)+"\"]")
			}
			out = append(out, "  end")
		}
		for _, e := range drawn {
			out = append(out, "  "+byPath[e.from].id+" -->|\""+esc(e.key)+"\"| "+byPath[e.to].id)
		}
		return strings.Join(out, "\n"), nil
	}

	// One row per lane and one column per step, so each step is alone in
	// its column and the grid needs no placement beyond the flow order.
	titles := []string{}
	for _, l := range lanes {
		titles = append(titles, l.title)
	}
	w := viewWidest(titles)
	cols := []int{}
	for i, p := range steps {
		c := viewLen(byPath[p].label)
		if d := len(strconv.Itoa(i + 1)); d > c {
			c = d
		}
		cols = append(cols, c)
	}
	trim := func(s string) string { return strings.TrimRight(s, " ") }
	head := []string{}
	for i := range steps {
		head = append(head, viewPad(strconv.Itoa(i+1), cols[i]))
	}
	out := []string{trim(viewPad("", w) + "  " + strings.Join(head, "  "))}
	for _, l := range lanes {
		cells := []string{}
		for i, p := range steps {
			cell := "."
			if lane(byPath[p]) == l.name {
				cell = byPath[p].label
			}
			cells = append(cells, viewPad(cell, cols[i]))
		}
		out = append(out, trim(viewPad(l.title, w)+"  "+strings.Join(cells, "  ")))
	}
	across, back := 0, 0
	notes := []string{}
	for _, e := range drawn {
		isAcross := lane(byPath[e.from]) != lane(byPath[e.to])
		isBack := at[e.to] <= at[e.from]
		if isAcross {
			across++
		}
		if isBack {
			back++
		}
		if isAcross || isBack {
			way := "across"
			if isBack {
				way = "back"
			}
			notes = append(notes, "# "+way+": "+byPath[e.from].label+" -> "+byPath[e.to].label+" ("+e.key+")")
		}
	}
	out = append(out, "# "+strconv.Itoa(len(drawn))+" edges, "+strconv.Itoa(across)+
		" across lanes, "+strconv.Itoa(back)+" back")
	out = append(out, notes...)
	return strings.Join(out, "\n"), nil
}

// ---------------------------------------------------------------------
// The sequence: who sends what to whom, in the order the steps list it

type viewMsg struct {
	a, b int
	text string
}

func drawSequence(list any, at, from, to, labelField, splitBy string, budget int,
	as string, max int, loss *[]ViewLoss, parts *[]ViewPart) (string, []VetFinding) {
	steps, isList := list.([]any)
	if !isList {
		return "", []VetFinding{viewFinding("view_steps_shape", "reference", at,
			at+" is not a list of steps.", "")}
	}
	splitting := "" != splitBy || 0 < budget
	if !splitting && max < len(steps) {
		return "", []VetFinding{viewRowsFinding(len(steps), max, "--steps", true)}
	}
	unresolved := []string{}
	type raw struct {
		a, b, text, part string
		parted           bool
	}
	msgs := []raw{}
	for i, step := range steps {
		where := at + "." + strconv.Itoa(i)
		fields, _ := step.(map[string]any)
		a, aok := fields[from].(string)
		b, bok := fields[to].(string)
		if !aok || !bok {
			return "", []VetFinding{viewFinding("view_steps_shape", "reference", where,
				"A step needs a string at "+from+" and at "+to+".", "")}
		}
		text := ""
		if "" != labelField {
			if t, ok := fields[labelField].(string); ok {
				text = t
			} else {
				unresolved = append(unresolved, where+"."+labelField)
			}
		}
		part, parted := "", false
		if "" != splitBy {
			if v, ok := fields[splitBy].(string); ok {
				part, parted = v, true
			} else {
				unresolved = append(unresolved, where+"."+splitBy)
			}
		}
		if viewHasLineBreak(a) || viewHasLineBreak(b) || viewHasLineBreak(text) ||
			viewHasLineBreak(part) {
			return "", []VetFinding{viewLineBreakFinding(where)}
		}
		msgs = append(msgs, raw{a, b, text, part, parted})
	}
	viewUnresolvedLoss(unresolved, loss)

	// Participants in order of first appearance; an address is shown by
	// its shortest unique suffix, as every other figure shows a node. A
	// part draws the participants of its own steps, in the same order.
	who := []string{}
	ix := map[string]int{}
	for _, m := range msgs {
		for _, p := range []string{m.a, m.b} {
			if _, ok := ix[p]; !ok {
				ix[p] = len(who)
				who = append(who, p)
			}
		}
	}
	addrs := []string{}
	for _, p := range who {
		if strings.HasPrefix(p, "$") {
			addrs = append(addrs, p)
		}
	}
	lab := shortLabels(addrs)
	name := func(p string) string {
		if l, ok := lab[p]; ok {
			return l
		}
		return p
	}

	render := func(steps []raw) string {
		mine := []string{}
		for _, p := range who {
			for _, m := range steps {
				if m.a == p || m.b == p {
					mine = append(mine, p)
					break
				}
			}
		}
		if "mermaid" == as {
			esc := func(s string) string { return viewEscape(s, mermaidEsc) }
			out := []string{"sequenceDiagram"}
			for _, p := range mine {
				out = append(out, "  participant p"+strconv.Itoa(ix[p])+" as "+esc(name(p)))
			}
			for _, m := range steps {
				line := "  p" + strconv.Itoa(ix[m.a]) + "->>p" + strconv.Itoa(ix[m.b]) + ":"
				if "" != m.text {
					line += " " + esc(m.text)
				}
				out = append(out, line)
			}
			return strings.Join(out, "\n")
		}
		local := map[string]int{}
		names := []string{}
		for i, p := range mine {
			local[p] = i
			names = append(names, name(p))
		}
		drawn := []viewMsg{}
		for _, m := range steps {
			drawn = append(drawn, viewMsg{local[m.a], local[m.b], m.text})
		}
		return viewSequenceText(names, drawn)
	}
	if !splitting {
		return render(msgs), nil
	}
	base := []viewRun[raw]{{numbered: true, items: msgs}}
	if "" != splitBy {
		names := []string{}
		for _, m := range msgs {
			if m.parted && !contains(names, m.part) {
				names = append(names, m.part)
			}
		}
		sort.Strings(names)
		base = []viewRun[raw]{}
		for _, n := range names {
			mine := []raw{}
			for _, m := range msgs {
				if m.parted && n == m.part {
					mine = append(mine, m)
				}
			}
			base = append(base, viewRun[raw]{name: n, items: mine})
		}
	}
	drawn := []ViewPart{}
	for _, part := range viewBudgeted(base, budget) {
		if max < len(part.items) {
			return "", []VetFinding{viewRowsFinding(len(part.items), max, "--steps", true)}
		}
		drawn = append(drawn, ViewPart{Name: part.name, Text: render(part.items)})
	}
	return viewJoinParts(as, drawn, parts)
}

// viewSequenceText is THE LIFELINE GRID. Lifeline i sits at column
// x[i]; each gap is wide enough for the name above it and for every
// message spanning it, the shortfall of a span going to its last gap,
// so the counts alone set the columns.
func viewSequenceText(names []string, msgs []viewMsg) string {
	n := len(names)
	if 0 == n {
		return ""
	}
	gap := []int{}
	for _, s := range names {
		g := viewLen(s) + 2
		if 3 > g {
			g = 3
		}
		gap = append(gap, g)
	}
	xsOf := func() []int {
		xs := []int{0}
		for i := 1; i < n; i++ {
			xs = append(xs, xs[i-1]+gap[i-1])
		}
		return xs
	}
	type span struct{ lo, hi, need int }
	spans := []span{}
	for _, m := range msgs {
		s := span{m.a, m.a + 1, viewLen(m.text) + 6}
		if m.a != m.b {
			lo, hi := m.a, m.b
			if lo > hi {
				lo, hi = hi, lo
			}
			s = span{lo, hi, viewLen(m.text) + 5}
		}
		if s.hi < n {
			spans = append(spans, s)
		}
	}
	sort.SliceStable(spans, func(i, j int) bool {
		if spans[i].hi != spans[j].hi {
			return spans[i].hi < spans[j].hi
		}
		return spans[i].lo < spans[j].lo
	})
	for _, s := range spans {
		xs := xsOf()
		if short := s.need - (xs[s.hi] - xs[s.lo]); 0 < short {
			gap[s.hi-1] += short
		}
	}
	xs := xsOf()
	extra := 0
	for _, m := range msgs {
		if m.a == m.b && m.a == n-1 && viewLen(m.text)+5 > extra {
			extra = viewLen(m.text) + 5
		}
	}
	width := xs[n-1] + 1 + extra
	if last := xs[n-1] + viewLen(names[n-1]); last > width {
		width = last
	}
	blank := func() []rune {
		row := []rune(strings.Repeat(" ", width))
		for _, c := range xs {
			row[c] = '│'
		}
		return row
	}
	put := func(row []rune, at int, s string) {
		for i, ch := range []rune(s) {
			row[at+i] = ch
		}
	}
	line := func(row []rune) string { return strings.TrimRight(string(row), " ") }
	head := []rune(strings.Repeat(" ", width))
	for i, s := range names {
		put(head, xs[i], s)
	}
	out := []string{line(head), line(blank())}
	for _, m := range msgs {
		label := ""
		if "" != m.text {
			label = " " + m.text + " "
		}
		if m.a == m.b {
			top, back := blank(), blank()
			put(top, xs[m.a], "├─"+label+"─┐")
			put(back, xs[m.a], "│◄"+strings.Repeat("─", viewLen(label)+1)+"┘")
			out = append(out, line(top), line(back))
			continue
		}
		row := blank()
		lo, hi := m.a, m.b
		if lo > hi {
			lo, hi = hi, lo
		}
		length := xs[hi] - xs[lo] - 1
		if m.a < m.b {
			body := "─" + label
			put(row, xs[lo], "├"+body+strings.Repeat("─", length-viewLen(body)-1)+"►")
		} else {
			body := "◄─" + label
			put(row, xs[lo]+1, body+strings.Repeat("─", length-viewLen(body)))
			row[xs[hi]] = '┤'
		}
		out = append(out, line(row))
	}
	out = append(out, line(blank()))
	return strings.Join(out, "\n")
}

// ---------------------------------------------------------------------
// The treemap: the model's bulk, nested

type viewTile struct {
	name   string
	weight int
	kids   []*viewTile
}

const viewTreemapBar = 40

// viewLeafWeight is the scalar leaves under a node, however deep.
func viewLeafWeight(v Val) int {
	entries := docEntries(v)
	if 0 == len(entries) {
		switch throughDoc(v).(type) {
		case *MapVal, *ListVal:
			return 0
		}
		return 1
	}
	w := 0
	for _, e := range entries {
		w += viewLeafWeight(throughDoc(e.child))
	}
	return w
}

// viewSafeMax is the largest whole number both ports hold exactly.
const viewSafeMax = 1<<53 - 1

// viewWhole is a value's non-negative whole number, if it is one.
func viewWhole(v Val) (int, bool) {
	sv, ok := throughDoc(v).(*ScalarVal)
	if !ok {
		return 0, false
	}
	switch n := sv.peg.(type) {
	case int64:
		return int(n), 0 <= n && n <= viewSafeMax
	case float64:
		return int(n), 0 <= n && n <= viewSafeMax && n == math.Trunc(n)
	}
	return 0, false
}

// viewTreemapOpts is what a treemap's tiles are built from; `only`, when
// given, keeps the items (the anchor's children, or the members) a part
// holds.
type viewTreemapOpts struct {
	at, groupBy, size string
	depth             int
	members           []string
	selected          bool
	only              []string
}

// viewTreemapTop is the tiles of a treemap, pruned of what weighs
// nothing.
func viewTreemapTop(root Val, o viewTreemapOpts, loss *[]ViewLoss) (*viewTile, *VetFinding) {
	at := o.at
	if "" == at {
		at = "$"
	}
	anchor := anchorAt(root, at)
	if nil == anchor {
		f := viewFinding("no_path", "reference", at,
			"The path "+at+" names nothing in this document.", "")
		return nil, &f
	}
	unresolved := []string{}
	weigh := func(path string, v Val) int {
		if "" == o.size {
			return viewLeafWeight(v)
		}
		field := anchorAt(root, path+"."+o.size)
		if nil != field {
			if n, ok := viewWhole(field); ok {
				return n
			}
		}
		unresolved = append(unresolved, path+"."+o.size)
		return 0
	}
	// With --size, a node holding the field is a tile weighed by it.
	holds := func(path string) bool {
		return "" != o.size && nil != anchorAt(root, path+"."+o.size)
	}
	kept := func(path string) bool {
		return nil == o.only || contains(o.only, path)
	}
	var tile func(path string, v Val, depth int, first bool) *viewTile
	tile = func(path string, v Val, depth int, first bool) *viewTile {
		entries := []docEntry{}
		for _, e := range docEntries(v) {
			if !first || kept(path+"."+e.key) {
				entries = append(entries, e)
			}
		}
		name := path[strings.LastIndex(path, ".")+1:]
		if 0 == depth || 0 == len(entries) || holds(path) {
			return &viewTile{name: name, weight: weigh(path, v)}
		}
		t := &viewTile{name: name}
		for _, e := range entries {
			k := tile(path+"."+e.key, throughDoc(e.child), depth-1, false)
			t.kids = append(t.kids, k)
			t.weight += k.weight
		}
		return t
	}

	// The items: the members asked for, or the anchor's children.
	all := o.members
	if !o.selected {
		all = []string{}
		for _, e := range docEntries(anchor) {
			all = append(all, at+"."+e.key)
		}
	}
	items := []string{}
	for _, p := range all {
		if kept(p) {
			items = append(items, p)
		}
	}
	var top *viewTile
	if "" == o.groupBy && !o.selected {
		depth := o.depth
		if 0 == depth {
			depth = viewDefaultDocDepth
		}
		top = tile(at, anchor, depth, true)
		top.name = at
	} else {
		labels := shortLabels(items)
		type leaf struct {
			tile  *viewTile
			group string
		}
		leaves := []leaf{}
		for _, p := range items {
			l := leaf{tile: &viewTile{name: labels[p], weight: weigh(p, anchorAt(root, p))}}
			if "" != o.groupBy {
				g, ok := viewFieldOf(root, p, o.groupBy)
				if !ok {
					unresolved = append(unresolved, p+"."+o.groupBy)
					g = "-"
				}
				l.group = g
			}
			leaves = append(leaves, l)
		}
		kids := []*viewTile{}
		if "" == o.groupBy {
			for _, l := range leaves {
				kids = append(kids, l.tile)
			}
		} else {
			names := []string{}
			for _, l := range leaves {
				if !contains(names, l.group) {
					names = append(names, l.group)
				}
			}
			sort.Strings(names)
			for _, g := range names {
				t := &viewTile{name: g}
				for _, l := range leaves {
					if l.group == g {
						t.kids = append(t.kids, l.tile)
						t.weight += l.tile.weight
					}
				}
				kids = append(kids, t)
			}
		}
		top = &viewTile{name: at, kids: kids}
		for _, k := range kids {
			top.weight += k.weight
		}
	}
	viewUnresolvedLoss(unresolved, loss)

	// A tile that weighs nothing has no area to draw, and is counted.
	empty := 0
	var prune func(t *viewTile)
	prune = func(t *viewTile) {
		kept := []*viewTile{}
		for _, k := range t.kids {
			if 0 == k.weight {
				empty++
				continue
			}
			kept = append(kept, k)
		}
		t.kids = kept
		for _, k := range kept {
			prune(k)
		}
	}
	prune(top)
	if 0 < empty {
		*loss = append(*loss, ViewLoss{Code: "treemap_empty", Count: empty})
	}
	return top, nil
}

// viewTreemapFigure is a treemap drawn from its top tile. A part below
// the top is drawn as one section, so Mermaid shows where it sits.
func viewTreemapFigure(top *viewTile, at, as, style string, max int,
	wrap bool) (string, []VetFinding) {
	type row struct {
		prefix, name string
		weight       int
	}
	rows := []row{}
	var walk func(t *viewTile, prefix, kidPrefix string)
	walk = func(t *viewTile, prefix, kidPrefix string) {
		rows = append(rows, row{prefix, t.name, t.weight})
		for i, k := range t.kids {
			if i == len(t.kids)-1 {
				walk(k, kidPrefix+"└── ", kidPrefix+"    ")
			} else {
				walk(k, kidPrefix+"├── ", kidPrefix+"│   ")
			}
		}
	}
	walk(top, "", "")
	if max < len(rows) {
		return "", []VetFinding{viewRowsFinding(len(rows), max, "--at or --depth", true)}
	}
	for _, r := range rows {
		if viewHasLineBreak(r.name) {
			return "", []VetFinding{viewLineBreakFinding(at)}
		}
	}

	if "mermaid" == as {
		esc := func(s string) string { return viewEscape(s, mermaidEsc) }
		out := []string{"treemap-beta"}
		var emit func(t *viewTile, depth int)
		emit = func(t *viewTile, depth int) {
			ind := strings.Repeat("    ", depth)
			if 0 == len(t.kids) {
				out = append(out, ind+"\""+esc(t.name)+"\": "+strconv.Itoa(t.weight))
				return
			}
			out = append(out, ind+"\""+esc(t.name)+"\"")
			for _, k := range t.kids {
				emit(k, depth+1)
			}
		}
		tops := top.kids
		if wrap || (0 == len(top.kids) && 0 < top.weight) {
			tops = []*viewTile{top}
		}
		for _, k := range tops {
			emit(k, 0)
		}
		return strings.Join(out, "\n"), nil
	}
	paint := newPainter(style)
	total := top.weight
	heads, weights := []string{}, []string{}
	for _, r := range rows {
		heads = append(heads, r.prefix+r.name)
		weights = append(weights, strconv.Itoa(r.weight))
	}
	w, nw := viewWidest(heads), viewWidest(weights)
	out := []string{}
	for _, r := range rows {
		bar := 0
		if 0 != total {
			bar = r.weight * viewTreemapBar / total
			if 1 > bar {
				bar = 1
			}
		}
		out = append(out, paint.paint("rule", r.prefix)+r.name+
			strings.Repeat(" ", w-viewLen(r.prefix+r.name))+"  "+
			viewLpad(strconv.Itoa(r.weight), nw)+"  "+paint.paint("bar", strings.Repeat("█", bar)))
	}
	return strings.Join(out, "\n"), nil
}

func drawTreemap(root Val, at string, depth int, groupBy, size string, members []string,
	selected bool, as, style string, max int, loss *[]ViewLoss) (string, []VetFinding) {
	top, ferr := viewTreemapTop(root, viewTreemapOpts{at: at, depth: depth, groupBy: groupBy,
		size: size, members: members, selected: selected}, loss)
	if nil != ferr {
		return "", []VetFinding{*ferr}
	}
	if "" == at {
		at = "$"
	}
	return viewTreemapFigure(top, at, as, style, max, false)
}

// ---------------------------------------------------------------------
// The split of a figure drawn as a tree of rows: the document and the
// treemap

// viewHBase is a part of a row tree before its budget: the anchor's
// children it keeps. A viewHPart adds the chain of names below the
// anchor that the kept children hang from.
type viewHBase struct {
	name     string
	numbered bool
	top      *viewTile
	keys     []string
}

type viewHPart struct {
	viewHBase
	chain []string
}

func viewHRows(n *viewTile) int {
	r := 1
	for _, k := range n.kids {
		r += viewHRows(k)
	}
	return r
}

// viewDocTree is the document's own rows as a tree: depth levels of key
// below v.
func viewDocTree(v Val, name string, depth int) *viewTile {
	t := &viewTile{name: name}
	if 0 == depth {
		return t
	}
	for _, e := range docEntries(v) {
		t.kids = append(t.kids, viewDocTree(throughDoc(e.child), e.key, depth-1))
	}
	return t
}

// viewHBases is the bases a row tree divides into without a field: one
// per child, or the whole.
func viewHBases(top *viewTile, splitRoots bool) []viewHBase {
	keys := []string{}
	for _, k := range top.kids {
		keys = append(keys, k.name)
	}
	out := []viewHBase{}
	if splitRoots {
		for _, k := range keys {
			out = append(out, viewHBase{name: k, top: top, keys: []string{k}})
		}
		return out
	}
	return append(out, viewHBase{numbered: true, top: top, keys: keys})
}

// viewPackRows packs each base into parts of at most budget rows below
// their anchor: whole subtrees side by side, and a subtree too big for
// one part opened, its children packed under it in turn.
func viewPackRows(bases []viewHBase, budget int) []viewHPart {
	out := []viewHPart{}
	for _, b := range bases {
		if 0 == budget {
			out = append(out, viewHPart{viewHBase: b, chain: []string{}})
			continue
		}
		type unit struct {
			chain []string
			node  *viewTile
		}
		units := []unit{}
		var add func(chain []string, node *viewTile)
		add = func(chain []string, node *viewTile) {
			if viewHRows(node) <= budget {
				units = append(units, unit{chain, node})
				return
			}
			for _, k := range node.kids {
				add(append(append([]string{}, chain...), node.name), k)
			}
		}
		for _, k := range b.top.kids {
			if contains(b.keys, k.name) {
				add([]string{}, k)
			}
		}
		type pack struct {
			chain, keys []string
			used        int
		}
		packs := []*pack{}
		for _, u := range units {
			r := viewHRows(u.node)
			if 0 < len(packs) {
				last := packs[len(packs)-1]
				if last.used+r <= budget &&
					strings.Join(last.chain, "\x00") == strings.Join(u.chain, "\x00") {
					last.keys = append(last.keys, u.node.name)
					last.used += r
					continue
				}
			}
			packs = append(packs, &pack{chain: u.chain, keys: []string{u.node.name}, used: r})
		}
		for i, p := range packs {
			name := b.name
			if b.numbered {
				name = strconv.Itoa(i + 1)
			} else if 1 != len(packs) {
				name = b.name + "." + strconv.Itoa(i+1)
			}
			out = append(out, viewHPart{
				viewHBase: viewHBase{name: name, top: b.top, keys: p.keys}, chain: p.chain,
			})
		}
	}
	return out
}

func drawDocParts(root Val, o *ViewOptions, as, style string, max int,
	loss *[]ViewLoss, parts *[]ViewPart) (string, []VetFinding) {
	if _, werr := drawDoc(root, o.At, o.Depth, nil, nil, as, style, math.MaxInt, loss); nil != werr {
		return "", werr
	}
	at := o.At
	if "" == at {
		at = "$"
	}
	depth := o.Depth
	if 0 == depth {
		depth = viewDefaultDocDepth
	}
	top := viewDocTree(anchorAt(root, at), at, depth)
	bases := viewHBases(top, o.SplitRoots)
	if "" != o.SplitBy {
		keys := []string{}
		for _, k := range top.kids {
			keys = append(keys, k.name)
		}
		names, of := viewGroupedBy(keys, func(k string) string { return at + "." + k },
			o.SplitBy, root, loss)
		bases = []viewHBase{}
		for _, n := range names {
			bases = append(bases, viewHBase{name: n, top: top, keys: of[n]})
		}
	}
	cut := viewPackRows(bases, o.Budget)
	drawn := []ViewPart{}
	for _, part := range cut {
		if viewHasLineBreak(part.name) {
			return "", []VetFinding{viewLineBreakFinding(at + "." + part.keys[0])}
		}
		text, perr := drawDoc(root, at, depth-len(part.chain), part.chain, part.keys,
			as, style, max, &[]ViewLoss{})
		if nil != perr {
			return "", perr
		}
		drawn = append(drawn, ViewPart{Name: part.name, Text: text})
	}
	return viewJoinParts(as, drawn, parts)
}

func drawTreemapParts(root Val, o *ViewOptions, members []string, selected bool,
	as, style string, max int, loss *[]ViewLoss, parts *[]ViewPart) (string, []VetFinding) {
	tm := viewTreemapOpts{at: o.At, depth: o.Depth, groupBy: o.GroupBy, size: o.Size,
		members: members, selected: selected}
	if _, werr := drawTreemap(root, o.At, o.Depth, o.GroupBy, o.Size, members, selected,
		as, style, math.MaxInt, loss); nil != werr {
		return "", werr
	}
	at := o.At
	if "" == at {
		at = "$"
	}
	top, _ := viewTreemapTop(root, tm, &[]ViewLoss{})
	bases := viewHBases(top, o.SplitRoots)
	if "" != o.SplitBy {
		// A part by a field is the treemap of the items holding its
		// value, grouped and weighed afresh.
		items := members
		if !selected {
			items = []string{}
			for _, e := range docEntries(anchorAt(root, at)) {
				items = append(items, at+"."+e.key)
			}
		}
		names, of := viewGroupedBy(items, func(p string) string { return p }, o.SplitBy, root, loss)
		bases = []viewHBase{}
		for _, n := range names {
			only := tm
			only.only = of[n]
			mine, _ := viewTreemapTop(root, only, &[]ViewLoss{})
			keys := []string{}
			for _, k := range mine.kids {
				keys = append(keys, k.name)
			}
			bases = append(bases, viewHBase{name: n, top: mine, keys: keys})
		}
	}
	drawn := []ViewPart{}
	for _, part := range viewPackRows(bases, o.Budget) {
		if viewHasLineBreak(part.name) {
			return "", []VetFinding{viewLineBreakFinding(at)}
		}
		node := part.top
		for _, name := range part.chain {
			for _, k := range node.kids {
				if k.name == name {
					node = k
					break
				}
			}
		}
		section := &viewTile{name: strings.Join(append([]string{part.top.name}, part.chain...), ".")}
		for _, k := range node.kids {
			if contains(part.keys, k.name) {
				section.kids = append(section.kids, k)
				section.weight += k.weight
			}
		}
		text, perr := viewTreemapFigure(section, at, as, style, max, 0 < len(part.chain))
		if nil != perr {
			return "", perr
		}
		drawn = append(drawn, ViewPart{Name: part.name, Text: text})
	}
	return viewJoinParts(as, drawn, parts)
}

// ---------------------------------------------------------------------
// Selection by membership, and the split into parts

type viewSelection struct {
	triples  []viewTriple
	members  []string
	selected bool
	ghosts   viewGhosts
}

func viewSelectMembers(triples []viewTriple, of, member string, ghosts bool,
	loss *[]ViewLoss) (viewSelection, *VetFinding) {
	// The members of a node are what it, or any node under it, links
	// to: a map of groups selects every group's members.
	out := []viewTriple{}
	links := []viewTriple{}
	for _, e := range triples {
		if viewUnder(e.from, of) {
			out = append(out, e)
			if "" == member || e.key == member {
				links = append(links, e)
			}
		}
	}
	if 0 == len(links) {
		have := viewKeys(out)
		msg := of + " links to nothing, so it has no members to draw."
		if "" != member {
			msg = of + " has no links under " + member + "."
		}
		note := ""
		if 0 < len(have) {
			note = "its links: " + strings.Join(have, ", ")
		}
		f := viewFinding("view_members_none", "reference", of, msg, note)
		return viewSelection{}, &f
	}
	inside := map[string]bool{}
	members := []string{}
	for _, e := range links {
		if !inside[e.to] {
			inside[e.to] = true
			members = append(members, e.to)
		}
	}
	sort.Strings(members)
	kept := []viewTriple{}
	away := viewGhosts{}
	outside := 0
	for _, e := range triples {
		if viewUnder(e.from, of) {
			continue
		}
		a, b := inside[e.from], inside[e.to]
		if a && b {
			kept = append(kept, e)
		} else if a || b {
			outside++
			if ghosts {
				kept = append(kept, e)
				if a {
					away[e.to] = ""
				} else {
					away[e.from] = ""
				}
			}
		}
	}
	if 0 < outside && !ghosts {
		*loss = append(*loss, ViewLoss{Code: "edges_outside", Count: outside})
	}
	return viewSelection{triples: kept, members: members, selected: true, ghosts: away}, nil
}

type viewPartNodes struct {
	name  string
	nodes []string
}

// viewSplitModes is how each kind divides. A kind missing here does not
// divide at all.
var viewSplitModes = []struct {
	kind  string
	modes []string
}{
	{"graph", []string{"by", "roots", "budget"}},
	{"state", []string{"by", "roots", "budget"}},
	{"lane", []string{"by", "roots", "budget"}},
	{"tree", []string{"by", "roots", "budget"}},
	{"matrix", []string{"by", "roots", "budget"}},
	{"layer", []string{"by", "roots", "budget"}},
	{"doc", []string{"by", "roots", "budget"}},
	{"treemap", []string{"by", "roots", "budget"}},
	{"sequence", []string{"by", "budget"}},
	{"sets", []string{"budget"}},
	{"layers", []string{"budget"}},
}

var viewSplitFlag = map[string]string{
	"by": "--split-by", "roots": "--split-roots", "budget": "--budget",
}

// viewEdgeKinds are the kinds drawn from the links, which divide by
// node and draw a ghost for what lives elsewhere.
var viewEdgeKinds = []string{"graph", "state", "lane", "tree", "matrix", "layer"}

func viewSplitRefusal(kind string, o *ViewOptions) *VetFinding {
	modes := []string{}
	kinds := []string{}
	for _, m := range viewSplitModes {
		kinds = append(kinds, m.kind)
		if m.kind == kind {
			modes = m.modes
		}
	}
	asked := []struct {
		mode string
		on   bool
		how  string
	}{
		{"by", "" != o.SplitBy, "by a field"},
		{"roots", o.SplitRoots, "by root"},
		{"budget", 0 < o.Budget, "by a budget"},
	}
	for _, a := range asked {
		if !a.on || contains(modes, a.mode) {
			continue
		}
		if 0 == len(modes) {
			f := viewFinding("view_split_kind", "reference", "$",
				"The "+kind+" figure cannot be split into parts.",
				"kinds that split: "+strings.Join(kinds, ", "))
			return &f
		}
		flags := []string{}
		for _, m := range modes {
			flags = append(flags, viewSplitFlag[m])
		}
		f := viewFinding("view_split_kind", "reference", "$",
			"The "+kind+" figure cannot be split "+a.how+".",
			"the "+kind+" figure splits with: "+strings.Join(flags, ", "))
		return &f
	}
	return nil
}

func viewSplits(o *ViewOptions) bool {
	return "" != o.SplitBy || o.SplitRoots || 0 < o.Budget
}

func viewSplitParts(sel viewSelection, root Val, o *ViewOptions, loss *[]ViewLoss) []viewPartNodes {
	all := []string{}
	for _, p := range viewGraphPaths(sel.triples, sel.members) {
		if _, ghost := sel.ghosts[p]; !ghost {
			all = append(all, p)
		}
	}
	inner := map[string]bool{}
	for _, p := range all {
		inner[p] = true
	}
	labels := shortLabels(all)
	byLabel := func(ps []string) {
		sort.SliceStable(ps, func(i, j int) bool { return labels[ps[i]] < labels[ps[j]] })
	}
	sorted := append([]string{}, all...)
	byLabel(sorted)
	parts := []viewPartNodes{}
	numbered := false

	if "" != o.SplitBy {
		names, of := viewGroupedBy(sorted, func(p string) string { return p }, o.SplitBy, root, loss)
		for _, name := range names {
			parts = append(parts, viewPartNodes{name: name, nodes: of[name]})
		}
	} else {
		// Each root takes what it reaches that no earlier root took, in
		// breadth-first order; what no root reaches (a cycle with no way
		// in) is taken from its least label in the same way.
		succ := map[string][]string{}
		entered := map[string]bool{}
		for _, e := range sel.triples {
			if inner[e.from] && inner[e.to] && e.from != e.to {
				succ[e.from] = append(succ[e.from], e.to)
				entered[e.to] = true
			}
		}
		for _, list := range succ {
			byLabel(list)
		}
		taken := map[string]bool{}
		claim := func(start string) {
			nodes := []string{}
			queue := []string{start}
			taken[start] = true
			for 0 < len(queue) {
				p := queue[0]
				queue = queue[1:]
				nodes = append(nodes, p)
				for _, q := range succ[p] {
					if !taken[q] {
						taken[q] = true
						queue = append(queue, q)
					}
				}
			}
			parts = append(parts, viewPartNodes{name: labels[start], nodes: nodes})
		}
		for _, p := range sorted {
			if !entered[p] {
				claim(p)
			}
		}
		for _, p := range sorted {
			if !taken[p] {
				claim(p)
			}
		}
		// A budget alone cuts the walk itself, so a part holds nodes that
		// reach each other wherever the budget allows.
		if !o.SplitRoots {
			flat := []string{}
			for _, p := range parts {
				flat = append(flat, p.nodes...)
			}
			parts, numbered = []viewPartNodes{{nodes: flat}}, true
		}
	}

	runs := []viewRun[string]{}
	for _, p := range parts {
		runs = append(runs, viewRun[string]{name: p.name, numbered: numbered, items: p.nodes})
	}
	cut := []viewPartNodes{}
	for _, r := range viewBudgeted(runs, o.Budget) {
		cut = append(cut, viewPartNodes{name: r.name, nodes: r.items})
	}
	return cut
}

// viewPartSelection is one part's own selection: its nodes, every edge
// touching one of them, and the far end of an edge that leaves the
// part drawn as a ghost naming the part it lives in.
func viewPartSelection(sel viewSelection, parts []viewPartNodes, part viewPartNodes) viewSelection {
	home := map[string]string{}
	for _, p := range parts {
		for _, n := range p.nodes {
			home[n] = p.name
		}
	}
	mine := map[string]bool{}
	for _, n := range part.nodes {
		mine[n] = true
	}
	ghosts := viewGhosts{}
	triples := []viewTriple{}
	for _, e := range sel.triples {
		if !mine[e.from] && !mine[e.to] {
			continue
		}
		triples = append(triples, e)
		for _, end := range []string{e.from, e.to} {
			if !mine[end] {
				ghosts[end] = home[end]
			}
		}
	}
	return viewSelection{triples: triples, members: part.nodes, selected: true, ghosts: ghosts}
}

// ViewPartToken is the token a split figure's file name carries,
// replaced by each part's name made safe for a file system.
const ViewPartToken = "{part}"

var viewOnlyDots = regexp.MustCompile(`^\.*$`)

// ViewPartFile is the file one part is written to. Letters, digits,
// `.` and `-` stand, and a name of dots alone is spelled in full, so
// distinct part names never share a file.
func ViewPartFile(out, name string) string {
	safe := viewSpell(name, func(c rune) bool { return viewAlnum(c) || '.' == c || '-' == c })
	if viewOnlyDots.MatchString(name) {
		safe = viewSpell(name, func(c rune) bool { return '.' != c })
	}
	return strings.ReplaceAll(out, ViewPartToken, safe)
}

// ViewSplits says whether these options cut the figure into parts.
func ViewSplits(o *ViewOptions) bool { return viewSplits(o) }

// viewPartHead is the comment a part opens with when every part is
// printed together.
func viewPartHead(as, name string) string {
	switch as {
	case "svg":
		return "<!-- part: " + name + " -->"
	case "dot":
		return "// part: " + name
	case "text":
		return "# part: " + name
	}
	return "%% part: " + name
}

// viewJoinParts hands the parts to the report and answers them printed
// together. Parts sharing a name would be written to one file, so the
// split is refused: a run of a part divided by --budget is named
// `name.n`, which another part's value may already be.
func viewJoinParts(as string, parts []ViewPart, into *[]ViewPart) (string, []VetFinding) {
	names := []string{}
	for _, p := range parts {
		names = append(names, p.Name)
	}
	for i, n := range names {
		if contains(names[:i], n) {
			return "", []VetFinding{viewFinding("view_part_names", "reference", "$",
				"Two parts of the figure are both named "+n+".",
				"parts: "+strings.Join(names, ", "))}
		}
	}
	texts := []string{}
	for _, p := range parts {
		*into = append(*into, p)
		texts = append(texts, viewPartHead(as, p.Name)+"\n"+p.Text)
	}
	return strings.Join(texts, "\n\n"), nil
}

// viewBudgeted cuts each part into runs of at most budget items: a
// numbered part (the whole figure, divided by budget alone) numbers its
// runs, and a named one, even one named by an empty value, keeps its
// name while it fits.
func viewBudgeted[T any](parts []viewRun[T], budget int) []viewRun[T] {
	if 0 == budget {
		return parts
	}
	out := []viewRun[T]{}
	for _, part := range parts {
		n := (len(part.items) + budget - 1) / budget
		for i := 0; i < n; i++ {
			name := part.name
			if part.numbered {
				name = strconv.Itoa(i + 1)
			} else if 1 != n {
				name = part.name + "." + strconv.Itoa(i+1)
			}
			end := (i + 1) * budget
			if end > len(part.items) {
				end = len(part.items)
			}
			out = append(out, viewRun[T]{name: name, items: part.items[i*budget : end]})
		}
	}
	return out
}

type viewRun[T any] struct {
	name     string
	numbered bool
	items    []T
}

// viewGroupedBy is items grouped by the value of a field each holds, the
// values in code-point order; an item without it is counted, and in no
// group.
func viewGroupedBy(items []string, path func(string) string, field string,
	root Val, loss *[]ViewLoss) ([]string, map[string][]string) {
	unresolved := []string{}
	of := map[string][]string{}
	names := []string{}
	for _, item := range items {
		v, ok := viewFieldOf(root, path(item), field)
		if !ok {
			unresolved = append(unresolved, path(item)+"."+field)
			continue
		}
		if _, seen := of[v]; !seen {
			names = append(names, v)
		}
		of[v] = append(of[v], item)
	}
	viewAddUnresolved(loss, unresolved)
	sort.Strings(names)
	return names, of
}

// viewAddUnresolved joins the paths a split field leaves unresolved to
// the row the figure already wrote, so one code is one row.
func viewAddUnresolved(loss *[]ViewLoss, paths []string) {
	for i := range *loss {
		row := &(*loss)[i]
		if "unresolved_field" == row.Code {
			seen := map[string]bool{}
			all := []string{}
			for _, d := range append(append([]string{}, row.Detail...), paths...) {
				if !seen[d] {
					seen[d] = true
					all = append(all, d)
				}
			}
			sort.Strings(all)
			row.Detail, row.Count = all, len(all)
			return
		}
	}
	viewUnresolvedLoss(paths, loss)
}
