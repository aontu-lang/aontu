/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

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
    // The instantiation flag descends with the mark (ADR-005): a
    // junction inside a template clones its members as instances (the
    // instantiation sites re-path the whole clone afterwards — see
    // repathInstance in Val.ts).
    const childspec = spec?.mark || spec?.dup ?
      { mark: spec?.mark, dup: spec?.dup } : {}
    out.peg = this.peg.map((entry: Val) => entry.clone(ctx, childspec))
    return out
  }

  get canon() {
    return this.peg.map((v: Val) => {
      return (v as any).isJunction && Array.isArray(v.peg) && 1 < v.peg.length ?
        '(' + v.canon + ')' : v.canon // v.id + '=' + v.canon
    }).join(this.getJunctionSymbol()) // + '<' + (this.mark.hide ? 'H' : '') + '>'
  }

  // Abstract method to be implemented by subclasses to define their junction symbol
  abstract getJunctionSymbol(): string
} /* node:coverage ignore next 6 */


export {
  JunctionVal,
}
