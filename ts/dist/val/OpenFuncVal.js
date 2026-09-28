"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenFuncVal = void 0;
const FuncBaseVal_1 = require("./FuncBaseVal");
const SealVal_1 = require("./SealVal");
class OpenFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isOpenFunc = true;
        if (0 === spec.peg.length) {
            this.cjo = (0, SealVal_1.sealCjo)(false);
        }
    }
    make(_ctx, spec) {
        return new OpenFuncVal(spec);
    }
    funcname() {
        return 'open';
    }
    resolve(ctx, args) {
        let argval = args[0];
        if (null == argval) {
            return this.place(new SealVal_1.SealVal({ closed: false }, ctx));
        }
        if (argval.isMap || argval.isList) {
            // In place, for the reason CloseFuncVal.resolve gives: the
            // instantiation rule (ADR-005) makes the argument this call's
            // own wherever the call is multiplied.
            argval.closed = false;
        }
        return argval;
    }
} /* node:coverage ignore next 6 */
exports.OpenFuncVal = OpenFuncVal;
//# sourceMappingURL=OpenFuncVal.js.map