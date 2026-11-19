/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var lawAtoms = loadLawAtoms()

func loadLawAtoms() []string {
	path := filepath.Join("..", "test", "spec", "files", "constraint-atoms.txt")
	data, err := os.ReadFile(path)
	if err != nil {
		panic("cannot read shared atom vocabulary " + path + ": " + err.Error())
	}
	var atoms []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		atoms = append(atoms, line)
	}
	return atoms
}

// Associativity is cubic, so it runs over a representative prefix --
// the same prefix length as the TypeScript twin.
var lawTripleAtoms = lawAtoms[:8]

func lawObs(src string) string {
	v, err := New().Unify(src)
	if err != nil {
		if ae, ok := err.(*AontuError); ok {
			return "ERR:" + ae.Code
		}
		return "ERR:unknown"
	}
	return v.Canon()
}

// TestConstraintLawCommutativity: a & b == b & a.
func TestConstraintLawCommutativity(t *testing.T) {
	for _, a := range lawAtoms {
		for _, b := range lawAtoms {
			ab := lawObs(fmt.Sprintf("x: %s & %s", a, b))
			ba := lawObs(fmt.Sprintf("x: %s & %s", b, a))
			if ab != ba {
				t.Errorf("commutativity: %s & %s\n  ab: %s\n  ba: %s", a, b, ab, ba)
			}
		}
	}
}

// TestConstraintLawIdempotence: a & a == a.
func TestConstraintLawIdempotence(t *testing.T) {
	for _, a := range lawAtoms {
		aa := lawObs(fmt.Sprintf("x: %s & %s", a, a))
		one := lawObs(fmt.Sprintf("x: %s", a))
		if aa != one {
			t.Errorf("idempotence: %s\n  a&a: %s\n  a:   %s", a, aa, one)
		}
	}
}

// TestConstraintLawAssociativity: (a & b) & c == a & (b & c).
func TestConstraintLawAssociativity(t *testing.T) {
	for _, a := range lawTripleAtoms {
		for _, b := range lawTripleAtoms {
			for _, c := range lawTripleAtoms {
				l := lawObs(fmt.Sprintf("x: (%s & %s) & %s", a, b, c))
				r := lawObs(fmt.Sprintf("x: %s & (%s & %s)", a, b, c))
				if l != r {
					t.Errorf("associativity: %s & %s & %s\n  (ab)c: %s\n  a(bc): %s", a, b, c, l, r)
				}
			}
		}
	}
}

// TestConstraintLawConvergence: re-canonning a residual is a fixpoint,
// so a constraint's canonical text is stable under round-trip -- the
// property the spec runners assert for every canon row.
func TestConstraintLawConvergence(t *testing.T) {
	for _, a := range lawAtoms {
		for _, b := range lawAtoms {
			c1 := lawObs(fmt.Sprintf("x: %s & %s", a, b))
			if len(c1) > 4 && c1[:4] == "ERR:" {
				continue
			}
			if c2 := lawObs(c1); c2 != c1 {
				t.Errorf("convergence: %s & %s\n  c1: %s\n  c2: %s", a, b, c1, c2)
			}
		}
	}
}
