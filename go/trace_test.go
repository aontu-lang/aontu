/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import "testing"

const traceSrc = `%r = emit(_, { match: n: string body: ["L" + .n] })
svc: { a: { n:"a" } }
out: file("x.ts", emit($.svc, %r))
`

func TestTraceReportsTheFileTheNodeAndTheRule(t *testing.T) {
	r := New().Trace(traceSrc, nil)
	if "ok" != r.Verdict || 1 != len(r.Trace) {
		t.Fatalf("verdict %s, %d entries", r.Verdict, len(r.Trace))
	}
	e := r.Trace[0]
	if "x.ts" != e.File || "$.svc.a" != e.Node || "$.%r#0" != e.Rule {
		t.Fatalf("unexpected entry: %+v", e)
	}
}

func TestTraceReadsAnExplicitAnchor(t *testing.T) {
	src := `svc: { a: { n:"a" } }
elsewhere: file("x.ts", emit($.svc, { match: n: string body: ["L"] }))
`
	if r := New().Trace(src, nil); "error" != r.Verdict {
		t.Fatalf("the default anchor should name nothing here: %s", r.Verdict)
	}
	r := New().Trace(src, &TraceOptions{At: "$.elsewhere"})
	if "ok" != r.Verdict || 1 != len(r.Trace) {
		t.Fatalf("verdict %s, %d entries", r.Verdict, len(r.Trace))
	}
	if r := New().Trace(src, &TraceOptions{At: "$.nowhere"}); "error" != r.Verdict {
		t.Fatalf("an anchor that names nothing is a finding: %s", r.Verdict)
	}
}

func TestTraceAnswersFindingsRatherThanPanicking(t *testing.T) {
	// Unparsable.
	if r := New().Trace("out: file(", nil); "error" != r.Verdict ||
		0 == len(r.Errors) {
		t.Fatalf("a parse failure is a finding: %+v", r)
	}
	// Parses, does not unify.
	if r := New().Trace("out: 1 & \"x\"\n", nil); "error" != r.Verdict {
		t.Fatalf("a unify failure is a finding: %+v", r)
	}
}

// A PIECE OUTSIDE EVERY FILE IS NOT TRACED. The tree is what the trace
// attributes to, so a rule that wrote no file has nothing to name.
func TestTraceSkipsAPieceThatReachedNoFile(t *testing.T) {
	src := `svc: { a: { n:"a" } }
out: emit($.svc, { match: n: string body: ["loose"] })
`
	r := New().Trace(src, nil)
	if "ok" != r.Verdict || 0 != len(r.Trace) {
		t.Fatalf("verdict %s, %d entries", r.Verdict, len(r.Trace))
	}
}
