/* Copyright (c) 2025 Richard Rodger, MIT License */

package main

// The Go twin of the cli-vet suite in ts/test/cli.test.ts: the same
// cases, asserting the same output. What the two ports must AGREE on
// (the report itself) is pinned by test/spec/vet.tsv; what each port
// owns (argument handling, exit codes, the text rendering) is here.

import (
	"bytes"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

const vetSchemaSrc = "service: { name: string, port: integer }"

// vetFiles writes a schema and a data document to a fresh directory and
// returns their paths.
func vetFiles(t *testing.T, schema, data string) (string, string, string) {
	t.Helper()
	dir := t.TempDir()
	s := filepath.Join(dir, "schema.aon")
	d := filepath.Join(dir, "data.json")
	if err := os.WriteFile(s, []byte(schema), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(d, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir, s, d
}

// vetRun drives the whole command, returning stdout, stderr and the
// exit code.
func vetRun(args ...string) (string, string, int) {
	var out, errw bytes.Buffer
	code := run(append([]string{"vet"}, args...), strings.NewReader(""), &out, &errw, false)
	return out.String(), errw.String(), code
}

func vetMatch(t *testing.T, text, pattern string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(text) {
		t.Fatalf("want /%s/ in:\n%s", pattern, text)
	}
}

// The verb's whole reason for existing: an agent emits a document, the
// gate says what does not hold and WHERE, and the exit code says which
// kind of "no" it was.
func TestVetReportsConflictsWithBothSites(t *testing.T) {
	_, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: "8080" }`)
	out, _, code := vetRun(s, d)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	vetMatch(t, out, `verdict: invalid`)
	vetMatch(t, out, `\$\.service\.port: no_scalar_unify \[conflict\]`)
	vetMatch(t, out, `data: .*data\.json:1:\d+ \("8080"\)`)
	vetMatch(t, out, `schema: .*schema\.aon:1:\d+ \(integer\)`)
}

// A parent that collapses to a nil takes its subtree with it, so the
// sibling conflict is reported on the CONTEXT rather than standing in
// the tree. Both belong in the report.
func TestVetReportsFindingsThatNeverReachedTheTree(t *testing.T) {
	_, s, d := vetFiles(t,
		"service: close({ name: string, port: integer, replicas: integer })",
		`service: { name: "auth", prot: 8080, replicas: "3" }`)
	out, _, _ := vetRun(s, d)
	vetMatch(t, out, `\$\.service\.prot: closed`)
	vetMatch(t, out, `\$\.service\.replicas: no_scalar_unify`)
}

func TestVetExitCodesAreVerdictClasses(t *testing.T) {
	_, valid, validData := vetFiles(t, vetSchemaSrc,
		`service: { name: "auth", port: 8080 }`)
	if out, _, code := vetRun(valid, validData); 0 != code ||
		"verdict: valid" != strings.TrimSpace(out) {
		t.Fatalf("valid: %d %q", code, out)
	}

	_, invalid, invalidData := vetFiles(t, vetSchemaSrc,
		`service: { name: 1, port: 8080 }`)
	if _, _, code := vetRun(invalid, invalidData); 1 != code {
		t.Fatalf("invalid: %d", code)
	}

	_, incomplete, incompleteData := vetFiles(t, vetSchemaSrc,
		`service: { name: "auth" }`)
	if _, _, code := vetRun(incomplete, incompleteData); 3 != code {
		t.Fatalf("incomplete: %d", code)
	}
	// --partial keeps reporting the residue but stops it failing.
	if _, _, code := vetRun("--partial", incomplete, incompleteData); 0 != code {
		t.Fatalf("partial: %d", code)
	}

	_, broken, brokenData := vetFiles(t, "a: 1\na: 2", "a: 1")
	if _, _, code := vetRun(broken, brokenData); 4 != code {
		t.Fatalf("broken schema: %d", code)
	}
}

// A data document that will not parse is the DATA's fault: exit 1 with
// a finding naming the file, not exit 4, which says the schema is
// unusable. And one bad file among several must not blank the findings
// the others earned.
func TestVetUnparseableDataExits1AndNamesTheFile(t *testing.T) {
	dir, s, d := vetFiles(t, vetSchemaSrc, "service: ]")
	out, _, code := vetRun(s, d)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	vetMatch(t, out, `verdict: invalid`)
	vetMatch(t, out, `\$: syntax \[parse\]`)
	vetMatch(t, out, `data: .*data\.json:1:10 \(nil\)`)

	good := filepath.Join(dir, "good.json")
	if err := os.WriteFile(good,
		[]byte(`service: { name: 1, port: 8080 }`), 0o600); err != nil {
		t.Fatal(err)
	}
	both, _, code := vetRun(s, good, d)
	if 1 != code {
		t.Fatalf("mixed code: %d", code)
	}
	vetMatch(t, both, `no_scalar_unify`)
	vetMatch(t, both, `syntax`)
}

func TestVetJSONFormatNamesItsProducer(t *testing.T) {
	_, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: "8080" }`)
	out, _, _ := vetRun("--format", "json", s, d)

	var report struct {
		Aontu struct {
			Verb    string `json:"verb"`
			Version string `json:"version"`
		} `json:"aontu"`
		Verdict   string `json:"verdict"`
		Truncated bool   `json:"truncated"`
		Findings  []struct {
			Code  string `json:"code"`
			Sites []struct {
				Role string `json:"role"`
			} `json:"sites"`
		} `json:"findings"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if "vet" != report.Aontu.Verb || "" == report.Aontu.Version {
		t.Fatalf("producer: %+v", report.Aontu)
	}
	if "invalid" != report.Verdict || report.Truncated {
		t.Fatalf("report: %+v", report)
	}
	if 1 != len(report.Findings) || "no_scalar_unify" != report.Findings[0].Code ||
		"data" != report.Findings[0].Sites[0].Role {
		t.Fatalf("findings: %+v", report.Findings)
	}
	// The keys are emitted in the order the canonical emitter sorts
	// them, so a consumer diffing the two ports' reports sees no noise.
	if !strings.Contains(out, "\"aontu\": {") ||
		strings.Index(out, "\"findings\"") < strings.Index(out, "\"aontu\"") ||
		strings.Index(out, "\"truncated\"") < strings.Index(out, "\"findings\"") ||
		strings.Index(out, "\"verdict\"") < strings.Index(out, "\"truncated\"") {
		t.Fatalf("keys are not in sorted order:\n%s", out)
	}
}

// A relative `@"file"` load inside either document resolves from THAT
// document's directory, not from wherever the command was run — which
// is what `aontu <file>` has always done. Before this, a modular schema
// vetted from another directory came back `error`, and a same-named
// file in the working directory was read instead.
func TestVetResolvesIncludesFromEachDocument(t *testing.T) {
	dir, s, d := vetFiles(t, "@\"part.aon\"\nname: string", "name: \"auth\"\nport: 8080")
	if err := os.WriteFile(filepath.Join(dir, "part.aon"),
		[]byte("port: integer"), 0o600); err != nil {
		t.Fatal(err)
	}

	decoy := t.TempDir()
	if err := os.WriteFile(filepath.Join(decoy, "part.aon"),
		[]byte("port: string"), 0o600); err != nil {
		t.Fatal(err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(decoy); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(cwd)

	if _, errText, code := vetRun(s, d); 0 != code {
		t.Fatalf("code %d: %s", code, errText)
	}
}

func TestVetAtAndClosedReachTheEngine(t *testing.T) {
	_, s, d := vetFiles(t, "services: { auth: { port: integer } }",
		"auth: { port: 8080 }")
	if _, _, code := vetRun("--at", "$.services", s, d); 0 != code {
		t.Fatalf("at: %d", code)
	}

	_, g, gd := vetFiles(t, "service: { name: string }",
		"service: { name: \"auth\" }\nextra: 1")
	if _, _, code := vetRun(g, gd); 0 != code {
		t.Fatalf("open: %d", code)
	}
	if _, _, code := vetRun("--closed", g, gd); 1 != code {
		t.Fatalf("closed: %d", code)
	}
}

func TestVetMaxErrorsTruncatesAndSaysSo(t *testing.T) {
	_, s, d := vetFiles(t, "a: integer\nb: integer\nc: integer",
		"a: \"x\"\nb: \"y\"\nc: \"z\"")
	out, _, code := vetRun("--max-errors", "2", s, d)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	vetMatch(t, out, `findings truncated`)
}

// The cap is on the REPORT, not on each file: two data files that each
// come in under it can still overflow it together, and only the
// aggregate cut catches that. Per-file capping alone would emit four
// findings here and call the report whole.
func TestVetMaxErrorsCapsTheReportNotEachFile(t *testing.T) {
	dir, s, d := vetFiles(t, "a: integer\nb: integer", "a: \"x\"\nb: \"y\"")
	other := filepath.Join(dir, "other.json")
	if err := os.WriteFile(other,
		[]byte("a: \"p\"\nb: \"q\""), 0o600); err != nil {
		t.Fatal(err)
	}

	out, _, code := vetRun("--max-errors", "3", s, d, other)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	vetMatch(t, out, `findings truncated`)
	if n := strings.Count(out, "no_scalar_unify [conflict]"); 3 != n {
		t.Fatalf("findings: %d", n)
	}
}

// Several data files are several candidates for one truth, so each is
// vetted on its own and the worst verdict wins.
func TestVetTakesMoreThanOneDataFile(t *testing.T) {
	dir, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: 8080 }`)
	bad := filepath.Join(dir, "bad.json")
	if err := os.WriteFile(bad,
		[]byte(`service: { name: "auth", port: "nope" }`), 0o600); err != nil {
		t.Fatal(err)
	}
	out, _, code := vetRun(s, d, bad)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	vetMatch(t, out, `verdict: invalid`)
	vetMatch(t, out, `bad\.json`)
}

// ...BUT A SCHEMA-SIDE FAULT IS ONE FAULT, however many data files are
// named. `error` means the run could not be set up from the TRUTH's
// side, so every data file would produce the identical finding;
// concatenating them repeated one broken schema per file and, past the
// cap, called the report `truncated` over a single underlying problem.
// Invisible until the `error` verdict started carrying findings at all.
// The twin is vet-schema-error-reports-once in ts/test/cli.test.ts.
func TestVetSchemaErrorReportsOnce(t *testing.T) {
	dir, _, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth" }`)
	broken := filepath.Join(dir, "broken.aon")
	if err := os.WriteFile(broken, []byte("a: 1\na: 2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	second := filepath.Join(dir, "second.json")
	if err := os.WriteFile(second, []byte(`{"a":1}`), 0o600); err != nil {
		t.Fatal(err)
	}

	out, _, code := vetRun("--format", "json", broken, d, second, d, second)
	if 4 != code {
		t.Fatalf("code: %d\n%s", code, out)
	}
	var report struct {
		Verdict   string           `json:"verdict"`
		Truncated bool             `json:"truncated"`
		Findings  []map[string]any `json:"findings"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if "error" != report.Verdict || 1 != len(report.Findings) ||
		report.Truncated {
		t.Fatalf("five data files, one broken schema: %+v", report)
	}

	// The same for an anchor that names nothing: also data-independent.
	out, _, code = vetRun("--format", "json", "--at", "$.nope",
		vetFilesSchema(t, dir), d, second, d)
	if 4 != code {
		t.Fatalf("at: code %d\n%s", code, out)
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if 1 != len(report.Findings) || "no_path" != report.Findings[0]["code"] {
		t.Fatalf("at: %+v", report)
	}
}

// vetFilesSchema writes a schema that stands up, for the --at half of
// the case above.
func vetFilesSchema(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "ok-schema.aon")
	if err := os.WriteFile(path, []byte(vetSchemaSrc), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// The usage errors all end with "(try --help)", so the verb answers to
// it: same text as `aontu --help`, exit 0.
func TestVetHelpIsHelpNotAnUnknownOption(t *testing.T) {
	for _, args := range [][]string{{"--help"}, {"-h"}, {"--help", "a.aon", "b.json"}} {
		out, errText, code := vetRun(args...)
		if 0 != code || "" != errText {
			t.Fatalf("%v: code %d, stderr %q", args, code, errText)
		}
		vetMatch(t, out, `aontu vet \[options\]`)
	}
}

func TestVetUsageErrorsExit2(t *testing.T) {
	_, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: 8080 }`)
	for _, args := range [][]string{
		{},
		{s},
		{"--at"},
		{"--format"},
		{"--format", "yaml", s, d},
		{"--max-errors"},
		{"--max-errors", "lots", s, d},
		{"--max-errors", "0", s, d},
		{"--nope", s, d},
	} {
		_, errText, code := vetRun(args...)
		if 2 != code {
			t.Fatalf("%v: code %d", args, code)
		}
		if !strings.HasPrefix(errText, "aontu: ") {
			t.Fatalf("%v: stderr %q", args, errText)
		}
	}
}

func TestVetUnreadableFileExits2AndNamesIt(t *testing.T) {
	dir, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: 8080 }`)
	missing := filepath.Join(dir, "no-such.json")

	_, errText, code := vetRun(s, missing)
	if 2 != code {
		t.Fatalf("data: code %d", code)
	}
	vetMatch(t, errText, `cannot read .*no-such\.json`)

	_, errText, code = vetRun(missing, d)
	if 2 != code {
		t.Fatalf("schema: code %d", code)
	}
	vetMatch(t, errText, `cannot read .*no-such\.json`)
}

func TestVetNoteAndAlternativesReachTheTextReport(t *testing.T) {
	_, s, d := vetFiles(t,
		`service: { tier: must("gold"|"silver","tier must be supported"),`+
			` port: integer & min(1024) }`,
		`service: { tier: "lead", port: 80 }`)
	out, _, _ := vetRun(s, d)
	vetMatch(t, out, `note: tier must be supported`)
	vetMatch(t, out, `expected: integer&min\(1024\)`)
	vetMatch(t, out, `actual: +80`)
}

// An OFF-PEG value still names its document: a preference's
// synthesised type yardstick is not a peg entry, so provenance reaches
// it only because the stamp walk follows it deliberately.
func TestVetSiteOffPegStillNamesItsDocument(t *testing.T) {
	_, s, d := vetFiles(t, "a: *1", "a: {}")
	out, _, _ := vetRun(s, d)
	// The DEFAULT the author wrote, sited at its star (ADR-011 R1). The
	// finding used to name the gate the engine computed from it --
	// `integer`, which appears nowhere in the schema text a reader
	// opens. (It read `number` before that, while the gate widened to
	// the numeric family; removed 2026-08-25, status report §6.)
	vetMatch(t, out, `schema: .*schema\.aon:1:\d+ \(\*1\)`)
}

// The verb dispatches only as the FIRST argument, so a file argument is
// never shadowed by a verb name.
func TestVetDoesNotShadowAFileArgument(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "vet")
	if err := os.WriteFile(file, []byte("a: 1"), 0o600); err != nil {
		t.Fatal(err)
	}
	var out, errw bytes.Buffer
	if code := run([]string{file}, strings.NewReader(""), &out, &errw, false); 0 != code {
		t.Fatalf("code %d: %s", code, errw.String())
	}
	vetMatch(t, out.String(), `"a": 1`)
}

func TestVetVerbAppearsInHelp(t *testing.T) {
	var out, errw bytes.Buffer
	run([]string{"--help"}, strings.NewReader(""), &out, &errw, false)
	vetMatch(t, out.String(), `aontu vet \[options\]`)
	vetMatch(t, out.String(), `3  incomplete`)
}

// --- SARIF and watch (G2 phase 5) -----------------------------------

// The interchange form: level from severity, the data site as the
// primary location, the schema site related, the whole native finding
// in properties. Shape parity with the canonical port is the golden in
// test/spec/files/vet-sarif/ (report_sarif_test.go); this is the CLI
// wiring.
func TestVetSarifFormatEmbedsTheFinding(t *testing.T) {
	_, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: "8080" }`)
	out, _, code := vetRun("--format", "sarif", s, d)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}

	var log struct {
		Schema  string `json:"$schema"`
		Version string `json:"version"`
		Runs    []struct {
			Results []struct {
				Level     string `json:"level"`
				RuleID    string `json:"ruleId"`
				Locations []struct {
					PhysicalLocation struct {
						ArtifactLocation struct {
							URI string `json:"uri"`
						} `json:"artifactLocation"`
					} `json:"physicalLocation"`
				} `json:"locations"`
				RelatedLocations []any `json:"relatedLocations"`
				Properties       struct {
					Path string `json:"path"`
				} `json:"properties"`
			} `json:"results"`
			Tool struct {
				Driver struct {
					Version string `json:"version"`
				} `json:"driver"`
			} `json:"tool"`
		} `json:"runs"`
	}
	if err := json.Unmarshal([]byte(out), &log); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if "2.1.0" != log.Version || !strings.Contains(log.Schema, "sarif-2.1.0") {
		t.Fatalf("log: %s %s", log.Version, log.Schema)
	}
	result := log.Runs[0].Results[0]
	if "aontu/no_scalar_unify" != result.RuleID || "error" != result.Level {
		t.Fatalf("result: %+v", result)
	}
	if "$.service.port" != result.Properties.Path {
		t.Fatalf("properties: %+v", result.Properties)
	}
	// DECODED before comparing: the uri percent-encodes URI-significant
	// bytes, and on Windows the temp path's backslashes are exactly
	// that (%5C), so a raw string equality only holds on POSIX.
	uri, err := url.PathUnescape(
		result.Locations[0].PhysicalLocation.ArtifactLocation.URI)
	if err != nil || d != uri {
		t.Fatalf("uri: %v %+v", err, result.Locations[0])
	}
	if 1 != len(result.RelatedLocations) {
		t.Fatalf("related: %+v", result.RelatedLocations)
	}
	if "" == log.Runs[0].Tool.Driver.Version {
		t.Fatal("driver version missing")
	}
}

// The watch loop: one report per run, one run per change, streaming.
// The waiter is swapped so the loop is bounded; the report changing
// between runs proves the files are re-read each time.
func TestVetWatchStreamsAReportPerChange(t *testing.T) {
	_, s, d := vetFiles(t, vetSchemaSrc, `service: { name: "auth", port: 8080 }`)

	saved := vetWatchWait
	defer func() { vetWatchWait = saved }()
	calls := 0
	vetWatchWait = func(files []string, before string) bool {
		if s != files[0] || d != files[1] {
			t.Fatalf("files: %v", files)
		}
		// The baseline is recorded BEFORE the run it follows, so a save
		// landing during the run still reads as a change.
		if "" == before {
			t.Fatal("baseline signature missing")
		}
		if 0 == calls {
			calls++
			if err := os.WriteFile(d,
				[]byte(`service: { name: "auth", port: "80" }`), 0o600); err != nil {
				t.Fatal(err)
			}
			return true
		}
		return false
	}

	out, _, code := vetRun("--watch", s, d)
	if 1 != code {
		t.Fatalf("code: %d", code)
	}
	if !regexp.MustCompile(`verdict: valid[\s\S]*verdict: invalid`).
		MatchString(out) {
		t.Fatalf("out: %s", out)
	}
}

// The real waiter returns when a watched file's mtime+size signature
// moves — including from "gone" to existing, which is what a file
// being replaced by an editor looks like mid-save.
func TestVetWatchWaitSeesAChange(t *testing.T) {
	savedPoll := watchPoll
	watchPoll = 5 * time.Millisecond
	defer func() { watchPoll = savedPoll }()

	dir := t.TempDir()
	missing := filepath.Join(dir, "not-yet.json")
	files := []string{missing}

	done := make(chan bool)
	go func() { done <- watchWait(files, watchSignature(files)) }()
	time.Sleep(60 * time.Millisecond)
	if err := os.WriteFile(missing, []byte("service: {}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !<-done {
		t.Fatal("watchWait should report a change")
	}
}
