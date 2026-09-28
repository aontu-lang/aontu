"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SealVal = void 0;
exports.sealCjo = sealCjo;
const type_1 = require("../type");
const FeatureVal_1 = require("./FeatureVal");
// `close()` and `open()` with no argument: they seal, or unseal, the
// map or list they meet, and leave any other value as it is. `close()`
// folds LAST in a conjunct, so it closes the whole meet rather than the
// first term it finds; `open()` folds first, so it lifts a seal before
// anything is added.
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
    unify(peer, _ctx) {
        const p = peer;
        if (null == p || true === p.isTop) {
            return this;
        }
        if (true === p.isSeal) {
            return this.closed || !p.closed ? this : p;
        }
        if (true === p.isMap || true === p.isList) {
            p.closed = this.closed;
            return p;
        }
        return peer;
    }
    get canon() {
        return this.closed ? 'close()' : 'open()';
    }
    same(peer) {
        return true === peer?.isSeal && this.closed === peer.closed;
    }
} /* node:coverage ignore next 4 */
exports.SealVal = SealVal;
function sealCjo(closed) {
    return closed ? 130000 : 25000;
}
//# sourceMappingURL=SealVal.js.map