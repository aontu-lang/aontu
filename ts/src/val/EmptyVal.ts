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

import { makeNilErr } from '../err'

import { FeatureVal } from './FeatureVal'
import { String_ } from './ScalarKindVal'


// `empty()` standing apart from a `string`: every string. Written beside
// `string` in one conjunction it is that kind's second word, which the
// parser reads; met any other way it widens nothing (decision 3).
class EmptyVal extends FeatureVal {
  isEmptyConstraint = true
  cjo = 20000

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, peg: [] }, ctx)
    this.dc = DONE
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (null == p || true === p.isTop || true === p.isEmptyConstraint) {
      return this
    }
    if (true === p.isNil) {
      return p
    }
    if (true === p.isScalarKind && String_ === p.peg) {
      return p
    }
    if (true === p.isString) {
      return p.withEmpty(ctx)
    }
    if (true === p.isConstraint) {
      return p.allowEmpty(ctx, this)
    }
    if (true === p.isConstraintKind) {
      return p.unify(this, ctx)
    }
    return makeNilErr(ctx, 'empty_domain', this, peer)
  }

  get canon() {
    return 'empty()'
  }

  same(peer: any): boolean {
    return true === peer?.isEmptyConstraint
  }

} /* node:coverage ignore next 5 */


export {
  EmptyVal,
}
