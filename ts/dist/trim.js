"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.candidates = candidates;
exports.deleteAt = deleteAt;
exports.evalCanon = evalCanon;
exports.trimCheck = trimCheck;
// The trim reporter (G3 phase 6,
// docs/capability-review/g3-subsumption-evolution.md): report REDUNDANT
// map entries — entries whose removal leaves the evaluated result
// unchanged, the spread-implied case included — as paths. Report-only,
// deliberately: canon discards comments and layout, so REWRITING the
// file needs G7's format-preserving patch surface; trim ships as a
// reporter here and becomes an editor there.
//
// The test is EVALUATE-AND-COMPARE: for each candidate entry, re-parse
// the source, delete the entry from the parsed tree, evaluate, and
// compare canons. This subsumes the design's spread case — an entry a
// spread template re-supplies evaluates to the same canon without its
// explicit spelling — and is honest about everything the fixpoint can
// see (references, templates, duplicate-key merges), where a purely
// structural test would guess. A removal that ERRORS is not redundant:
// the entry is load-bearing.
//
// Parsed trees are single-use (docs/reference-api.md), so every probe
// is its own parse: one evaluation per candidate plus one for the
// baseline. A reporter can afford that; an editor loop belongs to G7.
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
function pathText(path) {
    return '$' + (0 < path.length ? '.' + path.join('.') : '');
}
// Every (map, key) pair in a PARSED tree, parent-first. Candidates come
// from the parse rather than the evaluation: an entry the fixpoint
// erases or rewrites still has to be addressable for deletion. The
// non-Val guard is for a bag's raw peg entries, which degenerate
// parses can leave behind. Exported (with deleteAt and evalCanon) for
// the direct unit tests (ADR-002, ts/test/coverage3.test.ts): the
// defensive arms are unreachable through trimCheck, whose candidates
// come from an identical parse.
function candidates(v, path, out) {
    if (null == v || true !== v.isVal) {
        return;
    }
    if (true === v.isMap && null != v.peg) {
        for (const k of Object.keys(v.peg)) {
            out.push([...path, k]);
            candidates(v.peg[k], [...path, k], out);
        }
    }
    else if (true === v.isList && null != v.peg) {
        // List ELEMENTS are not candidates: removing one shifts every
        // later index, which is a different document, not the same one
        // minus a redundancy. Entries of maps INSIDE lists still are.
        for (const k of Object.keys(v.peg)) {
            candidates(v.peg[k], [...path, k], out);
        }
    }
}
// Delete the entry at path from a parsed tree. False when the path
// does not address a map entry (which cannot happen for a candidate
// enumerated from an identical parse, but the walk stays honest).
function deleteAt(root, path) {
    let node = root;
    for (const seg of path.slice(0, -1)) {
        if ((true === node?.isMap || true === node?.isList) && null != node.peg) {
            node = node.peg[seg];
        }
        else {
            return false;
        }
    }
    const key = path[path.length - 1];
    if (true !== node?.isMap || null == node.peg ||
        !Object.prototype.hasOwnProperty.call(node.peg, key)) {
        return false;
    }
    delete node.peg[key];
    // Always an array on a parsed bag (BagVal initialises it).
    node.optionalKeys = node.optionalKeys.filter((k) => k !== key);
    return true;
}
// One evaluation: parse (deleting the entry at delPath, when given),
// unify under collect, and answer the canon — or undefined when the
// source does not stand up, which for the baseline is the caller's
// error verdict and for a probe means "load-bearing".
function evalCanon(src, opts, delPath, sink) {
    const aontu = new aontu_1.Aontu(null == opts.trust ? undefined : { trust: opts.trust });
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == opts.path ? undefined : { path: opts.path };
    // WHY the run failed, for the one caller that reports it. The
    // BASELINE run passes a sink and a probe does not: a probe's failure
    // means "load-bearing", which is an answer rather than a fault, and
    // reporting it would bury the one real finding under one entry's
    // worth of noise per candidate.
    const fail = () => {
        if (null != sink) {
            sink.ctx = ctx;
        }
        return undefined;
    };
    const parsed = aontu.parse(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == parsed) {
        return fail();
    }
    if (null != delPath && !deleteAt(parsed, delPath)) {
        return undefined;
    }
    const v = aontu.unify(parsed, parseOpts, ctx);
    if (0 < ctx.err.length || true === v?.isNil) {
        return fail();
    }
    return v.canon;
}
// The whole reporter: the baseline canon, then one probe per candidate
// entry, parent-first — and a child of a redundant parent is SKIPPED,
// because "remove the whole entry" already covers it and reporting
// both would tell the author to delete the same text twice.
function trimCheck(src, opts) {
    const options = opts ?? {};
    const sink = {};
    const baseline = evalCanon(src, options, undefined, sink);
    if (undefined === baseline) {
        return {
            verdict: 'error',
            redundant: [],
            errors: [(0, vet_1.failureFinding)(sink.ctx, options.path)],
        };
    }
    const aontu = new aontu_1.Aontu();
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const parsed = aontu.parse(src, parseOpts, ctx);
    const paths = [];
    candidates(parsed, [], paths);
    const redundant = [];
    for (const path of paths) {
        const parent = pathText(path.slice(0, -1));
        if (redundant.some((r) => r === parent || parent.startsWith(r + '.'))) {
            continue;
        }
        if (baseline === evalCanon(src, options, path)) {
            redundant.push(pathText(path));
        }
    }
    return {
        verdict: 0 === redundant.length ? 'clean' : 'redundant',
        redundant,
    };
}
//# sourceMappingURL=trim.js.map