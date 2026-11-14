/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strconv"
	"strings"
)

// roundHalfEven is the whole number nearest `c / 10 ^ drop`, a tie to
// the even one.
func roundHalfEven(c *big.Int, drop int) *big.Int {
	d := pow10(int64(drop))
	q, r := new(big.Int).QuoRem(c, d, new(big.Int))
	switch r.Lsh(r, 1).Cmp(d) {
	case -1:
		return q
	case 0:
		if 0 == q.Bit(0) {
			return q
		}
	}
	return q.Add(q, big.NewInt(1))
}

func roundDigits(c *big.Int, e int, n int64) (*big.Int, int) {
	mag := new(big.Int).Abs(c)
	digits := int64(len(mag.String()))
	if digits <= n {
		return c, e
	}
	drop := int(digits - n)
	r := roundHalfEven(mag, drop)
	if c.Sign() < 0 {
		r.Neg(r)
	}
	return r, e + drop
}

// significant reads a float as the decimal it shows and writes it as the
// double nearest the rounded one; held is false where there is none.
func significant(s *ScalarVal, n int64) (out any, held bool) {
	switch s.kind {
	case KindBigDecimal:
		d := s.peg.(*Decimal)
		c, e := roundDigits(d.coeff, -int(d.scale), n)
		return newDecimal(c, int32(-e)), true
	case KindBigInteger:
		c, e := roundDigits(s.peg.(*big.Int), 0, n)
		return new(big.Int).Mul(c, pow10(int64(e))), true
	case KindInteger:
		c, e := roundDigits(big.NewInt(s.peg.(int64)), 0, n)
		whole := new(big.Int).Mul(c, pow10(int64(e)))
		if whole.IsInt64() {
			return whole.Int64(), true
		}
		return whole, true
	}
	f := s.peg.(float64)
	mant := strconv.FormatFloat(f, 'e', -1, 64)
	i := strings.IndexByte(mant, 'e')
	digits := strings.Replace(strings.TrimPrefix(mant[:i], "-"), ".", "", 1)
	exp, _ := strconv.Atoi(mant[i+1:])
	c, _ := new(big.Int).SetString(digits, 10)
	if f < 0 {
		c.Neg(c)
	}
	r, e := roundDigits(c, exp-len(digits)+1, n)
	rounded, err := strconv.ParseFloat(r.String()+"e"+strconv.Itoa(e), 64)
	return rounded, nil == err
}
