/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const matchCorpusPath = "../test/spec/files/match-corpus.tsv"

type matchCorpusRow struct {
	pattern  string
	texts    []string
	match    string
	exported string
	imported string
	regex    string
	line     int
}

func loadMatchCorpus(t *testing.T) []matchCorpusRow {
	t.Helper()
	data, err := os.ReadFile(filepath.FromSlash(matchCorpusPath))
	if nil != err {
		t.Fatalf("cannot read %s: %v", matchCorpusPath, err)
	}
	rows := []matchCorpusRow{}
	for i, raw := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		if "" == raw || strings.HasPrefix(raw, "#") {
			continue
		}
		f := strings.Split(raw, "\t")
		r := matchCorpusRow{match: f[2], regex: f[5], line: i + 1}
		for _, cell := range []struct {
			text string
			into any
		}{{f[0], &r.pattern}, {f[1], &r.texts}, {f[3], &r.exported}, {f[4], &r.imported}} {
			if err := json.Unmarshal([]byte(cell.text), cell.into); nil != err {
				t.Fatalf("match-corpus.tsv line %d: %v", r.line, err)
			}
		}
		rows = append(rows, r)
	}
	return rows
}

func matchCorpusForm(out, why string) string {
	if "" != why {
		return "!" + why
	}
	return out
}

func matchCorpusVerdict(prog []rxInst, texts []string) string {
	out := ""
	for _, s := range texts {
		if patternMatches(prog, s) {
			out += "1"
		} else {
			out += "0"
		}
	}
	return out
}

// TestMatchCorpusLoaded is a guard on the guard: a truncated corpus, or
// one that never matches or never refuses, would leave the checks below
// vacuous.
func TestMatchCorpusLoaded(t *testing.T) {
	rows := loadMatchCorpus(t)
	if 500 >= len(rows) {
		t.Fatalf("corpus too small: %d", len(rows))
	}
	mismatch := regexp.MustCompile(`^[01]*0[01]*$`)
	refused, matched, missed := false, false, false
	for _, r := range rows {
		refused = refused || strings.HasPrefix(r.match, "!")
		matched = matched || (!strings.HasPrefix(r.match, "!") && strings.Contains(r.match, "1"))
		missed = missed || mismatch.MatchString(r.match)
	}
	if !refused || !matched || !missed {
		t.Fatalf("corpus lacks a kind: refused %v, matched %v, missed %v", refused, matched, missed)
	}
}

// TestMatchCorpusParity is the cross-port check: the corpus pins what
// the matcher, the exporter's and importer's rewriting, and the regex
// format say of each pattern, so a drift fails on the exact line.
func TestMatchCorpusParity(t *testing.T) {
	for _, r := range loadMatchCorpus(t) {
		got := ""
		if prog, why := compilePattern(r.pattern, "aontu"); nil == prog {
			got = "!" + why
		} else {
			got = matchCorpusVerdict(prog, r.texts)
		}
		regex := "ok"
		if why := ecmaWhy(r.pattern); "" != why {
			regex = "!" + why
		}
		for _, c := range [][3]string{
			{"match", got, r.match},
			{"export", matchCorpusForm(exportForm(r.pattern)), r.exported},
			{"import", matchCorpusForm(importForm(r.pattern)), r.imported},
			{"regex", regex, r.regex},
		} {
			if c[1] != c[2] {
				t.Errorf("match-corpus.tsv line %d, %s: %q\n  got:  %q\n  want: %q",
					r.line, c[0], r.pattern, c[1], c[2])
			}
		}
	}
}

// TestMatchCorpusExportRoundTrips checks that what the exporter writes
// means what re() means: read back as re() source, the export agrees
// with the pattern on every text.
func TestMatchCorpusExportRoundTrips(t *testing.T) {
	for _, r := range loadMatchCorpus(t) {
		if strings.HasPrefix(r.exported, "!") {
			continue
		}
		back, why := importForm(r.exported)
		if "" != why {
			t.Errorf("match-corpus.tsv line %d: the export does not import: %s", r.line, why)
			continue
		}
		prog, _ := compilePattern(back, "aontu")
		if got := matchCorpusVerdict(prog, r.texts); got != r.match {
			t.Errorf("match-corpus.tsv line %d: the export means otherwise: %q", r.line, got)
		}
	}
}
