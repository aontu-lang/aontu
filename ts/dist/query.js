"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nearestKey = nearestKey;
exports.pathParts = pathParts;
exports.projectFor = projectFor;
exports.evalFailure = evalFailure;
exports.get = get;
exports.why = why;
// THE QUERY SURFACE (G7 phase 1,
// docs/capability-review/g7-machine-access.md): select one node of an
// evaluated document by path and render it — the slice an agent asks
// for, instead of the whole file as one JSON blob.
//
// Evaluation is still GLOBAL. Unification has no partial mode to sell:
// the whole document is evaluated and then one node is selected. What
// `get` buys is the SIZE OF THE ANSWER, not the cost of producing it.
//
// The three projections are lattice ABSTRACTIONS, and each is defined
// so that the view it prints is a valid Aontu document that SUBSUMES
// the truth — generalisation, never distortion:
//
//   - `types` replaces every concrete leaf with its own kind, using
//     the lattice's own superior() rather than a table of this file's
//     opinions: {"replicas":3} becomes {"replicas":integer}.
//   - `depth n` keeps structure to depth n and renders every elided
//     subtree as `top` — "no further information at this tier".
//   - `keys` is `depth 1` degenerated to a listing.
//
// That property is not a promise here: every projection row of
// test/spec/query.tsv asserts subsume(view, truth) == 'subsumes' in
// both runners, which G3 made mechanically checkable.
//
// Projections are NOT canonical form and are never fed to G6's hash,
// which is why they are named views rather than spellings of --canon.
const aontu_1 = require("./aontu");
const exactjson_1 = require("./exactjson");
const vet_1 = require("./vet");
const keyorder_1 = require("./keyorder");
const provenance_1 = require("./provenance");
const TOP = 'top';
// The nearest key at the parent of a path that named nothing, by a
// plain edit distance over the sibling names — the "did you mean"
// half of the no_path contract. Undefined when nothing is close
// enough to be worth suggesting.
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
// The queried path, normalised the way anchorAt reads it — so a
// finding names `$.a.b` whether the caller wrote that, `a.b` or
// `$.a.b.` — and `$` for the root.
function pathText(path) {
    const parts = pathParts(path);
    return '$' + (0 < parts.length ? '.' + parts.join('.') : '');
}
// The projection walk, exported for the direct unit tests (ADR-002,
// ts/test/coverage3.test.ts): a junction member that is itself a
// junction of more than one term keeps its parens, and no SOURCE
// reaches that arm because norm flattens junctions at unification.
function projectFor(v, view, depth) {
    return project(v, view, depth);
}
// The canon-shaped views. One walk, two knobs: `types` generalises
// each leaf through the lattice, `depth` elides below its level. Bags
// recurse (their canon getters would render children through plain
// canon, which neither knob can reach); everything else is a leaf.
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
    // Junctions and prefs are TRANSPARENT: not a structural tier (so
    // they do not spend a level of depth) but not a leaf either (so
    // `*8080|integer` generalises to `*integer|integer` rather than
    // collapsing to `top` and throwing the alternatives away).
    if (true === v?.isPref) {
        return '*' + project(v.peg, view, depth);
    }
    if (true === v?.isConjunct || true === v?.isDisjunct) {
        return v.peg.map((m) => true === m?.isJunction && 1 < m.peg.length
            ? '(' + project(m, view, depth) + ')'
            : project(m, view, depth))
            .join(true === v.isConjunct ? '&' : '|');
    }
    // A LEAF. Under `types` a CONCRETE scalar lifts to its own kind —
    // superior() is the lattice's answer, so the view subsumes the truth
    // by construction and not by this file's good intentions. Everything
    // else is already an abstraction (a kind marker, a constraint, an
    // unresolved reference) and is left alone: lifting `integer` to
    // `number` would generalise a shape view that was already a shape.
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
// A document that does not stand up has no node to select. The
// engine's own first error IS the report: the query surface adds
// nothing to a diagnosis the evaluator already made. The path is the
// DOCUMENT — what failed is the whole thing standing up, not the node
// the caller asked about, which may never have existed.
function evalFailure(ctx) {
    // ctx.err is never empty at a call site: every failure that reaches
    // one collected an error first — a parse that did not stand up, a
    // root that came back nil. Not coalesced, on the vet siteOf
    // precedent: an impossible state should fail loudly rather than be
    // quietly papered over with a made-up code.
    const err = ctx.err[0];
    return finding(err.why, '$', err.msg);
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
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const root = aontu.unify(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == root || true === root.isNil) {
        return { ok: false, out: '', findings: [evalFailure(ctx)] };
    }
    const node = (0, vet_1.anchorAt)(root, path);
    if (null == node) {
        return { ok: false, out: '', findings: [noPathFinding(root, path)] };
    }
    if ('json' === view) {
        // GENERATION CAN FAIL WHERE UNIFICATION DID NOT: `k: integer` is a
        // perfectly good unified document and not a concrete value, so the
        // json view of it is an error, exactly as `aontu file.aon` on the
        // same document is. Under `collect` the failure lands on the
        // context rather than throwing, so it has to be read back — the Go
        // port's Gen returns it as an error and the two must agree.
        const before = ctx.err.length;
        const gen = node.gen(ctx);
        if (before < ctx.err.length) {
            const err = ctx.err[before];
            return {
                ok: false,
                out: '',
                findings: [finding(err?.why ?? 'no_gen', pathText(path), err?.msg ?? 'The value at this path is not concrete.')],
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
// WHY does the value at this path hold? Evaluate with the provenance
// recorder on, select the node, and answer the ordered contributions
// that met there — the positive twin of G2's error report.
//
// Two evaluations are NOT needed: the recorder rides the one run this
// call makes. What it costs is site materialisation and one map entry
// per path met, which an instrumented run pays knowingly.
function why(src, path, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
    const prov = new provenance_1.Provenance();
    const ctx = aontu.ctx({ collect: true, prov });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    // Parse and unify SEPARATELY, so the parsed tree can be stamped
    // before the fixpoint runs: a contribution is a value the author
    // wrote, and after unification there is no longer any way to tell
    // one from a value the engine minted on the way.
    const parsed = aontu.parse(src, parseOpts, ctx);
    if (0 < ctx.err.length || null == parsed) {
        return { ok: false, findings: [evalFailure(ctx)] };
    }
    prov.writtenFrom(parsed);
    const root = aontu.unify(parsed, parseOpts, ctx);
    if (0 < ctx.err.length || null == root || true === root.isNil) {
        return { ok: false, findings: [evalFailure(ctx)] };
    }
    const node = (0, vet_1.anchorAt)(root, path);
    if (null == node) {
        return { ok: false, findings: [noPathFinding(root, path)] };
    }
    return {
        ok: true,
        record: {
            conjuncts: prov.at(pathParts(path)),
            path: pathText(path),
            value: node.canon,
        },
        findings: [],
    };
}
//# sourceMappingURL=query.js.map