"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenFuncVal = void 0;
const err_1 = require("../err");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
const MetaFuncVal_1 = require("./MetaFuncVal");
const top_1 = require("./top");
class GenFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isGenFunc = true;
        // AFTER every other term of a meet, the late atoms included: canon
        // writes the annotation last, as it writes one that rides a value.
        this.cjo = 160000;
    }
    make(_ctx, spec) {
        return new GenFuncVal(spec);
    }
    funcname() {
        return 'gen';
    }
    rides() {
        return true;
    }
    // `any` carrying the record, which every meet takes to its result. A
    // record that says nothing is no record.
    resolve(ctx, args) {
        const rec = args[0];
        if (rec.isNil) {
            return rec;
        }
        if (true !== rec.isMap || !(0, MetaFuncVal_1.isData)(rec)) {
            return (0, err_1.makeNilErr)(ctx, 'func_arg', this, rec, undefined, {
                func: 'gen',
                sig: (0, sig_1.renderSig)(sig_1.funcSig.gen),
                arg: 'spec',
                argn: '1',
                got: rec.canon,
            });
        }
        const out = (0, top_1.top)();
        if (0 < Object.keys(rec.peg).length) {
            out.genrec = rec;
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.GenFuncVal = GenFuncVal;
//# sourceMappingURL=GenFuncVal.js.map