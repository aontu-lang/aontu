/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
)

// THE ARITHMETIC FAMILY — add, sub, mul, div, mod, rem (the Go side of
// ts/src/val/arith.ts).
//
// The review's finding I: "Arithmetic stops at `+`", so "prod gets
// double the replicas" is inexpressible and Kubernetes quantity strings
// silently CONCATENATE ("500m" + "500m" is "500m500m"). The design
// pre-registered the semantics these functions must have
// (docs/capability-review/g8-generation.md, "Arithmetic semantics,
// pre-registered") and the boundary that keeps `-` `*` `/` `%`
// reserved: maths arrives as functions or not at all.
//
// THE FAMILY IS NUMERIC, WHICH IS WHAT MAKES add MORE THAN A SYNONYM FOR
// `+`. The operator is polymorphic — concatenation for strings,
// disjunction for booleans, addition for numbers — and that is why the
// quantity strings above concatenate instead of failing. add("500m",
// "500m") is a located error, because a function named for a numeric
// operation has no business inventing a string. So the two spellings
// mean different things, and both are kept.
//
// Everything else is the number tower's existing law (D6, R5) applied to
// five more operations, plus the three refusals the pre-registration
// named: a zero divisor in any leaf, a non-finite binary64 result, and
// division over the decimal leaf — see the TypeScript twin's header for
// the full statement of each.

// divides reports the three operations that can be handed a zero divisor
// and cannot answer over the decimal leaf.
func divides(op string) bool {
	return "div" == op || "mod" == op || "rem" == op
}

// arith is the whole family, in one function, because every rule it
// obeys is a rule about ARITHMETIC and not about any one operation.
// node is the value the error is located at — the call, or the `+` op.
func arith(ctx *Ctx, op string, node Val, a, b Val) Val {
	return arithNamed(ctx, op, op, node, a, b)
}

// arithNamed is arith with the ERROR's name separated from the
// operation's, which is the operation except when a fold borrows one:
// sum adds, but a bad member is the author's sum call and must say so.
func arithNamed(ctx *Ctx, op, name string, node Val, a, b Val) Val {
	av, aok := unpref(a).(*ScalarVal)
	bv, bok := unpref(b).(*ScalarVal)

	// A non-numeric operand is not something to wait for: resolve is
	// only reached once every argument has settled, so a kind, a map, a
	// string or a boolean here is the author's mistake and is named as
	// one. (`+` differs, and must: it has answers for strings and
	// booleans.)
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
		// R5 contagion: a float operand makes the result a float, and
		// the integer operand it is mixed with converts to one. Only
		// integer and float reach here — the big leaves left above —
		// which is exactly primFloat's domain.
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

// arithKinds is the numeric leaves the family accepts. Strings and
// booleans are deliberately absent: they are `+`'s business.
var arithKinds = map[Kind]bool{
	KindInteger:    true,
	KindFloat:      true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

func isBigKind(k Kind) bool {
	return k == KindBigInteger || k == KindBigDecimal
}

// floatArith is IEEE-754 binary64, with the JSON-superset constraint
// still biting: an infinite or NaN result is a located error rather than
// a value, because there is no way to write one down and no JSON that
// could carry it.
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
		// The floored modulus, sign following the DIVISOR, built from
		// the truncated one: adding the divisor back moves a remainder
		// whose sign disagrees into agreement, and leaves an exact zero
		// alone.
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

// integerArith is the exact integral leaves. Both compute in big.Int, so
// nothing passes through binary64 and nothing rounds; only the storage
// test at the end differs, because biginteger is unbounded and integer
// is not.
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
		// TRUNCATION TOWARD ZERO, stated once rather than left to
		// whichever host `/` each port happens to call: div(-7, 2) is
		// -3, not -4. Quo truncates; Div FLOORS, which is why this must
		// not use it, and why TypeScript's BigInt `/` (which truncates)
		// is the matching operation there.
		out.Quo(x, y)
	case "rem":
		// Rem is the truncated remainder, sign following the dividend —
		// the partner of Quo. (Mod is the Euclidean one, always
		// non-negative, and is neither of the two this family offers.)
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

	// The result faces the SAME storage contract R1 puts on a literal —
	// integral, inside the int64 window, and exactly representable in
	// binary64 — because Go's int64 holds results TypeScript's double
	// cannot, and without a shared test a document would resolve in one
	// port and round in the other.
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
		// EXACT DECIMAL DIVISION IS NOT CLOSED: one third has no finite
		// decimal form, so a div over this leaf either rounds — the one
		// thing the leaf exists to refuse — or refuses. It refuses, and
		// the hint names both ways out.
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
