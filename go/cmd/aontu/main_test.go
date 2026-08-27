/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	aontu "github.com/rjrodger/aontu/go"
)

func TestRenderJSON(t *testing.T) {
	out, err := render(aontu.New(), "a:1 b:$.a", "json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"a": 1`) || !strings.Contains(out, `"b": 1`) {
		t.Fatalf("unexpected json output:\n%s", out)
	}
}

// The CLI must not HTML-escape, and must write exact leaves as exact
// digits — the same two choices the shared suite's gens mode makes.
// Neither is visible to a spec row: the shared runner serialises with
// its own encoder (specGens), so the CLI's rendering is only covered
// here. json.MarshalIndent, which this used to call, escapes <, > and &
// by default and so printed different bytes from the canonical
// TypeScript CLI for any document containing them.
func TestRenderJSONMatchesTypeScriptBytes(t *testing.T) {
	cases := []struct{ src, want string }{
		// TypeScript: exactJSON(generate(src), 2), which never escapes.
		{`a:"<b>&</b>"`, "{\n  \"a\": \"<b>&</b>\"\n}"},
		// The exact leaves reach JSON as exact digits (D9), an integral
		// bigdecimal keeping its `.0` and a biginteger not gaining one.
		{"a:0d9007199254740993", "{\n  \"a\": 9007199254740993\n}"},
		{"a:0d1e3\nb:0d1000", "{\n  \"a\": 1000.0,\n  \"b\": 1000\n}"},
	}
	for _, c := range cases {
		out, err := render(aontu.New(), c.src, "json")
		if err != nil {
			t.Fatalf("%s: %v", c.src, err)
		}
		if out != c.want {
			t.Fatalf("render(%q):\n got: %q\nwant: %q", c.src, out, c.want)
		}
	}
}

func TestRenderCanon(t *testing.T) {
	out, err := render(aontu.New(), "a:*1|number", "canon")
	if err != nil {
		t.Fatal(err)
	}
	if out != `{"a":*1|number}` {
		t.Fatalf("canon: %q", out)
	}
}

func TestRenderError(t *testing.T) {
	_, err := render(aontu.New(), "a:1 a:2", "json")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "Cannot unify value: 2 with value: 1") {
		t.Fatalf("error: %v", err)
	}
}

func TestReplSession(t *testing.T) {
	in := strings.NewReader("a:1 b:$.a\n:canon\na:1|2\n:quit\n")
	var out strings.Builder
	repl("json", false, trustArg{}, in, &out)
	s := out.String()
	if !strings.Contains(s, `"b": 1`) {
		t.Fatalf("repl json output missing:\n%s", s)
	}
	if !strings.Contains(s, `{"a":1|2}`) {
		t.Fatalf("repl canon output missing:\n%s", s)
	}
}

// TestAontuForFileRelativeLoad checks the file-evaluation path resolves
// a relative @"file" load against the entry file's directory (the fix
// for `aontu /path/to/main.aontu` failing from another cwd).
func TestAontuForFileRelativeLoad(t *testing.T) {
	dir := t.TempDir()
	mainPath := filepath.Join(dir, "main.aontu")
	if err := os.WriteFile(mainPath,
		[]byte("parent: 1\nchild: @\"./child.aontu\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "child.aontu"),
		[]byte("{ x: 2 }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	src, err := os.ReadFile(mainPath)
	if err != nil {
		t.Fatal(err)
	}
	out, err := render(aontuForFile(mainPath), string(src), "json")
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !strings.Contains(out, `"x": 2`) {
		t.Fatalf("relative @\"file\" load not resolved by aontuForFile:\n%s", out)
	}
}

func TestReplEmptyAndUnknown(t *testing.T) {
	in := strings.NewReader("\n:nope\n")
	var out strings.Builder
	repl("json", false, trustArg{}, in, &out)
	if !strings.Contains(out.String(), "unknown command") {
		t.Fatalf("expected unknown command notice:\n%s", out.String())
	}
}

// render surfaces an encoder failure rather than printing partial JSON.
// A sum that overflows binary64 generates as +Inf, which encoding/json
// refuses — the one input shape that reaches the Encode error arm.
// A NON-FINITE SUM IS REFUSED BY THE ENGINE, NOT BY THE ENCODER.
//
// This test used to assert the opposite, and pinned a defect: the sum
// reached the JSON encoder as +Inf and came back as Go's raw
// `json: unsupported value: +Inf` -- no `[aontu/...]` code, no site, and
// a different failure entirely from TypeScript's, which crashed with
// `[aontu/internal]` (use-cases/BUGS.md 39). Both ports now refuse the
// sum where it is written, with float_overflow.
//
// That is also why render's own encode-error branch is now marked
// unreachable: with the engine refusing every non-finite float, no
// generated value reaches the encoder that it cannot encode.
func TestFloatOverflowIsRefusedNotUnencodable(t *testing.T) {
	const max = "1.7976931348623157e308"
	out, err := render(aontu.New(), "a: "+max+"+"+max, "json")
	if err == nil {
		t.Fatalf("want a located refusal, got %q", out)
	}
	if out != "" {
		t.Fatalf("want empty output, got %q", out)
	}
	if strings.Contains(err.Error(), "unsupported value") {
		t.Fatalf("the raw encoder error escaped again: %v", err)
	}
	if !strings.Contains(err.Error(), "float_overflow") {
		t.Fatalf("want float_overflow, got %v", err)
	}
}
