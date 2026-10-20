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
import { isData } from './MetaFuncVal'


class IdentFuncVal extends FuncBaseVal {
  isIdentFunc = true

  // The whole value of an alias declaration, which the parser marks.
  declared = false

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    const out = new IdentFuncVal(spec)
    out.declared = this.declared
    return out
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out = super.clone(ctx, spec) as IdentFuncVal
    out.declared = this.declared
    return out
  }

  funcname() {
    return 'ident'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    if (!this.declared) {
      return makeNilErr(ctx, 'ident_place', this)
    }
    const out = args[0]
    if (out.isNil) {
      return out
    }
    const record = identRecord(args[1])
    if (undefined === record) {
      return makeNilErr(ctx, 'func_arg', this, args[1], undefined, {
        func: 'ident',
        sig: renderSig(funcSig.ident),
        arg: 'r',
        argn: '2',
        got: args[1].canon,
      })
    }
    const v = out.clone(ctx)
    v.identity = unionRecords([v.identity, record], (r: any) => r.canon)
    return v
  }
}


// A declaration's record: a map of concrete data under any keys, which
// the JSON Schema exporter reads its identity from (ADR-073).
function identRecord(r: any): Record<string, Val[]> | undefined {
  if (true !== r.isMap || !isData(r)) {
    return undefined
  }
  const out: Record<string, Val[]> = Object.create(null)
  for (const k of Object.keys(r.peg)) {
    out[k] = [r.peg[k]]
  }
  return out
}


// A copy is not the declaration it was taken from, so it has no identity.
function undeclared(v: any): Val {
  if (true === v.isIdentFunc) {
    return v.peg[0]
  }
  v.identity = undefined
  return v
} /* node:coverage ignore next 6 */


export {
  IdentFuncVal,
  undeclared,
}
