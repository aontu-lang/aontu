/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { canonRiders } from '../utility'
import { cmpCodePoint } from '../keyorder'

import { FeatureVal } from './FeatureVal'


// Abstract base class for binary operations that work with arrays of Val objects
// (ConjunctVal and DisjunctVal)
abstract class JunctionVal extends FeatureVal {
  isJunction = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  // NOTE: mutation!
  append(peer: Val): JunctionVal {
    this.peg.push(peer)
    return this
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as JunctionVal)
    const childspec: any = spec?.mark || spec?.dup ?
      { mark: spec?.mark, dup: spec?.dup, path: out.path }
      : { path: out.path }
    out.peg = this.peg.map((entry: Val) => entry.clone(ctx, childspec))
    return out
  }

  get canon() {
    const parts: [number, string][] = this.peg.map((v: Val) =>
      [v.cjo, (v as any).isJunction && Array.isArray(v.peg) && 1 < v.peg.length ?
        '(' + canonRiders(v) + ')' : canonRiders(v)])
    // A meet is one value whatever order its terms were met in, so terms
    // of one rank are written in code-point order.
    if ('&' === this.getJunctionSymbol()) {
      parts.sort((a, b) => a[0] - b[0] || cmpCodePoint(a[1], b[1]))
    }
    return parts.map((p) => p[1]).join(this.getJunctionSymbol())
  }

  // Abstract method to be implemented by subclasses to define their junction symbol
  abstract getJunctionSymbol(): string
} /* node:coverage ignore next 6 */


export {
  JunctionVal,
}
