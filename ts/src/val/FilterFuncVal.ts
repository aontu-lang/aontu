/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { FuncBaseVal, trialUnify, sameMembers } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'
import { bagMembers } from './members'


type Member = { key: string, val: Val }


class FilterFuncVal extends FuncBaseVal {
  isFilterFunc = true

  // THE STAGING RULE (G8 phase 0). A subset of a bag that is still
  // being merged into is a subset of the wrong bag.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'filter'
  }


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
    const data: any = args[0]
    const cond: Val = args[1]

    const keeps = (child: Val, kctx: AontuContext): boolean => {
      const inst = cond.clone(kctx, { dup: true })
      repathInstance(inst, inst.path)
      const test = fillPlace(inst, child, kctx)
      const met = trialUnify(kctx, child.clone(kctx), test)
      return undefined !== met && sameMembers(child, met)
    }

    // The candidates are the bag's MEMBERS -- what generation would
    // emit (./members.ts, BUGS.md §79) -- so a hidden child is never
    // selected into the result.
    if (true === data?.isMap) {
      const peg: Record<string, Val> = {}
      for (const { key, val } of bagMembers(data, ctx) as Member[]) {
        const kctx = ctx.descend(key)
        if (keeps(val, kctx)) {
          peg[key] = val.clone(kctx)
        }
      }
      return new MapVal({ peg }, ctx)
    }

    if (true === data?.isList) {
      const peg: Val[] = []
      for (const { val: el } of bagMembers(data, ctx) as Member[]) {
        const ectx = ctx.descend(String(peg.length))
        if (keeps(el, ectx)) {
          peg.push(el.clone(ectx))
        }
      }
      return new ListVal({ peg }, ctx)
    }

    return makeNilErr(ctx, 'filter_data', this)
  }

} /* node:coverage ignore next 5 */


export {
  FilterFuncVal,
}
