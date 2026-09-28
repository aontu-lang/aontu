"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseFuncVal = void 0;
const FuncBaseVal_1 = require("./FuncBaseVal");
const SealVal_1 = require("./SealVal");
class CloseFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isCloseFunc = true;
        this.validateArgs(spec.peg, 1);
        if (0 === spec.peg.length) {
            this.cjo = (0, SealVal_1.sealCjo)(true);
        }
    }
    make(_ctx, spec) {
        return new CloseFuncVal(spec);
    }
    funcname() {
        return 'close';
    }
    resolve(ctx, args) {
        let argval = args[0];
        if (null == argval) {
            return this.place(new SealVal_1.SealVal({ closed: true }, ctx));
        }
        if (argval.isMap || argval.isList) {
            argval.closed = true;
        }
        return argval;
    }
} /* node:coverage ignore next 6 */
exports.CloseFuncVal = CloseFuncVal;
//# sourceMappingURL=CloseFuncVal.js.map