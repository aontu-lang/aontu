/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { FuncBaseVal } from './FuncBaseVal'
import {
  Address,
  addressPath,
  joinRelates,
  linkAt,
  parseAddress,
  prefixMeet,
} from './PathVal'
import { FeatureVal } from './FeatureVal'
import { ConjunctVal } from './ConjunctVal'
import { unite } from '../unify'
import { top } from './top'
import { propagateMarks } from '../utility'


export function findAt(
  root: Val | undefined, path: string[]
): { parent?: any, key?: string, val: Val } | undefined {
  if (null == root || 0 === path.length) {
    return undefined
  }
  let parent: any = undefined
  let key: string | undefined = undefined
  let val: any = root
  for (const seg of path) {
    if (true !== val?.isMap && true !== val?.isList) {
      return undefined
    }
    const next = val.peg[seg]
    if (null == next) {
      return undefined
    }
    parent = val
    key = seg
    val = next
  }
  return { parent, key, val }
}


// One link waiting for its address, at a position `relate()` covers.
class PendingLinkVal extends FeatureVal {
  isPendingLink = true
  isGenable = true
  cjo = 120000

  // The type to flow into the target; TOP when `relate()` was written
  // with no argument.
  tval: Val
  // The address, once a path has been met, and as it was written.
  addr?: Address
  addrsrc?: string
  // Constraints met while the address was still pending — a kind, a
  // regex, a preference. They meet the LINK once there is one.
  held?: Val
  // Whether the `relate()` was written at this position, not above it.
  root = false
  // The `relate()` this link is part of, which an error names.
  from?: Val

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.tval = (spec as any).tval ?? top()
    this.addr = (spec as any).addr
    this.addrsrc = (spec as any).addrsrc
    this.held = (spec as any).held
    this.dc = 0
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out: any = super.clone(ctx, spec)
    out.tval = this.tval
    out.addr = this.addr
    out.addrsrc = this.addrsrc
    out.held = this.held
    out.root = this.root
    out.from = this.from
    return out
  }

  unify(peer: Val, ctx: AontuContext): Val {
    // The type of constraints holds this constraint, not the reverse.
    if (true === (peer as any)?.isConstraintKind) {
      return peer.unify(this, ctx)
    }
    const p: any = peer

    // Another link at the same position: one constraint, both types.
    if (true === p?.isPendingLink) {
      return this.with(ctx, {
        tval: unite(ctx, this.tval, p.tval, 'relate-t'),
        addr: this.addr ?? p.addr,
        addrsrc: this.addrsrc ?? p.addrsrc,
        held: null == this.held ? p.held
          : null == p.held ? this.held
            : unite(ctx, this.held, p.held, 'relate-held'),
      }, this)
    }

    if (null == peer || true === p.isTop) {
      // A held value still resolving may be the address, so it meets
      // the link again once it moves.
      if (undefined === this.addr && null != this.held && !this.held.done) {
        const held = unite(ctx, this.held, top(), 'relate-held')
        if (held.canon !== this.held.canon) {
          const bare: any = this.with(ctx, {}, this)
          bare.held = undefined
          return bare.unify(held, ctx)
        }
      }
      return this.settle(ctx, this)
    }

    if (true === p.isNil) {
      return peer
    }

    if (undefined === this.addr && true === p.isPath) {
      const addr = parseAddress(p.peg) as Address
      return this.with(ctx, { addr, addrsrc: p.peg }, peer)
    }

    if (undefined !== this.addr && true === p.isPath) {
      const merged = prefixMeet(this.addrsrc as string, p.peg)
      if (undefined === merged) {
        return makeNilErr(ctx, 'scalar_value', this.from ?? this, peer)
      }
      return this.with(ctx,
        { addr: parseAddress(merged) as Address, addrsrc: merged }, peer)
    }

    if ((true === p.isScalar && true !== p.isPath)
      || true === p.isMap || true === p.isList) {
      return makeNilErr(ctx, 'rel_address', this.from ?? this, peer, 'relate')
    }

    return this.with(ctx, {
      held: null == this.held ? peer : unite(ctx, this.held, peer, 'relate-held'),
    }, this)
  }

  // with is the residual reshaped: every arm above answers a NEW
  // PendingLinkVal rather than mutating this one, because a spread
  // template's residual is shared by every child it is applied to.
  with(ctx: AontuContext, spec: any, site: Val): Val {
    const out = new PendingLinkVal({}, ctx)
    out.tval = spec.tval ?? this.tval
    out.addr = spec.addr ?? this.addr
    out.addrsrc = spec.addrsrc ?? this.addrsrc
    out.held = spec.held ?? this.held
    out.root = this.root
    out.from = this.from
    propagateMarks(this, out)
    out.site = site.site
    out.path = this.path
    return out.settle(ctx, site)
  }

  // settle answers the address as a path value carrying the link and its
  // template, which meet their target once the document is evaluated
  // (`Unify`). `site` is the value whose position the path takes.
  settle(ctx: AontuContext, site: Val): Val {
    if (undefined === this.addr) {
      this.dc = null != this.held && !this.held.done ? 0 : DONE
      return this
    }
    const there: any = (site as any).isPath ? site : undefined
    const mine = this.tval.isTop ? [] : [this.tval]
    const out: any = linkAt(ctx, this.addrsrc as string, this.path, there?.flows,
      mine, this.root || true === there?.relroot)
    // A relative address climbing off the top of the tree refuses at once.
    if (undefined === out) {
      return makeNilErr(ctx, 'rel_unresolved', this.from ?? this, undefined,
        'relate', { addr: this.addrsrc as string })
    }
    out.relates = joinRelates(there?.relates, mine)
    propagateMarks(this, out)
    out.site = site.site
    out.path = this.path
    return null == this.held ? out : unite(ctx, out, this.held, 'relate-held')
  }

  // Canon writes the `relate()` this link is part of where it was written.
  get canon() {
    return null == this.held ? '' : this.held.canon
  }
}


// A spread that holds addresses alone, which a leaf's link can join, an
// alias read as the value it names.
function leafOnly(v: any, decls: any, seen: Set<string> = new Set()): boolean {
  if (true === v.isRef) {
    const key: string | undefined = v.aliasKey
    if (undefined === key || seen.has(key) || null == decls?.[key]) {
      return false
    }
    seen.add(key)
    return leafOnly(decls[key], decls, seen)
  }
  return true === v.isPath || true === v.isPathKind || true === v.isPathFunc ||
    (true === v.isConstraint && null == v.count && !v.uniq && null == v.pending &&
      0 === v.uniqBy.length + v.musts.length + v.nofs.length + v.whens.length +
        v.contains.length + v.rests.length) ||
    (true === v.isConjunct && v.peg.every((t: any) => leafOnly(t, decls, seen)))
}


class RelateVal extends FeatureVal {
  isRelate = true
  isGenable = true
  cjo = 45000

  // The type to flow into each target; TOP when `relate()` has none.
  tval: Val
  // Constraints met before the value arrived (`relate() & len(min(1))`),
  // which meet the rewritten value.
  held?: Val

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
    this.tval = (spec as any).tval ?? top()
    this.held = (spec as any).held
    this.dc = DONE
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out: any = super.clone(ctx, spec)
    out.tval = this.tval
    out.held = this.held
    return out
  }

  leafLink(ctx: AontuContext, root: boolean): PendingLinkVal {
    const lv = new PendingLinkVal({ tval: this.tval } as any, ctx)
    lv.root = root
    lv.from = this
    lv.site = this.site
    lv.path = this.path
    return lv
  }

  rewrite(ctx: AontuContext, container: any): Val {
    const out: any = this.rewriteUnder(ctx, container)
    out.relates = joinRelates(container.relates, this.tval.isTop ? [] : [this.tval])
    out.relroot = true
    return out
  }

  rewriteUnder(ctx: AontuContext, container: any): Val {
    const out: any = container.clone(ctx)
    const peg: any = out.peg
    const keys: any[] = Array.isArray(peg)
      ? peg.map((_v: any, i: number) => i) : Object.keys(peg)
    let pending = false
    let nested = false
    for (const k of keys) {
      // Children here are always Vals: the parse builds Vals, elision
      // builds a NilVal, and clone kept whatever the container held.
      const child: any = peg[k]
      if (true === child.isMap || true === child.isList) {
        nested = true
        const sub: any = this.rewriteUnder(ctx.descend('' + k), child)
        peg[k] = sub
        pending = pending || true !== sub.done
      }
      else if (undefined === child.link) {
        const leaf = unite(ctx.descend('' + k), this.leafLink(ctx, false),
          child, 'relate-leaf')
        peg[k] = leaf
        pending = pending || true !== leaf.done
      }
    }
    if (pending) {
      out.dc = 0
    }
    const sp: any = (out as any).spread
    if (!nested && null == sp.cj) {
      sp.cj = this.leafLink(ctx, false)
    }
    else if (!nested && leafOnly(sp.cj, (ctx.root as any)?.peg)) {
      sp.cj = new ConjunctVal({ peg: [this.leafLink(ctx, false), sp.cj] }, ctx)
    }
    return out
  }

  unify(peer: Val, ctx: AontuContext): Val {
    if (true === (peer as any)?.isConstraintKind) {
      return peer.unify(this, ctx)
    }
    const p: any = peer

    // Two relate() at one field: one relation, both types.
    if (true === p?.isRelate) {
      const out: any = new RelateVal({}, ctx)
      out.tval = unite(ctx, this.tval, p.tval, 'relate-t')
      out.held = null == this.held ? p.held
        : null == p.held ? this.held
          : unite(ctx, this.held, p.held, 'relate-held')
      propagateMarks(this, out)
      out.site = this.site
      out.path = this.path
      return out
    }


    // ONE ADDRESS, a path value: a bare string is never one, and the
    // scalar arm below refuses it.
    if (true === p.isPath) {
      const out = unite(ctx, this.leafLink(ctx, true), peer,
        'relate-scalar')
      return null == this.held ? out
        : unite(ctx, out, this.held, 'relate-held')
    }

    // A SET OF LINKS: list or map, rewritten leaf by leaf; the held
    // constraints meet the rewritten container, as any meet would.
    if (true === p.isMap || true === p.isList) {
      const out = this.rewrite(ctx, peer)
      return null == this.held ? out : unite(ctx, out, this.held, 'relate-held')
    }

    // A scalar that can never be an address.
    if (true === p.isScalar) {
      return makeNilErr(ctx, 'rel_address', this, peer, 'relate')
    }

    // Everything else -- a reference still resolving, a kind, a
    // container constraint -- waits for the value.
    const out: any = new RelateVal({}, ctx)
    out.tval = this.tval
    out.held = null == this.held ? peer
      : unite(ctx, this.held, peer, 'relate-held')
    propagateMarks(this, out)
    out.site = this.site
    out.path = this.path
    return out
  }

  get canon() {
    const t = this.tval.isTop ? '' : this.tval.canon
    return 'relate(' + t + ')' +
      (null == this.held ? '' : '&' + this.held.canon)
  }
}


class RelateFuncVal extends FuncBaseVal {
  isRelateFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new RelateFuncVal(spec)
  }

  funcname() {
    return 'relate'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    const out = new RelateVal({}, ctx)
    out.tval = 0 < args.length ? args[0] : top()
    out.site = this.site
    out.path = this.path
    return out
  }
} /* node:coverage ignore next 10 */


// The address machinery itself (Address, parseAddress, prefixMeet)
// lives in PathVal, its home since ADR-016 -- import it from there.
export {
  addressPath,
  PendingLinkVal,
  RelateFuncVal,
  RelateVal,
}
