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
import { repathInstance } from './Val'
import { readsPlace } from './ConstraintVal'


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


// A value a selection is made by: a scalar, or a bag of such; a nil refuses as before.
function generates(v: Val): boolean {
  const s: any = effectiveScrutinee(v)
  return true === s?.isScalar || true === s?.isNil ||
    (true === s?.isMap && Object.keys(s.peg).every((k: string) =>
      s.optionalKeys.includes(k) || generates(s.peg[k]))) ||
    (true === s?.isList && s.peg.every((c: Val) => generates(c)))
}


// A result stands where the selection stands, so the relative paths
// written in it read from there, as a template's instance reads them.
function placed(result: Val, ctx: AontuContext): Val {
  const out = result.clone(ctx, { dup: true })
  repathInstance(out, ctx.path)
  return out
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
    // A scrutinee reading the match's own place reads the peer held there,
    // and waits, to be read again, while the peer leaves it open.
    const own = !peer.isTop && readsPlace(this.peg[0], this.path) ?
      this.peg[0].clone(ctx, { dup: true }) : undefined
    let ready = this.driveStagedArgs(peer.isTop ? ctx : ctx.holdArm(this.path, peer, undefined, true), 1)
    if (undefined !== own && ready && !generates(this.peg[0])) {
      this.peg[0] = own
      ready = false
    }
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
      if (undefined !== met && sameMembers(scrutinee, met, ctx, true)) {
        return placed(args[i + 1], ctx)
      }
    }

    if (undefined !== dflt) {
      return placed(dflt, ctx)
    }

    return makeNilErr(ctx, 'match_none', this, undefined, 'resolve', {
      value: scrutinee.canon,
      tried: tried.join(' '),
    })
  }

} /* node:coverage ignore next 6 */



export {
  MatchFuncVal,
}
