
package aontu


import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestSigDeclIsTheSharedDeclaration(t *testing.T) {
	shared, err := os.ReadFile(filepath.Join("..", "test", "spec", "signature.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	norm := func(s string) string { return strings.ReplaceAll(s, "\r\n", "\n") }
	if norm(string(shared)) != norm(sigDeclText) {
		t.Fatal("go/sigdecl.txt does not match " +
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

func TestCanonCallsAreDeclaredBuiltins(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "test", "spec", "*.tsv"))
	if nil != err {
		t.Fatal(err)
	}
	str := regexp.MustCompile(`"(?:[^"\\]|\\.)*"`)
	call := regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)\(`)
	rows := 0
	for _, file := range files {
		raw, err := os.ReadFile(file)
		if nil != err {
			t.Fatal(err)
		}
		for _, line := range strings.Split(string(raw), "\n") {
			cols := strings.Split(line, "\t")
			if strings.HasPrefix(line, "#") || 4 > len(cols) ||
				("canon" != cols[1] && "hcanon" != cols[1]) {
				continue
			}
			rows++
			for _, m := range call.FindAllStringSubmatch(str.ReplaceAllString(cols[3], `""`), -1) {
				if _, ok := funcSig[m[1]]; !ok {
					t.Errorf("%s:%s writes %s(, which is no builtin",
						filepath.Base(file), cols[0], m[1])
				}
			}
		}
	}
	if 0 == rows {
		t.Fatal("no canon rows read")
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
	// A malformed line propagates out of the whole-text loader too.
	if _, err := parseSigText("nope\n"); nil == err {
		t.Fatal("accepted malformed text")
	}
}

func TestSigExportedAccessors(t *testing.T) {
	// The exported render surface the LSP consumes; cross-package
	// calls do not count toward this package's ADR-002 floor, so the
	// accessors are pinned here.
	if got := FuncSignature("pack"); "pack(d: map|list, template t: any) : map" != got {
		t.Fatalf("pack signature: %q", got)
	}
	if "" != FuncSignature("notafunc") {
		t.Fatal("notafunc has no signature")
	}
	params := FuncSignatureParams("pack")
	if 2 != len(params) || "d: map|list" != params[0] || "template t: any" != params[1] {
		t.Fatalf("pack params: %v", params)
	}
	if nil != FuncSignatureParams("notafunc") {
		t.Fatal("notafunc has no params")
	}
}
