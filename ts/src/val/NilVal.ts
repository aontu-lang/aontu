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

    if (null != ctx?.path && 0 < ctx.path.length &&
      (null != bv || null == nil.path || 0 === nil.path.length)) {
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

    out.primary = this.primary
    out.secondary = this.secondary

    out.msg = this.msg
    // The hint reads the details, so a clone that dropped them left
    // `{name}` in the message. A struct copy carries them in Go.
    out.details = this.details
    return out
  }


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


const TRIAL_NIL = new NilVal({ why: '|:trial-nil' }) /* node:coverage ignore next 7 */


export {
  NilVal,
  TRIAL_NIL,
}
