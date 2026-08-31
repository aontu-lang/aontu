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
    // A JUNCTION'S MEMBERS SIT AT THE JUNCTION'S OWN POSITION. That is
    // the rule `repathInstance` (Val.ts) states for the instance walk
    // -- a conjunct's members occupy the conjunct's position, which is
    // what `A & B` means -- and it holds for every clone, not only for
    // marked ones.
    //
    // Val.clone's ctx cut cannot derive it: MapVal.clone hands a child
    // its path through the SPEC rather than by descending the ctx, so
    // a member left to the cut takes the DRIVING context's path -- the
    // map's -- and loses the field key it sits under. A conjunct
    // member reached through a reference into a position at least as
    // deep as its definition then carried the entity's path, and every
    // reader of `Val.path` was told the wrong position: a rel()-minted
    // link took the ENTITY's key as its predicate, so `inverse(n)`
    // looked for a mirror under a relation nobody declared and
    // reported a written mirror missing.
    //
    // The instantiation flag still descends with the mark (ADR-005).
    // Go states the same invariant directly (go/clone.go, cloneAt), so
    // this restores parity rather than inventing a behaviour.
    const childspec: any = spec?.mark || spec?.dup ?
      { mark: spec?.mark, dup: spec?.dup, path: out.path }
      : { path: out.path }
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
