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

  // ALIAS DECLARATIONS, by key. `%uint8 = …` binds a name for this file
  // and is not a field of the document: it does not generate and does
  // not appear in canon, so a document using aliases and its expanded
  // twin are the SAME document and hash identically
  // (docs/design/ALIASES.0.md §4).
  //
  // Keyed on the map rather than marked on the value, because a
  // reference copies the value it resolves to -- a mark riding the
  // value would erase the referring field along with the declaration.
  aliasKeys: string[] = []

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
    //
    // An OPERATOR is carried too (BUGS.md §36): an expression is a
    // computation that resolves by itself once its operands do — the
    // bag's own-key loop drives it every pass — so `m:{y:.x+1}`
    // arriving as a peer key must keep computing exactly as it does
    // written inline. Wrapping it froze the op (an expectation only
    // advances when a peer arrives) and the residue then reported the
    // phantom `mapval_spread_required` naming a spread that exists
    // nowhere. An op that truly never resolves is honest *_no_gen
    // residue naming the expression itself.
    if (val.isGenable || val.isOp || val.mark.type || val.mark.hide) {
      return val
    }
    // An expectation baked into a combined spread template (the
    // 'map-self' meet of two unequal templates) is re-wrapped FRESH, so
    // key/parent name THIS bag and the template's own node is never
    // stored at a destination.
    const expectVal = new ExpectVal({ peg: val.isExpect ? val.peg : val }, ctx)
    expectVal.key = key
    expectVal.parent = parent
    return expectVal
  }


  // TWO BAGS ARE THE SAME VALUE WHEN THEY HAVE THE SAME SHAPE. Val.same
  // falls back to object IDENTITY, which no two separately built maps
  // share -- so `x:*{a:1}|{a:number}` met by `x:{a:2}` left
  // `{"a":2}|{"a":2}`, a disjunction of one value spelled twice, past
  // the DisjunctVal dedup. Generation's old member FOLD hid that
  // (folding a value with itself is that value); ADR-007 does not, and
  // a disjunction whose alternatives are all the SAME value is
  // resolved, not ambiguous. Canon prints the collapse too, which is
  // the more honest text.
  //
  // Structural, and deliberately strict: container kind, closedness,
  // the marks, the optional keys and the key set must all agree before
  // the children are compared pairwise. Recursion terminates because a
  // reference is not a bag -- RefVal keeps the identity comparison.
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
    // The SPREAD is part of the shape (BUGS.md §52 regime 4): `[]`
    // and `[&: T]` share an empty key set, and calling them the same
    // value collapsed the disjunction to its first arm before any
    // data could pick -- the vacuous-schema hole. Two spreads are the
    // same when their canons are.
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

      // A CONJUNCT IS GENERABLE WHEN IT IS A SETTLED SIZING RESIDUE
      // (the review's finding C, use-cases/BUGS.md §16). `length` and
      // `unique` over a container keep the readings more members could
      // still change, so `a: length(3) a:[1,2,3]` is a conjunct of the
      // atom and the list right up to generation -- which is where the
      // atom decides, in ConjunctVal.gen. Any OTHER conjunct is
      // unresolved and falls through to the residue error below,
      // exactly as before.
      else if (bagGenable(child)) {
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

// bagGenable is the bag's generability whitelist. A graph atom
// (RELATIONS P2) is exactly as generable as the value it carries: the
// atom is transparent at generation, so wrapping a field's value in
// acyclic() must not change whether the bag accepts it -- an unmet
// rel() refuses required generation with or without the atom, and a
// BARE atom generates nothing and is dropped, exactly as an unmet
// rel() under an optional key is.
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
    || true === child.isMap
    || true === child.isList
    || true === child.isPref
    || true === child.isRef
    || true === child.isDisjunct
    || true === child.isNil
    || undefined !== sizingResidue(child)
}
