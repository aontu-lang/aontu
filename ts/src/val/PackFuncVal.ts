/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'
import { makeNilErr } from '../err'
import { MapVal } from './MapVal'
import { keyTable } from './BagVal'
import { FuncBaseVal } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'
import { bagMembers } from './members'


function dataKeys(data: Val | undefined, ctx: AontuContext): string[] | string {
  const members = bagMembers(data, ctx)

  if (undefined === members) {
    return 'pack_data'
  }

  if (true === (data as any).isMap) {
    return members.map((m) => m.key)
  }

  const out: string[] = []
  for (const { val } of members) {
    const e: any = val
    // A key is a NAME, and only a string is one. A number would
    // key by position under another spelling, which is the failure
    // mode the data-keyed rule exists to refuse.
    if (true !== e?.isScalar || 'string' !== typeof e.peg) {
      return 'pack_key'
    }
    out.push(e.peg)
  }
  return out
}


class PackFuncVal extends FuncBaseVal {
  isPackFunc = true

  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'pack'
  }


  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    // ONE argument is driven: the data. The template is not (see
    // prepare above), and driveStagedArgs answers whether the data has
    // settled -- the other half of "ready to fire".
    if (!this.stagedReady(peer, ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const keys = dataKeys(args?.[0], ctx)
    if ('string' === typeof keys) {
      return makeNilErr(ctx, keys, this)
    }

    // Arity is checked at parse (funcArity), so both arguments are here.
    const tmpl: Val = args[1]
    const peg: Record<string, Val> = keyTable()

    const src: any = args[0]

    for (const key of keys) {
      const keyctx = ctx.descend(key)
      const source: Val = true === src?.isMap ? src.peg[key] : src.peg[keys.indexOf(key)]
      const inst = tmpl.clone(keyctx, { dup: true })
      repathInstance(inst, inst.path)
      const child = fillPlace(inst, source, keyctx)
      peg[key] = undefined === peg[key] ? child :
        unite(keyctx, peg[key], child, 'pack')
    }

    return new MapVal({ peg }, ctx)
  }

} /* node:coverage ignore next 7 */


export {
  dataKeys,
  PackFuncVal,
}
