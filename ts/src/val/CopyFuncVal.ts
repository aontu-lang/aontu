/* Copyright (c) 2021-2025 Richard Rodger, MIT License */



import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'



import {
  walk
} from '../utility'


import { FuncBaseVal } from './FuncBaseVal'


class CopyFuncVal extends FuncBaseVal {
  isCopyFunc = true

  resolved?: Val

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.mark.type = false
    this.mark.hide = false
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new CopyFuncVal(spec)
  }


  funcname() {
    return 'copy'
  }

  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const val = args?.[0]
    const out = null == val || null == ctx ?
      makeNilErr(ctx, 'invalid-arg', this) :
      val.clone(ctx)

    // console.log('CR', out)

    if (!out.isRef) {
      walk(out, (_key: string | number | undefined, val: Val) => {
        // console.log('WALK', val)
        val.mark.type = false
        val.mark.hide = false
        return val
      })
    }

    // console.log('COPY-RESOLVE', ctx.cc, val, out)

    return out
  }
} /* node:coverage ignore next 6 */


export {
  CopyFuncVal,
}
