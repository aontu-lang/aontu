/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const uriCorpusPath = "../test/spec/files/uri-corpus.tsv"

// TestURICorpus is the cross-port check: the corpus is the pinned output
// of both resolvers, so a drift in either fails on the exact line.
func TestURICorpus(t *testing.T) {
	text, err := os.ReadFile(filepath.FromSlash(uriCorpusPath))
	if nil != err {
		t.Fatalf("cannot open %s: %v", uriCorpusPath, err)
	}
	rows := 0
	for i, raw := range strings.Split(string(text), "\n") {
		if "" == raw || strings.HasPrefix(raw, "#") {
			continue
		}
		rows++
		f := strings.Split(raw, "\t")
		target := resolveURI(f[0], f[1])
		if target != f[2] || normalizeURI(target) != f[3] {
			t.Errorf("uri-corpus.tsv line %d: %q against %q\n  got:  %q %q\n  want: %q %q",
				i+1, f[1], f[0], target, normalizeURI(target), f[2], f[3])
		}
	}
	if 400 >= rows {
		t.Fatalf("corpus too small: %d", rows)
	}
}

// A reference without a scheme normalises as one with: as TypeScript's
// a-reference-without-a-scheme-normalises asks.
func TestURIReferenceNormalises(t *testing.T) {
	if got := normalizeURI("../A/%7ex?%7e#F%2f"); "../A/~x?~#F%2F" != got {
		t.Fatalf("got %q", got)
	}
}
