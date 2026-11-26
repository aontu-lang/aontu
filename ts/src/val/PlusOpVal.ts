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
import { ListVal } from '../val/ListVal'
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


const EXACT_RANK: Record<string, number> = {
  integer: 1,
  biginteger: 2,
  bigdecimal: 3,
}


function isBig(k: OpKind): boolean {
  return 'biginteger' === k || 'bigdecimal' === k
}


function operand(v: any) {
  while (v?.isPref) {
    v = v.peg
  }
  return v
}


// The operand's LEAF, not the JavaScript type of its peg: integer and
// float share `number`, while the exact leaves are told apart from each
// other and from everything else by their own flags. The whole ladder in
// `operate` dispatches on this and never on `typeof`.
function opkind(v: any): OpKind | undefined {
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


function plusText(v: Val): string | undefined {
  const o: any = operand(v)
  const k = opkind(o)
  return undefined === k ? undefined : digits(o, k)
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


  operate(ctx: AontuContext, args: Val[]): Val | undefined {
    const av: any = operand(args[0])
    const bv: any = operand(args[1])

    // ABSENCE PROPAGATES.
    if (true === av?.isAbsent) {
      return av
    }
    if (true === bv?.isAbsent) {
      return bv
    }

    // Lists concatenate.
    if (true === av?.isList && true === bv?.isList) {
      const peg: Val[] = [...av.peg, ...bv.peg].map(
        (v: Val, i: number) => v.clone(ctx.descend(String(i))))
      return new ListVal({ peg }, ctx)
    }

    const ak = opkind(av)
    const bk = opkind(bv)

    if (undefined === ak || undefined === bk) {
      return undefined
    }

    if ('boolean' === ak && 'boolean' === bk) {
      return new BooleanVal({ peg: av.peg || bv.peg })
    }

    if ('string' === ak || 'string' === bk) {
      return new StringVal({ peg: digits(av, ak) + digits(bv, bk) })
    }

    // A boolean mixed with a number does not coerce (no JS 0/1).
    if ('boolean' === ak || 'boolean' === bk) {
      return undefined
    }

    if (('float' === ak && isBig(bk)) || (isBig(ak) && 'float' === bk)) {
      return makeNilErr(ctx, 'exact_float_mix', this, undefined, 'add',
        { left: ak, right: bk })
    }

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

    return isIntegerStorable(sum) ?
      new IntegerVal({ peg: Number(sum) }) :
      makeNilErr(ctx, 'inexact_integer_sum', this, undefined, 'add',
        { sum: sum.toString() })
  }


  get canon() {
    return this.peg[0]?.canon + '+' + this.peg[1]?.canon
  }

}


function digits(v: any, k: OpKind): string {
  return 'bigdecimal' === k ? v.peg.toString() :
    'integer' === k ? integerDigits(v.peg) :
      String(v.peg)
}


function integer(v: any, k: OpKind): bigint {
  return 'biginteger' === k ? v.peg : BigInt(v.peg)
}


function decimal(v: any, k: OpKind): Decimal {
  return 'bigdecimal' === k ? v.peg : new Decimal(integer(v, k), 0)
} /* node:coverage ignore next 6 */


export {
  PlusOpVal,
  plusText,
}
