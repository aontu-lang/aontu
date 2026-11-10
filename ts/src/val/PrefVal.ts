/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import { AontuContext } from '../ctx'
import { unite } from '../unify'
import { AontuError, makeNilErr } from '../err'

import {
  explainOpen,
  ec,
  explainClose,
  canonRiders,
} from '../utility'


import { top } from './top'

import { FeatureVal } from './FeatureVal'
import { trialUnify } from './FuncBaseVal'
import { NilVal } from './NilVal'
import { superOf } from './SuperFuncVal'


function prefInnerPeg(v: Val): Val {
  let out: any = v
  while (true === out?.isPref) {
    out = out.peg
  }
  return out
}


class PrefVal extends FeatureVal {
  isPref = true
  isGenable = true
  cjo = 30000

  superpeg!: Val


  rank: number = 0

  narrowed?: Val

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)


    if (spec.peg instanceof PrefVal) {
      this.rank = 1 + spec.peg.rank
    }

    this.resuper(ctx)
  }


  private resuper(ctx?: AontuContext) {
    let peg: any = this.peg
    while (true === peg?.isPref) {
      peg = peg.peg
    }

    const base = superOf(ctx as AontuContext, peg)

    // A gate that a meet has already narrowed stays narrowed: the
    // override space only ever shrinks.
    this.superpeg = null == this.narrowed ? base
      : unite(ctx as AontuContext, base, this.narrowed,
        'pref-narrow/' + this.id)
  }


  private restand(met: Val, ctx: AontuContext): Val {
    let out: Val = met
    for (let rI = 0; rI <= this.rank; rI++) {
      out = new PrefVal({ peg: out }, ctx)
    }
    return this.place(out)
  }


  // A peer of one rank meets the override space too: either's bound holds.
  private overMet(peer: PrefVal, met: PrefVal, ctx: AontuContext): PrefVal {
    const gate = this.superpeg.canon === peer.superpeg.canon ? this.superpeg :
      trialUnify(ctx, this.superpeg.clone(ctx), peer.superpeg)
    if (undefined === gate || met.superpeg.canon === gate.canon) {
      return met
    }
    const stood = this.restand(prefInnerPeg(met), ctx) as PrefVal
    stood.narrowed = gate
    stood.superpeg = gate
    return stood
  }


  // Unchanged on both counts is the SAME preference, returned as
  // itself: minting a new one every pass would keep the fixpoint
  // moving for ever.
  private stand(met: Val, gate: Val, ctx: AontuContext): Val {
    if (met.same(prefInnerPeg(this)) && gate.same(this.superpeg)) {
      return this
    }
    const stood = this.restand(met, ctx) as PrefVal
    stood.narrowed = gate
    stood.superpeg = gate
    return stood
  }


  // Scalar defaults meet as the disjunctions they stand for: each
  // stands only where the other's override space admits it, so a value
  // either one has already met survives the other's rank.
  private meetPref(peer: PrefVal, ctx: AontuContext): Val {
    const strong = peer.rank < this.rank ? peer : this
    const weak = strong === this ? peer : this

    const strongMet = trialUnify(ctx, prefInnerPeg(strong).clone(ctx),
      weak.superpeg.clone(ctx))
    const weakMet = trialUnify(ctx, strong.superpeg.clone(ctx),
      prefInnerPeg(weak).clone(ctx))
    const space = trialUnify(ctx, strong.superpeg.clone(ctx),
      weak.superpeg.clone(ctx))

    if (undefined === strongMet && undefined === weakMet) {
      return space ?? makeNilErr(ctx, 'empty', this, peer, 'unify')
    }

    // An emptied override space stays a quiet nil, as a peer's does.
    const gate = space ?? new NilVal({ why: 'empty' }, ctx)

    if (strong.rank === weak.rank &&
      undefined !== strongMet && undefined !== weakMet) {
      const peg = trialUnify(ctx, prefInnerPeg(this).clone(ctx),
        prefInnerPeg(peer))

      return undefined === peg
        ? makeNilErr(ctx, 'pref_rank_clash', this, peer, 'unify')
        : this.stand(peg, gate, ctx)
    }

    return undefined !== strongMet ? strong.stand(strongMet, gate, ctx)
      : weak.stand(weakMet as Val, gate, ctx)
  }


  // PrefVal unify always returns a PrefVal
  // PrefVals can only be removed by becoming Nil in a Disjunct
  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Pref', this, peer)
    let out: Val = this
    let why = ''

    if (!this.peg.done && !(true === ctx.settle && 0 < this.dc)) {
      const resolved = unite(te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx,
        this.peg, top(), 'pref/resolve')
      this.peg = resolved
      this.resuper(ctx)
    }


    if (peer instanceof PrefVal) {
      why += 'pref-'
      if (this.id === peer.id) {
        out = this
        why += 'same'
      }

      // Avoid MAXCYCLE errors
      else if (this.peg.id === peer.peg.id) {
        out = this.overMet(peer, this, ctx)
        why += 'same-peg'
      }

      else if (true === (prefInnerPeg(this) as any).isScalar &&
        true === (prefInnerPeg(peer) as any).isScalar) {
        out = this.meetPref(peer, ctx)
        why += 'gated'
      }

      else if (this.rank < peer.rank) {
        out = this
        why += 'rank-win'
      }
      else if (peer.rank < this.rank) {
        out = peer
        why += 'rank-lose'
      }
      else {

        const peg = trialUnify(ctx, prefInnerPeg(this).clone(ctx),
          prefInnerPeg(peer))

        out = undefined === peg
          ? makeNilErr(ctx, 'pref_rank_clash', this, peer, 'unify')
          : this.overMet(peer, this.restand(peg, ctx) as PrefVal, ctx)
        why += 'rank-same'
      }
    }
    else if (!peer.isTop) {
      why += 'super-'

      const met = trialUnify(ctx, prefInnerPeg(this).clone(ctx), peer)

      if (undefined !== met) {
        // An override space the peer empties leaves the preference
        // standing with nothing left to replace it, not a conflict.
        const space = trialUnify(te ? ctx.clone({ explain: ec(te, 'GATE') }) : ctx,
          this.superpeg.clone(ctx), peer)
        const gate = undefined !== space ? space
          : true === this.superpeg.isNil ? this.superpeg
            : new NilVal({ why: 'empty' }, ctx)

        out = this.stand(met, gate, ctx)

        why += 'stands'
        explainClose(te, out)
        out.dc = met.done || true === ctx.settle ? DONE : this.dc + 1
        return out
      }

      // The override arm is trialled too: its failure is not the
      // answer, it is half of the reason the answer is `empty`, and a
      // recorded `no_scalar_unify` would be the code the reader sees
      // however the refusal is relabelled afterwards.
      const over = trialUnify(ctx, this.superpeg.clone(ctx), peer)

      out = undefined !== over ? over
        // A peer that arrived already failed keeps its own refusal:
        // that is its failure, not the default's.
        : peer.isNil ? peer
          : makeNilErr(ctx, 'empty', this, peer, 'unify')


      // }
    }
    else {
      why += 'none'
    }

    // Every pref result is DONE (as in go/pref.go), but one whose own
    // value still waits, as a reference may: until the settling pass.
    out.dc = peer.isTop && !this.peg.done && true !== ctx.settle ? this.dc + 1 : DONE


    ctx.explain && explainClose(te, out)

    return out
  }


  same(peer: Val): boolean {
    if (null == peer) {
      return false
    }

    let pegsame = (this.peg === peer.peg) ||
      (this.peg.isVal && this.peg.same(peer.peg))

    return pegsame
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as PrefVal)

    if (null != this.narrowed) {
      out.narrowed = this.narrowed
      out.superpeg = this.superpeg
    }
    if (true === spec?.dup && true === (this.peg as any)?.isVal) {
      out.peg = this.peg.clone(ctx, { dup: true })
    }
    return out
  }


  get canon() {
    // return this.pref instanceof Nil ? this.peg.canon : '*' + this.pref.canon
    return '*' + canonRiders(this.peg)
  }


  gen(ctx?: AontuContext) {
    let val = this.peg

    if (val.isNil) {
      if (null == ctx) {
        throw new AontuError(val.msg)
      }
    }

    return val.gen(ctx)
  }
} /* node:coverage ignore next 7 */


export {
  PrefVal,
  prefInnerPeg,
}
