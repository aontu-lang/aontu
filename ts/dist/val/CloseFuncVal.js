"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseFuncVal = void 0;
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
class CloseFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isCloseFunc = true;
        this.validateArgs(spec.peg, 1);
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
            return (0, err_1.makeNilErr)(ctx, 'no_first_arg', this, undefined, 'close');
        }
        if (argval.isMap || argval.isList) {
            // The in-place write is safe BECAUSE of the per-destination
            // instantiation rule (ADR-005): everywhere a close() call is
            // multiplied — a pack/each template, a spread constraint — the
            // clone now owns its argument (`dup`), so `closed` lands on that
            // instance alone. Cloning the bag here instead was tried and
            // rejected: the re-path it implies corrupts the source
            // attribution of children inside nested spread templates (the
            // 06-k8s use case's env findings named the wrong path).
            argval.closed = true;
            // console.log('CLOSED', argval.canon)
        }
        return argval;
    }
} /* node:coverage ignore next 6 */
exports.CloseFuncVal = CloseFuncVal;
//# sourceMappingURL=CloseFuncVal.js.map