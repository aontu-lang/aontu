/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli-subsume suite in ts/test/cli.test.ts: the
// same cases, asserting the same output. What the two ports must AGREE
// on (the report itself) is pinned by test/spec/subsume.tsv; what each
// port owns (argument handling, exit codes, the text rendering, git
// resolution) is here.

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// subFiles writes a general and a specific document to a fresh
// directory and returns their paths.
func subFiles(t *testing.T, general, specific string) (string, string, string) {
	t.Helper()
	dir := t.TempDir()
	g := filepath.Join(dir, "general.aon")
	s := filepath.Join(dir, "specific.aon")
	if err := os.WriteFile(g, []byte(general), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s, []byte(specific), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir, g, s
}

func subRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"subsume"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func brkRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"breaking"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func TestSubsumeExitCodesAreVerdictClasses(t *testing.T) {
	_, g, s := subFiles(t, "a:integer", "a:1")
	out, _, code := subRun(g, s)
	if 0 != code || "verdict: subsumes" != strings.TrimSpace(out) {
		t.Fatalf("want subsumes/0, got %d:\n%s", code, out)
	}

	_, g, s = subFiles(t, "a:integer", "a:hello")
	out, _, code = subRun(g, s)
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	vetMatch(t, out, `verdict: does_not_subsume`)
	vetMatch(t, out, `\$\.a: compat_narrowed \[compat\]`)
	vetMatch(t, out, `general: .*general\.aon:1:3 \(integer\)`)
	vetMatch(t, out, `specific: .*specific\.aon:1:3 \("hello"\)`)

	_, g, s = subFiles(t, "a:{x:1}|{x:2}", "a:{x:1|2}")
	if _, _, code = subRun(g, s); 3 != code {
		t.Fatalf("want 3, got %d", code)
	}

	_, g, s = subFiles(t, "a:1 a:2", "a:1")
	if _, _, code = subRun(g, s); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}
}

func TestSubsumeProfileSelectsTheComparison(t *testing.T) {
	_, g, s := subFiles(t, "a:*2|number", "a:*1|number")
	if _, _, code := subRun("--profile", "values", g, s); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	out, _, code := subRun("--profile", "defaults", g, s)
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	vetMatch(t, out, `compat_default_changed`)
}

func TestSubsumeAtAnchorsBothDocuments(t *testing.T) {
	_, g, s := subFiles(t, "a:{x:integer} b:2", "a:{x:1} b:xyz")
	if _, _, code := subRun("--at", "$.a", g, s); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	// A path missing from either side is an error verdict.
	if _, _, code := subRun("--at", "$.zz", g, s); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}
}

func TestSubsumeJSONNamesTheProducer(t *testing.T) {
	_, g, s := subFiles(t, "a:integer", "a:hello")
	out, _, code := subRun("--format", "json", g, s)
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	var report struct {
		Aontu struct {
			Mode string `json:"mode"`
			Verb string `json:"verb"`
		} `json:"aontu"`
		Verdict  string `json:"verdict"`
		Findings []struct {
			Code string `json:"code"`
		} `json:"findings"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "subsume" != report.Aontu.Verb || "" != report.Aontu.Mode ||
		"does_not_subsume" != report.Verdict ||
		"compat_narrowed" != report.Findings[0].Code {
		t.Fatalf("bad report: %s", out)
	}
}

func TestSubsumeUsageErrorsExit2(t *testing.T) {
	_, errw, code := subRun("--bogus")
	if 2 != code || !strings.Contains(errw, "unknown subsume option") {
		t.Fatalf("want 2/unknown, got %d: %s", code, errw)
	}
	if _, _, code = subRun("one.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = subRun("--profile", "bogus", "a.aon", "b.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = subRun("--at"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code = subRun("--format", "sarif", "a.aon", "b.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	dir, _, s := subFiles(t, "a:1", "a:1")
	if _, _, code = subRun(filepath.Join(dir, "missing.aon"), s); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	_, g, _ := subFiles(t, "a:1", "a:1")
	if _, _, code = subRun(g, filepath.Join(dir, "missing.aon")); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	out, _, code := subRun("--help")
	if 0 != code || !strings.Contains(out, "aontu subsume") {
		t.Fatalf("want help, got %d", code)
	}
}

// The design's own motivating example: the v2 that renames nothing but
// adds a required key and moves a default is BREAKING, with both
// witnesses located.
func TestBreakingDetectsTheDesignsV1V2Break(t *testing.T) {
	_, g, s := subFiles(t,
		"service: close({name:string,port:*9090|integer,owner:string})",
		"service: close({name:string,port:*8080|integer})")
	out, _, code := brkRun("--against", s, g)
	if 1 != code {
		t.Fatalf("want 1, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: breaking`)
	vetMatch(t, out, `\$\.service\.owner: compat_required_added`)
	vetMatch(t, out, `\$\.service\.port: compat_default_changed`)
}

func TestBreakingModesChooseTheDirections(t *testing.T) {
	// Widening (v2 admits more) is fine backward, breaking forward.
	_, g, s := subFiles(t, "a:number", "a:integer")
	if _, _, code := brkRun("--against", s, "--mode", "backward", g); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	if _, _, code := brkRun("--against", s, "--mode", "forward", g); 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	if _, _, code := brkRun("--against", s, "--mode", "full", g); 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
}

func TestBreakingResolvesGitRevisions(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "svc.aon")
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{
			"-c", "user.email=t@example.com", "-c", "user.name=t"}, args...)...)
		cmd.Dir = dir
		var errOut bytes.Buffer
		cmd.Stderr = &errOut
		if err := cmd.Run(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, errOut.String())
		}
	}
	git("init", "-q", ".")
	if err := os.WriteFile(file,
		[]byte("service: close({name:string,port:*8080|integer})"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "svc.aon")
	git("commit", "-q", "-m", "v1")
	if err := os.WriteFile(file,
		[]byte("service: close({name:string,port:*9090|integer,owner:string})"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, _, code := brkRun("--against", "git#HEAD", file)
	if 1 != code {
		t.Fatalf("want 1, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: breaking`)
	vetMatch(t, out, `specific: git#HEAD:1:\d+`)

	// The forward direction puts the git source on the general side.
	out, _, code = brkRun("--against", "git#HEAD", "--mode", "forward", file)
	if 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	vetMatch(t, out, `general: git#HEAD:1:\d+`)

	// An unknown revision is a usage failure naming the spelling.
	_, errw, code := brkRun("--against", "git#no-such-rev", file)
	if 2 != code || !strings.Contains(errw, "cannot resolve git#no-such-rev") {
		t.Fatalf("want 2/cannot resolve, got %d: %s", code, errw)
	}

	// A file the revision does not carry is refused by name rather
	// than compared against nothing.
	absent := filepath.Join(dir, "absent.aon")
	if err := os.WriteFile(absent, []byte("a: 1"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errw, code = brkRun("--against", "git#HEAD", absent)
	if 2 != code || !strings.Contains(errw, "absent.aon is not in that revision") {
		t.Fatalf("want 2/not in revision, got %d: %s", code, errw)
	}

	// No git binary at all: still a located usage failure, using the
	// spawn error's own message since there is no stderr to quote.
	t.Setenv("PATH", "")
	_, errw, code = brkRun("--against", "git#HEAD", file)
	if 2 != code || !strings.Contains(errw, "cannot resolve git#HEAD") {
		t.Fatalf("want 2/cannot resolve, got %d: %s", code, errw)
	}
}

// THE OLD SIDE IS THE OLD TREE, not old entry text meeting new
// includes. The git spelling used to resolve the old document's
// @"..." loads against the WORKING tree, so a breaking change made
// inside an included file compared against itself and answered
// compatible -- the CI gate silently un-gated every non-entry file
// (use-cases/BUGS.md §26). Both directions are asserted: the narrowing
// is caught, and an unchanged tree stays compatible, so a fix that
// simply reported breaking would fail too.
func TestBreakingGitComparesTheOldTree(t *testing.T) {
	dir := t.TempDir()
	model := filepath.Join(dir, "model")
	if err := os.MkdirAll(model, 0o755); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(model, "entry.aon")
	inc := filepath.Join(model, "schema.aon")
	git := func(args ...string) {
		full := append([]string{
			"-c", "user.email=t@example.com", "-c", "user.name=t"}, args...)
		cmd := exec.Command("git", full...)
		cmd.Dir = dir
		if err := cmd.Run(); err != nil {
			t.Skipf("git unavailable: %v", err)
		}
	}
	if err := os.WriteFile(entry, []byte("svc: @\"schema.aon\""), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(inc, []byte("port: *8080|integer"), 0o600); err != nil {
		t.Fatal(err)
	}
	// A file no include can name: the materialiser must skip it.
	if err := os.WriteFile(
		filepath.Join(dir, "README.md"), []byte("# not a source"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("init", "-q", ".")
	git("add", "-A")
	git("commit", "-q", "-m", "v1")

	// Unchanged tree: compatible.
	out, _, code := brkRun("--against", "git#HEAD", entry)
	if 0 != code {
		t.Fatalf("unchanged tree: want 0, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: compatible`)

	// The narrowing lives in the INCLUDED file only.
	if err := os.WriteFile(inc, []byte("port: 8080"), 0o600); err != nil {
		t.Fatal(err)
	}
	out, _, code = brkRun("--against", "git#HEAD", entry)
	if 1 != code {
		t.Fatalf("narrowed include: want 1, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: breaking`)
	vetMatch(t, out, `\$\.svc\.port`)
}

func TestBreakingReadsTheDocumentsOwnPolicy(t *testing.T) {
	// The policy declares no compatibility promise: nothing to check,
	// whatever --against says.
	_, g, s := subFiles(t,
		"aontu_policy: hide({compat: *none|backward|forward|full})\na:1",
		"a:hello")
	out, _, code := brkRun("--against", s, "--format", "json", g)
	if 0 != code {
		t.Fatalf("want 0, got %d:\n%s", code, out)
	}
	var report struct {
		Aontu struct {
			Mode string `json:"mode"`
		} `json:"aontu"`
		Verdict string `json:"verdict"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "none" != report.Aontu.Mode || "compatible" != report.Verdict {
		t.Fatalf("bad report: %s", out)
	}

	// --mode overrides the declaration.
	if _, _, code := brkRun("--against", s, "--mode", "backward", g); 1 != code {
		t.Fatalf("want 1, got %d", code)
	}

	// The none path renders as text too.
	out2, _, code := brkRun("--against", s, g)
	if 0 != code || "verdict: compatible" != strings.TrimSpace(out2) {
		t.Fatalf("want compatible/0, got %d:\n%s", code, out2)
	}
}

func TestBreakingAllowUndecidedDowngradesTheExit(t *testing.T) {
	_, g, s := subFiles(t, "a:{x:1}|{x:2}", "a:{x:1|2}")
	out, _, code := brkRun("--against", s, g)
	if 3 != code {
		t.Fatalf("want 3, got %d", code)
	}
	vetMatch(t, out, `verdict: undecided`)
	vetMatch(t, out, `sub_disjunct_distribution`)
	if _, _, code := brkRun("--against", s, "--allow-undecided", g); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}

	out, _, code = brkRun("--against", s, "--format", "json", g)
	if 3 != code {
		t.Fatalf("want 3, got %d", code)
	}
	var report struct {
		Aontu struct {
			Mode string `json:"mode"`
		} `json:"aontu"`
		Verdict string `json:"verdict"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "backward" != report.Aontu.Mode || "undecided" != report.Verdict {
		t.Fatalf("bad report: %s", out)
	}
}

func TestBreakingUsageErrorsExit2(t *testing.T) {
	if _, _, code := brkRun("file.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := brkRun("--against"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	_, gf, _ := subFiles(t, "a:1", "a:1")
	if _, errw2, code := brkRun("--against", "git#", gf); 2 != code ||
		!strings.Contains(errw2, "git# needs a revision") {
		t.Fatalf("want 2/needs a revision, got %d: %s", code, errw2)
	}
	if _, _, code := brkRun("--mode", "sideways", "--against", "a.aon", "b.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := brkRun("--format", "yaml", "--against", "a.aon", "b.aon"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := brkRun("--bogus"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	dir, g, _ := subFiles(t, "a:1", "a:1")
	if _, _, code := brkRun("--against", filepath.Join(dir, "missing.aon"), g); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := brkRun(filepath.Join(dir, "missing.aon"), "--against", g); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	out, _, code := brkRun("--help")
	if 0 != code || !strings.Contains(out, "aontu breaking") {
		t.Fatalf("want help, got %d", code)
	}
}

// Deprecate-then-remove is the supported rename path: a finding about
// a value the old version already deprecated becomes a warning under
// --allow-deprecated-removal, and warnings do not move the verdict.
// TS twin: breaking-allow-deprecated-removal in ts/test/cli.test.ts.
func TestBreakingAllowDeprecatedRemoval(t *testing.T) {
	_, g, s := subFiles(t,
		"service: close({name:string, listen:integer})",
		"service: close({name:string, listen:integer,"+
			" port:deprecate(integer,{msg:\"renamed\",use:\"$.service.listen\"})})")
	if _, _, code := brkRun("--against", s, g); 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
	out, _, code := brkRun("--against", s, "--allow-deprecated-removal", g)
	if 0 != code {
		t.Fatalf("want 0, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: compatible`)
	vetMatch(t, out, `\$\.service\.port: compat_narrowed`)

	// A removal the old version did NOT deprecate stays breaking.
	_, g2, s2 := subFiles(t,
		"service: close({name:string})",
		"service: close({name:string, port:integer})")
	if _, _, code := brkRun("--against", s2, "--allow-deprecated-removal", g2); 1 != code {
		t.Fatalf("want 1, got %d", code)
	}
}
