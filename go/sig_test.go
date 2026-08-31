// Copyright (c) 2021-2026 Richard Rodger, MIT License

package aontu

// The signature registry's parity gates (docs/design/SIGNATURES.0.md,
// ADR-001). Three facts hold the design together: the embedded copy
// IS the shared declaration (byte identity), every declaration line
// ROUND-TRIPS through this port's parser (render(parse(line)) is the
// line — the same gate ts/test/sig.test.ts holds for the TS parser,
// which is what pins the two parsers to each other), and the declared
// names are exactly the built-in names the engine serves.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSigDeclIsTheSharedDeclaration(t *testing.T) {
	shared, err := os.ReadFile(filepath.Join("..", "test", "spec", "signature.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	if string(shared) != sigDeclText {
		t.Fatal("go/sigdecl.txt is not byte-identical with " +
			"test/spec/signature.tsv — run `make sig`")
	}
}

func TestSigEveryDeclarationLineRoundTrips(t *testing.T) {
	for _, rawline := range strings.Split(sigDeclText, "\n") {
		line := strings.TrimSpace(rawline)
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		sig, err := parseSigLine(line)
		if nil != err {
			t.Fatalf("parse: %v", err)
		}
		if got := renderSig(sig); got != line {
			t.Fatalf("round-trip: %q => %q", line, got)
		}
	}
}

func TestSigDeclaredNamesAreTheBuiltinNames(t *testing.T) {
	for name := range funcSig {
		if _, ok := funcArity[name]; !ok {
			t.Fatalf("declared but not a builtin: %s", name)
		}
	}
	for name := range funcArity {
		if _, ok := funcSig[name]; !ok {
			t.Fatalf("builtin but not declared: %s", name)
		}
	}
}

func TestSigMalformedDeclarationsAreErrors(t *testing.T) {
	bad := []string{
		"",
		"upper",
		"upper(s: string)",
		"upper(bogus s: string) : string",
		"upper(s: string) : string trailing",
	}
	for _, line := range bad {
		if _, err := parseSigLine(line); nil == err {
			t.Fatalf("accepted malformed declaration: %q", line)
		}
	}
	if _, err := parseSigText("upper(s: string) : string\nupper(s: string) : string\n"); nil == err {
		t.Fatal("accepted duplicate declaration")
	}
}
