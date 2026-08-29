"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelVal = exports.RelFuncVal = exports.ReferVal = exports.ReferFuncVal = void 0;
exports.parseAddress = parseAddress;
exports.findEntity = findEntity;
const type_1 = require("../type");
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const FeatureVal_1 = require("./FeatureVal");
const ConjunctVal_1 = require("./ConjunctVal");
const StringVal_1 = require("./StringVal");
const unify_1 = require("../unify");
const top_1 = require("./top");
const utility_1 = require("../utility");
// A segment of the path INSIDE an entity. The entity name's own
// grammar (no dots) is what makes the split unambiguous: everything
// before the first dot names the entity, everything after walks its
// value.
const ADDR_SEGMENT = /^[A-Za-z0-9_-]+$/;
// The entity half of an address is a D-1 name; the segments after the
// first dot are keys and list indices, so a leading digit is
// legitimate THERE and only there.
const ADDR_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/;
// The address a string spells, or undefined when it does not spell
// one. `svc_auth` is the entity; `svc_auth.ports.http` is a node
// inside it — the two addressing schemes reconciled: `$.a.b` answers
// WHERE, an address answers WHAT, and beneath entity granularity the
// tree is authoritative again.
function parseAddress(s) {
    const parts = s.split('.');
    if (!ADDR_NAME.test(parts[0])) {
        return undefined;
    }
    for (const seg of parts.slice(1)) {
        if (!ADDR_SEGMENT.test(seg)) {
            return undefined;
        }
    }
    return { name: parts[0], path: parts.slice(1) };
}
// The value an address names, or undefined when the evaluation does
// not (yet) have one. Pending is not failure: an entity may be
// declared by a later conjunct, include or spread, so `refer`
// residuates exactly as a forward reference does.
function findEntity(reg, addr) {
    const rep = reg?.get(addr.name);
    if (null == rep) {
        return undefined;
    }
    let parent = undefined;
    let key = undefined;
    let val = rep;
    for (const seg of addr.path) {
        if (true !== val?.isMap && true !== val?.isList) {
            return undefined;
        }
        const next = val.peg[seg];
        if (null == next) {
            return undefined;
        }
        parent = val;
        key = seg;
        val = next;
    }
    return { parent, key, val };
}
// concreteFlow is `t` as it enters the target: a copy with the
// type/hide marks cleared at every depth. The clone matters as much as
// the clearing — `t` is shared by every position that refers to the
// same thing, and clearing in place would unmark the schema itself.
function concreteFlow(ctx, t) {
    let marked = false;
    (0, utility_1.walk)(t, (_key, v) => {
        marked = marked || v.mark.type || v.mark.hide;
        return v;
    });
    // An unmarked flow type is passed THROUGH: cloning one anyway would
    // move the site an error names, and a conflict has to point at what
    // the author wrote.
    if (!marked) {
        return t;
    }
    const out = t.clone(ctx);
    (0, utility_1.walk)(out, (_key, v) => {
        v.mark.type = false;
        v.mark.hide = false;
        return v;
    });
    return out;
}
// ReferVal is what `refer(t)` RESOLVES to: the residual constraint,
// carrying the type to flow and — once it has met a string — the
// address to flow it into. A separate value from the function for the
// reason every residual is: the function is written once and the
// constraint is met many times, and only the constraint has state
// worth carrying.
class ReferVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRefer = true;
        this.isGenable = true;
        // The codes this residual refuses with: refer() keeps its own,
        // rel()-minted residuals carry rel_address/rel_unresolved.
        this.addrcode = 'refer_address';
        this.unresolvedcode = 'refer_unresolved';
        this.tval = spec.tval ?? (0, top_1.top)();
        this.addr = spec.addr;
        this.addrsrc = spec.addrsrc;
        this.held = spec.held;
        this.dc = 0;
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
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.tval = this.tval;
        out.addr = this.addr;
        out.addrsrc = this.addrsrc;
        out.held = this.held;
        out.relkey = this.relkey;
        out.addrcode = this.addrcode;
        out.unresolvedcode = this.unresolvedcode;
        return out;
    }
    unify(peer, ctx) {
        const p = peer;
        // Another `refer` at the same position: one constraint, both
        // types. `refer(A) & refer(B)` is a target that must be both.
        if (true === p?.isRefer) {
            return this.with(ctx, {
                tval: (0, unify_1.unite)(ctx, this.tval, p.tval, 'refer-t'),
                addr: this.addr ?? p.addr,
                addrsrc: this.addrsrc ?? p.addrsrc,
                held: null == this.held ? p.held
                    : null == p.held ? this.held
                        : (0, unify_1.unite)(ctx, this.held, p.held, 'refer-held'),
            }, this);
        }
        if (null == peer || true === p.isTop) {
            return this.settle(ctx, this);
        }
        if (true === p.isNil) {
            return peer;
        }
        // A STRING is the ADDRESS, when there is not one yet. It is the
        // only thing that can be: a link's value is its address.
        if (undefined === this.addr
            && true === p.isScalar && 'string' === typeof p.peg) {
            const addr = parseAddress(p.peg);
            if (undefined === addr) {
                return (0, err_1.makeNilErr)(ctx, this.addrcode, this, peer, 'refer', { addr: p.peg });
            }
            return this.with(ctx, { addr, addrsrc: p.peg }, peer);
        }
        // A value that can never BE a string cannot constrain one either,
        // and no later pass can repair it — so this arm refuses rather
        // than defers. A KIND or a constraint is not in it: `string`,
        // `re("^svc_")` and the like are perfectly good constraints on an
        // address, and are held below until there is one to apply them to.
        if ((true === p.isScalar && 'string' !== typeof p.peg)
            || true === p.isMap || true === p.isList) {
            return (0, err_1.makeNilErr)(ctx, this.addrcode, this, peer, 'refer');
        }
        // HELD: everything else waits for the address. Carried on the
        // residual rather than parked in a conjunct, because a conjunct
        // rebuilt every pass grows a level every pass; the held constraint
        // meets the link the moment the address resolves, so
        // `refer() & "x" & "y"` still conflicts and `refer() & string & "x"`
        // still passes.
        return this.with(ctx, {
            held: null == this.held ? peer : (0, unify_1.unite)(ctx, this.held, peer, 'refer-held'),
        }, this);
    }
    // with is the residual reshaped: every arm above answers a NEW
    // ReferVal rather than mutating this one, because a spread template's
    // residual is shared by every child it is applied to.
    with(ctx, spec, site) {
        const out = new ReferVal({}, ctx);
        out.tval = spec.tval ?? this.tval;
        out.addr = spec.addr ?? this.addr;
        out.addrsrc = spec.addrsrc ?? this.addrsrc;
        out.held = spec.held ?? this.held;
        out.relkey = this.relkey;
        out.addrcode = this.addrcode;
        out.unresolvedcode = this.unresolvedcode;
        (0, utility_1.propagateMarks)(this, out);
        out.site = site.site;
        out.path = this.path;
        return out.settle(ctx, site);
    }
    // settle answers the address if the evaluation can, and stays
    // pending if it cannot YET. `site` is the value whose position the
    // resolved string should take.
    settle(ctx, site) {
        if (undefined === this.addr) {
            // NOT DONE, unlike `string` or `min(1)`. A refer without an
            // address has not done its work — it exists to check one — and
            // the pass loop must keep offering it the chance. The cost is
            // that a SCHEMA mentioning a link never resolves either, so
            // `type({from: refer($.std.Port)})` is not expressible today;
            // G4 phase 4 records why, and what it would take.
            this.dc = 0;
            return this;
        }
        const reg = ctx?.entities;
        const found = findEntity(reg, this.addr);
        if (undefined === found) {
            // PENDING, not failed — until the last pass. An entity may be
            // declared by a later conjunct, include or spread, so `refer`
            // residuates as a forward reference does; but within ONE
            // evaluation the document-set is fixed, so existence IS
            // decidable, and the final pass is where it is decided. A
            // pending refer keeps the tree not-done, so the pass loop always
            // reaches that pass when there is one to decide.
            if (ctx.cc + 1 >= ctx.budget.passes) {
                return (0, err_1.makeNilErr)(ctx, this.unresolvedcode, this, undefined, 'refer', { addr: this.addrsrc });
            }
            this.dc = 0;
            return this;
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
        const flowing = (ctx._referflow ??=
            new Set());
        if (!this.tval.isTop && !flowing.has(this.addr.name)) {
            flowing.add(this.addr.name);
            try {
                // The flowed type is CONCRETE at the target: a schema flowing
                // into a value must not make the value a schema. Same reasoning
                // as a reference's clone clearing marks — `refer($.std.Service)`
                // says the target IS a Service, not that it is the definition
                // of one — and without it the target silently stopped
                // generating.
                const merged = (0, unify_1.unite)(ctx, found.val, concreteFlow(ctx, this.tval), 'refer-flow');
                if (true === merged.isNil) {
                    return merged;
                }
                if (undefined === found.parent) {
                    reg.set(this.addr.name, merged);
                }
                else {
                    found.parent.peg[found.key] = merged;
                }
            }
            finally {
                flowing.delete(this.addr.name);
            }
        }
        // The value IS the address string: a link, not an embedding.
        const out = new StringVal_1.StringVal({ peg: this.addrsrc }, ctx);
        out.dc = type_1.DONE;
        // STAMPED as a link (G4 phase 3): the value is the address string,
        // so without this nothing downstream could tell a checked link from
        // a literal that happens to look like one. The edge set is exactly
        // the set of these stamps. A rel()-minted link also carries its
        // PREDICATE (the rel field's key), so the graph reports a declared
        // relation rather than inferring one from the path.
        out.link = this.addrsrc;
        if (undefined !== this.relkey) {
            out.relkey = this.relkey;
        }
        (0, utility_1.propagateMarks)(this, out);
        out.site = site.site;
        out.path = this.path;
        return null == this.held ? out : (0, unify_1.unite)(ctx, out, this.held, 'refer-held');
    }
    get canon() {
        const t = this.tval.isTop ? '' : this.tval.canon;
        const call = 'refer(' + t + ')' +
            (null == this.held ? '' : '&' + this.held.canon);
        return undefined === this.addrsrc
            ? call : call + '&' + JSON.stringify(this.addrsrc);
    }
}
exports.ReferVal = ReferVal;
// RelVal is what `rel(t?)` RESOLVES to (RELATIONS.0.md §3.2): the
// relation constraint, sited on the FIELD the way the sizing atoms sit
// on containers. Its value may be one address, a LIST of addresses, or
// a MAP whose string leaves are addresses -- the container shapes are
// rewritten leaf by leaf through the refer machinery, so pending
// resolution, type flow and link stamping are the one battle-tested
// path, and the data side stays plain strings. The PREDICATE of every
// edge produced is the key the rel() sits on -- declared once, in the
// schema, never inferred from the path.
class RelVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRel = true;
        this.isGenable = true;
        this.cjo = 45000;
        this.tval = spec.tval ?? (0, top_1.top)();
        this.held = spec.held;
        // DONE while unmet, deliberately -- the property refer() lacks and
        // G4 phase 4 records the cost of: a type() body holding a rel()
        // must SETTLE, or the schema idiom (`dependsOn?: rel($.T)` inside
        // a vocabulary) leaves the type unresolved and every reference to
        // it deferring forever. An unmet rel is its own settled residual,
        // like `min(1)`; the meet re-activates it whenever a value
        // arrives, because map merges build the conjunct regardless.
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.tval = this.tval;
        out.held = this.held;
        return out;
    }
    // The predicate: the last segment of the field path the constraint
    // is being driven at -- when that segment is a D-1 NAME. A relation
    // predicate is a declared name (RELATIONS.0.md §3.2), so a list
    // index or a key outside the name grammar produces unlabelled
    // links, and the graph falls back to its old inference. The D-1
    // test is also what keeps the two ports' edges identical: a list
    // index is a number here and a string in Go.
    fieldkey() {
        const seg = this.path[this.path.length - 1];
        return 'string' === typeof seg && ADDR_NAME.test(seg) ? seg : undefined;
    }
    // One leaf's residual: the refer machinery carrying rel's codes,
    // predicate and type.
    leafRefer(ctx) {
        const rv = new ReferVal({ tval: this.tval }, ctx);
        rv.addrcode = 'rel_address';
        rv.unresolvedcode = 'rel_unresolved';
        rv.relkey = this.fieldkey();
        rv.site = this.site;
        rv.path = this.path;
        return rv;
    }
    // The container, every string leaf wrapped as a link. Nested
    // containers descend; a leaf already STAMPED as a link is left
    // alone, which is what makes a second application (a template
    // re-applied, a later pass) a no-op.
    rewrite(ctx, container) {
        const out = container.clone(ctx);
        const peg = out.peg;
        const keys = Array.isArray(peg)
            ? peg.map((_v, i) => i) : Object.keys(peg);
        let pending = false;
        let nested = false;
        for (const k of keys) {
            // Children here are always Vals: the parse builds Vals, elision
            // builds a NilVal, and clone preserved whatever the container
            // held.
            const child = peg[k];
            if (true === child.isMap || true === child.isList) {
                nested = true;
                const sub = this.rewrite(ctx.descend('' + k), child);
                peg[k] = sub;
                pending = pending || true !== sub.done;
            }
            else if (undefined === child.link) {
                let leaf = (0, unify_1.unite)(ctx.descend('' + k), this.leafRefer(ctx), child, 'rel-leaf');
                // The held constraints apply PER LEAF: a re() on the relation
                // constrains every address, never the container that holds
                // them (found by the service catalog, whose re("^svc_") met
                // the whole list and refused it).
                if (null != this.held) {
                    leaf = (0, unify_1.unite)(ctx.descend('' + k), leaf, this.held, 'rel-held');
                }
                peg[k] = leaf;
                pending = pending || true !== leaf.done;
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
            out.dc = 0;
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
        if (!nested && null == out.spread.cj) {
            let tmpl = this.leafRefer(ctx);
            if (null != this.held) {
                tmpl = new ConjunctVal_1.ConjunctVal({ peg: [tmpl, this.held] }, ctx);
            }
            ;
            out.spread.cj = tmpl;
        }
        return out;
    }
    unify(peer, ctx) {
        const p = peer;
        // Two rel() at one field: one relation, both types.
        if (true === p?.isRel) {
            const out = new RelVal({}, ctx);
            out.tval = (0, unify_1.unite)(ctx, this.tval, p.tval, 'rel-t');
            out.held = null == this.held ? p.held
                : null == p.held ? this.held
                    : (0, unify_1.unite)(ctx, this.held, p.held, 'rel-held');
            (0, utility_1.propagateMarks)(this, out);
            out.site = this.site;
            out.path = this.path;
            return out;
        }
        // No null/top/nil arms: unite's dispatch ladder absorbs those
        // peers before any Val's own unify is consulted (a null or top
        // peer returns this side; a nil peer returns the nil), and unite
        // is the only entrance -- the container hand-offs pass the
        // container itself.
        // ONE ADDRESS: the scalar-valued field, refer's own shape.
        if (true === p.isScalar && 'string' === typeof p.peg) {
            const out = (0, unify_1.unite)(ctx, this.leafRefer(ctx), peer, 'rel-scalar');
            return null == this.held ? out
                : (0, unify_1.unite)(ctx, out, this.held, 'rel-held');
        }
        // A SET OF LINKS: list or map, rewritten leaf by leaf; the held
        // constraints ride into each leaf inside the rewrite.
        if (true === p.isMap || true === p.isList) {
            return this.rewrite(ctx, peer);
        }
        // A scalar that can never be an address.
        if (true === p.isScalar) {
            return (0, err_1.makeNilErr)(ctx, 'rel_address', this, peer, 'refer');
        }
        // Everything else -- a reference still resolving, a kind, a
        // container constraint -- waits for the value, as refer's held
        // does.
        const out = new RelVal({}, ctx);
        out.tval = this.tval;
        out.held = null == this.held ? peer
            : (0, unify_1.unite)(ctx, this.held, peer, 'rel-held');
        (0, utility_1.propagateMarks)(this, out);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
    get canon() {
        const t = this.tval.isTop ? '' : this.tval.canon;
        return 'rel(' + t + ')' +
            (null == this.held ? '' : '&' + this.held.canon);
    }
}
exports.RelVal = RelVal;
class RelFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRelFunc = true;
    }
    make(_ctx, spec) {
        return new RelFuncVal(spec);
    }
    funcname() {
        return 'rel';
    }
    resolve(ctx, args) {
        const out = new RelVal({}, ctx);
        out.tval = 0 < args.length ? args[0] : (0, top_1.top)();
        out.site = this.site;
        out.path = this.path;
        return out;
    }
}
exports.RelFuncVal = RelFuncVal;
class ReferFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isReferFunc = true;
    }
    make(_ctx, spec) {
        return new ReferFuncVal(spec);
    }
    funcname() {
        return 'refer';
    }
    resolve(ctx, args) {
        const out = new ReferVal({}, ctx);
        out.tval = 0 < args.length ? args[0] : (0, top_1.top)();
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 8 */
exports.ReferFuncVal = ReferFuncVal;
//# sourceMappingURL=ReferFuncVal.js.map