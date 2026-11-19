/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strings"
)

type Decimal struct {
	coeff *big.Int
	scale int32
}

const (
	decimalMaxCoeffDigits = 4096
	decimalMaxScale       = 4096
)

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

	if scale < 1 {
		c.Mul(c, new(big.Int).Exp(ten, big.NewInt(int64(1-scale)), nil))
		scale = 1
	}

	return &Decimal{coeff: c, scale: scale}
}

func (d *Decimal) neg() *Decimal {
	if d.coeff.Sign() == 0 {
		return d
	}
	return &Decimal{coeff: new(big.Int).Neg(d.coeff), scale: d.scale}
}

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

func (d *Decimal) mul(o *Decimal) *Decimal {
	return newDecimal(new(big.Int).Mul(d.coeff, o.coeff),
		d.scale+o.scale)
}

func (d *Decimal) ceilFloor(up bool) *Decimal {
	// The normal form guarantees scale >= 1, so the divisor is >= 10.
	q, r := new(big.Int), new(big.Int)
	q.QuoRem(d.coeff, pow10(int64(d.scale)), r)
	switch {
	case up && r.Sign() > 0:
		q.Add(q, big.NewInt(1))
	case !up && r.Sign() < 0:
		q.Sub(q, big.NewInt(1))
	}
	return newDecimal(q, 0)
}

func (d *Decimal) overBudget() bool {
	if decimalMaxScale < d.scale || d.scale < -decimalMaxScale {
		return true
	}
	return decimalMaxCoeffDigits < len(new(big.Int).Abs(d.coeff).String())
}

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

func (d *Decimal) MarshalJSON() ([]byte, error) { return []byte(d.digits()), nil }

// Canon renders the decimal as an Aontu literal: the sign BEFORE the
// marker (`-0d1.5`), plain form at every magnitude (D4).
func (d *Decimal) Canon() string { return markExact(d.digits()) }

func markExact(digits string) string {
	if strings.HasPrefix(digits, "-") {
		return "-0d" + digits[1:]
	}
	return "0d" + digits
}

// bigIntDigits renders a biginteger peg as plain digits (no marker).
func bigIntDigits(n *big.Int) string { return n.String() }
