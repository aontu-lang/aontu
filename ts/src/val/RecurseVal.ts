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
import { ALIAS_NAME_RE, aliasBareName, aliasPathSegment } from '../aliasname'

import { FeatureVal } from './FeatureVal'
import { undeclared } from './IdentFuncVal'
import { ConjunctVal } from './ConjunctVal'
import { unite } from '../unify'
import { propagateMarks, walk } from '../utility'


class RecurseVal extends FeatureVal {
  isRecurse = true
  isGenable = true
  // LAST in a conjunct fold, after even the graph atoms: the residual
  // wants to see the assembled concrete structure it expands against.
  cjo = 47000

  // The target path, absolute from the root, as the reference spelled it.
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
    if (true === p.isRecurse && this.target.length === p.target.length
      && this.target.every((s, i) => s === p.target[i])) {
      return this
    }

    // A disjunction distributes over the residual, branch by branch.
    if (true === p.isDisjunct) {
      return peer.unify(this, ctx)
    }

    // CONCRETE STRUCTURE, or a kind, which picks the body's branch as
    // structure does: expand one level against it.
    if (true === p.isMap || true === p.isList || true === p.isScalar ||
      true === p.isScalarKind || true === p.isMapKind || true === p.isListKind) {
      if (ctx.budget.depth <= this.xc) {
        return makeNilErr(ctx, 'recursion_budget', this, peer, 'recurse',
          { target: this.targetSpelling })
      }
      const body = this.body(ctx)
      if (undefined === body) {
        // The definition has not assembled yet (an early pass): wait.
        const out = new ConjunctVal({ peg: [this, peer] }, ctx)
        propagateMarks(this, out)
        out.path = this.path
        return out
      }
      const level: any = undeclared(body.clone(ctx, {
        dup: true, path: [...ctx.path],
      } as any))
      walk(level, (_key: string | number | undefined, v: Val) => {
        v.mark.type = false
        v.mark.hide = false
        return v
      })
      bumpRecurse(level, this.xc + 1)
      return unite(ctx, level, peer, 'recurse-expand')
    }

    // Anything else waits beside the residual, and beside a settled
    // peer the meet is settled until data arrives.
    const out = new ConjunctVal({ peg: [this, peer] }, ctx)
    propagateMarks(this, out)
    out.path = this.path
    if (true === peer.done) {
      out.dc = DONE
    }
    return out
  }

  // A residual spells as the reference that made it, an alias by name.
  get targetSpelling(): string {
    const path = this.target.map(aliasPathSegment)
    return 1 === path.length && ALIAS_NAME_RE.test(path[0]) ? path[0] :
      '$.' + path.join('.')
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


// walkTarget answers the definition node at the residual's target.
function walkTarget(root: any, target: string[]): Val | undefined {
  let node: any = root
  for (const seg of target) {
    node = throughRider(node)
    node = true === node?.isConjunct ? declaration(node, seg) : node?.peg?.[seg]
  }
  return null != node && true === node.isVal ? node : undefined
}


// A value-transparent rider still being resolved stands for its value:
// the walk reads through it as it reads through a pending mark.
export function throughRider(v: any): any {
  while (true === v?.isFunc
    && (true === v.isMetaFunc || true === v.isDeprecateFunc || true === v.isIdentFunc)
    && !v.done && null != v.peg?.[0]) {
    v = v.peg[0]
  }
  return v
}


// The declaration an alias names, held by the map term of a meet that
// is still folding. A declaration is not a field, so no other term
// contributes to it and the map term's slot is the whole of it.
export function declaration(cj: any, key: string): Val | undefined {
  for (const t of cj.peg) {
    const term = throughRider(t)
    const decl = true === term?.isConjunct ? declaration(term, key) :
      true === term?.isMap && term.aliasKeys.includes(key) ? term.peg[key] : undefined
    if (undefined !== decl) {
      return decl
    }
  }
  return undefined
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


// Each alias v names is followed too, given the root.
function containsRecurseOf(v: any, target: string[], d: number, root?: any,
  seen: Set<string> = new Set()): boolean {
  v = throughRider(v)
  if (null == v || true !== v.isVal || 8 < d) {
    return false
  }
  if (true === v.isRecurse) {
    if (v.target.length === target.length
      && v.target.every((s: string, i: number) => s === target[i])) {
      return true
    }
    // Another alias's residual reaches what its declaration reaches.
    const key: string = v.target[0]
    if (undefined !== root && 1 === v.target.length &&
      ALIAS_NAME_RE.test(aliasBareName(key)) && !seen.has(key)) {
      seen.add(key)
      return containsRecurseOf(walkTarget(root, [key]), target, d + 1, root, seen)
    }
    return false
  }
  if (true === v.isRef && Array.isArray(v.peg)) {
    if (v.peg.length === target.length
      && v.peg.every((s: any, i: number) => s === target[i])) {
      return true
    }
    const key: string | undefined = v.aliasKey
    if (undefined !== root && undefined !== key && !seen.has(key)) {
      seen.add(key)
      return containsRecurseOf(walkTarget(root, [key]), target, d + 1, root, seen)
    }
  }
  const peg: any = v.peg
  if (true === v.isMap && null != peg) {
    for (const k of Object.keys(peg)) {
      if (containsRecurseOf(peg[k], target, d + 1, root, seen)) {
        return true
      }
    }
  }
  else if ((true === v.isList || true === v.isConjunct || true === v.isDisjunct)
    && Array.isArray(peg)) {
    for (const e of peg) {
      if (containsRecurseOf(e, target, d + 1, root, seen)) {
        return true
      }
    }
  }
  if (null != v.spread?.cj && containsRecurseOf(v.spread.cj, target, d + 1, root, seen)) {
    return true
  }
  return false
} /* node:coverage ignore next 7 */


export {
  RecurseVal,
  bumpRecurse,
  containsRecurseOf,
  walkTarget,
}
