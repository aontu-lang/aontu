/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli relations cases in ts/test/cli.test.ts. What
// the two ports must AGREE on (the report itself) is pinned by
// test/spec/relation.tsv; what each port owns (argument handling, exit
// codes, the text rendering) is here.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func relationsRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"relations"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func relationsFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const relCyclic = `@"std/system"
relations: {dependsOn: $.std.Relation & {inverse: usedBy, acyclic: true}}
a: id(a) & {dependsOn: [&: refer(), b]}
b: id(b) & {dependsOn: [&: refer(), a]}
`

const relClean = `@"std/system"
relations: {dependsOn: $.std.Relation & {inverse: usedBy, acyclic: true}}
a: id(a) & {dependsOn: [&: refer(), b]}
b: id(b) & {usedBy: [&: refer(), a]}
`

func TestRelationsRendersAnUnmetTarget(t *testing.T) {
	// The `target` arm of the text renderer (the review's finding J).
	// What the two ports must AGREE on is test/spec/relation.tsv; that
	// the CLI prints it, and exits 1 for it, is this port's own.
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(
		"relations: {dependsOn: {target: {kind: service}}}\n"+
			"a: id(a) & {dependsOn: [&: refer(), b]}\n"+
			"b: id(b) & {kind: database}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	var out, errw bytes.Buffer
	code := run([]string{"relations", file},
		strings.NewReader(""), &out, &errw, false)
	if 1 != code {
		t.Fatalf("code %d: %s%s", code, out.String(), errw.String())
	}
	if !strings.Contains(out.String(), "b is not what dependsOn targets") {
		t.Fatalf("target refusal not rendered: %s", out.String())
	}
}

func TestRelationsVerb(t *testing.T) {
	// A cycle AND a missing inverse: both are reported, and the exit
	// class is the one an agent loop branches on.
	file := relationsFile(t, relCyclic)
	out, _, code := relationsRun(file)
	if 1 != code {
		t.Fatalf("want 1, got %d:\n%s", code, out)
	}
	vetMatch(t, out, `verdict: fail`)
	vetMatch(t, out, `cycle a -> b -> a`)
	vetMatch(t, out, `b does not list a under usedBy`)

	// A document that declares nothing has nothing to break.
	file = relationsFile(t, "a: id(a) & {}\n")
	out, _, code = relationsRun(file)
	if 0 != code || "verdict: pass" != strings.TrimSpace(out) {
		t.Fatalf("want pass/0, got %d:\n%s", code, out)
	}

	// A document that does not stand up is not a document with a bad
	// graph.
	file = relationsFile(t, "a: 1 & 2\n")
	if _, _, code = relationsRun(file); 4 != code {
		t.Fatalf("want 4 for a broken document, got %d", code)
	}
}

func TestRelationsVerbJSON(t *testing.T) {
	file := relationsFile(t, relCyclic)
	out, _, code := relationsRun("--format", "json", file)
	if 1 != code {
		t.Fatalf("want 1, got %d:\n%s", code, out)
	}
	var report relationsReportJSON
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if "relations" != report.Aontu.Verb || "fail" != report.Verdict {
		t.Fatalf("bad envelope: %+v", report)
	}
	if 3 != len(report.Findings) {
		t.Fatalf("want three findings, got %d: %+v", len(report.Findings), report.Findings)
	}
	if "relation_cycle" != report.Findings[0].Code {
		t.Fatalf("want the cycle first: %+v", report.Findings)
	}
}

func TestRelationsVerbCleanJSON(t *testing.T) {
	// The passing shape is a report too: `findings` is present and
	// empty rather than absent, so a consumer never has to tell the two
	// apart.
	file := relationsFile(t, relClean)
	out, _, code := relationsRun("--format", "json", file)
	if 0 != code {
		t.Fatalf("want 0, got %d:\n%s", code, out)
	}
	if !strings.Contains(out, `"findings": []`) {
		t.Fatalf("want an empty findings list:\n%s", out)
	}
}

func TestRelationsVerbArguments(t *testing.T) {
	if out, _, code := relationsRun("--help"); 0 != code ||
		!strings.Contains(out, "aontu relations") {
		t.Fatalf("--help = %d:\n%s", code, out)
	}
	if _, errw, code := relationsRun(); 2 != code ||
		!strings.Contains(errw, "needs one file") {
		t.Fatalf("no file = %d: %s", code, errw)
	}
	if _, errw, code := relationsRun("a.aon", "b.aon"); 2 != code ||
		!strings.Contains(errw, "needs one file") {
		t.Fatalf("two files = %d: %s", code, errw)
	}
	if _, errw, code := relationsRun("--nope", "a.aon"); 2 != code ||
		!strings.Contains(errw, "unknown relations option") {
		t.Fatalf("bad option = %d: %s", code, errw)
	}
	if _, errw, code := relationsRun("--format", "yaml", "a.aon"); 2 != code ||
		!strings.Contains(errw, "text or json") {
		t.Fatalf("bad format = %d: %s", code, errw)
	}
	if _, errw, code := relationsRun("--format"); 2 != code ||
		!strings.Contains(errw, "text or json") {
		t.Fatalf("missing format value = %d: %s", code, errw)
	}
	if _, errw, code := relationsRun("no-such-file.aon"); 2 != code ||
		!strings.Contains(errw, "cannot read") {
		t.Fatalf("missing file = %d: %s", code, errw)
	}
}
