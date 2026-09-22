/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func trimRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"trim"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func trimFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestTrimVerb(t *testing.T) {
	file := trimFile(t, "a:{&:{deep:1}, b:{deep:1}, c:{other:2}}")
	out, _, code := trimRun("--check", file)
	if 1 != code {
		t.Fatalf("want 1, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: redundant`)
	vetMatch(t, out, `\$\.a\.b\.deep`)

	file = trimFile(t, "x:{y:1}")
	out, _, code = trimRun("--check", file)
	if 0 != code || "verdict: clean" != strings.TrimSpace(out) {
		t.Fatalf("want clean/0, got %d:\n%s", code, out)
	}

	file = trimFile(t, "a:1 a:2")
	if _, _, code = trimRun("--check", file); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}

	file = trimFile(t, "a:{&:{k:1},m:{k:1}}")
	out, _, code = trimRun("--check", "--format", "json", file)
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb string `json:"verb"`
		} `json:"aontu"`
		Verdict   string   `json:"verdict"`
		Redundant []string `json:"redundant"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "trim" != report.Aontu.Verb || "redundant" != report.Verdict ||
		1 != len(report.Redundant) || "$.a.m.k" != report.Redundant[0] {
		t.Fatalf("bad report: %s", out)
	}
}

func TestTrimUsageErrorsExit2(t *testing.T) {
	file := trimFile(t, "a:1")
	// Report-only: rewriting needs a format-preserving editor (G7), so
	// --check is required rather than silently defaulted.
	_, errw, code := trimRun(file)
	if 2 != code || !strings.Contains(errw, "pass --check") {
		t.Fatalf("want 2/pass --check, got %d: %s", code, errw)
	}
	if _, _, code = trimRun("--check"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = trimRun("--check", file, file); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = trimRun("--bogus"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = trimRun("--check", "--format", "yaml", file); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = trimRun("--check", filepath.Join(t.TempDir(), "missing.aontu")); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	out, _, code := trimRun("--help")
	if 0 != code || !strings.Contains(out, "aontu trim") {
		t.Fatalf("want help, got %d", code)
	}
}
