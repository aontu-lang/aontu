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

  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const val = args?.[0]
    let out = null == val || null == ctx ?
      makeNilErr(ctx, 'invalid-arg', this) :
      val.clone(ctx)


    if (out.isRef) {
      ;(out as any).copyFound = true
    }
    else {
      // The argument lands as written: each hide(), type() and close()
      // in it is its argument, and each reference in it is the copy's,
      // so nothing it reads where it lands marks or seals it.
      out = walk(out, (_key: string | number | undefined, val: any) => {
        while ((true === val.isHideFunc || true === val.isTypeFunc || true === val.isCloseFunc)
          && 1 === val.peg?.length) {
          val = val.peg[0]
        }
        val.mark.type = false
        val.mark.hide = false
        if (true === val.isRef) {
          val.copyFound = true
        }
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
