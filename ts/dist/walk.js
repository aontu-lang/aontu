"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkVals = walkVals;
exports.settledTrials = settledTrials;
exports.collectNils = collectNils;
exports.parseNilIn = parseNilIn;
exports.eachPart = eachPart;
exports.holdsReference = holdsReference;
const keyorder_1 = require("./keyorder");
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
        ...(v.rests ?? []).flatMap((r) => [r.t, ...r.covers]),
    ];
}
function trialSchemas(v) {
    const atom = v.pending?.atom;
    return 'nof' === atom ? v.pending.args.slice(1) :
        'when' === atom || 'rest' === atom ? v.pending.args :
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
        // A built constraint reads its own arguments: walk what its musts check, as Go does.
        if (true === v.isConstraint && null == v.pending && Array.isArray(v.peg)) {
            const checked = new Set((v.musts ?? []).map((m) => m.v));
            v.peg.filter((a) => !checked.has(a)).forEach((a) => walked.add(a));
        }
        // A standing preference's override space only says what may still
        // replace it, so an empty one is no finding.
        if (true === v.isPref && null != v.superpeg) {
            walked.add(v.superpeg);
        }
        // A pending match's arms are what it returns where one is chosen, and
        // a nil arm is a choice, not yet a value.
        if (true === v.isMatchFunc) {
            v.peg.slice(1).forEach((arm) => walked.add(arm));
        }
        // A written `nil` under an optional key nobody supplied is no
        // finding.
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
// The parse refusal vet would report inside v, the least by path where
// there are several, so both ports raise the same one.
function parseNilIn(v) {
    let first = undefined;
    for (const n of collectNils(v, new Set())) {
        if ('parse' === n.class && (undefined === first ||
            (0, keyorder_1.cmpCodePoint)(n.path.join('\u0000'), first.path.join('\u0000')) < 0)) {
            first = n;
        }
    }
    return first;
}
function eachPart(root, visit) {
    const seen = new Set();
    const stack = [root];
    while (0 < stack.length) {
        const v = stack.pop();
        if (true !== v?.isVal || seen.has(v)) {
            continue;
        }
        seen.add(v);
        visit(v);
        const peg = v.peg;
        const kids = Array.isArray(peg) ? peg : true === peg?.isVal ? [peg] :
            null != peg && 'object' === typeof peg ? Object.values(peg) : [];
        kids.forEach((kid) => stack.push(kid));
        stack.push(v.spread?.cj);
    }
}
// Whether a value still reads a path or a variable.
function holdsReference(root) {
    let holds = false;
    eachPart(root, (v) => { holds = holds || true === v.isRef || true === v.isVar; });
    return holds;
}
//# sourceMappingURL=walk.js.map