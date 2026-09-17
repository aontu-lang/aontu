/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"sort"
	"strconv"
)

const (
	DiffAdded   = "added"
	DiffRemoved = "removed"
	DiffChanged = "changed"
)

type DiffChange struct {
	Kind  string `json:"kind"`
	Left  string `json:"left,omitempty"`
	Path  string `json:"path"`
	Right string `json:"right,omitempty"`
}

type DiffReport struct {
	Changes  []DiffChange `json:"changes"`
	Findings []VetFinding `json:"findings"`
	OK       bool         `json:"ok"`
	Same bool `json:"same"`
}

type DiffOptions struct {
	// At compares at this path of both documents, rather than at the
	// root.
	At        string
	LeftPath  string
	RightPath string
}

func diffWalk(left, right Val, parts []string, out *[]DiffChange) {
	if nil == left {
		*out = append(*out, DiffChange{
			Kind: DiffAdded, Path: subPathText(parts), Right: Hcanon(right)})
		return
	}
	if nil == right {
		*out = append(*out, DiffChange{
			Kind: DiffRemoved, Left: Hcanon(left), Path: subPathText(parts)})
		return
	}

	lm, lIsMap := left.(*MapVal)
	rm, rIsMap := right.(*MapVal)
	ll, lIsList := left.(*ListVal)
	rl, rIsList := right.(*ListVal)

	if lIsMap && rIsMap {
		// The bag's OWN attributes, at pseudo-keys under it: a
		// recursing bag never compares its own text, so what the
		// children do not carry has to be compared here.
		diffSpread(lm.spread, rm.spread, parts, out)
		diffFlag(lm.closed, rm.closed, parts, "closed", out)
		diffFlag(lm.markedType(), rm.markedType(), parts, "type", out)
		diffFlag(lm.markedHide(), rm.markedHide(), parts, "hide", out)
		keys := map[string]bool{}
		for _, k := range lm.keys {
			keys[k] = true
		}
		for _, k := range rm.keys {
			keys[k] = true
		}
		all := make([]string, 0, len(keys))
		for k := range keys {
			all = append(all, k)
		}
		sort.Strings(all)
		for _, k := range all {
			diffWalk(lm.peg[k], rm.peg[k], append(cp(parts), k), out)
		}
		return
	}
	if lIsList && rIsList {
		diffSpread(ll.spread, rl.spread, parts, out)
		diffFlag(ll.closed, rl.closed, parts, "closed", out)
		diffFlag(ll.markedType(), rl.markedType(), parts, "type", out)
		diffFlag(ll.markedHide(), rl.markedHide(), parts, "hide", out)
		n := len(ll.peg)
		if len(rl.peg) > n {
			n = len(rl.peg)
		}
		for i := 0; i < n; i++ {
			var lv, rv Val
			if i < len(ll.peg) {
				lv = ll.peg[i]
			}
			if i < len(rl.peg) {
				rv = rl.peg[i]
			}
			diffWalk(lv, rv, append(cp(parts), strconv.Itoa(i)), out)
		}
		return
	}

	lh, rh := Hcanon(left), Hcanon(right)
	if lh != rh {
		*out = append(*out, DiffChange{
			Kind: DiffChanged, Left: lh, Path: subPathText(parts), Right: rh})
	}
}

// diffFlag compares one boolean attribute of a bag, as a pseudo-key:
// `$.a.&closed` says the map at `$.a` was closed (or opened) without
// saying anything about its keys.
func diffFlag(left, right bool, parts []string, name string, out *[]DiffChange) {
	if left == right {
		return
	}
	*out = append(*out, DiffChange{
		Kind:  DiffChanged,
		Left:  strconv.FormatBool(left),
		Path:  subPathText(append(cp(parts), "&"+name)),
		Right: strconv.FormatBool(right),
	})
}

func diffSpread(left, right Val, parts []string, out *[]DiffChange) {
	lc, rc := "", ""
	if nil != left {
		lc = Hcanon(left)
	}
	if nil != right {
		rc = Hcanon(right)
	}
	if lc == rc {
		return
	}
	kind := DiffChanged
	if "" == lc {
		kind = DiffAdded
	} else if "" == rc {
		kind = DiffRemoved
	}
	*out = append(*out, DiffChange{
		Kind: kind, Left: lc, Path: subPathText(append(cp(parts), "&")), Right: rc,
	})
}

func diffSide(src, path, at string) (Val, *VetFinding) {
	a := New()
	if "" != path {
		a = NewWithBase(path)
	}
	root, uerr := a.Unify(src)
	if nil != uerr || nil == root || root.Nil() {
		// The query surface's own fold: a document that does not stand
		// up has no meaning to compare, and the engine's diagnosis IS
		// the report.
		f := engineFinding(evalError(uerr, root, nil), "$")
		return nil, &f
	}
	if "" == at {
		return root, nil
	}
	node := anchorAt(root, at)
	if nil == node {
		f := queryFinding("no_path", at,
			"The path "+at+" names nothing in this document.", "")
		return nil, &f
	}
	return node, nil
}

func Diff(leftSrc, rightSrc string, opts *DiffOptions) DiffReport {
	options := DiffOptions{}
	if nil != opts {
		options = *opts
	}

	lv, lf := diffSide(leftSrc, options.LeftPath, options.At)
	rv, rf := diffSide(rightSrc, options.RightPath, options.At)
	findings := []VetFinding{}
	if nil != lf {
		findings = append(findings, *lf)
	}
	if nil != rf {
		findings = append(findings, *rf)
	}
	if 0 < len(findings) {
		return DiffReport{
			Changes: []DiffChange{}, Findings: findings, OK: false, Same: false}
	}

	changes := []DiffChange{}
	diffWalk(lv, rv, nil, &changes)
	return DiffReport{
		Changes:  changes,
		Findings: []VetFinding{},
		OK:       true,
		Same:     0 == len(changes),
	}
}
