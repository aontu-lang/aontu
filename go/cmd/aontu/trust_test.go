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
