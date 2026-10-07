/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { funcSig, renderSig } from '../sig'

import { FuncBaseVal } from './FuncBaseVal'

import { unionRider } from '../utility'


// Plain data: what JSON can hold, with nothing left to resolve.
function plain(v: any): boolean {
  if (true === v?.isScalar) {
    return true
  }
  if ((true === v?.isMap || true === v?.isList) && null == v.spread?.cj &&
    0 === (v.optionalKeys ?? []).length) {
    return Object.values(v.peg).every(plain)
  }
  return false
}


const text = (v: any) => true === v?.isScalar && 'string' === typeof v.peg
const flag = (v: any) => true === v?.isScalar && 'boolean' === typeof v.peg

// The record's whole vocabulary, each key with the values it may hold
// (G12 design, section 12).
const META_KEYS: Record<string, (v: any) => boolean> = {
  title: text,
  description: text,
  comment: text,
  format: text,
  contentEncoding: text,
  contentMediaType: text,
  readOnly: flag,
  writeOnly: flag,
  default: plain,
  contentSchema: plain,
  examples: (v) => true === v?.isList && plain(v),
  x: (v) => true === v?.isMap && plain(v),
}


class MetaFuncVal extends FuncBaseVal {
  isMetaFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new MetaFuncVal(spec)
  }

  funcname() {
    return 'meta'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    let out = args[0]

    // A nil ARGUMENT is returned unchanged, as deprecate() returns one.
    if (out.isNil) {
      return out
    }

    let rider: Record<string, Val[]> = {}
    for (let i = 1; i < args.length; i++) {
      const r: any = args[i]
      const ok = true === r.isMap && null == r.spread?.cj &&
        0 === r.optionalKeys.length && Object.keys(r.peg).every((k) =>
          Object.prototype.hasOwnProperty.call(META_KEYS, k) &&
          META_KEYS[k](r.peg[k]))
      if (!ok) {
        return makeNilErr(ctx, 'func_arg', this, r, undefined, {
          func: 'meta',
          sig: renderSig(funcSig.meta),
          arg: 'r',
          argn: '' + (i + 1),
          got: r.canon,
        })
      }
      for (const k of Object.keys(r.peg)) {
        rider = unionRider(rider, { [k]: [r.peg[k]] }, (m) => m.canon)!
      }
    }

    out = out.clone(ctx)
    if (0 < Object.keys(rider).length) {
      out.meta = unionRider(out.meta, rider, (m) => m.canon)
    }
    return out
  }
} /* node:coverage ignore next 6 */


export {
  MetaFuncVal,
}
