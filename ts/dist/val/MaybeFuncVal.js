"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaybeFuncVal = void 0;
const unify_1 = require("../unify");
const AbsentVal_1 = require("./AbsentVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const top_1 = require("./top");
class MaybeFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isMaybeFunc = true;
        this.forgives = true;
        // A reference that has not resolved YET is not a reference to
        // nothing (ADR-034).
        this.staged = true;
    }
    funcname() {
        return 'maybe';
    }
    // Null so the base drives nothing: it would drive on the CALLER's
    // context, where NilVal.make records the miss before resolve runs.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        if (!ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        // Cloned rather than swapped and restored, which is the
        // own-property hazard trialUnify documents at length.
        const sink = [];
        const actx = ctx.clone({ err: sink, collect: true });
        actx._trialMode = false;
        const out = (0, unify_1.unite)(actx, args[0], (0, top_1.top)(), 'maybe');
        // ONLY a missing referent. A conflict inside the argument stays
        // the document's error.
        if (out.isNil && 'reference' === out.class) {
            return this.place(new AbsentVal_1.AbsentVal({}, ctx));
        }
        for (const err of sink) {
            ctx.adderr(err);
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.MaybeFuncVal = MaybeFuncVal;
//# sourceMappingURL=MaybeFuncVal.js.map