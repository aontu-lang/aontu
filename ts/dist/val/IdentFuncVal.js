"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentFuncVal = void 0;
exports.undeclared = undeclared;
const err_1 = require("../err");
const rider_1 = require("../rider");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
const MetaFuncVal_1 = require("./MetaFuncVal");
class IdentFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isIdentFunc = true;
        // The whole value of an alias declaration, which the parser marks.
        this.declared = false;
    }
    make(_ctx, spec) {
        const out = new IdentFuncVal(spec);
        out.declared = this.declared;
        return out;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.declared = this.declared;
        return out;
    }
    funcname() {
        return 'ident';
    }
    resolve(ctx, args) {
        if (!this.declared) {
            return (0, err_1.makeNilErr)(ctx, 'ident_place', this);
        }
        const out = args[0];
        if (out.isNil) {
            return out;
        }
        const record = identRecord(args[1]);
        if (undefined === record) {
            return (0, err_1.makeNilErr)(ctx, 'func_arg', this, args[1], undefined, {
                func: 'ident',
                sig: (0, sig_1.renderSig)(sig_1.funcSig.ident),
                arg: 'r',
                argn: '2',
                got: args[1].canon,
            });
        }
        const v = out.clone(ctx);
        v.identity = (0, rider_1.unionRecords)([v.identity, record], (r) => r.canon);
        return v;
    }
}
exports.IdentFuncVal = IdentFuncVal;
// A declaration's record: a map of concrete data under any keys, which
// the JSON Schema exporter reads its identity from (ADR-073).
function identRecord(r) {
    if (true !== r.isMap || !(0, MetaFuncVal_1.isData)(r)) {
        return undefined;
    }
    const out = Object.create(null);
    for (const k of Object.keys(r.peg)) {
        out[k] = [r.peg[k]];
    }
    return out;
}
// A copy is not the declaration it was taken from, so it has no identity.
function undeclared(v) {
    if (true === v.isIdentFunc) {
        return v.peg[0];
    }
    v.identity = undefined;
    return v;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=IdentFuncVal.js.map