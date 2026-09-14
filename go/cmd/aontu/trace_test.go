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

func TestTraceReadsATemplateEntry(t *testing.T) {
	dir := t.TempDir()
	write := func(name, text string) string {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	// The entry's extension decides, so a generator in the target's own
	// syntax is an entry rather than a preprocessing step.
	gen := write("gen.ts", "//- svc: { a: { n:\"a\" } }\n"+
		"//- out: file(\"x.ts\", emit($.svc, { match: n: string body: [\n"+
		"L\n//- ]}))\n")
	zz := write("gen.zz", ";;- svc: { a: { n:\"a\" } }\n"+
		";;- out: file(\"x.ts\", emit($.svc, { match: n: string body: [\n"+
		"L\n;;- ]}))\n")
	profile := write("zz.aon", "@\"aontu:profile\"\n\naontu: Lang: "+
		"{ lang:\"zz\" template: { marker:\";;-\" ext: [zz] } }\n")

	want := "x.ts\t$.children.0\t$.svc.a\t#0\n"
	if out, errw, code := traceRunCLI(gen); 0 != code || want != out {
		t.Fatalf("template entry: %d %q %q", code, out, errw)
	}
	// --marker reaches a language the table has not met, and --profile
	// declares the same marker once.
	if out, errw, code := traceRunCLI("--marker", ";;-", zz); 0 != code || want != out {
		t.Fatalf("--marker entry: %d %q %q", code, out, errw)
	}
	if out, errw, code := traceRunCLI("--profile", profile, zz); 0 != code || want != out {
		t.Fatalf("--profile entry: %d %q %q", code, out, errw)
	}

	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{"--marker"}, "--marker needs a token"},
		{[]string{"--profile"}, "--profile needs a file"},
		{[]string{"--profile", filepath.Join(dir, "gone.aon"), gen}, "cannot read"},
	} {
		_, errw, code := traceRunCLI(tc.args...)
		if 2 != code || !strings.Contains(errw, tc.want) {
			t.Fatalf("%v: %d %q", tc.args, code, errw)
		}
	}

	// A --profile document that does not stand up is exit 4; a second
	// profile claiming the same language is exit 2.
	bad := write("bad.aon", "aontu: Lang: { lang: 1 }\n")
	if _, errw, code := traceRunCLI("--profile", bad, gen); 4 != code ||
		!strings.Contains(errw, "aontu/") {
		t.Fatalf("bad profile: %d %q", code, errw)
	}
	dup := write("zz2.aon", "@\"aontu:profile\"\n\naontu: Lang: "+
		"{ lang:\"zz\" template: { marker:\";;-\" ext: [zz] } }\n")
	if _, errw, code := traceRunCLI(
		"--profile", profile, "--profile", dup, gen); 2 != code ||
		!strings.Contains(errw, "two profiles claim zz") {
		t.Fatalf("duplicate lang: %d %q", code, errw)
	}
}
