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
	if _, _, ok := mapAt("", both, 0); ok {
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

func TestCursorOutlineVisitsASharedValueOnceAndStepsOverNothing(t *testing.T) {
	one := &TopVal{}
	both := &ConjunctVal{peg: []Val{one, one, nil}}
	if got := symbolTree("x", both); 0 != len(got) {
		t.Fatalf("got %v", got)
	}
}

func TestSrcLinesPositionCountsUTF16Units(t *testing.T) {
	l := newSrcLines("a\U0001F600b: 1\nc: 2\n")
	if p := l.positionOf(5); 0 != p.Line || 3 != p.Character {
		t.Errorf("astral: %+v", p)
	}
	if p := l.positionOf(10); 1 != p.Line || 0 != p.Character {
		t.Errorf("line: %+v", p)
	}
	if p := l.positionOf(len(l.src)); 2 != p.Line || 0 != p.Character {
		t.Errorf("end: %+v", p)
	}
}
