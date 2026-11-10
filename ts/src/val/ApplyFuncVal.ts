/* Copyright (c) 2026 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { FuncBaseVal } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'


class ApplyFuncVal extends FuncBaseVal {
  isApplyFunc = true

  // Staged as each is: the one instance it makes is each's for [v].
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'apply'
  }


  // The template is not an argument to drive (see PackFuncVal.prepare).
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    if (!this.stagedReady(peer, ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const inst = args[1].clone(ctx, { dup: true, path: this.path })
    repathInstance(inst, inst.path)
    return fillPlace(inst, args[0], ctx)
  }

} /* node:coverage ignore next 6 */


export {
  ApplyFuncVal,
}
