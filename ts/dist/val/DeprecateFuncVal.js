"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeprecateFuncVal = void 0;
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const rider_1 = require("../rider");
// The record's whole vocabulary. Other keys are DROPPED, not carried:
// the record is a contract the tooling reads (vet, the LSP tag, the
// breaking downgrade), and a bag of free-form keys would be a second,
// unspecified metadata channel.
const DEPRECATION_KEYS = ['msg', 'use', 'since'];
class DeprecateFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isDeprecateFunc = true;
    }
    make(_ctx, spec) {
        return new DeprecateFuncVal(spec);
    }
    funcname() {
        return 'deprecate';
    }
    resolve(ctx, args) {
        let out = args[0] ?? (0, err_1.makeNilErr)(ctx, 'arg', this);
        // A nil ARGUMENT is returned unchanged, never marked: marking it
        // makes the bag's marked-child skip drop it (the type()/hide()
        // lesson — refusal over corruption, D7).
        if (out.isNil) {
            return out;
        }
        out = out.clone(ctx);
        const record = {};
        const m = args[1];
        if (true === m?.isMap && null != m.peg) {
            for (const key of DEPRECATION_KEYS) {
                const v = m.peg[key];
                if (true === v?.isScalar && 'string' === typeof v.peg) {
                    record[key] = [v.peg];
                }
            }
        }
        // A second record on a deprecated value joins the first.
        out.deprecation = (0, rider_1.unionRecords)([out.deprecation, record], (s) => s);
        return out;
    }
} /* node:coverage ignore next 6 */
exports.DeprecateFuncVal = DeprecateFuncVal;
//# sourceMappingURL=DeprecateFuncVal.js.map