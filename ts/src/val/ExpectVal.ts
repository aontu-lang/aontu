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

  get canon() { return this.peg.canon }

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Expect', this, peer)

    let out: Val = this

    if (!peer.isTop) {
      // Expectations meet as one: nested, each later meet walked both
      // halves again, twice the work for every spread that met the value.
      const other = true === peer.isExpect ? peer as ExpectVal : undefined
      const peeru = unite(te ? ctx.clone({ explain: ec(te, 'EXPECT') }) : ctx,
        undefined === other ? peer : other.peg, this.peg, 'expect-self')

      const theirs = undefined === other ? peer : other.peer
      const acc = undefined === this.peer || undefined === theirs ? this.peer ?? theirs :
        unite(te ? ctx.clone({ explain: ec(te, 'PEER') }) : ctx, this.peer, theirs, 'expect-peer')

      if (peeru.isGenable) {
        out = peeru
      }
      else {
        const e = new ExpectVal({ peg: peeru }, ctx)
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
