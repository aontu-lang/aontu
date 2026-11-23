"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.takes = exports.SealVal = void 0;
exports.sealCjo = sealCjo;
exports.sealTree = sealTree;
exports.sealBag = sealBag;
exports.sealChild = sealChild;
exports.fixSeals = fixSeals;
exports.unsealTree = unsealTree;
const type_1 = require("../type");
const FeatureVal_1 = require("./FeatureVal");
// `close()` and `open()` with no argument. `close()` folds LAST in a
// conjunct, so it closes the whole meet rather than the first term it
// finds; `open()` folds first, so it lifts a seal before anything is added.
class SealVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: [] }, ctx);
        this.isSeal = true;
        this.closed = true === spec.closed;
        this.cjo = sealCjo(this.closed);
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        return super.clone(ctx, { closed: this.closed, ...(spec ?? {}) });
    }
    unify(peer, ctx) {
        const p = peer;
        if (null == p || true === p.isTop) {
            return this;
        }
        if (true === p.isSeal) {
            return this.closed || !p.closed ? this : p;
        }
        // A copy, not the peer: a disjunction trials every alternative
        // against one peer, and a seal set in place would leak across them.
        if (true === p.isMap || true === p.isList) {
            const out = p.clone(ctx);
            sealBag(out, this.closed, true);
            return out;
        }
        return peer;
    }
    get canon() {
        return this.closed ? 'close()' : 'open()';
    }
    same(peer) {
        return true === peer?.isSeal && this.closed === peer.closed;
    }
} /* node:coverage ignore next 2 */
exports.SealVal = SealVal;
function sealCjo(closed) {
    return closed ? 130000 : 25000;
}
// Closing is recursive, except into a subtree an explicit `open()`
// holds; opening is recursive and marks each bag so a later close stops.
function sealTree(v, closed, dir = false) {
    if ((true !== v?.isMap && true !== v?.isList) || (closed && true === v.opened)) {
        return;
    }
    v.closed = closed;
    v.opened = !closed;
    v.dirSealed = closed && dir;
    for (const key of Object.keys(v.peg)) {
        sealTree(v.peg[key], closed, dir);
    }
}
// A plain copy: no seal, held nowhere.
function unsealTree(v) {
    if (true === v?.isMap || true === v?.isList) {
        v.closed = false;
        v.opened = false;
        v.dirSealed = false;
        for (const key of Object.keys(v.peg)) {
            unsealTree(v.peg[key]);
        }
    }
}
// A copy stands at another place, so a seal its target's place made is a seal of the value there.
function fixSeals(v) {
    if (true === v?.isMap || true === v?.isList) {
        v.dirSealed = false;
        for (const key of Object.keys(v.peg)) {
            fixSeals(v.peg[key]);
        }
    }
}
// An explicit seal: the bag it names obeys whatever it said before.
function sealBag(v, closed, dir = false) {
    if (true === v?.isMap || true === v?.isList) {
        v.opened = false;
        sealTree(v, closed, dir);
    }
}
// A child of a closed bag closes as a copy (a reference answers a shared value).
function sealChild(ctx, child, dir = false) {
    if (true !== child?.isMap && true !== child?.isList) {
        return child;
    }
    if (true === child.closed || true === child.opened) {
        return child;
    }
    const out = child.clone(ctx);
    sealTree(out, true, dir);
    return out;
}
// A directive's seal takes the keys of the other terms at its place, and refuses the data's.
const takes = (bag, peer) => true === bag.dirSealed && true !== peer?.isData; /* node:coverage ignore next 10 */
exports.takes = takes;
//# sourceMappingURL=SealVal.js.map