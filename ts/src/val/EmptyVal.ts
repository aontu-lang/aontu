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


// `empty()`: the constraint that admits "" where `string` alone does
// not. It waives rather than narrows, so it folds first in a conjunct:
// `"" & string` would otherwise refuse before the waiver arrived.
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
    if ((true === p.isScalarKind && String_ === p.peg) || true === p.isString) {
      return p.withEmpty(ctx)
    }
    if (true === p.isConstraint) {
      return p.allowEmpty(ctx, this)
    }
    // An unresolved call drives: it knows to wait for its value.
    if (true === p.isConstraintKind || true === p.isFunc) {
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
