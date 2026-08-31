/* Copyright (c) 2025 Richard Rodger, MIT License */

// CONTAINER KINDS (docs/design/PATHS.0.md). `{}` and `[]` are the
// container UNITS: they admit any map (or list) AND generate empty
// when nothing arrives. `map()` and `list()` are the container KINDS
// proper: they admit exactly the same values and default to NOTHING,
// as `string` does -- the spelling of "this must be a map, and it
// must be supplied", which the unit cannot say because an unmet unit
// silently manufactures its empty value.
//
// The vacuous call is the kind; the literal is the unit. That is the
// whole convention, and it is why neither function takes arguments:
// element constraints already belong to the spreads (`{&: V}`,
// `[&: V]`), and a second spelling of them here would drift.
//
// No null/top/nil arms, as RelVal records: unite's dispatch ladder
// absorbs those peers before any Val's own unify is consulted, and
// FuncBaseVal returns a done resolution directly against a top peer.

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
import { FuncBaseVal } from './FuncBaseVal'


class MapKindVal extends FeatureVal {
  isContainerKind = true
  isMapKind = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.dc = DONE
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isMap) {
      return peer
    }
    if (true === p.isMapKind) {
      return this
    }
    // The unit's own refusal code: a kind mismatch here is the same
    // fact `{} & 1` reports, and two codes for one fact would drift.
    return makeNilErr(ctx, 'map', this, peer)
  }

  get canon() {
    return 'map()'
  }

  same(peer: any): boolean {
    return true === peer?.isMapKind
  }

} /* node:coverage ignore next 4 */


class ListKindVal extends FeatureVal {
  isContainerKind = true
  isListKind = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.dc = DONE
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isList) {
      return peer
    }
    if (true === p.isListKind) {
      return this
    }
    return makeNilErr(ctx, 'list', this, peer)
  }

  get canon() {
    return 'list()'
  }

  same(peer: any): boolean {
    return true === peer?.isListKind
  }

} /* node:coverage ignore next 4 */


class MapFuncVal extends FuncBaseVal {
  isMapFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new MapFuncVal(spec)
  }

  funcname() {
    return 'map'
  }

  resolve(ctx: AontuContext, _args: Val[]) {
    const out = new MapKindVal({}, ctx)
    out.site = this.site
    out.path = this.path
    return out
  }

} /* node:coverage ignore next 4 */


class ListFuncVal extends FuncBaseVal {
  isListFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new ListFuncVal(spec)
  }

  funcname() {
    return 'list'
  }

  resolve(ctx: AontuContext, _args: Val[]) {
    const out = new ListKindVal({}, ctx)
    out.site = this.site
    out.path = this.path
    return out
  }

} /* node:coverage ignore next 8 */


export {
  MapKindVal,
  ListKindVal,
  MapFuncVal,
  ListFuncVal,
}
