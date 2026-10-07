"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityFuncVal = void 0;
const err_1 = require("../err");
const sig_1 = require("../sig");
const FuncBaseVal_1 = require("./FuncBaseVal");
const aliasname_1 = require("../aliasname");
const utility_1 = require("../utility");
const uri_1 = require("../uri");
const text = (v) => true === v?.isScalar && 'string' === typeof v.peg;
const plainName = (v) => text(v) && /^[A-Za-z_][-A-Za-z0-9._]*$/.test(v.peg);
// The record's whole vocabulary: an $id is an absolute URI, and an
// $anchor or a $dynamicAnchor is a plain name.
const IDENTITY_KEYS = {
    id: (v) => text(v) && undefined !== (0, uri_1.parseUri)(v.peg).scheme &&
        !v.peg.includes('#'),
    anchor: plainName,
    dynamicAnchor: plainName,
    key: text,
};
class IdentityFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isIdentityFunc = true;
    }
    make(_ctx, spec) {
        return new IdentityFuncVal(spec);
    }
    funcname() {
        return 'identity';
    }
    resolve(ctx, args) {
        const v = args[0];
        if (v.isNil) {
            return v;
        }
        const r = args[1];
        const ok = true === r.isMap && null == r.spread?.cj &&
            0 === r.optionalKeys.length && Object.keys(r.peg).every((k) => Object.prototype.hasOwnProperty.call(IDENTITY_KEYS, k) &&
            IDENTITY_KEYS[k](r.peg[k]));
        if (!ok) {
            return (0, err_1.makeNilErr)(ctx, 'func_arg', this, r, undefined, {
                func: 'identity',
                sig: (0, sig_1.renderSig)(sig_1.funcSig.identity),
                arg: 'r',
                argn: '2',
                got: r.canon,
            });
        }
        const out = v.clone(ctx);
        // A reference's copy of the declaration, taken before the call
        // resolved, is that declaration's copy, not one of the alias it names.
        if (null != this.aliasOrigin) {
            out.aliasOrigin = this.aliasOrigin;
        }
        // Only the declaration carries the record, from a call that is no
        // other call's argument: a reference's copy of the call resolves
        // where the reference stands, as its value.
        if (1 === this.path.length && (0, aliasname_1.isAliasSlotKey)(this.path[0]) &&
            true !== ctx.inarg && true !== ctx.argsnap) {
            out.identity = (0, utility_1.unionRider)(out.identity, Object.fromEntries(Object.keys(r.peg).map((k) => [k, [r.peg[k].peg]])), String);
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.IdentityFuncVal = IdentityFuncVal;
//# sourceMappingURL=IdentityFuncVal.js.map