/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import { AontuContext } from '../ctx'

import { makeNilErr } from '../err'
import { rideOn, unite } from '../unify'
import { rides } from '../rider'

import {
  AontuError
} from '../err'


import { JunctionVal } from './JunctionVal'
import { sizingResidue } from './BagVal'
import { spreadId } from './Val'
import { walkVals } from '../walk'

import {
  explainOpen,
  ec,
  explainClose,
  propagateMarks,
} from '../utility'


import {
  top
} from './top'


class ConjunctVal extends JunctionVal {
  isConjunct = true
  isGenable = true
  cjo = 40000
  waits = false
  // One step of an `&` chain as the parser read it, no parenthesis around it yet.
  written = false
  own = false

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.mark.type = !!spec.mark?.type
    this.mark.hide = !!spec.mark?.hide
    this.peg = (Array.isArray(this.peg) ? this.peg : [])
      .filter((p: Val) => null != p && p.isVal)
    this.peg?.map((v: Val) => {
      propagateMarks(this, v)
      return v
    })
    // console.log('CONJUNCT-ctor', this.peg.map((v: Val) => v.canon))
  }

  // NOTE: mutation!
  append(peer: Val): ConjunctVal {
    super.append(peer)
    propagateMarks(this, peer)
    return this
  }


  unify(peer: Val, ctx: AontuContext): Val {
    peer = peer ?? top()

    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Conjunct', this, peer)


    const carried: Val[] = []
    this.peg = norm(this.peg, carried, true === peer.isTop)

    if (true === (peer as any).isData && this.peg.some(sealish)) {
      const alone = this.apart(peer, ctx)
      if (undefined !== alone) {
        return alone
      }
    }


    // Unify each term of conjunct against peer
    let upeer: Val[] = []

    let newtype = this.mark.type || peer.mark.type
    let newhide = this.mark.hide || peer.mark.hide

    for (let vI = 0; vI < this.peg.length; vI++) {
      newtype = this.peg[vI].mark.type || newtype
      newhide = this.peg[vI].mark.hide || newhide
    }

    for (let vI = 0; vI < this.peg.length; vI++) {
      this.peg[vI].mark.type = newtype
      this.peg[vI].mark.hide = newhide

      upeer[vI] = (this.peg[vI].done && peer.isTop) ? this.peg[vI] :
        unite(te ? ctx.clone({ explain: ec(te, 'OWN') }) : ctx, this.peg[vI], peer, 'cj-own')

      upeer[vI].mark.type = newtype = newtype || upeer[vI].mark.type
      upeer[vI].mark.hide = newhide = newhide || upeer[vI].mark.hide


      if (upeer[vI].isNil) {
        return upeer[vI]
      }
    }

    upeer = norm(upeer, carried, false)
    // console.log('CONJUNCT-UPEER', this.id, upeer.map((v: Val) => v.canon))

    // Unify terms against each other

    let outvals: Val[] = []
    let val: Val
    let open = false


    let t0 = upeer[0]

    // next_term:
    for (let pI = 0; pI < upeer.length; pI++) {
      let t1 = upeer[pI + 1]


      if (null == t1) {
        outvals.push(t0)
        newtype = this.mark.type || t0.mark.type
        newhide = this.mark.hide || t0.mark.hide
      }

      // Can't unite with a RefVal, unless also a RefVal with same path.
      // else if (t0 instanceof RefVal && !(t1 instanceof RefVal)) {
      else if (t0.isRef && !(t1.isRef)) {
        outvals.push(t0)
        t0 = t1
      }

      else if (t1.isRef && !(t0.isRef)) {
        outvals.push(t0)
        t0 = t1
      }


      else {
        val = unite(te ? ctx.clone({ explain: ec(te, 'DEF') }) : ctx, t0, t1, 'cj-peer-t0t1')
        newtype = this.mark.type || val.mark.type
        newhide = this.mark.hide || val.mark.hide

        // A conjunct answer is no progress, unless it is a sizing residue
        // of other terms: a decided disjunction or one level of an
        // expanded recursion is the meet so far.
        const moved = undefined !== sizingResidue(val) && !sameTerms(val, t0, t1)
        if (val.isConjunct && !moved &&
          (!(t0.isDisjunct || t1.isDisjunct) || sameTerms(val, t0, t1))) {
          open = open || true === (val as any).waits
          outvals.push(t0)
          t0 = t1
        }
        else if (val.isNil) {
          return val
        }
        else {
          t0 = val
        }
      }
    }

    let out: Val


    if (0 === outvals.length) {

      // Empty conjuncts evaporate.
      out = top()
    }

    else if (1 === outvals.length) {
      out = outvals[0]
      out.mark.type = newtype
      out.mark.hide = newhide
    }
    else {
      out = new ConjunctVal({ peg: outvals, mark: { type: newtype, hide: newhide } }, ctx)
      ; (out as ConjunctVal).own = this.own
      out.site.row = this.site.row
      out.site.col = this.site.col
      out.site.url = this.site.url
      out.site.len = this.site.len
      out.site.src = this.site.src
    }

    // A residual still waiting for its definition keeps the meet open.
    out.dc = !open && outvals.every((v: Val) => DONE === v.dc) ? DONE : this.dc + 1

    // A meet flattened in leaves its riders on the whole (ADR-052).
    for (const c of carried) {
      out = rideOn(ctx, out, c, undefined)
    }

    explainClose(te, out)

    return out
  }


  // A directive's seal covers the place's own terms, not the data's (decision 44): they meet first.
  apart(peer: Val, ctx: AontuContext): Val | undefined {
    if (this.peg.some((t: Val) => t.isRef)) {
      this.own = true
      const out = this.place(new ConjunctVal({ peg: [this, peer] }, ctx))
      out.dc = this.dc + 1
      return out
    }
    const bags = this.peg.every((t: any) => sealish(t) || true === t.isMap || true === t.isList)
    return bags ? unite(ctx, this.unify(top(), ctx), peer, 'cj-apart') : undefined
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as ConjunctVal)
    out.own = this.own
    return out
  }


  getJunctionSymbol(): string {
    return '&'
  }


  gen(ctx?: AontuContext) {
    const residue = sizingResidue(this)
    if (undefined !== residue) {
      const settled: any = residue.con.settleContainer(residue.bag, ctx)
      return true === settled?.isNil ? undefined : settled.gen(ctx)
    }

    // Unresolved conjunct cannot be generated, so always an error.
    let nil = makeNilErr(
      ctx,
      'conjunct',
      this, // (formatPath(this.peg, this.absolute) as any),
      undefined
    )

    nil.path = this.path
    nil.site.url = this.site.url
    nil.site.row = this.site.row
    nil.site.col = this.site.col


    if (null == ctx) {
      throw new AontuError(nil.msg)
    }

    return undefined
  }
}


function sameTerms(cj: any, t0: Val, t1: Val): boolean {
  return 2 === cj.peg.length && cj.peg.includes(t0) && cj.peg.includes(t1)
}


const bareDirective = (t: any): boolean =>
  (true === t.isCloseFunc || true === t.isOpenFunc) && 0 === t.peg.length

// A bare directive still to fold, or a bag one sealed.
const sealish = (t: any): boolean =>
  true === t.isSeal || bareDirective(t) || true === t.dirSealed

function holdsRef(v: any): boolean {
  let found = false
  const seen = new Set()
  const visit = (t: any): boolean => {
    found = found || true === t.isRef
    // A default's value is its peg, which the walk reads as a key table.
    if (!found && true === t.peg?.isVal) {
      walkVals(t.peg, visit, seen)
    }
    return !found
  }
  walkVals(v, visit, seen)
  return found
}


// A bare directive in the argument of copy, pref or super acts where the value lands, beside the
// call (decision 46); not in a meet with a peer or beside a path, which may hold or read the data.
// An open() leaves only copy's, as the value of pref or super keeps its argument's seals.
function landed(t: any, lift: boolean): Val[] {
  if (lift && (true === t.isCopyFunc || true === t.isPrefFunc || true === t.isSuperFunc) &&
    1 === t.peg.length && !holdsRef(t.peg[0])) {
    const inner = placeTerms(t.peg[0])
    const lifts = (u: any): boolean => bareDirective(u) && (true === t.isCopyFunc || true === u.isCloseFunc)
    const rest = inner.filter((u: any) => !lifts(u))
    if (0 < rest.length && rest.length < inner.length) {
      const call: any = t.make(undefined, {
        peg: [1 === rest.length ? rest[0] : new ConjunctVal({ peg: rest })],
        mark: { type: t.mark.type, hide: t.mark.hide },
      })
      call.site = t.site
      call.path = t.path
      return [...inner.filter(lifts), call]
    }
  }
  return [t]
}


// The terms a meet holds at its place, written as a chain or not.
function placeTerms(t: any): Val[] {
  return true === t.isConjunct ? t.peg.flatMap(placeTerms) : landed(t, true)
}


// Normalize Conjunct:
// - flatten child conjuncts
// - consistent sorting of terms
function norm(terms: Val[], carried: Val[], lift: boolean): Val[] {

  let expand: Val[] = []
  for (const t of terms) {
    if (t.isConjunct && true !== (t as any).own) {
      if (rides(t)) {
        carried.push(t)
      }
      for (const u of t.peg) {
        expand.push(...landed(u, lift))
      }
    }
    else {
      expand.push(...landed(t, lift))
    }
  }


  // Consistent ordering ensures order independent unification.
  // Skip sort when already in order (common case).
  let sorted = true
  for (let i = 1; i < expand.length; i++) {
    if (expand[i - 1].cjo > expand[i].cjo) {
      sorted = false
      break
    }
  }

  if (!sorted) {
    expand.sort((a: Val, b: Val) => a.cjo - b.cjo)
  }

  // console.log('NORM', expand.map(t => t.canon).join(', '))

  // A repeated waiting match adds nothing, nor a residual met again.
  const seen = new Set<string>()
  return expand.filter((t: any) => {
    const key: string | undefined = true === t.isRecurse ?
      '\u0000' + t.target.join('\u0000') :
      true === t.isMatchFunc && true !== t.done ? t.canon : undefined
    return undefined === key || seen.size !== seen.add(key).size
  })
}


// A spread's template meets each member without the marks written around
// it (ruling 39), through a meet and the other riders; a term rebuilt
// without them keeps its source's identity (spreadId), as members record it.
function unmarkedTemplate(cj: Val, ctx: AontuContext): Val {
  const t: any = cj
  if ((true === t.isHideFunc || true === t.isTypeFunc) && 0 < t.peg.length) {
    return unmarkedTemplate(t.peg[0], ctx)
  }
  const rider = true === t.isMetaFunc || true === t.isDeprecateFunc || true === t.isIdentFunc
  if (!rider && true !== t.isConjunct) {
    return cj
  }
  if (undefined === t._unmarked) {
    const peg = rider ? [unmarkedTemplate(t.peg[0], ctx), ...t.peg.slice(1)] :
      t.peg.map((p: Val) => unmarkedTemplate(p, ctx))
    t._unmarked = cj
    if (peg.some((p: Val, i: number) => p !== t.peg[i])) {
      t._unmarked = cj.clone(ctx)
      t._unmarked.peg = peg
      t._unmarked._sid = spreadId(cj)
    }
  }
  return t._unmarked
} /* node:coverage ignore next 10 */


export {
  norm,
  bareDirective,
  holdsRef,
  placeTerms,
  ConjunctVal,
  unmarkedTemplate,
}
