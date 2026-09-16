/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli get cases in ts/test/cli.test.ts. The views
// themselves are pinned by test/spec/query.tsv in both ports; these
// cases hold the command line — flag parsing, the exit classes, and
// where each answer goes.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func getRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"model", "get"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func getFile(t *testing.T, dir, src string) string {
	t.Helper()
	file := filepath.Join(dir, "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestGetRendersOneNodePerView(t *testing.T) {
	file := getFile(t, t.TempDir(),
		"svc:{auth:{image:\"a:v2\",replicas:3}}\nport: *8080|integer\n")

	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{"$.svc.auth.replicas"}, "3"},
		{[]string{"$.svc.auth", "--canon"}, `{"image":"a:v2","replicas":3}`},
		{[]string{"$.svc.auth", "--types"}, `{"image":string,"replicas":integer}`},
		{[]string{"$.svc", "--keys"}, "auth"},
		{[]string{"$", "--canon", "--depth", "1"}, `{"port":top,"svc":top}`},
	} {
		out, _, code := getRun(append(c.args, file)...)
		if 0 != code || c.want != strings.TrimSpace(out) {
			t.Fatalf("%v: want %q/0, got %q/%d", c.args, c.want, out, code)
		}
	}

	out, _, code := getRun("$.svc.auth", "--format", "json", file)
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb string `json:"verb"`
		} `json:"aontu"`
		Findings []any `json:"findings"`
		OK       bool  `json:"ok"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "model get" != report.Aontu.Verb || !report.OK || 0 != len(report.Findings) {
		t.Fatalf("bad report: %s", out)
	}
}

// A path that names nothing is the QUESTION's answer — exit 1, the
// "no" class — while a document that does not stand up is exit 4.
func TestGetExitCodesSeparateNoFromBroken(t *testing.T) {
	dir := t.TempDir()
	file := getFile(t, dir, `svc:{auth:{image:"a"}}`)
	out, errw, code := getRun("$.svc.auht", file)
	if 1 != code || "" != out {
		t.Fatalf("want 1/empty, got %d/%q", code, out)
	}
	vetMatch(t, errw, `no_path`)
	vetMatch(t, errw, `did you mean auth\?`)

	getFile(t, dir, "a:1 a:2")
	if _, _, code = getRun("$", file); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}

	// A value that is not concrete has no JSON, and says so as an
	// error rather than inventing one.
	getFile(t, dir, "k: integer")
	if _, _, code = getRun("$.k", file); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}
	out, _, code = getRun("$.k", "--canon", file)
	if 0 != code || "integer" != strings.TrimSpace(out) {
		t.Fatalf("want integer/0, got %q/%d", out, code)
	}
}

func TestGetUsageErrorsExit2(t *testing.T) {
	file := getFile(t, t.TempDir(), "a:{b:1}")
	for _, args := range [][]string{
		{},
		{"$.a"},
		{"$.a", file, file},
		{"--bogus", "$.a", file},
		{"$.a", "--format", "yaml", file},
		{"$.a", "--format"},
		{"$.a", "--depth", "x", file},
		{"$.a", "--depth", "0", file},
		{"$.a", "--depth"},
		{"$.a", filepath.Join(t.TempDir(), "missing.aon")},
	} {
		if _, _, code := getRun(args...); 2 != code {
			t.Fatalf("%v: want 2, got %d", args, code)
		}
	}

	// Eliding below a depth means rendering `top`, which JSON cannot
	// say — refused rather than silently switching the view.
	_, errw, code := getRun("$.a", "--depth", "1", file)
	if 2 != code || !strings.Contains(errw, "JSON cannot say top") {
		t.Fatalf("want 2/JSON cannot say top, got %d: %s", code, errw)
	}

	out, _, code := getRun("--help")
	if 0 != code || !strings.Contains(out, "aontu get") {
		t.Fatalf("want help, got %d", code)
	}
}
