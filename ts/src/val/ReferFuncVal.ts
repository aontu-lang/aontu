/* Copyright (c) 2025 Richard Rodger, MIT License */

// CHECKED, TYPED, LINK-SHAPED REFERENCES (G4 phase 2,
// docs/capability-review/g4-identity-relations.md): `refer(t)` is a
// constraint on a string-valued field. The string must be an ENTITY
// ADDRESS, the addressed node must exist in the evaluation, and — when
// `t` is given — `t` is unified INTO the target. The field's own value
// stays the address string: a LINK, not an embedding.
//
// This is the piece a plain reference cannot be. `$.a.b` resolves by
// CLONING its target into place, so `dependsOn: [$.services.auth]`
// generates a full copy of the auth node where the author meant a
// name. `refer` leaves the name and checks it.
//
// Constraint FLOW rather than a check: `refer(t)` does not merely test
// the target against `t`, it unifies `t` into it. Referring to
// something as a Service MAKES it one, and if it cannot be, the
// conflict is an ordinary located error. Check-only semantics would be
// non-monotone — true, then false as the target grows — and the
// lattice guarantee is that more information never falsifies what has
// been observed.

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
import { FeatureVal } from './FeatureVal'
import { StringVal } from './StringVal'
import { unite } from '../unify'
import { top } from './top'
import { propagateMarks, walk } from '../utility'


// A segment of the path INSIDE an entity. The entity name's own
// grammar (no dots) is what makes the split unambiguous: everything
// before the first dot names the entity, everything after walks its
// value.
const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/
// The entity half of an address is a D-1 name; the segments after the
// first dot are keys and list indices, so a leading digit is
// legitimate THERE and only there.
const ADDR_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/


export type Address = {
  name: string
  path: string[]
}


// The address a string spells, or undefined when it does not spell
// one. `svc_auth` is the entity; `svc_auth.ports.http` is a node
// inside it — the two addressing schemes reconciled: `$.a.b` answers
// WHERE, an address answers WHAT, and beneath entity granularity the
// tree is authoritative again.
export function parseAddress(s: string): Address | undefined {
  const parts = s.split('.')
  if (!ADDR_NAME.test(parts[0])) {
    return undefined
  }
  for (const seg of parts.slice(1)) {
    if (!ADDR_SEGMENT.test(seg)) {
      return undefined
    }
  }
  return { name: parts[0], path: parts.slice(1) }
}


// The value an address names, or undefined when the evaluation does
// not (yet) have one. Pending is not failure: an entity may be
// declared by a later conjunct, include or spread, so `refer`
// residuates exactly as a forward reference does.
export function findEntity(
  reg: Map<string, Val> | undefined, addr: Address
): { parent?: any, key?: string, val: Val } | undefined {
  const rep: any = reg?.get(addr.name)
  if (null == rep) {
    return undefined
  }
  let parent: any = undefined
  let key: string | undefined = undefined
  let val: any = rep
  for (const seg of addr.path) {
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


// concreteFlow is `t` as it enters the target: a copy with the
// type/hide marks cleared at every depth. The clone matters as much as
// the clearing — `t` is shared by every position that refers to the
// same thing, and clearing in place would unmark the schema itself.
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


// ReferVal is what `refer(t)` RESOLVES to: the residual constraint,
// carrying the type to flow and — once it has met a string — the
// address to flow it into. A separate value from the function for the
// reason every residual is: the function is written once and the
// constraint is met many times, and only the constraint has state
// worth carrying.
class ReferVal extends FeatureVal {
  isRefer = true
  isGenable = true

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
  // The PREDICATE the produced link belongs to, when this residual was
  // minted by `rel()` on a field: the field's key, stamped onto the
  // link so the graph reports the edge under a DECLARED relation
  // rather than inferring one from the path (RELATIONS.0.md §3.2).
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

  // The residual's own state — the type to flow, the address it has
  // met, the constraints it holds — TRAVELS with the clone. A spread
  // template holds the FUNCTION, so a template never needs this; a
  // REFERENCE to a value that already contains a resolved link does
  // (`z: id(a) & {u: refer() & "a"}` then `s: $.z`). Without it the
  // clone came back as a bare `refer()` — the address silently
  // dropped, and the copied link resolving to nothing.
  //
  // No path-dependence hook, though: a residual is minted at its
  // destination, so `key()` inside a template resolves there already.
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

    // A STRING is the ADDRESS, when there is not one yet. It is the
    // only thing that can be: a link's value is its address.
    if (undefined === this.addr
      && true === p.isScalar && 'string' === typeof p.peg) {
      const addr = parseAddress(p.peg)
      if (undefined === addr) {
        return makeNilErr(ctx, this.addrcode, this, peer, 'refer',
          { addr: p.peg })
      }
      return this.with(ctx, { addr, addrsrc: p.peg }, peer)
    }

    // A value that can never BE a string cannot constrain one either,
    // and no later pass can repair it — so this arm refuses rather
    // than defers. A KIND or a constraint is not in it: `string`,
    // `re("^svc_")` and the like are perfectly good constraints on an
    // address, and are held below until there is one to apply them to.
    if ((true === p.isScalar && 'string' !== typeof p.peg)
      || true === p.isMap || true === p.isList) {
      return makeNilErr(ctx, this.addrcode, this, peer, 'refer')
    }

    // HELD: everything else waits for the address. Carried on the
    // residual rather than parked in a conjunct, because a conjunct
    // rebuilt every pass grows a level every pass; the held constraint
    // meets the link the moment the address resolves, so
    // `refer() & "x" & "y"` still conflicts and `refer() & string & "x"`
    // still passes.
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
      // NOT DONE, unlike `string` or `min(1)`. A refer without an
      // address has not done its work — it exists to check one — and
      // the pass loop must keep offering it the chance. The cost is
      // that a SCHEMA mentioning a link never resolves either, so
      // `type({from: refer($.std.Port)})` is not expressible today;
      // G4 phase 4 records why, and what it would take.
      this.dc = 0
      return this
    }
    const reg: Map<string, Val> | undefined = (ctx as any)?.entities
    const found = findEntity(reg, this.addr)
    if (undefined === found) {
      // PENDING, not failed — until the last pass. An entity may be
      // declared by a later conjunct, include or spread, so `refer`
      // residuates as a forward reference does; but within ONE
      // evaluation the document-set is fixed, so existence IS
      // decidable, and the final pass is where it is decided. A
      // pending refer keeps the tree not-done, so the pass loop always
      // reaches that pass when there is one to decide.
      if (ctx.cc + 1 >= ctx.budget.passes) {
        return makeNilErr(ctx, this.unresolvedcode, this, undefined, 'refer',
          { addr: this.addrsrc as string })
      }
      this.dc = 0
      return this
    }

    // THE FLOW. `t` is unified into the target and written back, so
    // every position of the entity carries it after the pass's
    // identity merge — the same channel the merge itself uses.
    //
    // RE-ENTRANT ONLY ONCE PER ENTITY (use-cases/BUGS.md §19). Uniting
    // the target drives the target's OWN subtree, and if the target
    // links back — `a` typed-refers `b`, `b` typed-refers `a`, the
    // shape every inverse pair has — that drives this entity again,
    // and the two flow into each other until the depth budget or the
    // host stack ends it. `unify_cycle` on a model whose meet plainly
    // converges: `{k:1}` meeting `{k:1}` is a fixpoint, and the
    // evaluator never got far enough to notice.
    //
    // The guard is the set of entities a flow is currently inside, on
    // the context. A flow that would re-enter one is SKIPPED, not
    // failed: the outer flow it is nested in is already uniting that
    // entity, so the same information arrives by the same channel one
    // frame up. What each flow contributes is unchanged; only the
    // order it arrives in is, and unification does not care.
    const flowing: Set<string> = ((ctx as any)._referflow ??=
      new Set<string>())
    if (!this.tval.isTop && !flowing.has(this.addr.name)) {
      flowing.add(this.addr.name)
      try {
        // The flowed type is CONCRETE at the target: a schema flowing
        // into a value must not make the value a schema. Same reasoning
        // as a reference's clone clearing marks — `refer($.std.Service)`
        // says the target IS a Service, not that it is the definition
        // of one — and without it the target silently stopped
        // generating.
        const merged = unite(ctx, found.val, concreteFlow(ctx, this.tval),
          'refer-flow')
        if (true === (merged as any).isNil) {
          return merged
        }
        if (undefined === found.parent) {
          reg!.set(this.addr.name, merged)
        }
        else {
          found.parent.peg[found.key as string] = merged
        }
      }
      finally {
        flowing.delete(this.addr.name)
      }
    }

    // The value IS the address string: a link, not an embedding.
    const out: any = new StringVal({ peg: this.addrsrc as string }, ctx)
    out.dc = DONE
    // STAMPED as a link (G4 phase 3): the value is the address string,
    // so without this nothing downstream could tell a checked link from
    // a literal that happens to look like one. The edge set is exactly
    // the set of these stamps. A rel()-minted link also carries its
    // PREDICATE (the rel field's key), so the graph reports a declared
    // relation rather than inferring one from the path.
    out.link = this.addrsrc
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
      ? call : call + '&' + JSON.stringify(this.addrsrc)
  }
}


// RelVal is what `rel(t?)` RESOLVES to (RELATIONS.0.md §3.2): the
// relation constraint, sited on the FIELD the way the sizing atoms sit
// on containers. Its value may be one address, a LIST of addresses, or
// a MAP whose string leaves are addresses -- the container shapes are
// rewritten leaf by leaf through the refer machinery, so pending
// resolution, type flow and link stamping are the one battle-tested
// path, and the data side stays plain strings. The PREDICATE of every
// edge produced is the key the rel() sits on -- declared once, in the
// schema, never inferred from the path.
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
    // DONE while unmet, deliberately -- the property refer() lacks and
    // G4 phase 4 records the cost of: a type() body holding a rel()
    // must SETTLE, or the schema idiom (`dependsOn?: rel($.T)` inside
    // a vocabulary) leaves the type unresolved and every reference to
    // it deferring forever. An unmet rel is its own settled residual,
    // like `min(1)`; the meet re-activates it whenever a value
    // arrives, because map merges build the conjunct regardless.
    this.dc = DONE
  }

  clone(ctx: AontuContext, spec?: ValSpec): Val {
    const out: any = super.clone(ctx, spec)
    out.tval = this.tval
    out.held = this.held
    return out
  }

  // The predicate: the last segment of the field path the constraint
  // is being driven at -- when that segment is a D-1 NAME. A relation
  // predicate is a declared name (RELATIONS.0.md §3.2), so a list
  // index or a key outside the name grammar produces unlabelled
  // links, and the graph falls back to its old inference. The D-1
  // test is also what keeps the two ports' edges identical: a list
  // index is a number here and a string in Go.
  fieldkey(): string | undefined {
    const seg = this.path[this.path.length - 1]
    return 'string' === typeof seg && ADDR_NAME.test(seg) ? seg : undefined
  }

  // One leaf's residual: the refer machinery carrying rel's codes,
  // predicate and type.
  leafRefer(ctx: AontuContext): ReferVal {
    const rv = new ReferVal({ tval: this.tval } as any, ctx)
    rv.addrcode = 'rel_address'
    rv.unresolvedcode = 'rel_unresolved'
    rv.relkey = this.fieldkey()
    rv.site = this.site
    rv.path = this.path
    return rv
  }

  // The container, every string leaf wrapped as a link. Nested
  // containers descend; a leaf already STAMPED as a link is left
  // alone, which is what makes a second application (a template
  // re-applied, a later pass) a no-op.
  rewrite(ctx: AontuContext, container: any): Val {
    const out: any = container.clone(ctx)
    const peg: any = out.peg
    const keys: any[] = Array.isArray(peg)
      ? peg.map((_v: any, i: number) => i) : Object.keys(peg)
    for (const k of keys) {
      // Children here are always Vals: the parse builds Vals, elision
      // builds a NilVal, and clone preserved whatever the container
      // held.
      const child: any = peg[k]
      if (true === child.isMap || true === child.isList) {
        peg[k] = this.rewrite(ctx.descend('' + k), child)
      }
      else if (undefined === child.link) {
        peg[k] = unite(ctx.descend('' + k), this.leafRefer(ctx), child,
          'rel-leaf')
      }
    }
    // The rewrite holds PENDING leaves (an address whose entity a
    // later statement declares), so the container is NOT done: the
    // pass loop must keep driving it until every link settles.
    out.dc = 0
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

    // No null/top/nil arms: unite's dispatch ladder absorbs those
    // peers before any Val's own unify is consulted (a null or top
    // peer returns this side; a nil peer returns the nil), and unite
    // is the only entrance -- the container hand-offs pass the
    // container itself.

    // ONE ADDRESS: the scalar-valued field, refer's own shape.
    if (true === p.isScalar && 'string' === typeof p.peg) {
      const out = unite(ctx, this.leafRefer(ctx), peer, 'rel-scalar')
      return null == this.held ? out
        : unite(ctx, out, this.held, 'rel-held')
    }

    // A SET OF LINKS: list or map, rewritten leaf by leaf.
    if (true === p.isMap || true === p.isList) {
      const out = this.rewrite(ctx, peer)
      return null == this.held ? out
        : unite(ctx, out, this.held, 'rel-held')
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
} /* node:coverage ignore next 8 */


export {
  ReferFuncVal,
  ReferVal,
  RelFuncVal,
  RelVal,
}
