"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkVals = walkVals;
exports.settledTrials = settledTrials;
exports.collectNils = collectNils;
function walkVals(v, visit, seen) {
    if (null == v || 'object' !== typeof v || true !== v.isVal) {
        return;
    }
    if (seen.has(v)) {
        return;
    }
    seen.add(v);
    if (!visit(v)) {
        return;
    }
    const peg = v.peg;
    if (Array.isArray(peg)) {
        for (const c of peg) {
            walkVals(c, visit, seen);
        }
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k in peg) {
            walkVals(peg[k], visit, seen);
        }
    }
    const spread = v.spread?.cj;
    if (spread) {
        walkVals(spread, visit, seen);
    }
    walkVals(v.superpeg, visit, seen);
    for (const must of (v.musts ?? [])) {
        walkVals(must?.v, visit, seen);
    }
    for (const c of settledTrials(v)) {
        walkVals(c, visit, seen);
    }
    walkVals(v.primary, visit, seen);
    walkVals(v.secondary, visit, seen);
}
function settledTrials(v) {
    return [
        ...(v.nofs ?? []).flatMap((n) => n.cs),
        ...(v.whens ?? []).flatMap((w) => undefined === w.e ? [w.c, w.t] : [w.c, w.t, w.e]),
        ...(v.contains ?? []).map((k) => k.c),
    ];
}
function trialSchemas(v) {
    const atom = v.pending?.atom;
    return 'nof' === atom ? v.pending.args.slice(1) :
        'when' === atom ? v.pending.args :
            'contains' === atom ? v.pending.args.slice(0, 1) : settledTrials(v);
}
function collectNils(root, seen) {
    const out = [];
    const walked = new Set();
    walkVals(root, (v) => {
        if (true === v.isNil) {
            out.push(v);
            seen.add(v);
            return false;
        }
        // A spread template is not an instance value: generation never emits
        // it, and each child it applies to carries its own copy.
        if (null != v.spread?.cj) {
            walked.add(v.spread.cj);
        }
        // A trial schema is no instance value, and a nil one admits nothing.
        for (const c of trialSchemas(v)) {
            walked.add(c);
        }
        // A written `nil` under an optional key nobody supplied is no
        // finding (ADR-046).
        if (true === v.isMap) {
            for (const k of v.optionalKeys) {
                if (true === v.peg[k]?.isNil && 'literal_nil' === v.peg[k].why) {
                    walked.add(v.peg[k]);
                }
            }
        }
        return true;
    }, walked);
    return out;
}
//# sourceMappingURL=walk.js.map