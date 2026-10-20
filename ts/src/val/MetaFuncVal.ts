/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { unionRecords } from '../rider'
import { funcSig, renderSig } from '../sig'

import { FuncBaseVal } from './FuncBaseVal'


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

  rides() {
    return true
  }

  resolve(ctx: AontuContext, args: Val[]) {
    let out = args[0] ?? makeNilErr(ctx, 'arg', this)

    // A nil argument is returned unchanged, as deprecate() returns one.
    if (out.isNil) {
      return out
    }

    const records: Record<string, Val[]>[] = []
    for (let i = 1; i < args.length; i++) {
      const record = metaRecord(args[i])
      if (undefined === record) {
        const sig = funcSig.meta
        return makeNilErr(ctx, 'func_arg', this, args[i], undefined, {
          func: 'meta',
          sig: renderSig(sig),
          arg: 'r',
          argn: '' + (i + 1),
          got: args[i].canon,
        })
      }
      records.push(record)
    }

    out = out.clone(ctx)
    const meta = unionRecords([out.meta, ...records], (v: any) => v.canon)
    if (0 < Object.keys(meta).length) {
      out.meta = meta
    }
    return out
  }
}


// A record: a map of concrete data, under any keys, or undefined where it
// is not one. What a key means is for the reader of the record to say;
// the JSON Schema exporter reads its own keys (ADR-072).
function metaRecord(r: any): Record<string, Val[]> | undefined {
  if (true !== r?.isMap || !isData(r)) {
    return undefined
  }
  const out: Record<string, Val[]> = Object.create(null)
  for (const k of Object.keys(r.peg)) {
    out[k] = [r.peg[k]]
  }
  return out
}


// Concrete JSON data: a scalar, or a map or list of them with no spread
// and no optional key.
function isData(v: any): boolean {
  if (true === v?.isScalar) {
    return true
  }
  if ((true !== v?.isMap && true !== v?.isList) || null != v.spread?.cj ||
    (true === v.isMap && 0 < v.optionalKeys.length)) {
    return false
  }
  return Object.values(v.peg).every(isData)
} /* node:coverage ignore next 6 */


export {
  MetaFuncVal,
  isData,
}
