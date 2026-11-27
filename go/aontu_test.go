/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestBasicCanon(t *testing.T) {
	v, err := New().Unify("a:1")
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Canon(); got != `{"a":1}` {
		t.Fatalf("canon = %s", got)
	}
}

func TestParseCanon(t *testing.T) {
	v, err := New().Parse("a:number")
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Canon(); got != `{"a":number}` {
		t.Fatalf("canon = %s", got)
	}
}

func TestGenerate(t *testing.T) {
	out, err := New().Generate("a:2")
	if err != nil {
		t.Fatal(err)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %#v", out)
	}
	if m["a"].(int64) != 2 {
		t.Fatalf("a = %#v", m["a"])
	}
}

func TestConflictErrors(t *testing.T) {
	_, err := New().Generate("a:1 a:2")
	if err == nil {
		t.Fatal("expected conflict error")
	}
}

func TestEmpty(t *testing.T) {
	out, err := New().Generate("")
	if err != nil {
		t.Fatal(err)
	}
	m, ok := out.(map[string]any)
	if !ok || len(m) != 0 {
		t.Fatalf("expected empty map, got %#v", out)
	}
}

// A BARE key carrying the prefix has no shared-spec spelling: the TSV
// unescaper reads \n and \t and nothing else, so a source holding a
// literal NUL cannot be written as a row. The quoted spelling is pinned
// by edge.tsv; this is its bare twin, matched in ts/test/lang.test.ts.
func TestReservedKeyPrefixRejected(t *testing.T) {
	for _, row := range []struct{ src, code string }{
		{"\x00aontu_order:1", "reserved_key"},
		{"\x00aontu_spread:1", "reserved_key"},
		{"\x00aontu_optional:1", "reserved_key"},
		{"a:1 \x00aontu_order:2", "reserved_key"},
		// A NUL that is not the prefix is the bare-string rule's.
		{"a: \x00bc", "bare_punct"},
		{"a\x00b: 1", "bare_punct"},
	} {
		_, err := New().Generate(row.src)
		if err == nil {
			t.Fatalf("expected error for %q, got none", row.src)
		}
		if ae, ok := err.(*AontuError); !ok || ae.Code != row.code {
			t.Fatalf("%q: expected %s, got %v", row.src, row.code, err)
		}
	}
	// A normal key is unaffected.
	if out, err := New().Generate("normal:1"); err != nil {
		t.Fatalf("normal key errored: %v (out=%v)", err, out)
	}
}

func TestVersionFormat(t *testing.T) {
	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(VERSION) {
		t.Fatalf("VERSION is not a plain semver triple: %q", VERSION)
	}
}

// ADR-104: one number names a release, so this reads the other port's
// literal.
func TestVersionMatchesTheNpmPackage(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "ts", "package.json"))
	if err != nil {
		t.Fatalf("cannot read ts/package.json: %v", err)
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		t.Fatalf("cannot parse ts/package.json: %v", err)
	}
	if pkg.Version != VERSION {
		t.Fatalf("version series split: go/aontu.go says %q, ts/package.json says %q",
			VERSION, pkg.Version)
	}
}

func TestParseCanonNestedJunctions(t *testing.T) {
	rows := []struct{ src, canon string }{
		{"a:(1|2)&3", `{"a":(1|2)&3}`},
		{"a:1|2&3", `{"a":1|(2&3)}`},
		{"a:1&2|3", `{"a":(1&2)|3}`},
		{"a:(1&2)|3", `{"a":(1&2)|3}`},
		{"a:1|2|3", `{"a":(1|2)|3}`},
		{"a:1&2&3", `{"a":(1&2)&3}`},
		{"a:(1|2)&(3|4)", `{"a":(1|2)&(3|4)}`},
		{"a:1&(2|3)&4", `{"a":((2|3)&1)&4}`},
	}
	for _, r := range rows {
		v, err := New().Parse(r.src)
		if err != nil {
			t.Fatalf("parse %q: %v", r.src, err)
		}
		if got := v.Canon(); got != r.canon {
			t.Fatalf("parse canon mismatch\n src:  %q\n want: %s\n got:  %s", r.src, r.canon, got)
		}
	}
}

// AliasScope and AliasNameAt are the language server's, so nothing in
// this package reaches them and a cross-package test leaves them
// unattributed. Behaviour is pinned in go/lsp/lsp_test.go, twinned with
// ts/test/lsp.test.ts; this holds them to the same answers from here.
func TestAliasScopeFromThePackage(t *testing.T) {
	src := "%port = integer\n{ %uint8, %b: %remote } = @\"./types.aontu\"\n" +
		"  %lead = 1\n{ a } = @\"./f.aontu\"\n{%} = @\"./f.aontu\"\n%no == 1\n"
	want := []AliasBinding{
		{Name: "%port", Row: 1, Col: 1, Decl: "%port = integer"},
		{Name: "%uint8", Row: 2, Col: 3,
			Decl: `{ %uint8, %b: %remote } = @"./types.aontu"`, From: "./types.aontu"},
		{Name: "%b", Row: 2, Col: 11,
			Decl: `{ %uint8, %b: %remote } = @"./types.aontu"`, From: "./types.aontu"},
		{Name: "%lead", Row: 3, Col: 3, Decl: "%lead = 1"},
	}
	got := AliasScope(src)
	if len(got) != len(want) {
		t.Fatalf("AliasScope\n got: %+v\nwant: %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("binding %d = %+v, want %+v", i, got[i], want[i])
		}
	}

	for _, c := range []struct{ text, want string }{
		{"%a = 1", "%a"}, {"%a-b rest", "%a-b"}, {"50%", ""}, {"a: 1", ""},
	} {
		if got := AliasNameAt(c.text); got != c.want {
			t.Errorf("AliasNameAt(%q) = %q, want %q", c.text, got, c.want)
		}
	}
}

func TestTemplateErrorPath(t *testing.T) {
	cases := [][2]string{
		{`x: { h: [&: { s: "a" | "b" }] } & { h: [ {} ] }`, `$.x.h.0.s`},
		{`x: { h: [&: { at: string }] } & { h: [&: { s: "a" | "b" }] } & { h: [ { at: "z" } ] }`, `$.x.h.0.s`},
		{`x: { h: [&: { at: string }] } & { h: [&: { s: "a" | "b" }] } & { h: [ {} ] }`, `$.x.h.0.at`},
		{`x: { h: { &: { s: "a" | "b" } } } & { h: { k: {} } }`, `$.x.h.k.s`},
	}
	for _, c := range cases {
		_, err := New().Generate(c[0])
		want := regexp.MustCompile(`at path ` + regexp.QuoteMeta(c[1]) + `\b`)
		if nil == err || !want.MatchString(err.Error()) {
			t.Errorf("%s: want %s, got %v", c[0], c[1], err)
		}
	}
}

func TestDeclarationInTemplate(t *testing.T) {
	want := regexp.MustCompile(`aontu/alias_not_toplevel\]: Cannot resolve value at path \$\.m\b`)
	for _, src := range []string{
		`m: { &: { %n = 1, v: %n }, a: {} }`,
		`m: { &: { %n = 1, v: %n } }`,
		`m: { &: { %n = 1 } }`,
		`m: [&: { %n = 1, v: %n }]`,
	} {
		if _, err := New().Generate(src); nil == err || !want.MatchString(err.Error()) {
			t.Errorf("%s: got %v", src, err)
		}
	}
}

func TestMatchByTheValueGenerated(t *testing.T) {
	cases := [][2]string{
		{`t: match(1, *1, "T", "D")`, `{"t":"T"}`},
		{`t: match(1, *1 | 2, "T", "D")`, `{"t":"T"}`},
		{`t: match({x?: string}, {x?: integer}, "T", "D")`, `{"t":"T"}`},
		{`t: match({a: 1, z: type(number)}, close({a: 1}), "T", "D")`, `{"t":"T"}`},
		{`t: match({a: 1, z: type(number)}, {a: 1, z: 5}, "T", "D")`, `{"t":"D"}`},
		{`t: match([1, 2], [], "T", "D")`, `{"t":"D"}`},
		{`x: filter({a: *1 | 2, b: 2 | *1, c: 1}, *1 | 2)`, `{"x":{"a":1,"b":1,"c":1}}`},
		{`x: filter({g: *1}, *1 | 2)`, `{"x":{}}`},
		{`x: filter({g: *1}, integer)`, `{"x":{"g":1}}`},
		{`x: filter({a: *1 | 3}, *1 | 2)`, `{"x":{}}`},
	}
	for _, c := range cases {
		out, err := New().Generate(c[0])
		got, _ := json.Marshal(out)
		if nil != err || c[1] != string(got) {
			t.Errorf("%s: want %s, got %s (%v)", c[0], c[1], got, err)
		}
	}
}

func TestMarkedRootGeneratesNothing(t *testing.T) {
	for _, src := range []string{`hide(1)`, `type(1)`, `hide("x")`, `hide(*{a: 1} | {b: 2})`, `hide({a: 1})`} {
		if out, err := New().Generate(src); nil != err || nil != out {
			t.Errorf("%s: want nothing, got %v (%v)", src, out, err)
		}
	}
}
