/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"sort"
	"strconv"
	"strings"
)

// coverTemplate is the path segment a spread is spelled with: the same
// character the language spells it with, and one no map key can
// collide with, since a bare `&` cannot be a key.
const coverTemplate = "&"

type VetCoverage struct {
	Checked int `json:"checked"`
	// Declared counts the declarations the schema makes under the
	// anchor: a map key, a list index, or a template, at every depth.
	Declared int `json:"declared"`
	// Leaves counts data leaves in all, under CoverageAt when it is
	// given. Checked over this is the ratio a reader wants.
	Leaves int `json:"leaves"`
	Unchecked []string `json:"unchecked"`
	// Unused names the SHALLOWEST declarations no data path met.
	Unused []string `json:"unused"`
	// Vacuous reports that NO data leaf was constrained, over a
	// document that has leaves. The exact condition of the `"*"`
	// failure, and what `--strict-coverage` exits 1 on.
	Vacuous bool `json:"vacuous"`
}

// coverKid is one child of a bag, in the order the walk visits it.
type coverKid struct {
	key string
	val Val
}

// coverKids lists a bag's children: a map's keys in code-point order
// (so both ports walk one order), a list's elements by index.
func coverKids(v Val) []coverKid {
	switch b := v.(type) {
	case *MapVal:
		keys := make([]string, 0, len(b.peg))
		for k := range b.peg {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make([]coverKid, 0, len(keys))
		for _, k := range keys {
			out = append(out, coverKid{key: k, val: b.peg[k]})
		}
		return out
	case *ListVal:
		out := make([]coverKid, 0, len(b.peg))
		for i, m := range b.peg {
			out = append(out, coverKid{key: strconv.Itoa(i), val: m})
		}
		return out
	}
	return nil
}

func coverSpread(v Val) Val {
	var sp Val
	switch b := v.(type) {
	case *MapVal:
		sp = b.spread
	case *ListVal:
		sp = b.spread
	}
	if nil == sp {
		return nil
	}
	if _, isTop := sp.(*TopVal); isTop {
		return nil
	}
	return sp
}

func coverDeclare(v Val, path []string, out map[string]bool) {
	if tpl := coverSpread(v); nil != tpl {
		at := append(append([]string{}, path...), coverTemplate)
		out[subPathText(at)] = true
		coverDeclare(tpl, at, out)
	}
	for _, kid := range coverKids(v) {
		at := append(append([]string{}, path...), kid.key)
		out[subPathText(at)] = true
		coverDeclare(kid.val, at, out)
	}
}

// coverDataPath is one path in the data, and whether it is a LEAF -- a
// node with no children, which is where a value lives.
type coverDataPath struct {
	path string
	leaf bool
}

func coverWalkData(v Val, path []string, out *[]coverDataPath) {
	kids := coverKids(v)
	if 0 < len(path) {
		*out = append(*out, coverDataPath{
			path: subPathText(path), leaf: 0 == len(kids),
		})
	}
	for _, kid := range kids {
		coverWalkData(kid.val, append(append([]string{}, path...), kid.key), out)
	}
}

// A spread or a key can carry a shape-preserving call or a reference,
// and coverage wants the bag under it; the seen set settles a cycle.
func coverThrough(v Val, root Val) Val {
	at := v
	seen := map[Val]bool{}
	for nil != at && !seen[at] {
		seen[at] = true
		switch b := at.(type) {
		case *MapVal:
			return b
		case *ListVal:
			return b
		case *FuncVal:
			if ("close" != b.name && "type" != b.name) || 1 > len(b.peg) {
				return nil
			}
			at = b.peg[0]
		case *RefVal:
			// A relative reference reads from where it was WRITTEN, not
			// where the template lands, so the engine's rule is the one.
			at = coverRefTarget(root, b.plainRefPath())
		case *RecurseVal:
			at = coverRefTarget(root, b.target)
		default:
			return nil
		}
	}
	return nil
}

// A reference descends a list by the segment AS WRITTEN: `$.Defs.0`.
func coverRefTarget(root Val, segs []string) Val {
	if nil == segs {
		return nil
	}
	at := root
	for _, name := range segs {
		switch b := at.(type) {
		case *MapVal:
			at = b.peg[name]
		case *ListVal:
			i, ok := listIndex(name)
			if !ok || i >= len(b.peg) {
				return nil
			}
			at = b.peg[i]
		default:
			return nil
		}
	}
	return at
}

func coverMatch(anchor Val, segs []string, root Val) string {
	at := anchor
	decl := ""
	for _, seg := range segs {
		at = coverThrough(at, root)
		if nil == at {
			return ""
		}
		var named Val
		switch b := at.(type) {
		case *MapVal:
			named = b.peg[seg]
		case *ListVal:
			if i, err := strconv.Atoi(seg); nil == err &&
				0 <= i && i < len(b.peg) {
				named = b.peg[i]
			}
		}
		if nil != named {
			if "" == decl {
				decl = seg
			} else {
				decl += "." + seg
			}
			at = named
			continue
		}
		tpl := coverSpread(at)
		if nil == tpl {
			return ""
		}
		if "" == decl {
			decl = coverTemplate
		} else {
			decl += "." + coverTemplate
		}
		at = tpl
	}
	return "$." + decl
}

func coverShallowest(paths []string) []string {
	held := map[string]bool{}
	for _, p := range paths {
		held[p] = true
	}
	out := []string{}
	for _, p := range paths {
		covered := false
		for at := p; strings.Contains(at, "."); {
			at = at[:strings.LastIndex(at, ".")]
			if held[at] {
				covered = true
				break
			}
		}
		if !covered {
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return out
}

// vetCoverageOf is the accounting itself: what the schema declared,
// what the data holds, and which of each the other met.
func vetCoverageOf(anchor, dataVal Val, coverageAt string, root Val) VetCoverage {
	declarations := map[string]bool{}
	coverDeclare(anchor, nil, declarations)

	dataPaths := []coverDataPath{}
	coverWalkData(dataVal, nil, &dataPaths)

	under := strings.TrimPrefix(strings.TrimPrefix(coverageAt, "$"), ".")
	inScope := func(p string) bool {
		if "" == under {
			return true
		}
		want := "$." + under
		return p == want || strings.HasPrefix(p, want+".")
	}

	used := map[string]bool{}
	unchecked := []string{}
	checked, leaves := 0, 0
	for _, dp := range dataPaths {
		if !inScope(dp.path) {
			continue
		}
		segs := []string{}
		for _, s := range strings.Split(
			strings.TrimPrefix(strings.TrimPrefix(dp.path, "$"), "."), ".") {
			if "" != s {
				segs = append(segs, s)
			}
		}
		decl := coverMatch(anchor, segs, root)
		if dp.leaf {
			leaves++
		}
		if "" == decl {
			unchecked = append(unchecked, dp.path)
			continue
		}
		used[decl] = true
		if dp.leaf {
			checked++
		}
	}

	// A declaration is met when it constrained a data path, or when a
	// declaration BENEATH it was: `$.a` is used by `$.a.b` meeting
	// `$.a.b`, and reporting the parent as unused would be false.
	unused := []string{}
	for decl := range declarations {
		covered := used[decl]
		if !covered {
			for u := range used {
				if strings.HasPrefix(u, decl+".") {
					covered = true
					break
				}
			}
		}
		if !covered {
			unused = append(unused, decl)
		}
	}

	return VetCoverage{
		Checked:   checked,
		Declared:  len(declarations),
		Leaves:    leaves,
		Unchecked: coverShallowest(unchecked),
		Unused:    coverShallowest(unused),
		Vacuous: 0 == checked && 0 < leaves,
	}
}
