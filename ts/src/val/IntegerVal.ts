/* Copyright (c) 2021-2023 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr, AontuError } from '../err'

import { ScalarVal } from './ScalarVal'
import { Integer } from './ScalarKindVal'
import { isIntegerKind, integerDigits } from './numkind'
import { genWrite, genWrites } from './genwrite'

import {
  explainOpen,
  ec,
  explainClose,
} from '../utility'


class IntegerVal extends ScalarVal {
  isInteger = true


  get canon() {
    return integerDigits(this.peg as number)
  }


  gen(ctx?: AontuContext) {
    const peg = this.peg as number
    const out = Number.isSafeInteger(peg) ? peg : BigInt(peg)
    return genWrites(ctx, this) ? genWrite(ctx, this, out) : out
  }

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    // An IntegerVal must hold a value of *integer kind*: integral AND
    // within the int64 range, so it can never hold something the Go
    // port's int64 storage could not (see isIntegerKind). Every
    // construction site pre-checks with the same helper, so reaching
    // here is a programming error, not user input — hence a throw.
    if (!isIntegerKind(spec.peg)) {
      throw new AontuError('not-integer-kind: ' + spec.peg)
    }
    super({ ...spec, kind: Integer }, ctx)
  }

  unify(peer: any, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Integer', this, peer)

    let out: Val = this

    if (null != peer) {
      if (peer.isScalarKind || (peer as any).isConstraint) {
        out = peer.unify(this, te ? ctx.clone({ explain: ec(te, 'KND') }) : ctx)
      }
      else if (
        peer.isScalar &&
        peer.kind === this.kind &&
        peer.peg === this.peg
      ) {
        out = this
      }
      else if (peer.isTop) {
        out = this
      }
      else {
        out = makeNilErr(ctx, 'scalar_' +
          ((peer as any).kind === this.kind ? 'value' : 'kind'), this, peer)
      }
    }
    else {
      out = super.unify(peer, ctx)
    }

    explainClose(te, out)

    return out
  }
} /* node:coverage ignore next 6 */


export {
  IntegerVal,
}
