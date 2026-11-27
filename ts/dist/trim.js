"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.candidates = candidates;
exports.deleteAt = deleteAt;
exports.evalCanon = evalCanon;
exports.trimCheck = trimCheck;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
function pathText(path) {
    return '$' + (0 < path.length ? '.' + path.join('.') : '');
}
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
function evalCanon(src, opts, delPath, sink) {
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(opts));
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == opts.path ? undefined : { path: opts.path };
    const fail = (failed) => {
        if (null != sink) {
            sink.ctx = ctx;
            // The failing ROOT travels with the context: a nil root can
            // arrive with an EMPTY error list (`&: id(root)`), and the
            // finding is built from it then (use-cases/BUGS.md §43).
            sink.failed = failed;
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
        return fail(v);
    }
    return v.canon;
}
function trimCheck(src, opts) {
    const options = opts ?? {};
    const sink = {};
    const baseline = evalCanon(src, options, undefined, sink);
    if (undefined === baseline) {
        return {
            verdict: 'error',
            redundant: [],
            errors: [(0, vet_1.failureFinding)(sink.ctx, options.path, sink.failed)],
        };
    }
    const aontu = new aontu_1.Aontu({ readByExtension: options.readByExtension });
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