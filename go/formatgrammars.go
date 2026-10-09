/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"embed"
	"io/fs"
	"sort"
	"strings"
)

// The committed format grammars (ADR-059), staged from grammar/format/
// by ts/scripts/formats.cjs and held identical with the sources by
// go/formatgrammar_test.go. A format is <name>.abnf, or a directory of
// grammars a string meets together, <name>.abnf first; lib/ is shared.
//
//go:embed formatgrammars
var formatGrammarFiles embed.FS

var formatGrammars, formatLibrary = func() (map[string][]string, string) {
	read := func(at string) string {
		text, _ := fs.ReadFile(formatGrammarFiles, at)
		return string(text)
	}
	out := map[string][]string{}
	lib := []string{}
	entries, _ := fs.ReadDir(formatGrammarFiles, "formatgrammars")
	for _, e := range entries {
		at := "formatgrammars/" + e.Name()
		if !e.IsDir() {
			out[strings.TrimSuffix(e.Name(), ".abnf")] = []string{read(at)}
			continue
		}
		parts, _ := fs.ReadDir(formatGrammarFiles, at)
		names := []string{}
		for _, p := range parts {
			names = append(names, p.Name())
		}
		main := e.Name() + ".abnf"
		sort.SliceStable(names, func(i, j int) bool {
			return main == names[i] || (main != names[j] && names[i] < names[j])
		})
		texts := []string{}
		for _, n := range names {
			texts = append(texts, read(at+"/"+n))
		}
		if "lib" == e.Name() {
			lib = texts
		} else {
			out[e.Name()] = texts
		}
	}
	return out, strings.Join(lib, "\n")
}()
