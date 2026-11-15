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

import { CustomVal } from './CustomVal'
import { FuncBaseVal } from './FuncBaseVal'
import { MapVal } from './MapVal'
import { isData } from './MetaFuncVal'
import { StringVal } from './StringVal'
import { top } from './top'


class GenFuncVal extends FuncBaseVal {
  isGenFunc = true
  // AFTER every other term of a meet, the late atoms included: canon
  // writes the annotation last, as it writes one that rides a value.
  cjo = 160000

  // The custom expression is taken where the call is built: its hole is the call's.
  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    const record: any = this.peg?.[0]
    if (true === record?.isMap) {
      kept(record, record, ctx)
    }
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new GenFuncVal(spec)
  }

  funcname() {
    return 'gen'
  }

  rides() {
    return true
  }

  // `any` carrying the record, which every meet takes to its result. A
  // record that says nothing is no record, and a string is the form.
  resolve(ctx: AontuContext, args: Val[]) {
    const spec: any = args[0]
    if (spec.isNil) {
      return spec
    }
    const rec: any = true === spec.isString ? spec.place(new MapVal({
      peg: { form: new StringVal({ peg: spec.peg }, ctx) },
    }, ctx)) : spec
    if (true !== rec.isMap || !isData(rec)) {
      return makeNilErr(ctx, 'func_arg', this, spec, undefined, {
        func: 'gen',
        sig: renderSig(funcSig.gen),
        arg: 'spec',
        argn: '1',
        got: spec.canon,
      })
    }
    const out: any = top()
    if (0 < Object.keys(rec.peg).length) {
      out.genrec = kept(rec, undefined, ctx)
    }
    return out
  }
} /* node:coverage ignore next 20 */


// The expression is held as its text, so a record is one by reference or
// written here. A record the call does not own is copied.
function kept(record: any, own: any, ctx?: AontuContext): any {
  const custom: any = record.peg.custom
  if (null == custom || true === custom.isCustom) {
    return record
  }
  const out: any = own ?? record.clone(ctx as AontuContext)
  out.peg.custom = custom.place(new CustomVal({ peg: custom.canon }, ctx))
  return out
}


export {
  GenFuncVal,
}
