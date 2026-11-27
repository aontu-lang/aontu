package aontu

// The subsume differential, twin of ts/test/subsume-contract.test.ts:
// each golden verdict of test/spec/subsume.tsv that the definition reads
// is one its contract allows (test/spec/def-subsume-rows.tsv), and each
// document the definition read unifies as the row's own does.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func contractRows(t *testing.T, file string) [][]string {
	b, err := os.ReadFile(filepath.Join("..", "test", "spec", file))
	if err != nil {
		t.Fatal(err)
	}
	var out [][]string
	for _, l := range strings.Split(string(b), "\n") {
		if l != "" && !strings.HasPrefix(l, "#") {
			out = append(out, strings.Split(l, "\t"))
		}
	}
	return out
}

func contractCanon(t *testing.T, src string) string {
	v, err := New().Unify(src)
	if err != nil {
		t.Fatalf("unify error: %v\n src: %q", err, src)
	}
	return Hcanon(v)
}

func TestSubsumeContract(t *testing.T) {
	golden := map[string][]string{}
	for _, r := range contractRows(t, "subsume.tsv") {
		if len(r) >= 5 && r[1] == "subsume" {
			golden[r[0]] = r
		}
	}
	contract := contractRows(t, "def-subsume-rows.tsv")
	if len(contract) <= 100 {
		t.Fatalf("only %d rows", len(contract))
	}
	for _, c := range contract {
		g, ok := golden[strings.TrimPrefix(c[0], "def-")]
		if !ok {
			t.Fatalf("%s names no golden row", c[0])
		}
		var want struct{ Verdict []string }
		var got struct{ Verdict string }
		if err := json.Unmarshal([]byte(unescapeSpec(c[4])), &want); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(unescapeSpec(g[4])), &got); err != nil {
			t.Fatal(err)
		}
		allowed := false
		for _, w := range want.Verdict {
			allowed = allowed || w == got.Verdict
		}
		if !allowed {
			t.Errorf("%s: %s, where the contract allows %v", g[0], got.Verdict, want.Verdict)
		}
		if contractCanon(t, unescapeSpec(c[2])) != contractCanon(t, unescapeSpec(g[2])) {
			t.Errorf("%s: the general document reads otherwise", g[0])
		}
		if contractCanon(t, unescapeSpec(c[3])) != contractCanon(t, unescapeSpec(g[3])) {
			t.Errorf("%s: the specific document reads otherwise", g[0])
		}
	}
}
