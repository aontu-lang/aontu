/* Copyright (c) 2021-2023 Richard Rodger, MIT License */


import type { Val } from './type'

import { AontuContext } from './ctx'

import { DONE } from './type'

import { makeNilErr } from './err'
import { findAt } from './val/ReferFuncVal'

import { NilVal } from './val/NilVal'
import { hasPlace } from './val/PlaceVal'
import { expandAliases } from './alias'

import {
  Lang
} from './lang'


import {
  explainOpen, ec, explainClose,
} from './utility'


import {
  top
} from './val/top'


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
  if (a !== undefined && a !== null) {
    if (a === b) {
      if (a.done) return a
    }
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
            && !a.isTop && !b.isTop
            && !a.isRefer
            && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
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

  // ABSENCE IS THE UNIT OF THE MEET (ADR-034). The dispatch below is
  // the LEFT operand's, so `&` commutes only if it is answered here.
  if (null != a && null != b) {
    if (true === a.isAbsent) {
      return a.unify(b, ctx)
    }
    if (true === b.isAbsent) {
      return b.unify(a, ctx)
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
    out = makeNilErr(ctx, 'unify_cycle', a, b)
  }
  else if (ctx.budget.revisits < sawCount) {
    out = makeNilErr(ctx, 'unify_cycle', a, b)
  }
  else {
    ctx.seen[saw] = sawCount + 1
    ctx._depth.n++

    try {
      let unified = false

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
        || b.isRefer
        // An op DRIVES while an operand has not decided (ADR-037).
        || (b.isOp && (hasPlace(b) || b.holdsStaged))
        // A graph atom DRIVES (RELATIONS P2): its peer is the value
        // it rides beside -- a container, a rel, a scalar -- and none
        // of them know the atom; the atom knows to residuate.
        || b.isGraphAtom
        // The recursive residual DRIVES for the same reason: its peer
        // is the concrete structure it expands against.
        || b.isRecurse
      ) {
        out = b.unify(a, te ? ctx.clone({ explain: ec(te, 'BW') }) : ctx)
        unified = true
        why = 'bv'
      }
      else if (a.constructor === b.constructor && a.peg === b.peg
        && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
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

      if (!out.done && !unified) {
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

  if (undefined !== ctx.prov) {
    ctx.prov.record(ctx.path, a, b, out)
  }

  if (null != out && true === (out as any).isVal &&
    !out.isTop && !out.isNil && null == out.deprecation) {
    const dep = (null != a ? a.deprecation : undefined) ??
      (null != b ? b.deprecation : undefined)
    if (null != dep) {
      out.deprecation = dep
    }
  }

  if (undefined !== ctx.reads &&
    null != out && true === (out as any).isVal && !out.isTop && !out.isNil) {
    riders(a, b, out)
  }

  return out
}


function riders(a: any, b: any, to: any): void {
  const av = Object(a)
  const bv = Object(b)
  if (null == to.origin) {
    const org = av.origin ?? bv.origin
    if (null != org) {
      to.origin = org
    }
  }
}


function update(x: Val, _y: Val) {
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


function applyFlows(ctx: AontuContext, root: Val): Val {
  const flows: Map<string, Val> | undefined = (ctx as any).referflows
  // NOTHING TO APPLY is the common case -- a document with no links
  // pays one property load per pass, and the walk never runs.
  if (null == flows || 0 === flows.size) {
    return root
  }
  for (const key of [...flows.keys()].sort()) {
    const path = key.split('\x00')
    const found = findAt(root, path)
    if (undefined === found) {
      continue
    }
    const { parent, key: pkey, val: node } = found
    const merged = unite(ctx.descend(pkey as string), node,
      flows.get(key) as Val, 'refer-flow')
    parent.peg[pkey as string] = merged
  }
  return root
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

      uctx.err = this.err
      uctx.explain = this.explain

      // Ref-spread snapshot store (see snapshotRefSpread in MapVal):
      // keyed by ref canon + source site, shared across all passes.
      ; (uctx as any).snapmap = new Map()

      ; (uctx as any).referflows = new Map()

      // The re-entrancy guard for those flows: the set of target paths
      // a flow is currently inside. Same placement, same reason.
      ; (uctx as any)._referflow = new Set()

      const explain = null == ctx?.explain ? undefined : ctx?.explain
      const te = explain && explainOpen(uctx, explain, 'root', res)

      // NOTE: if true === res.done already, then this loop never needs to run.
      let maxcc = uctx.budget.passes
      let prevCanon: string | undefined = undefined
      let lastCanon: string | undefined = undefined
      let settle = false
      for (; this.cc < maxcc && DONE !== res.dc; this.cc++) {
        uctx.cc = this.cc
        uctx.seen = {}

        uctx.settle = settle

        if (this.cc === maxcc - 1) {
          prevCanon = lastCanon ?? res.canon
        }

        res = unite(te ? uctx.clone({ explain: ec(te, 'run') }) : uctx, res, top(), 'unify')


        // The recorded type flows, re-applied to the tree THIS pass
        // built: a pass rebuilds subtrees, and a flow written into the
        // previous pass's tree does not survive that.
        res = applyFlows(uctx, res)

        if (DONE !== res.dc) {
          const nowCanon = res.canon
          settle = undefined !== lastCanon && lastCanon === nowCanon
          lastCanon = nowCanon
        }

        uctx = uctx.clone({ root: res })
      }

      if (maxcc <= this.cc && DONE !== res.dc && 0 === uctx.err.length
        && undefined !== prevCanon && prevCanon !== res.canon) {
        makeNilErr(uctx, 'budget_passes', undefined, undefined, 'resolve', {
          budget: 'passes',
          limit: maxcc,
          paths: residuePaths(res, 4).join(' ') || '$',
        })
      }

      // The settled tree's alias references canon as the values they
      // name (ts/src/alias.ts): attached here, once, after the last
      // pass, from the snapshot store this run kept.
      expandAliases(res, (uctx as any).snapmap)

      uctx.explain && explainClose(te, res)
    }

    this.res = res
  }
} /* node:coverage ignore next 10 */


export {
  Unify,
  unite,
  withDepth,
  applyFlows,
}
