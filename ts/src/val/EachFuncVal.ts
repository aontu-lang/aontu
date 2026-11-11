/* Copyright (c) 2025 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { ListVal } from './ListVal'
import { FuncBaseVal } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'
import { memberVals } from './members'


class EachFuncVal extends FuncBaseVal {
  isEachFunc = true

  // THE STAGING RULE, for the reason given in PackFuncVal: the data
  // is not settled merely by being `done` once.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'each'
  }


  // The template is not an argument to drive (see PackFuncVal.prepare).
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    // ONE argument is driven: the data. The template is not (see
    // prepare above).
    if (!this.stagedReady(ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const vals = memberVals(args?.[0], ctx)
    if (undefined === vals) {
      return makeNilErr(ctx, 'each_data', this)
    }

    // Arity is checked at parse (funcArity), so the template is here.
    const tmpl: Val = args[1]
    const peg: Val[] = []

    for (let i = 0; i < vals.length; i++) {
      const elctx = ctx.descend(String(i))
      const inst = tmpl.clone(elctx, { dup: true })
      repathInstance(inst, inst.path)
      peg.push(fillPlace(inst, vals[i], elctx))
    }

    return new ListVal({ peg }, ctx)
  }

} /* node:coverage ignore next 6 */


export {
  EachFuncVal,
}
