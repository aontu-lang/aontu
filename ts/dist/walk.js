"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkVals = walkVals;
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
    for (const nof of (v.nofs ?? [])) {
        for (const branch of nof.branches) {
            walkVals(branch, visit, seen);
        }
    }
    for (const w of (v.whens ?? [])) {
        for (const branch of [w.c, w.t, w.e]) {
            walkVals(branch, visit, seen);
        }
    }
    walkVals(v.primary, visit, seen);
    walkVals(v.secondary, visit, seen);
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
        // A key still optional is absent, whatever its value holds.
        for (const k of v.optionalKeys ?? []) {
            if (undefined !== v.peg[k]) {
                walked.add(v.peg[k]);
            }
        }
        // A count's alternatives are trial schemas, where nil admits nothing.
        for (const nof of v.nofs ?? []) {
            nof.branches.forEach((b) => walked.add(b));
        }
        for (const w of v.whens ?? []) {
            [w.c, w.t, w.e].forEach((b) => walked.add(b));
        }
        return true;
    }, walked);
    return out;
}
//# sourceMappingURL=walk.js.map