"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaFuncVal = void 0;
exports.isData = isData;
const err_1 = require("../err");
const rider_1 = require("../rider");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
class MetaFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isMetaFunc = true;
    }
    make(_ctx, spec) {
        return new MetaFuncVal(spec);
    }
    funcname() {
        return 'meta';
    }
    rides() {
        return true;
    }
    resolve(ctx, args) {
        let out = args[0] ?? (0, err_1.makeNilErr)(ctx, 'arg', this);
        // A nil argument is returned unchanged, as deprecate() returns one.
        if (out.isNil) {
            return out;
        }
        const records = [];
        for (let i = 1; i < args.length; i++) {
            const record = metaRecord(args[i]);
            if (undefined === record) {
                const sig = sig_1.funcSig.meta;
                return (0, err_1.makeNilErr)(ctx, 'func_arg', this, args[i], undefined, {
                    func: 'meta',
                    sig: (0, sig_1.renderSig)(sig),
                    arg: 'r',
                    argn: '' + (i + 1),
                    got: args[i].canon,
                });
            }
            records.push(record);
        }
        out = out.clone(ctx);
        const meta = (0, rider_1.unionRecords)([out.meta, ...records], (v) => v.canon);
        if (0 < Object.keys(meta).length) {
            out.meta = meta;
        }
        return out;
    }
}
exports.MetaFuncVal = MetaFuncVal;
// A record: a map of concrete data, under any keys, or undefined where it
// is not one. What a key means is for the reader of the record to say;
// the JSON Schema exporter reads its own keys (ADR-072).
function metaRecord(r) {
    if (true !== r?.isMap || !isData(r)) {
        return undefined;
    }
    const out = Object.create(null);
    for (const k of Object.keys(r.peg)) {
        out[k] = [r.peg[k]];
    }
    return out;
}
// Concrete JSON data: a scalar, or a map or list of them with no spread
// and no optional key.
function isData(v) {
    if (true === v?.isScalar) {
        return true;
    }
    if ((true !== v?.isMap && true !== v?.isList) || null != v.spread?.cj ||
        (true === v.isMap && 0 < v.optionalKeys.length)) {
        return false;
    }
    return Object.values(v.peg).every(isData);
} /* node:coverage ignore next 6 */
//# sourceMappingURL=MetaFuncVal.js.map