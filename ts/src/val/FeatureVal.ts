/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'


import { Val } from './Val'

import { top } from './top'

import { AontuError, descErr, makeNilErr } from '../err'


abstract class FeatureVal extends Val {
  isFeature = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  superior(): Val {
    return top()
  }


  gen(ctx: AontuContext) {
    // Unresolved nil cannot be generated, so always an error.

    let nerr = makeNilErr(ctx, 'no_gen', this)
    descErr(nerr, ctx)
    ctx?.adderr(nerr)

    if (null == ctx || !ctx.collect) {
      const aerr = new AontuError(nerr.msg, [nerr])
      throw aerr
    }

    return undefined
  }

} /* node:coverage ignore next 6 */


export {
  FeatureVal,
}
