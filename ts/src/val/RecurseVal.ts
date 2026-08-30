/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE RECURSIVE RESIDUAL (docs/design/RECURSION.0.md): where RefVal's
// prefix test used to answer `path_cycle` for a self-reference --
// `$.Node` written anywhere inside `Node` -- it now answers this
// value: a deferred reference carrying the target path, exactly as a
// constraint atom carries its bound. No new syntax: the reference the
// author wrote simply MEANS the fixpoint.
//
// The three moments of every residual:
//
// - At unification, EXPAND ONE LEVEL PER MEET WITH STRUCTURE: met by
//   a map, list, or scalar, the residual clones the schema body one
//   level -- per destination, under ADR-005's clone discipline -- and
//   unifies the clone with the peer. The clone's own self-reference
//   is again this residual, so each expansion consumes one level of
//   concrete data; data is finite, so expansion terminates
//   (structural descent), with the depth budget as the backstop
//   (recursion_budget).
// - In canon and the aon1- hash, SYMBOLIC: the residual prints as the
//   reference the author wrote, so a recursive schema's canon is
//   finite and round-trips, and the hash pins the mu-form rather than
//   any unrolling.
// - At generation, an unexpanded residual REFUSES with
//   recursion_unexpanded. Guardedness is therefore EMERGENT: under
//   `next?:` the refusal is isolated and the optional key drops;
//   under `*null | $.Node` the preference generates; a REQUIRED
//   recursive field with no data refuses at the instance.

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

  // The schema body the target names, from the ROOT: the fixpoint is
  // over the finished definition, and the definition's own residual
  // keeps it finite. When the root does not contain the target -- the
  // residual was LIFTED out of its defining tree, as vet's anchored
  // meet does -- fall back to ctx._fixroot, the settled tree the
  // lifter kept for exactly this walk.
  private body(ctx: AontuContext): Val | undefined {
    return walkTarget(ctx.root, this.target)
      ?? walkTarget((ctx as any)._fixroot, this.target)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer

    // The self-drive: nothing to advance -- the residual waits for
    // structure. (A null/nil peer never arrives; unite's ladder
    // absorbs both.)
    if (null == peer || true === p.isTop) {
      return this
    }

    // The same fixpoint twice is one fixpoint.
    if (true === p.isRecurse) {
      if (this.target.length === p.target.length
        && this.target.every((s, i) => s === p.target[i])) {
        return this
      }
      // Different targets -- mutual recursion meeting -- are BOTH
      // held: each expands as data arrives, through the fold that
      // keeps a conjunct's members separate.
      const out = new ConjunctVal({ peg: [this, peer] }, ctx)
      propagateMarks(this, out)
      out.path = this.path
      return out
    }

    // CONCRETE STRUCTURE: expand one level against it.
    if (true === p.isMap || true === p.isList || true === p.isScalar) {
      if (ctx.budget.depth <= this.xc) {
        return makeNilErr(ctx, 'recursion_budget', this, peer, 'recurse',
          { target: '$.' + this.target.join('.') })
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
      // ADR-005's clone discipline: the expansion is a per-destination
      // instantiation, so the definition itself is never written
      // into. The clone's type/hide marks are CLEARED at every depth,
      // exactly as a plain reference copy clears them (concreteFlow's
      // rule): the schema is hidden, the instances it expands into
      // are the output.
      // The clone is REBASED to the DRIVE path explicitly (spec.path;
      // the Go twin passes cp(r.path), whose stored paths its clone
      // arms keep clean): the default rebase slices the definition's
      // path by the destination's length, which leaks definition
      // segments into instance paths whenever the destination is
      // shallower -- a residual carried inside a copied definition
      // body (`chain: $.spec.Step` inside Policy, copied to a slot
      // shallower than the definition) reported
      // `$.payments_policy.Policy.chain.then.approver` for the
      // finding Go placed at `$.payments_policy.chain.then.approver`.
      // The drive path is also right under vet's anchored meet, which
      // drives AT the anchor's own path (see vet.ts), so anchored
      // findings land in the schema's namespace in both ports.
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

  get canon(): string {
    return '$.' + this.target.join('.')
  }

  gen(ctx: AontuContext) {
    // An unexpanded residual in a demanded position refuses;
    // guardedness is emergent -- under an optional key the bag's
    // isolated context swallows this and drops the key.
    makeNilErr(ctx, 'recursion_unexpanded', this, undefined, 'recurse',
      { target: '$.' + this.target.join('.') })
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


// containsRecurseOf answers whether a definition holds a residual of
// the given target -- i.e. the definition is (transitively) the
// fixpoint that target names. A reference RESOLVING to such a
// definition must itself answer the residual: cloned instead, every
// reparse of a canon unrolled the schema one more level and canon
// never converged.
function containsRecurseOf(v: any, target: string[], depth?: number): boolean {
  const d = depth ?? 0
  if (null == v || true !== v.isVal || 8 < d) {
    return false
  }
  if (true === v.isRecurse) {
    return v.target.length === target.length
      && v.target.every((s: string, i: number) => s === target[i])
  }
  // A RAW REFERENCE to the target IS the recursion, minted or not:
  // the answer must not depend on whether the definition's own
  // prefix position has been visited yet. Without this arm the
  // answer was ORDER-DEPENDENT -- reparsing a generated canon puts
  // the instance before the definition, its trailing `$.spec.Step`
  // leaves resolved before `Step.then` had minted, and each resolve
  // cloned one more unrolled level until the unify depth guard
  // (unify_cycle) killed the document.
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
