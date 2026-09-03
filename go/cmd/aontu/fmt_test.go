/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

// The Go twin of the cli-fmt cases in ts/test/cli.test.ts. What the two
// ports must AGREE on -- the form -- is pinned by test/spec/fmt.tsv;
// what each port owns (argument handling, exit codes, what goes to
// which stream, the file rewritten or not) is here.

import (
	"bytes"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func fmtRun(stdin string, args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"fmt"}, args...), strings.NewReader(stdin), &out, &errw, false)
	return out.String(), errw.String(), code
}

func fmtFiles(t *testing.T, srcs ...string) (string, []string) {
	t.Helper()
	dir := t.TempDir()
	files := make([]string, 0, len(srcs))
	for i, src := range srcs {
		file := filepath.Join(dir, "d"+strconv.Itoa(i)+".aon")
		if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
			t.Fatal(err)
		}
		files = append(files, file)
	}
	return dir, files
}

func TestFmtPrintsOneFile(t *testing.T) {
	_, files := fmtFiles(t, "a:{b:1}\n", "x: 1\n")
	// THE FORM AND NOTHING ELSE on stdout: a redirect is the file.
	out, errw, code := fmtRun("", files[0])
	if 0 != code || "a: b: 1\n" != out || "" != errw {
		t.Fatalf("code %d out %q err %q", code, out, errw)
	}
	// A file already in the form prints unchanged, and is not touched.
	out, _, code = fmtRun("", files[1])
	if 0 != code || "x: 1\n" != out {
		t.Fatalf("clean: code %d out %q", code, out)
	}
	if raw, _ := os.ReadFile(files[0]); "a:{b:1}\n" != string(raw) {
		t.Fatalf("printing wrote the file: %q", raw)
	}
}

func TestFmtListCheckDiff(t *testing.T) {
	_, files := fmtFiles(t, "a:{b:1}\n", "x: 1\n")
	// --list names the files whose form would change; --check is the
	// same list and exit 1 when it is not empty.
	out, _, code := fmtRun("", append([]string{"--list"}, files...)...)
	if 0 != code || files[0]+"\n" != out {
		t.Fatalf("list: code %d out %q", code, out)
	}
	out, _, code = fmtRun("", append([]string{"--check"}, files...)...)
	if 1 != code || files[0]+"\n" != out {
		t.Fatalf("check: code %d out %q", code, out)
	}
	if out, _, code = fmtRun("", "--check", files[1]); 0 != code || "" != out {
		t.Fatalf("clean check: code %d out %q", code, out)
	}
	// --diff is the unified diff, per file that would change.
	out, _, code = fmtRun("", append([]string{"-d"}, files...)...)
	want := "--- a/" + files[0] + "\n+++ b/" + files[0] + "\n@@ -1,1 +1,1 @@\n-a:{b:1}\n+a: b: 1\n"
	if 0 != code || want != out {
		t.Fatalf("diff: code %d out %q", code, out)
	}
	// Nothing was written by any of them.
	if raw, _ := os.ReadFile(files[0]); "a:{b:1}\n" != string(raw) {
		t.Fatalf("listing wrote the file: %q", raw)
	}
}

func TestFmtWrite(t *testing.T) {
	_, files := fmtFiles(t, "a:{b:1}\n", "x: 1\n")
	before, _ := os.Stat(files[1])
	out, _, code := fmtRun("", append([]string{"-w"}, files...)...)
	if 0 != code || "" != out {
		t.Fatalf("write: code %d out %q", code, out)
	}
	if raw, _ := os.ReadFile(files[0]); "a: b: 1\n" != string(raw) {
		t.Fatalf("not rewritten: %q", raw)
	}
	// A file already in the form is left alone, not rewritten.
	if after, _ := os.Stat(files[1]); !after.ModTime().Equal(before.ModTime()) {
		t.Fatal("a clean file was rewritten")
	}
	// --list with --write says what was rewritten.
	if err := os.WriteFile(files[0], []byte("a:{b:1}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	out, _, code = fmtRun("", "-l", "--write", files[0])
	if 0 != code || files[0]+"\n" != out {
		t.Fatalf("list+write: code %d out %q", code, out)
	}
	if raw, _ := os.ReadFile(files[0]); "a: b: 1\n" != string(raw) {
		t.Fatalf("not rewritten: %q", raw)
	}
	// A file that cannot be written back is reported, exit 2.
	orig := fmtWriteFile
	defer func() { fmtWriteFile = orig }()
	fmtWriteFile = func(string, []byte, os.FileMode) error { return os.ErrPermission }
	if err := os.WriteFile(files[0], []byte("a:{b:1}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, errw, code := fmtRun("", "-w", files[0]); 2 != code || !strings.Contains(errw, "cannot write") {
		t.Fatalf("unwritable: %d %q", code, errw)
	}
}

func TestFmtUsageErrorsExit2(t *testing.T) {
	dir, files := fmtFiles(t, "a:1\n", "b:1\n")
	// Several files onto stdout is refused: say what to do with each.
	out, errw, code := fmtRun("", files...)
	if 2 != code || "" != out || !strings.Contains(errw, "fmt prints one file; with 2, say --write") {
		t.Fatalf("two files: code %d out %q err %q", code, out, errw)
	}
	if _, _, code = fmtRun("", "--bogus", files[0]); 2 != code {
		t.Fatalf("bogus option: %d", code)
	}
	if _, errw, code = fmtRun("", "-w"); 2 != code || !strings.Contains(errw, "--write needs a file") {
		t.Fatalf("write stdin: %d %q", code, errw)
	}
	if _, _, code = fmtRun("", filepath.Join(dir, "missing.aon")); 2 != code {
		t.Fatalf("missing: %d", code)
	}
	if out, _, code = fmtRun("", "--help"); 0 != code || !strings.Contains(out, "aontu fmt") {
		t.Fatalf("help: %d %q", code, out)
	}
}

// A document that does not parse is not formatted: exit 4, the finding
// on stderr, nothing on stdout, nothing written -- and the other files
// given with it are still done.
func TestFmtSyntaxErrorExits4(t *testing.T) {
	_, files := fmtFiles(t, "a: {b\n", "x:1\n")
	out, errw, code := fmtRun("", files[0])
	if 4 != code || "" != out || !strings.Contains(errw, "was not formatted") ||
		!strings.Contains(errw, "syntax [parse]") {
		t.Fatalf("code %d out %q err %q", code, out, errw)
	}
	out, _, code = fmtRun("", append([]string{"-w"}, files...)...)
	if 4 != code || "" != out {
		t.Fatalf("both: code %d out %q", code, out)
	}
	if raw, _ := os.ReadFile(files[0]); "a: {b\n" != string(raw) {
		t.Fatalf("a broken file was written: %q", raw)
	}
	if raw, _ := os.ReadFile(files[1]); "x: 1\n" != string(raw) {
		t.Fatalf("the other file was not done: %q", raw)
	}
}

// Standard input, formatted onto standard output, or listed under the
// name <stdin>.
func TestFmtStdin(t *testing.T) {
	out, _, code := fmtRun("a:{b:1}\n")
	if 0 != code || "a: b: 1\n" != out {
		t.Fatalf("stdin: code %d out %q", code, out)
	}
	out, _, code = fmtRun("a:{b:1}\n", "--check")
	if 1 != code || "<stdin>\n" != out {
		t.Fatalf("stdin check: code %d out %q", code, out)
	}
	// A reader that fails is reported, not formatted.
	var errw bytes.Buffer
	code = run([]string{"fmt"}, failingReader{}, &bytes.Buffer{}, &errw, false)
	if 2 != code || !strings.Contains(errw.String(), "cannot read standard input") {
		t.Fatalf("failing stdin: %d %q", code, errw.String())
	}
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, os.ErrClosed
}
