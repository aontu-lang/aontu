/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type {
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'


import { Val, EMPTY_ERR } from './Val'

import { AontuError, descErr } from '../err'

import { codeClass } from '../hints'


class NilVal extends Val {
  isNil = true
  isGenable = true

  nil = true
  why: any
  primary?: Val
  secondary?: Val
  msg: string = ''
  attempt?: string
  details?: Record<string, any>

  // TODO: include Val generating nil, thus capture type

  // A Nil is an error - should not happen - unify failed
  // refactor ,make(spec,ctx)
  static make = (
    ctx?: AontuContext,
    why?: any,
    av?: Val,
    bv?: Val,
    attempt?: string,
    details?: Record<string, any>
  ) => {
    let nil = new NilVal({ why }, ctx)

    nil.attempt = attempt
    nil.details = details

    // Terms later in same file are considered the primary error location.
    if (null != av) {
      nil.site.row = av.site.row
      nil.site.col = av.site.col
      nil.site.url = av.site.url

      nil.primary = av
      nil.path = av.path

      if (null != bv) {
        nil.secondary = bv

        let bv_loc_wins =
          (nil.site.url === bv.site.url) && (
            (nil.site.row < bv.site.row) ||
            (nil.site.row === bv.site.row && nil.site.col < bv.site.col)
          )

        if (bv_loc_wins) {
          nil.site.row = bv.site.row
          nil.site.col = bv.site.col
          nil.site.url = bv.site.url
          nil.primary = bv
          nil.secondary = av
          nil.path = bv.path
        }
      }
    }

    // THE PATH IS WHERE THE MEET IS, NOT WHERE THE OPERAND WAS WRITTEN
    // (use-cases/BUGS.md §41). The operand path above decides the SITE
    // correctly and the path only by accident: a value that arrives by
    // REFERENCE is re-pathed to the referring field, and its children
    // are re-pathed to that same field rather than rebased under it, so
    // every conflict inside `q: $.M` reported `$.q` — the enclosing
    // record, not the key to edit, and the SAME path for every one of
    // its fields. The context has descended to the child by the time
    // the meet fails, and Go reads the path off the tree position for
    // exactly this reason.
    //
    // Only EXTENDS, never redirects: the context path is taken when the
    // operand's path is a PREFIX of it, so a nil minted away from the
    // descent (a func resolving an argument, a generator's own probe,
    // an anchored `--at` run whose operand is already correctly placed)
    // keeps the path its operand carries. Taking the context path
    // unconditionally was tried and reverted -- it moved the closed-key,
    // spread-template and every `--at` finding to the driving location,
    // which is not where those belong.
    if (null != ctx?.path && null != nil.path &&
      nil.path.length < ctx.path.length &&
      nil.path.every((p, i) => p === ctx.path[i])) {
      nil.path = [...ctx.path]
    }

    if (ctx) {
      ctx.adderr(nil)
    }

    return nil
  }


  constructor(
    spec?: {
      why?: string
      msg?: string
      err?: NilVal | NilVal[] | Error | Error[]
    } | string,
    ctx?: AontuContext
  ) {
    super(spec && 'string' !== typeof spec ? spec : {}, ctx)

    if (spec && 'object' === typeof spec) {
      this.why = spec?.why
      this.msg = 'string' === typeof spec?.msg ? spec.msg : this.msg
      this.err =
        Array.isArray(spec.err) ? [...spec.err] :
          null != spec.err ? [spec.err] :
            EMPTY_ERR
    }

    // Nil is always DONE, by definition.
    this.dc = DONE
  }


  unify(_peer: Val, _ctx: AontuContext) {
    return this
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as NilVal)
    out.why = this.why

    // Should these clone?
    // out.primary = this.primary?.clone()
    // out.secondary = this.secondary?.clone()
    out.primary = this.primary
    out.secondary = this.secondary

    out.msg = this.msg
    return out
  }


  // TODO: custom canon? useful for unknown function errors
  get canon() {
    return 'nil'
  }


  // The code's class from the shared registry (test/spec/errcodes.tsv):
  // conflict | incomplete | reference | parse | budget | internal.
  // A why-less nil classifies as its eventual gen-time code, nil_gen.
  get class(): string {
    return codeClass(null == this.why ? 'nil_gen' : String(this.why))
  }


  gen(ctx: AontuContext) {
    // Unresolved nil cannot be generated, so always an error.

    this.why = this.why ?? 'nil_gen'
    ctx.adderr(this)

    if (!ctx.collect) {
      if (null == this.msg || '' === this.msg) {
        descErr(this, ctx)
      }
      const err = new AontuError(this.msg, [this])
      throw err
    }

    return undefined
  }


  superior(): Val {
    return this
  }


  inspection() {
    return this.why
  }

}


// Shared sentinel for transient "this unification branch failed"
// markers. Used by DisjunctVal.unify to flag failed member trials
// (and to dedup results) without allocating a fresh NilVal per
// failure. The sentinel is filtered out before the disjunct result
// is constructed, so its .why / .site / .primary fields are never
// inspected by user-visible code.
//
// Do NOT use this sentinel for errors that may surface: those need
// real NilVals with proper site/path info for descErr formatting.
const TRIAL_NIL = new NilVal({ why: '|:trial-nil' }) /* node:coverage ignore next 7 */


export {
  NilVal,
  TRIAL_NIL,
}
