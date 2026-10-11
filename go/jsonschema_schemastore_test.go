/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// G12 phase 18 (ADR-068): every schema of the pinned SchemaStore subset
// comes back from import(export(import(S))) as import(S), as the official
// suite's do, or it is a row of the ledger
// test/vectors/jsonschema/schemastore/roundtrip.tsv, mirroring
// ts/test/jsonschema-schemastore.test.ts.

var storeDir = filepath.Join(vectorsDir, "jsonschema", "schemastore")

// storeDocuments is the subset as its own document set: each file under
// the hosts SchemaStore serves it from, and under its own $id.
func storeDocuments(t *testing.T, names []string) map[string]string {
	out := map[string]string{}
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join(storeDir, "schemas", name))
		if nil != err {
			t.Fatal(err)
		}
		out["https://json.schemastore.org/"+name] = string(raw)
		out["https://www.schemastore.org/"+name] = string(raw)
		var doc map[string]any
		if nil == json.Unmarshal(raw, &doc) {
			if id, ok := doc["$id"].(string); ok {
				if _, had := out[id]; !had {
					out[id] = string(raw)
				}
			}
		}
	}
	return out
}

// The ledger may not grow past its bound; the register tightens it.
func TestJSONSchemaStoreRoundTrip(t *testing.T) {
	t.Parallel()
	ledger := tsvRows(t, filepath.Join(storeDir, "roundtrip.tsv"))
	if 5 < len(ledger) {
		t.Fatalf("the SchemaStore ledger holds %d rows, past its bound", len(ledger))
	}
	listed := map[string]string{}
	for _, row := range ledger {
		listed[row[0]] = row[1]
	}
	entries, err := os.ReadDir(filepath.Join(storeDir, "schemas"))
	if nil != err {
		t.Fatal(err)
	}
	names := []string{}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	documents := storeDocuments(t, names)
	problems := []string{}
	start := time.Now()
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join(storeDir, "schemas", name))
		if nil != err {
			t.Fatal(err)
		}
		why := schemaRoundTrip(string(raw), name, "", false, documents)
		construct, has := listed[name]
		switch {
		case "" == why && has:
			problems = append(problems, fmt.Sprintf("%s: listed (%s) and round-trips; delete its row",
				name, construct))
		case "" != why && !has:
			problems = append(problems, fmt.Sprintf("%s: %s, with no ledger row", name, why))
		}
		delete(listed, name)
	}
	for name := range listed {
		problems = append(problems, name+": listed and not vendored; delete its row")
	}
	t.Logf("schemastore round trip: %d schemas, %d ledger rows, %d ms", len(names), len(ledger),
		time.Since(start).Milliseconds())
	if 0 < len(problems) {
		sort.Strings(problems)
		t.Fatal(strings.Join(problems, "\n"))
	}
}
