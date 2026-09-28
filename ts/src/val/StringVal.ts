/* Copyright (c) 2021-2025 Richard Rodger, MIT License */

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr, descErr } from '../err'
import { AontuError } from '../err'

import { ScalarVal } from './ScalarVal'
import { ScalarKindVal } from './ScalarKindVal'


class StringVal extends ScalarVal {
  isString = true

  // `string` means a NON-EMPTY string, and `empty()` waives that. Both
  // are FLAGS that every meet ORs together, and generation decides, so
  // the answer does not depend on which of them meets "" first.
  needsNonEmpty: boolean
  emptyOk: boolean

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super({ peg: spec.peg, kind: String }, ctx)
    this.needsNonEmpty = true === (spec as any).needsNonEmpty
    this.emptyOk = true === (spec as any).emptyOk
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    return super.clone(ctx, {
      needsNonEmpty: this.needsNonEmpty,
      emptyOk: this.emptyOk,
      ...(spec ?? {}),
    } as any)
  }

  withEmpty(ctx: AontuContext): Val {
    return this.emptyOk ? this : this.clone(ctx, { emptyOk: true } as any)
  }

  withNonEmpty(ctx: AontuContext): Val {
    return this.needsNonEmpty || '' !== this.peg ? this :
      this.clone(ctx, { needsNonEmpty: true } as any)
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer
    if (true === p.isString && this.peg === p.peg) {
      const needs = this.needsNonEmpty || p.needsNonEmpty
      const ok = this.emptyOk || p.emptyOk
      return needs === this.needsNonEmpty && ok === this.emptyOk ? this :
        needs === p.needsNonEmpty && ok === p.emptyOk ? p :
          this.clone(ctx, { needsNonEmpty: needs, emptyOk: ok } as any)
    }
    return super.unify(peer, ctx)
  }

  // The kind that admits this value: "" needs the waiver.
  superior() {
    return this.place(new ScalarKindVal({
      peg: String, emptyOk: '' === this.peg || this.emptyOk,
    } as any))
  }

  get refused(): boolean {
    return '' === this.peg && this.needsNonEmpty && !this.emptyOk
  }

  get canon() {
    return (this.refused ? 'string&' : '') + JSON.stringify(this.peg)
  }

  gen(ctx: AontuContext) {
    if (this.refused) {
      const nerr = makeNilErr(ctx, 'string_empty', this)
      descErr(nerr, ctx)
      ctx?.adderr(nerr)
      if (null == ctx || !ctx.collect) {
        throw new AontuError(nerr.msg, [nerr])
      }
      return undefined
    }
    return super.gen(ctx)
  }

} /* node:coverage ignore next 5 */

export {
  StringVal,
}
