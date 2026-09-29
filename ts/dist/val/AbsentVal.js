"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbsentVal = void 0;
const type_1 = require("../type");
const FeatureVal_1 = require("./FeatureVal");
const Val_1 = require("./Val");
// Top with one difference (ADR-034): absence is GENERABLE, and
// generates nothing, so a bag drops it at a required key too.
class AbsentVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isAbsent = true;
        this.dc = type_1.DONE;
        this.mark.type = false;
        this.mark.hide = false;
    }
    // The unit of the meet, called for EITHER operand so `&` commutes.
    // Nothing here meets an absence with TOP, so there is no top arm;
    // Go has one because it MEETS an op's result where this port places
    // it. edge-plus-list-absent guards the day that changes.
    unify(peer, ctx) {
        const at = ctx.path;
        if (0 < at.length && at.join('\u0000') !== peer.path.map(String).join('\u0000')) {
            const out = peer.clone(ctx, { path: [...at] });
            (0, Val_1.repathInstance)(out, out.path);
            return out;
        }
        return peer;
    }
    same(peer) {
        return true === peer?.isAbsent;
    }
    get canon() { return 'maybe()'; }
    gen(_ctx) {
        return undefined;
    }
} /* node:coverage ignore next 6 */
exports.AbsentVal = AbsentVal;
//# sourceMappingURL=AbsentVal.js.map