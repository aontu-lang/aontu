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
    // A MARKED value is carried, never expected (ADR-005 era, BUGS.md
    // §12's include form): a type()/hide()-marked child legitimately
    // participates in unification without ever generating — that is
    // the marks contract — so wrapping one as an expectation turned a
    // schema field arriving through an include's map meet into a
    // bogus `mapval_spread_required` naming a spread that exists in
    // neither file. The bag's gen already skips marked children.
    if (val.isGenable || val.mark.type || val.mark.hide) {
      return val
    }
    const expectVal = new ExpectVal({ peg: val }, ctx)
    expectVal.key = key
    expectVal.parent = parent
    return expectVal
  }


  gen(ctx: AontuContext) {
    let out: any = this.isMap ? {} : []

    if (this.mark.type || this.mark.hide) {
      return undefined
    }

    // Maps emit their keys in CODE POINT order so the generated output
    // is independent of insertion/unification order and matches the Go
    // port. Lists keep their numeric index order.
    //
    // The keys are String()-coerced because a list entry carries a
    // numeric index here; the coercion is a no-op for every map key.
    let entries = items(this.peg)
    if (this.isMap) {
      entries = entries
        .slice()
        .sort((a: any, b: any) => cmpCodePoint(String(a[0]), String(b[0])))
    }

    for (let item of entries) {
      const p = item[0]
      const child = item[1]

      if (child.mark.type || child.mark.hide) {
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

      else if (child.isScalar
        || child.isMap
        || child.isList
        || child.isPref
        || child.isRef
        || child.isDisjunct
        || child.isNil
      ) {
        // An optional child is generated in an isolated collect context so an
        // unresolved inner value (a bare type that survived unification, e.g.
        // an absent optional sub-map's `field: string`) is dropped rather than
        // raised: the optional subtree is simply omitted. Without isolation
        // such inner errors pollute the shared ctx.err and make generate()
        // throw even though the key is skipped below. Mirrors the
        // optional-disjunct path above.
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

      // else optional so we can ignore it
    }

    return out
  }

} /* node:coverage ignore next 6 */


export {
  BagVal,
}
