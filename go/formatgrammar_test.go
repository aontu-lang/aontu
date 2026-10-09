/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestFormatGrammarsAreTheCommittedGrammars(t *testing.T) {
	dir := filepath.Join("..", "grammar", "format")
	read := func(at string) string {
		text, err := os.ReadFile(at)
		if nil != err {
			t.Fatal(err)
		}
		return strings.ReplaceAll(string(text), "\r\n", "\n")
	}
	entries, err := os.ReadDir(dir)
	if nil != err {
		t.Fatal(err)
	}
	want := map[string][]string{}
	lib := []string{}
	for _, e := range entries {
		if !e.IsDir() {
			want[strings.TrimSuffix(e.Name(), ".abnf")] = []string{read(filepath.Join(dir, e.Name()))}
			continue
		}
		parts, err := os.ReadDir(filepath.Join(dir, e.Name()))
		if nil != err {
			t.Fatal(err)
		}
		texts := []string{}
		main := e.Name() + ".abnf"
		names := []string{}
		for _, p := range parts {
			names = append(names, p.Name())
		}
		sort.SliceStable(names, func(i, j int) bool {
			return main == names[i] || (main != names[j] && names[i] < names[j])
		})
		for _, n := range names {
			texts = append(texts, read(filepath.Join(dir, e.Name(), n)))
		}
		if "lib" == e.Name() {
			lib = texts
		} else {
			want[e.Name()] = texts
		}
	}
	if len(want) != len(formatGrammars) {
		t.Fatalf("staged %d formats, committed %d: run `make formats`", len(formatGrammars), len(want))
	}
	for name, texts := range want {
		if strings.Join(texts, "\x00") != strings.Join(formatGrammars[name], "\x00") {
			t.Fatalf("go/formatgrammars/ is stale for %s: run `make formats`", name)
		}
	}
	if strings.Join(lib, "\n") != formatLibrary {
		t.Fatal("go/formatgrammars/lib/ is stale: run `make formats`")
	}
}

func TestFormatGrammarsPassTheDeterminismCheck(t *testing.T) {
	for name, texts := range formatGrammars {
		for _, text := range texts {
			if g, code, why := readGrammarOf(text, true); nil == g {
				t.Fatalf("%s: %s %s", name, code, why)
			}
		}
		if got, gs, _, _ := formatOf(name); got != name || len(gs) != len(texts) {
			t.Fatalf("%s reads as %s", name, got)
		}
	}
}

func TestFormatGrammarIsReadOnce(t *testing.T) {
	a, _, _ := readFormatGrammar(`v = "a"`)
	b, _, _ := readFormatGrammar(`v = "a"`)
	if a != b {
		t.Fatal("read twice")
	}
}

func TestFormatStepBound(t *testing.T) {
	g, _, _ := readFormatGrammar(`v = *"a"`)
	if _, ok := recogniseFormat(g, strings.Repeat("a", formatStepMax)); ok {
		t.Fatal("past the bound")
	}
	if stop, ok := recogniseFormat(g, strings.Repeat("a", 1000)); !ok || -1 != stop {
		t.Fatal("within the bound")
	}
}

func TestFormatStepBoundRefuses(t *testing.T) {
	src := `a: format("v = *\"a\"") & "` + strings.Repeat("a", formatStepMax) + `"`
	_, err := New().GenerateVars(src, nil)
	ae, ok := err.(*AontuError)
	if !ok || "parse_failed" != ae.Code ||
		!strings.Contains(ae.Msg, "format v: the step bound of 1000000 is reached") {
		t.Fatalf("got %v", err)
	}
}
