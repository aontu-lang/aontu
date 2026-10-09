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
import { unite } from '../unify'

import {
  AontuError
} from '../err'


import { JunctionVal } from './JunctionVal'
import { sizingResidue } from './BagVal'

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

    let done = true

    this.peg = norm(this.peg)


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

      done = done && (DONE === upeer[vI].dc)

      if (upeer[vI].isNil) {
        return upeer[vI]
      }
    }

    upeer = norm(upeer)
    // console.log('CONJUNCT-UPEER', this.id, upeer.map((v: Val) => v.canon))

    // Unify terms against each other

    let outvals: Val[] = []
    let val: Val


    let t0 = upeer[0]

    // next_term:
    for (let pI = 0; pI < upeer.length; pI++) {
      let t1 = upeer[pI + 1]

      // console.log('CONJUNCT-TERMS-C', ctx.cc, this.id, pI, t0.id, t0.canon, t1?.id, t1?.canon, 'OV=', outvals.map((v: Val) => v.canon))

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
        done = done && DONE === val.dc
        newtype = this.mark.type || val.mark.type
        newhide = this.mark.hide || val.mark.hide

        // A conjunct answer is no progress, unless it is a sizing residue
        // of other terms: a decided disjunction or one level of an
        // expanded recursion is the meet so far.
        const moved = undefined !== sizingResidue(val) && !sameTerms(val, t0, t1)
        if (val.isConjunct && !moved &&
          (!(t0.isDisjunct || t1.isDisjunct) || sameTerms(val, t0, t1))) {
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

    // console.log('CONJUCT-prepout', this.id, outvals.map((v: Val) => v.canon))

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
      out.site.row = this.site.row
      out.site.col = this.site.col
      out.site.url = this.site.url
      out.site.len = this.site.len
      out.site.src = this.site.src
    }

    out.dc = done ? DONE : this.dc + 1


    explainClose(te, out)

    return out
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as ConjunctVal)
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


// Normalize Conjunct:
// - flatten child conjuncts
// - consistent sorting of terms
function norm(terms: Val[]): Val[] {

  let expand: Val[] = []
  for (let tI = 0, pI = 0; tI < terms.length; tI++, pI++) {
    if (terms[tI].isConjunct) {
      const cterms = terms[tI].peg
      for (let cI = 0; cI < cterms.length; cI++) {
        expand[pI + cI] = cterms[cI]
      }
      pI += cterms.length - 1
    }
    else {
      expand[pI] = terms[tI]
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

  // A repeated waiting match adds nothing, and each list meet doubled it.
  const seen = new Set<string>()
  return expand.filter((t: any) => true !== t.isMatchFunc || true === t.done ||
    seen.size !== seen.add(t.canon).size)
} /* node:coverage ignore next 7 */


export {
  norm,
  ConjunctVal,
}
