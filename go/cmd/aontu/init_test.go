/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func initRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"init"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

// THE ASSERTION THE PHASE RESTS ON, the same one the teaching pack
// carries: the staged trio is a generated copy, and a generated copy
// nothing compares is a second source of truth waiting to drift.
func TestInitTrioIsIdenticalWithItsSources(t *testing.T) {
	files := initFiles()
	if 3 != len(files) {
		t.Fatalf("staged %d init files, want 3: is `make helpdoc` run?",
			len(files))
	}
	want := []string{"model.aontu", "data.aontu", "check.sh"}
	for i, f := range files {
		if want[i] != f.name {
			t.Errorf("init file %d is %s, want %s", i, f.name, want[i])
		}
		if got := repoFile(t, f.source); got != f.text {
			t.Errorf("%s is stale against %s (run `make helpdoc`):"+
				" %d embedded bytes, %d source bytes",
				f.name, f.source, len(f.text), len(got))
		}
		// A SCAFFOLD WHOSE SCRIPT NEEDS A CHMOD has a step missing.
		wantMode := os.FileMode(0o644)
		if strings.HasSuffix(f.name, ".sh") {
			wantMode = 0o755
		}
		if wantMode != f.mode {
			t.Errorf("%s is staged %o, want %o", f.name, f.mode, wantMode)
		}
	}
}

// THE MISTAKE THE WHOLE GAP EXISTS FOR. A starting document that
// reached for the quoted wildcard would teach the failure it is there
// to prevent. The COMMENT names the mistake, so the assertion is on
// the lines that are not comments.
func TestInitModelUsesTheTemplateAndNotTheStar(t *testing.T) {
	var model string
	for _, f := range initFiles() {
		if "model.aontu" == f.name {
			model = f.text
		}
	}
	if !strings.Contains(model, "&:") {
		t.Error("model.aontu does not use the template")
	}
	code := []string{}
	for _, line := range strings.Split(model, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "#") {
			code = append(code, line)
		}
	}
	if strings.Contains(strings.Join(code, "\n"), `"*"`) {
		t.Error("model.aontu reaches for the quoted star")
	}
}

func TestInitWritesATrioThatChecksItself(t *testing.T) {
	dir := t.TempDir()
	out, errs, code := initRun(dir)
	if 0 != code {
		t.Fatalf("init exited %d: %s", code, errs)
	}

	for _, f := range initFiles() {
		at := filepath.Join(dir, f.name)
		raw, err := os.ReadFile(at)
		if nil != err {
			t.Fatalf("init wrote no %s: %v", f.name, err)
		}
		if f.text != string(raw) {
			t.Errorf("%s differs from what is staged", f.name)
		}
		info, err := os.Stat(at)
		if nil != err {
			t.Fatalf("cannot stat %s: %v", f.name, err)
		}
		if "windows" != runtime.GOOS && f.mode != info.Mode().Perm() {
			t.Errorf("%s written %o, want %o", f.name, info.Mode().Perm(), f.mode)
		}
	}
	for _, want := range []string{
		filepath.Join(dir, "check.sh"), "aontu help language",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("init said nothing about %s:\n%s", want, out)
		}
	}

	// The script cds to its own directory and spells the paths
	// relative to it.
	t.Chdir(dir)
	script, err := os.ReadFile("check.sh")
	if nil != err {
		t.Fatalf("cannot read check.sh: %v", err)
	}
	ran := 0
	for _, line := range strings.Split(string(script), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "$AONTU ") {
			continue
		}
		args := strings.Fields(strings.TrimPrefix(line, "$AONTU "))
		for i, a := range args {
			args[i] = strings.Trim(a, "'")
		}
		cout, cerr, ccode := cliRun(args...)
		if 0 != ccode {
			t.Errorf("check.sh line %q exited %d: %s%s",
				line, ccode, cout, cerr)
		}
		ran++
		if "vet" == args[0] {
			// PHASE 5's ANSWER: the check examined something.
			if !strings.Contains(cerr+cout, "data leaves checked") {
				t.Errorf("the scaffold's vet reports no coverage: %s%s",
					cout, cerr)
			}
		}
	}
	if 4 != ran {
		t.Errorf("check.sh asks %d questions, want the four", ran)
	}
}

// NEVER OVERWRITES, and never half-writes: the standing file is
// untouched and the two that were not there are still not there.
func TestInitRefusesToOverwrite(t *testing.T) {
	dir := t.TempDir()
	mine := "mine: true\n"
	if err := os.WriteFile(
		filepath.Join(dir, "model.aontu"), []byte(mine), 0o644); nil != err {
		t.Fatalf("cannot seed: %v", err)
	}

	_, errs, code := initRun(dir)
	if 2 != code {
		t.Fatalf("init over a standing file exited %d, want 2", code)
	}
	for _, want := range []string{"already holds model.aontu", "never overwrites"} {
		if !strings.Contains(errs, want) {
			t.Errorf("refusal omits %q: %s", want, errs)
		}
	}
	raw, err := os.ReadFile(filepath.Join(dir, "model.aontu"))
	if nil != err || mine != string(raw) {
		t.Errorf("the standing file was touched: %v %q", err, string(raw))
	}
	entries, err := os.ReadDir(dir)
	if nil != err {
		t.Fatalf("cannot read %s: %v", dir, err)
	}
	if 1 != len(entries) {
		t.Errorf("init half-wrote the directory: %d entries", len(entries))
	}
}

func TestInitUsageRefusals(t *testing.T) {
	if _, errs, code := initRun("one", "two"); 2 != code ||
		!strings.Contains(errs, "init takes one directory") {
		t.Errorf("two directories: exit %d, %s", code, errs)
	}
	if _, errs, code := initRun("--nope"); 2 != code ||
		!strings.Contains(errs, "unknown init option --nope") {
		t.Errorf("unknown option: exit %d, %s", code, errs)
	}
	// `init --help` is the TOOL help, as every other verb's is.
	if out, _, code := initRun("--help"); 0 != code ||
		!strings.Contains(out, "Usage: aontu") {
		t.Errorf("init --help: exit %d, %s", code, out)
	}
	if out, _, code := initRun("-h"); 0 != code ||
		!strings.Contains(out, "Usage: aontu") {
		t.Errorf("init -h: exit %d, %s", code, out)
	}
}

// The default directory is the working one, which is what an agent
// standing in an empty repository runs.
func TestInitDefaultsToTheWorkingDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	if _, errs, code := initRun(); 0 != code {
		t.Fatalf("bare init exited %d: %s", code, errs)
	}
	entries, err := os.ReadDir(".")
	if nil != err {
		t.Fatalf("cannot read %s: %v", dir, err)
	}
	if 3 != len(entries) {
		t.Errorf("bare init wrote %d files, want 3", len(entries))
	}
}

// BOTH WRITE FAILURES, and neither depends on the caller's uid, which
// a mode-based test would (root writes an unwritable directory
// happily). A path standing as a FILE refuses the directory; a member
// of the trio standing as a symlink to itself refuses the write.
func TestInitCannotWrite(t *testing.T) {
	base := t.TempDir()

	notADir := filepath.Join(base, "afile")
	if err := os.WriteFile(notADir, []byte("x"), 0o644); nil != err {
		t.Fatalf("cannot seed: %v", err)
	}
	if _, errs, code := initRun(notADir); 2 != code ||
		!strings.Contains(errs, "cannot write in "+notADir) {
		t.Errorf("a file as the directory: exit %d, %s", code, errs)
	}

	loop := filepath.Join(base, "loop")
	if err := os.MkdirAll(loop, 0o755); nil != err {
		t.Fatalf("cannot seed: %v", err)
	}
	// A SELF-REFERENTIAL SYMLINK is not a standing file (the existence
	// check follows it and gets nowhere), and is not writable either.
	if err := os.Symlink("model.aontu",
		filepath.Join(loop, "model.aontu")); nil != err {
		t.Fatalf("cannot seed: %v", err)
	}
	if _, errs, code := initRun(loop); 2 != code ||
		!strings.Contains(errs, "cannot write in "+loop) {
		t.Errorf("a symlink loop in the directory: exit %d, %s", code, errs)
	}
}

func TestInitVerbIsInTheToolHelp(t *testing.T) {
	for _, want := range []string{"aontu init [dir]", "NOTHING TO EDIT YET?"} {
		if !strings.Contains(helpText, want) {
			t.Errorf("the tool help omits %q", want)
		}
	}
}
