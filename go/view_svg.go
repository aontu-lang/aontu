/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// SVG (VIEWS.0.md, "No SVG in v1" -- the phase after the text kinds).
//
// The cell-based kinds draw into SVG under the INTEGER RULE: every
// coordinate is a whole number of a fixed cell -- 8 units per
// character, 20 per line -- from the same counts that lay the text
// figure out, so no font is measured and both ports emit the same
// bytes. See the SVG section of ts/src/view.ts, which this mirrors
// function for function.

import (
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

// svgDoc is the document: a viewBox the size of the figure, the style,
// and the parts, one per line, so the bytes read as a figure and diff
// as one.
func svgDoc(w, h int, about string, parts []string) string {
	all := []string{
		"<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"av\" viewBox=\"0 0 " +
			itoa(w) + " " + itoa(h) + "\" width=\"" + itoa(w) + "\" height=\"" + itoa(h) +
			"\" role=\"img\" aria-label=\"" + viewSvgEsc(about) + "\">",
		svgStyle,
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

// svgOver is the relation a figure is over, for its description; a
// document with no edges has none to name.
func svgOver(relation string) string {
	if "" == relation {
		return ""
	}
	return " over " + relation
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
func treeSvg(rows []*treeRow, count int) string {
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
	return svgDoc(width+svgPAD, len(rows)*svgLH+svgPAD,
		"Dependency tree: "+itoa(count)+" nodes", parts)
}

// ---------------------------------------------------------------------
// The matrix

// matrixCellClass maps each glyph of the text grid to its cell's class.
var matrixCellClass = map[string]string{
	"X": "av-direct", "!": "av-unmirrored", "+": "av-closure",
	".": "av-cell", "\\": "av-cell",
}

// matrixSvg is the matrix as SVG: the same glyph grid as cells, each a
// square whose class is its state, the diagonal drawn as a line
// through its cell.
func matrixSvg(labels, idx []string, grid [][]string, footer, about string) string {
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
	return svgDoc(width, y0+n*S+svgLH+svgPAD, about, parts)
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

// layerSvg is the layers as SVG: one band per row, its modules as boxes
// laid left to right, and every SHOWN edge drawn between them -- an
// upward one dashed and alert-coloured, because it is the violation the
// bands cannot show on their own; a downward one straight down from the
// bottom of its box to the top of the one it names; a sideways one
// dipped below the boxes, since two modules of one band sit on the same
// line and a straight edge between them would cross whatever stands
// between.
func layerSvg(bands []viewBand, shown []viewDrawing, footer []string, about string) string {
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
		parts = append(parts, "<defs>"+
			"<marker id=\"av-arrow\" viewBox=\"0 0 8 8\" refX=\"8\" refY=\"4\" "+
			"markerWidth=\"8\" markerHeight=\"8\" orient=\"auto\">"+
			"<path d=\"M0 0L8 4L0 8Z\" fill=\"var(--av-alert,#d1242f)\"/></marker>"+
			"<marker id=\"av-tip\" viewBox=\"0 0 8 8\" refX=\"8\" refY=\"4\" "+
			"markerWidth=\"8\" markerHeight=\"8\" orient=\"auto\">"+
			"<path d=\"M0 0L8 4L0 8Z\" fill=\"var(--av-rule,#8c959f)\"/></marker>"+
			"</defs>")
	}
	for _, c := range shown {
		from, to := box[c.edge.from], box[c.edge.to]
		fx, tx := from.x+from.w/2, to.x+to.w/2
		if "upward" == c.way {
			parts = append(parts, "<path d=\"M"+itoa(fx)+" "+itoa(from.y)+
				"L"+itoa(tx)+" "+itoa(to.y+24)+"\" class=\"av-up\" marker-end=\"url(#av-arrow)\"/>")
		} else if "downward" == c.way {
			parts = append(parts, "<path d=\"M"+itoa(fx)+" "+itoa(from.y+24)+
				"L"+itoa(tx)+" "+itoa(to.y)+"\" class=\"av-line\" marker-end=\"url(#av-tip)\"/>")
		} else {
			// Below the boxes and back up, staying inside the band.
			y := from.y + 24
			parts = append(parts, "<path d=\"M"+itoa(fx)+" "+itoa(y)+"V"+itoa(y+6)+
				"H"+itoa(tx)+"V"+itoa(y)+"\" class=\"av-line\" marker-end=\"url(#av-tip)\"/>")
		}
	}
	y1 := 4 + len(bands)*BH + 4
	for i, f := range footer {
		parts = append(parts, svgText(4, y1+i*svgLH+14, "av-m", f, ""))
	}
	return svgDoc(width, y1+len(footer)*svgLH+svgPAD, about, parts)
}

// ---------------------------------------------------------------------
// The set panel

// panelColumnLine is the line naming a column's elements, shared by
// the text and SVG renderings of the panel.
func panelColumnLine(p viewPanel, i int, c viewColumn) string {
	shown := strings.Join(c.items, " ")
	if 4 < len(c.items) && !p.bars {
		shown = strings.Join(c.items[:3], " ") + " ..."
	}
	line := "col " + itoa(i+1)
	if !p.bars {
		line += " (" + itoa(len(c.items)) + ")"
	}
	line += ": " + shown
	any := false
	for _, b := range c.sig {
		any = any || b
	}
	if !any {
		line += p.none
	}
	return line
}

// panelSvg is the panel as SVG: the set sizes as bars, the
// intersections as a dot matrix (a filled dot where the set lies in
// the column), the column cardinalities as bars under it, and the
// columns' elements as text.
func panelSvg(p viewPanel, about string) string {
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
	return svgDoc(width, yI+len(lines)*svgLH+svgPAD, about, parts)
}
