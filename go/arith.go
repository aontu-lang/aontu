/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
)

func divides(op string) bool {
	return "div" == op || "mod" == op || "rem" == op
}

func arith(ctx *Ctx, op string, node Val, a, b Val) Val {
	return arithNamed(ctx, op, op, node, a, b)
}

func arithNamed(ctx *Ctx, op, name string, node Val, a, b Val) Val {
	av, aok := unpref(a).(*ScalarVal)
	bv, bok := unpref(b).(*ScalarVal)

	if !aok || !bok || !arithKinds[av.kind] || !arithKinds[bv.kind] {
		return makeNilErrFull(ctx, "invalid-arg", node, nil, name, nil)
	}

	afloat := av.kind == KindFloat
	bfloat := bv.kind == KindFloat

	// A big leaf never silently becomes a binary float, in EITHER
	// operand order. The error names both leaves in operand order.
	if (afloat && isBigKind(bv.kind)) || (isBigKind(av.kind) && bfloat) {
		return makeNilErrFull(ctx, "exact_float_mix", node, nil, name,
			map[string]string{
				"left": av.kind.String(), "right": bv.kind.String()})
	}

	if afloat || bfloat {
		return floatArith(ctx, op, name, node,
			primFloat(av.peg), primFloat(bv.peg))
	}

	if av.kind == KindBigDecimal || bv.kind == KindBigDecimal {
		return decimalArith(ctx, op, name, node,
			scalarDecimal(av), scalarDecimal(bv))
	}

	return integerArith(ctx, op, name, node, scalarBigInt(av), scalarBigInt(bv),
		av.kind == KindBigInteger || bv.kind == KindBigInteger)
}

var arithKinds = map[Kind]bool{
	KindInteger:    true,
	KindFloat:      true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

func isBigKind(k Kind) bool {
	return k == KindBigInteger || k == KindBigDecimal
}

func floatArith(ctx *Ctx, op, name string, node Val, x, y float64) Val {
	if divides(op) && 0 == y {
		return makeNilErrFull(ctx, "divide_by_zero", node, nil, name, nil)
	}

	var out float64
	switch op {
	case "add":
		out = x + y
	case "sub":
		out = x - y
	case "mul":
		out = x * y
	case "div":
		out = x / y
	case "rem":
		// Truncated remainder, sign following the DIVIDEND, which is
		// what math.Mod gives (despite the name) and what JavaScript's
		// `%` gives.
		out = math.Mod(x, y)
	default:
		out = math.Mod(x, y)
		if 0 != out && (out < 0) != (y < 0) {
			out += y
		}
	}

	if math.IsInf(out, 0) || math.IsNaN(out) {
		return makeNilErrFull(ctx, "float_overflow", node, nil, name, nil)
	}
	return newFloat(out)
}

func integerArith(ctx *Ctx, op, name string, node Val, x, y *big.Int, big64 bool) Val {
	if divides(op) && 0 == y.Sign() {
		return makeNilErrFull(ctx, "divide_by_zero", node, nil, name, nil)
	}

	out := new(big.Int)
	switch op {
	case "add":
		out.Add(x, y)
	case "sub":
		out.Sub(x, y)
	case "mul":
		out.Mul(x, y)
	case "div":
		out.Quo(x, y)
	case "rem":
		out.Rem(x, y)
	default:
		out.Rem(x, y)
		if 0 != out.Sign() && (out.Sign() < 0) != (y.Sign() < 0) {
			out.Add(out, y)
		}
	}

	if big64 {
		// Unbounded and exact: nothing to check, and no demotion to
		// integer however small the result.
		return newBigInteger(out)
	}

	if !isIntegerStorable(out) {
		return makeNilErrFull(ctx, "inexact_integer_sum", node, nil, name,
			map[string]string{"sum": out.String()})
	}
	return newInteger(out.Int64())
}

// decimalArith is the decimal leaf. Addition, subtraction and
// multiplication are exact coefficient arithmetic and land here;
// division does not, and says so.
func decimalArith(ctx *Ctx, op, name string, node Val, x, y *Decimal) Val {
	if divides(op) {
		return makeNilErrFull(ctx, "inexact_divide", node, nil, name, nil)
	}

	var out *Decimal
	switch op {
	case "add":
		out = x.add(y)
	case "sub":
		out = x.add(y.neg())
	default:
		out = x.mul(y)
	}

	// The budget applies to RESULTS as well as literals: an exact answer
	// too wide to hold is refused, never rounded to fit.
	if out.overBudget() {
		return makeNilErrFull(ctx, "decimal_budget", node, nil, name, nil)
	}
	return newBigDecimal(out)
}
