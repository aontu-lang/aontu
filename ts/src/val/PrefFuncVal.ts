/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { PrefVal } from '../val/PrefVal'
import { FuncBaseVal } from './FuncBaseVal'


// A call is left as written: preferring its arguments would change what it
// computes, where pref changes only what it defaults to.
function prefer(ctx: AontuContext, val: Val): Val {
  if (val.isScalar || val.isPref) {
    return new PrefVal({ peg: val }, ctx)
  }
  if (val.isMap || val.isList || val.isConjunct || val.isDisjunct) {
    const peg: any = val.peg
    for (const k of Object.keys(peg)) {
      peg[k] = prefer(ctx, peg[k])
    }
  }
  return val
}


class PrefFuncVal extends FuncBaseVal {
  isPrefFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new PrefFuncVal(spec)
  }

  funcname() {
    return 'pref'
  }


  resolve(ctx: AontuContext, args: Val[]) {
    let out = args[0] ?? makeNilErr(ctx, 'arg', this)

    if (!out.isNil) {
      out = prefer(ctx, out.clone(ctx))
    }

    return out
  }

} /* node:coverage ignore next 6 */


export {
  PrefFuncVal,
}
