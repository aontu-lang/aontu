/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

// exactNumber is a JSON number read by its VALUE and placed in the leaf
// that value selects (G12): integral in the integer leaf where it holds
// it exactly, biginteger beyond, bigdecimal otherwise. The exactness
// budget bounds the exponent too, so no literal demands unbounded digits.
type exactNumber struct {
	leaf string // integer, biginteger, bigdecimal or error
	i    int64
	big  *big.Int
	dec  *Decimal
	code string
}

var jsonNumberRe = regexp.MustCompile(
	`^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$`)

var exactBudget = big.NewInt(4096)

var int64Limit = new(big.Int).Lsh(big.NewInt(1), 63)

// The integer leaf by MAGNITUDE, so that a sign, which aontu writes as an
// operator, never moves a value between leaves: -2^63 is a biginteger,
// because 2^63 is one.
func inIntegerLeaf(n *big.Int) bool {
	mag := new(big.Int).Abs(n)
	return mag.Cmp(int64Limit) < 0 && isExactInBinary64(mag)
}

func readExactNumber(src string) (exactNumber, bool) {
	m := jsonNumberRe.FindStringSubmatch(src)
	if nil == m {
		return exactNumber{}, false
	}
	frac := m[3]
	unscaled, _ := new(big.Int).SetString(m[2]+frac, 10)
	exp := big.NewInt(0)
	if "" != m[4] {
		exp.SetString(strings.TrimPrefix(m[4], "+"), 10)
	}
	scale := new(big.Int).Sub(big.NewInt(int64(len(frac))), exp)
	if 0 == unscaled.Sign() {
		return exactNumber{leaf: "integer"}, true
	}
	ten := big.NewInt(10)
	q, r := new(big.Int), new(big.Int)
	for 0 < scale.Sign() {
		q.QuoRem(unscaled, ten, r)
		if 0 != r.Sign() {
			break
		}
		unscaled.Set(q)
		scale.Sub(scale, big.NewInt(1))
	}
	neg := "-" == m[1]
	if scale.Sign() <= 0 {
		up := new(big.Int).Neg(scale)
		if exactBudget.Cmp(up) < 0 {
			return exactNumber{leaf: "error", code: "decimal_budget"}, true
		}
		whole := new(big.Int).Mul(unscaled, new(big.Int).Exp(ten, up, nil))
		if neg {
			whole.Neg(whole)
		}
		if inIntegerLeaf(whole) {
			return exactNumber{leaf: "integer", i: whole.Int64()}, true
		}
		return exactNumber{leaf: "biginteger", big: whole}, true
	}
	if exactBudget.Cmp(scale) < 0 ||
		exactBudget.Cmp(big.NewInt(int64(len(unscaled.String())))) < 0 {
		return exactNumber{leaf: "error", code: "decimal_budget"}, true
	}
	if neg {
		unscaled.Neg(unscaled)
	}
	return exactNumber{leaf: "bigdecimal",
		dec: newDecimal(unscaled, int32(scale.Int64()))}, true
}

// exactNumberText is the aontu literal for an exact number: plain digits
// in the integer leaf, `0d` digits beyond, and a `0d` decimal with its
// point for the rest, the sign in front of the marker.
func exactNumberText(n exactNumber) (string, bool) {
	switch n.leaf {
	case "integer":
		return strconv.FormatInt(n.i, 10), true
	case "biginteger":
		return markExact(n.big.String()), true
	case "bigdecimal":
		return n.dec.Canon(), true
	}
	return "", false
}

// exactNumberVal is a data number under ExactNumbers, in its leaf.
func exactNumberVal(n exactNumber, src string, sp int) Val {
	var v *ScalarVal
	switch n.leaf {
	case "integer":
		v = newInteger(n.i)
	case "biginteger":
		v = newBigInteger(n.big)
	case "bigdecimal":
		v = newBigDecimal(n.dec)
	default:
		e := newNil(n.code)
		e.site.sp = sp
		return e
	}
	v.site.sp = sp
	v.src = src
	return v
}
