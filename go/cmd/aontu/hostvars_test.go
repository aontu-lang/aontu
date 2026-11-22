/* Copyright (c) 2026 Richard Rodger, MIT License */

// Host bindings on the command line, --var and --var-text (HV1 of
// sketch/LANG-REFINEMENT-PLAN.0.md). ts/test/hostvars.test.ts holds the
// same cases for the TypeScript command.

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

type ran struct {
	out, err string
	code     int
}

func hvRun(stdin string, tty bool, args ...string) ran {
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(stdin), &out, &errw, tty)
	return ran{out.String(), errw.String(), code}
}

func hvFiles(t *testing.T, spec map[string]string) func(string) string {
	t.Helper()
	dir := t.TempDir()
	for name, src := range spec {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); nil != err {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(src), 0o644); nil != err {
			t.Fatal(err)
		}
	}
	return func(name string) string { return filepath.Join(dir, name) }
}

const hvV = "env: $env\nreplicas: integer & $n\n"

func TestHostVarsBindSourceAndText(t *testing.T) {
	f := hvFiles(t, map[string]string{"v.aontu": hvV})
	a := hvRun("", true, "--var", "env=prod", "--var", "n=3", f("v.aontu"))
	if 0 != a.code || "{\n  \"env\": \"prod\",\n  \"replicas\": 3\n}\n" != a.out {
		t.Fatalf("source: %+v", a)
	}
	b := hvRun("", true, "--var-text", "env=3", "--var", "n=3", f("v.aontu"))
	if "{\n  \"env\": \"3\",\n  \"replicas\": 3\n}\n" != b.out {
		t.Fatalf("text: %+v", b)
	}
	c := hvRun("", true, "-c", "--var", "env={a: 1}", "--var", "n=3", f("v.aontu"))
	if "{\"env\":{\"a\":1},\"replicas\":3}\n" != c.out {
		t.Fatalf("canon: %+v", c)
	}
}

func TestHostVarsRefusedAsUsage(t *testing.T) {
	f := hvFiles(t, map[string]string{"v.aontu": hvV})
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"--var", "zz=1"}, `--var binds \$zz, which no document reads`},
		{[]string{"--var-text", "zz=1"}, `--var-text binds \$zz, which no document reads`},
		{[]string{"--var", "n=}"}, `--var n: \[aontu/unexpected\]`},
		{[]string{"--var", "n=$.k"}, `--var n: a binding is a value, and reads no path or variable`},
		{[]string{"--var", "n=$m"}, `--var n: \[aontu/unknown_var\]`},
		{[]string{"--var", `n=@"v.aontu"`}, `--var n: \[aontu/include_denied\]`},
		{[]string{"--var", "env"}, `--var needs name=value`},
		{[]string{"--var", "1n=3"}, `--var needs name=value`},
		{[]string{"--var", "n=1", "--var-text", "n=2"}, `--var-text binds \$n a second time`},
	}
	for _, c := range cases {
		args := append(append([]string{"--var", "env=prod"}, c.args...), f("v.aontu"))
		r := hvRun("", true, args...)
		if 2 != r.code || "" != r.out || !regexp.MustCompile(c.want).MatchString(r.err) {
			t.Fatalf("%v: %+v", c.args, r)
		}
	}
	if r := hvRun("", true, f("v.aontu"), "--var"); !strings.Contains(r.err, "--var needs name=value") {
		t.Fatalf("trailing: %+v", r)
	}
}

func TestHostVarsMissingFileIsTheFileError(t *testing.T) {
	r := hvRun("", true, "--var", "n=3", "nosuch.aontu")
	if 1 != r.code || !strings.Contains(r.err, "cannot read nosuch.aontu") {
		t.Fatalf("%+v", r)
	}
}

func TestHostVarsSitedAtTheOption(t *testing.T) {
	f := hvFiles(t, map[string]string{"v.aontu": hvV})
	r := hvRun("", true, "--var", "env=prod", "--var", "n=x", f("v.aontu"))
	if 1 != r.code || !strings.Contains(r.err, "--> --var n:1:1\n  1 | x\n") {
		t.Fatalf("%+v", r)
	}
	s := hvRun("", true, "--var", "env=prod", "--var-text", "n=12", f("v.aontu"))
	if !strings.Contains(s.err, "--> --var-text n:1:1\n  1 | \"12\"\n") {
		t.Fatalf("%+v", s)
	}
}

func TestHostVarsAnIncludeReadsThem(t *testing.T) {
	f := hvFiles(t, map[string]string{
		"main.aontu": "@\"./inc.aontu\"\nb: 1\n",
		"inc.aontu":  "a: $deep\n",
	})
	r := hvRun("", true, "--var", "deep=7", f("main.aontu"))
	if "{\n  \"a\": 7,\n  \"b\": 1\n}\n" != r.out {
		t.Fatalf("%+v", r)
	}
	for _, trust := range []string{"none", "system", "root"} {
		want := 0
		if "none" == trust {
			want = 1
		}
		if got := hvRun("", true, "--trust", trust, "--var", "deep=7", f("main.aontu")); want != got.code {
			t.Fatalf("%s: %+v", trust, got)
		}
	}
}

func TestHostVarsOnStdin(t *testing.T) {
	a := hvRun(hvV, false, "--var", "env=prod", "--var", "n=3")
	if "{\n  \"env\": \"prod\",\n  \"replicas\": 3\n}\n" != a.out {
		t.Fatalf("%+v", a)
	}
	b := hvRun(hvV, false, "--var", "q=1")
	if 2 != b.code || !strings.Contains(b.err, "--var binds $q, which no document reads") {
		t.Fatalf("%+v", b)
	}
	// A source that does not parse says nothing of what it reads.
	c := hvRun("a: ]", false, "--var", "q=1")
	if 1 != c.code || strings.Contains(c.err, "no document reads") {
		t.Fatalf("%+v", c)
	}
}

func TestHostVarsTheReplTakesThem(t *testing.T) {
	f := hvFiles(t, map[string]string{"vals.aontu": "n: 3\n"})
	// A session has no document yet, so a binding nothing reads passes.
	a := hvRun("k: $n\nj: $q\n:quit\n", true, "--jsonl", "--var", "n=3", "--var-text", "q=7")
	if !strings.Contains(a.out, `"out":"{\n  \"k\": 3\n}"`) || !strings.Contains(a.out, `"out":"{\n  \"j\": \"7\"\n}"`) {
		t.Fatalf("%+v", a)
	}
	b := hvRun("k: $n\n:quit\n", true, "--jsonl", "--vars", f("vals.aontu"))
	if !strings.Contains(b.out, `"out":"{\n  \"k\": 3\n}"`) {
		t.Fatalf("%+v", b)
	}
	if c := hvRun("", true, "--var", "n=}"); 2 != c.code || !strings.Contains(c.err, "--var n: [aontu/unexpected]") {
		t.Fatalf("%+v", c)
	}
}

func TestHostVarsEveryVerbThatEvaluates(t *testing.T) {
	f := hvFiles(t, map[string]string{
		"s.aontu":  "replicas: integer\nenv: \"prod\" | \"dev\"\n",
		"d.aontu":  "replicas: $n\nenv: $env\n",
		"m.aontu":  "k: $n\n",
		"ov.aontu": "x: string\n",
		"d.json":   "{\"replicas\": 3, \"env\": \"prod\"}\n",
	})
	if r := hvRun("", true, "vet", "--var", "n=3", "--var", "env=prod", f("s.aontu"), f("d.aontu")); 0 != r.code {
		t.Fatalf("vet: %+v", r)
	}
	bad := hvRun("", true, "vet", "--var", "n=x", "--var", "env=prod", f("s.aontu"), f("d.aontu"))
	if !strings.HasPrefix(bad.out, "verdict: invalid\n") || !strings.Contains(bad.out, `--var n:1:1 ("x")`) {
		t.Fatalf("vet bad: %+v", bad)
	}
	if r := hvRun("", true, "vet", "--var", "n", f("s.aontu"), f("d.aontu")); !strings.Contains(r.err, "--var needs name=value") {
		t.Fatalf("vet malformed: %+v", r)
	}
	if r := hvRun("", true, "vet", "--var", "q=1", f("s.aontu"), f("d.json")); !strings.Contains(r.err, "--var binds $q, which no document reads") {
		t.Fatalf("vet unread: %+v", r)
	}
	if r := hvRun("", true, "model", "get", "$.k", "--var", "n=3", f("m.aontu")); "3\n" != r.out {
		t.Fatalf("get: %+v", r)
	}
	if r := hvRun("", true, "model", "--var", "n=3", "get", "$.k", f("m.aontu")); "3\n" != r.out {
		t.Fatalf("get after: %+v", r)
	}
	for _, args := range [][]string{
		{"model", "why", "$.k", "--var", "n=3", f("m.aontu")},
		{"trim", "--check", "--var", "n=3", f("m.aontu")},
		{"subsume", "--var", "n=3", f("m.aontu"), f("m.aontu")},
		{"relations", "--var", "n=3", f("m.aontu")},
		{"jsonschema", "--var", "n=3", f("m.aontu")},
	} {
		if r := hvRun("", true, args...); 0 != r.code {
			t.Fatalf("%v: %+v", args, r)
		}
	}
	set := hvRun("", true, "model", "set", "x=$n", "--entry", f("m.aontu"),
		"--overlay", f("ov.aontu"), "--var", "n=3")
	if 1 != set.code || !strings.Contains(set.err, "schema: --var n:1:1 (3)") {
		t.Fatalf("set: %+v", set)
	}
}

func TestHostVarsHashAndBreakingNameThem(t *testing.T) {
	f := hvFiles(t, map[string]string{
		"v.aontu":    hvV,
		"old.aontu":  "env: string\nreplicas: integer\n",
		"none.aontu": "aontu_policy: compat: \"none\"\nn: $n\n",
	})
	text := hvRun("", true, "hash", "--var-text", "env=prod", "--var", "n=3", f("v.aontu"))
	if "aontu: hashed under --var-text env=prod --var n=3\n" != text.err || !strings.HasPrefix(text.out, "aon1-") {
		t.Fatalf("hash: %+v", text)
	}
	var hj struct{ Bindings []string }
	_ = json.Unmarshal([]byte(hvRun("", true, "hash", "--format", "json",
		"--var", "env=prod", "--var", "n=3", f("v.aontu")).out), &hj)
	if "--var env=prod,--var n=3" != strings.Join(hj.Bindings, ",") {
		t.Fatalf("hash json: %v", hj)
	}
	if out := hvRun("", true, "hash", "--format", "json", f("old.aontu")).out; strings.Contains(out, "bindings") {
		t.Fatalf("hash json unbound: %s", out)
	}
	brk := hvRun("", true, "breaking", "--against", f("old.aontu"),
		"--var", "env=prod", "--var", "n=3", f("v.aontu"))
	if !strings.HasPrefix(brk.out, "verdict: breaking\nunder: --var env=prod --var n=3\n") {
		t.Fatalf("breaking: %+v", brk)
	}
	var bj struct{ Bindings []string }
	_ = json.Unmarshal([]byte(hvRun("", true, "breaking", "--format", "json", "--against", f("old.aontu"),
		"--var", "env=prod", "--var", "n=3", f("v.aontu")).out), &bj)
	if 2 != len(bj.Bindings) {
		t.Fatalf("breaking json: %v", bj)
	}
	none := hvRun("", true, "breaking", "--against", f("none.aontu"), "--var", "n=3", f("none.aontu"))
	if "verdict: compatible\nunder: --var n=3\n" != none.out {
		t.Fatalf("none: %+v", none)
	}
	var nj struct{ Bindings []string }
	_ = json.Unmarshal([]byte(hvRun("", true, "breaking", "--format", "json", "--against", f("none.aontu"),
		"--var", "n=3", f("none.aontu")).out), &nj)
	if 1 != len(nj.Bindings) {
		t.Fatalf("none json: %v", nj)
	}
}

func TestHostVarsADocumentThatCannotSayRefusesNone(t *testing.T) {
	f := hvFiles(t, map[string]string{
		"tpl/a.aontu":  "a: $n\n",
		"notes.md":     "text\n",
		"broken.aontu": "a: ]\n",
		"m.aontu":      "k: 1\n",
	})
	for _, args := range [][]string{
		{"render", "--var", "n=3", f("tpl"), "$.a"},
		{"--var", "n=3", f("notes.md")},
		{"--var", "n=3", f("broken.aontu")},
		{"vet", "--var", "n=3", f("m.aontu"), f("missing.aontu")},
	} {
		if r := hvRun("", true, args...); strings.Contains(r.err, "no document reads") {
			t.Fatalf("%v: %+v", args, r)
		}
	}
	if r := hvRun("", true, "model", "get", "$.k", "--var", "n=3", f("m.aontu")); !strings.Contains(r.err, "--var binds $n, which no document reads") {
		t.Fatalf("%+v", r)
	}
}

func TestHostVarsFmtAndThePackageVerbsRefuse(t *testing.T) {
	f := hvFiles(t, map[string]string{"m.aontu": "k: $n\n"})
	if r := hvRun("", true, "fmt", "--var", "n=3", f("m.aontu")); !strings.Contains(r.err, "--var is refused here: fmt evaluates no document") {
		t.Fatalf("fmt: %+v", r)
	}
	if r := hvRun("", true, "pkg", "tidy", "--var", "n=3"); !strings.Contains(r.err, "--var is refused here: a package is published with no host") {
		t.Fatalf("pkg: %+v", r)
	}
	if r := hvRun("", true, "sync", "--var-text", "n=3"); !strings.Contains(r.err, "--var-text is refused here: a package is published") {
		t.Fatalf("sync: %+v", r)
	}
}

func TestHostVarsFromAFile(t *testing.T) {
	f := hvFiles(t, map[string]string{
		"v.aontu":    hvV,
		"vals.aontu": "env: \"prod\"\nn: 3\nregion: \"eu\"\n",
		"bad.aontu":  "env: \"prod\"\nn: \"three\"\n",
		"list.aontu": "[1, 2]\n",
		"key.aontu":  "\"a-b\": 1\n",
		"inc.aontu":  "x: @\"./vals.aontu\"\n",
	})
	// A key no document reads, region, is accepted.
	if r := hvRun("", true, "--vars", f("vals.aontu"), f("v.aontu")); "{\n  \"env\": \"prod\",\n  \"replicas\": 3\n}\n" != r.out {
		t.Fatalf("%+v", r)
	}
	if r := hvRun("", true, "--vars", f("bad.aontu"), f("v.aontu")); !regexp.MustCompile(`--> --vars \S+bad.aontu n:1:1\n  1 \| "three"\n`).MatchString(r.err) {
		t.Fatalf("%+v", r)
	}
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"--vars", f("vals.aontu"), "--var", "n=4"}, `--var binds \$n a second time`},
		{[]string{"--var", "n=4", "--vars", f("vals.aontu")}, `--vars \S+vals.aontu binds \$n a second time`},
		{[]string{"--vars", f("list.aontu")}, `--vars \S+list.aontu holds no map of names`},
		{[]string{"--vars", f("key.aontu")}, `: "a-b" is no name \$ can read`},
		{[]string{"--vars", f("inc.aontu")}, `\[aontu/include_denied\]`},
		{[]string{"--vars", f("nosuch.aontu")}, `--vars needs a file it can read: \S+nosuch.aontu`},
	}
	for _, c := range cases {
		r := hvRun("", true, append(c.args, f("v.aontu"))...)
		if 2 != r.code || !regexp.MustCompile(c.want).MatchString(r.err) {
			t.Fatalf("%v: %+v", c.args, r)
		}
	}
	if r := hvRun("", true, f("v.aontu"), "--vars"); !strings.Contains(r.err, "--vars needs a file it can read\n") {
		t.Fatalf("%+v", r)
	}
	if r := hvRun("", true, "vet", "--vars", f("list.aontu"), f("v.aontu"), f("v.aontu")); !strings.Contains(r.err, "holds no map of names") {
		t.Fatalf("%+v", r)
	}
	if r := hvRun("", true, "hash", "--vars", f("vals.aontu"), "--var-text", "env2=x", f("v.aontu")); !strings.Contains(r.err, "--var-text binds $env2, which no document reads") {
		t.Fatalf("%+v", r)
	}
	var hj struct{ Bindings []string }
	_ = json.Unmarshal([]byte(hvRun("", true, "hash", "--format", "json", "--vars", f("vals.aontu"), f("v.aontu")).out), &hj)
	if 1 != len(hj.Bindings) || "--vars "+f("vals.aontu") != hj.Bindings[0] {
		t.Fatalf("%v", hj)
	}
	if r := hvRun("", true, "pkg", "tidy", "--vars", f("vals.aontu")); !strings.Contains(r.err, "--vars is refused here: a package is published") {
		t.Fatalf("%+v", r)
	}
	if r := hvRun(hvV, false, "--vars", f("vals.aontu")); "{\n  \"env\": \"prod\",\n  \"replicas\": 3\n}\n" != r.out {
		t.Fatalf("%+v", r)
	}
}

func TestHostVarsReadInAnAssignmentAndAnyName(t *testing.T) {
	f := hvFiles(t, map[string]string{"e.aontu": "n: number\n", "o.aontu": "", "k.aontu": "k: $constructor\n"})
	if r := hvRun("", true, "model", "set", "n=$n", "--entry", f("e.aontu"), "--overlay", f("o.aontu"),
		"--var", "n=3"); strings.Contains(r.err, "no document reads") {
		t.Fatalf("%+v", r)
	}
	if r := hvRun("", true, "--var", "constructor=3", f("k.aontu")); "{\n  \"k\": 3\n}\n" != r.out {
		t.Fatalf("%+v", r)
	}
}
