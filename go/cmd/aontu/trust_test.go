/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The trust flags (G5 phase 3) and the staged-flip warning window
// (phase 6): the Go twin of the trust-cli suite in
// ts/test/trust.test.ts.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// srcPath spells a path for EMBEDDING IN SOURCE text: inside an @"..."
// include a backslash is an ESCAPE character, so a native Windows path
// interpolated raw is eaten by the lexer. The full note is on the twin
// helper in go/trust_test.go; the canonical port has had it since it
// was written (ts/test/trust.test.ts).
func srcPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

// trustWorld: root/{in.aon, main.aon}, secret.aon OUTSIDE the root.
func trustCliWorld(t *testing.T) (dir, root, entry string) {
	t.Helper()
	dir = t.TempDir()
	root = filepath.Join(dir, "root")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	write := func(path, src string) {
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(root, "in.aon"), "f: 11")
	write(filepath.Join(dir, "secret.aon"), `secret: "outside"`)
	entry = filepath.Join(root, "main.aon")
	return dir, root, entry
}

func trustRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func TestTrustCliNoneDenies(t *testing.T) {
	_, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(`a:@"in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun("--trust", "none", entry)
	if 1 != code || !strings.Contains(errText, "include denied") {
		t.Fatalf("code %d: %s", code, errText)
	}
}

func TestTrustCliIncludeRootConfines(t *testing.T) {
	dir, root, entry := trustCliWorld(t)
	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun("--include-root", root, entry)
	if 1 != code || !strings.Contains(errText, "include denied") {
		t.Fatalf("code %d: %s", code, errText)
	}

	// The same escape under explicit system resolves, silently.
	_, errText, code = trustRun("--trust", "system", entry)
	if 0 != code || "" != errText {
		t.Fatalf("system: code %d, stderr %q", code, errText)
	}
}

func TestTrustCliRootDefaultsToTheEntryDirectory(t *testing.T) {
	dir, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(`a:@"in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, code := trustRun("--trust", "root", entry); 0 != code {
		t.Fatalf("in-root: %d", code)
	}

	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, code := trustRun("--trust", "root", entry); 1 != code {
		t.Fatalf("escape: %d", code)
	}
	if _, _, code := trustRun("--trust", "root:"+dir, entry); 0 != code {
		t.Fatalf("wider root: %d", code)
	}
}

// The warning window of the staged default flip: the default posture
// still resolves, but every escape names the flag a future release
// will require — once per resolution, however many times it repeats.
func TestTrustCliDefaultWarnsOnEscape(t *testing.T) {
	dir, _, entry := trustCliWorld(t)
	if err := os.WriteFile(entry, []byte(
		`a:@"`+srcPath(dir)+`/secret.aon" b:@"`+srcPath(dir)+`/secret.aon" c:@"in.aon"`,
	), 0o600); err != nil {
		t.Fatal(err)
	}
	_, errText, code := trustRun(entry)
	if 0 != code {
		t.Fatalf("code: %d (%s)", code, errText)
	}
	if 1 != strings.Count(errText,
		"warning: include resolved outside the entry root") {
		t.Fatalf("stderr: %q", errText)
	}
	if !strings.Contains(errText, "--trust system") {
		t.Fatalf("stderr names no flag: %q", errText)
	}
}

// Stdin evaluation runs under the same trust machinery, rooted at the
// working directory.
func TestTrustCliStdinNone(t *testing.T) {
	dir, _, _ := trustCliWorld(t)
	var out, errw bytes.Buffer
	code := run([]string{"--trust", "none"},
		strings.NewReader(`a:@"`+srcPath(dir)+`/secret.aon"`), &out, &errw, false)
	if 1 != code || !strings.Contains(errw.String(), "include denied") {
		t.Fatalf("code %d: %s", code, errw.String())
	}
}

// EVERY VERB, not just the bare command. The capability flags were
// wired to `aontu <file>` alone, so `aontu vet schema.aon data.json`
// -- the surface an agent scripts -- ran the full system resolver with
// no way to confine it (use-cases/REVIEW.md finding G). Each verb is
// asserted twice: the escape resolves under today's default and is
// DENIED under --trust none, so a verb that quietly dropped the flag
// again would fail here. Twin: every-verb-honours-the-capability in
// ts/test/trust.test.ts.
func TestTrustCliEveryVerbHonoursTheCapability(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	write := func(path, src string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(entry, `a:@"`+srcPath(dir)+`/secret.aon"`)
	data := filepath.Join(root, "data.json")
	write(data, "{}")
	overlay := filepath.Join(root, "overlay.aon")
	write(overlay, "")

	denied := func(args ...string) {
		t.Helper()
		openOut, openErr, openCode := trustRun(args...)
		shutArgs := append([]string{args[0], "--trust", "none"}, args[1:]...)
		shutOut, shutErr, shutCode := trustRun(shutArgs...)
		if openCode == shutCode && openOut == shutOut && openErr == shutErr {
			t.Fatalf("the verb ignored --trust: %s", strings.Join(args, " "))
		}
		// The denial itself is named where the verb's report carries a
		// reason. `relations`, `trim`, `subsume`/`breaking` and `hash`
		// answer an `error` verdict whose cause the report shape has
		// nowhere to put -- the review's finding F, open in both ports
		// (use-cases/BUGS.md, "relations and trim report verdict:error
		// with zero findings"). What every verb MUST do is honour the
		// capability, which the difference above asserts.
		both := shutOut + shutErr
		if strings.Contains(both, "verdict: error") ||
			strings.Contains(both, "nothing to hash") {
			return
		}
		if !strings.Contains(both, "include denied") &&
			!strings.Contains(both, "include_denied") {
			t.Fatalf("%s: no denial in %q", strings.Join(args, " "), both)
		}
	}

	denied("vet", entry, data)
	denied("get", "$.a.secret", entry)
	denied("why", "$.a.secret", entry)
	denied("subsume", entry, entry)
	denied("breaking", "--against", entry, entry)
	denied("relations", entry)
	denied("trim", "--check", entry)
	denied("hash", entry)
	denied("agentsmd", entry)
	denied("set", "$.z=1", "--entry", entry, "--overlay", overlay)
}

// --include-root confines a verb to a directory, the CLI's own root:
// spelling, and a bare `root` means the document's directory.
func TestTrustCliVerbsTakeIncludeRoot(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	inside := filepath.Join(root, "fine.aon")
	write := func(path, src string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(entry, `a:@"`+srcPath(dir)+`/secret.aon"`)
	write(inside, `a:@"in.aon"`)

	out, errText, _ := trustRun("get", "$.a.secret", "--include-root", root, entry)
	if !strings.Contains(out+errText, "include denied") {
		t.Fatalf("confined: %q %q", out, errText)
	}
	if _, _, code := trustRun(
		"get", "$.a.f", "--include-root", root, inside); 0 != code {
		t.Fatalf("in-root: %d", code)
	}
	// A bare `root` confines to the document's own directory.
	if _, _, code := trustRun("get", "$.a.f", "--trust", "root", inside); 0 != code {
		t.Fatalf("bare root, in-root: %d", code)
	}
	out, errText, _ = trustRun("get", "$.a.secret", "--trust", "root", entry)
	if !strings.Contains(out+errText, "include denied") {
		t.Fatalf("bare root, escape: %q %q", out, errText)
	}
	// A bad spelling is the usage class, from a verb as from the bare
	// command.
	if _, _, code := trustRun("get", "$.a", "--trust", "bogus", inside); 2 != code {
		t.Fatalf("bogus: %d", code)
	}
	if _, _, code := trustRun("get", "$.a", inside, "--include-root"); 2 != code {
		t.Fatalf("bare --include-root: %d", code)
	}
}

// The REPL took --trust and DROPPED it: the --jsonl session mode, built
// to be driven by a harness, evaluated unconfined however it was
// invoked.
func TestTrustCliReplHonoursTheCapability(t *testing.T) {
	dir, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "leak.aon")
	if err := os.WriteFile(entry,
		[]byte(`a:@"`+srcPath(dir)+`/secret.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	read := func(f string) (string, error) {
		raw, err := os.ReadFile(f)
		return string(raw), err
	}

	open := replCommand(
		replState{Mode: "json", JSONL: true}, ":load "+entry, read)
	if !strings.Contains(open.Out, "outside") {
		t.Fatalf("default: %q", open.Out)
	}

	shut := replCommand(
		replState{Mode: "json", JSONL: true, Trust: trustArg{kind: "none"}},
		":load "+entry, read)
	if !strings.Contains(shut.Out, "include denied") ||
		strings.Contains(shut.Out, "outside") {
		t.Fatalf("none: %q", shut.Out)
	}

	// A bare snippet -- no file of its own -- is confined too.
	snippet := replCommand(
		replState{Mode: "json", JSONL: true, Trust: trustArg{kind: "none"}},
		`a:@"`+srcPath(dir)+`/secret.aon"`, read)
	if !strings.Contains(snippet.Out, "include denied") {
		t.Fatalf("snippet: %q", snippet.Out)
	}
}

func TestTrustCliUsageErrorsExit2(t *testing.T) {
	for _, args := range [][]string{
		{"--trust"},
		{"--trust", "everything"},
		{"--trust", "root:"},
		{"--include-root"},
	} {
		if _, _, code := trustRun(args...); 2 != code {
			t.Fatalf("%v: code %d", args, code)
		}
	}
}

// A bad spelling is the usage class FROM EVERY VERB, not only from the
// bare command: each verb strips the flags before parsing its own tail,
// so each has its own refusal to exercise. Checked against a verb tail
// that would otherwise be valid, so the exit code is the flag's and not
// the tail's. Twin: the last two assertions of verbs-take-include-root
// in ts/test/trust.test.ts.
func TestTrustCliEveryVerbRefusesABadSpelling(t *testing.T) {
	_, root, _ := trustCliWorld(t)
	entry := filepath.Join(root, "main.aon")
	if err := os.WriteFile(entry, []byte(`a:@"in.aon"`), 0o600); err != nil {
		t.Fatal(err)
	}
	data := filepath.Join(root, "data.json")
	if err := os.WriteFile(data, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	overlay := filepath.Join(root, "overlay.aon")
	if err := os.WriteFile(overlay, []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}

	tails := [][]string{
		{"vet", entry, data},
		{"get", "$.a.f", entry},
		{"why", "$.a.f", entry},
		{"subsume", entry, entry},
		{"breaking", "--against", entry, entry},
		{"relations", entry},
		{"trim", "--check", entry},
		{"hash", entry},
		{"agentsmd", entry},
		{"set", "$.z=1", "--entry", entry, "--overlay", overlay},
	}
	for _, tail := range tails {
		args := append([]string{tail[0], "--trust", "everything"}, tail[1:]...)
		_, errText, code := trustRun(args...)
		if 2 != code {
			t.Fatalf("%s: code %d (%s)", tail[0], code, errText)
		}
		if !strings.Contains(errText, "--trust needs") {
			t.Fatalf("%s: stderr %q", tail[0], errText)
		}
	}
}
