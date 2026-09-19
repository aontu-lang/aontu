/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"strconv"
)

type PlusOpVal struct {
	base
	peg []Val
}

func newPlusOp(a, b Val) *PlusOpVal {
	o := &PlusOpVal{peg: []Val{a, b}}
	o.site.sp = unsited
	return o
}

func (o *PlusOpVal) superior() Val { return top() }

func (o *PlusOpVal) cjo() int { return 48000 }

func (o *PlusOpVal) Canon() string {
	return o.peg[0].Canon() + "+" + o.peg[1].Canon()
}

func (o *PlusOpVal) Gen(ctx *Ctx) (any, error) {
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

	if !isTop(peer) && !peer.Nil() && hasPlace(o) {
		if hasPlace(peer) {
			return makeNilErr(ctx, "place_pair", o, peer)
		}
		ctx.slot = slot
		return unite(ctx, fillPlace(o, peer), top())
	}

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
		np := newPlusOp(newpeg[0], newpeg[1])
		np.path = cp(o.path)
		np.site.sp, np.site.spu, np.site.url = o.site.sp, o.site.spu, o.site.url
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

func (o *PlusOpVal) operate(ctx *Ctx, args []Val) Val {
	// A pref operand contributes its preferred value, and therefore that
	// value's kind too.
	av := unpref(args[0])
	bv := unpref(args[1])

	if isAbsent(av) {
		return av
	}
	if isAbsent(bv) {
		return bv
	}

	// ADR-034 and ADR-037.
	if al, aok := av.(*ListVal); aok {
		if bl, bok := bv.(*ListVal); bok {
			peg := make([]Val, 0, len(al.peg)+len(bl.peg))
			for _, v := range append(append([]Val{}, al.peg...), bl.peg...) {
				peg = append(peg, clonePath(v, cp(append(o.vpath(), itoa(len(peg))))))
			}
			return newList(peg)
		}
	}

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
		if math.IsInf(p, 0) || math.IsNaN(p) {
			return makeNilErrFull(ctx, "float_overflow", o, nil, "add", nil)
		}
		return newFloat(p)
	}
	return nil //coverage:ignore peg is always string, bool or float64
}

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

	if (0 < x && 0 < y && sum < 0) || (x < 0 && y < 0 && 0 <= sum) {
		return inexact()
	}

	if !isIntegerStorable(big.NewInt(sum)) {
		return inexact()
	}
	return newInteger(sum)
}

func exactPlus(ctx *Ctx, o Val, av, bv Val) Val {
	asv, aok := av.(*ScalarVal)
	bsv, bok := bv.(*ScalarVal)
	if !aok || !bok {
		// A non-scalar peer (kind, map, list, top, func) does not
		// coerce: the op stays unresolved, as it does for every kind.
		return nil
	}

	if asv.kind == KindString || bsv.kind == KindString {
		return newString(primStr(asv.peg) + primStr(bsv.peg))
	}

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

var exactLadderKinds = map[Kind]bool{
	KindInteger:    true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

func scalarBigInt(sv *ScalarVal) *big.Int {
	if sv.kind == KindInteger {
		return big.NewInt(sv.peg.(int64))
	}
	return sv.peg.(*big.Int)
}

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

func primatize(v Val) any {
	if sv, ok := unpref(v).(*ScalarVal); ok {
		return sv.peg
	}
	return nil
}

func plusAdd(a, b any) any {
	if _, ok := a.(string); ok {
		return primStr(a) + primStr(b)
	}
	if _, ok := b.(string); ok {
		return primStr(a) + primStr(b)
	}
	return primFloat(a) + primFloat(b)
}

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
