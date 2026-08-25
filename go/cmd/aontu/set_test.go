/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli set cases in ts/test/cli.test.ts. What the
// two ports must agree on (the report) is pinned by
// test/spec/patch.tsv; these cases hold the command line and, above
// all, WHEN THE FILE IS WRITTEN.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"set"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func writeAt(t *testing.T, path, src string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
}

func readAt(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestSetAppendsWhenTheChangeHolds(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "sys.aon")
	overlay := filepath.Join(dir, "ov.aon")
	writeAt(t, entry,
		"services: { auth: { owner: string, replicas: *1 | integer } }")

	// An ABSENT overlay is the empty overlay, and the file is created.
	out, _, code := setRun(`$.services.auth.owner="identity-2"`,
		"--entry", entry, "--overlay", overlay)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	vetMatch(t, out, `verdict: valid`)
	vetMatch(t, out, `wrote:`)
	if want := "\"services\": \"auth\": \"owner\": \"identity-2\"\n"; want != readAt(t, overlay) {
		t.Fatalf("overlay: %q", readAt(t, overlay))
	}

	// A second assignment appends after the first.
	if _, _, code = setRun("$.services.auth.replicas=5",
		"--entry", entry, "--overlay", overlay); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	want := "\"services\": \"auth\": \"owner\": \"identity-2\"\n" +
		"\"services\": \"auth\": \"replicas\": 5\n"
	if want != readAt(t, overlay) {
		t.Fatalf("overlay: %q", readAt(t, overlay))
	}

	out, _, code = setRun(`$.services.auth.owner="identity-2"`,
		"--format", "json", "--entry", entry, "--overlay", overlay)
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb string `json:"verb"`
		} `json:"aontu"`
		Appended []string `json:"appended"`
		Verdict  string   `json:"verdict"`
		Written  bool     `json:"written"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "set" != report.Aontu.Verb || "valid" != report.Verdict ||
		!report.Written || 1 != len(report.Appended) {
		t.Fatalf("bad report: %s", out)
	}
}

// A change that contradicts a PINNED value is a question for the
// author at the pinning site: reported, exit 1, and NOT written.
func TestSetRefusesToWriteAChangeThatDoesNotHold(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "sys.aon")
	overlay := filepath.Join(dir, "ov.aon")
	writeAt(t, entry, "port: 3")
	writeAt(t, overlay, "x: 1\n")

	_, errw, code := setRun("$.port=5", "--entry", entry, "--overlay", overlay)
	if 1 != code || !strings.Contains(errw, "verdict: invalid") {
		t.Fatalf("want 1/invalid, got %d: %s", code, errw)
	}
	if "x: 1\n" != readAt(t, overlay) {
		t.Fatalf("overlay was written: %q", readAt(t, overlay))
	}

	// --dry-run prints the verdict and writes nothing, even when it
	// would have held.
	out, _, code := setRun("$.port=3", "--dry-run",
		"--entry", entry, "--overlay", overlay)
	if 0 != code || !strings.Contains(out, "(dry run)") {
		t.Fatalf("want 0/dry run, got %d: %s", code, out)
	}
	if "x: 1\n" != readAt(t, overlay) {
		t.Fatalf("overlay was written: %q", readAt(t, overlay))
	}

	// An entry that does not stand up is verdict error, exit 4.
	writeAt(t, entry, "a:1 a:2")
	if _, _, code = setRun("$.b=1",
		"--entry", entry, "--overlay", overlay); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}
	if "x: 1\n" != readAt(t, overlay) {
		t.Fatalf("overlay was written: %q", readAt(t, overlay))
	}
}

func TestSetUsageErrorsExit2(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "sys.aon")
	overlay := filepath.Join(dir, "ov.aon")
	writeAt(t, entry, "a:{b:integer}")

	for _, args := range [][]string{
		{},
		{"$.a.b=1"},
		{"$.a.b=1", "--entry", entry},
		{"--entry", entry, "--overlay", overlay},
		{"$.a.b=1", "--bogus", "--entry", entry, "--overlay", overlay},
		{"$.a.b=1", "--format", "yaml", "--entry", entry, "--overlay", overlay},
		{"$.a.b=1", "--format"},
		{"$.a.b=1", "--entry", filepath.Join(dir, "missing.aon"),
			"--overlay", overlay},
		// An overlay that cannot be READ (a directory, not a missing
		// file) is a usage error, not an empty overlay.
		{"$.a.b=1", "--entry", entry, "--overlay", dir},
		// A --entry or --overlay with no value after it.
		{"$.a.b=1", "--entry"},
		// An overlay whose DIRECTORY does not exist reads as absent
		// (the empty overlay) and then fails to write, which is also
		// usage.
		{"$.a.b=1", "--entry", entry,
			"--overlay", filepath.Join(dir, "no-such-dir", "ov.aon")},
	} {
		if _, _, code := setRun(args...); 2 != code {
			t.Fatalf("%v: want 2, got %d", args, code)
		}
	}

	out, _, code := setRun("--help")
	if 0 != code || !strings.Contains(out, "aontu set") {
		t.Fatalf("want help, got %d", code)
	}
}

// `--in-place` at the COMMAND LINE, closing the loop the status report
// says `set` could not: the data pins the wrong value, and appending can
// only contradict it. The report shape is pinned by test/spec/patch.tsv;
// what this holds is the flag, the `replaced:` line, and the bytes that
// end up on disk -- comments included. The TS twin is
// set-in-place-rewrites-the-pinned-literal in ts/test/cli.test.ts.
func TestSetInPlaceRewritesThePinnedLiteral(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "schema.aon")
	overlay := filepath.Join(dir, "deploy.aon")
	writeAt(t, entry, "replicas: integer & above(0) & below(10)\n")
	writeAt(t, overlay, "# the deployment\nreplicas: 42   # too many\n")

	// WITHOUT the flag this is the defect: nothing written, exit 1.
	_, errOut, code := setRun("$.replicas=5", "--entry", entry, "--overlay", overlay)
	if 1 != code {
		t.Fatalf("want 1 without --in-place, got %d", code)
	}
	vetMatch(t, errOut, `verdict: invalid`)
	if want := "# the deployment\nreplicas: 42   # too many\n"; want != readAt(t, overlay) {
		t.Fatalf("overlay moved without the flag: %q", readAt(t, overlay))
	}

	// WITH it, the literal is rewritten where it was written.
	out, _, code := setRun("$.replicas=5",
		"--entry", entry, "--overlay", overlay, "--in-place")
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	vetMatch(t, out, `verdict: valid`)
	vetMatch(t, out, `replaced: .*deploy\.aon:2:11 42 -> 5`)
	vetMatch(t, out, `wrote:`)
	// BOTH COMMENTS SURVIVE, the one on the edited line included.
	if want := "# the deployment\nreplicas: 5   # too many\n"; want != readAt(t, overlay) {
		t.Fatalf("overlay: %q", readAt(t, overlay))
	}
}

// Where it cannot rewrite it APPENDS, exactly as plain set would, and
// says why. --dry-run still writes nothing.
func TestSetInPlaceAppendsAndExplainsWhenItCannotRewrite(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "schema.aon")
	overlay := filepath.Join(dir, "ov.aon")
	writeAt(t, entry, "a: integer\n")
	writeAt(t, overlay, "a: 1+2\n")

	_, errOut, code := setRun("$.a=5",
		"--entry", entry, "--overlay", overlay, "--in-place", "--dry-run")
	if 1 != code {
		t.Fatalf("want 1, got %d: %s", code, errOut)
	}
	vetMatch(t, errOut, `patch_not_editable`)
	vetMatch(t, errOut, `opening token`)
	if "a: 1+2\n" != readAt(t, overlay) {
		t.Fatalf("dry run wrote: %q", readAt(t, overlay))
	}
}

// WHAT THE TEXT RENDERER SAYS ABOUT AN EDIT THAT DID NOT HAPPEN, and
// WHICH STREAM A SUCCESSFUL RUN WRITES TO. Both were wrong when
// --in-place landed and both are load-bearing for an operator. The TS
// twin is set-in-place-reports-unapplied-edits-and-uses-the-right-stream.
func TestSetInPlaceReportsUnappliedEditsAndUsesTheRightStream(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "e.aon")
	overlay := filepath.Join(dir, "ov.aon")

	// ONE ASSIGNMENT REPLACEABLE, ANOTHER REFUSED. The write is refused
	// as a whole, so the file is untouched -- and the renderer must not
	// report the replaceable one in the PAST TENSE.
	writeAt(t, entry, "a: integer\nb: integer & below(10)\n")
	writeAt(t, overlay, "a: 1\nb: 42\n")
	_, errOut, code := setRun("$.a=2", "$.b=99",
		"--entry", entry, "--overlay", overlay, "--in-place")
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	vetMatch(t, errOut, `would replace: .*1 -> 2`)
	if strings.Contains(errOut, "\nreplaced:") {
		t.Fatalf("reported an edit that did not happen: %s", errOut)
	}
	if "a: 1\nb: 42\n" != readAt(t, overlay) {
		t.Fatalf("overlay moved: %q", readAt(t, overlay))
	}

	// A SUCCESSFUL RUN CARRYING ONLY A WARNING puts its status on
	// STDOUT. Routing on the finding count sent this whole report to
	// stderr and left stdout empty, so a shell capture got nothing while
	// the command exited 0 and wrote the file.
	writeAt(t, entry, "a: integer\n")
	writeAt(t, overlay, "a: integer\n")
	out, errOut, code := setRun("$.a=5",
		"--entry", entry, "--overlay", overlay, "--in-place")
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, errOut)
	}
	vetMatch(t, out, `verdict: valid`)
	vetMatch(t, out, `wrote:`)
	vetMatch(t, errOut, `patch_not_editable`)
	if strings.Contains(errOut, "verdict:") {
		t.Fatalf("status duplicated onto stderr: %s", errOut)
	}
}
