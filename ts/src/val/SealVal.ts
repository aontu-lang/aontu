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


// `close()` and `open()` with no argument. `close()` folds LAST in a
// conjunct, so it closes the whole meet rather than the first term it
// finds; `open()` folds first, so it lifts a seal before anything is added.
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
      sealBag(out, this.closed, true)
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

} /* node:coverage ignore next 2 */


function sealCjo(closed: boolean): number {
  return closed ? 130000 : 25000
}


// Closing is recursive, except into a subtree an explicit `open()`
// holds; opening is recursive and marks each bag so a later close stops.
function sealTree(v: any, closed: boolean, dir: boolean = false): void {
  if ((true !== v?.isMap && true !== v?.isList) || (closed && true === v.opened)) {
    return
  }
  v.closed = closed
  v.opened = !closed
  v.dirSealed = closed && dir
  for (const key of Object.keys(v.peg)) {
    sealTree(v.peg[key], closed, dir)
  }
}


// A plain copy: no seal, held nowhere.
function unsealTree(v: any): void {
  if (true === v?.isMap || true === v?.isList) {
    v.closed = false
    v.opened = false
    v.dirSealed = false
    for (const key of Object.keys(v.peg)) {
      unsealTree(v.peg[key])
    }
  }
}


// A copy stands at another place, so a seal its target's place made is a seal of the value there.
function fixSeals(v: any): void {
  if (true === v?.isMap || true === v?.isList) {
    v.dirSealed = false
    for (const key of Object.keys(v.peg)) {
      fixSeals(v.peg[key])
    }
  }
}


// An explicit seal: the bag it names obeys whatever it said before.
function sealBag(v: any, closed: boolean, dir: boolean = false): void {
  if (true === v?.isMap || true === v?.isList) {
    v.opened = false
    sealTree(v, closed, dir)
  }
}


// A child of a closed bag closes as a copy (a reference answers a shared value).
function sealChild(ctx: AontuContext, child: any, dir: boolean = false): Val {
  if (true !== child?.isMap && true !== child?.isList) {
    return child
  }
  if (true === child.closed || true === child.opened) {
    return child
  }
  const out: any = child.clone(ctx)
  sealTree(out, true, dir)
  return out
}


// A directive's seal takes the keys of the other terms at its place, and refuses the data's.
const takes = (bag: any, peer: any): boolean => true === bag.dirSealed && true !== peer?.isData /* node:coverage ignore next 10 */


export {
  SealVal,
  sealCjo,
  sealTree,
  sealBag,
  sealChild,
  takes,
  fixSeals,
  unsealTree,
}
