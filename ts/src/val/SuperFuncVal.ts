/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'


import { FuncBaseVal } from './FuncBaseVal'
import { MapVal } from './MapVal'
import { keyTable } from './BagVal'
import { ListVal } from './ListVal'
import { DisjunctVal } from './DisjunctVal'
import { ScalarKindVal } from './ScalarKindVal'
import { top } from './top'


class SuperFuncVal extends FuncBaseVal {
  isSuperFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new SuperFuncVal(spec)
  }

  funcname() {
    return 'super'
  }


  deferResolve(_ctx: AontuContext, args?: Val[]): boolean {
    return true === (args?.[0] as any)?.isRecurse
  }


  resolve(ctx: AontuContext, args: Val[]) {
    // One argument, always a Val: funcArity pins super at [1,1]
    // before any resolve, and the parser builds arguments as Vals --
    // a guarded fallback here is dead code under ADR-002.
    return this.place(superOf(ctx, args[0]))
  }

}


// superOf answers the immediate parent type of a RESOLVED value (the
// caller drives arguments before resolve fires, so pending forms --
// held conjuncts, unresolved references, holes -- never arrive).
function superOf(ctx: AontuContext, v: any): Val {
  if (true === v.isRecurse) {
    const call = new SuperFuncVal({ peg: [v.clone(ctx)] }, ctx)
    return v.place(call)
  }

  if (true === v.isMap) {
    const peg: Record<string, Val> = keyTable()
    for (const k of Object.keys(v.peg)) {
      peg[k] = superOf(ctx, v.peg[k])
    }
    const out: any = new MapVal({ peg }, ctx)
    out.optionalKeys = [...v.optionalKeys]
    out.closed = v.closed
    if (null != v.spread?.cj) {
      out.spread.cj = superOf(ctx, v.spread.cj)
    }
    return v.place(out)
  }

  if (true === v.isList) {
    const peg: Val[] = v.peg.map((e: Val) => superOf(ctx, e))
    const out: any = new ListVal({ peg }, ctx)
    out.closed = v.closed
    if (null != v.spread?.cj) {
      out.spread.cj = superOf(ctx, v.spread.cj)
    }
    return v.place(out)
  }

  if (true === v.isPref) {
    return superOf(ctx, v.peg)
  }

  // A choice lifts arm by arm: super(1|2) is integer, super(1|"a") is
  // integer|string. An arm whose lift is top absorbs the whole answer
  // -- a disjunct carrying top says nothing -- and duplicate lifts
  // collapse so the common case answers as the one kind it is.
  if (true === v.isDisjunct) {
    const arms: Val[] = []
    const seen: Record<string, boolean> = {}
    for (const a of v.peg) {
      const lift = superOf(ctx, a)
      if (true === (lift as any).isTop) {
        return v.place(top())
      }
      if (true !== seen[lift.canon]) {
        seen[lift.canon] = true
        arms.push(lift)
      }
    }
    if (1 === arms.length) {
      return v.place(arms[0])
    }
    return v.place(new DisjunctVal({ peg: arms }, ctx))
  }

  if (true === v.isConstraint) {
    if (null != v.kind) {
      return v.place(new ScalarKindVal({ peg: v.kind }))
    }
    if ('number' === v.domain) {
      return v.place(new ScalarKindVal({ peg: Number }))
    }
    if ('string' === v.domain) {
      return v.place(new ScalarKindVal({ peg: String }))
    }
    return v.place(top())
  }

  const sup = v.superior()
  if (null != sup && true !== (sup as any).isTop) {
    return sup
  }
  return v.place(top())
} /* node:coverage ignore next 6 */


export {
  SuperFuncVal,
  superOf,
}
