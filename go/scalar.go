/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"strconv"
	"strings"
)

type Kind int

const (
	KindTop Kind = iota
	KindNil
	KindString
	// KindNumber is the numeric supertype; it is never a ScalarVal kind.
	KindNumber
	// Numeric leaves. Keep contiguous, and extend numericLeafKinds when
	// adding one.
	KindInteger
	KindFloat
	KindBigInteger
	KindBigDecimal
	KindBoolean
	KindNull
	KindPath
)

func (k Kind) String() string {
	switch k {
	case KindString:
		return "string"
	case KindNumber:
		return "number"
	case KindInteger:
		return "integer"
	case KindFloat:
		return "float"
	case KindBigInteger:
		return "biginteger"
	case KindBigDecimal:
		return "bigdecimal"
	case KindBoolean:
		return "boolean"
	case KindNull:
		return "null"
	case KindPath:
		return "path"
	case KindNil:
		return "nil"
	}
	return "top"
}

var numericLeafKinds = map[Kind]bool{
	KindInteger:    true,
	KindFloat:      true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

func kindSubsumes(sup, sub Kind) bool {
	return (sup == KindNumber && numericLeafKinds[sub]) ||
		// A path IS a string with more structure (PATHS.0.md), so
		// string-typed schemas over address fields keep admitting.
		(sup == KindString && KindPath == sub)
}

func kindParent(k Kind) (Kind, bool) {
	if numericLeafKinds[k] {
		return KindNumber, true
	}
	if KindPath == k {
		return KindString, true
	}
	return KindTop, false
}

type ScalarVal struct {
	base
	kind Kind
	peg  any

	src string
}

func newScalar(kind Kind, peg any) *ScalarVal {
	v := &ScalarVal{kind: kind, peg: peg}
	v.dc = DONE
	v.site.sp = -1
	return v
}

func newString(s string) *ScalarVal { return newScalar(KindString, s) }

func newPath(s string) *ScalarVal   { return newScalar(KindPath, s) }
func newInteger(i int64) *ScalarVal { return newScalar(KindInteger, i) }
func newFloat(f float64) *ScalarVal { return newScalar(KindFloat, f) }

// newBigInteger takes ownership of n (callers pass a freshly built
// big.Int; the peg is never mutated afterwards).
func newBigInteger(n *big.Int) *ScalarVal { return newScalar(KindBigInteger, n) }

// newBigDecimal takes a Decimal already in normal form (newDecimal).
func newBigDecimal(d *Decimal) *ScalarVal { return newScalar(KindBigDecimal, d) }

func newBoolean(b bool) *ScalarVal { return newScalar(KindBoolean, b) }
func newNull() *ScalarVal          { return newScalar(KindNull, nil) }

func scalarPegSame(kind Kind, a, b any) bool {
	switch kind {
	case KindBigInteger:
		an, aok := a.(*big.Int)
		bn, bok := b.(*big.Int)
		return aok && bok && an.Cmp(bn) == 0
	case KindBigDecimal:
		ad, aok := a.(*Decimal)
		bd, bok := b.(*Decimal)
		return aok && bok && ad.equal(bd)
	}
	return a == b
}

func (s *ScalarVal) superior() Val {
	k := newScalarKind(s.kind)
	k.site.sp, k.site.spu, k.site.url = s.site.sp, s.site.spu, s.site.url
	k.site.src = s.site.src
	return k
}

func (s *ScalarVal) Canon() string {
	switch s.kind {
	case KindString:
		return jsonString(s.peg.(string))
	case KindInteger:
		return strconv.FormatInt(s.peg.(int64), 10)
	case KindFloat:
		return canonNumber(s.peg.(float64))
	case KindBigInteger:
		// Sign before the marker (`-0d5`): D3 rejects `0d-5`, so canon
		// must not emit it.
		return markExact(bigIntDigits(s.peg.(*big.Int)))
	case KindBigDecimal:
		// Always one decimal place at minimum, so canon reparses as a
		// bigdecimal and not as a biginteger (D4).
		return s.peg.(*Decimal).Canon()
	case KindBoolean:
		if s.peg.(bool) {
			return "true"
		}
		return "false"
	case KindNull:
		return "null"
	case KindPath:
		// The call form is the literal syntax for this kind, so canon
		// renders it back and reparses to the same VALUE.
		return "path(" + s.peg.(string) + ")"
	}
	return ""
}

func (s *ScalarVal) Gen(ctx *Ctx) (any, error) {
	if s.kind == KindFloat {
		if f, ok := s.peg.(float64); ok && f == 0 {
			return float64(0), nil
		}
	}
	if s.kind == KindBigInteger {
		return new(big.Int).Set(s.peg.(*big.Int)), nil
	}
	return s.peg, nil
}

func (s *ScalarVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return s
	}
	if sk, ok := peer.(*ScalarKindVal); ok {
		return sk.Unify(s, ctx)
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		// The constraint algebra owns membership (constraint.go admit).
		return pc.Unify(s, ctx)
	}
	if ps, ok := peer.(*ScalarVal); ok {
		if KindPath == s.kind && KindPath == ps.kind {
			merged, mok := prefixMeet(s.peg.(string), ps.peg.(string))
			if !mok {
				return makeNilErr(ctx, "scalar_value", s, peer)
			}
			out, other := s, ps
			if merged != s.peg.(string) {
				out, other = ps, s
			}
			if other.mtype {
				out.mtype = true
			}
			if other.mhide {
				out.mhide = true
			}
			return out
		}
		// Identity is kind AND value (D2). scalarPegSame, not `==`: the
		// exact leaves hold pointers, and `==` would compare addresses.
		if ps.kind == s.kind && scalarPegSame(s.kind, ps.peg, s.peg) {
			if ps.mtype {
				s.mtype = true
			}
			if ps.mhide {
				s.mhide = true
			}
			return s
		}
		code := "scalar_kind"
		if ps.kind == s.kind {
			code = "scalar_value"
		}
		return makeNilErr(ctx, code, s, peer)
	}
	return makeNilErr(ctx, "scalar_kind", s, peer)
}

// ScalarKindVal is a type constraint (e.g. string, number) — a scalar
// kind without a concrete value.
type ScalarKindVal struct {
	base
	kind Kind
}

func newScalarKind(k Kind) *ScalarKindVal {
	v := &ScalarKindVal{kind: k}
	v.site.sp = unsited
	v.dc = DONE
	return v
}

func (k *ScalarKindVal) superior() Val { return top() } //coverage:ignore no caller: superOf answers for a kind peg (ADR-011 R4)
func (k *ScalarKindVal) Canon() string {
	// The path kind renders as the vacuous call (PATHS.0.md): the
	// bare word `path` is an ordinary string, not a keyword.
	if KindPath == k.kind {
		return "path()"
	}
	return k.kind.String()
}

func (k *ScalarKindVal) Gen(ctx *Ctx) (any, error) {
	return nil, residueErr(ctx, k, "no_gen")
}

func (k *ScalarKindVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return k
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		return pc.Unify(k, ctx)
	}
	if ps, ok := peer.(*ScalarVal); ok {
		// A kind admits a concrete value of that kind, and a supertype
		// admits a value of any kind below it (`number & 1.5` is 1.5).
		if ps.kind == k.kind || kindSubsumes(k.kind, ps.kind) {
			return ps
		}
		return makeNilErr(ctx, "no_scalar_unify", k, peer)
	}
	if pk, ok := peer.(*ScalarKindVal); ok {
		if k.kind == pk.kind {
			return k
		}
		if kindSubsumes(k.kind, pk.kind) {
			return pk
		}
		if kindSubsumes(pk.kind, k.kind) {
			return k
		}
		return makeNilErr(ctx, "scalar-type", k, peer)
	}
	return makeNilErr(ctx, "not-scalar-type", k, peer)
}

// jsonString renders a Go string as a JSON string literal, matching
// JavaScript's JSON.stringify for the cases used by the spec.
func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			// Other control characters become \u00XX, matching
			// JavaScript's JSON.stringify.
			if r < 0x20 {
				const hexd = "0123456789abcdef"
				b.WriteString(`\u00`)
				b.WriteByte(hexd[(r>>4)&0xf])
				b.WriteByte(hexd[r&0xf])
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func formatNumber(f float64) string {
	// Both zeros render as "0" — negative zero never survives into
	// output. (JS agrees: String(-0) is "0".)
	if f == 0 {
		return "0"
	}
	// Non-finite values render as JS Number.toString does; they cannot
	// arrive via the parser (an overflowing literal becomes not_number)
	// but are reachable through the exported NewNumber constructor.
	if math.IsNaN(f) {
		return "NaN"
	}
	if math.IsInf(f, 1) {
		return "Infinity"
	}
	if math.IsInf(f, -1) {
		return "-Infinity"
	}
	mant := strconv.FormatFloat(f, 'e', -1, 64)
	i := strings.IndexByte(mant, 'e')
	digits := mant[:i]
	exp, _ := strconv.Atoi(mant[i+1:])
	if exp >= -6 && exp <= 20 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	sign := "+"
	if exp < 0 {
		sign = "-"
		exp = -exp
	}
	return digits + "e" + sign + strconv.Itoa(exp)
}

func canonNumber(f float64) string {
	s := formatNumber(f)
	// '.' fraction, 'e'/'E' exponent, 'N' NaN, 'I' Infinity.
	if strings.ContainsAny(s, ".eENI") {
		return s
	}
	return s + ".0"
}
