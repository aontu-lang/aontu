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

func TestGenMapGeneratesWithoutAContext(t *testing.T) {
	root, err := New().Unify(`o: {zebraOne: 1, alphaTwo: {} & gen({empty: "omit"})} & gen({keys: "snake"})`)
	if nil != err {
		t.Fatal(err)
	}
	out, gerr := root.(*MapVal).peg["o"].Gen(nil)
	if m, ok := out.(map[string]any); nil != gerr || !ok || 1 != len(m) || int64(1) != m["zebra_one"] {
		t.Fatalf("want one member zebra_one, got %v (%v)", out, gerr)
	}
}

func TestGenKeyClashRaisesWithoutAContext(t *testing.T) {
	root, err := New().Unify(`o: {a_b: 1, aB: 2} & gen({keys: "snake"})`)
	if nil != err {
		t.Fatal(err)
	}
	_, gerr := root.(*MapVal).peg["o"].Gen(nil)
	if ae, ok := gerr.(*AontuError); !ok || "gen_key_clash" != ae.Code {
		t.Fatalf("want gen_key_clash, got %v", gerr)
	}
}

func TestGenKeyClashIsCollected(t *testing.T) {
	root, err := New().Unify(`o: {a_b: 1, aB: 2} & gen({keys: "snake"})`)
	if nil != err {
		t.Fatal(err)
	}
	ctx := &Ctx{collect: true}
	out, gerr := root.Gen(ctx)
	if nil != gerr || 1 != len(ctx.err) || "gen_key_clash" != ctx.err[0].why {
		t.Fatalf("want one collected gen_key_clash, got %v %v %v", out, gerr, ctx.err)
	}
	d := ctx.err[0].details
	if "a_b" != d["written"] || "aB" != d["a"] || "a_b" != d["b"] {
		t.Fatalf("details: %v", d)
	}
}

func TestGenAddressResolvesFromItsOwnPathWithoutAContext(t *testing.T) {
	root, err := New().Unify(`a: {x: path(..b) & gen({form: "absolute"})}`)
	if nil != err {
		t.Fatal(err)
	}
	out, gerr := root.(*MapVal).peg["a"].(*MapVal).peg["x"].Gen(nil)
	if nil != gerr || "$.b" != out {
		t.Fatalf("want $.b, got %v (%v)", out, gerr)
	}
}

func TestGenPlainGenerationReadsTheValue(t *testing.T) {
	src := `v: 3.14159 & gen({places: 2, as: "string"}), ` +
		`o: {orderId: "" & gen({empty: "omit"})} & gen({keys: "snake"}), ` +
		`p: {x: path(..b) & gen({form: "key"})}, n: null & gen({empty: "omit"}), ` +
		`l: [] & gen({empty: "omit"})`
	root, err := New().Unify(src)
	if nil != err {
		t.Fatal(err)
	}
	plain, gerr := root.Gen(&Ctx{plain: true})
	if nil != gerr || `map[l:[] n:<nil> o:map[orderId:] p:map[x:..b] v:3.14159]` != fmt.Sprint(plain) {
		t.Fatalf("plain: %v (%v)", plain, gerr)
	}
	written, gerr := root.Gen(&Ctx{})
	if nil != gerr || `map[o:map[] p:map[x:b] v:3.14]` != fmt.Sprint(written) {
		t.Fatalf("written: %v (%v)", written, gerr)
	}
}

func TestGenOmittedRootGeneratesNothing(t *testing.T) {
	for _, src := range []string{`{} & gen({empty: "omit"})`, `[] & gen({empty: "omit"})`} {
		out, err := New().Generate(src)
		if nil != err || nil != out {
			t.Fatalf("%s: want nothing, got %v (%v)", src, out, err)
		}
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
