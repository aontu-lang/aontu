/* Copyright (c) 2021-2023 Richard Rodger, MIT License */


import type { Val } from './type'

import { AontuContext } from './ctx'

import { DONE } from './type'

import { makeNilErr } from './err'

import { NilVal } from './val/NilVal'
import { hasPlace } from './val/PlaceVal'

import {
  Lang
} from './lang'


import {
  explainOpen, ec, explainClose,
} from './utility'


import {
  top
} from './val/top'


// The evaluation budgets live on the context (ctx.budget: passes,
// revisits, depth), defaulted there to the shared spec-visible
// constants test/spec/budget.tsv pins in both ports (9 / 999 / 1000)
// and configurable through the trust profile (G5, docs/trust.md) —
// deterministically: a budget is an integer count of engine events,
// never wall-clock.
//
// Why the revisit default is 999: how many times one (Val, path) pair
// may be re-unified within a single fixpoint pass before the evaluator
// calls it non-convergence (`unify_cycle`). The old false positive here
// -- a legal model with many sibling conjunct terms at one path, each
// re-running the TOP self-unify -- is fixed by the per-pass memo below
// (_tcc/_tpi); test/spec/budget.tsv drives 1200 sibling terms through
// both engines as the regression guard.
//
// Why the depth default is 1000: the whole shared suite peaks at 603
// (the deliberately extreme 1200-sibling-term fixture; ordinary
// documents are two orders below), and V8 exhausts its call stack
// somewhere past depth ~1500 in this evaluator. 1000 sits above every
// real document and below the host limit, so the budget -- not the
// host -- decides the verdict.

// Charge a DIRECT `Val.unify` recursion to the same depth budget that
// `unite` enforces. Function and operator arguments evaluate through
// `arg.unify(top(), ...)` rather than through the dispatcher, so without
// this the counter stays flat while the JavaScript stack keeps growing:
// a 1500-deep `upper(upper(...))` resolved in TypeScript while Go — which
// routes its arguments through the counted dispatcher — reported
// `unify_cycle`. Returns the budget nil instead of running when the
// budget is spent.
const withDepth = (
  ctx: AontuContext, a: any, b: any, run: () => any
): any => {
  if (ctx.budget.depth <= ctx._depth.n) {
    return makeNilErr(ctx, 'unify_cycle', a, b)
  }
  ctx._depth.n++
  try {
    return run()
  }
  finally {
    ctx._depth.n--
  }
}


// Vals should only have to unify downwards (in .unify) over Vals they understand.
// and for complex Vals, TOP, which means self unify if not yet done
const unite = (ctx: AontuContext, a: any, b: any, whence: string) => {
  // Fast paths that don't recurse and so don't need cycle-detection:
  // short-circuit before the saw-key build and seen-map lookup (which
  // together cost ~2.5µs per call). Only return early when the result
  // is already `done` — a non-done result would need the trailing
  // top() unify below.
  //
  //   A6a: same ref, already done
  //   A6b: different ref but same id + both done
  //   P1:  exact-equal scalars that are already done (14% of calls
  //        in foo-sdk, ~100% with a.done=true)
  if (a !== undefined && a !== null) {
    if (a === b) {
      if (a.done) return a
    }
    // ... and NOT on an instrumented run (G7 provenance). Both arms
    // below answer with one operand and never reach the recorder at
    // the tail, so an equal pair — two positions of one entity that
    // agree, a clone meeting its source — contributed silently and
    // `why` named one site where the Go port, whose recorder wraps the
    // whole dispatcher, named both. Instrumented runs pay the slow
    // path knowingly; uninstrumented ones pay one undefined check.
    else if (b !== undefined && b !== null && undefined === ctx.prov) {
      if (a.done && b.done) {
        if (a.id === b.id) {
          // The deprecation record survives the fast path (G3).
          if (null == a.deprecation && null != b.deprecation) {
            a.deprecation = b.deprecation
          }
          return a
        }
        if (a.constructor === b.constructor && a.peg === b.peg
            && !a.isNil && !b.isNil
            && !a.isMap && !a.isList
            && !a.isConjunct && !a.isDisjunct
            && !a.isRef && !a.isPref && !a.isFunc && !a.isExpect
            // NOT two TOPs (G4 phase 1): every top has the same
            // (absent) peg, so this path treated any two as the same
            // value — true of the unit itself, false of a unit
            // CARRYING AN IDENTITY, and `id(x) & id(y)` is two of
            // those. The slow path answers the same thing for two
            // plain tops, and refuses the pair for two named ones.
            && !a.isTop && !b.isTop
            // NOT two rel residuals (RELATIONS P1) for the same
            // reason: a settled rel is DONE with an absent peg, so
            // any two matched here — dropping one side's type and
            // held constraints. RelVal.unify merges them instead.
            && !a.isRel) {
          // The deprecation record survives the fast path too (G3):
          // `deprecate(5) & 5` short-circuits here.
          if (null == a.deprecation && null != b.deprecation) {
            a.deprecation = b.deprecation
          }
          return a
        }
      }
    }
  }

  const te = ctx.explain && explainOpen(ctx, ctx.explain, 'unite', a, b)

  let out = a
  let why = 'u'

  // Cycle-detection key. Use numeric path index for speed; fall back to
  // full string key when debug is enabled so the saw value is human-readable.
  const saw = ctx.opts.debug
    ? (a ? a.id + (a.done ? '' : '*') : '') + '~' +
      (b ? b.id + (b.done ? '' : '*') : '') + '@' + ctx.pathstr
    : (a ? a.id + (a.done ? 'd' : '') : 0) + '~' +
      (b ? b.id + (b.done ? 'd' : '') : 0) + '~' + ctx.pathidx

  // NOTE: if this error occurs "unreasonably", attemp to avoid unnecesary unification
  // See for example PrefVal peg.id equality inspection.
  const sawCount = ctx.seen[saw] ?? 0
  if (ctx.budget.depth <= ctx._depth.n) {
    // Structural recursion budget. Without it, deep nesting exhausts the
    // V8 call stack and the catch-all below reports a RangeError as
    // `internal` — a verdict that depends on the host's stack size
    // rather than on the document, which is exactly what the
    // determinism clause forbids (docs/trust.md). Tripping here instead
    // makes it a stated budget error, like the pass budget.
    out = makeNilErr(ctx, 'unify_cycle', a, b)
  }
  else if (ctx.budget.revisits < sawCount) {
    // console.log('SAW', sawCount, saw, a?.id, a?.canon, b?.id, b?.canon, ctx.cc)
    out = makeNilErr(ctx, 'unify_cycle', a, b)
  }
  else {
    ctx.seen[saw] = sawCount + 1
    ctx._depth.n++

    try {
      let unified = false

      // Dispatch ladder. Structure note:
      //   - `a == null` is degenerate (shouldn't happen in practice:
      //     the top-level call seeds with a real Val). Kept for safety.
      //   - TOP is the unit element: unifying with it returns the
      //     other side. Handle both sides.
      //   - Otherwise route by Val type. Complex Vals (Conjunct,
      //     Disjunct, Ref, Pref, Func, Expect) have their own unify
      //     that knows how to absorb the peer; prefer `a.unify` when
      //     `a` is complex, else `b.unify` when `b` is complex. If
      //     neither is complex and it's not a plain-scalar match, fall
      //     through to the generic `a.unify` (concrete Val classes
      //     each handle their own peer case).
      if (a == null) {
        out = b
        why = 'b'
      }
      else if (b == null || b.isTop) {
        out = a
        why = 'a'
      }
      else if (a.isTop) {
        out = b
        why = 'b'
      }
      else if (a.isNil) {
        out = update(a, b)
        why = 'an'
      }
      else if (b.isNil) {
        out = update(b, a)
        why = 'bn'
      }
      else if (a.isConjunct || a.isExpect) {
        out = a.unify(b, te ? ctx.clone({ explain: ec(te, 'AC') }) : ctx)
        unified = true
        why = 'a*'
      }
      else if (
        b.isConjunct
        || b.isDisjunct
        || b.isRef
        || b.isPref
        || b.isVar
        || b.isFunc
        || b.isExpect
        // The refer residual (G4 phase 2) DRIVES, like the other
        // residuals here: its peer is a plain string, which knows
        // nothing about entity addresses, so letting the string drive
        // dropped the address and left the constraint standing.
        || b.isRefer
        // An operator holding a HOLE (G8 phase 3) drives for the same
        // reason: its peer is what FILLS it, and a scalar asked to
        // unify with `_ + 2` sees an operator rather than a hole and
        // refuses it on kind. Narrow to placeheld operators on
        // purpose -- every other operator meets its peer the way it
        // always has, through the conjunct fold that drives it.
        || (b.isOp && hasPlace(b))
      ) {
        out = b.unify(a, te ? ctx.clone({ explain: ec(te, 'BW') }) : ctx)
        unified = true
        why = 'bv'
      }
      // Exactly equal scalars (not caught by early fast-path — e.g.
      // because a or b isn't .done yet). Rel residuals are excluded
      // exactly as in the fast path: their pegs are equally absent
      // without the values being the same relation.
      else if (a.constructor === b.constructor && a.peg === b.peg
        && !a.isRel) {
        out = update(a, b)
        why = 'up'
      }
      else {
        out = a.unify(b, te ? ctx.clone({ explain: ec(te, 'GN') }) : ctx)
        unified = true
        why = 'ab'
      }

      if (!out || !out.unify) {
        out = makeNilErr(ctx, 'unite', a, b, whence + '/nil')
        why += 'N'
      }

      // Any non-done top-level result self-unifies with TOP to ensure
      // its children finish converging. Skipped when `unified` is true
      // because the branch that set `out = X.unify(Y, ctx)` already
      // ran that Val's own unify logic.
      if (!out.done && !unified) {
        // Once per pass per (Val, path): within a single fixpoint pass
        // nothing external to the subtree changes, so repeating the TOP
        // self-unify — which conjunct folds otherwise trigger once per
        // fold term — is pure re-work, and on large models (hundreds of
        // sibling terms) the repeats trip the MAXCYCLE guard as a false
        // positive. The path is part of the key: a shared Val can
        // resolve path-dependent content differently per location.
        if (undefined !== ctx.cc
          && (out as any)._tcc === ctx.cc && (out as any)._tpi === ctx.pathidx) {
          why += 't'
        }
        else {
          out = out.unify(top(), te ? ctx.clone({ explain: ec(te, 'ND') }) : ctx)
          if (!out.done && undefined !== ctx.cc) {
            ; (out as any)._tcc = ctx.cc
            ; (out as any)._tpi = ctx.pathidx
          }
          why += 'T'
        }
      }
    }
    catch (err: any) {
      // This catch-all converts an unexpected exception into an 'internal'
      // Nil so one bad node doesn't crash a whole unify. To avoid fully
      // masking regressions, preserve the original error message (and a
      // RangeError flag — i.e. stack overflow from runaway recursion) on
      // the Nil's details so it surfaces in the formatted error rather
      // than vanishing. See err.ts (descErr) for how details render.
      out = makeNilErr(ctx, 'internal', a, b, undefined, {
        error: String(err?.message ?? err),
        ...(err instanceof RangeError ? { overflow: true } : {}),
      })
    }
    finally {
      ctx._depth.n--
    }
  }

  ctx.explain && explainClose(te, out)

  // The provenance record (G7 phase 3), at the one place every meet
  // passes through — the same reason the deprecation rider below lives
  // here. Off by default: an uninstrumented run pays this one property
  // load, and an instrumented one pays site materialisation knowingly.
  if (undefined !== ctx.prov) {
    ctx.prov.record(ctx.path, a, b, out)
  }

  // The IDENTITY survives every meet (G4 phase 1), by the same
  // channel and for the same reason as the deprecation record below.
  // TWO DIFFERENT NAMES on one node is a contradiction, not a merge:
  // one node cannot be two entities, and the error names both sites.
  if (null != out && true === (out as any).isVal && !out.isNil) {
    const ae = null != a ? a.entity : undefined
    const be = null != b ? b.entity : undefined
    if (null != ae && null != be && ae !== be) {
      out = makeNilErr(ctx, 'id_conflict', a, b)
    }
    else if (!out.isTop) {
      const e = ae ?? be
      if (null != e) {
        out.entity = e
      }
    }
  }

  // The deprecation record survives EVERY meet (G3 phase 4): the
  // boolean marks have their own sweeps (ConjunctVal, the bag walks),
  // but a record lost in one meet shape is a use the tooling never
  // warns about, so it rides here, at the one place all meets pass
  // through. First record wins; TOP and nil stay clean (TOP is the
  // unit, and an error needs no deprecation).
  if (null != out && true === (out as any).isVal &&
    !out.isTop && !out.isNil && null == out.deprecation) {
    const dep = (null != a ? a.deprecation : undefined) ??
      (null != b ? b.deprecation : undefined)
    if (null != dep) {
      out.deprecation = dep
    }
  }

  return out
}


function update(x: Val, _y: Val) {
  // TODO: update x with y.site
  return x
}


// The still-refining paths named by a budget_passes error: the first
// `max` non-done nodes of the residue, as `$.dotted.paths`. Depth-first
// over bag children only -- this feeds an error message, not a report,
// so a small deterministic sample beats completeness.
function residuePaths(v: Val, max: number): string[] {
  const out: string[] = []
  const visit = (n: any, isroot: boolean) => {
    if (null == n || max <= out.length) {
      return
    }
    if (!isroot && !n.done) {
      out.push('$' + (0 < (n.path?.length ?? 0) ? '.' + n.path.join('.') : ''))
    }
    if (n.isMap || n.isList) {
      for (const k in n.peg) {
        visit(n.peg[k], false)
      }
    }
  }
  visit(v, true)
  return out
}


// IDENTITY-MERGE (G4 phase 1): every node in one evaluation carrying
// the same id is unified with every other. Declaring two nodes the
// same entity MEANS unifying them, so this is not a lookup table —
// it is a meet, and a contradiction between two declarations is an
// ordinary conflict naming both sites.
//
// Run once per fixpoint pass, after the pass's own unification: a
// position picks up the representative, the representative picks up
// the position, and the two converge across passes exactly as chained
// references do, inside the same `maxcc` bound.
//
// The tree stays a TREE. Every declared position holds the merged
// value and generation emits it at each path — duplication, as
// references generate today. Identity adds addressing, not a new
// shape.
// The ctx DESCENDS with the walk, so the merge's meet happens at the
// position's own path: a contribution `$.b.k` picked up from `$.a.k`
// is recorded against `$.b.k`, which is where a reader asking `why`
// stands. Merging under the root ctx instead filed every contribution
// at the top and left the positions themselves with an empty record —
// and the Go port, whose bag loops derive the base from the value's
// own path, already answered the useful way.
function mergeEntities(ctx: AontuContext, root: Val): Val {
  const reg: Map<string, Val> = (ctx as any).entities

  // COLLECT, then APPLY — the same walk twice, not two walks. A single
  // pass merges each position into the representative as it meets it,
  // which leaves the positions it already passed holding the pre-merge
  // value: `a: id(x) & {k:1}` kept `{k:1}` while `b: id(x) & {j:2}`
  // became `{j:2,k:1}`, and the two sites disagreed about what the one
  // entity is. The representative is therefore settled over the WHOLE
  // tree before any position is written.
  //
  // `write` is which half is running. One function rather than two
  // because the two halves differ in three lines and agree in the walk
  // — and a walk written twice is a walk that drifts.
  const walk = (node: any, seen: Set<any>, nctx: AontuContext,
    write: boolean): any => {
    if (null == node || true !== node.isVal) {
      return node
    }

    const name = (node as any).entity
    if (null != name) {
      if (write) {
        // The SUBSTITUTION happens before the seen-guard, not after.
        // Two positions of one entity hold the SAME object once a pass
        // has merged them, so a guard that ran first would visit the
        // first position, replace it with a newer representative, and
        // then skip the second as already-seen — leaving it on the
        // older value. That is exactly what a `refer(t)` flow
        // produces: it writes a new representative mid-pass, and every
        // position must take it.
        const rep: any = reg.get(name)
        if (null != rep && rep !== node) {
          node = rep
        }
      }
      else {
        const rep = reg.get(name)
        reg.set(name, null == rep || rep === node ? node :
          unite(nctx, node, rep, 'entity'))
      }
    }

    // The guard bounds the DESCENT, which is all it was ever for: a
    // unified tree is a graph, and a subtree is worth walking once.
    if (seen.has(node)) {
      return node
    }
    seen.add(node)

    if ((true === node.isMap || true === node.isList) && null != node.peg) {
      for (const k of Object.keys(node.peg)) {
        const out = walk(node.peg[k], seen, nctx.descend(k), write)
        if (write) {
          node.peg[k] = out
        }
      }
    }
    return node
  }

  walk(root, new Set(), ctx, false)

  // NOTHING TO APPLY. The collect half is also the "does this document
  // use identity at all?" answer, so a document that never says `id()`
  // pays for one walk per pass rather than two — and the writing half
  // never runs over a tree it cannot change.
  if (0 === reg.size) {
    return root
  }
  return walk(root, new Set(), ctx, true)
}


class Unify {
  root: Val
  res: Val
  // err: Omit<NilVal[], "push">
  err: any[]
  explain: any[] | null
  cc: number
  lang: Lang

  constructor(root: Val | string, lang?: Lang, ctx?: AontuContext | any, src?: any) {
    this.lang = lang || new Lang()
    if ('string' === typeof root) {
      root = this.lang.parse(root)
    }

    if ('string' !== typeof src) {
      src = ''
    }

    this.cc = 0
    this.root = root
    this.res = root
    // Always use a fresh array for mutable error collection to avoid
    // mutating the shared EMPTY_ERR singleton on Val instances.
    this.err = ctx?.err ?? (root.err.length > 0 ? root.err : [])
    this.explain = ctx?.explain ?? root.explain ?? null

    let res = root
    let uctx: AontuContext

    // Only unify if no syntax errors
    if (!(root as NilVal).isNil) {
      if (ctx instanceof AontuContext) {
        uctx = ctx
      }
      else {
        uctx = new AontuContext({
          ...(ctx || {}),
          root: res,
          err: this.err,
          explain: this.explain,
          src,
        })
      }

      // TODO: messy
      // uctx.seterr(this.err)
      uctx.err = this.err
      uctx.explain = this.explain

      // Ref-spread snapshot store (see snapshotRefSpread in MapVal):
      // keyed by ref canon + source site, shared across all passes.
      ; (uctx as any).snapmap = new Map()

      // The identity registry (G4 phase 1): id -> the representative
      // value every position with that id has been merged into. Same
      // lifetime and placement as the ref-spread snapshot map above —
      // one evaluation, one set of entities.
      ; (uctx as any).entities = new Map()

      const explain = null == ctx?.explain ? undefined : ctx?.explain
      const te = explain && explainOpen(uctx, explain, 'root', res)

      // NOTE: if true === res.done already, then this loop never needs to run.
      let maxcc = uctx.budget.passes
      let prevCanon: string | undefined = undefined
      let lastCanon: string | undefined = undefined
      let settle = false
      for (; this.cc < maxcc && DONE !== res.dc; this.cc++) {
        // console.log('CC', this.cc, res.canon)
        uctx.cc = this.cc
        uctx.seen = {}

        // THE STAGING RULE (G8 phase 0,
        // docs/capability-review/g8-generation.md), stated once, here,
        // for every value whose answer depends on WHERE IT IS. Such a
        // value residuates while the model is still moving and fires on
        // the first pass whose input is IDENTICAL to the previous
        // pass's input: nothing moved, so nothing will move it again,
        // and the position it reports is the position it ends at.
        //
        // Why the whole model and not the value's own path. A spread, a
        // reference or a `move` can place a value under a path it has
        // already been driven at and THEN change what encloses it --
        // `move` hides its source one pass AFTER it copies it, and a
        // `key()` that answered on the strength of its path alone would
        // answer for the ghost. Stability of the model is the only
        // signal that says every such rearrangement is finished.
        uctx.settle = settle

        // Snapshot BEFORE the final pass (the loop condition has
        // already established the tree is not done), so exhaustion can
        // tell "still refining" from "stable residue" below. Taken at
        // the final pass's ENTRY rather than the previous pass's exit
        // — the same value when the budget allows two passes, and the
        // only possible value when the trust profile sets passes to 1,
        // where the old placement (cc === maxcc - 2, never true) made
        // exhaustion silent, exactly the truncation docs/trust.md
        // forbids. `lastCanon` IS that entry canon whenever a previous
        // pass rendered one, so this costs nothing extra.
        if (this.cc === maxcc - 1) {
          prevCanon = lastCanon ?? res.canon
        }

        res = unite(te ? uctx.clone({ explain: ec(te, 'run') }) : uctx, res, top(), 'unify')

        // MULTI-ERROR COLLECTION (G2 phase 6): the pass loop CONTINUES
        // past an erroring pass, so independent failures a later pass
        // would reach are collected in the same run — the break that
        // stood here made every multi-error report truncated at the
        // first erroring pass.
        //
        // What controls the cascade the design feared: a nil is
        // ABSORBING (unite's isNil arms return the existing nil, no new
        // error), so one failure stays ONE NilVal however many later
        // meets touch it — a reference resolving to a failed target
        // takes the same nil identity, which is exactly what lets the
        // report layer dedup by identity. The probes that established
        // this (fan-in refs, spread templates, disjunct trials, nested
        // conjuncts) are pinned as vet.tsv's multi-* rows in both
        // ports.

        // The identity merge, after the pass's own unification: the
        // positions this pass produced are what there is to merge.
        res = mergeEntities(uctx, res)

        // The staging signal for the NEXT pass, rendered here rather
        // than at the top of the loop so a model that is FINISHED is
        // never rendered at all: canon walks references, and the only
        // trees that close a cycle are hand-built ones (the pass loop
        // is what a test drives them through), which converge in one
        // pass and must not be walked to decide a question that no
        // longer arises.
        if (DONE !== res.dc) {
          const nowCanon = res.canon
          settle = undefined !== lastCanon && lastCanon === nowCanon
          lastCanon = nowCanon
        }

        uctx = uctx.clone({ root: res })
      }

      // The pass budget is spent AND the final pass still made
      // progress: the model was cut off while converging, and no other
      // error explains why. Silent truncation would surface later as
      // ordinary incompleteness, so exhaustion is a semantic error of
      // its own (class budget, docs/trust.md clause 2) -- retrying with
      // a larger budget is a valid response to THIS code and useless
      // for path_cycle or no_path. A STABLE residue (the final pass
      // changed nothing -- e.g. a stuck `1+true`) is not a budget
      // failure: it is ordinary incompleteness and stays silent here,
      // surfacing at generate exactly as before.
      if (maxcc <= this.cc && DONE !== res.dc && 0 === uctx.err.length
        && undefined !== prevCanon && prevCanon !== res.canon) {
        makeNilErr(uctx, 'budget_passes', undefined, undefined, 'resolve', {
          budget: 'passes',
          limit: maxcc,
          paths: residuePaths(res, 4).join(' ') || '$',
        })
      }

      uctx.explain && explainClose(te, res)
    }

    this.res = res
  }
} /* node:coverage ignore next 10 */




export {
  Unify,
  unite,
  withDepth,
  mergeEntities,
}
