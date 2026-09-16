/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"sort"
	"strconv"
)

// The outcome half of the publish gate (ADR-022): every position the
// prior version generates with nothing supplied, the next version must
// generate, to the same value. Admission is Subsume's.

type OutcomeReport struct {
	Verdict  string       `json:"verdict"`
	Findings []VetFinding `json:"findings"`
}

func compatMarked(v Val) bool {
	return nil != v && (v.markedType() || v.markedHide())
}

// The canon of what a position generates with nothing supplied, and
// whether generation settles on one value at all.
func compatDetermined(v Val) (string, bool) {
	if nil == v || compatMarked(v) {
		return "", false
	}
	switch b := v.(type) {
	case *ScalarVal:
		return b.Canon(), true
	case *PrefVal:
		return compatDetermined(b.peg)
	case *DisjunctVal:
		var best *PrefVal
		for _, m := range b.peg {
			if p, ok := m.(*PrefVal); ok && (nil == best || p.rank < best.rank) {
				best = p
			}
		}
		if nil != best {
			return compatDetermined(best)
		}
	}
	return "", false
}

func compatChildren(v Val) (keys []string, child func(string) Val, isBag bool) {
	switch b := v.(type) {
	case *MapVal:
		for _, k := range b.keys {
			if !b.isAliasKey(k) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		return keys, func(k string) Val { return b.peg[k] }, true
	case *ListVal:
		for i := range b.peg {
			keys = append(keys, strconv.Itoa(i))
		}
		return keys, func(k string) Val { i, _ := strconv.Atoi(k); return b.peg[i] }, true
	}
	return nil, nil, false
}

func compatGenerates(v Val) bool {
	if keys, child, isBag := compatChildren(v); isBag {
		if compatMarked(v) {
			return false
		}
		for _, k := range keys {
			if compatGenerates(child(k)) {
				return true
			}
		}
		return false
	}
	_, ok := compatDetermined(v)
	return ok
}

func compatRecord(st *subState, code string, path []string, prior, next Val, message string) {
	f := VetFinding{
		Code:     code,
		Class:    "compat",
		Severity: "error",
		Path:     subPathText(path),
		Message:  message,
		Sites:    []VetSite{},
		Actual:   strPtr(prior.Canon()),
	}
	if nil != next {
		f.Sites = append(f.Sites, subSiteOf(next, "general", st.generalURL, st.generalSrc))
		f.Expected = strPtr(next.Canon())
	}
	f.Sites = append(f.Sites, subSiteOf(prior, "specific", st.specificURL, st.specificSrc))
	st.findings = append(st.findings, f)
}

func compatWalk(st *subState, prior, next Val, path []string) {
	if keys, child, isBag := compatChildren(prior); isBag {
		if compatMarked(prior) {
			return
		}
		_, priorMap := prior.(*MapVal)
		_, nextChild, nextBag := compatChildren(next)
		_, nextMap := next.(*MapVal)
		if nextBag && priorMap == nextMap {
			for _, k := range keys {
				compatWalk(st, child(k), nextChild(k), append(append([]string{}, path...), k))
			}
		} else if _, ok := compatDetermined(next); compatGenerates(prior) && !ok {
			compatRecord(st, "compat_undetermined", path, prior, next,
				"resolved to a value in the prior version; nothing resolves it now")
		}
		return
	}
	was, ok := compatDetermined(prior)
	if !ok {
		return
	}
	now, ok := compatDetermined(next)
	if !ok {
		compatRecord(st, "compat_undetermined", path, prior, next,
			"resolved to "+was+" in the prior version; nothing resolves it now")
	} else if now != was {
		compatRecord(st, "compat_outcome_changed", path, prior, next,
			"resolved to "+was+" in the prior version; resolves to "+now+" now")
	}
}

// CompatOutcome compares what both versions generate: determination
// and agreement, as findings, with verdict ok, breaking or error.
func CompatOutcome(nextSrc, priorSrc string, opts *SubsumeOptions) OutcomeReport {
	options := SubsumeOptions{}
	if nil != opts {
		options = *opts
	}
	generalURL := options.GeneralURL
	if "" == generalURL {
		generalURL = "general"
	}
	specificURL := options.SpecificURL
	if "" == specificURL {
		specificURL = "specific"
	}
	st := &subState{
		findings:    []VetFinding{},
		generalURL:  generalURL,
		specificURL: specificURL,
		generalSrc:  nextSrc,
		specificSrc: priorSrc,
	}
	load := func(src, path string) Val {
		a := aontuForPathTrust(path, options.Trust, options.TextExt)
		v, err := a.Unify(src)
		if err != nil || nil == v || v.Nil() {
			return nil
		}
		return v
	}
	next := load(nextSrc, options.GeneralPath)
	prior := load(priorSrc, options.SpecificPath)
	if nil == next || nil == prior {
		return OutcomeReport{Verdict: "error", Findings: []VetFinding{}}
	}
	compatWalk(st, prior, next, nil)
	verdict := "ok"
	if 0 < len(st.findings) {
		verdict = "breaking"
	}
	return OutcomeReport{Verdict: verdict, Findings: st.findings}
}
