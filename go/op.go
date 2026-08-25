/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"strconv"
)

// PlusOpVal is the `+` operator: string concatenation, numeric addition
// or boolean or. Ported from ts/src/val/PlusOpVal.ts and OpBaseVal.ts.
// Operands are resolved to done before the operation runs; an operation
// that cannot yet run defers across fixpoint passes.
type PlusOpVal struct {
	base
	peg []Val
}

func newPlusOp(a, b Val) *PlusOpVal {
	o := &PlusOpVal{peg: []Val{a, b}}
	o.sp = unsited
	return o
}

func (o *PlusOpVal) superior() Val { return top() }

func (o *PlusOpVal) Canon() string {
	return o.peg[0].Canon() + "+" + o.peg[1].Canon()
}

func (o *PlusOpVal) Gen(ctx *Ctx) (any, error) {
	// `op`, not `no_gen`, and rendered as a full located message: TS's
	// OpBaseVal.gen raises makeNilErr(ctx, 'op', this) and descErr renders
	// it. Only the ROOT position reaches here -- inside a map the bag
	// reports the residue first, and `a:{b:1+true}` already agreed on
	// mapval_no_gen -- so the divergence was invisible until a residual
	// op was the whole document (issue #38).
	return nil, residueErr(ctx, o, "op")
}

func (o *PlusOpVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil {
		peer = top()
	}
	if Val(o) == peer {
		return o
	}

	// Operands are driven at the op's own location (TS drives them with
	// the same undescended ctx; the slot hint is single-use per unite).
	slot := ctx.slot

	// THE PLACEHOLDER (G8 phase 3, see place.go), on the operator side:
	// `x: {&: {m: _ + 2}}` meeting `1` is `3`. Same rule as FuncVal's --
	// the peer fills the hole and the operation is what answers.
	if !isTop(peer) && !peer.Nil() && hasPlace(o) {
		if hasPlace(peer) {
			return makeNilErr(ctx, "place_pair", o, peer)
		}
		ctx.slot = slot
		return unite(ctx, fillPlace(o, peer), top())
	}

	// Resolve operands into a scratch slice WITHOUT writing them back:
	// a stuck op keeps its original operands (`$flag+[...]` renders the
	// unresolved $flag), matching TS OpBaseVal.unify, which also only
	// passes the resolved args to operate().
	var out Val = o
	pegdone := true
	newpeg := make([]Val, len(o.peg))
	for i, arg := range o.peg {
		if arg.Dc() != DONE {
			ctx.slot = slot
			arg = unite(ctx, arg, top())
		}
		newpeg[i] = arg
		if arg.Dc() != DONE {
			pegdone = false
		}
	}

	if pegdone {
		result := o.operate(ctx, newpeg)
		if result == nil {
			switch {
			case isTop(peer):
				out = o
			case peer.Nil():
				out = makeNilErr(ctx, "op", o, peer)
			case o.Canon() == peer.Canon():
				out = o
			default:
				out = newConjunct([]Val{o, peer})
			}
		} else {
			out = unite(ctx, result, peer)
		}
	} else if isTop(peer) {
		// Rebuild with the resolved-so-far operands (mirrors the
		// `out = this.make(ctx, { peg: newpeg })` not-pegdone branch in
		// TS OpBaseVal.unify) so canon shows partial arg resolution.
		np := newPlusOp(newpeg[0], newpeg[1])
		np.path = cp(o.path)
		np.sp = o.sp
		out = np
	} else if peer.Nil() {
		out = peer
	} else {
		out = newConjunct([]Val{o, peer})
	}

	if out.Dc() != DONE {
		out.setDc(o.dc + 1)
	}
	return out
}

// operate computes the result once both operands are concrete. Only
// concrete scalar operands are valid (mirrors PlusOpVal.operate in TS):
// kinds, maps, lists, null, top and funcs do not coerce — the op stays
// unresolved and generate() reports it.
//
// It dispatches on the operand KINDS, not on their native values: that
// is what R5 kind contagion needs (the result kind follows the operands,
// so 1.5+1.5 is not an integer) and what D6's exact ladder needs (an
// exact operand must never reach a float64).
func (o *PlusOpVal) operate(ctx *Ctx, args []Val) Val {
	// A pref operand contributes its preferred value, and therefore that
	// value's kind too.
	av := unpref(args[0])
	bv := unpref(args[1])

	// The tower's exact leaves take their own path (D6): the exact
	// ladder, the refusal to mix with a binary float, and marker-free
	// string concatenation are all decided by kind, and none of them may
	// pass through binary64.
	if isExactScalar(av) || isExactScalar(bv) {
		return exactPlus(ctx, o, av, bv)
	}

	a := primatize(av)
	b := primatize(bv)
	if a == nil || b == nil {
		return nil
	}

	ab, abool := a.(bool)
	bb, bbool := b.(bool)
	_, astr := a.(string)
	_, bstr := b.(string)

	var peg any
	switch {
	case abool && bbool:
		peg = ab || bb
	case astr || bstr:
		peg = primStr(a) + primStr(b)
	case abool || bbool:
		// boolean mixed with a number does not coerce (no 0/1).
		return nil
	case isIntegerScalar(av) && isIntegerScalar(bv):
		// integer + integer is computed EXACTLY, in int64 (D6).
		return integerPlus(ctx, o, av, bv)
	default:
		peg = plusAdd(a, b)
	}

	switch p := peg.(type) {
	case string:
		return newString(p)
	case bool:
		return newBoolean(p)
	case float64:
		// Kind contagion: `+` must not introduce a kind narrower than
		// its operands, and deriving the kind from the result value
		// alone would make 1.5+1.5 an integer. The integer+integer case
		// is the one that can yield an integer, and it left above, so
		// every sum arriving here has a float operand and is a FLOAT —
		// never the `number` supertype, which no concrete value carries.
		return newFloat(p)
	}
	return nil //coverage:ignore peg is always string, bool or float64
}

// integerPlus is integer + integer, computed EXACTLY (D6).
//
// Both ports used to add through binary64 and re-tag the result, which
// silently ROUNDS sums of exact operands: 4503599627370496 +
// 4503599627370497 came out as …992 rather than …993. The sum is
// computed with a checked int64 add here (a bigint in TypeScript) and
// must then satisfy the SAME storage contract R1 puts on a literal —
// integral, inside the int64 window, AND exactly representable in
// binary64.
//
// That last clause is what keeps the two ports together: Go's int64
// holds sums TypeScript's double cannot, so without a shared storage
// test a document would resolve here and round (or error) there. Both
// refuse, and the hint names the `0d` spelling that computes it exactly.
func integerPlus(ctx *Ctx, o Val, av, bv Val) Val {
	x := av.(*ScalarVal).peg.(int64)
	y := bv.(*ScalarVal).peg.(int64)
	// The exact sum, computed in big.Int for the {sum} hint detail (a
	// bigint in TS) — the int64 fast path below still decides storability.
	exact := new(big.Int).Add(big.NewInt(x), big.NewInt(y))
	sum := x + y

	// The error mirrors TS: the OP is the single operand of an `add`
	// attempt, and the hint names the exact sum ({sum}).
	inexact := func() Val {
		return makeNilErrFull(ctx, "inexact_integer_sum", o, nil, "add",
			map[string]string{"sum": exact.String()})
	}

	// Checked add: Go's int64 addition WRAPS, and a wrap is exactly a
	// sum whose sign disagrees with two same-signed operands.
	if (0 < x && 0 < y && sum < 0) || (x < 0 && y < 0 && 0 <= sum) {
		return inexact()
	}

	// R1's storage test, applied to the result — reaching the SAME
	// exactness predicate D7's lossy-literal refusal asks of a literal
	// (isExactInBinary64, inside isIntegerStorable), so a literal and a
	// computed sum cannot disagree about what "exact" means.
	if !isIntegerStorable(big.NewInt(sum)) {
		return inexact()
	}
	return newInteger(sum)
}

// exactPlus is `+` where at least one operand is an exact leaf (D6).
//
// Nothing here goes through float64. The exact ladder is
// integer < biginteger < bigdecimal: a mixed exact operation promotes to
// the WIDEST operand and is computed exactly, and the result never
// demotes — `0d5 + -0d2` stays a biginteger though 3 fits an int64.
func exactPlus(ctx *Ctx, o Val, av, bv Val) Val {
	asv, aok := av.(*ScalarVal)
	bsv, bok := bv.(*ScalarVal)
	if !aok || !bok {
		// A non-scalar peer (kind, map, list, top, func) does not
		// coerce: the op stays unresolved, as it does for every kind.
		return nil
	}

	// String concatenation renders the DIGITS, never the `0d` marker:
	// concatenation is about digits and not kind decoration, exactly as
	// R4's canon `.0` suffix never leaks into a string either.
	if asv.kind == KindString || bsv.kind == KindString {
		return newString(primStr(asv.peg) + primStr(bsv.peg))
	}

	// A Big leaf never silently becomes a binary float, in EITHER
	// operand order (boru's rule, mirrored). Promotion would have to
	// round — most exact decimals have no binary64 image — and this
	// language does not round, so the mix is a hard error.
	if asv.kind == KindFloat || bsv.kind == KindFloat {
		// Mirrors TS: the OP is the single operand of an `add` attempt,
		// and the hint names both leaves in operand order ({left}/{right}).
		return makeNilErrFull(ctx, "exact_float_mix", o, nil, "add",
			map[string]string{"left": asv.kind.String(), "right": bsv.kind.String()})
	}

	if !exactLadderKinds[asv.kind] || !exactLadderKinds[bsv.kind] {
		// A boolean or null against an exact leaf does not coerce.
		return nil
	}

	// The widest operand decides the leaf.
	if asv.kind == KindBigDecimal || bsv.kind == KindBigDecimal {
		sum := scalarDecimal(asv).add(scalarDecimal(bsv))
		// The budget bounds results as well as literals: an exact sum
		// over either bound is refused, never rounded.
		if sum.overBudget() {
			return makeNilErrFull(ctx, "decimal_budget", o, nil, "add", nil)
		}
		return newBigDecimal(sum)
	}
	return newBigInteger(new(big.Int).Add(scalarBigInt(asv), scalarBigInt(bsv)))
}

// exactLadderKinds is D6's EXACT LADDER: integer < biginteger <
// bigdecimal, the kinds a `+` may promote between and compute exactly.
// KindFloat is deliberately absent — it is off the ladder, and mixing it
// with a Big leaf is the exact_float_mix error rather than a promotion.
var exactLadderKinds = map[Kind]bool{
	KindInteger:    true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

// scalarBigInt reads an integer- or biginteger-kind operand as an exact
// integer. A biginteger's peg is returned as-is: pegs are immutable, and
// every caller here only reads it.
func scalarBigInt(sv *ScalarVal) *big.Int {
	if sv.kind == KindInteger {
		return big.NewInt(sv.peg.(int64))
	}
	return sv.peg.(*big.Int)
}

// scalarDecimal promotes any operand on the exact ladder to a Decimal.
// The promotion is exact by construction — every kind on the ladder is
// an exact base-10 value, which is why there is no ladder rung for
// float.
func scalarDecimal(sv *ScalarVal) *Decimal {
	if sv.kind == KindBigDecimal {
		return sv.peg.(*Decimal)
	}
	// Scale 0 is not a normal form; newDecimal folds it to the leaf's
	// minimum one decimal place.
	return newDecimal(scalarBigInt(sv), 0)
}

// unpref unwraps pref() layers: a pref operand contributes its preferred
// value (`pref(1)+2`).
func unpref(v Val) Val {
	for {
		pv, ok := v.(*PrefVal)
		if !ok {
			return v
		}
		v = pv.peg
	}
}

// isIntegerScalar reports whether an (already unpref'd) operand is a
// concrete scalar of integer kind.
func isIntegerScalar(v Val) bool {
	sv, ok := v.(*ScalarVal)
	return ok && sv.kind == KindInteger
}

// isExactScalar reports whether an (already unpref'd) operand is a
// concrete scalar of one of the tower's EXACT leaves.
func isExactScalar(v Val) bool {
	sv, ok := v.(*ScalarVal)
	return ok && (sv.kind == KindBigInteger || sv.kind == KindBigDecimal)
}

// primatize extracts the native value of a scalar operand, for the
// binary64/string/boolean path.
//
// An exact leaf never arrives here: operate() sends any operand pair
// containing one to exactPlus first. That routing is load-bearing — a
// *big.Int reaching primFloat would read as 0, and reaching plusAdd's
// float addition would round — so the exact leaves are handled by kind
// before any native value is extracted at all.
func primatize(v Val) any {
	if sv, ok := unpref(v).(*ScalarVal); ok {
		return sv.peg
	}
	return nil
}

// plusAdd is the binary64 addition, and it is now reached ONLY when a
// float operand is involved: the exact ladder (biginteger, bigdecimal
// and integer+integer) is dispatched by kind in operate before any peg
// gets here, because rounding a sum of exact operands is precisely what
// D6 abolished.
func plusAdd(a, b any) any {
	if _, ok := a.(string); ok {
		return primStr(a) + primStr(b)
	}
	if _, ok := b.(string); ok {
		return primStr(a) + primStr(b)
	}
	return primFloat(a) + primFloat(b)
}

// primStr renders a scalar peg for string concatenation: the DIGITS of a
// number, with no kind decoration. Neither canon's `0d` marker nor R4's
// `.0` suffix appears here — `"q" + 0d5` is `"q5"` and `"a" + 1.0` is
// `"a1"` — because concatenation is about digits and not kind.
func primStr(v any) string {
	switch n := v.(type) {
	case string:
		return n
	case int64:
		return strconv.FormatInt(n, 10)
	case float64:
		return formatNumber(n)
	case *big.Int:
		return bigIntDigits(n)
	case *Decimal:
		return n.digits()
	case bool:
		if n {
			return "true"
		}
		return "false"
	}
	return ""
}

// primFloat reads a peg as a binary64 value. It is only ever reached for
// the two binary64-compatible pegs: the exact leaves are dispatched by
// kind long before this (see primatize).
func primFloat(v any) float64 {
	switch n := v.(type) {
	case int64:
		return float64(n)
	case float64:
		return n
	}
	return 0
}
