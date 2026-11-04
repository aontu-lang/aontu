/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'


import { makeScalarLike } from '../val/valutil'
import { Decimal } from '../val/Decimal'
import { caseRange, rangeArg } from './caserange'


import { FuncBaseVal } from './FuncBaseVal'


class UpperFuncVal extends FuncBaseVal {
  isUpperFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new UpperFuncVal(spec)
  }

  funcname() {
    return 'upper'
  }


  resolve(ctx: AontuContext | undefined, args: Val[]) {
    // A missing argument (`upper()`) must produce an invalid-arg error
    // value, as the Go port does — reading .peg off nothing threw a
    // TypeError that the unifier could only report as an opaque
    // internal error.
    const arg = args?.[0]
    const oldpeg = arg?.peg

    const start = rangeArg(args?.[1])
    const len = rangeArg(args?.[2])
    const ranged = undefined !== start || undefined !== len
    if (ranged &&
      (Number.isNaN(start as number) || Number.isNaN(len as number) ||
        'string' !== typeof oldpeg)) {
      return this.place(makeNilErr(ctx, 'invalid-arg', this, arg, 'range'))
    }
    const peg = 'string' === typeof oldpeg ?
      caseRange(oldpeg, start ?? 0, len ?? -1, true) :
      'number' === typeof oldpeg ? Math.ceil(oldpeg) :
        'bigint' === typeof oldpeg ? oldpeg :
          oldpeg instanceof Decimal ? oldpeg.ceil() :
            undefined
    const out = this.place(
      null == peg ?
        makeNilErr(ctx, 'invalid-arg', this) :
        // The ceiling keeps the ARGUMENT's kind (upper(2) is an integer
        // 2, upper(1.1) is a number 2) — the function must not narrow
        // number to integer.
        makeScalarLike(peg, arg)
    )
    return out
  }
} /* node:coverage ignore next 6 */


export {
  UpperFuncVal,
}
