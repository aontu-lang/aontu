"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopyFuncVal = void 0;
const err_1 = require("../err");
const utility_1 = require("../utility");
const FuncBaseVal_1 = require("./FuncBaseVal");
class CopyFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isCopyFunc = true;
        this.mark.type = false;
        this.mark.hide = false;
    }
    make(_ctx, spec) {
        return new CopyFuncVal(spec);
    }
    funcname() {
        return 'copy';
    }
    prepare(_ctx, _args) {
        return null;
    }
    resolve(ctx, args) {
        const val = args?.[0];
        const out = null == val || null == ctx ?
            (0, err_1.makeNilErr)(ctx, 'invalid-arg', this) :
            val.clone(ctx);
        // console.log('CR', out)
        if (!out.isRef) {
            (0, utility_1.walk)(out, (_key, val) => {
                // console.log('WALK', val)
                val.mark.type = false;
                val.mark.hide = false;
                return val;
            });
        }
        // console.log('COPY-RESOLVE', ctx.cc, val, out)
        return out;
    }
} /* node:coverage ignore next 6 */
exports.CopyFuncVal = CopyFuncVal;
//# sourceMappingURL=CopyFuncVal.js.map