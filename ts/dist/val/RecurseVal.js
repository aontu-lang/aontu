"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurseVal = void 0;
exports.bumpRecurse = bumpRecurse;
exports.containsRecurseOf = containsRecurseOf;
const type_1 = require("../type");
const err_1 = require("../err");
const aliasname_1 = require("../aliasname");
const FeatureVal_1 = require("./FeatureVal");
const ConjunctVal_1 = require("./ConjunctVal");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
class RecurseVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isRecurse = true;
        this.isGenable = true;
        // LAST in a conjunct fold, after even the graph atoms: the residual
        // wants to see the assembled concrete structure it expands against.
        this.cjo = 47000;
        this.target = spec.target ?? [];
        this.xc = spec.xc ?? 0;
        // A settled residual: a type() body carrying one must settle, and
        // an unmet recursion is its own value until data arrives.
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.target = this.target;
        out.xc = this.xc;
        return out;
    }
    body(ctx) {
        return walkTarget(ctx.root, this.target)
            ?? walkTarget(ctx._fixroot, this.target);
    }
    unify(peer, ctx) {
        const p = peer;
        if (null == peer || true === p.isTop) {
            return this;
        }
        // The same fixpoint twice is one fixpoint.
        if (true === p.isRecurse) {
            if (this.target.length === p.target.length
                && this.target.every((s, i) => s === p.target[i])) {
                return this;
            }
            const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
            (0, utility_1.propagateMarks)(this, out);
            out.path = this.path;
            return out;
        }
        // CONCRETE STRUCTURE: expand one level against it.
        if (true === p.isMap || true === p.isList || true === p.isScalar) {
            if (ctx.budget.depth <= this.xc) {
                return (0, err_1.makeNilErr)(ctx, 'recursion_budget', this, peer, 'recurse', { target: this.targetSpelling });
            }
            const body = this.body(ctx);
            if (undefined === body) {
                // The definition has not assembled yet (an early pass): hold
                // the peer beside the residual and try again when it has.
                const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
                (0, utility_1.propagateMarks)(this, out);
                out.path = this.path;
                return out;
            }
            const level = body.clone(ctx, {
                dup: true, path: [...ctx.path],
            });
            (0, utility_1.walk)(level, (_key, v) => {
                v.mark.type = false;
                v.mark.hide = false;
                return v;
            });
            bumpRecurse(level, this.xc + 1);
            return (0, unify_1.unite)(ctx, level, peer, 'recurse-expand');
        }
        // Anything else -- a func still resolving, a reference, a
        // constraint -- waits beside the residual.
        const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
        (0, utility_1.propagateMarks)(this, out);
        out.path = this.path;
        return out;
    }
    get targetSpelling() {
        return '$.' + this.target.map(aliasname_1.aliasPathSegment).join('.');
    }
    get canon() {
        return this.targetSpelling;
    }
    gen(ctx) {
        (0, err_1.makeNilErr)(ctx, 'recursion_unexpanded', this, undefined, 'recurse', { target: this.targetSpelling });
        return undefined;
    }
}
exports.RecurseVal = RecurseVal;
// walkTarget descends a tree by the residual's absolute target path,
// answering the definition node or undefined.
function walkTarget(root, target) {
    let node = root;
    for (const seg of target) {
        node = node?.peg?.[seg];
    }
    return null != node && true === node.isVal ? node : undefined;
}
// bumpRecurse stamps the expansion depth onto every residual inside a
// freshly cloned level, so descent is charged along the chain.
function bumpRecurse(v, xc) {
    if (null == v || true !== v.isVal) {
        return;
    }
    if (true === v.isRecurse) {
        v.xc = Math.max(v.xc, xc);
        return;
    }
    if (true === v.isRef) {
        v.rxc = Math.max(v.rxc ?? 0, xc);
        return;
    }
    const peg = v.peg;
    if (true === v.isMap && null != peg) {
        for (const k of Object.keys(peg)) {
            bumpRecurse(peg[k], xc);
        }
    }
    else if (true === v.isList && Array.isArray(peg)) {
        for (const e of peg) {
            bumpRecurse(e, xc);
        }
    }
    else if (true === v.isConjunct && Array.isArray(peg)) {
        for (const e of peg) {
            bumpRecurse(e, xc);
        }
    }
    if (null != v.spread?.cj) {
        bumpRecurse(v.spread.cj, xc);
    }
}
function containsRecurseOf(v, target, depth) {
    const d = depth ?? 0;
    if (null == v || true !== v.isVal || 8 < d) {
        return false;
    }
    if (true === v.isRecurse) {
        return v.target.length === target.length
            && v.target.every((s, i) => s === target[i]);
    }
    if (true === v.isRef && Array.isArray(v.peg)) {
        if (v.peg.length === target.length
            && v.peg.every((s, i) => s === target[i])) {
            return true;
        }
    }
    const peg = v.peg;
    if (true === v.isMap && null != peg) {
        for (const k of Object.keys(peg)) {
            if (containsRecurseOf(peg[k], target, d + 1)) {
                return true;
            }
        }
    }
    else if ((true === v.isList || true === v.isConjunct || true === v.isDisjunct)
        && Array.isArray(peg)) {
        for (const e of peg) {
            if (containsRecurseOf(e, target, d + 1)) {
                return true;
            }
        }
    }
    if (null != v.spread?.cj && containsRecurseOf(v.spread.cj, target, d + 1)) {
        return true;
    }
    return false;
} /* node:coverage ignore next 7 */
//# sourceMappingURL=RecurseVal.js.map