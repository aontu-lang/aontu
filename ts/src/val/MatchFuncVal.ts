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
import { subsumeNode, newPairs } from '../subsume'
import { admitsSettled, ownJson, sealedMiss } from './admission'


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


// What a selection is made by, as the output reads it: a scalar, or a bag
// whose output members are such; a nil or an absence goes on as before.
function generates(v: Val): boolean {
  const s: any = effectiveScrutinee(v)
  const unseen = (k: string, c: any) => true === c.mark?.type || true === c.mark?.hide ||
    true === s.optionalKeys?.includes(k) || true === s.aliasKeys?.includes(k)
  return true === s?.isScalar || true === s?.isNil || true === s?.isAbsent ||
    ((true === s?.isMap || true === s?.isList) &&
      Object.entries(s.peg).every(([k, c]: [string, any]) => unseen(k, c) || generates(c)))
}


function below(scrutinee: Val, pattern: Val): boolean {
  const state: any = { profile: 'values', findings: [], generalUrl: '', specificUrl: '', pairs: newPairs() }
  return 'yes' === subsumeNode(state, [], pattern, scrutinee)
}


// The scrutinee as the output reads it: a member the generated value leaves out is no member.
function outputOf(v: any, own: any, ctx: AontuContext): Val {
  if (true !== v?.isMap || null == own || 'object' !== typeof own || Array.isArray(own)) {
    return v
  }
  const out: any = v.clone(ctx)
  const peg: any = {}
  for (const k of Object.keys(out.peg)) {
    if (Object.prototype.hasOwnProperty.call(own, k)) {
      peg[k] = outputOf(out.peg[k], own[k], ctx)
    }
  }
  out.peg = peg
  out.optionalKeys = out.optionalKeys.filter((k: string) => undefined !== peg[k])
  return out
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


  callname() {
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
    // (see the header), and the odd positions one at a time. A path to
    // the match's own place reads the peer held there; a scrutinee waits,
    // read again, until it generates a value or no data could change the
    // arm it takes (ruling 87).
    const held = peer.isTop ? ctx : ctx.holdArm(this.path, peer, undefined, true)
    const scrut = this.peg[0].done ? undefined : this.peg[0].clone(ctx, { dup: true })
    let ready = this.driveStagedArgs(held, 1)
    const open = ready && !generates(this.peg[0])
    const last = this.peg.length - (this.hasDefault() ? 1 : 0)
    for (let i = 1; i < last; i += 2) {
      const arg: Val = this.peg[i]
      if (!arg.done) {
        this.peg[i] = arg.unify(top(), readsPlace(arg, this.path) ? held : ctx)
      }
      ready = ready && true === this.peg[i].done
    }
    if (open && !(ready && this.certain(ctx))) {
      this.peg[0] = scrut ?? this.peg[0]
      ready = false
    }

    if (!ready || !ctx.settle) {
      return this.residuate(peer, ctx)
    }

    return super.unify(peer, ctx)
  }


  // The first arm the scrutinee shares a value with is taken where every value it admits satisfies the pattern.
  certain(ctx: AontuContext): boolean {
    const last = this.peg.length - (this.hasDefault() ? 1 : 0)
    for (let i = 1; i < last; i += 2) {
      if (undefined !== trialUnify(ctx, this.peg[0].clone(ctx), this.peg[i].clone(ctx))) {
        return below(this.peg[0], this.peg[i])
      }
    }
    return true
  }


  resolve(ctx: AontuContext, args: Val[]) {
    const scrutinee: Val = effectiveScrutinee(args[0])
    const dflt: Val | undefined = this.hasDefault() ?
      args[args.length - 1] : undefined
    const last = args.length - (undefined === dflt ? 0 : 1)

    const tried: string[] = []
    const open = !generates(args[0])
    const own = open ? undefined : ownJson(scrutinee, ctx)
    const output = undefined === own ? undefined : outputOf(scrutinee, own, ctx)

    for (let i = 1; i < last; i += 2) {
      const pattern: Val = args[i]
      tried.push(pattern.canon)

      const admits = undefined === output ? undefined :
        !sealedMiss(pattern, own) && admitsSettled(ctx, pattern, output, own, this.path)
      if (undefined !== admits) {
        if (admits) {
          return placed(args[i + 1], ctx)
        }
        continue
      }

      // The trial is against CLONES: `unite` refines a bag in place
      // against a TOP peer, and a pattern that failed must be
      // untouched for the next document that reads its canon.
      const met = trialUnify(ctx, scrutinee.clone(ctx), pattern.clone(ctx))
      if (undefined !== met && (sameMembers(scrutinee, met, ctx, true) || (open && below(args[0], pattern)))) {
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

}


// keyed() IS CARRIED OUT BY ITS MATCH AND WRITTEN UNDER ITS OWN NAME.
class KeyedFuncVal extends MatchFuncVal {
  callname() {
    return 'keyed'
  }


  get canon() {
    const [, p, t, e] = this.peg
    return 'keyed(' + p.canon + ',' + t.canon + (true === e.isTop ? '' : ',' + e.canon) + ')'
  }
} /* node:coverage ignore next 7 */



export {
  MatchFuncVal,
  KeyedFuncVal,
}
