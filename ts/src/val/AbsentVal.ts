/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { FeatureVal } from './FeatureVal'
import { repathInstance } from './Val'


// Top with one difference: absence is GENERABLE, and
// generates nothing, so a bag drops it at a required key too.
class AbsentVal extends FeatureVal {
  isAbsent = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.dc = DONE
    this.mark.type = false
    this.mark.hide = false
  }

  // The unit of the meet, called for EITHER operand so `&` commutes.
  // Met with top it stays absence: a maybe over a path to one reads it so.
  unify(peer: Val, ctx: AontuContext): Val {
    if (peer.isTop) {
      return this
    }
    const at: string[] = ctx.path
    if (0 < at.length && at.join('\u0000') !== peer.path.map(String).join('\u0000')) {
      const out = peer.clone(ctx, { path: [...at], dup: true })
      repathInstance(out, out.path)
      return out
    }
    return peer
  }

  same(peer: Val): boolean {
    return true === (peer as any)?.isAbsent
  }

  get canon() { return 'maybe()' }

  gen(_ctx?: AontuContext) {
    return undefined
  }

} /* node:coverage ignore next 6 */


export {
  AbsentVal,
}
