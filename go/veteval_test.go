/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

// THE vet ≡ eval INVARIANT (ADR-007, use-cases/REVIEW.md finding C).
// The Go twin of ts/test/veteval.test.ts, reading the same rows; the
// full rationale is there. The short of it: for every schema S and
// data D, vet(S, D) and eval(S u D) must AGREE ON ACCEPT/REJECT. Their
// reports legitimately differ, but a document the gate accepts must
// evaluate and one it refuses must not. The review found five ways
// they disagreed, every one of which passed a green suite, because
// nothing anywhere asserted the pair.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type vetEvalRow struct {
	file, name, schema, data string
}

// loadVetEvalRows reads the shared spec's `vet` rows, keeping the ones
// with a single-document analogue. `at` anchors a SUBTREE and `closed`
// seals the anchor, and neither is anything one document spells --
// they are options that change the TRUTH, so a union of the two texts
// is a different question. `partial` deliberately calls residue
// acceptable, which eval never does, and `maxErrors` changes the
// report rather than the verdict's meaning.
func loadVetEvalRows(t *testing.T) []vetEvalRow {
	t.Helper()
	specDir := filepath.Join("..", "test", "spec")
	entries, err := os.ReadDir(specDir)
	if err != nil {
		t.Fatalf("cannot read spec dir %s: %v", specDir, err)
	}
	rows := []vetEvalRow{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".tsv") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(specDir, e.Name()))
		if err != nil { //coverage:ignore ReadDir just listed the file
			t.Fatalf("cannot read %s: %v", e.Name(), err)
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSuffix(line, "\r")
			if "" == line || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.Split(line, "\t")
			if 5 > len(parts) || "vet" != parts[1] {
				continue
			}
			var expect struct {
				Opts struct {
					At        string `json:"at"`
					Closed    bool   `json:"closed"`
					Partial   bool   `json:"partial"`
					MaxErrors *int   `json:"maxErrors"`
				} `json:"opts"`
			}
			if err := json.Unmarshal(
				[]byte(unescapeSpec(parts[4])), &expect); err != nil {
				//coverage:ignore the spec runner rejects a malformed cell first
				t.Fatalf("%s:%s: %v", e.Name(), parts[0], err)
			}
			o := expect.Opts
			if "" != o.At || o.Closed || o.Partial || nil != o.MaxErrors {
				continue
			}
			schema, data := unescapeSpec(parts[2]), unescapeSpec(parts[3])
			// A row naming the shared fixtures loads files, and the
			// one-document form would resolve them from a different
			// base -- a difference in the TEST rather than the engines.
			if strings.Contains(schema, "__FIXTURES__") ||
				strings.Contains(data, "__FIXTURES__") {
				continue
			}
			rows = append(rows,
				vetEvalRow{file: e.Name(), name: parts[0], schema: schema, data: data})
		}
	}
	return rows
}

// vetEvalUnion is S u D as ONE document, or "" when the pair has no
// single-document spelling.
//
// The usual case is two documents written as KEY STATEMENTS, and there
// concatenating the texts IS the union: a key stated twice is the
// meet, which is exactly what vet computes across the pair. It also
// keeps absolute references ($.a) pointing where they point, which
// matters -- those are the rows that catch a schema settling before
// the data arrives.
//
// A rootless value -- a braced/bracketed literal, a bare scalar -- has
// no keys to merge, and pasting {"a":1} after a statement is a syntax
// error rather than a meet. Those are met under a shared key instead.
// That reparents everything, so a source carrying an absolute
// reference has no honest wrapped form and the row is skipped.
func vetEvalUnion(schema, data string) string {
	if vetEvalStatements(schema) && vetEvalStatements(data) {
		return schema + "\n" + data + "\n"
	}
	if strings.Contains(schema, "$.") || strings.Contains(data, "$.") {
		return ""
	}
	return vetEvalWrap(schema) + "\n" + vetEvalWrap(data) + "\n"
}

// vetEvalStatements reports whether the source is written as key
// statements at the root, rather than as one literal.
func vetEvalStatements(src string) bool {
	t := strings.TrimSpace(src)
	if strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[") {
		return false
	}
	v, err := New().Unify(src)
	if nil != err || nil == v {
		return false
	}
	_, isMap := v.(*MapVal)
	return isMap
}

func vetEvalWrap(src string) string {
	t := strings.TrimSpace(src)
	if strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[") {
		return "veteval: " + t
	}
	if vetEvalStatements(src) {
		return "veteval: {\n" + src + "\n}"
	}
	return "veteval: (" + t + ")"
}

func TestVetEqualsEval(t *testing.T) {
	rows := loadVetEvalRows(t)

	// A filter that quietly matched nothing would make every assertion
	// below vacuous, and a vacuous differential check is worse than
	// none: it reads as coverage.
	if 20 >= len(rows) {
		t.Fatalf("vet rows found: %d", len(rows))
	}

	disagree := []string{}
	skipped := 0
	for _, row := range rows {
		report := Vet(row.schema, row.data,
			&VetOptions{SchemaURL: "schema", DataURL: "data"})
		vetAccepts := VetValid == report.Verdict

		one := vetEvalUnion(row.schema, row.data)
		if "" == one {
			skipped++
			continue
		}
		out, err := New().Generate(one)
		evalOK := nil == err && nil != out

		if vetAccepts != evalOK {
			verb := "refuses"
			if evalOK {
				verb = "generates"
			}
			disagree = append(disagree,
				row.file+":"+row.name+" vet="+report.Verdict+" eval="+verb+
					" | schema: "+strings.ReplaceAll(row.schema, "\n", "\\n")+
					" | data: "+strings.ReplaceAll(row.data, "\n", "\\n"))
		}
	}

	if 0 < len(disagree) {
		t.Fatalf("vet and eval disagree on %d row(s):\n%s",
			len(disagree), strings.Join(disagree, "\n"))
	}

	// A skip list that quietly grew to swallow the corpus would leave
	// this green over nothing, so the proportion is bounded too.
	if skipped*4 >= len(rows) {
		t.Fatalf("too many rows have no single-document spelling: %d of %d",
			skipped, len(rows))
	}
}
