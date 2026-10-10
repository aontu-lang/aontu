/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The official suite's output tests (ADR-066), mirroring
// ts/test/jsonschema-output.test.ts: each schema is imported with its
// source map, each instance vetted as JSON Schema asks, and the basic
// output units checked against the schema the test gives for them.

const outputSkipBound = 4

func TestJSONSchemaOutput(t *testing.T) {
	dir := filepath.Join(vectorsDir, "jsonschema", "output-tests")
	skips := readSuiteSkips(t, filepath.Join(dir, "skips.tsv"))
	if outputSkipBound < len(skips) {
		t.Fatalf("the output ledger holds %d rows, past its bound of %d", len(skips), outputSkipBound)
	}
	vetOpts := &VetOptions{NoFill: true, ExactNumbers: true}
	problems := []string{}
	total, passed := 0, 0
	for _, release := range [][2]string{{"draft2019-09", "2019-09"}, {"draft2020-12", "2020-12"}} {
		outputSchema, err := os.ReadFile(filepath.Join(dir, release[0], "output-schema.json"))
		if nil != err {
			t.Fatal(err)
		}
		var head struct {
			ID string `json:"$id"`
		}
		if err := json.Unmarshal(outputSchema, &head); nil != err {
			t.Fatal(err)
		}
		documents := map[string]string{head.ID: string(outputSchema)}
		for _, name := range suiteFiles(t, filepath.Join(dir, release[0], "content")) {
			file := release[0] + "/content/" + name
			raw, err := os.ReadFile(filepath.Join(dir, file))
			if nil != err {
				t.Fatal(err)
			}
			var groups []struct {
				Description string          `json:"description"`
				Schema      json.RawMessage `json:"schema"`
				Tests       []struct {
					Description string          `json:"description"`
					Data        json.RawMessage `json:"data"`
					Output      struct {
						Basic json.RawMessage `json:"basic"`
					} `json:"output"`
				} `json:"tests"`
			}
			if err := json.Unmarshal(raw, &groups); nil != err {
				t.Fatal(err)
			}
			for _, g := range groups {
				imported := ImportJSONSchema(string(g.Schema),
					&ImportOptions{Dialect: release[1], SourceMap: true})
				for _, tc := range g.Tests {
					total++
					report := Vet(imported.Aontu, string(tc.Data), vetOpts)
					output := canonJSON(t, VetOutput(report, "basic", imported.Aontu, imported.Map))
					check := ImportJSONSchema(string(tc.Output.Basic),
						&ImportOptions{Dialect: release[1], Documents: documents})
					verdict := Vet(check.Aontu, output, vetOpts).Verdict
					skip := listedSkip(skips, file, g.Description, tc.Description)
					if VetValid == verdict {
						passed++
						if nil != skip {
							problems = append(problems, fmt.Sprintf(
								"%s | %s | %s: listed as a skip (%s) and passes; delete its row",
								file, g.Description, tc.Description, skip.construct))
						}
					} else if nil == skip {
						problems = append(problems, fmt.Sprintf(
							"%s | %s | %s: the output %s is %s against the test's schema, with no skip listed",
							file, g.Description, tc.Description, strings.TrimSpace(output), verdict))
					} else {
						skip.used = true
					}
				}
			}
		}
	}
	for _, s := range skips {
		if !s.used {
			problems = append(problems, fmt.Sprintf(
				"%s | %s | %s: listed as a skip (%s) and nothing under it fails; delete its row",
				s.file, s.group, s.test, s.construct))
		}
	}
	t.Logf("output: %d tests, %d pass, %d ledger rows", total, passed, len(skips))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
}
