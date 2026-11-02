"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopyFuncVal = void 0;
const err_1 = require("../err");
const SealVal_1 = require("./SealVal");
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
        let out = null == val || null == ctx ?
            (0, err_1.makeNilErr)(ctx, 'invalid-arg', this) :
            val.clone(ctx);
        if (out.isRef) {
            ;
            out.copyFound = true;
        }
        else {
            // The argument lands as written: each hide(), type() and close()
            // in it is its argument, and each reference in it is the copy's,
            // so nothing it reads where it lands marks or seals it.
            out = (0, utility_1.walk)(out, (_key, val) => {
                while ((true === val.isHideFunc || true === val.isTypeFunc || true === val.isCloseFunc)
                    && 1 === val.peg?.length) {
                    val = val.peg[0];
                }
                val.mark.type = false;
                val.mark.hide = false;
                if (true === val.isRef) {
                    val.copyFound = true;
                }
                return val;
            });
            (0, SealVal_1.unsealTree)(out);
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.CopyFuncVal = CopyFuncVal;
//# sourceMappingURL=CopyFuncVal.js.map