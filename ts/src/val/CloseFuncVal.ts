/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'



import { FuncBaseVal } from './FuncBaseVal'
import { SealVal, sealCjo } from './SealVal'
import { BagVal } from '../val/BagVal'


class CloseFuncVal extends FuncBaseVal {
  isCloseFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.validateArgs(spec.peg, 1)
    if (0 === (spec.peg ?? []).length) {
      this.cjo = sealCjo(true)
    }
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new CloseFuncVal(spec)
  }

  funcname() {
    return 'close'
  }


  resolve(ctx: AontuContext, args: Val[]) {
    let argval: any = args[0]

    if (null == argval) {
      return this.place(new SealVal({ closed: true } as any, ctx))
    }

    if (argval.isMap || argval.isList) {
      (argval as BagVal).closed = true
    }

    return argval
  }

} /* node:coverage ignore next 6 */


export {
  CloseFuncVal,
}
