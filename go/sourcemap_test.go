/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"reflect"
	"testing"
)

// Mirrors ts/test/sourcemap.test.ts.

func carried(t *testing.T, printed, formatted string, ranges ...[2]int) []any {
	t.Helper()
	moved, ok := carrySpans(printed, formatted, ranges)
	out := []any{}
	for i := range moved {
		if ok[i] {
			out = append(out, moved[i])
		} else {
			out = append(out, nil)
		}
	}
	return out
}

func TestCarryFollowsAKeyTheFormatterWritesBare(t *testing.T) {
	printed := "{\n  \"a\"?: number\n}\n"
	got := carried(t, printed, "{ a?:number }\n", [2]int{0, len(printed) - 1}, [2]int{10, 16})
	if want := []any{[2]int{0, 13}, [2]int{5, 11}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCarryDropsARangeWhoseTokensTheFormatterDropped(t *testing.T) {
	got := carried(t, "a: { b: 1 }", "a: b: 1", [2]int{3, 4}, [2]int{3, 11})
	if want := []any{nil, [2]int{3, 7}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCarryStopsAtTheFirstTokenThatDiffers(t *testing.T) {
	for _, c := range []struct {
		p, f string
		r    [2]int
		want any
	}{
		{"a b c", "a x c", [2]int{0, 1}, [2]int{0, 1}},
		{"a b c", "a x c", [2]int{4, 5}, nil},
		{"a", "a b", [2]int{0, 1}, [2]int{0, 1}},
		{"a b", "a", [2]int{2, 3}, nil},
		{"a:b", "a,:b", [2]int{1, 2}, [2]int{2, 3}},
		{"\"é\" | x", "\"é\"|x", [2]int{7, 8}, [2]int{5, 6}},
	} {
		if got := carried(t, c.p, c.f, c.r); !reflect.DeepEqual(got, []any{c.want}) {
			t.Fatalf("%q -> %q %v: got %v, want %v", c.p, c.f, c.r, got, c.want)
		}
	}
}

func TestCarrySkipsTheHeadTheFormatterRepeats(t *testing.T) {
	printed := "%d = {\n  \"a\": 1\n  \"b\": 2\n}\n"
	got := carried(t, printed, "%d = a: 1\n%d = b: 2\n", [2]int{23, 24}, [2]int{5, 26}, [2]int{18, 24})
	if want := []any{[2]int{18, 19}, [2]int{5, 19}, [2]int{15, 19}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCarryReadsAKeyTheHeadRepeatsAsTheKey(t *testing.T) {
	printed := "a: {\n  \"b\": 1\n  \"a\": 2\n}\n"
	got := carried(t, printed, "a: b: 1\na: a: 2\n", [2]int{16, 19}, [2]int{16, 22})
	if want := []any{[2]int{11, 12}, [2]int{11, 15}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCarryKeepsALineThatStartsAsTheOneBefore(t *testing.T) {
	text := "meta(\n  x\n)\nmeta(meta(y))\nz\n"
	got := carried(t, text, text, [2]int{22, 23}, [2]int{12, 25}, [2]int{26, 27})
	if want := []any{[2]int{22, 23}, [2]int{12, 25}, [2]int{26, 27}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestAMapReadBackMustHaveTheShapeTheImporterWrites(t *testing.T) {
	sha := TextSha("x")
	span := map[string]any{"start": 0, "end": 1, "frame": 0, "keyword": "", "absolute": "a:/b#"}
	with := func(k string, v any) map[string]any {
		out := map[string]any{}
		for kk, vv := range span {
			out[kk] = vv
		}
		out[k] = v
		return out
	}
	mapText := func(spans ...any) string {
		b, _ := json.Marshal(map[string]any{"sha256": sha, "spans": spans})
		return string(b)
	}
	full := with("enters", 1)
	full["required"] = true
	m, ok := ReadSourceMap(mapText(span, full))
	if !ok || 2 != len(m.Spans) || nil == m.Spans[1].Enters || 1 != *m.Spans[1].Enters ||
		!m.Spans[1].Required || m.Spans[0].Required || nil != m.Spans[0].Enters {
		t.Fatalf("a good map: %v %+v", ok, m)
	}
	for _, bad := range []string{"not json", "null", "[]", `{"sha256":"x","spans":[]}`,
		`{"sha256":"` + sha + `"}`, mapText(nil), mapText(with("start", -1)),
		mapText(with("end", 1.5)), mapText(with("keyword", 1)), mapText(with("enters", -1)),
		mapText(with("required", false)), mapText([]any{1})} {
		if _, ok := ReadSourceMap(bad); ok {
			t.Fatalf("read %s", bad)
		}
	}
}

func TestAChainNoInstanceSpellsTakesTheFirstReference(t *testing.T) {
	one := 1
	m := &SourceMap{Sha256: TextSha("x"), Spans: []SourceSpan{
		{Start: 0, End: 4, Frame: 1, Keyword: "/minimum", Absolute: "a:/s#/$defs/d/minimum"},
		{Start: 6, End: 9, Frame: 0, Keyword: "/properties/a/$ref", Absolute: "a:/s#/x", Enters: &one},
	}}
	at, ok := smLocate(m, "min(1) %d", VetSite{Row: 1, Col: 1}, []string{"b"}, false)
	if !ok || "/properties/a/$ref/minimum" != at.keyword || "a:/s#/$defs/d/minimum" != at.absolute {
		t.Fatalf("got %v %+v", ok, at)
	}
	if _, ok := smLocate(m, "min(1) %d", VetSite{Row: 1, Col: 10}, nil, false); ok {
		t.Fatal("a site no span holds")
	}
	// A row past the text reads at its end.
	if at := siteByte("ab\ncd", VetSite{Row: 9, Col: 1}); 5 != at {
		t.Fatalf("past the end: %d", at)
	}
}

func TestAReferenceThatTakesNoStepReachesTheRootOnlyWithThePathSpent(t *testing.T) {
	one := 1
	m := &SourceMap{Sha256: TextSha("x"), Spans: []SourceSpan{
		{Start: 0, End: 4, Frame: 1, Keyword: "/minimum", Absolute: "a:/s#/$defs/d/minimum"},
		{Start: 6, End: 9, Frame: 0, Keyword: "/$ref", Absolute: "a:/s#/$ref", Enters: &one},
	}}
	at, ok := smLocate(m, "min(1) %d", VetSite{Row: 1, Col: 1}, []string{"b"}, false)
	if !ok || "/$ref/minimum" != at.keyword || "a:/s#/$defs/d/minimum" != at.absolute {
		t.Fatalf("got %v %+v", ok, at)
	}
}

func TestTheFlagFormIsTheVerdictAlone(t *testing.T) {
	report := VetReport{Verdict: VetIncomplete, Findings: []VetFinding{}}
	if got := VetOutput(report, "flag", "", nil); !reflect.DeepEqual(got, OutputFlag{Valid: false}) {
		t.Fatalf("flag: %+v", got)
	}
	report.Verdict = VetValid
	if got := VetOutput(report, "basic", "", nil); !reflect.DeepEqual(got, OutputFlag{Valid: true}) {
		t.Fatalf("no map: %+v", got)
	}
}

func TestAUnitIsAnErrorAndOneWithNoSchemaSiteIsUnlocated(t *testing.T) {
	empty, a := "", "/a"
	report := VetReport{Verdict: VetInvalid, Findings: []VetFinding{
		{Code: "deprecated", Class: "compat", Severity: "warning", Path: "$", Pointer: &empty,
			Message: "old", Sites: []VetSite{}},
		{Code: "syntax", Class: "parse", Severity: "error", Path: "$.a", Pointer: &a,
			Message: "bad", Sites: []VetSite{{Role: VetRoleData, Row: 1, Col: 1}}},
		{Code: "syntax", Class: "parse", Severity: "error", Path: "$", Message: "bare", Sites: []VetSite{}},
	}}
	got, _ := json.Marshal(VetOutput(report, "basic", "x", &SourceMap{Sha256: TextSha("x")}))
	want := `{"errors":[{"error":"bad","instanceLocation":"/a","keywordLocation":"","valid":false},` +
		`{"error":"bare","instanceLocation":"","keywordLocation":"","valid":false}],` +
		`"instanceLocation":"","keywordLocation":"","valid":false}`
	if want != string(got) {
		t.Fatalf("got %s", got)
	}
}
