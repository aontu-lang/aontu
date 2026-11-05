"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillDiff = void 0;
exports.admits = admits;
const ConjunctVal_1 = require("./val/ConjunctVal");
const admission_1 = require("./val/admission");
Object.defineProperty(exports, "fillDiff", { enumerable: true, get: function () { return admission_1.fillDiff; } });
function generated(aontu, v, own) {
    const ctx = aontu.ctx({ collect: true });
    ctx.root = v;
    const out = undefined === own ? v.gen(ctx) : (0, admission_1.genToward)(v, ctx, own);
    return 0 === ctx.err.length ? out : undefined;
}
// Whether `trial` admits `value`. Both are cloned: a Val tree is single-use.
function admits(aontu, trial, value) {
    const ctx = aontu.ctx({ collect: true });
    const pair = new ConjunctVal_1.ConjunctVal({ peg: [trial.clone(ctx), value.clone(ctx)] }, ctx);
    const met = aontu.unify(pair, undefined, ctx);
    if (0 < ctx.err.length || true === met?.isNil) {
        return false;
    }
    const ownCtx = aontu.ctx({ collect: true });
    const settled = aontu.unify(value.clone(ownCtx), undefined, ownCtx);
    const own = 0 === ownCtx.err.length ? generated(aontu, settled) : undefined;
    const out = undefined === own ? undefined : generated(aontu, met, own);
    return undefined !== out && (0, admission_1.admitsJson)(met, out, own);
}
//# sourceMappingURL=admit.js.map