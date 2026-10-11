/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

// G12 phase 18 (ADR-068): every schema of the official suite, in every
// dialect, comes back from import(export(import(S))) as import(S), canon
// for canon and subsuming both ways, or its group is a row of the ledger
// test/vectors/jsonschema/roundtrip.tsv, mirroring
// ts/test/jsonschema-roundtrip.test.ts.

// roundTrip is why a group's schema does not come back, or "" where it
// does.
func roundTrip(g suiteGroup, documents map[string]string) string {
	return schemaRoundTrip(g.schema, g.file, g.dialect, strings.HasPrefix(g.file, "optional/format/"),
		documents)
}

// schemaRoundTrip is why a schema does not come back from the round trip
// of ADR-068 as its first import, or "" where it does.
func schemaRoundTrip(schema, path, dialect string, formatAssertion bool, documents map[string]string) string {
	opts := &ImportOptions{Documents: documents, NoMetaCheck: true, FormatAssertion: formatAssertion}
	first := ImportJSONSchema(schema, &ImportOptions{Path: path, Documents: documents,
		NoMetaCheck: true, FormatAssertion: formatAssertion, Dialect: dialect})
	if "error" == first.Verdict {
		return ""
	}
	v1, err := New().Unify(first.Aontu)
	if nil != err {
		return "the import does not stand"
	}
	out := New().JSONSchema(first.Aontu, "")
	if "error" == out.Verdict {
		return "the export refuses it"
	}
	text, _ := json.Marshal(out.Schema)
	second := ImportJSONSchema(string(text), opts)
	v2, err := New().Unify(second.Aontu)
	if "error" == second.Verdict || nil != err {
		return "the export does not import back"
	}
	if Hcanon(v1) == Hcanon(v2) {
		return ""
	}
	there := Subsume(first.Aontu, second.Aontu, nil).Verdict
	back := Subsume(second.Aontu, first.Aontu, nil).Verdict
	switch {
	case v1.Canon() != v2.Canon():
		return "the canon differs"
	case SubsumeYes != there || SubsumeYes != back:
		return fmt.Sprintf("subsume answers %s, %s", there, back)
	}
	return ""
}

// The ledger may not grow past its bound; the register tightens it.
func TestJSONSchemaSuiteRoundTrip(t *testing.T) {
	t.Parallel()
	ledger := tsvRows(t, filepath.Join(vectorsDir, "jsonschema", "roundtrip.tsv"))
	if 47 < len(ledger) {
		t.Fatalf("the round-trip ledger holds %d rows, past its bound", len(ledger))
	}
	listed := map[string]string{}
	for _, row := range ledger {
		listed[row[0]+" | "+row[1]+" | "+row[2]] = row[3]
	}
	documents := suiteRemotes(t)
	problems := []string{}
	total := 0
	for _, d := range []struct{ dir, dialect string }{{"draft2020-12", ""}, {"draft2019-09", "2019-09"},
		{"draft7", "draft-07"}, {"draft6", "draft-06"}, {"draft4", "draft-04"}} {
		for _, g := range suiteGroups(t, filepath.Join(vectorsDir, "jsonschema", "tests", d.dir), d.dialect) {
			key := d.dir + " | " + g.file + " | " + g.group
			why := roundTrip(g, documents)
			construct, has := listed[key]
			total++
			switch {
			case "" == why && has:
				problems = append(problems, fmt.Sprintf("%s: listed (%s) and round-trips; delete its row",
					key, construct))
			case "" != why && !has:
				problems = append(problems, fmt.Sprintf("%s: %s, with no ledger row", key, why))
			}
			delete(listed, key)
		}
	}
	for key := range listed {
		problems = append(problems, key+": listed and not in the suite; delete its row")
	}
	t.Logf("round trip: %d groups, %d ledger rows", total, len(ledger))
	if 0 < len(problems) {
		t.Fatal(strings.Join(problems, "\n"))
	}
}
