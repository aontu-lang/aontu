/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'


import { FuncBaseVal } from './FuncBaseVal'
import { BagVal } from '../val/BagVal'


class OpenFuncVal extends FuncBaseVal {
  isOpenFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new OpenFuncVal(spec)
  }

  funcname() {
    return 'open'
  }


  resolve(ctx: AontuContext | undefined, args: Val[]) {
    let argval: any = args[0]

    if (null == argval) {
      return makeNilErr(ctx, 'no_first_arg', this, undefined, 'close')
    }

    if (argval.isMap || argval.isList) {
      // In place, for the reason CloseFuncVal.resolve gives: the
      // instantiation rule (ADR-005) makes the argument this call's
      // own wherever the call is multiplied.
      (argval as BagVal).closed = false
    }

    return argval
  }

} /* node:coverage ignore next 6 */


export {
  OpenFuncVal,
}
