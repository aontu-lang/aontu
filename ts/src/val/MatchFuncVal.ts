/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { top } from './top'
import { prefInnerPeg } from './PrefVal'
import { FuncBaseVal, trialUnify, sameMembers } from './FuncBaseVal'


export function effectiveScrutinee(v: Val): Val {
  let out: any = v
  if (true === out?.isDisjunct && Array.isArray(out.peg)) {
    const prefs = out.peg.filter((m: any) => true === m?.isPref)
    if (0 === prefs.length) {
      return v
    }
    out = prefs.reduce((a: any, b: any) => b.rank < a.rank ? b : a)
  }
  return prefInnerPeg(out)
}


class MatchFuncVal extends FuncBaseVal {
  isMatchFunc = true

  staged = true

  constructor(
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
  }


  funcname() {
    return 'match'
  }


  prepare(_ctx: AontuContext, _args: Val[]) {
    return null
  }


  hasDefault() {
    return 0 === this.peg.length % 2
  }


  unify(peer: Val, ctx: AontuContext): Val {
    // The scrutinee and the PATTERNS are driven; the results are not
    // (see the header). driveStagedArgs takes a prefix, so the odd
    // positions are driven one at a time.
    let ready = this.driveStagedArgs(ctx, 1)
    const last = this.peg.length - (this.hasDefault() ? 1 : 0)
    for (let i = 1; i < last; i += 2) {
      const arg: Val = this.peg[i]
      if (!arg.done) {
        this.peg[i] = arg.unify(top(), ctx)
      }
      ready = ready && true === this.peg[i].done
    }

    if (!ready || !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const scrutinee: Val = effectiveScrutinee(args[0])
    const dflt: Val | undefined = this.hasDefault() ?
      args[args.length - 1] : undefined
    const last = args.length - (undefined === dflt ? 0 : 1)

    const tried: string[] = []

    for (let i = 1; i < last; i += 2) {
      const pattern: Val = args[i]
      tried.push(pattern.canon)

      // The trial is against CLONES: `unite` refines a bag in place
      // against a TOP peer, and a pattern that failed must be
      // untouched for the next document that reads its canon.
      const met = trialUnify(ctx, scrutinee.clone(ctx), pattern.clone(ctx))
      if (undefined !== met && sameMembers(scrutinee, met, ctx)) {
        return args[i + 1].clone(ctx)
      }
    }

    if (undefined !== dflt) {
      return dflt.clone(ctx)
    }

    return makeNilErr(ctx, 'match_none', this, undefined, 'resolve', {
      value: scrutinee.canon,
      tried: tried.join(' '),
    })
  }

} /* node:coverage ignore next 5 */


export {
  MatchFuncVal,
}
