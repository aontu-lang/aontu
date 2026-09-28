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

import { unite } from '../unify'

import { FeatureVal } from './FeatureVal'


// A constraint, or a kind that can become one's domain (`integer` in
// `constraint & integer & min(0)`).
function constrains(v: any): boolean {
  return true === v?.isConstraint || true === v?.isRefer
    || true === v?.isRel || true === v?.isScalarKind
    || true === v?.isEmptyConstraint || true === v?.isGraphAtom
}


// The type of constraints. It HOLDS the meet of the constraints it has
// met rather than answering with them, so a concrete value is refused
// whichever order the terms fold in: `constraint & min(3) & 5` is an
// error just as `constraint & 5` is, where answering `min(3)` would let
// `min(3) & 5` quietly become `5`.
class ConstraintKindVal extends FeatureVal {
  isConstraintKind = true

  held?: Val

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.held = (spec as any).held
    this.dc = null == this.held || this.held.done ? DONE : 0
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isTop) {
      return null == this.held || this.held.done ? this :
        this.hold(unite(ctx, this.held, p, 'constraint-kind'), ctx)
    }
    const theirs: Val | undefined =
      true === p.isConstraintKind ? p.held : constrains(p) ? p : undefined
    if (true !== p.isConstraintKind && undefined === theirs) {
      return makeNilErr(ctx, 'constraint_kind', this, peer)
    }
    if (undefined === theirs) {
      return this
    }
    return this.hold(null == this.held ? theirs :
      unite(ctx, this.held, theirs, 'constraint-kind'), ctx)
  }

  hold(v: Val, ctx: AontuContext): Val {
    if (true === v.isNil) {
      return v
    }
    if (!constrains(v)) {
      return makeNilErr(ctx, 'constraint_kind', this, v)
    }
    const out = new ConstraintKindVal({ held: v } as any, ctx)
    out.site = this.site
    out.path = this.path
    return out
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    return super.clone(ctx, {
      ...(null == this.held ? {} : { held: this.held.clone(ctx) }),
      ...(spec ?? {}),
    } as any)
  }

  get canon() {
    return null == this.held ? 'constraint' : 'constraint&' + this.held.canon
  }

  same(peer: any): boolean {
    return true === peer?.isConstraintKind &&
      (null == this.held ? null == peer.held :
        null != peer.held && this.held.same(peer.held))
  }

} /* node:coverage ignore next 5 */


export {
  ConstraintKindVal,
}
