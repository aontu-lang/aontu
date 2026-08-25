/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRelativeSourceLoadWithBase checks that NewWithBase resolves a
// relative @"file" load against the given directory, regardless of the
// process working directory.
func TestRelativeSourceLoadWithBase(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(dir, "child.aontu"), []byte("{ x: 2 }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	out, err := NewWithBase(dir).Generate("parent: 1\nchild: @\"./child.aontu\"\n")
	if err != nil {
		t.Fatalf("generate with base: %v", err)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("want map, got %T", out)
	}
	child, ok := m["child"].(map[string]any)
	if !ok || child["x"] != int64(2) {
		t.Fatalf("relative load with base: want child {x:2}, got %v", m["child"])
	}
}

// TestNestedRelativeSourceLoad checks that a relative @"file" load inside
// a loaded file resolves against that file's own directory — across
// directories (parent in dir, child+grand in a subdir).
func TestNestedRelativeSourceLoad(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "sub")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(p, s string) {
		if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(dir, "main.aontu"), "top: 1\nchild: @\"./sub/child.aontu\"\n")
	write(filepath.Join(sub, "child.aontu"), "mid: 2\ngrand: @\"./grand.aontu\"\n")
	write(filepath.Join(sub, "grand.aontu"), "{ v: 99 }\n")

	src, err := os.ReadFile(filepath.Join(dir, "main.aontu"))
	if err != nil {
		t.Fatal(err)
	}
	out, err := NewWithBase(dir).Generate(string(src))
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	m := out.(map[string]any)
	child, ok := m["child"].(map[string]any)
	if !ok {
		t.Fatalf("child: want map, got %v", m["child"])
	}
	grand, ok := child["grand"].(map[string]any)
	if !ok || grand["v"] != int64(99) {
		t.Fatalf("nested relative load: want grand {v:99}, got %v", child["grand"])
	}
}

// TestAbsoluteSourceLoadIgnoresBase confirms an absolute @"file" load
// resolves regardless of (even a bogus) base.
func TestAbsoluteSourceLoadIgnoresBase(t *testing.T) {
	dir := t.TempDir()
	childAbs := filepath.Join(dir, "child.aontu")
	if err := os.WriteFile(childAbs, []byte("{ x: 7 }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// sp: a native Windows path inside an @"..." include is eaten by the
	// lexer, because a backslash there is a string escape (see sp's own
	// note in trust_test.go).
	out, err := NewWithBase("/nonexistent/base").Generate("v: @\"" + srcPath(childAbs) + "\"\n")
	if err != nil {
		t.Fatalf("generate absolute load: %v", err)
	}
	m := out.(map[string]any)
	v, ok := m["v"].(map[string]any)
	if !ok || v["x"] != int64(7) {
		t.Fatalf("absolute load: want {x:7}, got %v", m["v"])
	}
}

// TestInvalidUTF8ReplacementTwin is the invalid-utf8-replacement twin in
// ts/test/error.test.ts (issue #32, family 2).
//
// The fixture holds two invalid sequences: a truncated three-byte
// sequence (E2 82) and a lone FF. Each must become exactly ONE U+FFFD,
// which is the maximal-subpart rule Node's decoder applies as it reads
// the file -- so TypeScript never saw the bad bytes at all. This port
// carried them to the JSON encoder, which replaced them PER BYTE, so the
// truncated sequence generated TWO replacements and both were written as
// `�` escapes rather than as the character.
//
// The source cannot be a shared spec row: the spec's src column is text,
// and these bytes are by definition not.
func TestInvalidUTF8ReplacementTwin(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "test", "spec", "files", "invalid-utf8.aon"))
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	out, gerr := New().Generate(string(data))
	if gerr != nil {
		t.Fatalf("generate: %v", gerr)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("want map, got %T", out)
	}
	if m["b"] != "x�y" {
		t.Fatalf("b: want %q, got %q", "x�y", m["b"])
	}
	if m["c"] != "p�q" {
		t.Fatalf("c: want %q, got %q", "p�q", m["c"])
	}
}

// TestParseErrorNamesFile checks that a parse-stage error frame names the
// entry source, rather than the `<no-file>` the parser falls back to
// (issue #50).
//
// The name reaches the parser through meta["fileName"], which is what TS
// passes as popts.path; without it every Go syntax error pointed at
// `<no-file>` while the canonical engine named the file. There is no
// shared spec row for this: the runner parses source strings, and the
// display name is a property of the caller, not of the source.
func TestParseErrorNamesFile(t *testing.T) {
	a := New()
	a.File = "model.aon"

	// A syntax error, rendered by the parser itself.
	_, err := a.Generate("1'00]")
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "model.aon:1:5") {
		t.Fatalf("syntax frame: %q", err.Error())
	}

	// ... and one rendered by aontu's own frame renderer, which takes the
	// same name by the same route.
	_, err = a.Generate("<<<<<<< HEAD\na:1\n")
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "model.aon:1:1") {
		t.Fatalf("merge_conflict frame: %q", err.Error())
	}

	// With no name set, the parser's own fallback still applies.
	_, err = New().Generate("1'00]")
	if err == nil || !strings.Contains(err.Error(), "<no-file>") {
		t.Fatalf("unnamed fallback: %v", err)
	}
}
