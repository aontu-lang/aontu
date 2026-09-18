"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIAL_NIL = exports.NilVal = void 0;
const type_1 = require("../type");
const Val_1 = require("./Val");
const err_1 = require("../err");
const hints_1 = require("../hints");
class NilVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec && 'string' !== typeof spec ? spec : {}, ctx);
        this.isNil = true;
        this.isGenable = true;
        this.nil = true;
        this.msg = '';
        if (spec && 'object' === typeof spec) {
            this.why = spec?.why;
            this.msg = 'string' === typeof spec?.msg ? spec.msg : this.msg;
            this.err =
                Array.isArray(spec.err) ? [...spec.err] :
                    null != spec.err ? [spec.err] :
                        Val_1.EMPTY_ERR;
        }
        // Nil is always DONE, by definition.
        this.dc = type_1.DONE;
    }
    unify(_peer, _ctx) {
        return this;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        out.why = this.why;
        out.primary = this.primary;
        out.secondary = this.secondary;
        out.msg = this.msg;
        // The hint reads the details, so a clone that dropped them left
        // `{name}` in the message. A struct copy carries them in Go.
        out.details = this.details;
        return out;
    }
    get canon() {
        return 'nil';
    }
    // The code's class from the shared registry (test/spec/errcodes.tsv):
    // conflict | incomplete | reference | parse | budget | internal.
    // A why-less nil classifies as its eventual gen-time code, nil_gen.
    get class() {
        return (0, hints_1.codeClass)(null == this.why ? 'nil_gen' : String(this.why));
    }
    gen(ctx) {
        // Unresolved nil cannot be generated, so always an error.
        this.why = this.why ?? 'nil_gen';
        ctx.adderr(this);
        if (!ctx.collect) {
            if (null == this.msg || '' === this.msg) {
                (0, err_1.descErr)(this, ctx);
            }
            const err = new err_1.AontuError(this.msg, [this]);
            throw err;
        }
        return undefined;
    }
    superior() {
        return this;
    }
    inspection() {
        return this.why;
    }
}
exports.NilVal = NilVal;
// A Nil is an error - should not happen - unify failed
// refactor ,make(spec,ctx)
NilVal.make = (ctx, why, av, bv, attempt, details) => {
    let nil = new NilVal({ why }, ctx);
    nil.attempt = attempt;
    nil.details = details;
    // Terms later in same file are considered the primary error location.
    if (null != av) {
        nil.site.row = av.site.row;
        nil.site.col = av.site.col;
        nil.site.url = av.site.url;
        nil.primary = av;
        nil.path = av.path;
        if (null != bv) {
            nil.secondary = bv;
            let bv_loc_wins = (nil.site.url === bv.site.url) && ((nil.site.row < bv.site.row) ||
                (nil.site.row === bv.site.row && nil.site.col < bv.site.col));
            if (bv_loc_wins) {
                nil.site.row = bv.site.row;
                nil.site.col = bv.site.col;
                nil.site.url = bv.site.url;
                nil.primary = bv;
                nil.secondary = av;
                nil.path = bv.path;
            }
        }
    }
    if (null != ctx?.path && 0 < ctx.path.length &&
        (null != bv || null == nil.path || 0 === nil.path.length)) {
        nil.path = [...ctx.path];
    }
    if (ctx) {
        ctx.adderr(nil);
    }
    return nil;
};
const TRIAL_NIL = new NilVal({ why: '|:trial-nil' }); /* node:coverage ignore next 7 */
exports.TRIAL_NIL = TRIAL_NIL;
//# sourceMappingURL=NilVal.js.map