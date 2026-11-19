/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"regexp"
	"sort"
)

// NewString returns a string scalar value.
func NewString(s string) Val { return newString(s) }

func NewInteger(i int64) Val {
	if !isExactInBinary64(big.NewInt(i)) {
		return newNil("lossy_integer_literal")
	}
	return newInteger(i)
}

func NewNumber(f float64) Val { return newFloat(f) }

func NewBigInteger(n *big.Int) Val {
	c := new(big.Int)
	if n != nil {
		c.Set(n)
	}
	return newBigInteger(c)
}

var bigDecimalTextRe = regexp.MustCompile(
	`^([-+]?)(?:0[dD])?([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$`)

func NewBigDecimal(s string) (Val, error) {
	m := bigDecimalTextRe.FindStringSubmatch(s)
	if m == nil {
		return nil, &AontuError{Msg: "Not an exact decimal: " + s, Code: "decimal_syntax"}
	}
	d, why := exactDecimal(m[1] == "-", m[2], m[3], m[4])
	if why != "" {
		return nil, &AontuError{Msg: "Not an exact decimal: " + s + "\n" + hints[why], Code: why}
	}
	return newBigDecimal(d), nil
}

func NewBoolean(b bool) Val { return newBoolean(b) }

// NewNull returns a null scalar value.
func NewNull() Val { return newNull() }

func NewScalarKind(k Kind) Val { return newScalarKind(k) }

// NewMap returns a map value built from fields. Keys are inserted in
// sorted order so canonical output is deterministic (Go map iteration
// order is otherwise unspecified). A nil or empty map yields an empty
// map value.
func NewMap(fields map[string]Val) Val {
	m := newMap()
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		m.set(k, fields[k])
	}
	return m
}

// NewList returns a list value from the given elements.
func NewList(elems []Val) Val { return newList(elems) }
