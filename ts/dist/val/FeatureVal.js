"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureVal = void 0;
const Val_1 = require("./Val");
const top_1 = require("./top");
const err_1 = require("../err");
class FeatureVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isFeature = true;
    }
    superior() {
        return (0, top_1.top)();
    }
    gen(ctx) {
        // Unresolved nil cannot be generated, so always an error.
        let nerr = (0, err_1.makeNilErr)(ctx, 'no_gen', this);
        (0, err_1.descErr)(nerr, ctx);
        ctx?.adderr(nerr);
        if (null == ctx || !ctx.collect) {
            const aerr = new err_1.AontuError(nerr.msg, [nerr]);
            throw aerr;
        }
        return undefined;
    }
} /* node:coverage ignore next 6 */
exports.FeatureVal = FeatureVal;
//# sourceMappingURL=FeatureVal.js.map