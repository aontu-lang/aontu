"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefFuncVal = void 0;
const err_1 = require("../err");
const PrefVal_1 = require("../val/PrefVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
// A call is left as written: preferring its arguments would change what it
// computes, where pref changes only what it defaults to.
function prefer(ctx, val) {
    if (val.isScalar || val.isPref) {
        return new PrefVal_1.PrefVal({ peg: val }, ctx);
    }
    if (val.isMap || val.isList || val.isConjunct || val.isDisjunct) {
        const peg = val.peg;
        for (const k of Object.keys(peg)) {
            peg[k] = prefer(ctx, peg[k]);
        }
    }
    return val;
}
class PrefFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPrefFunc = true;
    }
    make(_ctx, spec) {
        return new PrefFuncVal(spec);
    }
    funcname() {
        return 'pref';
    }
    resolve(ctx, args) {
        let out = args[0] ?? (0, err_1.makeNilErr)(ctx, 'arg', this);
        if (!out.isNil) {
            out = prefer(ctx, out.clone(ctx));
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.PrefFuncVal = PrefFuncVal;
//# sourceMappingURL=PrefFuncVal.js.map