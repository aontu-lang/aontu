"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOW_AT = void 0;
exports.allow = allow;
const aontu_1 = require("./aontu");
const ConjunctVal_1 = require("./val/ConjunctVal");
const vet_1 = require("./vet");
const query_1 = require("./query");
const utility_1 = require("./utility");
// Where the roles map lives when the caller does not say.
exports.ALLOW_AT = '$.roles';
const ENTRY = 'string & re("^[$]") & re("[^.]$")';
// The shape every role must satisfy, in the language: a list of
// subtree entries to allow, and optionally one to deny.
const ROLE_SHAPE = `{ allow: [&: ${ENTRY}] deny?: [&: ${ENTRY}] }`;
function shapeSource(at) {
    const keys = (0, query_1.pathParts)(at).map((p) => JSON.stringify(p));
    return 0 === keys.length
        ? '&: ' + ROLE_SHAPE
        : keys.join(': ') + ': { &: ' + ROLE_SHAPE + ' }';
}
// `$.a.b` for a segment list, `$` for none: the spelling every report
// uses for a path, whatever the caller wrote.
function pathText(parts) {
    return '$' + (0 < parts.length ? '.' + parts.join('.') : '');
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
function readEntries(list, by, ctx) {
    const entries = [];
    for (let i = 0; i < list.peg.length; i++) {
        const el = list.peg[i];
        const before = ctx.err.length;
        const text = true === el.isString ? el.peg : el.gen(ctx);
        if (before < ctx.err.length) {
            const err = ctx.err[before];
            return { entries, finding: (0, vet_1.engineFinding)(err, ctx, `${by}.${i}`) };
        }
        entries.push({ parts: (0, query_1.pathParts)(text), text, by: `${by}.${i}` });
    }
    return { entries };
}
// One segment of an entry against one segment of a path: `*` matches
// any key, anything else matches itself.
function segmentMatches(pattern, segment) {
    return '*' === pattern || pattern === segment;
}
function intersects(entry, path) {
    const n = Math.min(entry.length, path.length);
    for (let i = 0; i < n; i++) {
        if (!segmentMatches(entry[i], path[i])) {
            return false;
        }
    }
    return true;
}
function covers(entry, path) {
    return entry.length <= path.length && intersects(entry, path);
}
function decide(asked, allows, denies) {
    const parts = (0, query_1.pathParts)(asked);
    const path = pathText(parts);
    for (const d of denies) {
        if (intersects(d.parts, parts)) {
            return { path, allowed: false, reason: 'deny', by: d.by, pattern: d.text };
        }
    }
    for (const a of allows) {
        if (covers(a.parts, parts)) {
            return { path, allowed: true, reason: 'allow', by: a.by, pattern: a.text };
        }
    }
    return { path, allowed: false, reason: 'uncovered' };
}
function errorReport(role, f) {
    return { verdict: 'error', role, paths: [], findings: [f] };
}
// Evaluate the role model, select the role, and decide every path.
function allow(src, role, paths, opts) {
    const options = opts ?? {};
    const at = pathText((0, query_1.pathParts)(options.at ?? exports.ALLOW_AT));
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const shape = aontu.parse(shapeSource(at), undefined, ctx);
    const model = aontu.parse(src, parseOpts, ctx);
    if (0 < ctx.err.length) {
        return errorReport(role, (0, query_1.evalFailure)(ctx));
    }
    const root = aontu.unify(new ConjunctVal_1.ConjunctVal({ peg: [model, shape] }, ctx), undefined, ctx);
    if (0 < ctx.err.length || true === root.isNil) {
        return errorReport(role, (0, query_1.evalFailure)(ctx, root));
    }
    const roles = (0, vet_1.anchorAt)(root, at);
    const atRole = `${at}.${role}`;
    if (!Object.prototype.hasOwnProperty.call(roles.peg, role)) {
        const near = (0, query_1.nearestKey)(role, Object.keys(roles.peg));
        return {
            verdict: 'refused',
            role,
            paths: paths.map((p) => ({
                path: pathText((0, query_1.pathParts)(p)), allowed: false, reason: 'no_role',
            })),
            findings: [finding('no_path', atRole, `The role ${role} is not declared at ${at} in this document.`, null == near ? undefined : `did you mean ${near}?`)],
        };
    }
    const node = roles.peg[role];
    const allows = readEntries(node.peg.allow, `${atRole}.allow`, ctx);
    if (null != allows.finding) {
        return errorReport(role, allows.finding);
    }
    const denies = readEntries(node.peg.deny, `${atRole}.deny`, ctx);
    if (null != denies.finding) {
        return errorReport(role, denies.finding);
    }
    const decisions = paths.map((p) => decide(p, allows.entries, denies.entries));
    // Nothing asked is nothing allowed: a gate that answered `allowed`
    // to an empty question would let a caller that dropped its
    // arguments through.
    const allowed = 0 < decisions.length && decisions.every((d) => d.allowed);
    return {
        verdict: allowed ? 'allowed' : 'refused',
        role,
        paths: decisions,
        findings: [],
    };
}
//# sourceMappingURL=allow.js.map