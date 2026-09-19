/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
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

func TestParseCanonNestedJunctions(t *testing.T) {
	rows := []struct{ src, canon string }{
		{"a:(1|2)&3", `{"a":(1|2)&3}`},
		{"a:1|2&3", `{"a":1|(2&3)}`},
		{"a:1&2|3", `{"a":(1&2)|3}`},
		{"a:(1&2)|3", `{"a":(1&2)|3}`},
		{"a:1|2|3", `{"a":(1|2)|3}`},
		{"a:1&2&3", `{"a":(1&2)&3}`},
		{"a:(1|2)&(3|4)", `{"a":(1|2)&(3|4)}`},
		{"a:1&(2|3)&4", `{"a":(1&(2|3))&4}`},
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
