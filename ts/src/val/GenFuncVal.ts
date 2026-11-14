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
import { isData } from './MetaFuncVal'
import { top } from './top'


class GenFuncVal extends FuncBaseVal {
  isGenFunc = true
  // AFTER every other term of a meet, the late atoms included: canon
  // writes the annotation last, as it writes one that rides a value.
  cjo = 160000

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
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
  // record that says nothing is no record.
  resolve(ctx: AontuContext, args: Val[]) {
    const rec: any = args[0]
    if (rec.isNil) {
      return rec
    }
    if (true !== rec.isMap || !isData(rec)) {
      return makeNilErr(ctx, 'func_arg', this, rec, undefined, {
        func: 'gen',
        sig: renderSig(funcSig.gen),
        arg: 'spec',
        argn: '1',
        got: rec.canon,
      })
    }
    const out: any = top()
    if (0 < Object.keys(rec.peg).length) {
      out.genrec = rec
    }
    return out
  }
} /* node:coverage ignore next 6 */


export {
  GenFuncVal,
}
