/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import {
  items,
} from '../utility'

import { makeNilErr } from '../err'
import { empty } from './Val'

import { Val } from './Val'
import { NilVal } from './NilVal'
import { FeatureVal } from './FeatureVal'
import { ExpectVal } from './ExpectVal'
import { cmpCodePoint } from '../keyorder'


abstract class BagVal extends FeatureVal {
  isBag = true
  isGenable = true

  closed: boolean = false
  optionalKeys: string[] = []

  aliasKeys: string[] = []

  // THE NAMES THIS FILE PUBLISHES, read at parse time by a destructure,
  // so they do not travel through unify the way aliasKeys does.
  exportKeys: string[] = []

  spread = {
    cj: (undefined as Val | undefined),
  }

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const bag = super.clone(ctx, spec) as BagVal
    bag.spread = this.spread
    return bag
  }


  handleExpectedVal(key: string, val: Val, parent: Val, ctx: AontuContext): Val {
    if (val.isGenable || val.isOp || val.mark.type || val.mark.hide) {
      return val
    }
    const expectVal = new ExpectVal({ peg: val.isExpect ? val.peg : val }, ctx)
    expectVal.key = key
    expectVal.parent = parent
    return expectVal
  }


  same(peer: any): boolean {
    if (this === peer) {
      return true
    }
    if (null == peer || true !== peer.isBag) {
      return false
    }
    if (this.isMap !== peer.isMap ||
      this.closed !== peer.closed ||
      this.mark.type !== peer.mark.type ||
      this.mark.hide !== peer.mark.hide) {
      return false
    }
    const scj: any = (this as any).spread?.cj
    const pcj: any = peer.spread?.cj
    if ((null == scj) !== (null == pcj) ||
      (null != scj && null != pcj && scj.canon !== pcj.canon)) {
      return false
    }

    const keys = Object.keys(this.peg)
    if (keys.length !== Object.keys(peer.peg).length) {
      return false
    }
    if (this.optionalKeys.length !== peer.optionalKeys.length ||
      this.optionalKeys.some((k) => !peer.optionalKeys.includes(k))) {
      return false
    }

    for (const k of keys) {
      const mine: any = (this.peg as any)[k]
      const theirs: any = (peer.peg as any)[k]
      if (null == mine || null == theirs || !mine.same(theirs)) {
        return false
      }
    }

    return true
  }


  gen(ctx: AontuContext) {
    let out: any = this.isMap ? {} : []

    if ((this.mark.type || this.mark.hide) && true !== ctx?.probe) {
      return undefined
    }

    let entries = items(this.peg)
    if (this.isMap) {
      entries = entries
        .slice()
        .sort((a: any, b: any) => cmpCodePoint(String(a[0]), String(b[0])))
    }

    for (let item of entries) {
      const p = item[0]
      const child = item[1]

      if ((child.mark.type || child.mark.hide) && true !== ctx?.probe) {
        continue
      }

      // An alias declaration contributes no field, and unlike a marked
      // one it is skipped even under `probe`: the probe descends
      // through output marks to check what a `--at` anchor really
      // holds, and an alias is not part of the document at all.
      if (this.aliasKeys.includes('' + p)) {
        continue
      }

      const optional = this.optionalKeys.includes('' + p)

      // Lists append compactly: a skipped element (hidden, dropped
      // optional) must not leave a hole/null at its index (matches the
      // Go port, which also drops skipped elements).
      const put = (v: any) => {
        if (this.isMap) {
          out[p] = v
        }
        else {
          out.push(v)
        }
      }

      // Optional unresolved disjuncts are not an error, just dropped.
      if (child.isDisjunct && optional) {
        const dctx = ctx.clone({ err: [], collect: true })

        let cval = child.gen(dctx)

        if (undefined === cval) {
          continue
        }

        put(cval)
      }

      else if (bagGenable(child)) {
        const cctx = optional ? ctx.clone({ err: [], collect: true }) : ctx

        let cval = child.gen(cctx)

        if (optional && (undefined === cval || empty(cval))) {
          continue
        }

        // A child that generates nothing contributes nothing: setting
        // `undefined` would leave husk entries like {"q k": undefined}
        // (the Go port also drops such children). Any real failure has
        // already been recorded on ctx and raises below.
        if (undefined === cval) {
          continue
        }

        put(cval)
      }
      else if (child.isNil) {
        ctx.adderr(child)
      }
      else if (!optional) {
        const prefix = this.isMap ? 'map' : 'list'
        let code = this.closed ? prefix + 'val_required' : prefix + 'val_no_gen'
        let va = child
        let vb = undefined

        if (va.isExpect) {
          code = prefix + 'val_spread_required'
          if (va.parent) {
            vb = new NilVal({}, ctx)
            va.parent.place(vb)
          }
          va = va.peg
        }

        const details = { key: p }

        makeNilErr(ctx, code, va, vb, undefined, details)

        break
      }

    }

    return out
  }

} /* node:coverage ignore next 6 */


export {
  BagVal,
}


// A conjunct of exactly one sizing constraint and one container: the
// shape ConstraintVal.admitContainer leaves when its reading is still
// provisional, and the one ConjunctVal.gen knows how to finish. Kept
// here rather than as a flag on the conjunct because it is a question
// about the TERMS, and they can change until the meet converges.
export function sizingResidue(v: any): { con: any, bag: any } | undefined {
  if (true !== v?.isConjunct || 2 !== v.peg?.length) {
    return undefined
  }
  const [a, b]: any[] = v.peg
  const con = true === a?.isConstraint ? a :
    true === b?.isConstraint ? b : undefined
  const bag = true === a?.isConstraint ? b : a
  return undefined !== con && (true === bag?.isMap || true === bag?.isList) ?
    { con, bag } : undefined
}

export function bagGenable(child: any): boolean {
  if (true === child.isGraphAtom) {
    return undefined === child.held || bagGenable(child.held)
  }
  // The recursive residual carries its own generation refusal
  // (recursion_unexpanded), which names the schema and the site --
  // the bag's generic residue error would bury both.
  if (true === child.isRecurse) {
    return true
  }
  return true === child.isScalar
    || true === child.isAbsent
    || true === child.isMap
    || true === child.isList
    || true === child.isPref
    || true === child.isRef
    || true === child.isDisjunct
    || true === child.isNil
    || undefined !== sizingResidue(child)
}
