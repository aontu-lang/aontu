/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { unsealTree } from './SealVal'


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

  // A reference is copied as written, so that it clears the marks and
  // seal where it lands; any other argument is read first.
  prepare(_ctx: AontuContext, args: Val[]) {
    return true === args?.[0]?.isRef ? null : args
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const val = args?.[0]
    const out = null == val || null == ctx ?
      makeNilErr(ctx, 'invalid-arg', this) :
      val.clone(ctx)


    if (out.isRef) {
      ;(out as any).copyFound = true
    }
    else {
      walk(out, (_key: string | number | undefined, val: Val) => {
        val.mark.type = false
        val.mark.hide = false
        return val
      })
      unsealTree(out)
    }


    return out
  }
} /* node:coverage ignore next 6 */


export {
  CopyFuncVal,
}
