/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strings"
	"testing"
)

// TestPublicConstructors exercises the exported value constructors the
// way an external caller would: building a vars map for GenerateVars.
func TestPublicConstructors(t *testing.T) {
	vars := map[string]Val{
		"foo":  NewInteger(11),
		"bar":  NewString("hello"),
		"flag": NewBoolean(true),
		"obj":  NewMap(map[string]Val{"x": NewInteger(1)}),
		"lst":  NewList([]Val{NewInteger(1), NewString("a")}),
		"pi":   NewNumber(3.5),
	}

	out, err := New().GenerateVars(
		"a:$foo b:$bar c:$flag d:$obj e:$lst f:$pi", vars)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", out)
	}
	if m["a"] != int64(11) {
		t.Errorf("a: want 11, got %v", m["a"])
	}
	if m["b"] != "hello" {
		t.Errorf("b: want hello, got %v", m["b"])
	}
	if m["c"] != true {
		t.Errorf("c: want true, got %v", m["c"])
	}
	if m["f"] != 3.5 {
		t.Errorf("f: want 3.5, got %v", m["f"])
	}

	obj, ok := m["d"].(map[string]any)
	if !ok || obj["x"] != int64(1) {
		t.Errorf("d: want {x:1}, got %v", m["d"])
	}

	list, ok := m["e"].([]any)
	if !ok || len(list) != 2 || list[0] != int64(1) || list[1] != "a" {
		t.Errorf("e: want [1,a], got %v", m["e"])
	}
}

// TestPublicConstructorsUnify checks a constructed variable unifies with
// a constraint and that NewScalarKind / NewNull work.
func TestPublicConstructorsUnify(t *testing.T) {
	vars := map[string]Val{
		"foo": NewInteger(11),
		"n":   NewNull(),
		"k":   NewScalarKind(KindInteger),
	}

	v, err := New().UnifyVars("a:$foo & number", vars)
	if err != nil {
		t.Fatalf("unify: %v", err)
	}
	if got := v.Canon(); got != `{"a":11}` {
		t.Fatalf("canon: %s", got)
	}

	// $k (integer kind) & $foo resolves to 11.
	out, err := New().GenerateVars("a:$k & $foo n:$n", vars)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	m := out.(map[string]any)
	if m["a"] != int64(11) {
		t.Errorf("a: want 11, got %v", m["a"])
	}
	if v, ok := m["n"]; !ok || v != nil {
		t.Errorf("n: want null present, got %v (ok=%v)", v, ok)
	}
}

func TestNewIntegerRefusesLossyInt64(t *testing.T) {
	exact := []int64{
		0, 1, -1, 11,
		9007199254740992,
		-9007199254740992,
		1152921504606846976,
		9223372036854774784,  // 2^63-1024, the last exact int64
		-9223372036854775808,
		1000000000000000000,
	}
	for _, i := range exact {
		if v := NewInteger(i); v.Nil() {
			t.Errorf("NewInteger(%d) refused an exactly representable int64", i)
		}
	}

	// Values that would have to CHANGE to be stored.
	lossy := []int64{
		9007199254740993,     // 2^53+1, the first
		-9007199254740993,    // and its mirror
		9223372036854775807,  // 2^63-1 (math.MaxInt64), rounds UP to 2^63
		1152921504606846977,
		-9223372036854775807,
	}
	for _, i := range lossy {
		v := NewInteger(i)
		if !v.Nil() {
			t.Fatalf("NewInteger(%d) stored a value binary64 cannot carry", i)
		}
	}

	// The refusal is a VALUE, so it flows through unification and
	// surfaces at Generate with the literal rule's own hint rather than
	// panicking or corrupting the document.
	_, err := New().GenerateVars("a:$n", map[string]Val{
		"n": NewInteger(9007199254740993),
	})
	if err == nil {
		t.Fatal("a lossy NewInteger generated without error")
	}
	if !strings.Contains(err.Error(), "not exactly representable") {
		t.Errorf("want the lossy-integer hint, got: %v", err)
	}

	// And the escape is the same one the literal rule names.
	out, err := New().GenerateVars("a:$n", map[string]Val{
		"n": NewBigInteger(big.NewInt(9007199254740993)),
	})
	if err != nil {
		t.Fatalf("NewBigInteger: %v", err)
	}
	got := out.(map[string]any)["a"].(*big.Int)
	if got.String() != "9007199254740993" {
		t.Errorf("a: want 9007199254740993, got %v", got)
	}
}
