/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// The SARIF renderer (G2 phase 5, report_sarif.go): the Go twin of
// ts/test/sarif.test.ts. The shape contract is the shared golden in
// test/spec/files/vet-sarif/, held to byte parity with the canonical
// port after the two redactions the golden's README specifies; the
// severity mapping and the no-position branch are pinned on synthetic
// reports, because no engine path emits them yet.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// sarifRedact applies the golden's redactions to rendered output:
// message text and producer version are the two things deliberately
// not in cross-port parity.
func sarifRedact(t *testing.T, sarif string) string {
	t.Helper()
	var log map[string]any
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	run := log["runs"].([]any)[0].(map[string]any)
	run["tool"].(map[string]any)["driver"].(map[string]any)["version"] = "<VERSION>"
	for _, r := range run["results"].([]any) {
		result := r.(map[string]any)
		result["message"].(map[string]any)["text"] = "<MESSAGE>"
		result["properties"].(map[string]any)["message"] = "<MESSAGE>"
	}
	// Maps marshal with sorted keys, which is the canonical emitter's
	// order too; HTML escaping off and two-space indent as everywhere.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(log); err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return buf.String()
}

func TestSarifGolden(t *testing.T) {
	dir := filepath.Join("..", "test", "spec", "files", "vet-sarif")
	schema, err := os.ReadFile(filepath.Join(dir, "schema.aon"))
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "data.aon"))
	if err != nil {
		t.Fatal(err)
	}
	expect, err := os.ReadFile(filepath.Join(dir, "expect.sarif"))
	if err != nil {
		t.Fatal(err)
	}

	report := Vet(string(schema), string(data),
		&VetOptions{SchemaURL: "schema.aon", DataURL: "data.aon"})
	got := sarifRedact(t, SarifReport(report, "x"))
	// Normalised on read: the golden is compared BYTE FOR BYTE against a
	// generated string that always uses \n, so a CRLF checkout could
	// never match. .gitattributes pins test/spec/files/** to LF, and
	// this is the half that holds when the file did not come from a
	// checkout. The twin is sarif.test.ts in the canonical port.
	want := strings.ReplaceAll(
		strings.ReplaceAll(string(expect), "\r\n", "\n"), "\r", "\n")
	if want != got {
		t.Fatalf("golden mismatch:\nwant:\n%s\ngot:\n%s", expect, got)
	}
}

// error/warning/info map to SARIF error/warning/note. Only `info`
// translates, but all three are pinned so a drift in any of them fails
// here rather than in a consumer.
func TestSarifLevels(t *testing.T) {
	severities := []string{"error", "warning", "info"}
	findings := make([]VetFinding, 0, len(severities))
	for _, severity := range severities {
		findings = append(findings, VetFinding{
			Code:     "x",
			Class:    "conflict",
			Severity: severity,
			Path:     "$",
			Message:  "m",
			Sites:    []VetSite{{File: "f", Row: 1, Col: 1, Role: "data"}},
		})
	}
	report := VetReport{Verdict: "invalid", Truncated: false, Findings: findings}

	var log struct {
		Runs []struct {
			Results []struct {
				Level string `json:"level"`
			} `json:"results"`
		} `json:"runs"`
	}
	if err := json.Unmarshal([]byte(SarifReport(report, "x")), &log); err != nil {
		t.Fatal(err)
	}
	want := []string{"error", "warning", "note"}
	for i, result := range log.Runs[0].Results {
		if want[i] != result.Level {
			t.Fatalf("level[%d]: want %q got %q", i, want[i], result.Level)
		}
	}
}

// A finding with no position — a parse failure reports at -1:-1 — gets
// a location with no region rather than an invented one, because SARIF
// regions are 1-based.
func TestSarifNoPositionNoRegion(t *testing.T) {
	report := VetReport{Verdict: "invalid", Findings: []VetFinding{{
		Code:     "syntax",
		Class:    "parse",
		Severity: "error",
		Path:     "$",
		Message:  "m",
		Sites:    []VetSite{{File: "data.aon", Row: -1, Col: -1, Role: "data"}},
	}}}
	sarif := SarifReport(report, "x")

	var log struct {
		Runs []struct {
			Results []struct {
				Locations []struct {
					PhysicalLocation struct {
						ArtifactLocation struct {
							URI string `json:"uri"`
						} `json:"artifactLocation"`
						Region *struct{} `json:"region"`
					} `json:"physicalLocation"`
				} `json:"locations"`
				RelatedLocations []any `json:"relatedLocations"`
			} `json:"results"`
		} `json:"runs"`
	}
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatal(err)
	}
	physical := log.Runs[0].Results[0].Locations[0].PhysicalLocation
	if "data.aon" != physical.ArtifactLocation.URI {
		t.Fatalf("uri: %q", physical.ArtifactLocation.URI)
	}
	if nil != physical.Region {
		t.Fatal("region should be absent for a -1:-1 site")
	}
	if nil != log.Runs[0].Results[0].RelatedLocations {
		t.Fatal("relatedLocations should be absent for a one-site finding")
	}
}

// A clean run is still a report: one run, empty results, the tool
// named — what a CI upload of a passing check looks like.
func TestSarifEmpty(t *testing.T) {
	report := VetReport{Verdict: "valid", Truncated: false, Findings: []VetFinding{}}
	sarif := SarifReport(report, "1.2.3")

	var log struct {
		Version string `json:"version"`
		Runs    []struct {
			Results []any `json:"results"`
			Tool    struct {
				Driver struct {
					Name    string `json:"name"`
					Version string `json:"version"`
				} `json:"driver"`
			} `json:"tool"`
		} `json:"runs"`
	}
	if err := json.Unmarshal([]byte(sarif), &log); err != nil {
		t.Fatal(err)
	}
	if "2.1.0" != log.Version {
		t.Fatalf("version: %q", log.Version)
	}
	if nil == log.Runs[0].Results || 0 != len(log.Runs[0].Results) {
		t.Fatalf("results: %+v", log.Runs[0].Results)
	}
	if "aontu" != log.Runs[0].Tool.Driver.Name || "1.2.3" != log.Runs[0].Tool.Driver.Version {
		t.Fatalf("driver: %+v", log.Runs[0].Tool.Driver)
	}
}

// A FAILED run (verdict error: the schema was unusable) also has empty
// results; the difference from a clean run is carried in SARIF's own
// invocation metadata so a consumer never mistakes "could not check"
// for "checked and clean".
func TestSarifInvocationCarriesTheVerdict(t *testing.T) {
	var log struct {
		Runs []struct {
			Invocations []struct {
				ExecutionSuccessful bool `json:"executionSuccessful"`
			} `json:"invocations"`
		} `json:"runs"`
	}

	clean := VetReport{Verdict: VetValid, Findings: []VetFinding{}}
	if err := json.Unmarshal([]byte(SarifReport(clean, "x")), &log); err != nil {
		t.Fatal(err)
	}
	if !log.Runs[0].Invocations[0].ExecutionSuccessful {
		t.Fatal("valid run should be executionSuccessful")
	}

	failed := VetReport{Verdict: VetError, Findings: []VetFinding{}}
	if err := json.Unmarshal([]byte(SarifReport(failed, "x")), &log); err != nil {
		t.Fatal(err)
	}
	if log.Runs[0].Invocations[0].ExecutionSuccessful {
		t.Fatal("error run should not be executionSuccessful")
	}
}

// A site's file is a filesystem path; the SARIF uri percent-encodes
// every URI-significant byte (by UTF-8 byte, the identical loop to the
// canonical port) — otherwise text after `#` reads as a fragment and
// the consumer loses the file association.
func TestSarifURIEncoding(t *testing.T) {
	if got := sarifURI("a b#c%.aon"); "a%20b%23c%25.aon" != got {
		t.Fatalf("uri: %q", got)
	}
	if got := sarifURI("dir/ok-1._~!$&'()*+,;=:@.aon"); "dir/ok-1._~!$&'()*+,;=:@.aon" != got {
		t.Fatalf("safe set: %q", got)
	}
}
