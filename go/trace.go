/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
)

// TraceEntry is the file a piece reached, the rule that wrote it and
// the model node the dispatch matched. Mirrors TraceEntry in
// ts/src/trace.ts.
type TraceEntry struct {
	At   string `json:"at"`
	File string `json:"file"`
	Node string `json:"node"`
	Rule string `json:"rule"`
}

type TraceReport struct {
	Verdict string       `json:"verdict"`
	Trace   []TraceEntry `json:"trace"`
	Errors  []VetFinding `json:"errors,omitempty"`
}

type traceFile struct {
	at   string
	name string
}

// traceMark is one stamped piece and where it sits.
type traceMark struct {
	path string
	mark *emitOrigin
}

func traceWalk(root Val, fn func(v Val, path []string)) {
	var walk func(v Val, path []string)
	walk = func(v Val, path []string) {
		if nil == v { //coverage:ignore a resolved tree holds no nil, and keys may outlive peg
			return
		}
		fn(v, path)
		switch n := v.(type) {
		case *ListVal:
			for i, el := range n.peg {
				walk(el, append(cp(path), itoa(i)))
			}
		case *MapVal:
			keys := append([]string(nil), n.keys...)
			sort.Strings(keys)
			for _, k := range keys {
				if !n.isAliasKey(k) {
					walk(n.peg[k], append(cp(path), k))
				}
			}
		}
	}
	walk(root, []string{})
}

func traceAddr(path []string) string {
	out := "$"
	for _, seg := range path {
		out += "." + seg
	}
	return out
}

func traceFileName(v Val) string {
	m, ok := v.(*MapVal)
	if !ok {
		return ""
	}
	cmp, ok := stringPeg(m.peg["cmp"])
	if !ok || "File" != cmp {
		return ""
	}
	props, ok := m.peg["props"].(*MapVal)
	if !ok {
		return ""
	}
	name, _ := stringPeg(props.peg["name"])
	return name
}

// traceEnclosing answers the INNERMOST file holding a path: the
// longest matching prefix, not the first.
func traceEnclosing(files []traceFile, path string) string {
	best := ""
	long := -1
	for _, f := range files {
		if (path == f.at || strings.HasPrefix(path, f.at+".")) && len(f.at) > long {
			best = f.name
			long = len(f.at)
		}
	}
	return best
}

// TraceTree is every piece a dispatch stamped, attributed to the file
// it reached: one pass, a file always seen before the marks beneath it.
func TraceTree(root Val) []TraceEntry {
	files := []traceFile{}
	marks := []traceMark{}
	traceWalk(root, func(v Val, path []string) {
		if name := traceFileName(v); "" != name {
			files = append(files, traceFile{at: traceAddr(path), name: name})
		}
		if o := v.emitOrig(); nil != o {
			marks = append(marks, traceMark{path: traceAddr(path), mark: o})
		}
	})

	out := []TraceEntry{}
	for _, m := range marks {
		file := traceEnclosing(files, m.path)
		if "" == file {
			continue
		}
		out = append(out, TraceEntry{
			At: m.path, File: file, Node: m.mark.node, Rule: m.mark.rule})
	}
	return out
}

// TraceOptions is what the trace verb reads.
type TraceOptions struct {
	At string
}

// Trace is every piece a rule stamped under the component tree. The
// marks are OPT-IN: `emit` stamps only when the context carries a reads
// set. Mirrors traceRun in ts/src/trace.ts.
func (a *Aontu) Trace(src string, opts *TraceOptions) TraceReport {
	options := TraceOptions{}
	if nil != opts {
		options = *opts
	}

	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return TraceReport{Verdict: "error", Trace: []TraceEntry{},
			Errors: []VetFinding{parseFinding(a.File, VetRoleData, perr)}}
	}
	root, ctx, _ := a.unifyCtxReads(parsed, nil, src, map[string]bool{})
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return TraceReport{Verdict: "error", Trace: []TraceEntry{},
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	at := options.At
	if "" == at {
		at = "$.out"
	}
	node := anchorAt(root, at)
	if nil == node {
		ctx.err = append(ctx.err,
			makeNilErrFull(ctx, "no_path", root, nil, "at", nil))
		return TraceReport{Verdict: "error", Trace: []TraceEntry{},
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	return TraceReport{Verdict: "ok", Trace: TraceTree(node)}
}
