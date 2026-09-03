/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE VALUE LATTICE, and where this document's values sit on it.
// Mirrors the lattice section of ts/src/view.ts function for function.
//
// THE SCAFFOLD IS THE LANGUAGE'S, NOT THE DOCUMENT'S: `top` at the
// join, the four kind families under it, `path()` under `string`, the
// four numeric leaves under `number`, and `nil` at the meet. Every
// Aontu document is drawn against the SAME shape, which is what makes
// two of these figures comparable -- and what makes this a view of the
// language that a document annotates, rather than a picture assembled
// out of whatever the document happened to contain.
//
// See docs/unification.md for what the ordering means.

import (
	"sort"
	"strconv"
	"strings"
)

// latticeKindParent is the scaffold: each kind and the one above it.
// The ENGINE decides which kind sits under which -- kindParent in
// go/scalar.go, and its twin in ts/src/val/ScalarKindVal.ts -- and
// a test in each port holds this table to it, so adding a kind to the
// engine makes the figure grow a node rather than quietly leave one
// out.
var latticeKindParent = [][2]string{
	{"string", "top"},
	{"path()", "string"},
	{"number", "top"},
	{"integer", "number"},
	{"float", "number"},
	{"biginteger", "number"},
	{"bigdecimal", "number"},
	{"boolean", "top"},
	{"null", "top"},
}

// latticeColumns is the columns, left to right: the MINIMAL kinds, the
// ones with nothing under them. Everything else is drawn centred over
// the columns it covers, so this list alone fixes the figure's
// horizontal order -- and it puts the kinds that reach the bottom from
// higher up (`boolean`, `null`) on the outside, where their lines pass
// the numeric fan rather than crossing it.
var latticeColumns = []string{"path()", "integer", "float", "biginteger",
	"bigdecimal", "boolean", "null"}

// latticeRows is the rows, top to bottom. `top` and `nil` are the
// endpoints and are not kinds: no superior() answers either, and no
// entry above names them as a parent.
var latticeRows = [][]string{
	{"top"},
	{"string", "number", "boolean", "null"},
	{"path()", "integer", "float", "biginteger", "bigdecimal"},
	{"nil"},
}

// latticeNodes is every name the figure draws.
var latticeNodes = latticeNodeNames()

func latticeNodeNames() []string {
	out := []string{"top"}
	for _, e := range latticeKindParent {
		out = append(out, e[0])
	}
	return append(out, "nil")
}

// latticeAncestors is every node at or above one, itself included.
func latticeAncestors(name string) []string {
	out := []string{name}
	for at := name; "" != at; {
		next := ""
		for _, e := range latticeKindParent {
			if e[0] == at {
				next = e[1]
			}
		}
		at = next
		if "" != at {
			out = append(out, at)
		}
	}
	return out
}

// latticeSpan is the columns one node covers: its own if it is
// minimal, otherwise every column beneath it. `nil` is beneath
// everything and above nothing, so the walk finds no column under it
// and the whole width is its span -- which is where it belongs.
func latticeSpan(name string) []int {
	for i, col := range latticeColumns {
		if col == name {
			return []int{i}
		}
	}
	under := []int{}
	for i, col := range latticeColumns {
		if containsString(latticeAncestors(col), name) {
			under = append(under, i)
		}
	}
	if 0 == len(under) {
		for i := range latticeColumns {
			under = append(under, i)
		}
	}
	return under
}

// latticeCovers is true when `parent` is immediately above `child`.
// NIL IS COVERED BY EVERY MINIMAL KIND: it is the meet of all of them,
// and the only node the parent table does not name, because nothing in
// the engine ever answers `nil` as a superior.
func latticeCovers(parent, child string) bool {
	if "nil" == child {
		return containsString(latticeColumns, parent)
	}
	for _, e := range latticeKindParent {
		if e[0] == child && e[1] == parent {
			return true
		}
	}
	return false
}

// latticePoint is WHERE ONE VALUE SITS, or "" for a value that is not
// at a single point. The answers are the kinds of thing a document
// holds:
//
//	a CONCRETE scalar sits at its kind -- `8080` is an `integer`, and
//	superior() is the lattice's own answer to which;
//	a KIND MARKER sits AT that kind -- `integer` written as a schema
//	is the node itself, not a value under it;
//	everything else -- a constraint, an unresolved disjunction, a
//	reference -- is not one point. `integer & min(1)` is a REGION of
//	the lattice and `*8080 | integer` is two places at once, so
//	drawing either at a node would be a claim the figure cannot
//	support. Both are counted into the loss report instead.
func latticePoint(v Val) string {
	name := ""
	switch node := throughDoc(v).(type) {
	case *NilVal:
		return "nil"
	case *TopVal:
		return "top"
	case *ScalarKindVal:
		// A kind marker names its own node.
		name = node.Canon()
	case *ScalarVal:
		// A concrete scalar names the node above it.
		name = node.superior().Canon()
	}
	// Either way the name has to BE one of the figure's: a kind the
	// scaffold does not draw has nowhere to go, and saying so through
	// the loss report is the only honest answer.
	if containsString(latticeNodes, name) {
		return name
	}
	return ""
}

// latticeFrame is one node of the census walk: the value and the path
// that reached it.
type latticeFrame struct {
	node Val
	path string
}

// latticeCensus is the document's own values, gathered by lattice
// node. Containers are walked but not placed: a map is not a scalar
// lattice citizen, and counting one at `top` would put every
// document's root there.
func latticeCensus(root Val, at string) (map[string][]string, []string) {
	counts := map[string][]string{}
	unplaced := []string{}
	stack := []latticeFrame{{node: root, path: at}}
	for 0 < len(stack) {
		frame := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		kids := docEntries(frame.node)
		if 0 < len(kids) {
			// A container is a shape, not a point: walk into it and
			// place what it holds.
			for _, kid := range kids {
				stack = append(stack, latticeFrame{
					node: throughDoc(kid.child),
					path: frame.path + "." + kid.key,
				})
			}
			continue
		}
		point := latticePoint(frame.node)
		if "" == point {
			// AN EMPTY CONTAINER IS NEITHER A POINT NOR A SHAPE with
			// anything in it, and is no more unplaced than `{}` is a
			// value: skip it rather than report a loss a reader cannot
			// act on.
			switch throughDoc(frame.node).(type) {
			case *MapVal, *ListVal:
			default:
				unplaced = append(unplaced, frame.path)
			}
			continue
		}
		counts[point] = append(counts[point], frame.path)
	}
	for _, paths := range counts {
		sort.Strings(paths)
	}
	sort.Strings(unplaced)
	return counts, unplaced
}

// latticeCell is what one node is written as: its name, and the count
// of the document's values that landed on it. A node with nothing at
// it is still drawn -- the shape is the language's, and a figure that
// left the empty nodes out would be a different lattice for every
// document.
func latticeCell(counts map[string][]string, name string) string {
	n := len(counts[name])
	if 0 == n {
		return name
	}
	return name + " (" + strconv.Itoa(n) + ")"
}

// latticeGutter is the gap between one column and the next. It is
// THREE because the SVG draws a box a character wider than its text:
// two of those characters are the box's own padding and the third is
// the gap between one box and the next.
const latticeGutter = 3

// latticeLayout is the horizontal layout, in characters: one column
// per minimal kind, each as wide as the widest cell drawn over it plus
// the gutter, and the centre of each. The spanning nodes are narrower
// than the span they cover, so none of them needs a width of its own.
func latticeLayout(counts map[string][]string) ([]int, int) {
	cx := make([]int, len(latticeColumns))
	x := 0
	for i, col := range latticeColumns {
		w := 0
		for _, row := range latticeRows {
			for _, name := range row {
				span := latticeSpan(name)
				if 1 == len(span) && col == latticeColumns[span[0]] {
					w = maxInt(w, viewLen(latticeCell(counts, name)))
				}
			}
		}
		w += latticeGutter
		cx[i] = x + w/2
		x += w
	}
	return cx, x
}

// latticeAt is the centre of a node, from the columns it covers.
func latticeAt(name string, cx []int) int {
	span := latticeSpan(name)
	lo, hi := cx[span[0]], cx[span[len(span)-1]]
	// Rounded half up, as JavaScript's Math.round does it; both ends
	// are non-negative here, so there is no negative-zero case to
	// separate the two rules.
	return (lo + hi + 1) / 2
}

// latticeGlyph is the box-drawing glyph for one column of a rule, from
// the four facts that meet there: whether the rule continues left and
// right, and whether a stem leaves upward and downward. Deciding it
// this way is what lets `number` -- which is BOTH one of the many
// under `top` and the one above the numeric leaves -- come out as the
// join it is, without a case written for it. The table is total, so no
// column has to be asked whether it has a glyph.
var latticeGlyph = map[string]rune{
	"....": '─', "...d": '│', "..u.": '│', "..ud": '│',
	".r..": '─', ".r.d": '┌', ".ru.": '└', ".rud": '├',
	"l...": '─', "l..d": '┐', "l.u.": '┘', "l.ud": '┤',
	"lr..": '─', "lr.d": '┬', "lru.": '┴', "lrud": '┼',
}

// latticePainting is the canvas the text figure is painted onto: a
// character and its role at every cell.
type latticePainting struct {
	glyph [][]rune
	role  [][]string
	width int
}

func (p *latticePainting) put(y, x int, text string, role string) {
	for len(p.glyph) <= y {
		line := make([]rune, p.width)
		roles := make([]string, p.width)
		for i := range line {
			line[i], roles[i] = ' ', roleLabel
		}
		p.glyph = append(p.glyph, line)
		p.role = append(p.role, roles)
	}
	for i, ch := range []rune(text) {
		p.glyph[y][x+i], p.role[y][x+i] = ch, role
	}
}

// latticeText is the figure, PAINTED rather than assembled from padded
// strings: the nodes have to line up with the rules that join them,
// and a count changes a cell's width -- so the geometry is settled
// first, in columns, and every glyph is then written at a place
// already known.
func latticeText(counts map[string][]string, style string) string {
	paint := newPainter(style)
	cx, width := latticeLayout(counts)
	p := &latticePainting{width: width}

	// A cell is its name and, where the document reached it, the
	// count: two roles, so a terminal can mute the second without
	// touching the first.
	cell := func(y int, name string) {
		text := latticeCell(counts, name)
		left := latticeAt(name, cx) - viewLen(text)/2
		p.put(y, left, name, roleLabel)
		p.put(y, left+viewLen(name), text[len(name):], roleMuted)
	}
	stems := func(y int, at []string) {
		for _, name := range at {
			p.put(y, latticeAt(name, cx), "│", roleRule)
		}
	}
	// The rule that joins one row to the next, plus the lines that
	// pass it by: a kind with nothing under it runs on down the
	// OUTSIDE of the fan, which the column order guarantees is clear
	// of it.
	rule := func(y int, up, down, by []string) {
		at := func(names []string) []int {
			out := []int{}
			for _, n := range names {
				out = append(out, latticeAt(n, cx))
			}
			return out
		}
		mark := func(xs []int, x int, yes string) string {
			for _, c := range xs {
				if c == x {
					return yes
				}
			}
			return "."
		}
		u, d := at(up), at(down)
		lo, hi := u[0], u[0]
		for _, x := range append(append([]int{}, u...), d...) {
			if x < lo {
				lo = x
			}
			hi = maxInt(hi, x)
		}
		for x := lo; x <= hi; x++ {
			key := "."
			if x > lo {
				key = "l"
			}
			if x < hi {
				key += "r"
			} else {
				key += "."
			}
			key += mark(u, x, "u") + mark(d, x, "d")
			p.put(y, x, string(latticeGlyph[key]), roleRule)
		}
		stems(y, by)
	}

	// Four node rows and three joins. `open` is every node whose line
	// downward has not been drawn yet, which is what carries `boolean`
	// and `null` past the numeric row to the bottom rule.
	open := []string{}
	y := 0
	for r, row := range latticeRows {
		stems(y, open)
		for _, name := range row {
			cell(y, name)
		}
		open = append(append([]string{}, open...), row...)
		if len(latticeRows)-1 == r {
			break
		}
		next := latticeRows[r+1]
		parents, by := []string{}, []string{}
		for _, n := range open {
			is := false
			for _, k := range next {
				is = is || latticeCovers(n, k)
			}
			if is {
				parents = append(parents, n)
			} else {
				by = append(by, n)
			}
		}
		stems(y+1, open)
		rule(y+2, parents, next, by)
		open = by
		y += 3
	}

	out := make([]string, 0, len(p.glyph))
	for i, line := range p.glyph {
		bare := []rune(strings.TrimRight(string(line), " "))
		run := ""
		for at := 0; at < len(bare); {
			end := at
			for end < len(bare) && p.role[i][end] == p.role[i][at] {
				end++
			}
			run += paint.paint(p.role[i][at], string(bare[at:end]))
			at = end
		}
		out = append(out, run)
	}
	return strings.Join(out, "\n")
}

// latticeSvg is the same figure as SVG, off the same column layout, so
// the two profiles are one drawing in two grammars rather than two
// drawings. A node the document REACHES is drawn with the ordinary
// rule stroke (`av-box`) and one it does not with the faint one
// (`av-cell`), because every node is drawn whether this document
// reaches it or not and a reader has to see which is which without
// counting. NO NEW CLASS: those two already mean a box and a faint
// box, so a host page that themed the other figures gets this one for
// nothing.
func latticeSvg(counts map[string][]string, at, style string) string {
	const rowH = 3 * svgLH
	const boxH = 26
	cx, width := latticeLayout(counts)
	parts := []string{}
	rowOf := map[string]int{}
	for r, row := range latticeRows {
		for _, name := range row {
			rowOf[name] = r
		}
	}
	x := func(name string) int { return svgPAD + latticeAt(name, cx)*svgCH }
	y := func(name string) int { return svgPAD + boxH/2 + rowOf[name]*rowH }

	// Edges first, so a box always sits over the lines that reach it.
	// The horizontal jog is placed just above the CHILD rather than
	// halfway down, which is what keeps `boolean` and `null` -- three
	// rows from `top` to `nil` with nothing between -- clear of the
	// numeric row they pass.
	edges := append([][2]string{}, latticeKindParent...)
	for _, col := range latticeColumns {
		edges = append(edges, [2]string{"nil", col})
	}
	for _, edge := range edges {
		child, parent := edge[0], edge[1]
		y2 := y(child) - boxH/2
		parts = append(parts, svgPath("M"+itoa(x(parent))+" "+itoa(y(parent)+boxH/2)+
			"V"+itoa(y2-(rowH-boxH)/2)+"H"+itoa(x(child))+"V"+itoa(y2), "av-line"))
	}

	placed := 0
	for _, row := range latticeRows {
		for _, name := range row {
			text := latticeCell(counts, name)
			w := (viewLen(text) + 2) * svgCH
			cls := "av-box"
			if name == text {
				cls = "av-cell"
			}
			placed += len(counts[name])
			parts = append(parts, svgRect(x(name)-w/2, y(name)-boxH/2, w, boxH, cls))
			// The name and the count in ONE text element, as the tree
			// does it: two runs on one baseline, so the count is muted
			// without the figure having to place it.
			parts = append(parts, "<text x=\""+itoa(x(name))+"\" y=\""+
				itoa(y(name)+5)+"\" text-anchor=\"middle\">"+
				"<tspan class=\"av-t\">"+viewSvgEsc(name)+"</tspan>"+
				"<tspan class=\"av-m\">"+viewSvgEsc(text[len(name):])+"</tspan></text>")
		}
	}

	return svgDoc(width*svgCH+2*svgPAD, 2*svgPAD+boxH+(len(latticeRows)-1)*rowH,
		"Value lattice at "+at+": "+itoa(placed)+" value(s) placed", parts, style)
}

// latticeLines is the figure's height. The row count is fixed -- the
// lattice is the language's, and no option makes it smaller -- so
// `--max-rows` below it is still a refusal, because a figure that
// quietly overran a stated bound is the thing every other kind here
// refuses to be; the message says raise rather than narrow.
var latticeLines = 3*len(latticeRows) - 2

func drawLattice(root Val, at, as, style string, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	if "" == at {
		at = "$"
	}
	anchor := anchorAt(root, at)
	if nil == anchor {
		// The same code and the same sentence `get` answers with, for
		// the same question.
		return "", []VetFinding{viewFinding("no_path", "reference", at,
			"The path "+at+" names nothing in this document.", "")}
	}
	if max < latticeLines {
		return "", []VetFinding{viewFinding("view_rows_exceeded", "budget", "$",
			"The figure has "+itoa(latticeLines)+" rows, above --max-rows "+
				itoa(max)+"; the value lattice is fixed, so raise the limit.",
			"rows: "+itoa(latticeLines)+", max: "+itoa(max))}
	}
	counts, unplaced := latticeCensus(anchor, at)

	if 0 < len(unplaced) {
		// NOT A LOSS OF DETAIL BUT A LOSS OF PLACE: these values are
		// real, and the figure cannot say where they are because they
		// are not anywhere single. Named, not merely counted -- a
		// reader who sees `2` wants to know which two.
		*loss = append(*loss, ViewLoss{
			Code: "lattice_unplaced", Count: len(unplaced), Detail: unplaced})
	}

	if "svg" == as {
		return latticeSvg(counts, at, style), nil
	}
	return latticeText(counts, style), nil
}
