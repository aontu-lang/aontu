"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaFuncVal = void 0;
const err_1 = require("../err");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
const utility_1 = require("../utility");
// Plain data: what JSON can hold, with nothing left to resolve.
function plain(v) {
    if (true === v?.isScalar) {
        return true;
    }
    if ((true === v?.isMap || true === v?.isList) && null == v.spread?.cj &&
        0 === (v.optionalKeys ?? []).length) {
        return Object.values(v.peg).every(plain);
    }
    return false;
}
const text = (v) => true === v?.isScalar && 'string' === typeof v.peg;
const flag = (v) => true === v?.isScalar && 'boolean' === typeof v.peg;
// The record's whole vocabulary, each key with the values it may hold
// (G12 design, section 12).
const META_KEYS = {
    title: text,
    description: text,
    comment: text,
    format: text,
    contentEncoding: text,
    contentMediaType: text,
    readOnly: flag,
    writeOnly: flag,
    default: plain,
    contentSchema: plain,
    examples: (v) => true === v?.isList && plain(v),
    x: (v) => true === v?.isMap && plain(v),
    dynamicRef: text,
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
        let out = args[0];
        // A nil ARGUMENT is returned unchanged, as deprecate() returns one.
        if (out.isNil) {
            return out;
        }
        let rider = {};
        for (let i = 1; i < args.length; i++) {
            const r = args[i];
            const ok = true === r.isMap && null == r.spread?.cj &&
                0 === r.optionalKeys.length && Object.keys(r.peg).every((k) => Object.prototype.hasOwnProperty.call(META_KEYS, k) &&
                META_KEYS[k](r.peg[k]));
            if (!ok) {
                return (0, err_1.makeNilErr)(ctx, 'func_arg', this, r, undefined, {
                    func: 'meta',
                    sig: (0, sig_1.renderSig)(sig_1.funcSig.meta),
                    arg: 'r',
                    argn: '' + (i + 1),
                    got: r.canon,
                });
            }
            for (const k of Object.keys(r.peg)) {
                rider = (0, utility_1.unionRider)(rider, { [k]: [r.peg[k]] }, (m) => m.canon);
            }
        }
        out = out.clone(ctx);
        if (0 < Object.keys(rider).length) {
            out.meta = (0, utility_1.unionRider)(out.meta, rider, (m) => m.canon);
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.MetaFuncVal = MetaFuncVal;
//# sourceMappingURL=MetaFuncVal.js.map