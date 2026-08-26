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


class CloseFuncVal extends FuncBaseVal {
  isCloseFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.validateArgs(spec.peg, 1)
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
      return makeNilErr(ctx, 'no_first_arg', this, undefined, 'close')
    }

    if (argval.isMap || argval.isList) {
      // The in-place write is safe BECAUSE of the per-destination
      // instantiation rule (ADR-005): everywhere a close() call is
      // multiplied — a pack/each template, a spread constraint — the
      // clone now owns its argument (`dup`), so `closed` lands on that
      // instance alone. Cloning the bag here instead was tried and
      // rejected: the re-path it implies corrupts the source
      // attribution of children inside nested spread templates (the
      // 06-k8s use case's env findings named the wrong path).
      (argval as BagVal).closed = true
      // console.log('CLOSED', argval.canon)
    }

    return argval
  }

} /* node:coverage ignore next 6 */


export {
  CloseFuncVal,
}
