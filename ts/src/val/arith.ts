/* Copyright (c) 2025 Richard Rodger, MIT License */


// THE ARITHMETIC FAMILY -- add, sub, mul, div, mod, rem.
//
// The review's finding I: "Arithmetic stops at `+`", so "prod gets
// double the replicas" is inexpressible and Kubernetes quantity strings
// silently CONCATENATE ("500m" + "500m" is "500m500m"). The design
// pre-registered the semantics these functions must have
// (docs/capability-review/g8-generation.md, "Arithmetic semantics,
// pre-registered") and the boundary that keeps `-` `*` `/` `%`
// reserved: maths arrives as functions or not at all.
//
// THE FAMILY IS NUMERIC, WHICH IS WHAT MAKES `add` MORE THAN A SYNONYM
// FOR `+`. The operator is polymorphic -- concatenation for strings,
// disjunction for booleans, addition for numbers -- and that is why the
// quantity strings above concatenate instead of failing. `add("500m",
// "500m")` is a located error, because a function named for a numeric
// operation has no business inventing a string. So the two spellings
// mean different things, and both are kept.
//
// Everything else here is the number tower's existing law, applied to
// five more operations (docs/design/number-model.md):
//
//   R5 CONTAGION      no operation introduces a kind narrower than its
//                     operands, so an integer result needs integer
//                     operands.
//   D6 EXACT LADDER   integer < biginteger < bigdecimal. A mixed exact
//                     operation promotes to the WIDEST operand, is
//                     computed exactly, and never demotes.
//   FLOAT IS OFF IT   binary64 mixed with either big leaf is a hard
//                     error in both operand orders, because promotion
//                     either way throws away exactness the document
//                     asked for by writing `0d`.
//   NO ROUNDING       an exact result that will not store is refused,
//                     never rounded to fit.
//
// and three refusals this file adds, which the pre-registration named:
//
//   div/mod/rem by ZERO is a hard error in every kind. A ground-truth
//   language has no business manufacturing infinity, and Aontu cannot
//   even write one down -- an overflowing literal is a `not_number`
//   error nil -- so propagating one would invent a value no generated
//   JSON could carry.
//
//   A NON-FINITE FLOAT RESULT is a located error. This one was already
//   reachable through `+` and reported as neither: `1.0e308+1.0e308`
//   crashed TypeScript with `[aontu/internal]` and leaked Go's raw
//   `json: unsupported value: +Inf` with no code at all (use-cases/
//   BUGS.md 39). PlusOpVal and its Go twin now go through the same
//   check.
//
//   DIVISION IS NOT CLOSED OVER THE DECIMAL LEAF, so div/mod/rem refuse
//   a bigdecimal operand rather than rounding one third to fit. See
//   `inexact_divide`'s hint: scale to integers, which is the money wire
//   convention anyway, or accept a float.


import type { Val } from '../type'

import { AontuContext } from '../ctx'
import { makeNilErr } from '../err'

import { IntegerVal } from './IntegerVal'
import { NumberVal } from './NumberVal'
import { BigIntegerVal } from './BigIntegerVal'
import { BigDecimalVal } from './BigDecimalVal'
import { Decimal, decimalOverBudget } from './Decimal'
import { isIntegerStorable } from './numkind'


type ArithOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'rem'

// The three that divide, and therefore the three that can be handed a
// zero divisor and cannot answer over the decimal leaf.
function divides(op: ArithOp): boolean {
  return 'div' === op || 'mod' === op || 'rem' === op
}


// The numeric leaves, told apart by their own flags rather than by the
// JavaScript type of the peg: `integer` and `float` share `number`.
type ArithKind = 'integer' | 'float' | 'biginteger' | 'bigdecimal'

const EXACT_RANK: Record<string, number> = {
  integer: 1,
  biginteger: 2,
  bigdecimal: 3,
}


function isBig(k: ArithKind): boolean {
  return 'biginteger' === k || 'bigdecimal' === k
}


// A pref operand contributes its preferred value, and therefore that
// value's kind too -- the same rule `+` applies.
function unpref(v: any): any {
  while (v?.isPref) {
    v = v.peg
  }
  return v
}


function arithKind(v: any): ArithKind | undefined {
  if (!(v?.isVal && v.isScalar)) {
    return undefined
  }
  if (v.isBigInteger) {
    return 'biginteger'
  }
  if (v.isBigDecimal) {
    return 'bigdecimal'
  }
  if (v.isInteger) {
    return 'integer'
  }
  return 'number' === typeof v.peg ? 'float' : undefined
}


// An exact-ladder operand as an exact integer. Only reached for the two
// integral leaves; an `integer` peg is integral by construction.
function asInteger(v: any, k: ArithKind): bigint {
  return 'biginteger' === k ? v.peg : BigInt(v.peg)
}


function asDecimal(v: any, k: ArithKind): Decimal {
  return 'bigdecimal' === k ? v.peg : new Decimal(asInteger(v, k), 0)
}


// The whole family, in one function, because every rule above is a rule
// about ARITHMETIC and not about any one operation. `node` is the value
// the error is located at -- the call, or the `+` op.
// `attempt` is the name the ERROR reports, which is the operation
// except when a fold borrows one: `sum` adds, but a bad member is the
// author's `sum` call and must say so.
function arith(
  ctx: AontuContext | undefined,
  op: ArithOp,
  node: Val,
  a: Val,
  b: Val,
  attempt?: string
): Val {
  const name = attempt ?? op
  const av: any = unpref(a)
  const bv: any = unpref(b)
  const ak = arithKind(av)
  const bk = arithKind(bv)

  // A non-numeric operand is not something to wait for: `resolve` is
  // only reached once every argument has settled, so a kind, a map, a
  // string or a boolean here is the author's mistake and is named as
  // one. (`+` differs, and must: it has answers for strings and
  // booleans.)
  if (undefined === ak || undefined === bk) {
    return makeNilErr(ctx, 'invalid-arg', node, undefined, name)
  }

  // A big leaf never silently becomes a binary float, in EITHER operand
  // order. The error names both leaves in operand order.
  if (('float' === ak && isBig(bk)) || (isBig(ak) && 'float' === bk)) {
    return makeNilErr(ctx, 'exact_float_mix', node, undefined, name,
      { left: ak, right: bk })
  }

  if ('float' === ak || 'float' === bk) {
    return floatArith(ctx, op, name, node, av.peg, bv.peg)
  }

  const rank = EXACT_RANK[bk] < EXACT_RANK[ak] ? EXACT_RANK[ak] : EXACT_RANK[bk]

  if (EXACT_RANK.bigdecimal === rank) {
    return decimalArith(ctx, op, name, node, asDecimal(av, ak), asDecimal(bv, bk))
  }

  return integerArith(ctx, op, name, node, asInteger(av, ak),
    asInteger(bv, bk), EXACT_RANK.biginteger === rank)
}


// IEEE-754 binary64, with the JSON-superset constraint still biting: an
// infinite or NaN result is a located error rather than a value, because
// there is no way to write one down and no JSON that could carry it.
function floatArith(
  ctx: AontuContext | undefined,
  op: ArithOp,
  name: string,
  node: Val,
  x: number,
  y: number
): Val {
  if (divides(op) && 0 === y) {
    return makeNilErr(ctx, 'divide_by_zero', node, undefined, name)
  }

  const out =
    'add' === op ? x + y :
      'sub' === op ? x - y :
        'mul' === op ? x * y :
          'div' === op ? x / y :
            // Truncated remainder, sign following the DIVIDEND, which is
            // what JavaScript's `%` and Go's math.Mod both give...
            'rem' === op ? x % y :
              // ...and the floored modulus, sign following the DIVISOR,
              // built from it. Adding the divisor back moves a remainder
              // whose sign disagrees into agreement, and leaves an exact
              // zero alone.
              flooredMod(x % y, y)

  return Number.isFinite(out) ?
    new NumberVal({ peg: out }) :
    makeNilErr(ctx, 'float_overflow', node, undefined, name)
}


function flooredMod(rem: number, y: number): number {
  return 0 !== rem && (rem < 0) !== (y < 0) ? rem + y : rem
}


// The exact integral leaves. Both compute in bigint, so nothing passes
// through binary64 and nothing rounds; only the storage test at the end
// differs, because `biginteger` is unbounded and `integer` is not.
function integerArith(
  ctx: AontuContext | undefined,
  op: ArithOp,
  name: string,
  node: Val,
  x: bigint,
  y: bigint,
  big: boolean
): Val {
  if (divides(op) && 0n === y) {
    return makeNilErr(ctx, 'divide_by_zero', node, undefined, name)
  }

  const out =
    'add' === op ? x + y :
      'sub' === op ? x - y :
        'mul' === op ? x * y :
          // TRUNCATION TOWARD ZERO, stated once here rather than left to
          // whichever host `/` each port happens to call: div(-7, 2) is
          // -3, not -4. BigInt division truncates, and so does Go's
          // big.Int.Quo (its Div floors, which is why the Go twin must
          // not use it).
          'div' === op ? x / y :
            'rem' === op ? x % y :
              flooredModBig(x % y, y)

  if (big) {
    // Unbounded and exact: nothing to check, and no demotion to
    // `integer` however small the result.
    return new BigIntegerVal({ peg: out })
  }

  // The result faces the SAME storage contract R1 puts on a literal --
  // integral, inside the int64 window, and exactly representable in
  // binary64 -- because Go's int64 holds results TypeScript's double
  // cannot, and without a shared test a document would resolve in one
  // port and round in the other.
  return isIntegerStorable(out) ?
    new IntegerVal({ peg: Number(out) }) :
    makeNilErr(ctx, 'inexact_integer_sum', node, undefined, name,
      { sum: out.toString() })
}


function flooredModBig(rem: bigint, y: bigint): bigint {
  return 0n !== rem && (rem < 0n) !== (y < 0n) ? rem + y : rem
}


// The decimal leaf. Addition, subtraction and multiplication are exact
// coefficient arithmetic and land here; division does not, and says so.
function decimalArith(
  ctx: AontuContext | undefined,
  op: ArithOp,
  name: string,
  node: Val,
  x: Decimal,
  y: Decimal
): Val {
  if (divides(op)) {
    // EXACT DECIMAL DIVISION IS NOT CLOSED: one third has no finite
    // decimal form, so a `div` over this leaf either rounds -- the one
    // thing the leaf exists to refuse -- or refuses. It refuses, and the
    // hint names both ways out.
    return makeNilErr(ctx, 'inexact_divide', node, undefined, name)
  }

  const out =
    'add' === op ? x.add(y) :
      'sub' === op ? x.add(y.negate()) :
        x.multiply(y)

  // The budget applies to RESULTS as well as literals: an exact answer
  // too wide to hold is refused, never rounded to fit.
  return decimalOverBudget(out) ?
    makeNilErr(ctx, 'decimal_budget', node, undefined, name) :
    new BigDecimalVal({ peg: out })
} /* node:coverage ignore next 9 */


export type {
  ArithOp,
}

export {
  arith,
}
