"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopVal = void 0;
const type_1 = require("../type");
const Val_1 = require("./Val");
// There can be only one.
class TopVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isTop = true;
        this.id = 0;
        this.dc = type_1.DONE;
        // TOP is always DONE, by definition.
        this.dc = type_1.DONE;
        this.mark.type = false;
        this.mark.hide = false;
    }
    same(peer) {
        return peer.isTop;
    }
    unify(peer, ctx) {
        return peer.unify(this, ctx);
    }
    get canon() { return 'any'; }
    superior() {
        return this;
    }
    clone(_ctx, _spec) {
        return this;
    }
    gen(_ctx) {
        return undefined;
    }
} /* node:coverage ignore next 6 */
exports.TopVal = TopVal;
//# sourceMappingURL=TopVal.js.map