/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func traceRunCLI(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"trace"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func traceFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const traceDoc = `%r = emit(_, { match: n: string body: ["L" + .n] })
svc: { a: { n:"a" } }
out: file("x.ts", emit($.svc, %r))
`

func TestTraceNamesTheFileTheNodeAndTheRule(t *testing.T) {
	file := traceFile(t, traceDoc)

	out, errw, code := traceRunCLI(file)
	if 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	// The text form is one tab-separated entry per line.
	fields := strings.Split(strings.TrimRight(out, "\n"), "\t")
	if 4 != len(fields) {
		t.Fatalf("want four columns, got %d: %q", len(fields), out)
	}
	if "x.ts" != fields[0] || "$.svc.a" != fields[2] || "$.%r#0" != fields[3] {
		t.Fatalf("unexpected entry: %q", out)
	}

	out, errw, code = traceRunCLI("--format", "json", file)
	if 0 != code {
		t.Fatalf("json code %d: %s", code, errw)
	}
	var got struct {
		Trace []map[string]string `json:"trace"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("not JSON: %v: %s", err, out)
	}
	if 1 != len(got.Trace) || "x.ts" != got.Trace[0]["file"] {
		t.Fatalf("unexpected json: %s", out)
	}
}

func TestTraceReadsAnAnchorAndRefusesOneThatNamesNothing(t *testing.T) {
	file := traceFile(t, strings.Replace(traceDoc, "out:", "elsewhere:", 1))

	// The default anchor is `$.out`, which this document does not have.
	if _, _, code := traceRunCLI(file); 4 != code {
		t.Fatalf("want 4 for a missing default anchor, got %d", code)
	}
	out, errw, code := traceRunCLI("--at", "$.elsewhere", file)
	if 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	if !strings.Contains(out, "x.ts") {
		t.Fatalf("the anchor did not reach the file: %q", out)
	}
	if _, _, code := traceRunCLI("--at", "$.nowhere", file); 4 != code {
		t.Fatalf("want 4 for an anchor that names nothing, got %d", code)
	}
}

func TestTraceRefusesBadArguments(t *testing.T) {
	file := traceFile(t, traceDoc)

	for _, c := range [][]string{
		{},
		{file, file},
		{"--format", "yaml", file},
		{"--format"},
		{"--at"},
		{"--nosuch", file},
		{filepath.Join(t.TempDir(), "missing.aon")},
		{"--trust", "nosuchlevel", file},
	} {
		if _, _, code := traceRunCLI(c...); 2 != code {
			t.Fatalf("want 2 for %v, got %d", c, code)
		}
	}

	// A document that does not parse is a finding, not a crash.
	bad := traceFile(t, "out: file(")
	if _, _, code := traceRunCLI(bad); 4 != code {
		t.Fatalf("want 4 for an unparsable document, got %d", code)
	}
}

func TestTraceHelpIsTheOneHelpText(t *testing.T) {
	out, _, code := traceRunCLI("--help")
	if 0 != code || !strings.Contains(out, "aontu trace") {
		t.Fatalf("code %d: %q", code, out)
	}
}
