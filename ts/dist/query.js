"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nearestKey = nearestKey;
exports.pathParts = pathParts;
exports.projectFor = projectFor;
exports.evalFailure = evalFailure;
exports.noPathFinding = noPathFinding;
exports.get = get;
exports.why = why;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const exactjson_1 = require("./exactjson");
const vet_1 = require("./vet");
const keyorder_1 = require("./keyorder");
const provenance_1 = require("./provenance");
const TOP = 'top';
function nearestKey(want, have) {
    let best;
    let bestd = Infinity;
    for (const k of have) {
        const d = editDistance(want, k);
        if (d < bestd) {
            bestd = d;
            best = k;
        }
    }
    // Half the name may differ, no more: past that the suggestion is
    // noise, and a wrong suggestion costs more than none.
    return bestd <= Math.max(1, Math.floor(want.length / 2)) ? best : undefined;
}
function editDistance(a, b) {
    const prev = [];
    for (let j = 0; j <= b.length; j++) {
        prev[j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length];
}
// The path split anchorAt walks: `$` and empty segments dropped, so
// `$`, `$.` and `` all name the root.
function pathParts(path) {
    const trimmed = path.startsWith('$') ? path.slice(1) : path;
    return trimmed.split('.').filter((p) => '' !== p);
}
function pathText(path) {
    const parts = pathParts(path);
    return '$' + (0 < parts.length ? '.' + parts.join('.') : '');
}
function projectFor(v, view, depth) {
    return project(v, view, depth);
}
function project(v, view, depth) {
    if (depth <= 0) {
        return TOP;
    }
    if (true === v?.isMap) {
        const keys = Object.keys(v.peg).sort(keyorder_1.cmpCodePoint);
        return '{' +
            (v.spread.cj ? '&:' + project(v.spread.cj, view, depth - 1) +
                (0 < keys.length ? ',' : '') : '') +
            keys.map((k) => JSON.stringify(k) +
                (v.optionalKeys.includes(k) ? '?' : '') +
                ':' +
                project(v.peg[k], view, depth - 1)).join(',') +
            '}';
    }
    if (true === v?.isList) {
        const keys = Object.keys(v.peg);
        return '[' +
            (v.spread.cj ? '&:' + project(v.spread.cj, view, depth - 1) +
                (0 < keys.length ? ',' : '') : '') +
            keys.map((k) => project(v.peg[k], view, depth - 1)).join(',') +
            ']';
    }
    if (true === v?.isPref) {
        return '*' + project(v.peg, view, depth);
    }
    if (true === v?.isConjunct || true === v?.isDisjunct) {
        return v.peg.map((m) => true === m?.isJunction && 1 < m.peg.length
            ? '(' + project(m, view, depth) + ')'
            : project(m, view, depth))
            .join(true === v.isConjunct ? '&' : '|');
    }
    return 'types' === view && true === v?.isScalar ? v.superior().canon : v.canon;
}
// The `keys` listing: the node's own key names (or list indices), one
// per line, code-point ordered as canon orders them. A leaf has none,
// which is an empty answer rather than an error — "nothing below
// here" is a true statement about a scalar.
function keyList(v) {
    if (true === v?.isMap) {
        return Object.keys(v.peg).sort(keyorder_1.cmpCodePoint).join('\n');
    }
    if (true === v?.isList) {
        return Object.keys(v.peg).join('\n');
    }
    return '';
}
function finding(code, path, message, note) {
    return {
        code,
        class: 'reference',
        severity: 'error',
        path,
        message,
        sites: [],
        ...(null == note ? {} : { note }),
    };
}
// A document that does not stand up, reported at the root: a literal
// nil adds nothing to `ctx.err`, so `failed` carries the only code.
function evalFailure(ctx, failed) {
    return (0, vet_1.engineFinding)(ctx.err[0] ?? failed, ctx, '$');
}
// The refusal for a path that names nothing, shared by `get` and
// `why`: WHICH segment failed, and what was there instead — the "did
// you mean" the no_path contract promises. Walking again is cheap (the
// tree is in hand) and is the only way to name the parent.
function noPathFinding(root, path) {
    const parts = pathParts(path);
    let at = root;
    let want = '';
    for (const part of parts) {
        const next = (0, vet_1.anchorAt)(at, part);
        if (null == next) {
            want = part;
            break;
        }
        at = next;
    }
    const have = true === at?.isMap
        ? Object.keys(at.peg).sort(keyorder_1.cmpCodePoint)
        : (true === at?.isList ? Object.keys(at.peg) : []);
    const near = nearestKey(want, have);
    return finding('no_path', pathText(path), `The path ${path} names nothing in this document.`, null == near ? undefined : `did you mean ${near}?`);
}
// Evaluate the document, select the node at `path`, and render it.
function get(src, path, opts) {
    const options = opts ?? {};
    const view = options.view ?? 'json';
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const root = aontu.unify(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == root || true === root.isNil) {
        return { ok: false, out: '', findings: [evalFailure(ctx, root)] };
    }
    const node = (0, vet_1.anchorAt)(root, path);
    if (null == node) {
        return { ok: false, out: '', findings: [noPathFinding(root, path)] };
    }
    if ('json' === view) {
        const before = ctx.err.length;
        const gen = node.gen(ctx);
        if (before < ctx.err.length) {
            const err = ctx.err[before];
            return {
                ok: false,
                out: '',
                findings: [(0, vet_1.engineFinding)(err, ctx, pathText(path))],
            };
        }
        return { ok: true, out: (0, exactjson_1.exactJSON)(gen, 2), findings: [] };
    }
    if ('keys' === view) {
        return { ok: true, out: keyList(node), findings: [] };
    }
    return {
        ok: true,
        out: project(node, view, options.depth ?? Infinity),
        findings: [],
    };
}
function why(src, path, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const prov = new provenance_1.Provenance();
    const ctx = aontu.ctx({ collect: true, prov });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const parsed = aontu.parse(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == parsed) {
        return { ok: false, findings: [evalFailure(ctx)] };
    }
    prov.writtenFrom(parsed);
    const root = aontu.unify(parsed, parseOpts, ctx);
    if (0 < ctx.err.length || null == root || true === root.isNil) {
        return { ok: false, findings: [evalFailure(ctx, root)] };
    }
    const node = (0, vet_1.anchorAt)(root, path);
    if (null == node) {
        return { ok: false, findings: [noPathFinding(root, path)] };
    }
    // The value that stands here is a contribution when nothing met
    // (see Provenance.stands): a generator places a value without a
    // meet, and "nothing met at this path" is not an answer to "where
    // did this come from".
    const parts = pathParts(path);
    prov.stands(parts, node);
    return {
        ok: true,
        record: {
            conjuncts: prov.at(parts),
            path: pathText(path),
            value: node.canon,
        },
        findings: [],
    };
}
//# sourceMappingURL=query.js.map