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
  PathVal,
  parseAddress,
  prefixMeet,
} from './PathVal'
import { FeatureVal } from './FeatureVal'
import { ConjunctVal } from './ConjunctVal'
import { unite } from '../unify'
import { top } from './top'
import { propagateMarks, walk } from '../utility'


const PREDICATE_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/


export function addressPath(
  addr: Address, at: (string | number)[]
): string[] | undefined {
  if (addr.absolute) {
    return addr.parts
  }
  // The SIBLING scope: drop the link's own key, then take the parent
  // steps. A link at `$.a.b.dep` spelling `.other` means `$.a.b.other`.
  const cut = at.length - 1 - addr.up
  if (cut < 0) {
    return undefined
  }
  return at.slice(0, cut).map(String).concat(addr.parts)
}


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


function concreteFlow(ctx: AontuContext, t: Val): Val {
  let marked = false
  walk(t, (_key: string | number | undefined, v: Val) => {
    marked = marked || v.mark.type || v.mark.hide
    return v
  })
  // An unmarked flow type is passed THROUGH: cloning one anyway would
  // move the site an error names, and a conflict has to point at what
  // the author wrote.
  if (!marked) {
    return t
  }
  const out = t.clone(ctx)
  walk(out, (_key: string | number | undefined, v: Val) => {
    v.mark.type = false
    v.mark.hide = false
    return v
  })
  return out
}


class ReferVal extends FeatureVal {
  isRefer = true
  isGenable = true
  cjo = 120000

  // The type to flow into the target; TOP when `refer()` was written
  // with no argument.
  tval: Val
  // The address, once a string has been met.
  addr?: Address
  // The address AS WRITTEN, for canon and for the error message.
  addrsrc?: string
  // Constraints met while the address was still pending — a kind, a
  // regex, a preference. They meet the LINK once there is one.
  held?: Val
  relkey?: string
  // The codes this residual refuses with: refer() keeps its own,
  // rel()-minted residuals carry rel_address/rel_unresolved.
  addrcode: string = 'refer_address'
  unresolvedcode: string = 'refer_unresolved'

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
    out.relkey = this.relkey
    out.addrcode = this.addrcode
    out.unresolvedcode = this.unresolvedcode
    return out
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer

    // Another `refer` at the same position: one constraint, both
    // types. `refer(A) & refer(B)` is a target that must be both.
    if (true === p?.isRefer) {
      return this.with(ctx, {
        tval: unite(ctx, this.tval, p.tval, 'refer-t'),
        addr: this.addr ?? p.addr,
        addrsrc: this.addrsrc ?? p.addrsrc,
        held: null == this.held ? p.held
          : null == p.held ? this.held
            : unite(ctx, this.held, p.held, 'refer-held'),
      }, this)
    }

    if (null == peer || true === p.isTop) {
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
        return makeNilErr(ctx, 'scalar_value', this, peer)
      }
      return this.with(ctx,
        { addr: parseAddress(merged) as Address, addrsrc: merged }, peer)
    }

    if ((true === p.isScalar && true !== p.isPath)
      || true === p.isMap || true === p.isList) {
      return makeNilErr(ctx, this.addrcode, this, peer, 'refer')
    }

    if (true === p.isFunc) {
      return peer.unify(this, ctx)
    }

    return this.with(ctx, {
      held: null == this.held ? peer : unite(ctx, this.held, peer, 'refer-held'),
    }, this)
  }

  // with is the residual reshaped: every arm above answers a NEW
  // ReferVal rather than mutating this one, because a spread template's
  // residual is shared by every child it is applied to.
  with(ctx: AontuContext, spec: any, site: Val): Val {
    const out = new ReferVal({}, ctx)
    out.tval = spec.tval ?? this.tval
    out.addr = spec.addr ?? this.addr
    out.addrsrc = spec.addrsrc ?? this.addrsrc
    out.held = spec.held ?? this.held
    out.relkey = this.relkey
    out.addrcode = this.addrcode
    out.unresolvedcode = this.unresolvedcode
    propagateMarks(this, out)
    out.site = site.site
    out.path = this.path
    return out.settle(ctx, site)
  }

  // settle answers the address if the evaluation can, and stays
  // pending if it cannot YET. `site` is the value whose position the
  // resolved string should take.
  settle(ctx: AontuContext, site: Val): Val {
    if (undefined === this.addr) {
      this.dc = DONE
      return this
    }
    // The address is a TREE PATH, resolved from the link's own
    // position for a relative one. A climb off the top of the tree can
    // never be repaired by a later pass, so it refuses at once.
    const target = addressPath(this.addr, this.path)
    if (undefined === target) {
      return makeNilErr(ctx, this.unresolvedcode, this, undefined, 'refer',
        { addr: this.addrsrc as string })
    }
    const found = findAt(ctx?.root, target)
    if (undefined === found) {
      if (ctx.cc + 1 >= ctx.budget.passes) {
        return makeNilErr(ctx, this.unresolvedcode, this, undefined, 'refer',
          { addr: this.addrsrc as string })
      }
      this.dc = 0
      return this
    }

    const guard = target.join('.')
    // Seeded on the unify root (ts/src/unify.ts): a `??=` here would
    // make a fresh set on whichever descended context asked first.
    const flowing: Set<string> = (ctx as any)._referflow ?? new Set<string>()
    if (!this.tval.isTop) {
      const flow = concreteFlow(ctx, this.tval)

      const flows: Map<string, Val> = (ctx as any).referflows ??
        new Map<string, Val>()
      const key = target.join('\x00')
      const prev = flows.get(key)
      flows.set(key, null == prev ? flow : unite(ctx, prev, flow,
        'refer-flow-record'))

      if (!flowing.has(guard)) {
        flowing.add(guard)
        try {
          const merged = unite(ctx, found.val, flow, 'refer-flow')
          if (true === (merged as any).isNil) {
            return merged
          }
          if (true !== (ctx as any)._trialMode) {
            found.parent.peg[found.key as string] = merged
          }
        }
        finally {
          flowing.delete(guard)
        }
      }
    }

    const out: any = new PathVal({ peg: this.addrsrc as string }, ctx)
    out.dc = DONE
    out.link = '$.' + target.join('.')
    if (undefined !== this.relkey) {
      out.relkey = this.relkey
    }
    propagateMarks(this, out)
    out.site = site.site
    out.path = this.path
    return null == this.held ? out : unite(ctx, out, this.held, 'refer-held')
  }

  get canon() {
    const t = this.tval.isTop ? '' : this.tval.canon
    const call = 'refer(' + t + ')' +
      (null == this.held ? '' : '&' + this.held.canon)
    return undefined === this.addrsrc
      ? call : call + '&path(' + this.addrsrc + ')'
  }
}


class RelVal extends FeatureVal {
  isRel = true
  isGenable = true
  cjo = 45000

  // The type to flow into each target; TOP when `rel()` has none.
  tval: Val
  // Container-level constraints met before the container arrived
  // (`rel() & length(min(1)) & [...]`): they meet the REWRITTEN
  // container, exactly as refer's held meets the link.
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

  fieldkey(ctx: AontuContext): string | undefined {
    const path: any[] = (ctx as any).path
    const seg = path[path.length - 1]
    return 'string' === typeof seg && PREDICATE_NAME.test(seg) ? seg : undefined
  }

  leafRefer(ctx: AontuContext, relkey: string | undefined): ReferVal {
    const rv = new ReferVal({ tval: this.tval } as any, ctx)
    rv.addrcode = 'rel_address'
    rv.unresolvedcode = 'rel_unresolved'
    rv.relkey = relkey
    rv.site = this.site
    rv.path = this.path
    return rv
  }

  rewrite(ctx: AontuContext, container: any): Val {
    return this.rewriteUnder(ctx, container, this.fieldkey(ctx))
  }

  rewriteUnder(
    ctx: AontuContext, container: any, relkey: string | undefined
  ): Val {
    const out: any = container.clone(ctx)
    const peg: any = out.peg
    const keys: any[] = Array.isArray(peg)
      ? peg.map((_v: any, i: number) => i) : Object.keys(peg)
    let pending = false
    let nested = false
    for (const k of keys) {
      // Children here are always Vals: the parse builds Vals, elision
      // builds a NilVal, and clone preserved whatever the container
      // held.
      const child: any = peg[k]
      if (true === child.isMap || true === child.isList) {
        nested = true
        const sub: any = this.rewriteUnder(ctx.descend('' + k), child, relkey)
        peg[k] = sub
        pending = pending || true !== sub.done
      }
      else if (undefined === child.link) {
        let leaf = unite(ctx.descend('' + k), this.leafRefer(ctx, relkey),
          child, 'rel-leaf')
        if (null != this.held) {
          leaf = unite(ctx.descend('' + k), leaf, this.held, 'rel-held')
        }
        peg[k] = leaf
        pending = pending || true !== leaf.done
      }
    }
    if (pending) {
      out.dc = 0
    }
    if (!nested && null == (out as any).spread.cj) {
      let tmpl: Val = this.leafRefer(ctx, relkey)
      if (null != this.held) {
        tmpl = new ConjunctVal({ peg: [tmpl, this.held] }, ctx)
      }
      ; (out as any).spread.cj = tmpl
    }
    return out
  }

  unify(peer: Val, ctx: AontuContext): Val {
    const p: any = peer

    // Two rel() at one field: one relation, both types.
    if (true === p?.isRel) {
      const out: any = new RelVal({}, ctx)
      out.tval = unite(ctx, this.tval, p.tval, 'rel-t')
      out.held = null == this.held ? p.held
        : null == p.held ? this.held
          : unite(ctx, this.held, p.held, 'rel-held')
      propagateMarks(this, out)
      out.site = this.site
      out.path = this.path
      return out
    }


    // ONE ADDRESS: the scalar-valued field, refer's own shape. A path
    // value only -- a bare string is never an address (PATHS.0.md,
    // amended); the scalar arm below refuses it.
    if (true === p.isPath) {
      const out = unite(ctx, this.leafRefer(ctx, this.fieldkey(ctx)), peer,
        'rel-scalar')
      return null == this.held ? out
        : unite(ctx, out, this.held, 'rel-held')
    }

    // A SET OF LINKS: list or map, rewritten leaf by leaf; the held
    // constraints ride into each leaf inside the rewrite.
    if (true === p.isMap || true === p.isList) {
      return this.rewrite(ctx, peer)
    }

    // A scalar that can never be an address.
    if (true === p.isScalar) {
      return makeNilErr(ctx, 'rel_address', this, peer, 'refer')
    }

    // Everything else -- a reference still resolving, a kind, a
    // container constraint -- waits for the value, as refer's held
    // does.
    const out: any = new RelVal({}, ctx)
    out.tval = this.tval
    out.held = null == this.held ? peer
      : unite(ctx, this.held, peer, 'rel-held')
    propagateMarks(this, out)
    out.site = this.site
    out.path = this.path
    return out
  }

  get canon() {
    const t = this.tval.isTop ? '' : this.tval.canon
    return 'rel(' + t + ')' +
      (null == this.held ? '' : '&' + this.held.canon)
  }
}


class RelFuncVal extends FuncBaseVal {
  isRelFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new RelFuncVal(spec)
  }

  funcname() {
    return 'rel'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    const out = new RelVal({}, ctx)
    out.tval = 0 < args.length ? args[0] : top()
    out.site = this.site
    out.path = this.path
    return out
  }
}


class ReferFuncVal extends FuncBaseVal {
  isReferFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) {
    super(spec, ctx)
  }

  make(_ctx: AontuContext, spec: ValSpec): Val {
    return new ReferFuncVal(spec)
  }

  funcname() {
    return 'refer'
  }

  resolve(ctx: AontuContext, args: Val[]) {
    const out = new ReferVal({}, ctx)
    out.tval = 0 < args.length ? args[0] : top()
    out.site = this.site
    out.path = this.path
    return out
  }
} /* node:coverage ignore next 10 */


// The address machinery itself (Address, parseAddress, prefixMeet)
// lives in PathVal, its home since ADR-016 -- import it from there.
export {
  ReferFuncVal,
  ReferVal,
  RelFuncVal,
  RelVal,
}
