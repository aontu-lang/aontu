/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"strings"
	"testing"
)

func TestGenPreferenceGeneratesWithoutAContext(t *testing.T) {
	root, err := New().Unify("v: *1.255 & gen({significant: 2})")
	if nil != err {
		t.Fatal(err)
	}
	out, gerr := root.(*MapVal).peg["v"].Gen(nil)
	if nil != gerr || 1.3 != out {
		t.Fatalf("want 1.3, got %v (%v)", out, gerr)
	}
}

// More distinct records than one process keeps the reading of.
func TestGenOptionReadingsAreBounded(t *testing.T) {
	var src strings.Builder
	for i := 0; i < 300; i++ {
		fmt.Fprintf(&src, "k%d: 1.2345678 & gen({significant: %d})\n", i, i+1)
	}
	for pass := 0; pass < 2; pass++ {
		out, err := New().Generate(src.String())
		if nil != err {
			t.Fatal(err)
		}
		m := out.(map[string]any)
		if 1.0 != m["k0"] || 1.23 != m["k2"] || 1.2345678 != m["k299"] {
			t.Fatalf("pass %d: got %v %v %v", pass, m["k0"], m["k2"], m["k299"])
		}
	}
}
