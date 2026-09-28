/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import {
  explainOpen,
  explainClose,
} from '../utility'

import { makeNilErr, AontuError } from '../err'

import { FeatureVal } from './FeatureVal'


// A ScalarKind for the int64-window exact integers.
class Integer { }

// A ScalarKind for IEEE-754 binary64 values.
class Float { }

// A ScalarKind for the unbounded exact integers, reached only by a `0d`
// literal with no fraction and no exponent.
class BigInteger { }

class BigDecimal { }

// A ScalarKind for null.
class Null { }

class Path { }


const KIND_PARENT = new Map<any, any>([
  [Integer, Number],
  [Float, Number],
  [BigInteger, Number],
  [BigDecimal, Number],
])


// The immediate lattice superior of a kind marker, or undefined when the
// marker's superior is any.
function kindParent(kind: any): any {
  return KIND_PARENT.get(kind)
}


// True when `sub` is `sup`, or sits anywhere below it. The numeric
// lattice is two deep today; walking the chain keeps this correct if it
// ever deepens.
function kindSubsumes(sup: any, sub: any): boolean {
  for (let k = sub; null != k; k = KIND_PARENT.get(k)) {
    if (k === sup) {
      return true
    }
  }
  return false
}


type ScalarConstructor =
  StringConstructor |
  NumberConstructor |
  BooleanConstructor |
  (typeof Integer) |
  (typeof Float) |
  (typeof BigInteger) |
  (typeof BigDecimal) |
  (typeof Null) |
  (typeof Path) |
  (typeof Integer.constructor)


class ScalarKindVal extends FeatureVal {
  isScalarKind = true

  // `string & empty()`: the string kind that also admits "".
  emptyOk: boolean

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)

    if (null == this.peg) {
      throw new AontuError('ScalarKindVal spec.peg undefined')
    }

    this.emptyOk = String === this.peg && true === (spec as any).emptyOk
    this.dc = DONE
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    return super.clone(ctx, { emptyOk: this.emptyOk, ...(spec ?? {}) } as any)
  }


  withEmpty(ctx: AontuContext): Val {
    return this.emptyOk ? this : this.clone(ctx, { emptyOk: true } as any)
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'ScalarKind', this, peer)

    const peerIsScalarVal = peer.isScalar
    const peerIsScalarKind = (peer as ScalarKindVal).isScalarKind

    let out: Val = this

    if ((peer as any).isConstraint) {
      // The constraint algebra owns the kind-meets-constraint rules
      // (narrowing, domain checks) -- delegate, so disjunct trials and
      // direct drives agree with the sorted conjunct fold.
      out = (peer as any).unify(this, ctx)
    }
    else if (peerIsScalarVal) {
      let peerKind = (peer as any).kind

      if (!kindSubsumes(this.peg, peerKind)) {
        out = makeNilErr(ctx, 'no_scalar_unify', this, peer)
      }
      else if (String === this.peg) {
        out = this.emptyOk ? (peer as any).withEmpty(ctx) :
          (peer as any).withNonEmpty(ctx)
      }
      else {
        out = peer
      }
    }
    else if (peerIsScalarKind) {
      if (this.peg === peer.peg) {
        out = !this.emptyOk && true === (peer as any).emptyOk ? peer : this
      }
      else if (kindSubsumes(this.peg, peer.peg)) {
        out = peer
      }
      else if (kindSubsumes(peer.peg, this.peg)) {
        out = this
      }
      else {
        out = makeNilErr(ctx, 'scalar-type', this, peer)
      }
    }
    else {
      out = makeNilErr(ctx, 'not-scalar-type', this, peer)
    }

    ctx.explain && explainClose(te, out)

    return out
  }


  get canon() {
    let ctor = (this.peg as any)
    return ctor.name.toLowerCase() + (this.emptyOk ? '&empty()' : '')
  }


  superior(): Val {
    const parent = kindParent(this.peg)
    return null == parent ?
      super.superior() :
      this.place(new ScalarKindVal({ peg: parent }))
  }


  same(peer: any): boolean {
    let out = peer?.isScalarKind ?
      this.peg === peer?.peg && this.emptyOk === peer?.emptyOk :
      super.same(peer)
    return out
  }


} /* node:coverage ignore next 20 */


// The string kind's marker, under a name a module that has its own
// `String` in scope can import.
const String_ = String


export {
  String_,
  BigDecimal,
  BigInteger,
  Float,
  Integer,
  Null,
  Path,
  ScalarConstructor,
  ScalarKindVal,
  kindParent,
  kindSubsumes,
}
