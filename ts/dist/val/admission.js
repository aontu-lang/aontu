"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillDiff = fillDiff;
exports.sameJson = sameJson;
exports.withoutOptionalFills = withoutOptionalFills;
exports.admitsJson = admitsJson;
exports.ownJson = ownJson;
exports.admitsSettled = admitsSettled;
const type_1 = require("../type");
const unify_1 = require("../unify");
const BagVal_1 = require("./BagVal");
const top_1 = require("./top");
function isObject(v) {
    return null != v && 'object' === typeof v && !Array.isArray(v);
}
// Own keys only: a generated object may carry a key spelt like an
// inherited property (`toString`, `__proto__`).
function hasOwn(v, k) {
    return Object.prototype.hasOwnProperty.call(v, k);
}
function member(val, seg) {
    return Array.isArray(val?.peg) ? val.peg[Number(seg)] : val?.peg?.[seg];
}
// The members `generated` holds that `data` lacks, as paths, but for a key
// the settled value `val` makes optional: that is the schema's to supply.
function fillDiff(generated, data, val, path = [], out = []) {
    if (isObject(generated) && isObject(data)) {
        const optional = val?.optionalKeys ?? [];
        for (const k of Object.keys(generated)) {
            if (!hasOwn(data, k)) {
                if (!optional.includes(k)) {
                    out.push([...path, k]);
                }
            }
            else {
                fillDiff(generated[k], data[k], member(val, k), [...path, k], out);
            }
        }
    }
    else if (Array.isArray(generated) && Array.isArray(data)) {
        for (let i = 0; i < generated.length; i++) {
            if (data.length <= i) {
                out.push([...path, String(i)]);
            }
            else {
                fillDiff(generated[i], data[i], member(val, String(i)), [...path, String(i)], out);
            }
        }
    }
    return out;
}
function sameJson(a, b) {
    if (isObject(a) && isObject(b)) {
        const ka = Object.keys(a).sort();
        const kb = Object.keys(b).sort();
        return ka.length === kb.length &&
            ka.every((k, i) => k === kb[i] && sameJson(a[k], b[k]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
    }
    if ('bigint' === typeof a || 'bigint' === typeof b) {
        return ('bigint' === typeof a || 'number' === typeof a) &&
            ('bigint' === typeof b || 'number' === typeof b) && BigInt(a) === BigInt(b);
    }
    return a === b;
}
// What the data carries: past fillDiff, every other member is optional.
function withoutOptionalFills(generated, data) {
    if (isObject(generated) && isObject(data)) {
        const out = {};
        for (const k of Object.keys(generated)) {
            if (hasOwn(data, k)) {
                (0, BagVal_1.putKey)(out, k, withoutOptionalFills(generated[k], data[k]));
            }
        }
        return out;
    }
    if (Array.isArray(generated) && Array.isArray(data)) {
        return generated.map((v, i) => withoutOptionalFills(v, data[i]));
    }
    return generated;
}
function admitsJson(met, out, own) {
    return 0 === fillDiff(out, own, met).length &&
        sameJson(withoutOptionalFills(out, own), own);
}
function ownJson(value, ctx) {
    const gctx = ctx.clone({ err: [], collect: true });
    const own = value.clone(gctx).gen(gctx);
    return 0 < gctx.err.length ? undefined : own;
}
// The meet run to a fixpoint as the document is, the calls that wait for
// a settled tree, `match` among them, resolving once a pass changes nothing.
function trialMeet(tctx, trial, value) {
    tctx.settle = false;
    tctx.seen = {};
    tctx.cc = 0;
    let met = (0, unify_1.unite)(tctx, trial.clone(tctx), value.clone(tctx), 'nof');
    let last = '';
    for (let cc = 1; cc < tctx.budget.passes && type_1.DONE !== met.dc; cc++) {
        const now = met.canon;
        tctx.settle = now === last;
        last = now;
        tctx.seen = {};
        tctx.cc = cc;
        met = (0, unify_1.unite)(tctx, met, (0, top_1.top)(), 'nof');
    }
    return met;
}
// The trial inside the engine: `trial` admits the settled `value`, whose
// JSON is `own`, at `path`. One verdict per position, trial and value in
// an evaluation, and undefined once the trial budget is spent.
function admitsSettled(ctx, trial, value, own, path) {
    if (true === trial.isNil) {
        return false;
    }
    const trials = ctx._trials;
    const key = JSON.stringify([path, trial.canon, value.canon]);
    const known = trials.memo.get(key);
    if (undefined !== known) {
        return known;
    }
    if (ctx.budget.trials <= trials.n) {
        return undefined;
    }
    trials.n++;
    const verdict = trialVerdict(ctx, trial, value, own);
    trials.memo.set(key, verdict);
    return verdict;
}
function trialVerdict(ctx, trial, value, own) {
    const tctx = ctx.clone({ err: [], collect: true });
    const met = trialMeet(tctx, trial, value);
    if (true === met.isNil || 0 < tctx.err.length) {
        return false;
    }
    const out = met.gen(tctx);
    return 0 === tctx.err.length && undefined !== out && admitsJson(met, out, own);
}
//# sourceMappingURL=admission.js.map