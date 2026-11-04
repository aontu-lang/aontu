/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


import (
	"sort"
	"strings"
)

const (
	svgCH  = 8
	svgLH  = 20
	svgPAD = 8
)

var svgEsc = map[rune]string{
	'"': "&quot;", '&': "&amp;", '<': "&lt;", '>': "&gt;",
}

const svgStyle = "<style>" +
	".av{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}" +
	".av-t{fill:var(--av-ink,#1f2328)}" +
	".av-m{fill:var(--av-muted,#6e7781)}" +
	".av-box{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule,#8c959f);stroke-width:1}" +
	".av-cell{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}" +
	".av-direct{fill:var(--av-ink,#1f2328);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}" +
	".av-closure{fill:var(--av-closure,#9ec5fe);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}" +
	".av-unmirrored{fill:var(--av-warn,#e3b341);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}" +
	".av-line{stroke:var(--av-rule,#8c959f);stroke-width:1;fill:none}" +
	".av-up{stroke:var(--av-alert,#d1242f);stroke-width:1.5;fill:none;stroke-dasharray:4 3}" +
	".av-dot{fill:var(--av-ink,#1f2328)}" +
	".av-hole{fill:var(--av-bg,#f6f8fa);stroke:var(--av-rule-faint,#d0d7de);stroke-width:1}" +
	".av-bar{fill:var(--av-bar,#57606a)}" +
	"</style>"

func viewSvgEsc(s string) string { return viewEscape(s, svgEsc) }

func svgDoc(w, h int, about string, parts []string, style string) string {
	all := []string{
		"<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"av\" viewBox=\"0 0 " +
			itoa(w) + " " + itoa(h) + "\" width=\"" + itoa(w) + "\" height=\"" + itoa(h) +
			"\" role=\"img\" aria-label=\"" + viewSvgEsc(about) + "\">",
	}
	if "css" == style {
		all = append(all, svgStyle)
	}
	all = append(all, parts...)
	all = append(all, "</svg>")
	return strings.Join(all, "\n")
}

// svgText is a text run at a baseline; `anchor` is SVG's own
// vocabulary, and empty for the default.
func svgText(x, y int, cls, text, anchor string) string {
	a := ""
	if "" != anchor {
		a = " text-anchor=\"" + anchor + "\""
	}
	return "<text x=\"" + itoa(x) + "\" y=\"" + itoa(y) + "\" class=\"" + cls + "\"" + a +
		">" + viewSvgEsc(text) + "</text>"
}

func svgRect(x, y, w, h int, cls string) string {
	return "<rect x=\"" + itoa(x) + "\" y=\"" + itoa(y) + "\" width=\"" + itoa(w) +
		"\" height=\"" + itoa(h) + "\" class=\"" + cls + "\"/>"
}

func svgPath(d, cls string) string {
	return "<path d=\"" + d + "\" class=\"" + cls + "\"/>"
}

const svgTips = "<defs>" +
	"<marker id=\"av-arrow\" viewBox=\"0 0 8 8\" refX=\"8\" refY=\"4\" " +
	"markerWidth=\"8\" markerHeight=\"8\" orient=\"auto\">" +
	"<path d=\"M0 0L8 4L0 8Z\" fill=\"var(--av-alert,#d1242f)\"/></marker>" +
	"<marker id=\"av-tip\" viewBox=\"0 0 8 8\" refX=\"8\" refY=\"4\" " +
	"markerWidth=\"8\" markerHeight=\"8\" orient=\"auto\">" +
	"<path d=\"M0 0L8 4L0 8Z\" fill=\"var(--av-rule,#8c959f)\"/></marker>" +
	"</defs>"

// svgArrow is an edge drawn with its tip; an alerting edge is dashed in
// the alert colour.
func svgArrow(d string, alert bool) string {
	cls, tip := "av-line", "av-tip"
	if alert {
		cls, tip = "av-up", "av-arrow"
	}
	return "<path d=\"" + d + "\" class=\"" + cls + "\" marker-end=\"url(#" + tip + ")\"/>"
}

func svgCircle(x, y, r int, cls string) string {
	return "<circle cx=\"" + itoa(x) + "\" cy=\"" + itoa(y) + "\" r=\"" + itoa(r) +
		"\" class=\"" + cls + "\"/>"
}

// viewTracksOf is THE TRACKS. Spans are placed shortest first, each on
// the first track no span it overlaps holds. A span inside another then
// holds a track nearer than the one around it, so drawn as brackets they
// never cross, and spans that interleave cross exactly once.
func viewTracksOf(spans [][2]int) []int {
	order := make([]int, len(spans))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if da, db := spans[a][1]-spans[a][0], spans[b][1]-spans[b][0]; da != db {
			return da < db
		}
		return a < b
	})
	track := make([]int, len(spans))
	placed := []int{}
	for _, i := range order {
		held := map[int]bool{}
		for _, j := range placed {
			if spans[j][0] <= spans[i][1] && spans[i][0] <= spans[j][1] {
				held[track[j]] = true
			}
		}
		t := 0
		for held[t] {
			t++
		}
		track[i] = t
		placed = append(placed, i)
	}
	return track
}

// viewMostTrack is the farthest track held, or -1 when there is none.
func viewMostTrack(track []int) int {
	most := -1
	for _, t := range track {
		most = maxInt(most, t)
	}
	return most
}

// The arc drawing of the node-link kinds: a box per node on a row of
// its own, a band around each run of grouped rows, and each edge a
// bracket on its track right of the boxes.
type arcNode struct {
	label                 string
	ghost, initial, final bool
}

type arcGroup struct {
	title        string
	first, count int
}

type arcEdge struct {
	from, to int
	label    string
	alert    bool
}

const svgROW = 32

func arcSvg(nodes []arcNode, groups []arcGroup, edges []arcEdge, head []string,
	about, style string) string {
	type band struct {
		title     string
		at, count int
	}
	row := make([]int, len(nodes))
	bands := []band{}
	rows := 0
	marks := false
	labels := []string{}
	for i, n := range nodes {
		for _, g := range groups {
			if g.first == i {
				bands = append(bands, band{g.title, rows, g.count})
				rows++
				break
			}
		}
		row[i] = rows
		rows++
		marks = marks || n.initial
		labels = append(labels, n.label)
	}
	for _, g := range groups {
		labels = append(labels, g.title)
	}
	x0 := 4
	if marks {
		x0 += 24
	}
	if 0 < len(groups) {
		x0 += 8
	}
	bw := viewWidest(labels)*svgCH + 12
	right := x0 + bw
	top := 4 + len(head)*svgLH
	cy := func(r int) int { return top + r*svgROW + 16 }
	spans, names := [][2]int{}, []string{}
	for _, e := range edges {
		a, b := row[e.from], row[e.to]
		if b < a {
			a, b = b, a
		}
		spans = append(spans, [2]int{a, b})
		names = append(names, e.label)
	}
	tw := viewWidest(names)*svgCH + 16
	track := viewTracksOf(spans)
	x := func(t int) int { return right + 16 + t*tw }
	width := right + 8
	if 0 < len(edges) {
		width = x(viewMostTrack(track) + 1)
	}
	for _, h := range head {
		width = maxInt(width, 4+viewLen(h)*svgCH)
	}

	parts := []string{}
	for i, h := range head {
		parts = append(parts, svgText(4, 4+i*svgLH+14, "av-m", h, ""))
	}
	for _, b := range bands {
		parts = append(parts, svgRect(x0-8, top+b.at*svgROW+2, bw+16, (b.count+1)*svgROW-4, "av-cell"),
			svgText(x0, top+b.at*svgROW+20, "av-m", b.title, ""))
	}
	for i, n := range nodes {
		y := top + row[i]*svgROW + 4
		box, ink := "av-box", "av-t"
		if n.ghost {
			box, ink = "av-hole", "av-m"
		}
		parts = append(parts, svgRect(x0, y, bw, 24, box))
		if n.final {
			parts = append(parts, svgRect(x0+3, y+3, bw-6, 18, "av-line"))
		}
		parts = append(parts, svgText(x0+6, y+16, ink, n.label, ""))
	}
	if 0 < len(edges) || marks {
		parts = append(parts, svgTips)
	}
	for i, n := range nodes {
		if n.initial {
			parts = append(parts, svgCircle(x0-20, cy(row[i]), 3, "av-dot"),
				svgArrow("M"+itoa(x0-17)+" "+itoa(cy(row[i]))+"H"+itoa(x0), false))
		}
	}
	// An edge leaves and enters its boxes on the sides facing each other,
	// so edges meeting at a box share its port rather than crossing.
	for i, e := range edges {
		a, b := row[e.from], row[e.to]
		y1, y2 := cy(a)-5, cy(b)+5
		if a < b {
			y1, y2 = cy(a)+5, cy(b)-5
		}
		parts = append(parts, svgArrow("M"+itoa(right)+" "+itoa(y1)+"H"+itoa(x(track[i]))+
			"V"+itoa(y2)+"H"+itoa(right), e.alert))
	}
	// A label sits between rows, where no edge runs across its track.
	for i, e := range edges {
		if "" != e.label {
			parts = append(parts, svgText(x(track[i])+6, top+(spans[i][0]+1)*svgROW+5, "av-m",
				e.label, ""))
		}
	}
	return svgDoc(width+svgPAD, top+rows*svgROW+svgPAD, about, parts, style)
}

// ladderSvg is the ladder as a column: `any` above, each rung a box of
// its canon and its role, and the value below them all.
func ladderSvg(rungs [][2]string, value, about, style string) string {
	words := []string{"any", value}
	for _, r := range rungs {
		words = append(words, r[0], r[1])
	}
	w := viewWidest(words)*svgCH + 24
	mid := 4 + w/2
	parts := []string{svgCircle(mid, 20, 16, "av-box"),
		svgText(mid, 24, "av-t", "any", "middle"), svgTips}
	y := 36
	for _, r := range rungs {
		parts = append(parts, svgArrow("M"+itoa(mid)+" "+itoa(y)+"V"+itoa(y+16), false),
			svgRect(4, y+16, w, 44, "av-box"),
			svgText(10, y+34, "av-t", r[0], ""), svgText(10, y+52, "av-m", r[1], ""))
		y += 60
	}
	parts = append(parts, svgArrow("M"+itoa(mid)+" "+itoa(y)+"V"+itoa(y+16), false),
		svgPath("M4 "+itoa(y+30)+"L16 "+itoa(y+16)+"H"+itoa(w-8)+"L"+itoa(w+4)+" "+itoa(y+30)+
			"L"+itoa(w-8)+" "+itoa(y+44)+"H16Z", "av-box"),
		svgText(mid, y+34, "av-t", value, "middle"))
	return svgDoc(w+4+svgPAD, y+44+svgPAD, about, parts, style)
}

// laneStep is one step of the swim lanes, on the row of its lane.
type laneStep struct {
	label string
	ghost bool
	lane  int
}

// laneSvg is the lanes as bands and the steps as boxes in the text
// grid's columns. An edge to the next step is drawn across the gap
// between them; any other runs on a track below the lanes, through
// cells no step holds.
func laneSvg(titles []string, steps []laneStep, cols []int, edges [][2]int,
	footer []string, about, style string) string {
	top := 4 + svgLH
	xs := []int{}
	x := 4 + viewWidest(titles)*svgCH + 16
	for _, c := range cols {
		xs = append(xs, x)
		x += c*svgCH + 36
	}
	bw := func(i int) int { return cols[i]*svgCH + 12 }
	cx := func(i int) int { return xs[i] + bw(i)/2 }
	cy := func(i int) int { return top + steps[i].lane*svgROW + 16 }
	below := top + len(titles)*svgROW
	far, spans := [][2]int{}, [][2]int{}
	for _, e := range edges {
		if e[1] != e[0]+1 {
			far = append(far, e)
			spans = append(spans, [2]int{minInt(e[0], e[1]), maxInt(e[0], e[1])})
		}
	}
	track := viewTracksOf(spans)
	yf := below
	if 0 < len(far) {
		yf = below + 12*viewMostTrack(track) + 20
	}
	width := x - 24
	for _, f := range footer {
		width = maxInt(width, 4+viewLen(f)*svgCH)
	}

	parts := []string{}
	for i := range cols {
		parts = append(parts, svgText(xs[i]+6, 18, "av-m", itoa(i+1), ""))
	}
	for li, t := range titles {
		parts = append(parts, svgRect(4, top+li*svgROW, width-4, svgROW, "av-cell"),
			svgText(12, top+li*svgROW+20, "av-m", t, ""))
	}
	for i, st := range steps {
		y := top + st.lane*svgROW + 4
		box, ink := "av-box", "av-t"
		if st.ghost {
			box, ink = "av-hole", "av-m"
		}
		parts = append(parts, svgRect(xs[i], y, bw(i), 24, box),
			svgText(xs[i]+6, y+16, ink, st.label, ""))
	}
	if 0 < len(edges) {
		parts = append(parts, svgTips)
	}
	for _, e := range edges {
		if e[1] == e[0]+1 {
			parts = append(parts, svgArrow("M"+itoa(xs[e[0]]+bw(e[0]))+" "+itoa(cy(e[0]))+
				"L"+itoa(xs[e[1]])+" "+itoa(cy(e[1])), false))
		}
	}
	for i, e := range far {
		out, into := cx(e[0])-5, cx(e[1])+5
		if e[0] < e[1] {
			out, into = cx(e[0])+5, cx(e[1])-5
		}
		parts = append(parts, svgArrow("M"+itoa(out)+" "+itoa(cy(e[0])+12)+
			"V"+itoa(below+12+12*track[i])+"H"+itoa(into)+"V"+itoa(cy(e[1])+12), e[1] <= e[0]))
	}
	for i, f := range footer {
		parts = append(parts, svgText(4, yf+i*svgLH+14, "av-m", f, ""))
	}
	return svgDoc(width+svgPAD, yf+len(footer)*svgLH+svgPAD, about, parts, style)
}

// sequenceSvg is the lifeline grid in SVG: each message a line above
// its arrow, on the rows and columns the text figure lays out.
func sequenceSvg(names []string, msgs []viewMsg, about, style string) string {
	if 0 == len(names) {
		return svgDoc(svgPAD, svgPAD, about, nil, style)
	}
	xs, width := viewLifelines(names, msgs)
	cx := func(i int) int { return 8 + xs[i]*svgCH }
	rows := 3
	for _, m := range msgs {
		rows++
		if m.a == m.b {
			rows++
		}
	}
	parts := []string{}
	for i, s := range names {
		parts = append(parts, svgText(4+xs[i]*svgCH, 18, "av-t", s, ""))
	}
	for i := range xs {
		parts = append(parts, svgPath("M"+itoa(cx(i))+" "+itoa(4+svgLH)+"V"+itoa(4+rows*svgLH), "av-cell"))
	}
	if 0 < len(msgs) {
		parts = append(parts, svgTips)
	}
	y := 4 + 2*svgLH
	for _, m := range msgs {
		if "" != m.text {
			parts = append(parts, svgText(minInt(cx(m.a), cx(m.b))+12, y+11, "av-t", m.text, ""))
		}
		if m.a == m.b {
			loop := cx(m.a) + 3*svgCH
			if "" != m.text {
				loop += (viewLen(m.text) + 2) * svgCH
			}
			parts = append(parts, svgArrow("M"+itoa(cx(m.a))+" "+itoa(y+15)+"H"+itoa(loop)+
				"V"+itoa(y+svgLH+15)+"H"+itoa(cx(m.a)), false))
			y += 2 * svgLH
		} else {
			parts = append(parts, svgArrow("M"+itoa(cx(m.a))+" "+itoa(y+15)+"H"+itoa(cx(m.b)), false))
			y += svgLH
		}
	}
	return svgDoc(4+width*svgCH+svgPAD, 4+rows*svgLH+svgPAD, about, parts, style)
}

// treemapRow is one row of the treemap: its tile, its depth and the row
// of its parent, and its bar in whole cells.
type treemapRow struct {
	prefix, name             string
	weight, depth, parent, bar int
}

// treemapSvg is the treemap's rows as the tree draws its own, each with
// its weight and a bar of whole cells.
func treemapSvg(rows []treemapRow, about, style string) string {
	const U = 24
	end, weights, bars := 0, []string{}, 0
	for _, r := range rows {
		end = maxInt(end, r.depth*U+4+viewLen(r.name)*svgCH)
		weights = append(weights, itoa(r.weight))
		bars = maxInt(bars, r.bar)
	}
	wx := end + 16 + viewWidest(weights)*svgCH
	parts := []string{}
	for i, r := range rows {
		y := i * svgLH
		x := r.depth*U + 4
		if 0 < r.depth {
			parts = append(parts, svgPath("M"+itoa((r.depth-1)*U+8)+" "+itoa(r.parent*svgLH+svgLH)+
				"V"+itoa(y+10)+"H"+itoa(x-2), "av-line"))
		}
		parts = append(parts, svgText(x, y+14, "av-t", r.name, ""),
			svgText(wx, y+14, "av-m", itoa(r.weight), "end"))
		if 0 < r.bar {
			parts = append(parts, svgRect(wx+8, y+5, r.bar*svgCH, 10, "av-bar"))
		}
	}
	return svgDoc(wx+8+bars*svgCH+svgPAD, len(rows)*svgLH+svgPAD, about, parts, style)
}

// svgOver is the relation a figure is over, for its description; a
// document with no edges has none to name.
func svgOver(relation string) string {
	if "" == relation {
		return ""
	}
	return " over " + relation
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if b > a {
		return b
	}
	return a
}

// ---------------------------------------------------------------------
// The tree

// treeRow is one drawn row of the tree: its depth, its text, the mark
// after it, and the row of its parent. A blank separator between roots
// is a nil entry.
type treeRow struct {
	depth  int
	text   string
	mark   string
	parent int
}

// treeSvg is the tree as SVG: one line per row, each node indented one
// unit per depth, joined to its parent by a path that drops from the
// parent's row and turns in to the child. The marks are muted text
// after the label.
func treeSvg(rows []*treeRow, about, style string) string {
	const U = 24
	parts := []string{}
	width := 0
	for i, r := range rows {
		if nil == r {
			continue
		}
		y := i * svgLH
		x := r.depth*U + 4
		if 0 < r.depth {
			px := (r.depth-1)*U + 8
			parts = append(parts, svgPath("M"+itoa(px)+" "+itoa(r.parent*svgLH+svgLH)+
				"V"+itoa(y+10)+"H"+itoa(x-2), "av-line"))
		}
		if "" == r.mark {
			parts = append(parts, svgText(x, y+14, "av-t", r.text, ""))
		} else {
			parts = append(parts, "<text x=\""+itoa(x)+"\" y=\""+itoa(y+14)+"\"><tspan class=\"av-t\">"+
				viewSvgEsc(r.text)+"</tspan><tspan class=\"av-m\">"+viewSvgEsc(r.mark)+"</tspan></text>")
		}
		width = maxInt(width, x+(viewLen(r.text)+viewLen(r.mark))*svgCH)
	}
	return svgDoc(width+svgPAD, len(rows)*svgLH+svgPAD, about, parts, style)
}

// ---------------------------------------------------------------------
// The matrix

var matrixCellRole = map[string]string{
	"X": roleDirect, "!": roleUnmirrored, "+": roleClosure,
	".": roleMuted, "\\": roleRule,
}

var matrixCellClass = map[string]string{
	"X": "av-direct", "!": "av-unmirrored", "+": "av-closure",
	".": "av-cell", "\\": "av-cell",
}

// matrixSvg is the matrix as SVG: the same glyph grid as cells, each a
// square whose class is its state, the diagonal drawn as a line
// through its cell.
func matrixSvg(labels, idx []string, grid [][]string, footer, about, style string) string {
	const S = 20
	w := viewWidest(labels)
	iw := viewWidest(idx)
	gutter := w*svgCH + 8 + iw*svgCH + 8
	y0 := svgLH + 4
	parts := []string{}
	for c, s := range idx {
		parts = append(parts, svgText(gutter+c*S+10, 14, "av-m", s, "middle"))
	}
	for r, l := range labels {
		y := y0 + r*S
		parts = append(parts, svgText(4, y+14, "av-t", l, ""))
		parts = append(parts, svgText(gutter-8, y+14, "av-m", idx[r], "end"))
		for c, g := range grid[r] {
			x := gutter + c*S
			parts = append(parts, svgRect(x, y, S, S, matrixCellClass[g]))
			if "\\" == g {
				parts = append(parts, svgPath("M"+itoa(x)+" "+itoa(y)+"L"+itoa(x+S)+" "+itoa(y+S), "av-line"))
			}
		}
	}
	n := len(labels)
	parts = append(parts, svgText(4, y0+n*S+16, "av-m", footer, ""))
	width := maxInt(gutter+n*S, 4+viewLen(footer)*svgCH) + svgPAD
	return svgDoc(width, y0+n*S+svgLH+svgPAD, about, parts, style)
}

// ---------------------------------------------------------------------
// The architecture layers

type svgBox struct{ x, y, w int }

// viewDrawing is one drawn edge of the layer figure, and which way it
// goes between the bands.
type viewDrawing struct {
	edge viewTriple
	way  string
}

func layerSvg(bands []viewBand, shown []viewDrawing, footer []string, about, style string) string {
	const BH = 44
	names := []string{}
	for _, b := range bands {
		names = append(names, b.name)
	}
	gutter := viewWidest(names)*svgCH + 16
	box := map[string]svgBox{}
	width := 0
	for i, b := range bands {
		x := gutter
		for _, n := range b.nodes {
			w := viewLen(n.label)*svgCH + 12
			box[n.path] = svgBox{x: x, y: 4 + i*BH + 10, w: w}
			x += w + 10
		}
		width = maxInt(width, x-10)
	}
	for _, f := range footer {
		width = maxInt(width, 4+viewLen(f)*svgCH)
	}
	width += svgPAD
	parts := []string{}
	for i, b := range bands {
		y := 4 + i*BH
		parts = append(parts, svgRect(4, y, width-8, BH, "av-cell"))
		parts = append(parts, svgText(12, y+27, "av-m", b.name, ""))
		for _, n := range b.nodes {
			at := box[n.path]
			parts = append(parts, svgRect(at.x, at.y, at.w, 24, "av-box"))
			parts = append(parts, svgText(at.x+6, at.y+16, "av-t", n.label, ""))
		}
	}
	if 0 < len(shown) {
		parts = append(parts, svgTips)
	}
	for _, c := range shown {
		from, to := box[c.edge.from], box[c.edge.to]
		fx, tx := from.x+from.w/2, to.x+to.w/2
		if "upward" == c.way {
			parts = append(parts, svgArrow("M"+itoa(fx)+" "+itoa(from.y)+
				"L"+itoa(tx)+" "+itoa(to.y+24), true))
		} else if "downward" == c.way {
			parts = append(parts, svgArrow("M"+itoa(fx)+" "+itoa(from.y+24)+
				"L"+itoa(tx)+" "+itoa(to.y), false))
		} else {
			// Below the boxes and back up, staying inside the band.
			y := from.y + 24
			parts = append(parts, svgArrow("M"+itoa(fx)+" "+itoa(y)+"V"+itoa(y+6)+
				"H"+itoa(tx)+"V"+itoa(y), false))
		}
	}
	y1 := 4 + len(bands)*BH + 4
	for i, f := range footer {
		parts = append(parts, svgText(4, y1+i*svgLH+14, "av-m", f, ""))
	}
	return svgDoc(width, y1+len(footer)*svgLH+svgPAD, about, parts, style)
}

// ---------------------------------------------------------------------
// The set panel

// panelColumnLine is the line naming a column's elements, shared by
// the text and SVG renderings of the panel.
func panelColumnLine(p viewPanel, i int, c viewColumn) string {
	return panelColumnHead(p, i, c) + " " + panelColumnItems(p, c) +
		panelColumnNone(p, c)
}

func panelColumnHead(p viewPanel, i int, c viewColumn) string {
	head := "col " + itoa(p.first+i+1)
	if !p.bars {
		head += " (" + itoa(len(c.items)) + ")"
	}
	return head + ":"
}

func panelColumnItems(p viewPanel, c viewColumn) string {
	if 4 < len(c.items) && !p.bars {
		return strings.Join(c.items[:3], " ") + " ..."
	}
	return strings.Join(c.items, " ")
}

func panelColumnNone(p viewPanel, c viewColumn) string {
	for _, b := range c.sig {
		if b {
			return ""
		}
	}
	return p.none
}

// panelSvg is the panel as SVG: the set sizes as bars, the
// intersections as a dot matrix (a filled dot where the set lies in
// the column), the column cardinalities as bars under it, and the
// columns' elements as text.
func panelSvg(p viewPanel, about, style string) string {
	w := viewWidest(p.names)
	most := 0
	for _, n := range p.sizes {
		most = maxInt(most, n)
	}
	parts := []string{svgText(4, 14, "av-m", p.header, "")}
	gx := w*svgCH + 8
	yS := svgLH + 8
	barW := 0
	if p.bars {
		barW = most*10 + 8
	}
	for i, n := range p.names {
		y := yS + i*svgLH
		parts = append(parts, svgText(4, y+14, "av-t", n, ""))
		if p.bars {
			parts = append(parts, svgRect(gx, y+3, p.sizes[i]*10, 14, "av-bar"))
		}
		parts = append(parts, svgText(gx+barW, y+14, "av-m", itoa(p.sizes[i]), ""))
	}
	yM := yS + len(p.names)*svgLH + 8
	for i, n := range p.names {
		parts = append(parts, svgText(4, yM+i*svgLH+14, "av-t", n, ""))
		for ci, c := range p.cols {
			cls := "av-hole"
			if c.sig[i] {
				cls = "av-dot"
			}
			parts = append(parts, "<circle cx=\""+itoa(gx+ci*20+10)+"\" cy=\""+itoa(yM+i*svgLH+10)+
				"\" r=\"5\" class=\""+cls+"\"/>")
		}
	}
	yB := yM + len(p.names)*svgLH + 4
	tallest := 0
	for _, c := range p.cols {
		tallest = maxInt(tallest, len(c.items))
	}
	parts = append(parts, svgPath("M"+itoa(gx)+" "+itoa(yB)+"H"+itoa(gx+len(p.cols)*20), "av-line"))
	for ci, c := range p.cols {
		parts = append(parts, svgRect(gx+ci*20+4, yB, 12, len(c.items)*8, "av-bar"))
		parts = append(parts, svgText(gx+ci*20+10, yB+tallest*8+14, "av-m", itoa(len(c.items)), "middle"))
	}
	yI := yB + tallest*8 + svgLH + 4
	lines := []string{}
	for i, c := range p.cols {
		lines = append(lines, panelColumnLine(p, i, c))
	}
	for i, l := range lines {
		parts = append(parts, svgText(4, yI+i*svgLH+14, "av-t", l, ""))
	}
	width := maxInt(maxInt(gx+len(p.cols)*20, gx+barW+3*svgCH),
		maxInt(4+viewWidest(lines)*svgCH, 4+viewLen(p.header)*svgCH)) + svgPAD
	return svgDoc(width, yI+len(lines)*svgLH+svgPAD, about, parts, style)
}
