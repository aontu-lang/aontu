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
import { DisjunctVal, unread } from './DisjunctVal'
import { ScalarKindVal } from './ScalarKindVal'
import { top } from './top'
import { RESERVED_KEY_PREFIX } from '../aliasname'


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
    // a guarded fallback here is dead code under ADR-103.
    return this.place(superOf(ctx, args[0]))
  }

}


const PROBE = RESERVED_KEY_PREFIX + 'probe'


// Ruling 40: a template reads its paths at a member, so the lift gives each one a member to read at.
function probeOf(ctx: AontuContext, v: any): Val | undefined {
  if (true !== v.isMap) {
    return undefined
  }
  const peg: Record<string, Val> = keyTable()
  for (const k of Object.keys(v.peg)) {
    const kid = probeOf(ctx, v.peg[k])
    if (undefined !== kid) {
      peg[k] = kid
    }
  }
  const tmpl = v.spread?.cj
  const inner = null == tmpl ? undefined : probeOf(ctx, tmpl)
  if (undefined !== inner || (null != tmpl && unread(tmpl))) {
    peg[PROBE] = inner ?? (true === tmpl.isMap ? new MapVal({ peg: keyTable() }, ctx) : top())
  }
  return 0 < Object.keys(peg).length ? new MapVal({ peg }, ctx) : undefined
}


// The member a template was read at is the template's lift.
function unprobe(v: any): Val {
  if (true === v.isMap) {
    Object.keys(v.peg).forEach((k) => unprobe(v.peg[k]))
    if (undefined !== v.peg[PROBE]) {
      v.spread.cj = v.peg[PROBE]
      delete v.peg[PROBE]
    }
  }
  return v
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

  // A call here is one still waiting on a hole, and an unmade call's
  // parent type is any, whatever its superior() says it would make.
  if (true === v.isFunc || true === v.isOp) {
    return v.place(top())
  }

  const sup = v.superior()
  if (null != sup && true !== (sup as any).isTop) {
    return sup
  }
  return v.place(top())
} /* node:coverage ignore next 8 */


export {
  SuperFuncVal,
  superOf,
  probeOf,
  unprobe,
}
