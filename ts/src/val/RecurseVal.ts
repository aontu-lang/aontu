/* Copyright (c) 2025 Richard Rodger, MIT License */


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
import { aliasPathSegment } from '../aliasname'

import { FeatureVal } from './FeatureVal'
import { ConjunctVal } from './ConjunctVal'
import { unite } from '../unify'
import { propagateMarks, walk } from '../utility'


class RecurseVal extends FeatureVal {
  isRecurse = true
  isGenable = true
  // LAST in a conjunct fold, after even the graph atoms: the residual
  // wants to see the assembled concrete structure it expands against.
  cjo = 47000

  // The target path, absolute from the root, as the reference spelled
  // it.
  target: string[]
  // Expansion depth so far along this chain, charged against the
  // depth budget (the T-1 backstop).
  xc: number

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.target = (spec as any).target ?? []
    this.xc = (spec as any).xc ?? 0
    // A settled residual: a type() body carrying one must settle, and
    // an unmet recursion is its own value until data arrives.
    this.dc = DONE
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out: any = super.clone(ctx, spec)
    out.target = this.target
    out.xc = this.xc
    return out
  }

  private body(ctx: AontuContext): Val | undefined {
    return walkTarget(ctx.root, this.target)
      ?? walkTarget((ctx as any)._fixroot, this.target)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer

    if (null == peer || true === p.isTop) {
      return this
    }

    // The same fixpoint twice is one fixpoint.
    if (true === p.isRecurse) {
      if (this.target.length === p.target.length
        && this.target.every((s, i) => s === p.target[i])) {
        return this
      }
      const out = new ConjunctVal({ peg: [this, peer] }, ctx)
      propagateMarks(this, out)
      out.path = this.path
      return out
    }

    // CONCRETE STRUCTURE: expand one level against it.
    if (true === p.isMap || true === p.isList || true === p.isScalar) {
      if (ctx.budget.depth <= this.xc) {
        return makeNilErr(ctx, 'recursion_budget', this, peer, 'recurse',
          { target: this.targetSpelling })
      }
      const body = this.body(ctx)
      if (undefined === body) {
        // The definition has not assembled yet (an early pass): hold
        // the peer beside the residual and try again when it has.
        const out = new ConjunctVal({ peg: [this, peer] }, ctx)
        propagateMarks(this, out)
        out.path = this.path
        return out
      }
      const level: any = body.clone(ctx, {
        dup: true, path: [...ctx.path],
      } as any)
      walk(level, (_key: string | number | undefined, v: Val) => {
        v.mark.type = false
        v.mark.hide = false
        return v
      })
      bumpRecurse(level, this.xc + 1)
      return unite(ctx, level, peer, 'recurse-expand')
    }

    // Anything else -- a func still resolving, a reference, a
    // constraint -- waits beside the residual.
    const out = new ConjunctVal({ peg: [this, peer] }, ctx)
    propagateMarks(this, out)
    out.path = this.path
    return out
  }

  get targetSpelling(): string {
    return '$.' + this.target.map(aliasPathSegment).join('.')
  }

  get canon(): string {
    return this.targetSpelling
  }

  gen(ctx: AontuContext) {
    makeNilErr(ctx, 'recursion_unexpanded', this, undefined, 'recurse',
      { target: this.targetSpelling })
    return undefined
  }
}


// walkTarget descends a tree by the residual's absolute target path,
// answering the definition node or undefined.
function walkTarget(root: any, target: string[]): Val | undefined {
  let node: any = root
  for (const seg of target) {
    node = node?.peg?.[seg]
  }
  return null != node && true === node.isVal ? node : undefined
}


// bumpRecurse stamps the expansion depth onto every residual inside a
// freshly cloned level, so descent is charged along the chain.
function bumpRecurse(v: any, xc: number): void {
  if (null == v || true !== v.isVal) {
    return
  }
  if (true === v.isRecurse) {
    v.xc = Math.max(v.xc, xc)
    return
  }
  if (true === v.isRef) {
    v.rxc = Math.max(v.rxc ?? 0, xc)
    return
  }
  const peg: any = v.peg
  if (true === v.isMap && null != peg) {
    for (const k of Object.keys(peg)) {
      bumpRecurse(peg[k], xc)
    }
  }
  else if (true === v.isList && Array.isArray(peg)) {
    for (const e of peg) {
      bumpRecurse(e, xc)
    }
  }
  else if (true === v.isConjunct && Array.isArray(peg)) {
    for (const e of peg) {
      bumpRecurse(e, xc)
    }
  }
  if (null != v.spread?.cj) {
    bumpRecurse(v.spread.cj, xc)
  }
}


function containsRecurseOf(v: any, target: string[], depth?: number): boolean {
  const d = depth ?? 0
  if (null == v || true !== v.isVal || 8 < d) {
    return false
  }
  if (true === v.isRecurse) {
    return v.target.length === target.length
      && v.target.every((s: string, i: number) => s === target[i])
  }
  if (true === v.isRef && Array.isArray(v.peg)) {
    if (v.peg.length === target.length
      && v.peg.every((s: any, i: number) => s === target[i])) {
      return true
    }
  }
  const peg: any = v.peg
  if (true === v.isMap && null != peg) {
    for (const k of Object.keys(peg)) {
      if (containsRecurseOf(peg[k], target, d + 1)) {
        return true
      }
    }
  }
  else if ((true === v.isList || true === v.isConjunct || true === v.isDisjunct)
    && Array.isArray(peg)) {
    for (const e of peg) {
      if (containsRecurseOf(e, target, d + 1)) {
        return true
      }
    }
  }
  if (null != v.spread?.cj && containsRecurseOf(v.spread.cj, target, d + 1)) {
    return true
  }
  return false
} /* node:coverage ignore next 7 */


export {
  RecurseVal,
  bumpRecurse,
  containsRecurseOf,
}
