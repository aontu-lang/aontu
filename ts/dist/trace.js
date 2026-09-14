"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.traceTree = traceTree;
exports.traceRun = traceRun;
const aontu_1 = require("./aontu");
const keyorder_1 = require("./keyorder");
const utility_1 = require("./utility");
const vet_1 = require("./vet");
const err_1 = require("./err");
function walkVals(root, fn) {
    const walk = (v, path) => {
        fn(v, path);
        if (true === v.isList && null != v.peg) {
            for (let i = 0; i < v.peg.length; i++) {
                walk(v.peg[i], [...path, String(i)]);
            }
        }
        else if (true === v.isMap && null != v.peg) {
            for (const k of Object.keys(v.peg).sort(keyorder_1.cmpCodePoint)) {
                if (!v.aliasKeys?.includes(k)) {
                    walk(v.peg[k], [...path, k]);
                }
            }
        }
    };
    walk(root, []);
}
function addr(path) {
    return '$' + path.map((seg) => '.' + seg).join('');
}
function scalar(v) {
    return (true === v?.isScalar && 'string' === typeof v.peg) ? v.peg : undefined;
}
function fileName(v) {
    if (true !== v?.isMap) {
        return undefined;
    }
    return 'File' === scalar(v.peg?.cmp) ? scalar(v.peg?.props?.peg?.name) :
        undefined;
}
// THE INNERMOST FILE WINS: the longest matching prefix, not the first.
function enclosing(files, path) {
    let best;
    let long = -1;
    for (const f of files) {
        if ((path === f.at || path.startsWith(f.at + '.')) && f.at.length > long) {
            best = f.name;
            long = f.at.length;
        }
    }
    return best;
}
// Every piece a dispatch stamped, attributed to the file it reached.
// One pass: `walkVals` is depth-first in document order, so a file is
// always seen before the marks beneath it.
function traceTree(root) {
    const files = [];
    const marks = [];
    walkVals(root, (v, path) => {
        const name = fileName(v);
        if (undefined !== name) {
            files.push({ at: addr(path), name });
        }
        if (null != v.emitted) {
            marks.push({ at: addr(path), mark: v.emitted });
        }
    });
    const out = [];
    for (const m of marks) {
        const file = enclosing(files, m.at);
        if (undefined === file) {
            continue;
        }
        out.push({ file, at: m.at, node: m.mark.node, rule: m.mark.rule });
    }
    return out;
}
// THE MARKS ARE OPT-IN. `emit` stamps a piece only when the context
// carries a `reads` set, so the verb asks for one the way `render
// --trace` did.
function traceRun(src, options) {
    const opts = options ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(opts));
    const actx = aontu.ctx({ collect: true, reads: new Set() });
    const root = aontu.unify(src, { path: opts.path, collect: true }, actx);
    if (0 < actx.err.length || true === root?.isNil) {
        return {
            verdict: 'error', trace: [],
            errors: [(0, vet_1.failureFinding)(actx, opts.path, root)],
        };
    }
    let node = root;
    const at = opts.at ?? '$.out';
    const found = (0, vet_1.anchorAt)(root, at);
    if (null == found) {
        const nil = (0, err_1.makeNilErr)(actx, 'no_path', root, undefined, 'at');
        actx.err.push(nil);
        return {
            verdict: 'error', trace: [],
            errors: [(0, vet_1.failureFinding)(actx, opts.path, root)],
        };
    }
    node = found;
    return { verdict: 'ok', trace: traceTree(node) };
} /* node:coverage ignore next 6 */
//# sourceMappingURL=trace.js.map