/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE SHAPE OF THE MODEL ITSELF, which no other kind draws. Mirrors
// drawDoc in ts/src/view.ts function for function.
//
// Every other figure here reads a REPORT -- the edge set, the
// provenance record, the subsumption order -- and so can only draw a
// document that has links, contributions or peers. A reader meeting a
// model for the first time wants the plainer thing first: what is in
// it, and how it is arranged.
//
// This is `get --keys --types` as a picture, and it reads the same
// walk: map keys in code-point order, list indices in order, and a
// leaf's KIND rather than its value. Values are what the document is
// for; the shape is what a reader needs before any of them mean
// anything.
//
// DEPTH IS A BOUND, NOT AN ELISION MARK. Below it the subtree is not
// drawn and the row says how many keys were not drawn, because a tree
// that stops without saying so is the one thing a structural drawing
// must not be.

import (
	"sort"
	"strconv"
	"strings"
)

const viewDefaultDocDepth = 3

// throughDoc steps through a sizing residue and a preference, neither
// of which is a level of the shape.
func throughDoc(v Val) Val {
	node := throughResidue(v)
	if p, ok := node.(*PrefVal); ok {
		return throughDoc(p.peg)
	}
	return node
}

// docEntry is one child of a node: the key the figure writes and the
// value it names.
type docEntry struct {
	key   string
	child Val
}

// docEntries is a node's own children, as the anchor walk sees them.
// The key and the child come out of ONE walk rather than a listing
// followed by a lookup: a second lookup would need a not-found arm that
// nothing can reach, since every key it is given came from the listing.
func docEntries(v Val) []docEntry {
	switch n := throughDoc(v).(type) {
	case *MapVal:
		// AN ALIAS DECLARATION IS NOT PART OF THE DOCUMENT
		// (docs/reference-language.md, "Aliases"): it does not
		// generate and it does not appear in canon. It IS a key of the
		// root map in the value tree, which `get --keys` reports and
		// this does not -- a figure of the document's shape that showed
		// `%Cents` beside `customers` would be drawing the declaration
		// as data (use-cases/BUGS.md 74).
		keys := []string{}
		for k := range n.peg {
			if strings.HasPrefix(k, "%") {
				continue
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make([]docEntry, 0, len(keys))
		for _, k := range keys {
			out = append(out, docEntry{key: k, child: n.peg[k]})
		}
		return out
	case *ListVal:
		out := make([]docEntry, 0, len(n.peg))
		for i, c := range n.peg {
			out = append(out, docEntry{key: strconv.Itoa(i), child: c})
		}
		return out
	}
	return nil
}

// docLeaf is what a leaf IS, in one short word: its canon, cut where
// the figure is the shape and not the data.
//
// A CONTAINER WITH NOTHING IN IT IS NOT A LEAF, and calling it one by
// writing nothing after the key would make it read as a value the
// figure declined to describe. Its canon says what it is -- `{}`, `[]`,
// or a template a spread wrote and no member filled.
func docLeaf(v Val) string {
	canon := throughDoc(v).Canon()
	if 32 < viewLen(canon) {
		return string([]rune(canon)[:29]) + "..."
	}
	return canon
}

type docFrame struct {
	kids   []docEntry
	at     int
	prefix string
	row    int
}

func drawDoc(root Val, at string, depth int, as, style string, max int,
	loss *[]ViewLoss) (string, []VetFinding) {
	paint := newPainter(style)
	if "" == at {
		at = "$"
	}
	anchor := anchorAt(root, at)
	if nil == anchor {
		// The same code and the same sentence `get` answers with: the
		// question is identical, so a caller that already handles one
		// handles the other.
		return "", []VetFinding{viewFinding("no_path", "reference", at,
			"The path "+at+" names nothing in this document.", "")}
	}
	if 0 == depth {
		depth = viewDefaultDocDepth
	}
	out := []string{at}
	rows := []*treeRow{{depth: 0, text: at, mark: "", parent: 0}}
	elided := 0

	// ITERATIVE, like the dependency tree's walk and for the same
	// reason: a deep model is a real shape, and the drawing of one must
	// not depend on how deep the interpreter lets a recursion go.
	stack := []*docFrame{{kids: docEntries(anchor), at: 0, prefix: "", row: 0}}
	for 0 < len(stack) {
		frame := stack[len(stack)-1]
		if frame.at >= len(frame.kids) {
			stack = stack[:len(stack)-1]
			continue
		}
		entry := frame.kids[frame.at]
		frame.at++
		last := frame.at == len(frame.kids)
		child := throughDoc(entry.child)
		kids := docEntries(child)
		under := len(stack) < depth
		// A container the depth bound stops at says how many keys are
		// not drawn; a leaf says what it is.
		// A leaf says what it is and a stopped container says how many
		// keys it holds; both are written after the key with one space,
		// and neither is ever empty (a canon has at least one
		// character).
		mark := ""
		if 0 == len(kids) {
			mark = " " + docLeaf(child)
		} else if !under {
			mark = " (" + strconv.Itoa(len(kids)) + ")"
			elided += len(kids)
		}
		branch := "├── "
		indent := "│   "
		if last {
			branch = "└── "
			indent = "    "
		}
		out = append(out, paint.paint(roleRule, frame.prefix+branch)+entry.key+
			paint.paint(roleMuted, mark))
		rows = append(rows, &treeRow{depth: len(stack), text: entry.key, mark: mark, parent: frame.row})
		if max < len(rows) {
			return "", []VetFinding{viewRowsFinding(len(rows), max, "--at or --depth")}
		}
		if 0 < len(kids) && under {
			stack = append(stack, &docFrame{
				kids: kids, at: 0,
				prefix: frame.prefix + indent,
				row:    len(rows) - 1,
			})
		}
	}
	if 0 < elided {
		*loss = append(*loss, ViewLoss{Code: "depth_elided", Count: elided})
	}
	if "svg" == as {
		return treeSvg(rows, "Document tree at "+at+": "+
			strconv.Itoa(len(rows)-1)+" keys to depth "+strconv.Itoa(depth), style), nil
	}
	return strings.Join(out, "\n"), nil
}
