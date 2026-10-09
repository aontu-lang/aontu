"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaFuncVal = void 0;
const err_1 = require("../err");
const rider_1 = require("../rider");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
// What each annotation key holds. `x` carries the keywords JSON Schema
// does not name, as a map of their values, and `dynamicRef` the text of
// the $dynamicRef a use was read from (ADR-057).
const META_KEYS = {
    title: 'string', description: 'string', comment: 'string', format: 'string',
    contentEncoding: 'string', contentMediaType: 'string', dynamicRef: 'string',
    readOnly: 'boolean', writeOnly: 'boolean',
    examples: 'list', x: 'map',
    default: 'data', contentSchema: 'data',
};
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
// A record whose every key is an annotation key holding its kind of
// concrete data, or undefined where any one does not.
function metaRecord(r) {
    if (true !== r?.isMap || !isData(r)) {
        return undefined;
    }
    const out = {};
    for (const k of Object.keys(r.peg)) {
        const v = r.peg[k];
        const kind = META_KEYS[k];
        const fits = 'data' === kind ||
            ('string' === kind && 'string' === typeof v.peg && true === v.isScalar) ||
            ('boolean' === kind && 'boolean' === typeof v.peg && true === v.isScalar) ||
            ('list' === kind && true === v.isList) ||
            ('map' === kind && true === v.isMap);
        if (!fits) {
            return undefined;
        }
        out[k] = [v];
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
} /* node:coverage ignore next 5 */
//# sourceMappingURL=MetaFuncVal.js.map