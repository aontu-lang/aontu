/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"testing"
)

// The JSON Schema importer's paths no shared row reaches: the copy budget
// a root that is not a map spends on references, which a row would have
// to pin as kilobytes of text. Mirrors ts/test/jsonschema-import.test.ts.
func TestImportCopiesPastTheBudgetAdmitAnythingAndSaySo(t *testing.T) {
	// Each level references the one below twice, so the copies double.
	defs := map[string]any{"d0": map[string]any{"type": "integer"}}
	for i := 1; i < 14; i++ {
		ref := map[string]any{"$ref": fmt.Sprintf("#/$defs/d%d", i-1)}
		defs[fmt.Sprintf("d%d", i)] = map[string]any{"allOf": []any{ref, ref}}
	}
	text, _ := json.Marshal(map[string]any{
		"minimum": 0, "allOf": []any{map[string]any{"$ref": "#/$defs/d13"}}, "$defs": defs,
	})
	report := ImportJSONSchema(string(text), nil)
	if "lossy" != report.Verdict {
		t.Fatalf("verdict %s", report.Verdict)
	}
	budget := regexp.MustCompile(`budget`)
	for _, l := range report.Lossy {
		if "$ref" == l.Construct && budget.MatchString(l.Reason) {
			return
		}
	}
	t.Fatalf("no budget loss: %v", report.Lossy)
}

// The admission trial's equality is by JSON value: a member that differs,
// or a key one side lacks, is a difference. The meet never rewrites a
// member the data carries, so no shared row can reach the map arm.
func TestSameJSONComparesByValue(t *testing.T) {
	cases := []struct {
		a, b any
		want bool
	}{
		{map[string]any{"a": int64(1)}, map[string]any{"a": int64(1)}, true},
		{map[string]any{"a": int64(1)}, map[string]any{"a": int64(2)}, false},
		{map[string]any{"a": int64(1)}, map[string]any{"b": int64(1)}, false},
		{map[string]any{"a": int64(1)}, []any{int64(1)}, false},
		{[]any{int64(1)}, []any{int64(2)}, false},
		{[]any{int64(1)}, []any{}, false},
		{[]any{int64(1)}, map[string]any{}, false},
		{int64(1), big.NewInt(1), true},
		{big.NewInt(1), "1", false},
	}
	for i, c := range cases {
		if got := sameJSON(c.a, c.b); c.want != got {
			t.Fatalf("case %d: sameJSON(%v, %v) = %v", i, c.a, c.b, got)
		}
	}
}
