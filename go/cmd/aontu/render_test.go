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
	gen := renderFile(t, dir, "gen.aontu", renderOne)

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
	gen := renderFile(t, dir, "gen.aontu", renderMany)
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
	gen := renderFile(t, dir, "gen.aontu", renderMany)
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

// The excluded-File cases below are the Go twins of the
// check-skips-an-excluded-* cases in ts/test/cli.test.ts, case for
// case: `--check` answers "would `render` change anything", so a node
// the write path skips is not held to the generator's bytes.

func TestRenderCheckSkipsAnExcludedFile(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aontu",
		"out: project(\".\", [\n"+
			"  file({name: \"keep.txt\", exclude: true}, [\"generated\"])\n"+
			"  file({name: \"held.txt\"}, [\"generated\"])\n"+
			"])\n")
	build := filepath.Join(dir, "build")
	if _, errw, code := renderRunCLI(gen, build); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}

	// `render` leaves the excluded file alone, so `--check` says
	// nothing about it -- and still holds the one beside it.
	renderFile(t, build, "keep.txt", "hand written\n")
	if out, errw, code := renderRunCLI("--check", gen, build); 0 != code ||
		"" != out || "" != errw {
		t.Fatalf("one: code %d out %q err %q", code, out, errw)
	}

	renderFile(t, build, "held.txt", "hand written\n")
	if out, _, code := renderRunCLI("--check", gen, build); 1 != code ||
		"content: held.txt\n" != out {
		t.Fatalf("both: code %d out %q", code, out)
	}

	// `checked` still names every path the generator claims.
	out, _, code := renderRunCLI("--check", "--format", "json", gen, build)
	if 1 != code {
		t.Fatalf("json: code %d out %q", code, out)
	}
	var got struct {
		Checked []string            `json:"checked"`
		Drift   []map[string]string `json:"drift"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("not JSON: %v: %s", err, out)
	}
	if 2 != len(got.Checked) || "held.txt" != got.Checked[0] ||
		"keep.txt" != got.Checked[1] {
		t.Fatalf("checked: %v", got.Checked)
	}
	if 1 != len(got.Drift) || "content" != got.Drift[0]["kind"] ||
		"held.txt" != got.Drift[0]["path"] {
		t.Fatalf("drift: %v", got.Drift)
	}
}

func TestRenderCheckReportsAnAbsentExcludedFile(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aontu",
		`out: project(".", [file({name: "keep.txt", exclude: true}, ["gen"])])`+"\n")
	build := filepath.Join(dir, "build")
	if err := os.Mkdir(build, 0o700); err != nil {
		t.Fatal(err)
	}

	// `exclude` is gated on the target existing, so the write path
	// WOULD write this one: `missing` survives the skip.
	if out, _, code := renderRunCLI("--check", gen, build); 1 != code ||
		"missing: keep.txt\n" != out {
		t.Fatalf("code %d out %q", code, out)
	}
}

func TestRenderCheckSkipsAnExcludedMode(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aontu",
		`out: project(".", [`+
			`file({name: "run.sh", exclude: true, mode: 493}, ["#!/bin/sh"])])`+"\n")
	build := filepath.Join(dir, "build")
	if _, errw, code := renderRunCLI(gen, build); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}

	// The write path returns before it saves, so it does not chmod
	// either: the mode difference is not a difference `render` makes.
	if err := os.Chmod(filepath.Join(build, "run.sh"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, errw, code := renderRunCLI(gen, build); 0 != code {
		t.Fatalf("write: code %d: %s", code, errw)
	}
	if out, errw, code := renderRunCLI("--check", gen, build); 0 != code ||
		"" != out || "" != errw {
		t.Fatalf("check: code %d out %q err %q", code, out, errw)
	}
}

func TestRenderCheckHoldsEveryOtherExcludeForm(t *testing.T) {
	dir := t.TempDir()
	build := filepath.Join(dir, "build")

	// Only the boolean form is honoured by both runtime ports; the
	// string and list forms are held to the generator's bytes, as is a
	// `File` that does not ask to be excluded at all.
	for _, form := range [][2]string{
		{"none.aontu", ""},
		{"false.aontu", ", exclude: false"},
		{"string.aontu", `, exclude: "k.txt"`},
		{"list.aontu", `, exclude: ["k.txt"]`},
	} {
		gen := renderFile(t, dir, form[0],
			`out: project(".", [file({name: "k.txt"`+form[1]+
				`}, ["generated"])])`+"\n")
		if _, errw, code := renderRunCLI(gen, build); 0 != code {
			t.Fatalf("%s write: code %d: %s", form[0], code, errw)
		}
		renderFile(t, build, "k.txt", "hand written\n")
		if out, _, code := renderRunCLI("--check", gen, build); 1 != code ||
			"content: k.txt\n" != out {
			t.Fatalf("%s check: code %d out %q", form[0], code, out)
		}
		if err := os.Remove(filepath.Join(build, "k.txt")); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRenderCheckSkipsAnExcludedFileInASet(t *testing.T) {
	dir := t.TempDir()
	gens := filepath.Join(dir, "gens")
	if err := os.Mkdir(gens, 0o700); err != nil {
		t.Fatal(err)
	}
	renderFile(t, gens, "a.aontu",
		`out: file({name: "solo.txt", exclude: true}, ["gen"])`+"\n")
	renderFile(t, gens, "b.aontu",
		`out: project(".", [file({name: "two.txt", exclude: true}, ["gen"])])`+"\n")
	build := filepath.Join(dir, "build")
	if _, errw, code := renderRunCLI(gens, build); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}

	// A set is an ARRAY of trees, and a tree may itself BE the excluded
	// File: pruning empties the array.
	renderFile(t, build, "solo.txt", "hand\n")
	renderFile(t, build, "two.txt", "hand\n")
	if out, errw, code := renderRunCLI("--check", gens, build); 0 != code ||
		"" != out || "" != errw {
		t.Fatalf("check: code %d out %q err %q", code, out, errw)
	}
}

func TestRenderCheckSkipsAnExcludedRootFile(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aontu",
		`out: file({name: "ignored.txt", exclude: true}, ["generated"])`+"\n")
	dest := filepath.Join(dir, "target.txt")

	// The path names the file, so the root File is renamed first and
	// pruning leaves no tree at all.
	if _, errw, code := renderRunCLI(gen, dest); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	renderFile(t, dir, "target.txt", "hand written\n")
	if out, errw, code := renderRunCLI("--check", gen, dest); 0 != code ||
		"" != out || "" != errw {
		t.Fatalf("check: code %d out %q err %q", code, out, errw)
	}
	if got := renderRead(t, dest); "hand written\n" != got {
		t.Fatalf("check wrote: %q", got)
	}
}

func TestRenderCheckSkipsAnExcludedFileBesideABareNode(t *testing.T) {
	dir := t.TempDir()
	gen := renderFile(t, dir, "gen.aontu",
		"out: { cmp: \"Project\", props: {folder: \".\"}, children: [\n"+
			"  { cmp: \"File\", props: {name: \"keep.txt\", exclude: true},\n"+
			"    children: [{cmp: \"Line\", props: {src: \"gen\"}}] }\n"+
			"  { cmp: \"Folder\", props: {name: \"empty\"} }\n"+
			"] }\n")
	build := filepath.Join(dir, "build")
	if _, errw, code := renderRunCLI(gen, build); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}

	// A hand-written tree carries a node with no `children` at all:
	// the walk reads it without composing a path.
	renderFile(t, build, "keep.txt", "hand written\n")
	if out, errw, code := renderRunCLI("--check", gen, build); 0 != code ||
		"" != out || "" != errw {
		t.Fatalf("check: code %d out %q err %q", code, out, errw)
	}
}

func TestRenderCheckOneFileInTheCurrentDirectory(t *testing.T) {
	dir := t.TempDir()
	renderFile(t, dir, "gen.aontu", renderOne)
	t.Chdir(dir)

	if _, errw, code := renderRunCLI("gen.aontu", "one.txt"); 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	out, _, code := renderRunCLI("--check", "--format", "json", "gen.aontu", "one.txt")
	if 0 != code || !strings.Contains(out, `"one.txt"`) ||
		!strings.Contains(out, `"verdict": "ok"`) {
		t.Fatalf("clean: code %d out %q", code, out)
	}
	renderFile(t, dir, "one.txt", "edited\n")
	if out, _, code := renderRunCLI("--check", "gen.aontu", "one.txt"); 1 != code ||
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
	profile := renderFile(t, dir, "text.aontu", "@\"aontu:profile\"\n\n"+
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
	gen := renderFile(t, dir, "gen.aontu",
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
	bad := renderFile(t, dir, "bad.aontu",
		`out: { cmp: "Nope", props: {}, children: [] }`+"\n")
	if _, errw, code := renderRunCLI(bad, dest); 4 != code ||
		!strings.Contains(errw, "unknown component: Nope") {
		t.Fatalf("code %d: %s", code, errw)
	}

	// A File written by hand with no name is refused before the runtime.
	nameless := renderFile(t, dir, "nameless.aontu",
		`out: { cmp: "File", children: [] }`+"\n")
	if _, errw, code := renderRunCLI(nameless, filepath.Join(dir, "n.txt")); 4 != code ||
		!strings.Contains(errw, "the file at $.out has no name") {
		t.Fatalf("nameless: code %d: %s", code, errw)
	}

	// A fragment whose source is not there fails the write and the check.
	frag := renderFile(t, dir, "frag.aontu",
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
	gen := renderFile(t, dir, "gen.aontu", renderOne)
	afile := renderFile(t, dir, "afile", "x\n")
	if _, errw, code := renderRunCLI(gen, filepath.Join(afile, "x.txt")); 2 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
}

func TestRenderDocumentErrors(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "x.txt")

	broken := renderFile(t, dir, "broken.aontu", "out: file(\n")
	if _, errw, code := renderRunCLI(broken, dest); 4 != code || "" == errw {
		t.Fatalf("code %d: %s", code, errw)
	}

	// An include the trust does not admit.
	renderFile(t, dir, "model.aontu", "foo: \"BAR\"\n")
	gen := renderFile(t, dir, "gen.aontu",
		"@\"./model.aontu\"\nout: file(\"zed.txt\", [\"foo = \" + $.foo])\n")
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
	gen := renderFile(t, dir, "gen.aontu", renderOne)

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
		{[]string{filepath.Join(dir, "missing.aontu"), "x"}, "cannot read"},
		{[]string{"--profile", filepath.Join(dir, "missing.aontu"), gen, "x"},
			"cannot read"},
	} {
		_, errw, code := renderRunCLI(tc.args...)
		if 2 != code || !strings.Contains(errw, tc.want) {
			t.Errorf("%v: code %d err %q", tc.args, code, errw)
		}
	}
}

func renderDir(t *testing.T, parts ...string) string {
	t.Helper()
	dir := filepath.Join(parts...)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestRenderWritesAFolderOfGeneratorsAsOne(t *testing.T) {
	dir := t.TempDir()
	gen := renderDir(t, dir, "gen")
	renderFile(t, gen, "a.aontu", `out: file("a.txt", ["a"])`+"\n")
	renderFile(t, gen, "b.rb", "#- out: folder(\"lib\", [file(\"b.rb\", [\nputs \"b\"\n#- ])])\n")
	renderFile(t, gen, "c.aontu", `out: [file("c.txt", ["c"])]`+"\n")
	renderFile(t, gen, ".keep", "")
	renderFile(t, renderDir(t, gen, "sub"), "ignored.aontu",
		`out: file("ignored.txt", ["no"])`+"\n")
	out := filepath.Join(dir, "out")

	// A set is written below the path, a one-file tree under its own name.
	o, errw, code := renderRunCLI("--format", "json", gen, out)
	if 0 != code {
		t.Fatalf("code %d: %s", code, errw)
	}
	var got struct {
		Files map[string][]string `json:"files"`
	}
	if err := json.Unmarshal([]byte(o), &got); err != nil {
		t.Fatalf("not JSON: %v: %s", err, o)
	}
	if 3 != len(got.Files["written"]) {
		t.Fatalf("written: %v", got.Files["written"])
	}
	if "a\n" != renderRead(t, filepath.Join(out, "a.txt")) ||
		"puts \"b\"\n" != renderRead(t, filepath.Join(out, "lib", "b.rb")) ||
		"c\n" != renderRead(t, filepath.Join(out, "c.txt")) {
		t.Fatal("the set was not written whole")
	}
	if _, err := os.Stat(filepath.Join(out, "ignored.txt")); nil == err {
		t.Fatal("a subfolder's file was read as a generator")
	}

	if o, errw, code := renderRunCLI("--check", gen, out); 0 != code || "" != o {
		t.Fatalf("clean: code %d out %q err %q", code, o, errw)
	}
	renderFile(t, out, "a.txt", "edited\n")
	if o, _, code := renderRunCLI("--check", gen, out); 1 != code || "content: a.txt\n" != o {
		t.Fatalf("drift: code %d out %q", code, o)
	}
}

func TestRenderRefusesAFolderItCannotRenderWhole(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")

	// Nothing but dotfiles and subfolders is no generator.
	empty := renderDir(t, dir, "empty")
	renderDir(t, empty, "sub")
	renderFile(t, empty, ".keep", "")
	if _, errw, code := renderRunCLI(empty, out); 2 != code ||
		!strings.Contains(errw, "holds no generator") {
		t.Fatalf("empty: code %d: %s", code, errw)
	}

	// A file with no marker line is refused by name, and nothing is written.
	notes := renderDir(t, dir, "notes")
	renderFile(t, notes, "a.aontu", `out: file("a.txt", ["a"])`+"\n")
	renderFile(t, notes, "notes.md", "# notes\n")
	if _, errw, code := renderRunCLI(notes, out); 2 != code ||
		!strings.Contains(errw, "notes.md carries no") ||
		!strings.Contains(errw, "marker line") {
		t.Fatalf("notes: code %d: %s", code, errw)
	}
	if _, err := os.Stat(out); nil == err {
		t.Fatal("wrote before refusing")
	}

	// A generator that does not stand up refuses the set before it writes.
	broken := renderDir(t, dir, "broken")
	renderFile(t, broken, "a.aontu", `out: file("a.txt", ["a"])`+"\n")
	renderFile(t, broken, "b.aontu", "out: file(\n")
	if _, errw, code := renderRunCLI(broken, out); 4 != code {
		t.Fatalf("broken: code %d: %s", code, errw)
	}
	if _, err := os.Stat(out); nil == err {
		t.Fatal("wrote before refusing")
	}

	// A nameless File anywhere in the set is refused.
	nameless := renderDir(t, dir, "nameless")
	renderFile(t, nameless, "a.aontu", `out: file("a.txt", ["a"])`+"\n")
	renderFile(t, nameless, "b.aontu", `out: { cmp: "File", children: [] }`+"\n")
	if _, errw, code := renderRunCLI(nameless, out); 4 != code ||
		!strings.Contains(errw, "has no name") {
		t.Fatalf("nameless: code %d: %s", code, errw)
	}

	// The same path claimed twice is refused by the runtime.
	twice := renderDir(t, dir, "twice")
	renderFile(t, twice, "a.aontu", `out: file("same.txt", ["a"])`+"\n")
	renderFile(t, twice, "b.aontu", `out: file("same.txt", ["b"])`+"\n")
	for _, args := range [][]string{{twice, out}, {"--check", twice, out}} {
		if _, errw, code := renderRunCLI(args...); 2 != code ||
			!strings.Contains(errw, "same output path") {
			t.Fatalf("%v: code %d: %s", args, code, errw)
		}
	}

	// Alone, a file with no marker line is refused the same way.
	plain := renderFile(t, dir, "plain.txt", "just text\n")
	if _, errw, code := renderRunCLI(plain, filepath.Join(dir, "p.txt")); 2 != code ||
		!strings.Contains(errw, "carries no //- marker line") {
		t.Fatalf("plain: code %d: %s", code, errw)
	}
}

// The record is the runtime's, so a run that never wrote one, or wrote
// one this cannot read, answers with no skips rather than refusing.
// Twin: a-record-it-cannot-read-names-no-skips in ts/test/cli.test.ts.
func TestRenderSkippedReadsWhatItCan(t *testing.T) {
	dir := t.TempDir()
	if got := renderSkipped(dir, 0); 0 != len(got) {
		t.Fatalf("no record: %v", got)
	}

	at := filepath.Join(dir, ".jostraca")
	if err := os.MkdirAll(at, 0o755); nil != err {
		t.Fatal(err)
	}
	log := filepath.Join(at, "jostraca.meta.log")
	if err := os.WriteFile(log, []byte("not json"), 0o600); nil != err {
		t.Fatal(err)
	}
	if got := renderSkipped(dir, 0); 0 != len(got) {
		t.Fatalf("unreadable record: %v", got)
	}

	// Readable JSON that is not a record.
	if err := os.WriteFile(log, []byte("null"), 0o600); nil != err {
		t.Fatal(err)
	}
	if got := renderSkipped(dir, 0); 0 != len(got) {
		t.Fatalf("not a record: %v", got)
	}

	if err := os.WriteFile(log, []byte(`{"files":{
		"old.txt":{"action":"skip","when":10},
		"zed.txt":{"action":"skip","when":30},
		"kept.txt":{"action":"write","when":30}}}`), 0o600); nil != err {
		t.Fatal(err)
	}
	if got := renderSkipped(dir, 20); 1 != len(got) || "zed.txt" != got[0] {
		t.Fatalf("since: %v", got)
	}
}
