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
import { sameRec } from '../rider'

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
import { trialUnify } from '../val/FuncBaseVal'
import { armAdmits } from '../val/admission'
import { JunctionVal } from '../val/JunctionVal'
import { joinFlows } from '../val/PathVal'


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

    // A rider still a call resolves first: met member by member it would
    // write its record on each. Only TypeScript gets here, through the
    // `_tcc` shortcut in unite, which leaves a peer met with top this pass
    // undriven.
    if (true === (peer as any).isFunc && !peer.done && (peer as any).rides()) {
      peer = peer.unify(top(), ctx)
    }

    // The peer's annotations ride the result once, not each member, so a
    // disjunction met with itself is itself.
    const annotated = null != (peer as any).meta || null != (peer as any).deprecation ||
      null != (peer as any).via || null != (peer as any).reldecl
    const member: any = annotated ? peer.clone(ctx, { path: peer.path }) : peer
    if (annotated) {
      member.meta = undefined
      member.deprecation = undefined
      member.via = undefined
      member.reldecl = undefined
    }

    if (member instanceof PrefVal ||
      member instanceof DisjunctVal && undefined !== (leadRank(this) ?? leadRank(member))) {
      const out = meetRanked(ctx, this, member)
      if (annotated) {
        ride(out, undefined, peer)
      }
      explainClose(te, out)
      return out
    }

    const savedErr = ctx.err
    const savedTrialMode = ctx._trialMode
    const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err')
    const ownTrialMode =
      Object.prototype.hasOwnProperty.call(ctx, '_trialMode')
    ctx._trialMode = true
    let gate: number[] | undefined = undefined
    try {
      for (let vI = 0; vI < this.peg.length; vI++) {
        const v = this.peg[vI]
        const trialErr: any[] = []
        ctx.err = trialErr

        oval[vI] = unite((te ? ctx.clone({ explain: ec(te, 'DIST:' + vI) }) : ctx)
          .holdArm(this.path, prefInnerPeg(v), member), v, member, 'dj-peer')

        if (0 < trialErr.length || holdsUnmetNil(oval[vI])) {
          oval[vI] = TRIAL_NIL
        }
        else if (v instanceof PrefVal && !peer.isTop) {
          // A candidate for the admission gate below: a non-pref,
          // non-top peer met a preference inside this disjunction.
          ; (gate = gate ?? []).push(vI)
        }

        done = done && DONE === oval[vI].dc
      }

      if (undefined !== gate) {
        // An arm `*x` is the arm `x` of rank one, with no parent type:
        // a peer its own value refuses kills it.
        for (const gI of gate) {
          const admitErr: any[] = []
          ctx.err = admitErr
          // The trial is against a CLONE: the preferred value must
          // stay pristine for the surviving preference (the
          // MatchFuncVal.resolve precedent).
          const met = unite(ctx,
            prefInnerPeg(this.peg[gI] as PrefVal).clone(ctx), peer.clone(ctx),
            'dj-admit')
          if (0 < admitErr.length || met.isNil) {
            oval[gI] = TRIAL_NIL
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
    }

    // Remove duplicates, and normalize
    if (1 < oval.length) {
      for (let vI = 0; vI < oval.length; vI++) {
        if (oval[vI].isDisjunct) {
          oval.splice(vI, 1, ...oval[vI].peg)
        }
      }

      dedupArms(ctx, oval, false)
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
    if (annotated) {
      ride(out, undefined, peer)
    }

    explainClose(te, out)

    return out
  }


  rankPrefs(ctx: AontuContext): Val | undefined {
    const prefs: number[] = []

    for (let vI = 0; vI < this.peg.length; vI++) {
      const v = this.peg[vI]
      if (v.isDisjunct) {
        const subrank = (v as DisjunctVal).rankPrefs(ctx)
        if (null != subrank && subrank.isNil) {
          return subrank
        }
        if (subrank instanceof PrefVal) {
          this.peg[vI] = subrank
        }
      }
      if (this.peg[vI] instanceof PrefVal) {
        prefs.push(vI)
      }
    }

    // Only the defaults the rank rule picks fold: foldArms in spec/Aontu/Meet.lean.
    const lead = Math.min(...prefs.map((vI) => this.peg[vI].rank))
    let at: number | undefined = undefined
    for (const vI of prefs) {
      const pref = this.peg[vI]
      if (lead === pref.rank && undefined === at) {
        at = vI
      }
      else if (lead === pref.rank) {
        // Twins that differ in their output records do not fold into one.
        const folded = sameRec(pref, this.peg[at as number]) ? pref.unify(this.peg[at as number], ctx) :
          makeNilErr(ctx, 'pref_rank_clash', pref, this.peg[at as number], 'unify')
        if (folded.isNil) {
          return folded
        }
        this.peg[at as number] = folded
        this.peg[vI] = null
      }
    }

    this.peg = this.peg.filter((p: any) => null != p)
    this.prefsRanked = true

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

      const toward = ctx?._toward
      if (undefined !== toward && 1 < this.peg.length && this.peg.some((arm: any) =>
        armAdmits(true === arm.isPref ? arm.peg : arm, ctx, toward.v))) {
        return toward.v
      }

      const prefs = this.peg.filter((v: Val) => v instanceof PrefVal)

      if (0 === prefs.length && 1 < this.peg.length) {
        const read = armsAlike(this.peg, ctx, true)
        const alike = undefined === read || true === ctx.plain ? read : armsAlike(this.peg, ctx, false)
        if (undefined !== alike) {
          return alike.out
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


function dedupArms(ctx: AontuContext, oval: Val[], ranked: boolean): void {
  // Dedup: duplicate Vals in the disjunct are replaced with the
  // trial sentinel, which is filtered out a few lines below.
  // (No need for a fresh NilVal — any isNil value gets filtered.)
  for (let vI = 0; vI < oval.length; vI++) {
    for (let kI = vI + 1; kI < oval.length; kI++) {
      if (oval[kI].same(oval[vI]) && sameRec(oval[kI], oval[vI])) {
        oval[vI] = keepRiders(ctx, oval[vI], oval[kI])
        oval[kI] = TRIAL_NIL
        continue
      }

      const a: any = oval[vI]
      const b: any = oval[kI]
      if (true === a.isPref && true === b.isPref
        && prefInnerPeg(a).same(prefInnerPeg(b)) && sameRec(a, b)) {
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
      // A plain arm the ranked meet makes beside a preferred one of the
      // same value adds nothing to it.
      else if (ranked && (true === a.isPref) !== (true === b.isPref)
        && prefInnerPeg(a).same(prefInnerPeg(b)) && sameRec(a, b)) {
        oval[vI] = true === a.isPref ? keepRiders(ctx, a, b) : keepRiders(ctx, b, a)
        oval[kI] = TRIAL_NIL
      }
    }
  }
}


// THE RANKED MEET (meetNodes in spec/Aontu/Meet.lean): where a default
// meets another term, the side with the stronger rank goes outermost and
// the other meets each of its arms, so a weaker default stands under a
// stronger one (rulings 41 and 42), and two that lead with one rank meet
// as nodeTie does (decision 43). An arm's rank counts its stars.
type Arm = [number, Val, Val[]]


function meetRanked(ctx: AontuContext, a: Val, b: Val): Val {
  const arms = meetArms(ctx, a, b)
  return 0 === arms.length ? makeNilErr(ctx, 'empty', a, b) : armsVal(ctx, a, arms)
}


function nodeOf(v: Val): boolean {
  return v instanceof DisjunctVal || v instanceof PrefVal
}


// A preferred arm's preference layers carry its riders through the meet.
function armOf(v: Val): Arm[] {
  return v instanceof PrefVal ? [[v.rank + 1, prefInnerPeg(v), prefLayers(v)]] :
    v instanceof DisjunctVal ? v.peg.flatMap(armOf) : [[0, v, []]]
}


function prefLayers(v: Val): Val[] {
  const out: Val[] = []
  for (let p: any = v; true === p?.isPref; p = p.peg) {
    out.push(p)
  }
  return out
}


// A lone preference `*x` is `x | super(x)`.
function armsOf(v: Val): Arm[] {
  return v instanceof PrefVal ? [[v.rank + 1, prefInnerPeg(v), []], [0, v.superpeg, []]] : armOf(v)
}


function leadRank(v: Val): number | undefined {
  const ranks = armsOf(v).map((p) => p[0]).filter((r) => 0 < r)
  return 0 === ranks.length ? undefined : Math.min(...ranks)
}


function meetArms(ctx: AontuContext, a: Val, b: Val): Arm[] {
  if (!nodeOf(a) && !nodeOf(b)) {
    const met = trialUnify(ctx, a, b)
    return undefined === met ? [] : armsOf(met)
  }
  const ra = leadRank(a)
  const rb = leadRank(b)
  if (undefined !== ra && ra === rb) {
    return tieArms(ctx, ra, a, b)
  }
  return undefined !== ra && (undefined === rb || ra < rb) || undefined === rb && nodeOf(a) ?
    spread(ctx, a, armsOf(a), (x) => meetArms(ctx, x, b)) :
    spread(ctx, a, armsOf(b), (y) => meetArms(ctx, a, y))
}


function spread(ctx: AontuContext, home: Val, arms: Arm[], meet: (v: Val) => Arm[]): Arm[] {
  return arms.flatMap(([r, v, s]) => ranked(ctx, home, r, meet(v), s))
}


function ranked(ctx: AontuContext, home: Val, r: number, arms: Arm[], s: Val[]): Arm[] {
  return 0 === arms.length ? [] : 0 === r ? arms : [[r, armsVal(ctx, home, arms), s]]
}


function tieArms(ctx: AontuContext, r: number, a: Val, b: Val): Arm[] {
  const at = (v: Val) => armsOf(v).filter((p) => p[0] === r)
  const off = (v: Val) => armsOf(v).filter((p) => p[0] !== r)
  const pairs = at(a).flatMap((p) => at(b).map((q): [Arm[], Val[]] =>
    [meetArms(ctx, p[1], q[1]), [...p[2], ...q[2]]]))
  const live = pairs.some((m) => 0 < m[0].length)
  const k = live ? r + 1 : r
  const arms = [
    ...pairs.flatMap((m) => ranked(ctx, a, r, m[0], m[1])),
    ...at(a).flatMap((p) => ranked(ctx, a, k, spread(ctx, a, off(b), (y) => meetArms(ctx, p[1], y)), p[2])),
    ...at(b).flatMap((q) => ranked(ctx, a, k, spread(ctx, a, off(a), (x) => meetArms(ctx, x, q[1])), q[2])),
  ]
  const rest = meetArms(ctx, armsVal(ctx, a, off(a)), armsVal(ctx, a, off(b)))
  return [...(live ? ranked(ctx, a, r, arms, []) : arms), ...rest]
}


function armsVal(ctx: AontuContext, home: Val, arms: Arm[]): Val {
  const pegs = arms.map(([r, v, s]) => {
    for (let rI = 0; rI < r; rI++) {
      v = (rI === r - 1 ? s[0] ?? v : v).place(new PrefVal({ peg: v }, ctx))
    }
    for (const layer of s) {
      ride(v, layer, undefined)
    }
    return v
  })
  dedupArms(ctx, pegs, true)
  const kept = pegs.filter((v) => !v.isNil)
  if (1 === kept.length) {
    const one: any = prefInnerPeg(kept[0]).clone(ctx)
    ride(one, kept[0], undefined)
    return one
  }
  const out = home.place(new DisjunctVal({ peg: kept }, ctx))
  out.dc = arms.every((p) => DONE === p[1].dc) ? DONE : home.dc + 1
  return out
}


// Generated output with the number KINDS the JSON loses: `1` and
// `1.0` generate the same digits, and are still different values.
// A member dropped as a duplicate leaves its riders on the survivor, at
// every depth, so the join is as order-free as the meet (ADR-052).
function keepRiders(ctx: AontuContext, keep: Val, drop: any, sends: boolean = true): Val {
  if (!ridden(drop)) {
    return keep
  }
  const out: any = keep.clone(ctx)
  ride(out, keep, drop)
  // The twins' links are both sent only where neither outranks the other.
  sends = sends && !(true === keep.isPref && true === drop.isPref && (keep as any).rank !== drop.rank)
  if (sends) {
    out.flows = joinFlows(out.flows, drop.flows)
  }
  if (true === drop.isPref && true !== out.isPref) {
    // A twin of a higher rank holds one more preference layer.
    return keepRiders(ctx, out, drop.peg, sends)
  }
  if (true === out.isBag) {
    for (const k of Object.keys(out.peg)) {
      out.peg[k] = keepRiders(ctx, out.peg[k], drop.peg[k], sends)
    }
  }
  else if (true === out.isPref) {
    out.peg = keepRiders(ctx, out.peg, drop.peg, sends)
  }
  return out
}


function ridden(v: any): boolean {
  return null != v.deprecation || null != v.meta || null != v.flows || null != v.reldecl ||
    (true === v.isBag && Object.values(v.peg).some(ridden)) ||
    (true === v.isPref && ridden(v.peg))
}


// Read plain first: values that differ stay apart though an option writes them alike.
function armsAlike(arms: any[], ctx: AontuContext, plain: boolean): { out: any } | undefined {
  const gctx: any = ctx.clone({ err: [], collect: true })
  gctx.plain = plain
  let first: any
  for (let gI = 0; gI < arms.length; gI++) {
    const gout = arms[gI].gen(gctx)
    if (0 < gctx.err.length || undefined === gout) {
      return undefined
    }
    if (0 === gI) {
      first = gout
    }
    else if (genShape(arms[gI], gout) !== genShape(arms[0], first)) {
      return undefined
    }
  }
  return { out: first }
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
}


// An arm that holds a written nil at a member it must have refuses (ruling 54).
function holdsUnmetNil(v: any): boolean {
  const unmet = (c: any): boolean =>
    (true === c?.isNil && 'literal_nil' === c.why) || holdsUnmetNil(c)
  return true === v?.isMap ?
    Object.keys(v.peg).some((k) => !v.optionalKeys.includes(k) && unmet(v.peg[k])) :
    true === v?.isList && v.peg.some(unmet)
} /* node:coverage ignore next 8 */


export {
  DisjunctVal,
  meetRanked,
}
