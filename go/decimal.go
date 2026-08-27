/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strings"
)

// The exact base-10 decimal leaf of the number tower
// (docs/design/number-tower.md, D8). No dependency: apd exists to ROUND
// and this language never rounds, so a coefficient plus a scale — with
// exact comparison, rendering and arithmetic — is the whole of it.
//
// D6's arithmetic is EXACT-ALWAYS: add aligns scales and adds
// coefficients, ceil/floor are coefficient division. There is no
// rounding mode and no precision context anywhere in this file, which is
// exactly why the budget below has to be a refusal — at the limit, an
// engine that cannot round has nothing to fall back on.

// Decimal is an exact base-10 decimal value: coeff * 10^-scale.
//
// It is IMMUTABLE, like every pointer peg in the engine (D8): clones
// share it and nothing mutates it in place. Every Decimal reaching a
// ScalarVal is in NORMAL FORM (see newDecimal), which is what makes
// identity a matter of comparing the two fields.
type Decimal struct {
	coeff *big.Int
	scale int32
}

// D6's exactness budget, enforced at parse (exactDecimal) and on every
// computed RESULT (overBudget). Both halves are load-bearing:
//
//   - coefficient digits bound the size of the exact integer we hold;
//   - the ABSOLUTE scale bounds what plain-form rendering has to
//     materialise, and it is the only one that catches `0d1e1000000000`,
//     whose coefficient is a single digit but whose plain form is a
//     gigabyte of zeros (and whose scale overflows an int32 field).
//
// Both bounds are spec-pinned constants, identical in both ports, so the
// refusal is deterministic rather than machine-dependent.
const (
	decimalMaxCoeffDigits = 4096
	decimalMaxScale       = 4096
)

// newDecimal builds a Decimal in NORMAL FORM from a raw coefficient and
// scale (D4: one value, one rendering).
//
// The normal form is:
//
//	scale >= 1 always — an INTEGRAL bigdecimal keeps exactly one
//	decimal place, because `0d` names the family and not the leaf, so
//	canon(0d1e3) must be `0d1000.0`: `0d1000` would reparse as a
//	BIGINTEGER and canon would flip the kind (the R4 device, one level
//	down);
//
//	no trailing zero above that — `0d0.10`, `0d0.1` and `0d1e-1` are the
//	same value, canon `0d0.1`, so scale is presentation and not identity;
//
//	zero is +0 at scale 1 — D5: negative zero never survives (`big.Int`
//	has no negative zero, so this falls out).
//
// The caller's big.Int is never retained or mutated.
func newDecimal(coeff *big.Int, scale int32) *Decimal {
	c := new(big.Int).Set(coeff)

	if c.Sign() == 0 {
		return &Decimal{coeff: c, scale: 1}
	}

	// Strip trailing zeros, but never below one decimal place.
	ten := big.NewInt(10)
	q, m := new(big.Int), new(big.Int)
	for scale > 1 {
		q.QuoRem(c, ten, m)
		if m.Sign() != 0 {
			break
		}
		c.Set(q)
		scale--
	}

	// A scale below one decimal place (an exponent that outran the
	// fraction) is folded into the coefficient rather than kept as a
	// negative scale, so the normal form has a single spelling.
	if scale < 1 {
		c.Mul(c, new(big.Int).Exp(ten, big.NewInt(int64(1-scale)), nil))
		scale = 1
	}

	return &Decimal{coeff: c, scale: scale}
}

// neg returns the exact negation. Zero negates to itself, so `-0d0.0` is
// `0d0.0` (D5).
func (d *Decimal) neg() *Decimal {
	if d.coeff.Sign() == 0 {
		return d
	}
	// Negation cannot change the normal form (it neither adds nor
	// removes trailing zeros), so the fields carry over directly.
	return &Decimal{coeff: new(big.Int).Neg(d.coeff), scale: d.scale}
}

// add returns the EXACT sum: align the two scales, add the coefficients,
// renormalise (D6). No rounding mode, no precision context, no float64 —
// `0d0.1 + 0d0.2` is `0d0.3` and not 0.30000000000000004, which is the
// whole reason the exact leaves exist.
//
// The result may still be over the exactness budget (scale alignment can
// inflate a coefficient), so callers must ask overBudget before handing
// the sum to a value: the budget bounds results as well as literals.
func (d *Decimal) add(o *Decimal) *Decimal {
	a, b := d.coeff, o.coeff
	scale := d.scale
	switch {
	case d.scale < o.scale:
		a = shiftUp(a, int64(o.scale)-int64(d.scale))
		scale = o.scale
	case o.scale < d.scale:
		b = shiftUp(b, int64(d.scale)-int64(o.scale))
	}
	return newDecimal(new(big.Int).Add(a, b), scale)
}

// D6 — EXACT MULTIPLICATION. Multiply the coefficients, ADD the scales:
// (a/10^s)(b/10^t) is ab/10^(s+t), with no alignment step and no
// rounding mode, exactly as add has none.
//
// The result leaves the budget far more readily than a sum does — scales
// add rather than taking the maximum, and coefficient digits add too —
// so squaring a value at half the budget is already over it. Callers
// must ask overBudget for the same reason add's must: at the limit,
// refusing is the only answer that is not a rounded one.
func (d *Decimal) mul(o *Decimal) *Decimal {
	return newDecimal(new(big.Int).Mul(d.coeff, o.coeff),
		d.scale+o.scale)
}

// ceilFloor returns the exact ceiling (up) or floor of the decimal, as a
// decimal — upper()/lower() keep the ARGUMENT's kind (R5), so the result
// is still a bigdecimal and still renders its single decimal place:
// upper(0d1.1) is `0d2.0`.
//
// It is coefficient arithmetic, with no float64 anywhere near it: a
// binary64 round trip would defeat the leaf on exactly the values it
// exists for.
func (d *Decimal) ceilFloor(up bool) *Decimal {
	// The normal form guarantees scale >= 1, so the divisor is >= 10.
	q, r := new(big.Int), new(big.Int)
	q.QuoRem(d.coeff, pow10(int64(d.scale)), r)
	// QuoRem truncates TOWARD ZERO and gives the remainder the dividend's
	// sign, so truncation is already the floor for a positive value and
	// already the ceiling for a negative one: only the other direction
	// needs the step.
	switch {
	case up && r.Sign() > 0:
		q.Add(q, big.NewInt(1))
	case !up && r.Sign() < 0:
		q.Sub(q, big.NewInt(1))
	}
	// Scale 0 is not a normal form: newDecimal folds it back to the one
	// decimal place the leaf marker requires.
	return newDecimal(q, 0)
}

// overBudget reports whether a COMPUTED decimal is outside D6's exactness
// budget. The budget applies to results exactly as it applies to
// literals: an exact result over either bound is refused, never rounded
// and never quietly expanded.
//
// Both halves are checked on the NORMAL form, which is the form that has
// to be rendered. Addition never raises the scale above the wider
// operand's, so in practice it is the coefficient half that fires — for
// instance on the scale-alignment blow-up `0d1e-4096 + 0d1e4096`.
func (d *Decimal) overBudget() bool {
	if decimalMaxScale < d.scale || d.scale < -decimalMaxScale {
		return true
	}
	return decimalMaxCoeffDigits < len(new(big.Int).Abs(d.coeff).String())
}

// cmp compares two decimals numerically: -1, 0 or +1. Scales are aligned
// first, so the comparison is about the NUMBER and never about the
// pointer holding it (D2) — even for decimals built outside the parser's
// normal form.
func (d *Decimal) cmp(o *Decimal) int {
	if d.scale == o.scale {
		return d.coeff.Cmp(o.coeff)
	}
	a, b := d.coeff, o.coeff
	if d.scale < o.scale {
		a = shiftUp(a, int64(o.scale)-int64(d.scale))
	} else {
		b = shiftUp(b, int64(d.scale)-int64(o.scale))
	}
	return a.Cmp(b)
}

// equal reports exact numeric equality.
func (d *Decimal) equal(o *Decimal) bool { return d.cmp(o) == 0 }

// shiftUp returns n * 10^by (by >= 0), leaving n untouched.
func shiftUp(n *big.Int, by int64) *big.Int {
	return new(big.Int).Mul(n, pow10(by))
}

// pow10 returns 10^n as an exact integer (n >= 0).
func pow10(n int64) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(n), nil)
}

// digits renders the decimal in PLAIN form at every magnitude — never
// scientific — with a leading '-' for a negative value and no `0d`
// marker. This is the digits-only rendering (D6's string-concatenation
// form); Canon adds the marker.
func (d *Decimal) digits() string {
	ds := new(big.Int).Abs(d.coeff).String()
	sc := int(d.scale)
	// The normal form guarantees sc >= 1; pad so there is always at
	// least one digit before the point ("0.1", not ".1").
	if len(ds) <= sc {
		ds = strings.Repeat("0", sc-len(ds)+1) + ds
	}
	out := ds[:len(ds)-sc] + "." + ds[len(ds)-sc:]
	if d.coeff.Sign() < 0 {
		out = "-" + out
	}
	return out
}

// String renders the decimal as its plain digits (no `0d` marker), so a
// Decimal formats readably in Go error and debug output.
func (d *Decimal) String() string { return d.digits() }

// MarshalJSON emits the exact digits as a raw JSON number. JSON numbers
// are arbitrary-precision text, so nothing is lost.
//
// This is the counterpart of what encoding/json ALREADY does for the
// biginteger leaf's *big.Int peg, and it is here for the same reason:
// without it a generated bigdecimal marshals through the struct path as
// `{}` — a silent corruption, and the one failure mode the exact leaves
// exist to eliminate. The wider generate contract (D9: native runtime
// types, the TypeScript exact emitter, and the API tests pinning both)
// is Phase 5's, and may revisit this.
func (d *Decimal) MarshalJSON() ([]byte, error) { return []byte(d.digits()), nil }

// Canon renders the decimal as an Aontu literal: the sign BEFORE the
// marker (`-0d1.5`), plain form at every magnitude (D4).
func (d *Decimal) Canon() string { return markExact(d.digits()) }

// markExact turns a plain digit rendering into a `0d` literal, moving
// any sign in front of the marker: `-1.5` -> `-0d1.5`. The sign belongs
// before the prefix (D3 rejects `0d-5`), and canon must round-trip.
func markExact(digits string) string {
	if strings.HasPrefix(digits, "-") {
		return "-0d" + digits[1:]
	}
	return "0d" + digits
}

// bigIntDigits renders a biginteger peg as plain digits (no marker).
func bigIntDigits(n *big.Int) string { return n.String() }
