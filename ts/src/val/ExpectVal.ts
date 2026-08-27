/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { unite } from '../unify'

import {
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import { makeNilErr } from '../err'

import { Val } from './Val'
import { FeatureVal } from './FeatureVal'


class ExpectVal extends FeatureVal {
  isExpect = true

  peer?: Val
  parent?: Val
  key?: string

  // An expectation canons as THE EXPECTATION ITSELF -- the peg the peer
  // must satisfy. Val.canon's default was the empty string, which
  // rendered a key with no value (`{"r":}`): text that is not a document
  // and could not be reparsed, breaking canon's round-trip contract in
  // both engines (issue #43).
  //
  // Not `top`, which was the first fix here and was wrong. An ExpectVal
  // is created for EVERY peer-introduced non-generable key, not just for
  // `&:` spread children -- `m:{x:1} m:{y:string}` makes one at `y` with
  // no spread in sight -- so rendering `top` erased the `string` and the
  // canon reparsed into a document that accepts values the original
  // rejects. A canon that silently drops a constraint is worse than one
  // that fails to parse. Go's ExpectVal.Canon renders the same peg.
  get canon() { return this.peg.canon }

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  // PURE, deliberately (the unequal-spread crosswire, BUGS.md §6-§7).
  // The old body accumulated `this.peer` IN PLACE, which was invisible
  // while an expectation only ever lived at one destination -- but the
  // spread-combination meet (MapVal.unify's 'map-self' unite) bakes an
  // ExpectVal INTO the combined template, and a path-independent
  // template is SHARED across every destination (spreadClone tier 1).
  // One stateful node in a shared template unified each sibling's own
  // data with the next sibling's ($.w.y.r: "Cannot unify value: 6 with
  // value: 5", both values sibling data). An expectation now answers
  // with a NEW node when it must keep accumulated state, so a shared
  // template's expect stays exactly what was written.
  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Expect', this, peer)

    let out: Val = this

    if (!peer.isTop) {
      const acc = undefined === this.peer ? peer :
        unite(te ? ctx.clone({ explain: ec(te, 'PEER') }) : ctx, this.peer, peer, 'expect-peer')

      const peeru =
        unite(te ? ctx.clone({ explain: ec(te, 'EXPECT') }) : ctx, acc, this.peg, 'expect-self')

      if (peeru.isGenable) {
        out = peeru
      }
      else {
        // Still an expectation: carry the accumulated peer forward in a
        // fresh node stored at THIS destination by the caller, leaving
        // `this` -- possibly a shared template's child -- untouched.
        const e = new ExpectVal({ peg: this.peg }, ctx)
        e.key = this.key
        e.parent = this.parent
        e.peer = acc
        out = e
      }
    }

    out.dc = DONE

    ctx.explain && explainClose(te, out)

    return out
  }


  gen(ctx: AontuContext) {
    // Unresolved expect cannot be generated, so always an error. The
    // CALL is the point -- it records the failure on ctx -- and there
    // is no value to bind: generation answers nothing.
    makeNilErr(
      ctx,
      'expect',
      this.peg,
      this.peer
    )

    return undefined
  }


  inspection(d?: number) {
    return 'key=' + this.key +
      ',peg=' + this.peg?.inspect(d) +
      ',peer=' + this.peer?.inspect(d) +
      ',parent=' + this.parent?.inspect(d)
  }

} /* node:coverage ignore next 6 */


export {
  ExpectVal,
}
