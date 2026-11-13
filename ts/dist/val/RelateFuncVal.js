"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelateVal = exports.RelateFuncVal = exports.PendingLinkVal = exports.addressPath = void 0;
exports.findAt = findAt;
const type_1 = require("../type");
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const PathVal_1 = require("./PathVal");
Object.defineProperty(exports, "addressPath", { enumerable: true, get: function () { return PathVal_1.addressPath; } });
const FeatureVal_1 = require("./FeatureVal");
const ConjunctVal_1 = require("./ConjunctVal");
const unify_1 = require("../unify");
const top_1 = require("./top");
const utility_1 = require("../utility");
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
// One link waiting for its address, at a position `relate()` covers.
class PendingLinkVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPendingLink = true;
        this.isGenable = true;
        this.cjo = 120000;
        // Whether the `relate()` was written at this position, not above it.
        this.root = false;
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
        out.root = this.root;
        out.from = this.from;
        return out;
    }
    unify(peer, ctx) {
        // The type of constraints holds this constraint, not the reverse.
        if (true === peer?.isConstraintKind) {
            return peer.unify(this, ctx);
        }
        const p = peer;
        // Another link at the same position: one constraint, both types.
        if (true === p?.isPendingLink) {
            return this.with(ctx, {
                tval: (0, unify_1.unite)(ctx, this.tval, p.tval, 'relate-t'),
                addr: this.addr ?? p.addr,
                addrsrc: this.addrsrc ?? p.addrsrc,
                held: null == this.held ? p.held
                    : null == p.held ? this.held
                        : (0, unify_1.unite)(ctx, this.held, p.held, 'relate-held'),
            }, this);
        }
        if (null == peer || true === p.isTop) {
            // A held value still resolving may be the address, so it meets
            // the link again once it moves.
            if (undefined === this.addr && null != this.held && !this.held.done) {
                const held = (0, unify_1.unite)(ctx, this.held, (0, top_1.top)(), 'relate-held');
                if (held.canon !== this.held.canon) {
                    const bare = this.with(ctx, {}, this);
                    bare.held = undefined;
                    return bare.unify(held, ctx);
                }
            }
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
                return (0, err_1.makeNilErr)(ctx, 'scalar_value', this.from ?? this, peer);
            }
            return this.with(ctx, { addr: (0, PathVal_1.parseAddress)(merged), addrsrc: merged }, peer);
        }
        if ((true === p.isScalar && true !== p.isPath)
            || true === p.isMap || true === p.isList) {
            return (0, err_1.makeNilErr)(ctx, 'rel_address', this.from ?? this, peer, 'relate');
        }
        return this.with(ctx, {
            held: null == this.held ? peer : (0, unify_1.unite)(ctx, this.held, peer, 'relate-held'),
        }, this);
    }
    // with is the residual reshaped: every arm above answers a NEW
    // PendingLinkVal rather than mutating this one, because a spread
    // template's residual is shared by every child it is applied to.
    with(ctx, spec, site) {
        const out = new PendingLinkVal({}, ctx);
        out.tval = spec.tval ?? this.tval;
        out.addr = spec.addr ?? this.addr;
        out.addrsrc = spec.addrsrc ?? this.addrsrc;
        out.held = spec.held ?? this.held;
        out.root = this.root;
        out.from = this.from;
        (0, utility_1.propagateMarks)(this, out);
        out.site = site.site;
        out.path = this.path;
        return out.settle(ctx, site);
    }
    // settle answers the address as a path value carrying the link and its
    // template, which meet their target once the document is evaluated
    // (`Unify`). `site` is the value whose position the path takes.
    settle(ctx, site) {
        if (undefined === this.addr) {
            this.dc = null != this.held && !this.held.done ? 0 : type_1.DONE;
            return this;
        }
        const there = site.isPath ? site : undefined;
        const mine = this.tval.isTop ? [] : [this.tval];
        const out = (0, PathVal_1.linkAt)(ctx, this.addrsrc, this.path, there?.flows, mine, this.root || true === there?.relroot);
        // A relative address climbing off the top of the tree refuses at once.
        if (undefined === out) {
            return (0, err_1.makeNilErr)(ctx, 'rel_unresolved', this.from ?? this, undefined, 'relate', { addr: this.addrsrc });
        }
        out.relates = (0, PathVal_1.joinRelates)(there?.relates, mine);
        (0, utility_1.propagateMarks)(this, out);
        out.site = site.site;
        out.path = this.path;
        return null == this.held ? out : (0, unify_1.unite)(ctx, out, this.held, 'relate-held');
    }
    // Canon writes the `relate()` this link is part of where it was written.
    get canon() {
        return null == this.held ? '' : this.held.canon;
    }
}
exports.PendingLinkVal = PendingLinkVal;
// A spread that holds addresses alone, which a leaf's link can join, an
// alias read as the value it names.
function leafOnly(v, decls, seen = new Set()) {
    if (true === v.isRef) {
        const key = v.aliasKey;
        if (undefined === key || seen.has(key) || null == decls?.[key]) {
            return false;
        }
        seen.add(key);
        return leafOnly(decls[key], decls, seen);
    }
    return true === v.isPath || true === v.isPathKind || true === v.isPathFunc ||
        (true === v.isConstraint && null == v.count && !v.uniq && null == v.pending &&
            0 === v.uniqBy.length + v.musts.length + v.nofs.length + v.whens.length +
                v.contains.length + v.rests.length) ||
        (true === v.isConjunct && v.peg.every((t) => leafOnly(t, decls, seen)));
}
class RelateVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRelate = true;
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
    leafLink(ctx, root) {
        const lv = new PendingLinkVal({ tval: this.tval }, ctx);
        lv.root = root;
        lv.from = this;
        lv.site = this.site;
        lv.path = this.path;
        return lv;
    }
    rewrite(ctx, container) {
        const out = this.rewriteUnder(ctx, container);
        out.relates = (0, PathVal_1.joinRelates)(container.relates, this.tval.isTop ? [] : [this.tval]);
        out.relroot = true;
        return out;
    }
    rewriteUnder(ctx, container) {
        const out = container.clone(ctx);
        const peg = out.peg;
        const keys = Array.isArray(peg)
            ? peg.map((_v, i) => i) : Object.keys(peg);
        let pending = false;
        let nested = false;
        for (const k of keys) {
            // Children here are always Vals: the parse builds Vals, elision
            // builds a NilVal, and clone kept whatever the container held.
            const child = peg[k];
            if (true === child.isMap || true === child.isList) {
                nested = true;
                const sub = this.rewriteUnder(ctx.descend('' + k), child);
                peg[k] = sub;
                pending = pending || true !== sub.done;
            }
            else if (undefined === child.link) {
                const leaf = (0, unify_1.unite)(ctx.descend('' + k), this.leafLink(ctx, false), child, 'relate-leaf');
                peg[k] = leaf;
                pending = pending || true !== leaf.done;
            }
        }
        if (pending) {
            out.dc = 0;
        }
        const sp = out.spread;
        if (!nested && null == sp.cj) {
            sp.cj = this.leafLink(ctx, false);
        }
        else if (!nested && leafOnly(sp.cj, ctx.root?.peg)) {
            sp.cj = new ConjunctVal_1.ConjunctVal({ peg: [this.leafLink(ctx, false), sp.cj] }, ctx);
        }
        return out;
    }
    unify(peer, ctx) {
        if (true === peer?.isConstraintKind) {
            return peer.unify(this, ctx);
        }
        const p = peer;
        // Two relate() at one field: one relation, both types.
        if (true === p?.isRelate) {
            const out = new RelateVal({}, ctx);
            out.tval = (0, unify_1.unite)(ctx, this.tval, p.tval, 'relate-t');
            out.held = null == this.held ? p.held
                : null == p.held ? this.held
                    : (0, unify_1.unite)(ctx, this.held, p.held, 'relate-held');
            (0, utility_1.propagateMarks)(this, out);
            out.site = this.site;
            out.path = this.path;
            return out;
        }
        // ONE ADDRESS, a path value: a bare string is never one, and the
        // scalar arm below refuses it.
        if (true === p.isPath) {
            const out = (0, unify_1.unite)(ctx, this.leafLink(ctx, true), peer, 'relate-scalar');
            return null == this.held ? out
                : (0, unify_1.unite)(ctx, out, this.held, 'relate-held');
        }
        // A SET OF LINKS: list or map, rewritten leaf by leaf; the held
        // constraints meet the rewritten container, as any meet would.
        if (true === p.isMap || true === p.isList) {
            const out = this.rewrite(ctx, peer);
            return null == this.held ? out : (0, unify_1.unite)(ctx, out, this.held, 'relate-held');
        }
        // A scalar that can never be an address.
        if (true === p.isScalar) {
            return (0, err_1.makeNilErr)(ctx, 'rel_address', this, peer, 'relate');
        }
        // Everything else -- a reference still resolving, a kind, a
        // container constraint -- waits for the value.
        const out = new RelateVal({}, ctx);
        out.tval = this.tval;
        out.held = null == this.held ? peer
            : (0, unify_1.unite)(ctx, this.held, peer, 'relate-held');
        (0, utility_1.propagateMarks)(this, out);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
    get canon() {
        const t = this.tval.isTop ? '' : this.tval.canon;
        return 'relate(' + t + ')' +
            (null == this.held ? '' : '&' + this.held.canon);
    }
}
exports.RelateVal = RelateVal;
class RelateFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRelateFunc = true;
    }
    make(_ctx, spec) {
        return new RelateFuncVal(spec);
    }
    funcname() {
        return 'relate';
    }
    resolve(ctx, args) {
        const out = new RelateVal({}, ctx);
        out.tval = 0 < args.length ? args[0] : (0, top_1.top)();
        out.site = this.site;
        out.path = this.path;
        return out;
    }
} /* node:coverage ignore next 10 */
exports.RelateFuncVal = RelateFuncVal;
//# sourceMappingURL=RelateFuncVal.js.map