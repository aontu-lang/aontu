/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// What the two ports must AGREE on about reachability is
// test/spec/reach.tsv. This file holds the arms that are this port's
// own: the parse-failure path `parseEntry` gives Go, which collect mode
// gives TypeScript on the context instead.

import "testing"

func TestReachUnparseableSource(t *testing.T) {
	// `a: {` PARSES (an unclosed map is a pending value); an unclosed
	// STRING does not, which is what reaches parseEntry's error return.
	r := New().Reach("a: \"unterminated", "a", "b", nil)
	if "error" != r.Verdict {
		t.Fatalf("verdict %q, want error", r.Verdict)
	}
	if 1 != len(r.Errors) {
		t.Fatalf("errors: %v", r.Errors)
	}
	if "" == r.Errors[0].Code {
		t.Fatalf("a refusal with no code: %v", r.Errors[0])
	}
	if nil != r.Path {
		t.Fatalf("a refusal carried a path: %v", r.Path)
	}
}

// A NIL ROOT WITH AN EMPTY ERROR LIST, at the LIBRARY level
// (use-cases/BUGS.md §43). The CLI twin in cmd/aontu covers the verbs;
// this covers `failureFinding`'s fallback itself, which lives in this
// package and which a cmd-package test does not reach.
func TestANilRootWithNoCollectedErrorBuildsItsFindingFromTheRoot(t *testing.T) {
	src := "&:\n"
	for name, r := range map[string][]VetFinding{
		"reach":      New().Reach(src, "b", "b", nil).Errors,
		"relation":   New().RelationCheck(src).Errors,
		"jsonschema": New().JSONSchema(src, "").Errors,
	} {
		if 1 != len(r) {
			t.Fatalf("%s: errors %v", name, r)
		}
		if "elided_value" != r[0].Code {
			t.Fatalf("%s: code %q, want elided_value", name, r[0].Code)
		}
	}
}
