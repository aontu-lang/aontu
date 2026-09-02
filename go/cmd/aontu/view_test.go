/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

// The Go twin of the view cases in ts/test/cli.test.ts. What the two
// ports must AGREE on (the rendered text and the refusals) is pinned by
// test/spec/view.tsv and by use-case 16's goldens; what each port owns
// (argument handling, exit codes, rendering) is here.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func viewRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"view"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func viewFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const viewDoc = `cli: {dependsOn: [&: refer(), path($.web), path($.db)]}
web: {dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}
db: {dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}
disk: {}
`

const viewTree = "cli\n├── db\n│   └── disk\n└── web\n    └── db (*)\n"

func TestViewDrawsTheTreeAndItsExitCode(t *testing.T) {
	file := viewFile(t, viewDoc)

	// THE FIGURE AND NOTHING ELSE on stdout: a redirect is a golden.
	out, errw, code := viewRun("tree", "--relation", "dependsOn", file)
	if 0 != code || viewTree != out || "" != errw {
		t.Fatalf("code %d out %q err %q", code, out, errw)
	}

	// One subtree, from a named root.
	out, _, code = viewRun("tree", "--relation", "dependsOn",
		"--root", "$.web", file)
	if 0 != code || "web\n└── db\n    └── disk\n" != out {
		t.Fatalf("root = %d: %q", code, out)
	}

	// A root that is not a node of the drawn graph is a REFUSAL, on
	// stderr, with nothing on stdout: an empty tree and a typo are the
	// same file on disk.
	out, errw, code = viewRun("tree", "--relation", "dependsOn",
		"--root", "$.nope", file)
	if 4 != code || "" != out ||
		!strings.Contains(errw, "refer_unresolved") ||
		!strings.Contains(errw, "$.nope is not a node of the dependsOn graph") ||
		!strings.Contains(errw, "nodes in the graph: $.cli, $.db, $.disk, $.web") {
		t.Fatalf("bad root = %d: out %q err %q", code, out, errw)
	}

	// A relation with no edges is refused the same way.
	_, errw, code = viewRun("tree", "--relation", "nope", file)
	if 4 != code || !strings.Contains(errw, "view_relation_unknown") ||
		!strings.Contains(errw, "relations with edges: dependsOn, usedBy") {
		t.Fatalf("bad relation = %d: %q", code, errw)
	}

	// The machine-readable form carries the figure under the envelope.
	out, _, code = viewRun("tree", "--relation", "dependsOn",
		"--format", "json", file)
	if 0 != code {
		t.Fatalf("json = %d: %s", code, out)
	}
	var j map[string]any
	if err := json.Unmarshal([]byte(out), &j); err != nil {
		t.Fatal(err)
	}
	if "view" != j["aontu"].(map[string]any)["verb"] ||
		"tree" != j["kind"] || "rendered" != j["verdict"] ||
		strings.TrimSuffix(viewTree, "\n") != j["text"] {
		t.Fatalf("json: %s", out)
	}
	if _, has := j["errors"]; has {
		t.Fatalf("a rendering carried errors: %s", out)
	}

	// ... and a refusal carries its findings instead of a figure.
	out, _, code = viewRun("tree", "--root", "$.nope",
		"--format", "json", file)
	if 4 != code {
		t.Fatalf("json refusal = %d: %s", code, out)
	}
	j = map[string]any{}
	if err := json.Unmarshal([]byte(out), &j); err != nil {
		t.Fatal(err)
	}
	if "error" != j["verdict"] || nil == j["errors"] {
		t.Fatalf("json refusal: %s", out)
	}
	if _, has := j["text"]; has {
		t.Fatalf("a refusal carried a figure: %s", out)
	}

	// A --trust the parser ACCEPTS reaches the graph.
	if _, _, code = viewRun("--trust", "none", "tree", file); 0 != code {
		t.Fatalf("trust none = %d", code)
	}

	// A document that does not stand up has no graph to draw.
	broken := viewFile(t, "a: 1\na: 2\n")
	_, errw, code = viewRun("tree", broken)
	if 4 != code || !strings.Contains(errw, "scalar_value") {
		t.Fatalf("broken = %d: %q", code, errw)
	}
}

func TestViewUsageErrors(t *testing.T) {
	file := viewFile(t, viewDoc)
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{}, "view needs a kind and a file"},
		{[]string{"tree"}, "view needs a kind and a file"},
		{[]string{"tree", file, file}, "view tree takes one file"},
		{[]string{"bogus", file}, "unknown view kind bogus"},
		{[]string{"tree", "--bogus", file}, "unknown view option --bogus"},
		{[]string{"tree", "--as", "svg", file}, "--as needs one of text, mermaid, dot, er"},
		{[]string{"tree", "--as", "dot", file}, "view_profile_unknown"},
		{[]string{"matrix", "--order", "random", file}, "--order needs canon or partition"},
		{[]string{"poset", "--profile", "loose", file}, "--profile needs values, defaults or gen"},
		{[]string{"tree", "--relation", "a", "--relation", "b", file}, "view tree takes one --relation"},
		{[]string{"tree", "--check", file}, "--check needs --out"},
		{[]string{"tree", file, "--out"}, "--out needs a file"},
		{[]string{"tree", file, "--at"}, "--at needs a value"},
		{[]string{"tree", "--max-rows", "many", file}, "--max-rows needs a count"},
		{[]string{"tree", "--max-rows", "-1", file}, "--max-rows needs a count"},
		{[]string{"tree", file, "--max-rows"}, "--max-rows needs a count"},
		{[]string{"tree", "--max-rows", "2", file}, "view_rows_exceeded"},
		{[]string{"layer", "--layers", "", file}, "--layers needs a comma-separated list"},
		{[]string{"layer", "--relation", "dependsOn", file}, "view_group_required"},
		{[]string{"ladder", file}, "view_at_required"},
		{[]string{"sets", file}, "view_sets_required"},
		{[]string{"poset", file, filepath.Join(t.TempDir(), "nope.aon")}, "cannot read"},
		{[]string{"tree", "--format", "yaml", file}, "--format needs text or json"},
		{[]string{"tree", file, "--format"}, "--format needs text or json"},
		{[]string{"tree", file, "--relation"}, "--relation needs a name"},
		{[]string{"tree", "--relation", "", file}, "--relation needs a name"},
		{[]string{"tree", file, "--root"}, "--root needs a node path"},
		{[]string{"tree", filepath.Join(t.TempDir(), "nope.aon")}, "cannot read"},
		{[]string{"--trust", "bogus", "tree", file}, "--trust needs"},
	} {
		out, errw, code := viewRun(c.args...)
		if 2 != code || "" != out || !strings.Contains(errw, c.want) {
			t.Fatalf("%v: code %d out %q err %q", c.args, code, out, errw)
		}
	}

	out, _, code := viewRun("--help")
	if 0 != code || !strings.Contains(out, "aontu view <kind>") {
		t.Fatalf("help = %d: %s", code, out)
	}
}

// EVERY KIND THROUGH THE VERB, and the flags around the figure: --out,
// --check, --strict, the loss report on stderr. What each figure LOOKS
// like is test/spec/view.tsv's business; this is the plumbing.
func TestViewKindsAndTheFlagsAroundTheFigure(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "doc.aon")
	if err := os.WriteFile(file, []byte(
		"cli: {layer: \"app\", dependsOn: [&: refer(), path($.web), path($.db)]}\n"+
			"web: {layer: \"svc\", dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n"+
			"db: {layer: \"data\", dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n"+
			"disk: {layer: \"data\", dependsOn: []}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out := filepath.Join(dir, "m.txt")
	stdout, _, code := viewRun("matrix", "--relation", "dependsOn", "--out", out, file)
	if 0 != code || "" != stdout {
		t.Fatalf("out = %d: %q", code, stdout)
	}
	matrix, _ := os.ReadFile(out)
	if !strings.HasSuffix(string(matrix), "# above-diagonal direct cells: 3\n") {
		t.Fatalf("matrix = %q", matrix)
	}
	if _, _, code = viewRun("matrix", "--relation", "dependsOn", "--out", out, "--check", file); 0 != code {
		t.Fatalf("check = %d", code)
	}
	_, errw, code := viewRun("matrix", "--relation", "dependsOn", "--order", "partition",
		"--closure", "--out", out, "--check", file)
	if 1 != code || !strings.Contains(errw, "differs from the matrix figure") {
		t.Fatalf("mismatch = %d: %q", code, errw)
	}
	if again, _ := os.ReadFile(out); string(again) != string(matrix) {
		t.Fatalf("--check wrote: %q", again)
	}
	if _, _, code = viewRun("matrix", "--relation", "dependsOn", "--out",
		filepath.Join(dir, "none.txt"), "--check", file); 1 != code {
		t.Fatalf("absent = %d", code)
	}
	if _, errw, code = viewRun("tree", "--out", filepath.Join(dir, "no", "dir", "x.txt"), file); 2 != code ||
		!strings.Contains(errw, "cannot write") {
		t.Fatalf("unwritable = %d: %q", code, errw)
	}

	hid := filepath.Join(dir, "hid.aon")
	if err := os.WriteFile(hid, []byte(
		"a: hide({dependsOn: [&: refer(), path($.b)]})\n"+
			"b: {dependsOn: [&: refer(), path($.c)]}\nc: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stdout, errw, code = viewRun("tree", hid)
	if 0 != code || "b\n└── c\n" != stdout || "hidden_contribution  1  $.a.dependsOn.0\n" != errw {
		t.Fatalf("lossy = %d: %q %q", code, stdout, errw)
	}
	if _, _, code = viewRun("tree", "--strict", hid); 1 != code {
		t.Fatalf("strict = %d", code)
	}
	stdout, _, code = viewRun("tree", "--strict", "--format", "json", hid)
	var lj map[string]any
	if err := json.Unmarshal([]byte(stdout), &lj); nil != err || 1 != code {
		t.Fatalf("strict json = %d: %v %s", code, err, stdout)
	}
	if "lossy" != lj["verdict"] {
		t.Fatalf("verdict = %v", lj["verdict"])
	}

	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{"graph", "--relation", "dependsOn", "--relation", "usedBy",
			"--group-by", "layer", "--label", "layer", "--at", "$", file}, "flowchart LR\n  subgraph g0[\"app\"]"},
		{[]string{"graph", "--as", "er", file}, "erDiagram\n"},
		{[]string{"layer", "--relation", "dependsOn", "--group-by", "layer",
			"--layers", "app,svc,data", file}, "| app   cli"},
		{[]string{"sets", "--sets", "$", "--member", "dependsOn",
			"--min-degree", "1", "--max-cols", "2", file}, "# upset  sets=$(4)"},
		{[]string{"layers", "--min-size", "1", file}, "# layers  file=doc.aon  documents=1"},
		{[]string{"ladder", "--at", "$.db.layer", "--as", "dot", file}, "digraph G {"},
	} {
		stdout, errw, code = viewRun(c.args...)
		if 0 != code || !strings.Contains(stdout, c.want) {
			t.Fatalf("%v: code %d out %q err %q", c.args, code, stdout, errw)
		}
	}

	other := filepath.Join(dir, "other.aon")
	if err := os.WriteFile(other, []byte("cli: {layer: string}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stdout, _, code = viewRun("poset", "--at", "$.cli.layer", "--profile", "values", file, other)
	if 0 != code || !strings.HasSuffix(stdout, "n0[\"doc\"]\n  n1[\"other\"]\n  n0 --> n1\n") {
		t.Fatalf("poset = %d: %q", code, stdout)
	}
}
