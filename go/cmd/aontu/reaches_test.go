/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the reaches cases in ts/test/cli.test.ts. What the two
// ports must AGREE on (the verdict and the path) is pinned by
// test/spec/reach.tsv; what each port owns (argument handling, exit
// codes, rendering) is here.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func reachesRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"reaches"}, args...),
		strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func reachesFile(t *testing.T, src string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "doc.aon")
	if err := os.WriteFile(file, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

const reachesDoc = `a: {dependsOn: [&: refer(), path($.b)]}
b: {dependsOn: [&: refer(), path($.c)], usedBy: [&: refer(), path($.d)]}
c: {}
d: {}
`

func TestReachesAnswersWithThePathAndItsExitCode(t *testing.T) {
	file := reachesFile(t, reachesDoc)

	// THE PATH IS THE ANSWER: "yes" is worth little to an operator
	// asking what a failure would take out.
	out, _, code := reachesRun("$.a", "$.c", file)
	if 0 != code {
		t.Fatalf("code %d: %s", code, out)
	}
	if !strings.Contains(out, "verdict: reaches") ||
		!strings.Contains(out, "$.a -> $.b -> $.c") {
		t.Fatalf("path missing: %s", out)
	}

	// An unreachable pair is a FAILED CHECK, not an error: the question
	// was answered, and the answer was no.
	out, _, code = reachesRun("$.c", "$.a", file)
	if 1 != code || !strings.Contains(out, "$.c does not reach $.a") {
		t.Fatalf("unreachable = %d: %s", code, out)
	}

	// --relation follows one relation, which is the difference between
	// "can this reach that at all" and "can it reach it THIS way".
	if _, _, code = reachesRun("$.a", "$.d", file); 0 != code {
		t.Fatalf("a reaches d over every edge = %d", code)
	}
	if _, _, code = reachesRun(
		"$.a", "$.d", "--relation", "dependsOn", file); 1 != code {
		t.Fatalf("a reaches d over dependsOn alone = %d", code)
	}

	// An endpoint that names no entity is a REFUSAL, not a `no`:
	// answering no would report a typo as a fact about the model.
	out, _, code = reachesRun("$.a", "$.nope", file)
	if 4 != code || !strings.Contains(out, "refer_unresolved") ||
		!strings.Contains(out, "nodes with links: $.a, $.b, $.c, $.d") {
		t.Fatalf("bad endpoint = %d: %s", code, out)
	}

	out, _, code = reachesRun("$.a", "$.c", "--format", "json", file)
	if 0 != code {
		t.Fatalf("code %d", code)
	}
	var report map[string]any
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("not JSON: %v", err)
	}
	if nil == report["aontu"] {
		t.Fatalf("envelope missing: %s", out)
	}
	path, _ := report["path"].([]any)
	if 3 != len(path) || "$.a" != path[0] || "$.c" != path[2] {
		t.Fatalf("path: %v", report["path"])
	}
	if _, ok := report["errors"]; ok {
		t.Fatalf("a clean answer carried errors: %s", out)
	}

	// A document that does not stand up has no graph to ask about.
	broken := reachesFile(t, "a: 1\na: 2\n")
	out, _, code = reachesRun("$.a", "$.b", broken)
	if 4 != code || !strings.Contains(out, "scalar_value") {
		t.Fatalf("broken document = %d: %s", code, out)
	}
}

func TestReachesArgumentErrors(t *testing.T) {
	file := reachesFile(t, reachesDoc)
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{}, "needs two entities and one file"},
		{[]string{"a", file}, "needs two entities and one file"},
		{[]string{"--bogus", "a", "b", file}, "unknown reaches option"},
		{[]string{"a", "b", "--format", "yaml", file}, "--format needs"},
		{[]string{"a", "b", "--relation"}, "--relation needs a name"},
		{[]string{"--trust", "nonsense", "a", "b", file}, "--trust"},
		{[]string{"a", "b", "/no/such/file.aon"}, "cannot read"},
	} {
		_, errw, code := reachesRun(c.args...)
		if 2 != code || !strings.Contains(errw, c.want) {
			t.Fatalf("%v = %d: %s", c.args, code, errw)
		}
	}

	out, _, code := reachesRun("--help")
	if 0 != code || !strings.Contains(out, "aontu reaches") {
		t.Fatalf("--help = %d", code)
	}
}

// A NIL ROOT WITH AN EMPTY ERROR LIST (use-cases/BUGS.md §43). The
// id-spread refusal IS the root, so ctx.err is empty and every verb
// that reports "this document does not stand up" used to index err[0]
// and PANIC. The path the two ports give this nil differs ($.& here,
// $ in TypeScript) and is recorded in test/spec/divergent.tsv, so this
// asserts the CODE and the exit -- what a caller acts on -- not the
// path. The TypeScript twin is
// `a-nil-root-with-no-collected-error-is-reported-not-thrown` in
// ts/test/cli.test.ts.
func TestANilRootWithNoCollectedErrorIsReportedNotPanicked(t *testing.T) {
	file := reachesFile(t, "&:\n")
	for _, args := range [][]string{
		{"relations", file},
		{"reaches", "$.b", "$.b", file},
		{"jsonschema", file},
		{"trim", "--check", file},
	} {
		var out, errw bytes.Buffer
		code := run(args, strings.NewReader(""), &out, &errw, false)
		if 4 != code {
			t.Fatalf("%v = %d: %s%s", args, code, out.String(), errw.String())
		}
		// out OR err: jsonschema puts its refusal on stderr, because
		// stdout is the schema's stream.
		if !strings.Contains(out.String()+errw.String(), "elided_value") {
			t.Fatalf("%v did not name the refusal: %s%s",
				args, out.String(), errw.String())
		}
	}
}
