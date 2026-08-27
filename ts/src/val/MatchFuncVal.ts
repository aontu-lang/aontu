/* Copyright (c) 2025 Richard Rodger, MIT License */

// GENERATION: `match(v, p1, r1, p2, r2, …, d?)` (G8 phase 2,
// docs/capability-review/g8-generation.md). A BOUNDED conditional:
// alternating pattern/result arguments and an optional trailing
// default. The first pattern IN ARGUMENT ORDER that `v` unifies with
// SELECTS its result, and the result is the answer.
//
// The design said the answer was `v & p & r` -- the scrutinee narrowed
// by the arm rather than replaced by it. That cannot be what a match
// is for: it makes every arm whose result is not already a `v` a
// contradiction, and the design's own example
// (`match($.tier, small, {cpu:1}, …)`, a string scrutinee and map
// results) cannot be evaluated at all under it. A match MAPS a value
// to another value; a document that wants the scrutinee kept can say
// so, because the scrutinee is a value it can name.
//
//   size: match($.tier, small, {cpu:1}, large, {cpu:8}, {cpu:2})
//
// WHAT KEEPS IT FROM BECOMING A CONDITIONAL LANGUAGE. The scrutinee is
// matched by UNIFIABILITY only: no boolean guards, no comparisons
// beyond what the constraint atoms already are, no fallthrough (first
// match wins, in a spec-pinned order), and no way to write a pattern
// that is not an ordinary Aontu value. The whole form is total.
//
// NO MATCH AND NO DEFAULT IS AN ERROR, not an empty answer, and the
// report names the patterns that were tried -- the admissible-
// alternatives shape (G2's error contract). A default is how a
// document says it meant to allow the rest.
//
// A RESULT IS NOT EVALUATED UNTIL IT IS SELECTED. Only the scrutinee
// and the patterns are driven; an unselected result never runs, so a
// broken arm nobody takes is not an error the document has to carry
// (which multi-error collection, G2 phase 6, would otherwise report).

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
import { FuncBaseVal, trialUnify } from './FuncBaseVal'


// THE DEFAULTED-SCRUTINEE RULE (ADR-004, use-cases/BUGS.md §5). The
// generation-effective view of a settled scrutinee: a preference — or
// a disjunction carrying one — means "this value unless something
// overrides it", and by resolve time the model has SETTLED (staging
// rule), so nothing will. The value generation is about to emit is
// therefore the value the patterns must be tested against. Testing
// against the still-open preference instead let a pattern SELECT an
// arm by overriding the default: `side_effect:*readonly|write|
// destructive` beside `match(.side_effect, destructive, true, false)`
// answered `true` while generating "readonly" next to it — a derived
// value contradicting the very value it derives from, exit 0.
// A pref-free scrutinee (open disjunction included) is untouched:
// matching by unifiability is its documented meaning.
// Exported for the multi-pref unit test (ADR-002, the subsumeNode
// precedent): rankPrefs leaves a settled disjunct at most one pref, so
// the min-rank scan below cannot be reached through a document.
export function effectiveScrutinee(v: Val): Val {
  let out: any = v
  if (true === out?.isDisjunct && Array.isArray(out.peg)) {
    const prefs = out.peg.filter((m: any) => true === m?.isPref)
    if (0 === prefs.length) {
      return v
    }
    // Generation picks the LOWEST rank (effectiveDefault in
    // subsume.ts; `a:**1|*2` generates 2). rankPrefs leaves at most
    // one pref standing in a settled disjunct, so the scan is
    // defensive.
    out = prefs.reduce((a: any, b: any) => b.rank < a.rank ? b : a)
  }
  return prefInnerPeg(out)
}


class MatchFuncVal extends FuncBaseVal {
  isMatchFunc = true

  // THE STAGING RULE (G8 phase 0). A scrutinee that is still being
  // narrowed can match an EARLIER pattern than the one it will end up
  // matching, and the arm a match takes is not a thing to guess at.
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


  // The scrutinee is argument 0 and the patterns are the odd
  // arguments; the results are the even ones after 0, and the last
  // argument is a DEFAULT when the count is even. Written once, read
  // by both the driver below and resolve.
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
      if (undefined !== trialUnify(ctx, scrutinee.clone(ctx), pattern.clone(ctx))) {
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
