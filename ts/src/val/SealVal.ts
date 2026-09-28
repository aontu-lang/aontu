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


// `close()` and `open()` with no argument: they seal, or unseal, the
// map or list they meet, and leave any other value as it is. `close()`
// folds LAST in a conjunct, so it closes the whole meet rather than the
// first term it finds; `open()` folds first, so it lifts a seal before
// anything is added.
class SealVal extends FeatureVal {
  isSeal = true
  closed: boolean

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, peg: [] }, ctx)
    this.closed = true === (spec as any).closed
    this.cjo = sealCjo(this.closed)
    this.dc = DONE
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    return super.clone(ctx, { closed: this.closed, ...(spec ?? {}) } as any)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (null == p || true === p.isTop) {
      return this
    }
    if (true === p.isSeal) {
      return this.closed || !p.closed ? this : p
    }
    // A copy, not the peer: a disjunction trials every alternative
    // against one peer, and a seal set in place would leak across them.
    if (true === p.isMap || true === p.isList) {
      const out: any = p.clone(ctx)
      out.closed = this.closed
      return out
    }
    return peer
  }

  get canon() {
    return this.closed ? 'close()' : 'open()'
  }

  same(peer: any): boolean {
    return true === peer?.isSeal && this.closed === peer.closed
  }

} /* node:coverage ignore next 11 */


function sealCjo(closed: boolean): number {
  return closed ? 130000 : 25000
}


export {
  SealVal,
  sealCjo,
}
