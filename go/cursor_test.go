/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "testing"

func TestCursorColonAtTheStartHasNoKeyBeforeIt(t *testing.T) {
	if _, _, ok := keySpan(": 1", 2, "a"); ok {
		t.Fatal("a colon at the start has no key before it")
	}
}

func TestCursorMapSearchVisitsASharedValueOnceAndFindsNothingElse(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, nil}}
	if _, _, ok := mapAt(both, 0); ok {
		t.Fatal("found a map where there is none")
	}
}

func TestCursorWalkVisitsASharedValueOnceAndStepsOverNothing(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, &PrefVal{}}}
	keys, values := cursorHits("x", both)
	if 0 != len(keys) || 0 != len(values) {
		t.Fatalf("got %v %v", keys, values)
	}
}
