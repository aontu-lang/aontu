/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli why cases in ts/test/cli.test.ts. The record
// itself is pinned by test/spec/why.tsv in both ports; these cases
// hold the command line and the text rendering.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func whyRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"model", "why"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func whyFile(t *testing.T, dir, src string) string {
	t.Helper()
	file := filepath.Join(dir, "doc.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const whyDoc = "services: {\n  &: { replicas: *1 | integer }\n" +
	"  auth: { replicas: 3 }\n  db: {}\n}\n"

func TestWhyNamesEveryContribution(t *testing.T) {
	file := whyFile(t, t.TempDir(), whyDoc)

	out, _, code := whyRun("$.services.auth.replicas", file)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	vetMatch(t, out, `^\$\.services\.auth\.replicas = 3`)
	vetMatch(t, out, `1\. \*1\|integer.*doc\.aontu:2:18  \(spread\)`)
	vetMatch(t, out, `2\. 3.*doc\.aontu:3:21`)

	out, _, code = whyRun("$.services.db.replicas", file)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	vetMatch(t, out, `1\. \*1\|integer.*doc\.aontu:2:18  \(spread\)`)

	top := whyFile(t, t.TempDir(), "a: top\n")
	out, _, code = whyRun("$.a", top)
	if 0 != code || !strings.Contains(out, "no contributions") {
		t.Fatalf("want 0/no contributions, got %d: %s", code, out)
	}

	out, _, code = whyRun("$.services.auth.replicas", "--format", "json", file)
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb string `json:"verb"`
		} `json:"aontu"`
		OK     bool `json:"ok"`
		Record struct {
			Conjuncts []struct {
				Role string `json:"role"`
			} `json:"conjuncts"`
			Value string `json:"value"`
		} `json:"record"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "model why" != report.Aontu.Verb || !report.OK || "3" != report.Record.Value ||
		2 != len(report.Record.Conjuncts) ||
		"spread" != report.Record.Conjuncts[0].Role {
		t.Fatalf("bad report: %s", out)
	}
}

func TestWhyExitCodesAndUsage(t *testing.T) {
	dir := t.TempDir()
	file := whyFile(t, dir, "a:{b:1}")

	_, errw, code := whyRun("$.zz", file)
	if 1 != code || !strings.Contains(errw, "no_path") {
		t.Fatalf("want 1/no_path, got %d: %s", code, errw)
	}

	broken := whyFile(t, t.TempDir(), "a:1 a:2")
	if _, _, code = whyRun("$.a", broken); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}

	for _, args := range [][]string{
		{},
		{"$.a"},
		{"$.a", file, file},
		{"--bogus", "$.a", file},
		{"$.a", "--format", "yaml", file},
		{"$.a", "--format"},
		{"$.a", filepath.Join(t.TempDir(), "missing.aontu")},
	} {
		if _, _, code := whyRun(args...); 2 != code {
			t.Fatalf("%v: want 2, got %d", args, code)
		}
	}

	out, _, code := whyRun("--help")
	if 0 != code || !strings.Contains(out, "aontu why") {
		t.Fatalf("want help, got %d", code)
	}
}
