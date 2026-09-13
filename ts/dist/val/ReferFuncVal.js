"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelVal = exports.RelFuncVal = exports.ReferVal = exports.ReferFuncVal = void 0;
exports.addressPath = addressPath;
exports.findAt = findAt;
const type_1 = require("../type");
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const PathVal_1 = require("./PathVal");
const FeatureVal_1 = require("./FeatureVal");
const ConjunctVal_1 = require("./ConjunctVal");
const unify_1 = require("../unify");
const top_1 = require("./top");
const utility_1 = require("../utility");
const PREDICATE_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/;
function addressPath(addr, at) {
    if (addr.absolute) {
        return addr.parts;
    }
    // The SIBLING scope: drop the link's own key, then take the parent
    // steps. A link at `$.a.b.dep` spelling `.other` means `$.a.b.other`.
    const cut = at.length - 1 - addr.up;
    if (cut < 0) {
        return undefined;
    }
    return at.slice(0, cut).map(String).concat(addr.parts);
}
function findAt(root, path) {
    if (null == root || 0 === path.length) {
        return undefined;
    }
    let parent = undefined;
    let key = undefined;
    let val = root;
    for (const seg of path) {
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
class ReferVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRefer = true;
        this.isGenable = true;
        this.cjo = 120000;
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
        if (undefined === this.addr && true === p.isPath) {
            const addr = (0, PathVal_1.parseAddress)(p.peg);
            return this.with(ctx, { addr, addrsrc: p.peg }, peer);
        }
        if (undefined !== this.addr && true === p.isPath) {
            const merged = (0, PathVal_1.prefixMeet)(this.addrsrc, p.peg);
            if (undefined === merged) {
                return (0, err_1.makeNilErr)(ctx, 'scalar_value', this, peer);
            }
            return this.with(ctx, { addr: (0, PathVal_1.parseAddress)(merged), addrsrc: merged }, peer);
        }
        if ((true === p.isScalar && true !== p.isPath)
            || true === p.isMap || true === p.isList) {
            return (0, err_1.makeNilErr)(ctx, this.addrcode, this, peer, 'refer');
        }
        if (true === p.isFunc) {
            return peer.unify(this, ctx);
        }
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
            this.dc = type_1.DONE;
            return this;
        }
        // The address is a TREE PATH, resolved from the link's own
        // position for a relative one. A climb off the top of the tree can
        // never be repaired by a later pass, so it refuses at once.
        const target = addressPath(this.addr, this.path);
        if (undefined === target) {
            return (0, err_1.makeNilErr)(ctx, this.unresolvedcode, this, undefined, 'refer', { addr: this.addrsrc });
        }
        const found = findAt(ctx?.root, target);
        if (undefined === found) {
            if (ctx.cc + 1 >= ctx.budget.passes) {
                return (0, err_1.makeNilErr)(ctx, this.unresolvedcode, this, undefined, 'refer', { addr: this.addrsrc });
            }
            this.dc = 0;
            return this;
        }
        const guard = target.join('.');
        // Seeded on the unify root (ts/src/unify.ts): a `??=` here would
        // make a fresh set on whichever descended context asked first.
        const flowing = ctx._referflow ?? new Set();
        if (!this.tval.isTop) {
            const flow = concreteFlow(ctx, this.tval);
            const flows = ctx.referflows ??
                new Map();
            const key = target.join('\x00');
            const prev = flows.get(key);
            flows.set(key, null == prev ? flow : (0, unify_1.unite)(ctx, prev, flow, 'refer-flow-record'));
            if (!flowing.has(guard)) {
                flowing.add(guard);
                try {
                    const merged = (0, unify_1.unite)(ctx, found.val, flow, 'refer-flow');
                    if (true === merged.isNil) {
                        return merged;
                    }
                    if (true !== ctx._trialMode) {
                        found.parent.peg[found.key] = merged;
                    }
                }
                finally {
                    flowing.delete(guard);
                }
            }
        }
        const out = new PathVal_1.PathVal({ peg: this.addrsrc }, ctx);
        out.dc = type_1.DONE;
        out.link = '$.' + target.join('.');
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
            ? call : call + '&path(' + this.addrsrc + ')';
    }
}
exports.ReferVal = ReferVal;
class RelVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRel = true;
        this.isGenable = true;
        this.cjo = 45000;
        this.tval = spec.tval ?? (0, top_1.top)();
        this.held = spec.held;
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.tval = this.tval;
        out.held = this.held;
        return out;
    }
    fieldkey(ctx) {
        const path = ctx.path;
        const seg = path[path.length - 1];
        return 'string' === typeof seg && PREDICATE_NAME.test(seg) ? seg : undefined;
    }
    leafRefer(ctx, relkey) {
        const rv = new ReferVal({ tval: this.tval }, ctx);
        rv.addrcode = 'rel_address';
        rv.unresolvedcode = 'rel_unresolved';
        rv.relkey = relkey;
        rv.site = this.site;
        rv.path = this.path;
        return rv;
    }
    rewrite(ctx, container) {
        return this.rewriteUnder(ctx, container, this.fieldkey(ctx));
    }
    rewriteUnder(ctx, container, relkey) {
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
                const sub = this.rewriteUnder(ctx.descend('' + k), child, relkey);
                peg[k] = sub;
                pending = pending || true !== sub.done;
            }
            else if (undefined === child.link) {
                let leaf = (0, unify_1.unite)(ctx.descend('' + k), this.leafRefer(ctx, relkey), child, 'rel-leaf');
                if (null != this.held) {
                    leaf = (0, unify_1.unite)(ctx.descend('' + k), leaf, this.held, 'rel-held');
                }
                peg[k] = leaf;
                pending = pending || true !== leaf.done;
            }
        }
        if (pending) {
            out.dc = 0;
        }
        if (!nested && null == out.spread.cj) {
            let tmpl = this.leafRefer(ctx, relkey);
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
        // ONE ADDRESS: the scalar-valued field, refer's own shape. A path
        // value only -- a bare string is never an address (PATHS.0.md,
        // amended); the scalar arm below refuses it.
        if (true === p.isPath) {
            const out = (0, unify_1.unite)(ctx, this.leafRefer(ctx, this.fieldkey(ctx)), peer, 'rel-scalar');
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
} /* node:coverage ignore next 10 */
exports.ReferFuncVal = ReferFuncVal;
//# sourceMappingURL=ReferFuncVal.js.map