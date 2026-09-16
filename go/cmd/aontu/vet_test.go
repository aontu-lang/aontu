/* Copyright (c) 2025 Richard Rodger, MIT License */

package main


import (
	"bytes"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	aontu "github.com/aontu-lang/aontu/go"
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
	dir, s, d := vetFiles(t, "@\"./part.aon\"\nname: string", "name: \"auth\"\nport: 8080")
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

func TestVetSiteOffPegStillNamesItsDocument(t *testing.T) {
	_, s, d := vetFiles(t, "a: *1", "a: {}")
	out, _, _ := vetRun(s, d)
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


func vetCovFiles(t *testing.T, schema, data string) (string, string) {
	t.Helper()
	dir := t.TempDir()
	s := filepath.Join(dir, "schema.aon")
	d := filepath.Join(dir, "data.aon")
	if err := os.WriteFile(s, []byte(schema), 0o600); nil != err {
		t.Fatal(err)
	}
	if err := os.WriteFile(d, []byte(data), 0o600); nil != err {
		t.Fatal(err)
	}
	return s, d
}

// The star schema is a key NAMED `*`, so it constrains nothing -- and
// without the flag the run is byte-for-byte what it always was.
const vetCovStar = `entity: { "*": { name: string, table: string } }`
const vetCovGood = `entity: { &: { name: string, table: string } }`
const vetCovData = `entity: { planet: { name: "P", table: "planets" } }`

func TestVetCoverageIsAbsentUnlessAsked(t *testing.T) {
	s, d := vetCovFiles(t, vetCovStar, vetCovData)
	out, _, code := vetRun("--partial", s, d)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	if strings.Contains(out, "coverage") {
		t.Errorf("a run that did not ask for coverage reported it: %s", out)
	}
	jsonOut, _, _ := vetRun("--partial", "--format", "json", s, d)
	if strings.Contains(jsonOut, "\"coverage\"") {
		t.Errorf("the JSON report carries coverage unasked: %s", jsonOut)
	}
}

// THE DEFECT THE PHASE EXISTS FOR, at the command line: the verdict is
// `valid` and the run examined nothing.
func TestVetCoverageReportsAVacuousRun(t *testing.T) {
	s, d := vetCovFiles(t, vetCovStar, vetCovData)
	out, _, code := vetRun("--partial", "--coverage", s, d)
	if 0 != code {
		t.Fatalf("want 0 (the verdict word is unchanged), got %d", code)
	}
	if !strings.Contains(out, "verdict: valid") {
		t.Errorf("the verdict changed: %s", out)
	}
	for _, want := range []string{
		"VACUOUS", "0/2 data leaves checked", "unused: $.entity.*",
		"unchecked: $.entity.planet",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the coverage block omits %q:\n%s", want, out)
		}
	}
}

// AND THE GATE: only under --strict-coverage, and it is the exit code
// that moves, never the verdict word.
func TestVetStrictCoverageExitsOneOnVacuous(t *testing.T) {
	s, d := vetCovFiles(t, vetCovStar, vetCovData)
	out, errw, code := vetRun("--partial", "--strict-coverage", s, d)
	if 1 != code {
		t.Fatalf("want 1, got %d: %s %s", code, out, errw)
	}
	if !strings.Contains(out, "verdict: valid") {
		t.Errorf("the verdict word changed: %s", out)
	}
	if !strings.Contains(errw, "checked nothing") {
		t.Errorf("no reason on stderr: %s", errw)
	}
	// The reason names the fix, because the caller who hit this does
	// not know the template exists.
	if !strings.Contains(errw, "aontu help language") {
		t.Errorf("the reason does not point at the language: %s", errw)
	}
}

// A schema that DOES constrain is not vacuous, and --strict-coverage
// leaves it exactly as it was.
func TestVetStrictCoveragePassesARealCheck(t *testing.T) {
	s, d := vetCovFiles(t, vetCovGood, vetCovData)
	out, errw, code := vetRun("--strict-coverage", s, d)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s %s", code, out, errw)
	}
	if strings.Contains(out, "VACUOUS") || strings.Contains(errw, "nothing") {
		t.Errorf("a real check was called vacuous: %s %s", out, errw)
	}
	if !strings.Contains(out, "2/2 data leaves checked") {
		t.Errorf("the ratio is wrong: %s", out)
	}
}

// --strict-coverage IMPLIES the accounting: a gate cannot fire on what
// was never measured.
func TestVetStrictCoverageImpliesCoverage(t *testing.T) {
	s, d := vetCovFiles(t, vetCovGood, vetCovData)
	out, _, _ := vetRun("--strict-coverage", s, d)
	if !strings.Contains(out, "coverage:") {
		t.Errorf("--strict-coverage did not measure: %s", out)
	}
	atOut, _, _ := vetRun("--coverage-at", "$.entity", s, d)
	if !strings.Contains(atOut, "coverage:") {
		t.Errorf("--coverage-at did not measure: %s", atOut)
	}
}

func TestVetCoverageJSON(t *testing.T) {
	s, d := vetCovFiles(t, vetCovStar, vetCovData)
	out, _, code := vetRun("--partial", "--coverage", "--format", "json", s, d)
	if 0 != code {
		t.Fatalf("want 0, got %d", code)
	}
	var report struct {
		Coverage *aontu.VetCoverage `json:"coverage"`
		Verdict  string             `json:"verdict"`
	}
	if err := json.Unmarshal([]byte(out), &report); nil != err {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if nil == report.Coverage {
		t.Fatal("the JSON report carries no coverage")
	}
	if !report.Coverage.Vacuous || 0 != report.Coverage.Checked ||
		"valid" != report.Verdict {
		t.Errorf("bad report: %+v %s", report.Coverage, report.Verdict)
	}
}

// SEVERAL DATA FILES ARE ONE ACCOUNTING: the schema side is the same
// for each, so a declaration one file exercised is not unused, while
// the data side adds up.
func TestVetCoverageAcrossSeveralDataFiles(t *testing.T) {
	dir := t.TempDir()
	write := func(name, src string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(src), 0o600); nil != err {
			t.Fatal(err)
		}
		return p
	}
	s := write("s.aon", "a: string\nb: integer")
	d1 := write("d1.aon", `a: "x"`)
	d2 := write("d2.aon", "b: 1")
	out, _, code := vetRun("--partial", "--coverage", s, d1, d2)
	if 0 != code {
		t.Fatalf("want 0, got %d: %s", code, out)
	}
	// One leaf each, both checked, and neither declaration is unused:
	// d1 met `$.a` and d2 met `$.b`.
	if !strings.Contains(out, "2/2 data leaves checked") {
		t.Errorf("the data side did not add up: %s", out)
	}
	if strings.Contains(out, "unused:") {
		t.Errorf("a declaration another file met was called unused: %s", out)
	}
}

func TestVetCoverageTextCapsTheLists(t *testing.T) {
	data := "{"
	for i := 0; i < 14; i++ {
		data += "k" + strconv.Itoa(i) + ": " + strconv.Itoa(i) + ",\n"
	}
	data += "}"
	s, d := vetCovFiles(t, "declared: string", data)
	out, _, _ := vetRun("--partial", "--coverage", s, d)
	if !strings.Contains(out, "unchecked: … and 4 more") {
		t.Errorf("the list was not capped and counted:\n%s", out)
	}
	// And the JSON keeps every one.
	jsonOut, _, _ := vetRun("--partial", "--coverage", "--format", "json", s, d)
	var report struct {
		Coverage aontu.VetCoverage `json:"coverage"`
	}
	if err := json.Unmarshal([]byte(jsonOut), &report); nil != err {
		t.Fatalf("not JSON: %v", err)
	}
	if 14 != len(report.Coverage.Unchecked) {
		t.Errorf("the JSON list was capped too: %d", len(report.Coverage.Unchecked))
	}
}

func TestVetCoverageUsageRefusals(t *testing.T) {
	_, errw, code := vetRun("--coverage-at")
	if 2 != code || !strings.Contains(errw, "--coverage-at needs a path") {
		t.Errorf("want 2 and a reason, got %d: %s", code, errw)
	}
}
