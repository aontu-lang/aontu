"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringVal = void 0;
const err_1 = require("../err");
const err_2 = require("../err");
const ScalarVal_1 = require("./ScalarVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
class StringVal extends ScalarVal_1.ScalarVal {
    constructor(spec, ctx) {
        super({ peg: spec.peg, kind: String }, ctx);
        this.isString = true;
        this.needsNonEmpty = true === spec.needsNonEmpty;
        this.emptyOk = true === spec.emptyOk;
    }
    clone(ctx, spec) {
        return super.clone(ctx, {
            needsNonEmpty: this.needsNonEmpty,
            emptyOk: this.emptyOk,
            ...(spec ?? {}),
        });
    }
    withEmpty(ctx) {
        return this.emptyOk ? this : this.clone(ctx, { emptyOk: true });
    }
    withNonEmpty(ctx) {
        return this.needsNonEmpty || '' !== this.peg ? this :
            this.clone(ctx, { needsNonEmpty: true });
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isString && this.peg === p.peg) {
            const needs = this.needsNonEmpty || p.needsNonEmpty;
            const ok = this.emptyOk || p.emptyOk;
            return needs === this.needsNonEmpty && ok === this.emptyOk ? this :
                needs === p.needsNonEmpty && ok === p.emptyOk ? p :
                    this.clone(ctx, { needsNonEmpty: needs, emptyOk: ok });
        }
        return super.unify(peer, ctx);
    }
    // The kind that admits this value: "" needs the waiver.
    superior() {
        return this.place(new ScalarKindVal_1.ScalarKindVal({
            peg: String, emptyOk: '' === this.peg || this.emptyOk,
        }));
    }
    get refused() {
        return '' === this.peg && this.needsNonEmpty && !this.emptyOk;
    }
    get canon() {
        return (this.refused ? 'string&' : '') + JSON.stringify(this.peg);
    }
    gen(ctx) {
        if (this.refused) {
            const nerr = (0, err_1.makeNilErr)(ctx, 'string_empty', this);
            (0, err_1.descErr)(nerr, ctx);
            ctx?.adderr(nerr);
            if (null == ctx || !ctx.collect) {
                throw new err_2.AontuError(nerr.msg, [nerr]);
            }
            return undefined;
        }
        return super.gen(ctx);
    }
} /* node:coverage ignore next 5 */
exports.StringVal = StringVal;
//# sourceMappingURL=StringVal.js.map