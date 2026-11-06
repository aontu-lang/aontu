/* Copyright (c) 2021-2023 Richard Rodger, MIT License */


import type { Val } from './type'

import { AontuContext } from './ctx'

import { DONE } from './type'

import { makeNilErr } from './err'
import { findAt } from './val/ReferFuncVal'

import { NilVal } from './val/NilVal'
import { ConjunctVal } from './val/ConjunctVal'
import { ListVal } from './val/ListVal'
import { MapVal } from './val/MapVal'
import { waitsOnHole } from './val/PlaceVal'
import { expandAliases } from './alias'
import { riderText, rides, unionRecords, unionVia } from './rider'

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
// The meet's riders are the union of its operands' (ADR-052).
function ride(out: any, a: any, b: any): void {
  if (null != out.deprecation || null != a?.deprecation || null != b?.deprecation) {
    out.deprecation = unionRecords([out.deprecation, a?.deprecation, b?.deprecation],
      (s: string) => s)
  }
  if (null != out.meta || null != a?.meta || null != b?.meta) {
    out.meta = unionRecords([out.meta, a?.meta, b?.meta], (v: any) => v.canon)
  }
  if (null != out.via || null != a?.via || null != b?.via) {
    out.via = unionVia(out.via, a?.via, b?.via)
  }
  if (null != out.identity || null != a?.identity || null != b?.identity) {
    out.identity = unionRecords([out.identity, a?.identity, b?.identity], (v: any) => v.canon)
  }
}


// The meet's riders go to its result, a top's on a fresh top where they
// add to its own, since an operand top may be a value written elsewhere.
function rideOn(ctx: AontuContext, out: any, a: any, b: any): any {
  if (!out.isTop) {
    ride(out, a, b)
    return out
  }
  if (!rides(a) && !rides(b)) {
    return out
  }
  const t = out.clone(ctx)
  ride(t, a, b)
  return riderText('', t) === riderText('', out) ? out : t
}


function drives(v: any): boolean {
  return v.isConjunct
    || v.isDisjunct
    || v.isRef
    || v.isPref
    || v.isVar
    || v.isFunc
    || v.isExpect
    || v.isRefer
    // An op DRIVES while an operand has not decided (ADR-037).
    || (v.isOp && (waitsOnHole(v) || v.holdsStaged))
    // A graph atom DRIVES (RELATIONS P2): its peer is the value it rides
    // beside -- a container, a rel, a scalar -- and none of them know
    // the atom; the atom knows to residuate.
    || v.isGraphAtom
    // The recursive residual DRIVES for the same reason: its peer is the
    // concrete structure it expands against.
    || v.isRecurse
}


const unite = (ctx: AontuContext, a: any, b: any, whence: string) => {
  if (a !== undefined && a !== null) {
    if (a === b) {
      if (a.done) return a
    }
    else if (b !== undefined && b !== null && undefined === ctx.prov) {
      if (a.done && b.done) {
        if (a.id === b.id) {
          // The riders survive the fast path (G3, G12).
          return rideOn(ctx, a, a, b)
        }
        if (a.constructor === b.constructor && a.peg === b.peg
            && (a as any).emptyOk === (b as any).emptyOk
            && (a as any).needsNonEmpty === (b as any).needsNonEmpty
            && (a as any).link === (b as any).link
            && (a as any).flows === (b as any).flows
            && !a.isNil && !b.isNil
            && !a.isMap && !a.isList
            && !a.isConjunct && !a.isDisjunct
            && !a.isRef && !a.isPref && !a.isFunc && !a.isExpect
            && !a.isTop && !b.isTop
            && !a.isRefer
            && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
          // The riders survive this fast path too: `deprecate(5) & 5`.
          ride(a, a, b)
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
      else if (drives(b)) {
        out = b.unify(a, te ? ctx.clone({ explain: ec(te, 'BW') }) : ctx)
        unified = true
        why = 'bv'
      }
      // These answer from either side, but a hole in a match matches nothing.
      else if ((true === (b as any).isConstraintKind
        || true === (b as any).isEmptyConstraint
        || true === (b as any).isSeal
        || (true === (b as any).isPlace && true !== ctx._matchRead))
        && !drives(a)) {
        out = b.unify(a, te ? ctx.clone({ explain: ec(te, 'BK') }) : ctx)
        unified = true
        why = 'bk'
      }
      else if (a.constructor === b.constructor && a.peg === b.peg
        && (a as any).emptyOk === (b as any).emptyOk
        && (a as any).needsNonEmpty === (b as any).needsNonEmpty
        && (a as any).link === (b as any).link
        && (a as any).flows === (b as any).flows
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

  if (null != out && true === (out as any).isVal && !out.isNil) {
    out = rideOn(ctx, out, a, b)
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


// A link the output takes, and how to put a value in its place.
type LinkSite = { link: any, put: (v: Val) => void }


// The links a result holds where the output reads them: through maps,
// lists, marks and meets, the value a preference stands as, and the arms
// of a disjunction the rank rule picks, those of the lowest rank where
// any has one and every arm where none has. A spread's template holds
// no position, so its links are its members'.
function linksOf(root: Val): LinkSite[] {
  const out: LinkSite[] = []
  const visit = (node: any, put: (v: Val) => void): void => {
    if (true === node.isPath) {
      if (undefined !== node.linkto) {
        out.push({ link: node, put })
      }
    }
    else if (true === node.isMap || true === node.isList) {
      const peg = node.peg
      for (const k of Object.keys(peg)) {
        visit(peg[k], (v: Val) => { peg[k] = v })
      }
    }
    else if (true === node.isDisjunct || true === node.isConjunct) {
      const arms: any[] = node.peg
      const ranks: number[] = true === node.isDisjunct
        ? arms.filter((a: any) => true === a.isPref).map((a: any) => a.rank) : []
      const rank = 0 === ranks.length ? undefined : Math.min(...ranks)
      arms.forEach((a: any, i: number) => {
        if (undefined === rank || (true === a.isPref && rank === a.rank)) {
          visit(a, (v: Val) => { arms[i] = v })
        }
      })
    }
    else if (true === node.isPref) {
      visit(node.peg, (v: Val) => { node.peg = v })
    }
    else if (true === node.isGraphAtom && undefined !== node.held) {
      visit(node.held, (v: Val) => { node.held = v })
    }
  }
  visit(root, () => undefined)
  return out
}


type Flow = { to: string[], t: Val, id: string }


// The templates of the links the output takes whose targets the result
// holds, each once, in a fixed order.
function flowsOf(root: Val, links: LinkSite[]): Flow[] {
  const seen = new Map<string, Flow>()
  for (const { link } of links) {
    for (const [key, t] of link.flows ?? []) {
      const id = key + '\x01' + t.canon
      const to = key.split('\x00')
      if (!seen.has(id) && undefined !== findAt(root, to)) {
        seen.set(id, { to, t, id })
      }
    }
  }
  return [...seen.keys()].sort().map((id) => seen.get(id) as Flow)
}


// What meets each template at its target and asks nothing else: an open
// map holding the step's key as optional, or a list holding `any` before
// the step's position, as the result holds the container, down to the
// template.
function flowDoc(ctx: AontuContext, root: any, flows: Flow[], depth: number): Val {
  const here = flows.filter((f) => depth === f.to.length)
    .map((f) => f.t.clone(ctx, { dup: true }))
  const below = flows.filter((f) => depth < f.to.length)
  if (0 < below.length) {
    const steps = [...new Set(below.map((f) => f.to[depth]))]
    const path = below[0].to.slice(0, depth)
    const inner = (k: string) => flowDoc(ctx, root.peg[k],
      below.filter((f) => k === f.to[depth]), depth + 1)
    if (true === root.isList) {
      const last = Math.max(...steps.map(Number))
      const items: Val[] = []
      for (let i = 0; i <= last; i++) {
        items.push(steps.includes('' + i) ? inner('' + i) : top())
      }
      here.push(new ListVal({ peg: items, path } as any, ctx))
    }
    else {
      const peg: Record<string, Val> = {}
      for (const k of steps) {
        peg[k] = inner(k)
      }
      const m = new MapVal({ peg, path }, ctx)
      m.optionalKeys = steps
      here.push(m)
    }
  }
  return 1 === here.length ? here[0] : new ConjunctVal({ peg: here }, ctx)
}


// Whether a tree holds a link anywhere, so that its evaluation has to
// start again with templates met in.
function holdsLink(v: any, seen: Set<any> = new Set()): boolean {
  if (null == v || true !== v.isVal || seen.has(v)) {
    return false
  }
  seen.add(v)
  if (true === v.isReferFunc || true === v.isRelFunc || true === v.isRefer
    || true === v.isRel || undefined !== v.linkto) {
    return true
  }
  const peg = v.peg
  return (null != peg && 'object' === typeof peg &&
    (true === peg.isVal ? holdsLink(peg, seen)
      : Object.values(peg).some((c: any) => holdsLink(c, seen))))
    || holdsLink(v.spread?.cj, seen)
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
        // The first pass reads references from the root, as below.
        uctx.root = uctx.root ?? res
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

      const explain = null == ctx?.explain ? undefined : ctx?.explain
      const te = explain && explainOpen(uctx, explain, 'root', res)

      // A document with links is evaluated in rounds: each round the
      // document as written, with the templates of the links the last
      // round's output takes met at their targets, until no template is
      // new. A copy of the first tree is kept for the rounds after it.
      const errBase = this.err.length
      const pristine = holdsLink(res) ? res.clone(uctx, { dup: true }) : undefined
      let applied = ''
      let links: LinkSite[] = []
      for (let round = 0; ; round++) {
        // Ref-spread snapshot store (see snapshotRefSpread in MapVal):
        // keyed by ref canon + source site, shared across a round's passes.
        ; (uctx as any).snapmap = new Map()

        // NOTE: if true === res.done already, then this loop never needs to run.
        const maxcc = uctx.budget.passes
        let prevCanon: string | undefined = undefined
        let lastCanon: string | undefined = undefined
        let settle = false
        for (this.cc = 0; this.cc < maxcc && DONE !== res.dc; this.cc++) {
          uctx.cc = this.cc
          uctx.seen = {}

          uctx.settle = settle

          if (this.cc === maxcc - 1) {
            prevCanon = lastCanon ?? res.canon
          }

          res = unite(te ? uctx.clone({ explain: ec(te, 'run') }) : uctx, res, top(), 'unify')

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

        links = linksOf(res)
        const flows = undefined === pristine ? [] : flowsOf(res, links)
        const ids = flows.map((f) => f.id).join('\n')
        if (ids === applied || uctx.budget.passes <= round) {
          break
        }
        applied = ids
        this.err.length = errBase
        res = new ConjunctVal({
          peg: [(pristine as Val).clone(uctx, { dup: true }), flowDoc(uctx, res, flows, 0)],
        }, uctx)
        uctx = uctx.clone({ root: res })
      }

      // A link the output takes names something the document holds.
      for (const { link, put } of links) {
        if (undefined === findAt(res, link.linkto)) {
          put(makeNilErr(uctx, link.linkcode ?? 'refer_unresolved', link, undefined,
            'refer', { addr: link.peg }))
        }
      }

      // The settled tree's alias references canon as the values they
      // name (ts/src/alias.ts): attached here, once, after the last
      // pass, from the snapshot store this run kept.
      expandAliases(res, (uctx as any).snapmap, uctx.err)

      uctx.explain && explainClose(te, res)
    }

    this.res = res
  }
}


const meetTemplate = (ctx: AontuContext, member: Val, tmpl: Val, whence: string): Val =>
  true === (tmpl as any).isPlace && true !== ctx._matchRead ? unite(ctx, tmpl, member, whence)
    : unite(ctx, member, tmpl, whence) /* node:coverage ignore next 11 */


export {
  Unify,
  unite,
  meetTemplate,
  withDepth,
  ride,
  rideOn,
}
