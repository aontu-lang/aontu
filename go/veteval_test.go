/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

type vetEvalRow struct {
	file, name, schema, data string
	exact, noFill            bool
	trust                    *TrustOptions
}

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
					Exact     bool   `json:"exactNumbers"`
					NoFill    bool   `json:"noFill"`
					Trust     *struct {
						Budget TrustBudget `json:"budget"`
					} `json:"trust"`
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
			row := vetEvalRow{file: e.Name(), name: parts[0],
				schema: schema, data: data, exact: o.Exact, noFill: o.NoFill}
			if nil != o.Trust {
				row.trust = &TrustOptions{Budget: o.Trust.Budget}
			}
			rows = append(rows, row)
		}
	}
	return rows
}

var vetEvalDeclRe = regexp.MustCompile(
	`(?m)^[ \t]*(%[A-Za-z_][A-Za-z0-9_-]*)[ \t]*=`)

// A NAME DECLARED IN BOTH has no single-document spelling either:
// concatenation makes the second a REdeclaration, which asks a
// different question from a name scoped to each document.
func vetEvalSharesDecl(schema, data string) bool {
	both := map[string]bool{}
	for _, m := range vetEvalDeclRe.FindAllStringSubmatch(schema, -1) {
		both[m[1]] = true
	}
	for _, m := range vetEvalDeclRe.FindAllStringSubmatch(data, -1) {
		if both[m[1]] {
			return true
		}
	}
	return false
}

// Under exactNumbers evaluation reads the schema by value too, so a
// schema whose literals read differently has no one-document spelling.
func vetEvalReadsAlike(schema string) bool {
	canon := func(exact bool) string {
		v, err := (&Aontu{ExactNumbers: exact}).Parse(schema)
		if nil != err {
			return ""
		}
		return v.Canon()
	}
	return canon(false) == canon(true)
}

// vetEvalUnion is the one document, and the data alone in the same
// spelling.
func vetEvalUnion(schema, data string, exact bool) (string, string) {
	if vetEvalSharesDecl(schema, data) || (exact && !vetEvalReadsAlike(schema)) {
		return "", ""
	}
	if vetEvalStatements(schema) && vetEvalStatements(data) {
		return schema + "\n" + data + "\n", data
	}
	if strings.Contains(schema, "$.") || strings.Contains(data, "$.") {
		return "", ""
	}
	return vetEvalWrap(schema) + "\n" + vetEvalWrap(data) + "\n",
		vetEvalWrap(data)
}

// vetEvalValue is what the one document generates, or "" where it does
// not stand up.
func vetEvalValue(row vetEvalRow, src string) string {
	out, err := (&Aontu{ExactNumbers: row.exact, Trust: row.trust}).Generate(src)
	if nil != err || nil == out {
		return ""
	}
	raw, _ := json.Marshal(out)
	return string(raw)
}

// vetEvalUnfilled is what the one document generates less each optional
// member the data's own value lacks, which the admission trial removes
// before comparing.
func vetEvalUnfilled(row vetEvalRow, one, alone string) string {
	out, err := (&Aontu{ExactNumbers: row.exact, Trust: row.trust}).Generate(one)
	met, merr := (&Aontu{ExactNumbers: row.exact, Trust: row.trust}).Unify(one)
	own, oerr := (&Aontu{ExactNumbers: row.exact, Trust: row.trust}).Generate(alone)
	if nil != err || nil != merr || nil != oerr || nil == out {
		return ""
	}
	raw, _ := json.Marshal(vetEvalPrune(out, met, own))
	return string(raw)
}

func vetEvalPrune(g any, u Val, d any) any {
	switch uv := u.(type) {
	case *MapVal:
		gm, gok := g.(map[string]any)
		dm, dok := d.(map[string]any)
		if gok && dok {
			for k, gk := range gm {
				if dk, has := dm[k]; has {
					gm[k] = vetEvalPrune(gk, uv.peg[k], dk)
				} else if uv.isOptional(k) {
					delete(gm, k)
				}
			}
		}
	case *ListVal:
		gl, gok := g.([]any)
		dl, dok := d.([]any)
		if gok && dok {
			for i := range gl {
				if i < len(dl) && i < len(uv.peg) {
					gl[i] = vetEvalPrune(gl[i], uv.peg[i], dl[i])
				}
			}
		}
	}
	return g
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
		report := Vet(row.schema, row.data, &VetOptions{SchemaURL: "schema",
			DataURL: "data", ExactNumbers: row.exact, NoFill: row.noFill,
			Trust: row.trust})
		vetAccepts := VetValid == report.Verdict

		one, alone := vetEvalUnion(row.schema, row.data, row.exact)
		if "" == one {
			skipped++
			continue
		}
		// Under --no-fill the one document generates the data's own value,
		// less the optional members the data does not carry.
		got := vetEvalValue(row, one)
		own := vetEvalValue(row, alone)
		evalOK := "" != got && (!row.noFill ||
			("" != own && vetEvalUnfilled(row, one, alone) == own))

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
