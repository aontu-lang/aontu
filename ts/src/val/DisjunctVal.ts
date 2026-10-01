/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import { AontuContext } from '../ctx'

import { AontuError, descErr, makeNilErr } from '../err'
import { exactJSON } from '../exactjson'
import { ride, unite } from '../unify'

import {
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import {
  Site
} from '../site'

import {
  top
} from './top'

import { TRIAL_NIL } from '../val/NilVal'
import { PrefVal, prefInnerPeg } from '../val/PrefVal'
import { JunctionVal } from '../val/JunctionVal'


class DisjunctVal extends JunctionVal {
  isDisjunct = true
  isGenable = true
  cjo = 35000

  prefsRanked = false

  constructor(
    spec: {
      peg: Val[]
    },
    ctx?: AontuContext,
    _sites?: Site[]
  ) {
    super(spec, ctx)
  }


  // NOTE: mutation!
  append(peer: Val): DisjunctVal {
    super.append(peer)
    this.prefsRanked = false
    return this
  }


  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Disjunct', this, peer)

    if (!this.prefsRanked) {
      const ranked = this.rankPrefs(ctx)
      // A clash between equal-rank defaults refuses for the whole
      // disjunction (R2): the disagreement IS the answer.
      if (null != ranked && ranked.isNil) {
        return ranked
      }
    }


    let done = true

    let oval: Val[] = []

    const savedErr = ctx.err
    const savedTrialMode = ctx._trialMode
    const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err')
    const ownTrialMode =
      Object.prototype.hasOwnProperty.call(ctx, '_trialMode')
    const savedFlows: Map<string, Val> | undefined = (ctx as any).referflows
    const staged: (Map<string, Val> | undefined)[] = []
    ctx._trialMode = true
    let gate: number[] | undefined = undefined
    try {
      for (let vI = 0; vI < this.peg.length; vI++) {
        const v = this.peg[vI]
        const trialErr: any[] = []
        ctx.err = trialErr
        if (undefined !== savedFlows) {
          staged[vI] = new Map()
          ;(ctx as any).referflows = staged[vI]
        }

        oval[vI] = unite(te ? ctx.clone({ explain: ec(te, 'DIST:' + vI) }) : ctx, v, peer, 'dj-peer')

        if (0 < trialErr.length) {
          oval[vI] = TRIAL_NIL
        }
        else if (v instanceof PrefVal &&
          !(peer as any).isPref && !peer.isTop &&
          true === (prefInnerPeg(v) as any).isScalar) {
          // A candidate for the admission gate below: a non-pref,
          // non-top peer met a scalar preference inside this
          // disjunction.
          ; (gate = gate ?? []).push(vI)
        }

        done = done && DONE === oval[vI].dc
      }

      if (undefined !== gate) {
        for (const gI of gate) {
          let admitted = false
          for (let kI = 0; kI < oval.length && !admitted; kI++) {
            // Sibling alternatives only: a pref member cannot admit
            // its own override (post-rankPrefs at most one pref
            // stands at this level, so this is defensive).
            admitted = kI !== gI && !oval[kI].isNil &&
              !(this.peg[kI] as any).isPref
          }
          if (!admitted) {
            const admitErr: any[] = []
            ctx.err = admitErr
            // The trial is against a CLONE: the preferred value must
            // stay pristine for the surviving preference (the
            // MatchFuncVal.resolve precedent).
            const met = unite(ctx,
              prefInnerPeg(this.peg[gI] as PrefVal).clone(ctx), peer,
              'dj-admit')
            if (0 < admitErr.length || met.isNil) {
              oval[gI] = TRIAL_NIL
            }
          }
        }
      }
    }
    finally {
      if (ownTrialMode) {
        ctx._trialMode = savedTrialMode
      }
      else {
        delete (ctx as any)._trialMode
      }
      if (ownErr) {
        ctx.err = savedErr
      }
      else {
        delete (ctx as any).err
      }
      ;(ctx as any).referflows = savedFlows
    }

    // // // console.log('DISJUNCT-unify-B', this.id, oval.map(v => v.canon))

    if (true === (peer as any).isPref) {
      const want: any = prefInnerPeg(peer as PrefVal)
      for (let vI = 0; vI < oval.length; vI++) {
        const got: any = oval[vI]
        if (!got.isNil && true !== got.isPref && got.same(want)) {
          const wrapped = new PrefVal({ peg: got }, ctx)
          wrapped.rank = (peer as PrefVal).rank
          ;(peer as PrefVal).place(wrapped)
          oval[vI] = wrapped
        }
      }
    }

    // Remove duplicates, and normalize
    if (1 < oval.length) {
      for (let vI = 0; vI < oval.length; vI++) {
        if (oval[vI].isDisjunct) {
          oval.splice(vI, 1, ...oval[vI].peg)
        }
      }

      // // // console.log('DISJUNCT-unify-C', this.id, oval.map(v => v.id + '=' + v.canon))

      // Dedup: duplicate Vals in the disjunct are replaced with the
      // trial sentinel, which is filtered out a few lines below.
      // (No need for a fresh NilVal — any isNil value gets filtered.)
      for (let vI = 0; vI < oval.length; vI++) {
        for (let kI = vI + 1; kI < oval.length; kI++) {
          if (oval[kI].same(oval[vI])) {
            oval[vI] = keepRiders(ctx, oval[vI], oval[kI])
            oval[kI] = TRIAL_NIL
            continue
          }

          const a: any = oval[vI]
          const b: any = oval[kI]
          if (true === a.isPref && true === b.isPref
            && prefInnerPeg(a).same(prefInnerPeg(b))) {
            if ((a as PrefVal).rank <= (b as PrefVal).rank) {
              oval[vI] = keepRiders(ctx, a, b)
              oval[kI] = TRIAL_NIL
            }
            else {
              oval[kI] = keepRiders(ctx, b, a)
              oval[vI] = TRIAL_NIL
              break
            }
          }
        }
      }

      // // // console.log('DISJUNCT-unify-D', this.id, oval.map(v => v.canon))
    }

    if (undefined !== savedFlows) {
      for (let vI = 0; vI < staged.length; vI++) {
        const st = staged[vI]
        if (undefined === st || true === oval[vI]?.isNil) {
          continue
        }
        for (const [k, fv] of st) {
          const prev = savedFlows.get(k)
          savedFlows.set(k, undefined === prev ? fv
            : unite(ctx, prev, fv, 'refer-flow-record'))
        }
      }
    }

    // Outside the 1<length block: a SINGLE-member disjunction (e.g. a
    // rankPrefs collapse) whose one member fails the trial or the
    // admission gate must reach the `empty` refusal below, not
    // return the trial sentinel as if it were the answer.
    oval = oval.filter(v => !v.isNil)

    let out: Val

    if (1 == oval.length) {
      out = oval[0]
    }
    else if (0 == oval.length) {
      return makeNilErr(ctx, 'empty', this, peer)
    }
    else {
      out = new DisjunctVal({ peg: oval }, ctx)
      this.place(out)
    }

    out.dc = done ? DONE : this.dc + 1

    // // // console.log('DISJUNCT-unify',
    //   this.id, sc, pc, '->', out.canon, 'D=' + out.dc, 'E=', this.err)

    explainClose(te, out)

    return out
  }


  rankPrefs(ctx: AontuContext): Val | undefined {
    // The kept index per rank, so an equal-rank twin folds into the
    // arm already standing for that rank.
    const atRank: Record<number, number> = {}

    // // // console.log('RP-A', this.peg.map((p: Val) => p.canon))

    for (let vI = 0; vI < this.peg.length; vI++) {
      const v = this.peg[vI]
      let pref: PrefVal | undefined = undefined

      if (v instanceof PrefVal) {
        pref = v
      }
      else if (v.isDisjunct) {
        const subrank = (v as DisjunctVal).rankPrefs(ctx)
        if (null != subrank && subrank.isNil) {
          return subrank
        }
        if (subrank instanceof PrefVal) {
          this.peg[vI] = subrank
          pref = subrank
        }
      }

      if (undefined !== pref) {
        const at = atRank[pref.rank]
        if (undefined === at) {
          atRank[pref.rank] = vI
        }
        else {
          const folded = pref.unify(this.peg[at], ctx)
          if (folded.isNil) {
            return folded
          }
          this.peg[at] = folded
          this.peg[vI] = null
        }
      }
    }

    this.peg = this.peg.filter((p: any) => null != p)
    this.prefsRanked = true

    // // // console.log('RP-Z', this.peg.map((p: Val) => p.canon))

    if (1 === this.peg.length && this.peg[0] instanceof PrefVal) {
      return this.peg[0]
    }

    return undefined
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as DisjunctVal)
    return out
  }


  getJunctionSymbol(): string {
    return '|'
  }


  gen(ctx: AontuContext) {
    if (0 < this.peg.length) {
      // Ranking may not have run when gen is reached without a prior
      // unify (a library caller generating a freshly parsed tree), and
      // it is what guarantees at most one preference stands here.
      if (!this.prefsRanked) {
        this.rankPrefs(ctx)
      }

      const prefs = this.peg.filter((v: Val) => v instanceof PrefVal)

      if (0 === prefs.length && 1 < this.peg.length) {
        const gctx = ctx.clone({ err: [], collect: true })
        let firstOut: any
        let allSame = true
        for (let gI = 0; gI < this.peg.length && allSame; gI++) {
          const gout = this.peg[gI].gen(gctx)
          if (0 < gctx.err.length || undefined === gout) {
            allSame = false
          }
          else if (0 === gI) {
            firstOut = gout
          }
          else {
            allSame = genShape(this.peg[gI], gout) === genShape(this.peg[0], firstOut)
          }
        }
        if (allSame) {
          return firstOut
        }
      }

      if (0 === prefs.length && 1 < this.peg.length) {
        const nerr = makeNilErr(ctx, 'disjunct_no_gen', this)
        descErr(nerr, ctx)
        ctx?.adderr(nerr)

        if (null == ctx || !ctx.collect) {
          throw new AontuError(nerr.msg, [nerr])
        }

        return undefined
      }

      let best: any = this.peg[0]
      if (0 < prefs.length) {
        best = prefs[0]
        for (const p of prefs) {
          if ((p as PrefVal).rank < best.rank) {
            best = p
          }
        }
      }
      return best.gen(ctx)
    }

    return super.gen(ctx)
  }
}


// Generated output with the number KINDS the JSON loses: `1` and
// `1.0` generate the same digits, and are still different values.
// A member dropped as a duplicate leaves its riders on the survivor, at
// every depth, so the join is as order-free as the meet (ADR-051).
function keepRiders(ctx: AontuContext, keep: Val, drop: any): Val {
  if (!ridden(drop)) {
    return keep
  }
  const out: any = keep.clone(ctx)
  ride(out, keep, drop)
  if (true === drop.isPref && true !== out.isPref) {
    // A twin of a higher rank holds one more preference layer.
    return keepRiders(ctx, out, drop.peg)
  }
  if (true === out.isBag) {
    for (const k of Object.keys(out.peg)) {
      out.peg[k] = keepRiders(ctx, out.peg[k], drop.peg[k])
    }
  }
  else if (true === out.isPref) {
    out.peg = keepRiders(ctx, out.peg, drop.peg)
  }
  return out
}


function ridden(v: any): boolean {
  return null != v.deprecation || null != v.meta ||
    (true === v.isBag && Object.values(v.peg).some(ridden)) ||
    (true === v.isPref && ridden(v.peg))
}


function genShape(v: any, out: any): string {
  if ('number' === typeof out && true === v?.isScalar) {
    return (true === v.isInteger ? 'i' : true === v.isNumber ? 'f' : 'n') + exactJSON(out)
  }
  if (null != out && 'object' === typeof out && !Array.isArray(out) && true === v?.isMap) {
    return '{' + Object.keys(out).sort().map((k) =>
      JSON.stringify(k) + ':' + genShape(v.peg[k], out[k])).join(',') + '}'
  }
  // Generation drops marked and absent elements, so pair what remains.
  const kids = true === v?.isList ? v.peg.filter((c: any) =>
    !(c.mark?.type || c.mark?.hide) && true !== c.isAbsent &&
    true !== c.isMaybeFunc) : []
  if (Array.isArray(out) && kids.length === out.length) {
    return '[' + out.map((o: any, i: number) => genShape(kids[i], o)).join(',') + ']'
  }
  return exactJSON(out)
} /* node:coverage ignore next 8 */


export {
  DisjunctVal,
}
