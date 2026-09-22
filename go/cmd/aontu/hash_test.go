/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func hashRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"hash"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func hashFile(t *testing.T, dir, src string) string {
	t.Helper()
	file := filepath.Join(dir, "doc.aontu")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

var hashRe = regexp.MustCompile(`^aon1-[A-Za-z0-9_-]{43}$`)

func TestHashVerb(t *testing.T) {
	dir := t.TempDir()
	file := hashFile(t, dir, "b: 2\na: 1\n")
	out, _, code := hashRun(file)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	first := strings.TrimSpace(out)
	if !hashRe.MatchString(first) {
		t.Fatalf("not a canon-hash: %q", first)
	}

	// Same meaning, different bytes: comments, whitespace, key order.
	hashFile(t, dir, "# the module\n\n   a:1\n   b:2  # trailing\n")
	if out, _, _ = hashRun(file); first != strings.TrimSpace(out) {
		t.Fatalf("reformatting moved the hash:\n %s\n %s", first, out)
	}

	// A semantic change moves it.
	hashFile(t, dir, "a: 1\nb: 3\n")
	if out, _, _ = hashRun(file); first == strings.TrimSpace(out) {
		t.Fatal("a changed value left the hash alone")
	}

	// Closedness is IN the hash form even though canon drops it.
	hashFile(t, dir, "x: {a:1}")
	out, _, _ = hashRun(file)
	open := strings.TrimSpace(out)
	hashFile(t, dir, "x: close({a:1})")
	out, _, _ = hashRun(file)
	closed := strings.TrimSpace(out)
	if open == closed {
		t.Fatal("close() left the hash alone")
	}

	// --form prints the hashed TEXT, which is what to diff when a pin
	// moves, and the JSON report carries both.
	out, _, code = hashRun("--form", file)
	if 0 != code || `{"x":close({"a":1})}` != strings.TrimSpace(out) {
		t.Fatalf("bad form: %d %q", code, out)
	}
	out, _, code = hashRun("--format", "json", file)
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Aontu struct {
			Verb string `json:"verb"`
		} `json:"aontu"`
		Form string `json:"form"`
		Hash string `json:"hash"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatal(err)
	}
	if "hash" != report.Aontu.Verb || closed != report.Hash ||
		`{"x":close({"a":1})}` != report.Form {
		t.Fatalf("bad report: %s", out)
	}
}

func TestHashUsageErrorsExit2(t *testing.T) {
	file := hashFile(t, t.TempDir(), "a:1")
	if _, _, code := hashRun(); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := hashRun(file, file); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := hashRun("--bogus", file); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := hashRun("--format", "yaml", file); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := hashRun("--format"); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	if _, _, code := hashRun(filepath.Join(t.TempDir(), "missing.aontu")); 2 != code {
		t.Fatalf("want 2, got %d", code)
	}
	out, _, code := hashRun("--help")
	if 0 != code || !strings.Contains(out, "aontu hash") {
		t.Fatalf("want help, got %d", code)
	}
}

// A document that does not stand up on its own has no meaning to pin:
// exit 4, the verbs' error class, and NOT a hash of the wreck (which
// would agree with every other wreck).
func TestHashBrokenDocumentExits4(t *testing.T) {
	file := hashFile(t, t.TempDir(), "a:1 a:2")
	out, errw, code := hashRun(file)
	if 4 != code || "" != out ||
		!strings.Contains(errw, "does not evaluate on its own") {
		t.Fatalf("want 4/empty/message, got %d %q %q", code, out, errw)
	}
}
