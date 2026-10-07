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

import { isAliasSlotKey } from '../aliasname'

import { unionRider } from '../utility'

import { parseUri } from '../uri'


const text = (v: any) => true === v?.isScalar && 'string' === typeof v.peg

// The record's whole vocabulary: an $id is an absolute URI, and an
// $anchor is a plain name.
const IDENTITY_KEYS: Record<string, (v: any) => boolean> = {
  id: (v) => text(v) && undefined !== parseUri(v.peg).scheme &&
    !v.peg.includes('#'),
  anchor: (v) => text(v) && /^[A-Za-z_][-A-Za-z0-9._]*$/.test(v.peg),
  key: text,
}


class IdentityFuncVal extends FuncBaseVal {
  isIdentityFunc = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new IdentityFuncVal(spec)
  }

  funcname() {
    return 'identity'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    const v = args[0]
    if (v.isNil) {
      return v
    }

    const r: any = args[1]
    const ok = true === r.isMap && null == r.spread?.cj &&
      0 === r.optionalKeys.length && Object.keys(r.peg).every((k) =>
        Object.prototype.hasOwnProperty.call(IDENTITY_KEYS, k) &&
        IDENTITY_KEYS[k](r.peg[k]))
    if (!ok) {
      return makeNilErr(ctx, 'func_arg', this, r, undefined, {
        func: 'identity',
        sig: renderSig(funcSig.identity),
        arg: 'r',
        argn: '2',
        got: r.canon,
      })
    }

    const out = v.clone(ctx)
    // Only the declaration carries the record, from a call that is no
    // other call's argument: a reference's copy of the call resolves
    // where the reference stands, as its value.
    if (1 === this.path.length && isAliasSlotKey(this.path[0]) &&
      true !== (ctx as any).inarg && true !== (ctx as any).argsnap) {
      out.identity = unionRider(out.identity, Object.fromEntries(
        Object.keys(r.peg).map((k) => [k, [r.peg[k].peg]])), String)
    }
    return out
  }
} /* node:coverage ignore next 6 */


export {
  IdentityFuncVal,
}
