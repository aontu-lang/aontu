/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import { DONE } from '../type'

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
import { top } from './top'


type Member = { key: string, val: Val }


// Each member under the key its child takes: a code, a refusal `k`
// answered, or undefined while `k` waits.
function packMembers(ctx: AontuContext, data: Val | undefined, k: Val | undefined):
  Member[] | string | Val | undefined {
  const members = bagMembers(data, ctx)

  if (undefined === members) {
    return 'pack_data'
  }

  if (undefined !== k) {
    const out: Member[] = []
    for (const { key, val } of members) {
      const read: any = readKey(ctx, k, val, key)
      if (DONE !== read.dc) {
        return undefined
      }
      if (true === read.isNil) {
        return read
      }
      if (!isName(read)) {
        return 'pack_key'
      }
      out.push({ key: read.peg, val })
    }
    return out
  }

  if (true === (data as any).isMap) {
    return members
  }

  const out: Member[] = []
  for (const { val } of members) {
    // A key is a NAME, and only a string is one. A number would
    // key by position under another spelling, which is the failure
    // mode the data-keyed rule exists to refuse.
    if (!isName(val)) {
      return 'pack_key'
    }
    out.push({ key: (val as any).peg, val })
  }
  return out
}


function isName(v: any): boolean {
  return true === v?.isScalar && 'string' === typeof v.peg
}


// `k` for one member where it stands, run to a fixpoint as the admission
// trial runs its meet, its refusals kept until it answers.
function readKey(ctx: AontuContext, k: Val, member: Val, key: string): Val {
  const kctx: any = ctx.descend(key).clone({ err: [] })
  const inst = k.clone(kctx, { dup: true })
  repathInstance(inst, inst.path)
  let out: any = fillPlace(inst, member, kctx)
  let last = ''
  kctx.settle = false
  for (let cc = 0; DONE !== out.dc && cc < kctx.budget.passes; cc++) {
    kctx.seen = {}
    kctx.cc = cc
    out = unite(kctx, out, top(), 'pack')
    const now = out.canon
    if (kctx.settle && now === last) {
      break
    }
    kctx.settle = now === last
    last = now
  }
  if (true === out.isNil) {
    ctx.err.push(...kctx.err)
  }
  return out
}


class PackFuncVal extends FuncBaseVal {
  isPackFunc = true

  staged = true

  packed: Member[] | string | Val | undefined = undefined

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
    if (!this.stagedReady(ctx, 1)) {
      return this.residuate(peer, ctx)
    }

    this.packed = packMembers(ctx, this.peg[0], this.peg[2])
    if (undefined === this.packed) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const members = this.packed as Member[] | string | Val
    if ('string' === typeof members) {
      return makeNilErr(ctx, members, this)
    }
    if (!Array.isArray(members)) {
      return members
    }

    // Arity is checked at parse (funcArity), so the template is here.
    const tmpl: Val = args[1]
    const peg: Record<string, Val> = keyTable()

    for (const { key, val } of members) {
      const keyctx = ctx.descend(key)
      const inst = tmpl.clone(keyctx, { dup: true })
      repathInstance(inst, inst.path)
      const child = fillPlace(inst, val, keyctx)
      peg[key] = undefined === peg[key] ? child :
        unite(keyctx, peg[key], child, 'pack')
    }

    return new MapVal({ peg }, ctx)
  }

} /* node:coverage ignore next 6 */


export {
  packMembers,
  PackFuncVal,
}
