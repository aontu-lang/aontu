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


// A RELATION PREDICATE is still a declared D-1 name
// (docs/design/RELATIONS.0.md §3.2). Entity names are gone with
// ADR-014; predicate names are not -- a relation is a vocabulary term,
// not an address.
const PREDICATE_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/


// The tree path an address resolves to from `at` -- the position of
// the link itself -- or undefined when a relative address climbs off
// the top of the tree.
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


// The node a tree path names, with the parent and key that hold it so
// a type flow can be written back. Pending is not failure: the target
// may be introduced by a later conjunct, include or spread, so `refer`
// residuates exactly as a forward reference does.
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
  // AFTER the plain values (base 99999), BEFORE the sizing atoms
  // (LATE_CJO): sibling path values fold together first under the
  // prefix rule, and the residual then meets ONE merged address --
  // without this, `refer() & path($.a) & path($.a.b)` settled on the
  // first path and the second met the finished link too late.
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
  // (`z: {u: refer() & "$.a"}` then `s: $.z`). Without it the
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

    // A PATH VALUE is the ADDRESS, when there is not one yet. Only a
    // path value can be one (PATHS.0.md, amended): a bare string is
    // never a path -- `path("...")` is the one string conversion, and
    // it happens at the call, not here. The peg is pre-validated by
    // the capture, so no parse can fail.
    if (undefined === this.addr && true === p.isPath) {
      const addr = parseAddress(p.peg) as Address
      return this.with(ctx, { addr, addrsrc: p.peg }, peer)
    }

    // A SECOND path peer refines the address by the prefix rule: the
    // longer of the two when one opens the other, exactly as two path
    // values meet on their own. Two incomparable addresses are the
    // same conflict two unequal scalars are.
    if (undefined !== this.addr && true === p.isPath) {
      const merged = prefixMeet(this.addrsrc as string, p.peg)
      if (undefined === merged) {
        return makeNilErr(ctx, 'scalar_value', this, peer)
      }
      return this.with(ctx,
        { addr: parseAddress(merged) as Address, addrsrc: merged }, peer)
    }

    // A value that can never BE a path cannot be the address, and no
    // later pass can repair it — so this arm refuses rather than
    // defers. A bare STRING is in it now (PATHS.0.md, amended):
    // `path("...")` is the one conversion, at the call. A KIND or a
    // constraint is not in it: `string`, `re("^svc_")` and the like
    // are perfectly good constraints on an address, and are held
    // below until there is one to apply them to.
    if ((true === p.isScalar && true !== p.isPath)
      || true === p.isMap || true === p.isList) {
      return makeNilErr(ctx, this.addrcode, this, peer, 'refer')
    }

    // HELD: everything else waits for the address. Carried on the
    // residual rather than parked in a conjunct, because a conjunct
    // rebuilt every pass grows a level every pass; the held constraint
    // meets the link the moment the address resolves, so
    // `refer() & re("a") & re("b") & path($.z)` still applies both and
    // `refer() & string & path($.z)` still passes.
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
      // PENDING, not failed — until the last pass. The target may be
      // introduced by a later conjunct, include or spread, so `refer`
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

    // THE FLOW. `t` is unified into the target and written back at the
    // target's own position — one position, because the tree is the
    // namespace and a path names exactly one node.
    //
    // RE-ENTRANT ONLY ONCE PER TARGET (use-cases/BUGS.md §19). Uniting
    // the target drives the target's OWN subtree, and if the target
    // links back — `a` typed-refers `b`, `b` typed-refers `a`, the
    // shape every inverse pair has — that drives this target again,
    // and the two flow into each other until the depth budget or the
    // host stack ends it. `unify_cycle` on a model whose meet plainly
    // converges: `{k:1}` meeting `{k:1}` is a fixpoint, and the
    // evaluator never got far enough to notice.
    //
    // The guard is the set of paths a flow is currently inside, on the
    // context. A flow that would re-enter one is SKIPPED, not failed:
    // the outer flow it is nested in is already uniting that node, so
    // the same information arrives by the same channel one frame up.
    // What each flow contributes is unchanged; only the order it
    // arrives in is, and unification does not care.
    const guard = target.join('.')
    // Seeded on the unify root (ts/src/unify.ts): a `??=` here would
    // make a fresh set on whichever descended context asked first.
    const flowing: Set<string> = (ctx as any)._referflow ?? new Set<string>()
    if (!this.tval.isTop && !flowing.has(guard)) {
      flowing.add(guard)
      try {
        // The flowed type is CONCRETE at the target: a schema flowing
        // into a value must not make the value a schema. Same reasoning
        // as a reference's clone clearing marks — `refer($.std.Service)`
        // says the target IS a Service, not that it is the definition
        // of one — and without it the target silently stopped
        // generating.
        const flow = concreteFlow(ctx, this.tval)
        const merged = unite(ctx, found.val, flow, 'refer-flow')
        if (true === (merged as any).isNil) {
          return merged
        }
        // The write into THIS pass's view, so the rest of the pass sees
        // it. findAt refuses the empty path, so a resolved target always
        // has a parent holding it.
        // NOT FROM INSIDE A TRIAL. A disjunction member is a
        // HYPOTHESIS, and writing its flow into the live tree
        // asserts the member's type on another node before the
        // member is known to survive. The `unite` above still
        // runs: its nil is how a member legitimately fails. Only
        // the COMMIT waits, and the surviving member's flow
        // reaches the tree on the next pass, from the record
        // DisjunctVal stages and merges for survivors alone.
        if (true !== (ctx as any)._trialMode) {
          found.parent.peg[found.key as string] = merged
        }
        // ... and the RECORD, keyed by the target's path, replayed onto
        // every later pass by applyFlows in ts/src/unify.ts. A pass
        // rebuilds subtrees, so the write above does not survive one
        // when the link sits inside its own target or two nodes link at
        // each other; the record is what makes the flow reach the
        // result rather than the tree it was computed from.
        const flows: Map<string, Val> = (ctx as any).referflows ??
          new Map<string, Val>()
        const key = target.join('\x00')
        const prev = flows.get(key)
        flows.set(key, null == prev ? flow : unite(ctx, prev, flow,
          'refer-flow-record'))
      }
      finally {
        flowing.delete(guard)
      }
    }

    // The value IS the address, as a PATH VALUE (ADR-016): a link,
    // not an embedding -- and re-stating or refining the address
    // still meets it, which a string link could not do under the
    // strict rules.
    const out: any = new PathVal({ peg: this.addrsrc as string }, ctx)
    out.dc = DONE
    // STAMPED as a link (G4 phase 3): the value is the address string,
    // so without this nothing downstream could tell a checked link from
    // a literal that happens to look like one. The edge set is exactly
    // the set of these stamps. A rel()-minted link also carries its
    // PREDICATE (the rel field's key), so the graph reports a declared
    // relation rather than inferring one from the path.
    //
    // The stamp is the RESOLVED path, not the written one: a relative
    // address means a different node from each position it is written
    // at, and an edge set whose far ends were spellings rather than
    // nodes could not be traversed. The VALUE stays what the author
    // wrote --- the link is what it says, the edge is where it goes.
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
    // The address renders as the path call: a bare string address no
    // longer reparses (PATHS.0.md, amended), and canon must.
    return undefined === this.addrsrc
      ? call : call + '&path(' + this.addrsrc + ')'
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
  // is being APPLIED at -- when that segment is a D-1 NAME. A relation
  // predicate is a declared name (RELATIONS.0.md §3.2), so a list
  // index or a key outside the name grammar produces unlabelled
  // links, and the graph falls back to its old inference. The D-1
  // test is also what keeps the two ports' edges identical: a list
  // index is a number here and a string in Go.
  //
  // THE PATH COMES FROM THE CONTEXT, not from `this.path`. The val's
  // own path records where this constraint was CLONED FROM, and the
  // two part company the moment a second document merges into an
  // entity: the field's constraint is then driven at the ENTITY, and
  // `this.path` names the entity while the context names the field.
  // The predicate became the entity's own key, every link under it
  // minted an edge starting one level too high, and `inverse(n)`
  // reported a mirror that was written as missing.
  fieldkey(ctx: AontuContext): string | undefined {
    const path: any[] = (ctx as any).path
    const seg = path[path.length - 1]
    return 'string' === typeof seg && PREDICATE_NAME.test(seg) ? seg : undefined
  }

  // One leaf's residual: the refer machinery carrying rel's codes,
  // predicate and type. The predicate is passed IN, because the field
  // it names is decided where the rewrite starts and must not be
  // re-read on the way down (see `rewriteUnder`).
  leafRefer(ctx: AontuContext, relkey: string | undefined): ReferVal {
    const rv = new ReferVal({ tval: this.tval } as any, ctx)
    rv.addrcode = 'rel_address'
    rv.unresolvedcode = 'rel_unresolved'
    rv.relkey = relkey
    rv.site = this.site
    rv.path = this.path
    return rv
  }

  // The container, every string leaf wrapped as a link. Nested
  // containers descend; a leaf already STAMPED as a link is left
  // alone, which is what makes a second application (a template
  // re-applied, a later pass) a no-op.
  rewrite(ctx: AontuContext, container: any): Val {
    return this.rewriteUnder(ctx, container, this.fieldkey(ctx))
  }

  // The rewrite proper, carrying the predicate decided at the field.
  // It is decided ONCE, at the top: a map-valued relation
  // (`dependsOn: {primary: [...]}`) descends through the inner label
  // and must still report `dependsOn`, which is the whole reason a
  // link carries a declared predicate rather than letting the graph
  // infer one from its position.
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
        // The held constraints apply PER LEAF: a re() on the relation
        // constrains every address, never the container that holds
        // them (found by the service catalog, whose re("^svc_") met
        // the whole list and refused it).
        if (null != this.held) {
          leaf = unite(ctx.descend('' + k), leaf, this.held, 'rel-held')
        }
        peg[k] = leaf
        pending = pending || true !== leaf.done
      }
    }
    // The rewrite holds its PENDING leaves open (an address whose
    // entity a later statement declares), so the pass loop keeps
    // driving the container until every link settles. A rewrite that
    // minted NOTHING pending -- every leaf already linked or settled
    // in place -- keeps the clone's doneness: re-applying a template
    // over a settled value must converge in the same pass, or the
    // enclosing bags reopen forever (the service catalog, where the
    // entity merge drops the spread stamp each pass).
    if (pending) {
      out.dc = 0
    }
    // Elements that arrive AFTER this rewrite -- another statement of
    // the list, a patch position of the entity -- must convert too, so
    // the rewrite installs its own leaf constraint as the container's
    // ELEMENT SPREAD, exactly the machinery the old per-element
    // `[&: refer()]` idiom used. Only on a FLAT address container (a
    // labelled map's sub-containers get their own spread from the
    // recursion above; a leaf template meeting a map child would
    // refuse it), and only where no spread already stands: a schema's
    // own template is not this rewrite's to clobber.
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

    // No null/top/nil arms: unite's dispatch ladder absorbs those
    // peers before any Val's own unify is consulted (a null or top
    // peer returns this side; a nil peer returns the nil), and unite
    // is the only entrance -- the container hand-offs pass the
    // container itself.

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
