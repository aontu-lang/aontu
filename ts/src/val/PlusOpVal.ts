/* Copyright (c) 2024-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'


import {
  AontuContext,
} from '../ctx'


import { makeNilErr } from '../err'

import { IntegerVal } from '../val/IntegerVal'
import { NumberVal } from '../val/NumberVal'
import { StringVal } from '../val/StringVal'
import { BooleanVal } from '../val/BooleanVal'
import { BigIntegerVal } from '../val/BigIntegerVal'
import { BigDecimalVal } from '../val/BigDecimalVal'
import { Decimal, decimalOverBudget } from '../val/Decimal'
import { integerDigits } from '../val/numkind'
import { isIntegerStorable } from '../val/numkind'
import { OpBaseVal } from './OpBaseVal'


// The operand kinds `+` understands. Anything else (a kind, map, list,
// null, top, func) is not an operand at all and leaves the op
// unresolved.
type OpKind =
  'string' | 'boolean' | 'integer' | 'float' | 'biginteger' | 'bigdecimal'


// D6 -- THE EXACT LADDER: integer < biginteger < bigdecimal. A mixed
// operation between exact leaves promotes to the WIDEST operand and is
// computed exactly, so `1 + 0d2` is a biginteger and `1 + 0d0.5` a
// bigdecimal.
//
// `float` is deliberately absent: it is OFF the ladder, keeping only its
// classic contagion against `integer`. Its absence from this table is
// what makes the float-with-big pairs fall through to the hard error
// below rather than promoting.
//
// Results NEVER demote: `0d5 + -0d2` stays a biginteger even though 3
// would fit an int64. Demotion would make the result kind depend on the
// values rather than on the operand kinds, and a document could then
// change leaf under a value edit.
const EXACT_RANK: Record<string, number> = {
  integer: 1,
  biginteger: 2,
  bigdecimal: 3,
}


function isBig(k: OpKind): boolean {
  return 'biginteger' === k || 'bigdecimal' === k
}


class PlusOpVal extends OpBaseVal {
  isPlusOp = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new PlusOpVal(spec)
  }

  opname() {
    return 'plus'
  }


  operate(ctx: AontuContext, args: Val[]) {
    // Only concrete scalar operands are valid: anything else (kinds,
    // maps, lists, null, top, funcs) must not coerce — the JS `+` would
    // leak internals like "[object Object]" into output. A non-scalar
    // operand leaves the op unresolved, which generate() reports.
    const operand = (v: any) => {
      // A pref operand contributes its preferred value (`pref(1)+2`),
      // and therefore that value's kind too.
      while (v?.isPref) {
        v = v.peg
      }
      return v
    }

    // The operand's LEAF, not the JavaScript type of its peg: integer
    // and float share `number`, while the exact leaves are told apart
    // from each other and from everything else by their own flags. The
    // whole ladder below dispatches on this and never on `typeof`.
    const opkind = (v: any): OpKind | undefined => {
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
      const t = typeof v.peg
      return 'number' === t ? 'float' :
        'string' === t ? 'string' :
          'boolean' === t ? 'boolean' :
            undefined
    }

    const av: any = operand(args[0])
    const bv: any = operand(args[1])
    const ak = opkind(av)
    const bk = opkind(bv)

    if (undefined === ak || undefined === bk) {
      return undefined
    }

    if ('boolean' === ak && 'boolean' === bk) {
      return new BooleanVal({ peg: av.peg || bv.peg })
    }

    // STRING CONCATENATION RENDERS DIGITS, NOT KIND DECORATION. The `0d`
    // marker is canon's way of naming the leaf and never belongs in a
    // string, exactly as R4's `.0` float suffix does not ("q" + 0d0.1 is
    // "q0.1", and "q" + 1.0 is "q1"). Decimal.toString() is that
    // marker-free rendering, which is why canon() wraps it rather than
    // the other way round.
    if ('string' === ak || 'string' === bk) {
      return new StringVal({ peg: digits(av, ak) + digits(bv, bk) })
    }

    // A boolean mixed with a number does not coerce (no JS 0/1).
    if ('boolean' === ak || 'boolean' === bk) {
      return undefined
    }

    // FLOAT IS OFF THE EXACT LADDER, and mixing it with either big leaf
    // is a hard error in BOTH operand orders: a big type never silently
    // becomes a binary float. Promotion the other way is no better —
    // binary64 cannot hold every exact value, so either direction throws
    // away exactness the document explicitly asked for by writing `0d`.
    // The error names both leaves in operand order.
    if (('float' === ak && isBig(bk)) || (isBig(ak) && 'float' === bk)) {
      return makeNilErr(ctx, 'exact_float_mix', this, undefined, 'add',
        { left: ak, right: bk })
    }

    // Float with float or integer: unchanged R5 contagion, binary64
    // addition, float result (`1 + 2.0` is `3.0`) -- but a sum that
    // leaves binary64's finite range is NOT a value. Aontu is a JSON
    // superset and there is no notation for an infinity, so one here
    // used to escape as `[aontu/internal]` in TypeScript and as Go's
    // raw `json: unsupported value: +Inf` with no code at all
    // (use-cases/BUGS.md 39). The same check governs the arithmetic
    // family (float_overflow, ts/src/val/arith.ts).
    if ('float' === ak || 'float' === bk) {
      const sum = av.peg + bv.peg
      return Number.isFinite(sum) ?
        new NumberVal({ peg: sum }) :
        makeNilErr(ctx, 'float_overflow', this, undefined, 'add')
    }

    // Both operands are on the exact ladder: promote to the widest.
    const rank = EXACT_RANK[bk] < EXACT_RANK[ak] ? EXACT_RANK[ak] : EXACT_RANK[bk]

    if (EXACT_RANK.bigdecimal === rank) {
      // Exact scaled-decimal addition. The budget applies to results as
      // well as literals (D6): an exact sum too wide to hold is refused,
      // never rounded to fit.
      const sum = decimal(av, ak).add(decimal(bv, bk))
      return decimalOverBudget(sum) ?
        makeNilErr(ctx, 'decimal_budget', this, undefined, 'add') :
        new BigDecimalVal({ peg: sum })
    }

    // integer and biginteger both add as exact integers.
    const sum = integer(av, ak) + integer(bv, bk)

    if (EXACT_RANK.biginteger === rank) {
      // Unbounded and exact: nothing to check, and no demotion to
      // `integer` however small the result.
      return new BigIntegerVal({ peg: sum })
    }

    // INTEGER + INTEGER IS COMPUTED EXACTLY, then offered to the integer
    // leaf under the same storage contract R1 applies to a literal.
    // Adding through float64 (as this did) silently rounded sums of
    // exact operands — 4503599627370496 + 4503599627370497 came back as
    // …992 — which is precisely the corruption the tower refuses. The
    // sum that will not fit is an error pointing at `0d`, not a rounded
    // answer.
    return isIntegerStorable(sum) ?
      new IntegerVal({ peg: Number(sum) }) :
      makeNilErr(ctx, 'inexact_integer_sum', this, undefined, 'add',
        { sum: sum.toString() })
  }


  get canon() {
    return this.peg[0]?.canon + '+' + this.peg[1]?.canon
  }

}


// The digits of an operand for string concatenation: no `0d` marker, no
// R4 `.0` suffix — the plain rendering of the number, in every leaf.
//
// INTEGER KIND GOES THROUGH integerDigits. This was the THIRD site to
// render an integer-kind peg with JavaScript's shortest round-tripping
// form, so `"" + 1152921504606846976` produced "1152921504606847000" — a
// different integer — where Go produced the exact digits. See #21 and
// integerDigits, which exists so the set of such sites is greppable.
//
// The other leaves are already exact or already correct: a bigint
// stringifies to its exact digits, a Decimal renders its own, and a FLOAT
// must keep String() because its shortest form is the right answer and is
// what Go prints too (`"a" + 1.0` is "a1").
function digits(v: any, k: OpKind): string {
  return 'bigdecimal' === k ? v.peg.toString() :
    'integer' === k ? integerDigits(v.peg) :
      String(v.peg)
}


// An exact-ladder operand as an exact integer. Only reached for the two
// integral leaves; an `integer` peg is integral by construction, so
// BigInt() is exact.
function integer(v: any, k: OpKind): bigint {
  return 'biginteger' === k ? v.peg : BigInt(v.peg)
}


// An exact-ladder operand as a Decimal, for the promotion to bigdecimal.
// Scale 0 normalises to the one decimal place the leaf keeps.
function decimal(v: any, k: OpKind): Decimal {
  return 'bigdecimal' === k ? v.peg : new Decimal(integer(v, k), 0)
} /* node:coverage ignore next 6 */


export {
  PlusOpVal,
}
