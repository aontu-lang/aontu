/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"regexp"
	"testing"
)

var hcanonHashRe = regexp.MustCompile(`^aon1-[A-Za-z0-9_-]{43}$`)

func TestHcanonInternals(t *testing.T) {
	nested := newConjunct([]Val{
		newDisjunct([]Val{newInteger(1), newInteger(2)}),
		newInteger(3),
	})
	if got := Hcanon(nested); "(1|2)&3" != got {
		t.Fatalf("want (1|2)&3, got %s", got)
	}

	// A junction member with ONE term needs no parens: `1&3`, which is
	// what the same text reparses to.
	single := newConjunct([]Val{
		newDisjunct([]Val{newInteger(1)}),
		newInteger(3),
	})
	if got := Hcanon(single); "1&3" != got {
		t.Fatalf("want 1&3, got %s", got)
	}

	// A disjunct of junctions, so the other join symbol wraps too.
	both := newDisjunct([]Val{
		newConjunct([]Val{newInteger(1), newInteger(2)}),
		newInteger(3),
	})
	if got := Hcanon(both); "(1&2)|3" != got {
		t.Fatalf("want (1&2)|3, got %s", got)
	}

	// A nil Val has no meaning to render; CanonHash is public API, so
	// it answers rather than panicking.
	if got := Hcanon(nil); "nil" != got {
		t.Fatalf("want nil, got %s", got)
	}

	if got := CanonHash(single); !hcanonHashRe.MatchString(got) {
		t.Fatalf("not a canon-hash: %s", got)
	}
}
