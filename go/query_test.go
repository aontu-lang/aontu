/* Copyright (c) 2025 Richard Rodger, MIT License */


package aontu

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
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
	r := a.Get(`a: @"./part.aon"`, "$.a.k", &QueryOptions{View: QueryCanon})
	if !r.OK || "7" != r.Out {
		t.Fatalf("relative load not resolved: %+v", r)
	}
}

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
	// arm queryFailed reaches for a nil AontuError. It is unregistered,
	// so the registry classes it as an engine defect.
	if f := EvalFailure(errors.New("plain")); "unify_failed" != f.Code ||
		"internal" != f.Class ||
		"The document does not evaluate." != f.Message {
		t.Fatalf("plain error finding: %+v", f)
	}
}

func TestQueryAnEngineCodeTakesItsClassFromTheRegistry(t *testing.T) {
	// The registry wins: the report layer mints no class of its own.
	r := New().Get(`out: folder("src", [line("x")])`, "$.out", nil)
	if r.OK || 1 != len(r.Findings) {
		t.Fatalf("bad refusal: %+v", r)
	}
	f := r.Findings[0]
	if "invalid-arg" != f.Code || "conflict" != f.Class || "$" != f.Path ||
		0 != len(f.Sites) {
		t.Fatalf("finding: %+v", f)
	}

	// One line, with the repair beside it rather than inside it.
	if "[aontu/invalid-arg]: Cannot children values at path $.out" != f.Message {
		t.Fatalf("message: %q", f.Message)
	}
	if nil == f.Hint ||
		!strings.HasPrefix(*f.Hint, "Invalid argument provided.") {
		t.Fatalf("hint: %+v", f.Hint)
	}
}

func TestQueryAnEngineMessageIsTheHeadlineAlone(t *testing.T) {
	r := New().Get("out: {a: string}", "$.out", nil)
	if r.OK || 1 != len(r.Findings) {
		t.Fatalf("bad refusal: %+v", r)
	}
	f := r.Findings[0]
	if "mapval_no_gen" != f.Code || "incomplete" != f.Class ||
		"$.out" != f.Path {
		t.Fatalf("finding: %+v", f)
	}
	if "[aontu/mapval_no_gen]: Cannot resolve value at path $.out.a" !=
		f.Message {
		t.Fatalf("message: %q", f.Message)
	}
}

// A PARSE-CLASS FINDING CARRIES THE REGISTRY HINT like any other.
func TestQueryAParseCodeCarriesTheRegistryHint(t *testing.T) {
	r := New().Why("a:]", "$")
	if r.OK || 1 != len(r.Findings) {
		t.Fatalf("bad refusal: %+v", r)
	}
	f := r.Findings[0]
	if "syntax" != f.Code || "parse" != f.Class {
		t.Fatalf("finding: %+v", f)
	}
	if nil == f.Hint {
		t.Fatalf("no hint: %+v", f)
	}
	_, want, _ := ExplainCode("syntax")
	if want != *f.Hint {
		t.Errorf("hint is not the registry's: %q", *f.Hint)
	}
}

func TestQueryAnEngineMessageCarriesNoTerminalEscapes(t *testing.T) {
	// Nothing sets colour off for a library consumer.
	on := true
	SetColor(&on)
	defer SetColor(nil)
	f := New().Get(`out: folder("src", [line("x")])`, "$.out", nil).Findings[0]
	if strings.ContainsRune(f.Message, 0x1b) {
		t.Fatalf("message: %q", f.Message)
	}
	if nil == f.Hint || strings.ContainsRune(*f.Hint, 0x1b) {
		t.Fatalf("hint: %+v", f.Hint)
	}
}
