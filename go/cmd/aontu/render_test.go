/* Copyright (c) 2026 Richard Rodger, MIT License */

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func renderRunCLI(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"render"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func renderFile(t *testing.T, dir, name, src string) string {
	t.Helper()
	file := filepath.Join(dir, name)
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func renderRead(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read %s: %v", path, err)
	}
	return string(b)
}

const renderOne = `out: file("zed.txt", ["foo = BAR"])` + "\n"

const renderMany = `out: [file("a.txt", ["a"]) folder("sub", [file("b.txt", ["b1" "b2"])])]` + "\n"

func TestRenderWritesOneFileToThePath(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aon", renderOne)

	// The path names the file: the tree's own name is not used.
	dest := filepath.Join(dir, "deep", "one.txt")
	if out, errw, code := renderRunCLI(gen, dest); 0 != code || "" != out {
		t.Fatalf("code %d out %q err %q", code, out, errw)
	}
	if got := renderRead(t, dest); "foo = BAR\n" != got {
		t.Fatalf("wrote %q", got)
	}

	// A directory as the path keeps the tree's name.
	sub := filepath.Join(dir, "d")
	if err := os.Mkdir(sub, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, errw, code := renderRunCLI(gen, sub); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	if got := renderRead(t, filepath.Join(sub, "zed.txt")); "foo = BAR\n" != got {
		t.Fatalf("wrote %q", got)
	}
}

func TestRenderWritesATreeBelowThePath(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aon", renderMany)
	build := filepath.Join(dir, "build")

	out, errw, code := renderRunCLI("--format", "json", gen, build)
	if 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	var got struct {
		Verdict string              `json:"verdict"`
		Files   map[string][]string `json:"files"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("not JSON: %v: %s", err, out)
	}
	if "ok" != got.Verdict || 2 != len(got.Files["written"]) ||
		0 != len(got.Files["unchanged"]) {
		t.Fatalf("unexpected report: %s", out)
	}
	if got := renderRead(t, filepath.Join(build, "sub", "b.txt")); "b1\nb2\n" != got {
		t.Fatalf("wrote %q", got)
	}
}

func TestRenderCheckHoldsThePath(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aon", renderMany)
	build := filepath.Join(dir, "build")
	if _, errw, code := renderRunCLI(gen, build); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	if out, errw, code := renderRunCLI("--check", gen, build); 0 != code || "" != out {
		t.Fatalf("clean: code %d out %q err %q", code, out, errw)
	}

	// An edited file and a missing one, each named with its kind.
	renderFile(t, build, "a.txt", "edited\n")
	if err := os.Remove(filepath.Join(build, "sub", "b.txt")); err != nil {
		t.Fatal(err)
	}
	out, _, code := renderRunCLI("--check", gen, build)
	if 1 != code || "content: a.txt\nmissing: sub/b.txt\n" != out {
		t.Fatalf("drift: code %d out %q", code, out)
	}

	out, _, code = renderRunCLI("--check", "--format", "json", gen, build)
	if 1 != code {
		t.Fatalf("drift json: code %d", code)
	}
	var got struct {
		Verdict string              `json:"verdict"`
		Checked []string            `json:"checked"`
		Drift   []map[string]string `json:"drift"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("not JSON: %v: %s", err, out)
	}
	if "drift" != got.Verdict || 2 != len(got.Checked) || 2 != len(got.Drift) ||
		"missing" != got.Drift[1]["kind"] {
		t.Fatalf("unexpected report: %s", out)
	}

	// Nothing was written by the checks.
	if got := renderRead(t, filepath.Join(build, "a.txt")); "edited\n" != got {
		t.Fatalf("check wrote: %q", got)
	}
}

func TestRenderCheckOneFileInTheCurrentDirectory(t *testing.T) {
	dir := t.TempDir()
	renderFile(t, dir, "gen.aon", renderOne)
	t.Chdir(dir)

	if _, errw, code := renderRunCLI("gen.aon", "one.txt"); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	out, _, code := renderRunCLI("--check", "--format", "json", "gen.aon", "one.txt")
	if 0 != code || !strings.Contains(out, `"one.txt"`) ||
		!strings.Contains(out, `"verdict": "ok"`) {
		t.Fatalf("clean: code %d out %q", code, out)
	}
	renderFile(t, dir, "one.txt", "edited\n")
	if out, _, code := renderRunCLI("--check", "gen.aon", "one.txt"); 1 != code ||
		"content: one.txt\n" != out {
		t.Fatalf("drift: code %d out %q", code, out)
	}
}

func TestRenderReadsATemplateEntry(t *testing.T) {
	dir := t.TempDir()
	tmpl := "#- out: file(\"zed.txt\", emit([\"BAR\"], {\n" +
		"#-   match: string\n#-   replace: VALUE: _\n#-   body: [\n" +
		"foo = VALUE\n#-   ]\n#- }))\n"
	gen := renderFile(t, dir, "zed.txt", tmpl)
	dest := filepath.Join(dir, "out.txt")

	if _, errw, code := renderRunCLI("--marker", "#-", gen, dest); 0 != code {
		t.Fatalf("marker: code %d: %s", code, errw)
	}
	if got := renderRead(t, dest); "foo = BAR\n" != got {
		t.Fatalf("wrote %q", got)
	}

	// The profile names the marker for the extension.
	profile := renderFile(t, dir, "text.aon", "@\"aontu:profile\"\n\n"+
		"aontu: Lang: lang: \"text\"\n"+
		"aontu: Lang: template: { marker:\"#-\" ext: [\"txt\"] }\n")
	if _, errw, code := renderRunCLI("--profile", profile, gen, dest); 0 != code {
		t.Fatalf("profile: code %d: %s", code, errw)
	}

	// The extension's own marker, when nothing names one.
	ts := renderFile(t, dir, "gen.ts", strings.ReplaceAll(tmpl, "#-", "//-"))
	if _, errw, code := renderRunCLI(ts, dest); 0 != code {
		t.Fatalf("default marker: code %d: %s", code, errw)
	}
}

func TestRenderReadsAnotherAnchor(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aon",
		strings.Replace(renderOne, "out:", "elsewhere:", 1))
	dest := filepath.Join(dir, "x.txt")

	_, errw, code := renderRunCLI(gen, dest)
	if 4 != code || !strings.Contains(errw, "no_path") {
		t.Fatalf("default anchor: code %d: %s", code, errw)
	}
	if _, errw, code := renderRunCLI("--at", "$.elsewhere", gen, dest); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
}

func TestRenderRefusesWhatJostracaRefuses(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "build")

	// A map that is not a component the runtime knows.
	bad := renderFile(t, dir, "bad.aon",
		`out: { cmp: "Nope", props: {}, children: [] }`+"\n")
	if _, errw, code := renderRunCLI(bad, dest); 4 != code ||
		!strings.Contains(errw, "unknown component: Nope") {
		t.Fatalf("code %d: %s", code, errw)
	}

	// A File written by hand with no name is refused before the runtime.
	nameless := renderFile(t, dir, "nameless.aon",
		`out: { cmp: "File", children: [] }`+"\n")
	if _, errw, code := renderRunCLI(nameless, filepath.Join(dir, "n.txt")); 4 != code ||
		!strings.Contains(errw, "the file at $.out has no name") {
		t.Fatalf("nameless: code %d: %s", code, errw)
	}

	// A fragment whose source is not there fails the write and the check.
	frag := renderFile(t, dir, "frag.aon",
		`out: file("x.txt", [fragment("nope.txt")])`+"\n")
	if _, errw, code := renderRunCLI(frag, dest); 2 != code ||
		!strings.Contains(errw, "nope.txt") {
		t.Fatalf("write: code %d: %s", code, errw)
	}
	if _, errw, code := renderRunCLI("--check", frag, dest); 2 != code ||
		!strings.Contains(errw, "nope.txt") {
		t.Fatalf("check: code %d: %s", code, errw)
	}

	// A path below a file cannot be made.
	gen := renderFile(t, dir, "gen.aon", renderOne)
	afile := renderFile(t, dir, "afile", "x\n")
	if _, errw, code := renderRunCLI(gen, filepath.Join(afile, "x.txt")); 2 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
}

func TestRenderDocumentErrors(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "x.txt")

	broken := renderFile(t, dir, "broken.aon", "out: file(\n")
	if _, errw, code := renderRunCLI(broken, dest); 4 != code || "" == errw {
		t.Fatalf("code %d: %s", code, errw)
	}

	// An include the trust does not admit.
	renderFile(t, dir, "model.aon", "foo: \"BAR\"\n")
	gen := renderFile(t, dir, "gen.aon",
		"@\"./model.aon\"\nout: file(\"zed.txt\", [\"foo = \" + $.foo])\n")
	if _, errw, code := renderRunCLI("--trust", "none", gen, dest); 4 != code ||
		!strings.Contains(errw, "include_denied") {
		t.Fatalf("code %d: %s", code, errw)
	}
	if _, errw, code := renderRunCLI(gen, dest); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
}

func TestRenderUsage(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aon", renderOne)

	out, _, code := renderRunCLI("--help")
	if 0 != code || !strings.Contains(out, "aontu render [--check]") {
		t.Fatalf("help: code %d", code)
	}

	for _, tc := range []struct {
		args []string
		want string
	}{
		{[]string{gen}, "render needs a file and a path"},
		{[]string{gen, "a", "b"}, "render needs a file and a path"},
		{[]string{"--bogus", gen, "x"}, "unknown render option --bogus"},
		{[]string{"--at"}, "--at needs a path"},
		{[]string{"--at", "", gen, "x"}, "--at needs a path"},
		{[]string{"--marker"}, "--marker needs a token"},
		{[]string{"--marker", "", gen, "x"}, "--marker needs a token"},
		{[]string{"--profile"}, "--profile needs a file"},
		{[]string{"--profile", "", gen, "x"}, "--profile needs a file"},
		{[]string{"--format"}, "--format needs text or json"},
		{[]string{"--format", "xml", gen, "x"}, "--format needs text or json"},
		{[]string{"--trust", "nonsense", gen, "x"}, "--trust"},
		{[]string{filepath.Join(dir, "missing.aon"), "x"}, "cannot read"},
		{[]string{"--profile", filepath.Join(dir, "missing.aon"), gen, "x"},
			"cannot read"},
	} {
		_, errw, code := renderRunCLI(tc.args...)
		if 2 != code || !strings.Contains(errw, tc.want) {
			t.Errorf("%v: code %d err %q", tc.args, code, errw)
		}
	}
}
