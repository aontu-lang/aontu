/* Copyright (c) 2025 Richard Rodger, MIT License */

// GENERATION: `filter(data, cond)` (G8 phase 2,
// docs/capability-review/g8-generation.md). The children of `data`
// that unify with `cond`, keys preserved for a map and order for a
// list; the children that do not are DROPPED, not refused.
//
//   debugged: filter($.services, {debug: true})
//   sidecars: pack($.debugged, {image: "acme/debug:1.0"})
//
// A CHILD IS KEPT WHEN THE CONDITION CHANGES NOTHING: the meet
// succeeds AND its answer is the child itself, which is to say the
// child ALREADY satisfies the condition. Mere unifiability is not the
// test, and cannot be: a map is open, so `{p:2}` unifies with
// `{debug:true}` perfectly well by GAINING the key -- and a filter
// that keeps everything that could be made to match keeps everything.
// The design named unifiability; its own example
// (`filter($.services, {debug:true})`) is unsatisfiable under it.
//
// There is no predicate language here and there will not be one:
// `cond` is an ordinary Aontu value, so the constraint atoms compose
// with it for free (`filter($.deploy, {replicas: min(3)})`), and a
// document that can filter can be read by anything that can read a
// document.
//
// A FAILED CHILD IS AN ANSWER, not an error. The meet runs in TRIAL
// MODE -- the mechanism disjunction already uses to try each member
// against a peer (trialUnify in FuncBaseVal) -- so a child that does
// not match costs nothing and reports nothing.
//
// TOTALITY. `filter` iterates a finite, settled bag and cannot call
// itself, exactly as `pack` and `each` cannot.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { FuncBaseVal, trialUnify } from './FuncBaseVal'
import { repathInstance } from './Val'
import { fillPlace } from './PlaceVal'


class FilterFuncVal extends FuncBaseVal {
  isFilterFunc = true

  // THE STAGING RULE (G8 phase 0). A subset of a bag that is still
  // being merged into is a subset of the wrong bag.
  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'filter'
  }


  // Neither argument is driven by the base: `unify` below drives the
  // DATA by hand, because a staged func must advance the argument it
  // is waiting on every pass rather than only on the one it fires.
  //
  // The CONDITION is not driven at all, and that is deliberate: it is
  // a template, tested against each child at that child's position,
  // so it may hold a `_` (G8 phase 3, the child it is being tested
  // against) or a relative reference — neither of which has an answer
  // at the call site. Driving it there would freeze both.
  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const ready = this.driveStagedArgs(ctx, 1)

    if (!ready || !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const data: any = args[0]
    const cond: Val = args[1]

    // The trial is run against CLONES: `unite` refines a bag in place,
    // and a child that failed the test must reach the result -- when
    // it passes -- exactly as it was written.
    //
    // Canon is the comparison because canon is what "the same value"
    // MEANS in this language: it is the form the two ports agree on,
    // the form `aontu diff` compares, and the form a hash is taken of.
    const keeps = (child: Val, kctx: AontuContext): boolean => {
      // `_` inside the condition binds the child being tested (G8
      // phase 3), so a condition can be about the child as a whole
      // rather than only about its shape. The condition is cloned as
      // a FULL instance per trial (`dup`, ADR-005) — a bare clone
      // shares call/pref innards across trials (see PackFuncVal).
      const inst = cond.clone(kctx, { dup: true })
      repathInstance(inst, inst.path)
      const test = fillPlace(inst, child, kctx)
      const met = trialUnify(kctx, child.clone(kctx), test)
      return undefined !== met && met.canon === child.canon
    }

    if (true === data?.isMap) {
      const peg: Record<string, Val> = {}
      for (const key of Object.keys(data.peg)) {
        const kctx = ctx.descend(key)
        if (keeps(data.peg[key], kctx)) {
          peg[key] = data.peg[key].clone(kctx)
        }
      }
      return new MapVal({ peg }, ctx)
    }

    if (true === data?.isList) {
      const peg: Val[] = []
      for (const el of data.peg as Val[]) {
        // The element context is the position it will END UP at, which
        // is its index in the RESULT: dropping the third of five moves
        // the fourth up, and a kept element must be pathed where it
        // lands rather than where it came from.
        const ectx = ctx.descend(String(peg.length))
        if (keeps(el, ectx)) {
          peg.push(el.clone(ectx))
        }
      }
      return new ListVal({ peg }, ctx)
    }

    return makeNilErr(ctx, 'filter_data', this)
  }

} /* node:coverage ignore next 5 */


export {
  FilterFuncVal,
}
