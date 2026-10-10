/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu


import (
	"math"
	"math/big"
	"regexp"
	"strconv"
)

// scaled is a comparison-internal exact rational with a power-of-ten
// denominator: value = unscaled / 10^scale. inf marks the binary64
// infinities.
type scaled struct {
	inf      int // -1, 0, 1
	unscaled *big.Int
	scale    int
}

var oneBig = big.NewInt(1)
var five = big.NewInt(5)
var ten = big.NewInt(10)

// scaledOfFloat is the exact scaled-decimal value of a binary64.
func scaledOfFloat(f float64) scaled {
	if f == math.Trunc(f) && math.Abs(f) <= 1<<53 && !math.IsInf(f, 0) {
		return scaled{unscaled: big.NewInt(int64(f)), scale: 0}
	}
	if math.IsInf(f, 1) {
		return scaled{inf: 1, unscaled: big.NewInt(0)}
	}
	if math.IsInf(f, -1) {
		return scaled{inf: -1, unscaled: big.NewInt(0)}
	}

	bits := math.Float64bits(f)
	neg := bits>>63 == 1
	expBits := int((bits >> 52) & 0x7ff)
	frac := new(big.Int).SetUint64(bits & 0xfffffffffffff)

	var mant *big.Int
	var exp int
	if 0 == expBits {
		mant = frac
		exp = -1074
	} else {
		mant = frac.Or(frac, new(big.Int).Lsh(big.NewInt(1), 52))
		exp = expBits - 1075
	}

	var u *big.Int
	sc := 0
	if 0 <= exp {
		u = new(big.Int).Lsh(mant, uint(exp))
	} else {
		// mant * 2^-k == mant * 5^k / 10^k, exactly.
		u = new(big.Int).Mul(mant, new(big.Int).Exp(five, big.NewInt(int64(-exp)), nil))
		sc = -exp
	}
	if neg {
		u.Neg(u)
	}
	return scaled{unscaled: u, scale: sc}
}

// scaledOfNumeric is the exact scaled-decimal value of a numeric leaf.
func scaledOfNumeric(v *ScalarVal) scaled {
	switch v.kind {
	case KindBigInteger:
		return scaled{unscaled: new(big.Int).Set(v.peg.(*big.Int)), scale: 0}
	case KindBigDecimal:
		d := v.peg.(*Decimal)
		return scaled{unscaled: new(big.Int).Set(d.coeff), scale: int(d.scale)}
	case KindInteger:
		return scaled{unscaled: big.NewInt(v.peg.(int64)), scale: 0}
	}
	return scaledOfFloat(v.peg.(float64))
}

func pow10big(n int) *big.Int {
	return new(big.Int).Exp(ten, big.NewInt(int64(n)), nil)
}

func cmpScaled(a, b scaled) int {
	if 0 != a.inf || 0 != b.inf {
		if a.inf < b.inf {
			return -1
		}
		if a.inf > b.inf {
			return 1
		}
		return 0
	}
	au := a.unscaled
	bu := b.unscaled
	if a.scale < b.scale {
		au = new(big.Int).Mul(au, pow10big(b.scale-a.scale))
	} else if b.scale < a.scale {
		bu = new(big.Int).Mul(bu, pow10big(a.scale-b.scale))
	}
	return au.Cmp(bu)
}

func cmpNumeric(a, b *ScalarVal) int {
	return cmpScaled(scaledOfNumeric(a), scaledOfNumeric(b))
}

var shownNumberRe = regexp.MustCompile(`^(-?\d+)(?:\.(\d+))?(?:e([-+]\d+))?$`)

// scaledOfShown is the value a number shows: a binary float through its
// shortest round-trip rendering, which is what divisibility reads, since
// rounding moves a multiple off its divisor (0.3 is no multiple of 0.1 in
// binary).
func scaledOfShown(v *ScalarVal) scaled {
	if 1 != towerRank(v) {
		return scaledOfNumeric(v)
	}
	m := shownNumberRe.FindStringSubmatch(formatNumber(v.peg.(float64)))
	u, _ := new(big.Int).SetString(m[1]+m[2], 10)
	exp, _ := strconv.Atoi(m[3])
	sc := len(m[2]) - exp
	if sc < 0 {
		return scaled{unscaled: u.Mul(u, pow10big(-sc))}
	}
	return scaled{unscaled: u, scale: sc}
}

// scaledIsMultiple reports whether p is a whole multiple of d, both exact
// and finite.
func scaledIsMultiple(p, d scaled) bool {
	s := max(p.scale, d.scale)
	pu := new(big.Int).Mul(p.unscaled, pow10big(s-p.scale))
	du := new(big.Int).Mul(d.unscaled, pow10big(s-d.scale))
	return 0 == new(big.Int).Rem(pu, du).Sign()
}

func towerRank(v *ScalarVal) int {
	switch v.kind {
	case KindBigDecimal:
		return 3
	case KindBigInteger:
		return 2
	case KindInteger:
		return 0
	}
	return 1
}

// scaledIsIntegral reports whether a scaled value is an exact whole
// number.
func scaledIsIntegral(s scaled) bool {
	if 0 != s.inf {
		return false
	}
	if 0 == s.scale {
		return true
	}
	m := new(big.Int).Mod(s.unscaled, pow10big(s.scale))
	return 0 == m.Sign()
}

// scaledFloorBig is the exact floor of a finite scaled value.
func scaledFloorBig(s scaled) *big.Int {
	if 0 == s.scale {
		return new(big.Int).Set(s.unscaled)
	}
	q, m := new(big.Int).QuoRem(s.unscaled, pow10big(s.scale), new(big.Int))
	if s.unscaled.Sign() < 0 && 0 != m.Sign() {
		q.Sub(q, big.NewInt(1))
	}
	return q
}
