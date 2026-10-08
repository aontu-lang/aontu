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


// ADR-056: the identity a schema was declared with, carried by its alias
// declaration and by nothing else.
const IDENT_KEYS = ['id', 'anchor', 'defs']


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
    v.identity = unionRecords([v.identity, record], (s: string) => s)
    return v
  }
}


function identRecord(r: any): Record<string, string[]> | undefined {
  if (true !== r.isMap) {
    return undefined
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(r.peg)) {
    const v: any = r.peg[k]
    if (!IDENT_KEYS.includes(k) || true !== v.isScalar || 'string' !== typeof v.peg) {
      return undefined
    }
    out[k] = [v.peg]
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
