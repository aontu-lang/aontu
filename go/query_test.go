/* Copyright (c) 2025 Richard Rodger, MIT License */

// The Go twin of ts/test/query.test.ts (G7 phase 2). What the two
// ports must AGREE on is pinned by test/spec/query.tsv; what is left
// here is the API's own surface and the walk's answers for inputs no
// CLI can produce. Cross-package runs (the CLI tests) do not count
// toward this package's coverage, so those arms are exercised here.

package aontu

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestQueryDefaultsToJSONView(t *testing.T) {
	// Nil options at all: the whole node, generated.
	r := New().Get("a:{b:1}", "$.a", nil)
	if !r.OK || "{\n  \"b\": 1\n}" != r.Out || 0 != len(r.Findings) {
		t.Fatalf("bad default view: %+v", r)
	}
}

func TestQueryRefusalIsAFinding(t *testing.T) {
	// Get invents no error format: the refusal is the same finding
	// object Vet and Subsume report, so one consumer reads all three.
	r := New().Get("a:{b:1}", "$.a.c", nil)
	if r.OK || "" != r.Out || 1 != len(r.Findings) {
		t.Fatalf("bad refusal: %+v", r)
	}
	f := r.Findings[0]
	if "no_path" != f.Code || "reference" != f.Class || "error" != f.Severity ||
		"$.a.c" != f.Path || 0 != len(f.Sites) {
		t.Fatalf("bad finding: %+v", f)
	}
}

func TestQueryRelativeLoadResolvesFromDocumentDir(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(dir, "part.aon"), []byte("k: 7"), 0o600); nil != err {
		t.Fatal(err)
	}
	a := NewWithBase(dir)
	r := a.Get(`a: @"part.aon"`, "$.a.k", &QueryOptions{View: QueryCanon})
	if !r.OK || "7" != r.Out {
		t.Fatalf("relative load not resolved: %+v", r)
	}
}

// The nearest-key suggestion: close enough to help, or nothing at all.
// A wrong suggestion costs more than none, which is why the cutoff is
// half the name rather than "the closest sibling wins".
func TestQueryNearestKey(t *testing.T) {
	cases := []struct {
		want string
		have []string
		out  string
	}{
		{"imag", []string{"image", "ports"}, "image"},
		{"image", nil, ""},
		{"replicas", []string{"image"}, ""},
		// A one-character name still gets its one-character neighbour.
		{"a", []string{"b"}, "b"},
	}
	for _, c := range cases {
		if got := queryNearestKey(c.want, c.have); got != c.out {
			t.Fatalf("nearestKey(%q, %v) = %q, want %q", c.want, c.have, got, c.out)
		}
	}
}

func TestQueryPathParts(t *testing.T) {
	cases := []struct {
		in  string
		out []string
	}{
		{"$", []string{}},
		{"", []string{}},
		{"$.", []string{}},
		{"$.a.b", []string{"a", "b"}},
		// Written without the root marker, as a reference may be.
		{"a.b", []string{"a", "b"}},
	}
	for _, c := range cases {
		got := queryPathParts(c.in)
		if len(got) != len(c.out) {
			t.Fatalf("pathParts(%q) = %v, want %v", c.in, got, c.out)
		}
		for i := range got {
			if got[i] != c.out[i] {
				t.Fatalf("pathParts(%q) = %v, want %v", c.in, got, c.out)
			}
		}
	}
}

// A parse failure has no tree to select from, and the report says so
// with the parser's own code — the arm a unify failure cannot reach.
func TestQueryUnparseableDocument(t *testing.T) {
	r := New().Get("a:]", "$", nil)
	if r.OK || 1 != len(r.Findings) || "$" != r.Findings[0].Path {
		t.Fatalf("bad parse refusal: %+v", r)
	}
}

// The projection arm no SOURCE reaches (G7 phase 2): a junction member
// that is itself a junction of more than one term. Post-unification
// junctions are flattened by norm, so only a constructed tree still
// nests one — and the rule has to hold anyway, because a view is a
// DOCUMENT: rendering `(1|2)&3` as the differently-parsing `1|2&3`
// would be a view that no longer subsumes what it summarises.
func TestQueryNestedJunctionKeepsItsParens(t *testing.T) {
	root := newMap()
	root.set("j", newConjunct([]Val{
		newDisjunct([]Val{newInteger(1), newInteger(2)}),
		newInteger(3),
	}))
	if got := queryProject(root, QueryCanon, 99); `{"j":(1|2)&3}` != got {
		t.Fatalf("canon view: %s", got)
	}
	if got := queryProject(root, QueryTypes, 99); `{"j":(integer|integer)&integer}` != got {
		t.Fatalf("types view: %s", got)
	}
}

// The other wrapping arm: a CONJUNCT nested in a disjunct, which the
// same rule parenthesises for the same reason.
func TestQueryNestedConjunctKeepsItsParens(t *testing.T) {
	root := newMap()
	root.set("d", newDisjunct([]Val{
		newConjunct([]Val{newInteger(1), newInteger(2)}),
		newInteger(3),
	}))
	if got := queryProject(root, QueryCanon, 99); `{"d":(1&2)|3}` != got {
		t.Fatalf("canon view: %s", got)
	}
}

// EvalFailure is the exported spelling of the one finding a document
// that does not stand up answers with, and its only caller lives in
// another package (cmd/aontu's `hash`), so nothing here would reach it
// otherwise. Twin: the evalFailure cases in ts/test/query.test.ts.
func TestEvalFailureIsTheEnginesOwnDiagnosis(t *testing.T) {
	a := New()
	if _, err := a.Unify("a:1 a:2"); nil != err {
		f := EvalFailure(err)
		if "$" != f.Path || "error" != f.Severity || "" == f.Code {
			t.Fatalf("conflict finding: %+v", f)
		}
	} else {
		t.Fatal("a:1 a:2 unified")
	}

	// An error the engine did not shape carries the generic code, the
	// arm queryFailed reaches for a nil AontuError.
	if f := EvalFailure(errors.New("plain")); "unify_failed" != f.Code ||
		"The document does not evaluate." != f.Message {
		t.Fatalf("plain error finding: %+v", f)
	}
}
