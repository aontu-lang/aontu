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
		{[]string{}, "view needs a kind and one file"},
		{[]string{"tree"}, "view needs a kind and one file"},
		{[]string{"tree", file, file}, "view needs a kind and one file"},
		{[]string{"matrix", file}, "unknown view kind matrix"},
		{[]string{"tree", "--bogus", file}, "unknown view option --bogus"},
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
	if 0 != code || !strings.Contains(out, "aontu view tree") {
		t.Fatalf("help = %d: %s", code, out)
	}
}
