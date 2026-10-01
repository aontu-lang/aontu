/* Copyright (c) 2021-2023 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  descErr,
  makeNilErr,
  AontuError
} from '../err'

import {
  AontuContext,
} from '../ctx'


import { StringVal } from './StringVal'
import { FeatureVal } from './FeatureVal'
import { NullVal } from './NullVal'
import { BooleanVal } from './BooleanVal'
import { NumberVal } from './NumberVal'
import { IntegerVal } from './IntegerVal'
import { isIntegerKind } from './numkind'


import {
  explainOpen,
  ec,
  explainClose,
} from '../utility'

import { unite } from '../unify'

import { top } from './top'


class VarVal extends FeatureVal {
  isVar = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Var', this, peer)

    let out: Val

    let nameVal

    if (this.peg.isVal) {
      if (this.peg.isRef) {
        this.peg.absolute = true
        nameVal = this.peg
      }
      else {
        // Resolve the NAME against TOP only — the peer applies to the
        // variable's resolved VALUE below, not to its name (so
        // `k1:$flag &:boolean` checks the boolean value of $flag
        // against the spread, instead of unifying the string "flag"
        // with it).
        nameVal = this.peg.unify(top(), te ? ctx.clone({ explain: ec(te, 'PEG') }) : ctx)
      }
    }
    else {
      nameVal = new StringVal({ peg: '' + this.peg }, ctx)
    }

    if (!(nameVal.isRef) && DONE === nameVal.dc) {
      // `$` admits only a name, so a settled name is a string.
      {
        let found = ctx.vars[(nameVal as StringVal).peg]

        const ft = typeof found
        // Single ladder: a missing var must report `unknown_var` and not
        // fall through to the `invalid_var_kind` default below.
        if (undefined === found) {
          out = makeNilErr(ctx, 'unknown_var', this, peer)
        }
        else if (null === found) {
          out = this.place(new NullVal({ peg: null }))
        }
        else if ('string' === ft) {
          out = new StringVal({ peg: found })
        }
        else if ('boolean' === ft) {
          out = new BooleanVal({ peg: found })
        }
        else if ('number' === ft) {
          // A raw var binding carries no source text, so the integral +
          // int64-range conditions decide the kind (same helper as the
          // val rule and rawToVal).
          // (ctx.vars is declared as Record<string, Val> but also
          // carries raw scalars, which is what `ft` has just proven.)
          out = isIntegerKind(found as unknown as number) ?
            new IntegerVal({ peg: found }) :
            new NumberVal({ peg: found })
        }
        else if ('object' === ft && found.isVal) {
          out = found
        }
        else {
          out = makeNilErr(ctx, 'invalid_var_kind', this, peer)
        }

        if (!out.isNil && null != peer && !peer.isTop) {
          out = unite(te ? ctx.clone({ explain: ec(te, 'VAL') }) : ctx,
            out, peer, 'var-val')
        }
      }
    }
    else {
      out = nameVal
    }

    explainClose(te, out)

    return out
  }


  same(peer: Val): boolean {
    return null == peer ? false : peer instanceof VarVal && this.peg === peer.peg
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, spec) as VarVal)
    return out
  }


  get canon() {
    return '$' + (this.peg?.isVal ? this.peg.canon : '' + this.peg)
  }


  gen(ctx?: AontuContext) {
    // Unresolved var cannot be generated, so always an error.
    let nil = makeNilErr(
      ctx,
      'var',
      this,
      undefined
    )

    nil.path = this.path
    nil.site.url = this.site.url
    nil.site.row = this.site.row
    nil.site.col = this.site.col

    descErr(nil, ctx)

    if (ctx) {
      ctx.adderr(nil)
    }
    else {
      throw new AontuError(nil.msg)
    }

    return undefined
  }
} /* node:coverage ignore next 6 */


export {
  VarVal,
}
