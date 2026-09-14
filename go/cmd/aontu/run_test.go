/* Copyright (c) 2025 Richard Rodger, MIT License */

// Coverage for the command entry: run() drives everything main does
// except the final os.Exit, on in-memory pipes.

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

func TestRunHelpVersionAndBadOption(t *testing.T) {
	var out, errw bytes.Buffer
	if code := run([]string{"--help"}, nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), "Usage: aontu") {
		t.Fatalf("help: %d %q", code, out.String())
	}
	out.Reset()
	if code := run([]string{"-v"}, nil, &out, &errw, true); code != 0 ||
		strings.TrimSpace(out.String()) != aontu.VERSION {
		t.Fatalf("version: %d %q", code, out.String())
	}
	if code := run([]string{"--bogus"}, nil, &out, &errw, true); code != 2 ||
		!strings.Contains(errw.String(), "unknown option") {
		t.Fatalf("bad option: %d %q", code, errw.String())
	}
}

func TestRunMistypedVerbIsAUsageError(t *testing.T) {
	var out, errw bytes.Buffer
	code := run([]string{"vet2", "schema.aon", "data.json"},
		nil, &out, &errw, true)
	if code != 2 {
		t.Fatalf("code: %d", code)
	}
	if !strings.Contains(errw.String(), "evaluates one document, and 3 were given") ||
		!strings.Contains(errw.String(), "mistyped verb reads as a file name") {
		t.Fatalf("stderr: %q", errw.String())
	}
	if out.String() != "" {
		t.Fatalf("stdout: %q", out.String())
	}
}

// The same refusal, reached the other way: the bare form is documented
// as `aontu [options] [file]`, singular, and a second file is a usage
// error rather than a silent discard.
func TestRunTwoFilesIsAUsageError(t *testing.T) {
	var out, errw bytes.Buffer
	code := run([]string{"a.aon", "b.aon"}, nil, &out, &errw, true)
	if code != 2 ||
		!strings.Contains(errw.String(), "evaluates one document, and 2 were given") {
		t.Fatalf("%d %q", code, errw.String())
	}
}

func TestRunFileModes(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "m.aontu")
	if err := os.WriteFile(file, []byte("a:1 b:$.a"), 0644); err != nil {
		t.Fatal(err)
	}
	var out, errw bytes.Buffer
	if code := run([]string{file}, nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), `"b": 1`) {
		t.Fatalf("file json: %d %q", code, out.String())
	}
	out.Reset()
	if code := run([]string{"-c", file}, nil, &out, &errw, true); code != 0 ||
		strings.TrimSpace(out.String()) != `{"a":1,"b":1}` {
		t.Fatalf("file canon: %d %q", code, out.String())
	}
	if code := run([]string{filepath.Join(dir, "missing.aontu")}, nil, &out, &errw, true); code != 1 ||
		!strings.Contains(errw.String(), "cannot read") {
		t.Fatalf("missing file: %d %q", code, errw.String())
	}
}

func TestRunStdinPipe(t *testing.T) {
	var out, errw bytes.Buffer
	if code := run(nil, strings.NewReader("a:2"), &out, &errw, false); code != 0 ||
		!strings.Contains(out.String(), `"a": 2`) {
		t.Fatalf("stdin pipe: %d %q", code, out.String())
	}
	// A conflicting source reports on stderr with exit 1.
	if code := run(nil, strings.NewReader("a:1 a:2"), &out, &errw, false); code != 1 ||
		errw.Len() == 0 {
		t.Fatalf("stdin conflict: %d %q", code, errw.String())
	}
	// A failing stdin reader reports the read error.
	errw.Reset()
	if code := run(nil, errReader{}, &out, &errw, false); code != 1 ||
		!strings.Contains(errw.String(), "cannot read stdin") {
		t.Fatalf("stdin error: %d %q", code, errw.String())
	}
}

func TestRunReplPath(t *testing.T) {
	var out bytes.Buffer
	code := run(nil, strings.NewReader(":quit\n"), &out, &bytes.Buffer{}, true)
	if code != 0 || !strings.Contains(out.String(), "REPL") {
		t.Fatalf("repl path: %d %q", code, out.String())
	}
}

func TestReplCommandsAndErrors(t *testing.T) {
	var out bytes.Buffer
	in := strings.NewReader(":help\n:json\na:1 a:2\n:quit\n")
	repl("canon", false, trustArg{}, in, &out)
	s := out.String()
	for _, want := range []string{"Usage: aontu", "json output", "Cannot"} {
		if !strings.Contains(s, want) {
			t.Fatalf("repl output missing %q:\n%s", want, s)
		}
	}

	out.Reset()
	repl("json", false, trustArg{}, errReader{}, &out)
	if !strings.Contains(out.String(), "input error") {
		t.Fatalf("scanner error must be reported: %q", out.String())
	}
}

func TestRenderCanonError(t *testing.T) {
	if _, err := render(aontu.New(), "a:number > 0", "canon"); err == nil {
		t.Fatalf("canon parse error must surface")
	}
}

func TestStdinIsPipe(t *testing.T) {
	_ = stdinIsPipe()
	f, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	old := os.Stdin
	os.Stdin = f
	defer func() { os.Stdin = old }()
	if !stdinIsPipe() {
		t.Fatalf("an unanswerable stdin must read, not open a REPL")
	}

	// A terminal is not a pipe, which is the arm that opens the REPL.
	if tty := terminalForTest(t); nil != tty {
		os.Stdin = tty
		if stdinIsPipe() {
			t.Fatalf("a terminal must open the REPL")
		}
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

// aontuForFile: the Abs-failure fallback (working directory removed
// out from under a relative path).
func TestAontuForFileAbsFailure(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "gone")
	if err := os.Mkdir(dir, 0755); err != nil {
		t.Fatal(err)
	}
	old, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(old)
	os.RemoveAll(dir)
	if a := aontuForFile("x.aontu"); a == nil {
		t.Fatalf("aontuForFile must always build an engine")
	}
}

func TestReplJSONLIsReachableOverAPipe(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "m.aon")
	if err := os.WriteFile(file, []byte("a: 1\n"), 0o600); nil != err {
		t.Fatal(err)
	}

	var out, errw bytes.Buffer
	// The path is NOT source here: `:load` hands its argument straight
	// to the file reader (repl.go), so a native separator is correct
	// and the sp() rule the trust suites need does not apply.
	in := strings.NewReader(":load " + file + "\n:get $.a\n")
	if code := run([]string{"--jsonl"}, in, &out, &errw, false); 0 != code {
		t.Fatalf("exit %d, stderr %q", code, errw.String())
	}

	text := out.String()
	if !strings.HasSuffix(text, "\n") {
		t.Fatalf("stream does not end in a newline: %q", text)
	}
	lines := strings.Split(strings.TrimSuffix(text, "\n"), "\n")
	if 2 != len(lines) {
		t.Fatalf("want one JSON line per command, got %d: %q", len(lines), text)
	}
	for _, line := range lines {
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); nil != err {
			t.Fatalf("not JSON: %q", line)
		}
		if true != m["ok"] {
			t.Fatalf("command failed: %q", line)
		}
	}
	// The last answer is the value the document holds.
	var last map[string]any
	_ = json.Unmarshal([]byte(lines[1]), &last)
	if "1" != last["out"] {
		t.Fatalf("want out 1, got %v", last["out"])
	}
}

func TestRunTextExtFlag(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "doc.md"),
		[]byte("# hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(dir, "main.aon")
	if err := os.WriteFile(entry,
		[]byte("doc: @\"./doc.md\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var out, errw bytes.Buffer
	if code := run([]string{"--text-ext", "md", "-c", entry},
		nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), `{"doc":"# hi\n"}`) {
		t.Fatalf("widened: %d %q %q", code, out.String(), errw.String())
	}

	// The dotted spelling is the same flag, and two of them accumulate.
	out.Reset()
	if code := run([]string{"--text-ext", ".sql", "--text-ext", "md",
		"-c", entry}, nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), `{"doc":"# hi\n"}`) {
		t.Fatalf("repeated: %d %q", code, out.String())
	}

	// Every way of spelling it wrong is a usage error rather than a
	// flag that quietly does nothing.
	for _, bad := range []string{"", ".", "md,", "a b", "md,,sql"} {
		errw.Reset()
		if code := run([]string{"--text-ext", bad, entry},
			nil, &out, &errw, true); code != 2 ||
			!strings.Contains(errw.String(), "--text-ext needs extensions") {
			t.Fatalf("accepted %q: %d %q", bad, code, errw.String())
		}
	}
	// ... including the flag with no value at all.
	errw.Reset()
	if code := run([]string{entry, "--text-ext"},
		nil, &out, &errw, true); code != 2 ||
		!strings.Contains(errw.String(), "--text-ext needs extensions") {
		t.Fatalf("trailing flag: %d %q", code, errw.String())
	}
}

// THE SAME FLAG ON THE VERB ROAD. takeTrust strips it before a verb
// parses its own tail, and that is a different arm from the bare
// command's loop above -- the split that once let `--trust` reach one
// and not the other.
func TestRunTextExtOnVerbs(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "doc.md"),
		[]byte("# hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(dir, "main.aon")
	if err := os.WriteFile(entry,
		[]byte("doc: @\"./doc.md\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var out, errw bytes.Buffer
	if code := run([]string{"get", "$.doc", "--text-ext", "md", entry},
		nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), "# hi") {
		t.Fatalf("verb: %d %q %q", code, out.String(), errw.String())
	}

	// Repeated and dotted, on the verb road too.
	out.Reset()
	if code := run([]string{"get", "$.doc", "--text-ext", ".sql",
		"--text-ext", "md", entry}, nil, &out, &errw, true); code != 0 ||
		!strings.Contains(out.String(), "# hi") {
		t.Fatalf("verb repeated: %d %q", code, out.String())
	}

	for _, bad := range []string{"", ".", "md,", "a b"} {
		errw.Reset()
		if code := run([]string{"get", "$.doc", "--text-ext", bad, entry},
			nil, &out, &errw, true); code != 2 ||
			!strings.Contains(errw.String(), "--text-ext needs extensions") {
			t.Fatalf("verb accepted %q: %d %q", bad, code, errw.String())
		}
	}
	errw.Reset()
	if code := run([]string{"get", "$.doc", entry, "--text-ext"},
		nil, &out, &errw, true); code != 2 ||
		!strings.Contains(errw.String(), "--text-ext needs extensions") {
		t.Fatalf("verb trailing flag: %d %q", code, errw.String())
	}
}


// evalReportOf drives the bare command in json mode and reads the
// envelope back, so the assertions are about the SHAPE rather than
// about a formatting of it.
func evalReportOf(t *testing.T, args ...string) (evalReportJSON, int, string) {
	t.Helper()
	var out, errw bytes.Buffer
	code := run(args, strings.NewReader(""), &out, &errw, false)
	var report evalReportJSON
	if err := json.Unmarshal(out.Bytes(), &report); nil != err {
		t.Fatalf("not JSON (%v): %q", err, out.String())
	}
	return report, code, errw.String()
}

// THE DEFAULT ENTRY POINT WAS THE ONE AN AGENT HAD TO PARSE WITH A
// REGULAR EXPRESSION: every verb but this one could answer as an
// object, and this is the one an agent reaches for first.
func TestRunBareFormatJSON(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "good.aon")
	if err := os.WriteFile(good, []byte("a:1 b:$.a"), 0o644); nil != err {
		t.Fatal(err)
	}

	report, code, errs := evalReportOf(t, "--format", "json", good)
	if 0 != code || "" != errs {
		t.Fatalf("good: %d %q", code, errs)
	}
	if "eval" != report.Aontu.Verb || aontu.VERSION != report.Aontu.Version {
		t.Errorf("producer: %+v", report.Aontu)
	}
	if !report.OK || 0 != len(report.Findings) {
		t.Errorf("good: ok=%v findings=%d", report.OK, len(report.Findings))
	}
	// The `out` string is exactly what the text form prints.
	var text, errw bytes.Buffer
	if 0 != run([]string{good}, strings.NewReader(""), &text, &errw, false) {
		t.Fatalf("text form: %q", errw.String())
	}
	if strings.TrimSuffix(text.String(), "\n") != report.Out {
		t.Errorf("out differs from the text form:\n%q\n%q",
			report.Out, text.String())
	}

	// The canon answer travels the same way: `--canon` chooses what the
	// answer IS, `--format` how it is wrapped.
	canon, _, _ := evalReportOf(t, "-c", "--format", "json", good)
	if `{"a":1,"b":1}` != canon.Out {
		t.Errorf("canon out: %q", canon.Out)
	}
}

// THE FAILURE IS THE POINT. A finding with a code an agent can hand
// straight to `aontu explain`, and the class from the registry both
// ports hold set-equal.
func TestRunBareFormatJSONFailure(t *testing.T) {
	dir := t.TempDir()
	bad := filepath.Join(dir, "bad.aon")
	if err := os.WriteFile(bad, []byte("a: 1 & 2\n"), 0o644); nil != err {
		t.Fatal(err)
	}

	report, code, errs := evalReportOf(t, "--format", "json", bad)
	if 1 != code {
		t.Fatalf("exit %d, want 1", code)
	}
	if "" != errs {
		t.Errorf("json mode wrote to stderr: %q", errs)
	}
	if report.OK || "" != report.Out {
		t.Errorf("failure: ok=%v out=%q", report.OK, report.Out)
	}
	if 1 != len(report.Findings) {
		t.Fatalf("findings: %+v", report.Findings)
	}
	f := report.Findings[0]
	if "scalar_value" != f.Code || "conflict" != f.Class ||
		"$" != f.Path || "error" != f.Severity {
		t.Errorf("finding: %+v", f)
	}
	// THE HEADLINE ONLY: the frames under it are drawn for a person,
	// and only the first line is held to parity between the ports.
	if "[aontu/scalar_value]: Cannot unify values at path $.a" != f.Message {
		t.Errorf("message: %q", f.Message)
	}
	if 0 != len(f.Sites) {
		t.Errorf("sites: %+v", f.Sites)
	}
	if nil != f.Hint {
		t.Errorf("the hint tables are not in cross-port parity: %q", *f.Hint)
	}
}

// The stdin entry answers the same way, and the flag itself is checked.
func TestRunBareFormatJSONOverStdin(t *testing.T) {
	var out, errw bytes.Buffer
	code := run([]string{"--format", "json"},
		strings.NewReader("a: 1 & 2\n"), &out, &errw, false)
	if 1 != code || !strings.Contains(out.String(), `"scalar_value"`) {
		t.Fatalf("stdin: %d %q %q", code, out.String(), errw.String())
	}

	for _, args := range [][]string{
		{"--format", "yaml"}, {"--format"},
	} {
		errw.Reset()
		if code := run(args, strings.NewReader(""), &out, &errw, false); 2 != code ||
			!strings.Contains(errw.String(), "--format needs text or json") {
			t.Errorf("%v: %d %q", args, code, errw.String())
		}
	}
}

// A THROW THE ENGINE DID NOT COLLECT carries no code, and is reported
// as the text alone rather than as an invented one. The path is
// reachable only through the emitter, so it is driven there.
func TestEmitJSONWithoutAFinding(t *testing.T) {
	var out, errw bytes.Buffer
	code := emit(aontu.New(), "a: 1 & 2\n", "json", "json", &out, &errw)
	if 1 != code || !strings.Contains(out.String(), `"findings"`) {
		t.Fatalf("emit: %d %q", code, out.String())
	}
	if 0 != len(evalFinding(errors.New("boom"))) {
		t.Error("a foreign error should carry no finding")
	}
}


func TestVacuitySignals(t *testing.T) {
	dir := t.TempDir()
	plain := filepath.Join(dir, "plain.aon")
	if err := os.WriteFile(plain, []byte("a: { b: 1 }\n"), 0o644); nil != err {
		t.Fatal(err)
	}

	say := func(args ...string) (string, string, int) {
		t.Helper()
		var out, errw bytes.Buffer
		code := run(args, strings.NewReader(""), &out, &errw, false)
		return out.String(), errw.String(), code
	}

	// `pass` over NO declarations: the graph is not sound, it is
	// unexamined.
	out, errs, code := say("relations", plain)
	if 0 != code || !strings.Contains(out, "verdict: pass") ||
		!strings.Contains(errs, "declares no relations") {
		t.Errorf("relations: %d %q %q", code, out, errs)
	}

	// A figure identical to what the same kind draws for `{}`.
	out, errs, code = say("view", "graph", plain)
	if 0 != code || !strings.Contains(out, "flowchart LR") ||
		!strings.Contains(errs, "nothing to draw") {
		t.Errorf("view: %d %q %q", code, out, errs)
	}

	// AND THE NEGATIVE: a document that DOES declare says nothing.
	graph := filepath.Join(dir, "graph.aon")
	if err := os.WriteFile(graph,
		[]byte("a: {dependsOn: rel() & acyclic() & [path($.b)]}\nb: {}\n"),
		0o644); nil != err {
		t.Fatal(err)
	}
	if _, errs, _ = say("relations", graph); strings.Contains(
		errs, "declares no relations") {
		t.Errorf("a declaring document was called vacuous: %q", errs)
	}
}
