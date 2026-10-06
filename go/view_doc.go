/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu


import (
	"slices"
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
		keys := []string{}
		for k := range n.peg {
			if slices.Contains(n.aliasKeys, k) {
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
