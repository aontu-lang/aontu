/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'
import { AbsentVal } from './AbsentVal'
import { FuncBaseVal } from './FuncBaseVal'


import {
  top
} from './top'


class MaybeFuncVal extends FuncBaseVal {
  isMaybeFunc = true

  forgives = true

  // A reference that has not resolved YET is not a reference to
  // nothing (ADR-034).
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'maybe'
  }


  // Null so the base drives nothing: it would drive on the CALLER's
  // context, where NilVal.make records the miss before resolve runs.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    if (!ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    // Cloned rather than swapped and restored, which is the
    // own-property hazard trialUnify documents at length.
    const sink: Val[] = []
    const actx = ctx.clone({ err: sink, collect: true })
    ;(actx as any)._trialMode = false
    const out = unite(actx, args[0], top(), 'maybe')

    // ONLY a missing referent. A conflict inside the argument stays
    // the document's error.
    if (out.isNil && 'reference' === (out as any).class) {
      return this.place(new AbsentVal({}, ctx))
    }

    for (const err of sink) {
      ctx.adderr(err as any)
    }

    return out
  }

} /* node:coverage ignore next 6 */


export {
  MaybeFuncVal,
}
