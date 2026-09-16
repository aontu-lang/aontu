/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli agentsmd cases in ts/test/cli.test.ts. The
// stanza is pinned byte for byte by test/spec/agentsmd.tsv in both
// ports; these cases hold the command line and the SPLICE.

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mdRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"agentsmd"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func TestAgentsMdWritesBetweenItsMarkers(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "sys.aon")
	target := filepath.Join(dir, "AGENTS.md")
	writeAt(t, entry, "services: { auth: { owner: string } }")

	out, _, code := mdRun(entry)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	vetMatch(t, out, `<!-- aontu:begin -->`)
	vetMatch(t, out, `aontu model get \$\.services`)
	vetMatch(t, out, "Pin: `aon1-")

	// Prose already there is kept: a generator that rewrote the file
	// is one nobody dares run twice.
	writeAt(t, target, "Intro prose.\n")
	if _, _, code = mdRun("--write", target, entry); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	first := readAt(t, target)
	if !strings.HasPrefix(first, "Intro prose.") ||
		!strings.Contains(first, "<!-- aontu:end -->") {
		t.Fatalf("bad splice: %q", first)
	}

	// Re-running SPLICES rather than appending.
	if _, _, code = mdRun("--write", target, entry); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	if first != readAt(t, target) {
		t.Fatalf("second run changed the file:\n%q\n%q", first, readAt(t, target))
	}

	// A target with no trailing newline gets one, so appending never
	// joins the stanza onto someone's last line.
	bare := filepath.Join(dir, "BARE.md")
	writeAt(t, bare, "no trailing newline")
	if _, _, code = mdRun("--write", bare, entry); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	if !strings.HasPrefix(readAt(t, bare), "no trailing newline\n\n<!-- aontu:begin -->") {
		t.Fatalf("bad append: %q", readAt(t, bare))
	}

	// A target that does not exist yet is created.
	fresh := filepath.Join(dir, "NEW.md")
	if _, _, code = mdRun("--write", fresh, entry); 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	if !strings.Contains(readAt(t, fresh), "<!-- aontu:begin -->") {
		t.Fatal("fresh target not written")
	}
}

func TestAgentsMdUsageErrorsExit2(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, "sys.aon")
	writeAt(t, entry, "a:1")

	for _, args := range [][]string{
		{},
		{entry, entry},
		{"--bogus", entry},
		{"--write"},
		{filepath.Join(dir, "missing.aon")},
		{"--write", dir, entry},
		{"--write", filepath.Join(dir, "no-dir", "A.md"), entry},
	} {
		if _, _, code := mdRun(args...); 2 != code {
			t.Fatalf("%v: want 2, got %d", args, code)
		}
	}

	// A document that does not stand up has no stanza: exit 4.
	broken := filepath.Join(dir, "broken.aon")
	writeAt(t, broken, "a:1 a:2")
	if _, _, code := mdRun(broken); 4 != code {
		t.Fatalf("want 4, got %d", code)
	}

	out, _, code := mdRun("--help")
	if 0 != code || !strings.Contains(out, "aontu agentsmd") {
		t.Fatalf("want help, got %d", code)
	}
}

// --- G11 phase 7: the shape's depth ---

func TestAgentsMdDepth(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "model.aon")
	src := "entity: { &: { table: string, fields: { &: { type: string } } } }\n"
	if err := os.WriteFile(file, []byte(src), 0o644); nil != err {
		t.Fatal(err)
	}

	shapeOf := func(args ...string) string {
		t.Helper()
		var out, errw bytes.Buffer
		if code := runAgentsMd(append(args, file), &out, &errw); 0 != code {
			t.Fatalf("agentsmd %v: %d %q", args, code, errw.String())
		}
		for _, line := range strings.Split(out.String(), "\n") {
			if strings.HasPrefix(line, "- Shape: ") {
				return line
			}
		}
		t.Fatalf("no shape line: %q", out.String())
		return ""
	}

	deep := shapeOf("--depth", "4")
	if deep == shapeOf() {
		t.Error("--depth changed nothing")
	}
	if !strings.Contains(deep, "table") {
		t.Errorf("--depth 4 shows no field: %s", deep)
	}
	if shapeOf("--depth", "2") != shapeOf() {
		t.Error("--depth 2 is not the default")
	}

	var out, errw bytes.Buffer
	if code := runAgentsMd([]string{"--depth", "0", file}, &out, &errw); 2 != code ||
		!strings.Contains(errw.String(), "--depth needs a positive integer") {
		t.Errorf("--depth 0: %d %q", code, errw.String())
	}
	errw.Reset()
	if code := runAgentsMd([]string{"--depth"}, &out, &errw); 2 != code ||
		!strings.Contains(errw.String(), "--depth needs a positive integer") {
		t.Errorf("--depth with no value: %d %q", code, errw.String())
	}
}

// THE LANGUAGE DOOR (G11 phase 7). A stanza is the first thing an
// agent reads about a document, and it now says where to learn the
// language the document is written in -- offline, from the binary it
// already has.
func TestAgentsMdNamesTheLanguageDoor(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "m.aon")
	if err := os.WriteFile(file, []byte("a: 1\n"), 0o644); nil != err {
		t.Fatal(err)
	}
	var out, errw bytes.Buffer
	if code := runAgentsMd([]string{file}, &out, &errw); 0 != code {
		t.Fatalf("agentsmd: %d %q", code, errw.String())
	}
	if !strings.Contains(out.String(), "aontu help language") {
		t.Errorf("the stanza does not point at the language: %q", out.String())
	}
}
