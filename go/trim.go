/* Copyright (c) 2025 Richard Rodger, MIT License */

// The trim reporter (G3 phase 6, the Go side of ts/src/trim.ts):
// report REDUNDANT map entries — entries whose removal leaves the
// evaluated result unchanged, the spread-implied case included — as
// paths. Report-only, deliberately: canon discards comments and
// layout, so REWRITING the file needs G7's format-preserving patch
// surface.
//
// The test is EVALUATE-AND-COMPARE: for each candidate entry, re-parse
// the source, delete the entry from the parsed tree, evaluate, and
// compare canons. A removal that ERRORS is not redundant: the entry is
// load-bearing. Parsed trees are single-use, so every probe is its own
// parse.

package aontu

import (
	"strings"
)

const (
	TrimClean     = "clean"
	TrimRedundant = "redundant"
	TrimError     = "error"
)

// TrimReport is the whole answer: one verdict, and the redundant paths.
type TrimReport struct {
	// Errors is WHY the run could not be made, in the same finding shape
	// Vet reports in (the review's finding F). An `error` verdict used
	// to arrive with an empty report -- something is wrong with the
	// document, and nothing about what -- which is the one answer a
	// repair loop cannot act on. Present ONLY on an `error` verdict, so
	// a clean report stays exactly the two fields it always was.
	Errors    []VetFinding `json:"errors,omitempty"`
	Redundant []string     `json:"redundant"`
	Verdict   string       `json:"verdict"`
}

// trimCandidates lists every (map, key) pair in a PARSED tree,
// parent-first. List ELEMENTS are not candidates: removing one shifts
// every later index, which is a different document, not the same one
// minus a redundancy. Entries of maps inside lists still are.
func trimCandidates(v Val, path []string, out *[][]string) {
	switch b := v.(type) {
	case *MapVal:
		for _, k := range b.keys {
			kp := append(append([]string{}, path...), k)
			*out = append(*out, kp)
			trimCandidates(b.peg[k], kp, out)
		}
	case *ListVal:
		for i, e := range b.peg {
			trimCandidates(e, append(path, itoa(i)), out)
		}
	}
}

// trimDeleteAt removes the entry at path from a parsed tree. False when
// the path does not address a map entry (which cannot happen for a
// candidate enumerated from an identical parse, but the walk stays
// honest).
func trimDeleteAt(root Val, path []string) bool {
	node := root
	for _, seg := range path[:len(path)-1] {
		switch b := node.(type) {
		case *MapVal:
			node = b.peg[seg]
		case *ListVal:
			i := -1
			for j := range b.peg {
				if itoa(j) == seg {
					i = j
					break
				}
			}
			if i < 0 {
				return false
			}
			node = b.peg[i]
		default:
			return false
		}
		if nil == node {
			return false
		}
	}
	key := path[len(path)-1]
	m, ok := node.(*MapVal)
	if !ok {
		return false
	}
	if _, has := m.peg[key]; !has {
		return false
	}
	delete(m.peg, key)
	keys := m.keys[:0]
	for _, k := range m.keys {
		if k != key {
			keys = append(keys, k)
		}
	}
	m.keys = keys
	opt := m.optional[:0]
	for _, k := range m.optional {
		if k != key {
			opt = append(opt, k)
		}
	}
	m.optional = opt
	return true
}

// trimEvalCanon parses (deleting the entry at delPath, when given),
// evaluates, and answers the canon — with ok=false when the source does
// not stand up, which for the baseline is the caller's error verdict
// and for a probe means "load-bearing".
// The third result is WHY, for the one caller that reports it, and nil
// for a failure that is an ANSWER rather than a fault: a probe whose
// deletion cannot land means "load-bearing".
func (a *Aontu) trimEvalCanon(
	src string, delPath []string) (string, bool, *VetFinding) {
	v, perr := a.parseEntry(src)
	if perr != nil {
		f := parseFinding(a.File, VetRoleData, perr)
		return "", false, &f
	}
	if nil == v { //coverage:ignore parseEntry answers a value or an error, never neither
		return "", false, nil
	}
	if nil != delPath && !trimDeleteAt(v, delPath) {
		return "", false, nil
	}
	ctx := &Ctx{root: v, src: src}
	res := unifyRoot(v, ctx)
	if nil == res || res.Nil() || 0 < len(ctx.err) {
		f := failureFinding(ctx, a.File, src)
		return "", false, &f
	}
	return res.Canon(), true, nil
}

// TrimCheck is the whole reporter: the baseline canon, then one probe
// per candidate entry, parent-first — and a child of a redundant parent
// is SKIPPED, because "remove the whole entry" already covers it and
// reporting both would tell the author to delete the same text twice.
// Mirrors trimCheck in ts/src/trim.ts.
func (a *Aontu) TrimCheck(src string) TrimReport {
	baseline, ok, fail := a.trimEvalCanon(src, nil)
	if !ok {
		return TrimReport{Verdict: TrimError, Redundant: []string{},
			Errors: []VetFinding{*fail}}
	}

	parsed, perr := a.parseEntry(src)
	if perr != nil { //coverage:ignore the baseline above already parsed this source
		return TrimReport{Verdict: TrimError, Redundant: []string{}}
	}
	paths := [][]string{}
	trimCandidates(parsed, nil, &paths)

	redundant := []string{}
	for _, path := range paths {
		parent := subPathText(path[:len(path)-1])
		covered := false
		for _, r := range redundant {
			if r == parent || strings.HasPrefix(parent, r+".") {
				covered = true
				break
			}
		}
		if covered {
			continue
		}
		if canon, ok, _ := a.trimEvalCanon(src, path); ok && baseline == canon {
			redundant = append(redundant, subPathText(path))
		}
	}

	verdict := TrimClean
	if 0 < len(redundant) {
		verdict = TrimRedundant
	}
	return TrimReport{Verdict: verdict, Redundant: redundant}
}
