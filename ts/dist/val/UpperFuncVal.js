"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpperFuncVal = void 0;
const err_1 = require("../err");
const valutil_1 = require("../val/valutil");
const Decimal_1 = require("../val/Decimal");
const caserange_1 = require("./caserange");
const FuncBaseVal_1 = require("./FuncBaseVal");
class UpperFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isUpperFunc = true;
    }
    make(_ctx, spec) {
        return new UpperFuncVal(spec);
    }
    funcname() {
        return 'upper';
    }
    resolve(ctx, args) {
        // A missing argument (`upper()`) must produce an invalid-arg error
        // value, as the Go port does — reading .peg off nothing threw a
        // TypeError that the unifier could only report as an opaque
        // internal error.
        const arg = args?.[0];
        const oldpeg = arg?.peg;
        const start = (0, caserange_1.rangeArg)(args?.[1]);
        const len = (0, caserange_1.rangeArg)(args?.[2]);
        const ranged = undefined !== start || undefined !== len;
        if (ranged &&
            (Number.isNaN(start) || Number.isNaN(len) ||
                'string' !== typeof oldpeg)) {
            return this.place((0, err_1.makeNilErr)(ctx, 'invalid-arg', this, arg, 'range'));
        }
        const peg = 'string' === typeof oldpeg ?
            (0, caserange_1.caseRange)(oldpeg, start ?? 0, len ?? -1, true) :
            'number' === typeof oldpeg ? Math.ceil(oldpeg) :
                'bigint' === typeof oldpeg ? oldpeg :
                    oldpeg instanceof Decimal_1.Decimal ? oldpeg.ceil() :
                        undefined;
        const out = this.place(null == peg ?
            (0, err_1.makeNilErr)(ctx, 'invalid-arg', this) :
            // The ceiling keeps the ARGUMENT's kind (upper(2) is an integer
            // 2, upper(1.1) is a number 2) — the function must not narrow
            // number to integer.
            (0, valutil_1.makeScalarLike)(peg, arg));
        return out;
    }
} /* node:coverage ignore next 6 */
exports.UpperFuncVal = UpperFuncVal;
//# sourceMappingURL=UpperFuncVal.js.map