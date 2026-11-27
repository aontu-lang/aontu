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
import { superOf, probeOf, unprobe } from './SuperFuncVal'
import { meetRanked, unread } from './DisjunctVal'
import { ConjunctVal } from './ConjunctVal'
import { genHeld } from '../genrec'
import { member } from './RefVal'


function prefInnerPeg(v: Val): Val {
  let out: any = v
  while (true === out?.isPref) {
    out = out.peg
  }
  return out
}


// An arm's path is the arm's to fail, maybe() takes a stray path, and a check's argument reads at the check's place.
function strayRef(v: Val, which: (ref: any, at: any[]) => boolean, at?: any[]): any {
  const n: any = prefInnerPeg(v)
  const args: any[] | undefined = n.pending?.args
  const kids: any[] = true === n.isBag || true === n.isConjunct || true === n.isOp ||
    (true === n.isFunc && true !== n.isMaybeFunc) ? Object.values(n.peg) : (args ?? [])
  return true === n.isRef ? (which(n, at ?? n.path) ? n : undefined) :
    kids.reduce((found, kid) => found ??
      strayRef(kid, which, undefined === args ? undefined : n.path), undefined)
}


// A list position is a number in one path and its digits in another.
const under = (path: any[], to: any[]): boolean => path.every((p, i) => String(p) === String(to[i]))


function strayIn(v: Val, path: any[]): any {
  return strayRef(v, (ref: any, at: any[]) => {
    const to = ([] as any[]).concat(ref.plainRefPath(at))
    return under(path, to) && namesNothing(v, to.slice(path.length))
  })
}


// A step to a member a settled value lacks, or into a nested default; one still waiting proves nothing.
function namesNothing(v: Val, parts: any[]): boolean {
  let node: any = prefInnerPeg(v)
  for (const part of parts) {
    if (true !== node.isBag) {
      return node.done
    }
    const kid = member(node, part)
    if (undefined === kid) {
      return 'string' === typeof part
    }
    node = kid
  }
  return false
}


class PrefVal extends FeatureVal {
  isPref = true
  isGenable = true
  cjo = 30000

  superpeg!: Val


  rank: number = 0

  narrowed?: Val

  alone?: Val

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


  private restand(met: Val, ctx: AontuContext, alone?: Val): Val {
    let out: Val = met
    for (let rI = 0; rI <= this.rank; rI++) {
      out = new PrefVal({ peg: out }, ctx)
    }
    (out as PrefVal).alone = alone ?? this.alone ?? prefInnerPeg(this)
    return this.place(out)
  }


  // A peer of one rank meets the override space too: either's bound holds.
  private overMet(peer: PrefVal, met: PrefVal, ctx: AontuContext): PrefVal {
    const gate = this.superpeg.canon === peer.superpeg.canon ? this.superpeg :
      trialUnify(ctx, this.superpeg.clone(ctx), peer.superpeg)
    if (undefined === gate || met.superpeg.canon === gate.canon) {
      return met
    }
    const stood = this.restand(prefInnerPeg(met), ctx, met.alone) as PrefVal
    stood.narrowed = gate
    stood.superpeg = gate
    return stood
  }


  // The default read on its own, before any data: in the schema's own tree under vet (ruling 40).
  private own(ctx: AontuContext, alone: Val = this.alone ?? prefInnerPeg(this)): Val | undefined {
    const octx = null == (ctx as any)._ownroot ? ctx : ctx.clone({ root: (ctx as any)._ownroot })
    return trialUnify(octx.holdArm(this.path, alone, undefined, true), alone.clone(ctx), top())
  }


  // Ruling 40: the parent arm lifts the default as read on its own, each template read at a member it meets first.
  private parentArm(ctx: AontuContext): Val {
    const own = this.own(ctx)
    const probe = undefined === own ? undefined : probeOf(ctx, own)
    const met = undefined === probe ? undefined : trialUnify(ctx, (own as Val).clone(ctx), probe)
    const read = (undefined === met ? undefined : this.own(ctx, met)) ?? own
    return undefined === read ? this.superpeg.clone(ctx) :
      unite(ctx, unprobe(superOf(ctx, read)), this.superpeg.clone(ctx), 'pref/lift')
  }


  // Only a path to a place outside the default: one into it, a peer alone can answer.
  private waitsForPath(ctx: AontuContext): boolean {
    const own = this.own(ctx)
    return undefined !== own && unread(own, (ref: any) =>
      !under(this.path, ([] as any[]).concat(ref.plainRefPath())))
  }


  // Ruling 53: a path into the default's own place that names no member there, once all has settled.
  private stray(ctx: AontuContext, v: Val): Val | undefined {
    const stray = strayIn(v, this.path)
    return undefined === stray ? undefined : makeNilErr(ctx, 'no_path', stray)
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


  // Scalar defaults of one rank meet as the disjunctions they stand
  // for: each stands only where the other's override space admits it.
  private meetPref(peer: PrefVal, ctx: AontuContext): Val {
    const gate = trialUnify(ctx, this.superpeg.clone(ctx),
      peer.superpeg.clone(ctx))

    if (undefined === gate) {
      return makeNilErr(ctx, 'empty', this, peer, 'unify')
    }

    const strongMet = trialUnify(ctx, prefInnerPeg(this).clone(ctx),
      peer.superpeg.clone(ctx))
    const weakMet = trialUnify(ctx, this.superpeg.clone(ctx),
      prefInnerPeg(peer).clone(ctx))

    if (undefined !== strongMet && undefined !== weakMet) {
      const peg = trialUnify(ctx, prefInnerPeg(this).clone(ctx),
        prefInnerPeg(peer))

      return undefined === peg
        ? makeNilErr(ctx, 'pref_rank_clash', this, peer, 'unify')
        : this.stand(peg, gate, ctx)
    }

    return undefined !== strongMet ? this.stand(strongMet, gate, ctx)
      : undefined !== weakMet ? peer.stand(weakMet, gate, ctx)
        : gate
  }


  // PrefVal unify always returns a PrefVal
  // PrefVals can only be removed by becoming Nil in a Disjunct
  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Pref', this, peer)
    let out: Val = this
    let why = ''

    if (!this.peg.done && !(true === ctx.settle && 0 < this.dc)) {
      const rctx = (te ? ctx.clone({ explain: ec(te, 'RES') }) : ctx)
        .holdArm(this.path, prefInnerPeg(this))
      // A default its peers have met that dies once its paths read
      // leaves the parent arm, as `x | super(x)` does.
      if (null != this.narrowed && undefined === trialUnify(rctx, this.peg.clone(ctx), top())) {
        out = unite(ctx, this.parentArm(ctx), top(), 'pref/over')
        explainClose(te, out)
        return out
      }
      this.peg = unite(rctx, this.peg, top(), 'pref/resolve')
      this.rank = this.peg instanceof PrefVal ? 1 + this.peg.rank : 0
      this.resuper(ctx)
    }

    // `*nil` is `nil | super(nil)`: no arm holds a value, as in `nil | nil`.
    const inner: any = prefInnerPeg(this)
    if (true === inner.isNil && 'literal_nil' === inner.why) {
      const err = makeNilErr(ctx, 'empty', this, peer, 'unify')
      explainClose(te, err)
      return err
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

      else if (this.rank !== peer.rank) {
        out = meetRanked(ctx, this, peer)
        explainClose(te, out)
        return out
      }

      else if (true === (prefInnerPeg(this) as any).isScalar &&
        true === (prefInnerPeg(peer) as any).isScalar) {
        out = this.meetPref(peer, ctx)
        why += 'gated'
      }

      else {
        const peg = trialUnify(ctx, prefInnerPeg(this).clone(ctx),
          prefInnerPeg(peer))

        out = undefined === peg
          ? makeNilErr(ctx, 'pref_rank_clash', this, peer, 'unify')
          : this.overMet(peer, this.restand(peg, ctx, peg.clone(ctx)) as PrefVal, ctx)
        why += 'rank-same'
      }
    }
    else if (true === (peer as any).isDisjunct) {
      out = meetRanked(ctx, this, peer)
      explainClose(te, out)
      return out
    }
    else if (!peer.isTop) {
      why += 'super-'

      // A path the value can't read on its own yet is read before a peer meets the preference.
      if (unread(prefInnerPeg(this)) && this.waitsForPath(ctx)) {
        const held = this.place(new ConjunctVal({ peg: [this, peer] }, ctx))
        explainClose(te, held)
        return held
      }

      const met = trialUnify(ctx.holdArm(this.path, prefInnerPeg(this), peer),
        prefInnerPeg(this).clone(ctx), peer)

      if (undefined !== met) {
        // An override space the peer empties leaves the preference
        // standing with nothing left to replace it, not a conflict.
        const space = trialUnify(te ? ctx.clone({ explain: ec(te, 'GATE') }) : ctx,
          this.superpeg.clone(ctx), peer)
        const gate = undefined !== space ? space : this.superpeg

        out = (!met.done && true === ctx.settle ? this.stray(ctx, met) : undefined) ??
          this.stand(met, gate, ctx)

        why += 'stands'
        explainClose(te, out)
        out.dc = met.done || true === ctx.settle ? DONE : this.dc + 1
        return out
      }

      // The override arm is trialled too: its failure is not the
      // answer, it is half of the reason the answer is `empty`, and a
      // recorded `no_scalar_unify` would be the code the reader sees
      // however the refusal is relabelled afterwards.
      const over = trialUnify(ctx, this.parentArm(ctx), peer)

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
    const waits = peer.isTop ? !this.peg.done :
      true === (out as any).isPref && !prefInnerPeg(out).done
    if (waits && true === ctx.settle) {
      out = this.stray(ctx, prefInnerPeg(peer.isTop ? this : out)) ?? out
    }
    out.dc = waits && true !== ctx.settle ? this.dc + 1 : DONE


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
    out.alone = this.alone
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

    return null == this.genrec ? val.gen(ctx) : genHeld(ctx, this)
  }
} /* node:coverage ignore next 7 */


export {
  PrefVal,
  prefInnerPeg,
  strayIn,
}
