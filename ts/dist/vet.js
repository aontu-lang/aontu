"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VET_MAX_ERRORS = void 0;
exports.displayFile = displayFile;
exports.engineFinding = engineFinding;
exports.failureFinding = failureFinding;
exports.anchorAt = anchorAt;
exports.throughResidue = throughResidue;
exports.vetCoverage = vetCoverage;
exports.vet = vet;
const aontu_1 = require("./aontu");
const node_path_1 = require("node:path");
const err_1 = require("./err");
const hints_1 = require("./hints");
const ConjunctVal_1 = require("./val/ConjunctVal");
const walk_1 = require("./walk");
const BagVal_1 = require("./val/BagVal");
const utility_1 = require("./utility");
const subsume_1 = require("./subsume");
const query_1 = require("./query");
const keyorder_1 = require("./keyorder");
// The default cap, exported because the CLI applies it to the WHOLE
// report across several data files and must not carry a second copy of
// the number (ts/src/cli.ts).
exports.VET_MAX_ERRORS = 20;
const DEFAULT_SCHEMA_URL = 'schema';
const DEFAULT_DATA_URL = 'data';
function stampUrl(v, url, seen) {
    const urls = seen ?? new Set();
    urls.add(url);
    (0, walk_1.walkVals)(v, (n) => {
        if (null == n.site.url || '' === n.site.url) {
            n.site.url = url;
        }
        urls.add(n.site.url);
        return true;
    }, new Set());
    return urls;
}
function displayFile(url, label, path) {
    if (url === label || null == path || '' === url || !(0, node_path_1.isAbsolute)(url)) {
        return url;
    }
    const rel = (0, node_path_1.relative)((0, node_path_1.dirname)((0, node_path_1.resolve)(path)), url);
    const dir = (0, node_path_1.dirname)(label);
    return '.' === dir ? rel : (0, node_path_1.join)(dir, rel);
}
function displayOf(file, role, prov) {
    return 'data' === role
        ? displayFile(file, prov.dataUrl ?? file, prov.dataPath)
        : displayFile(file, prov.schemaUrl ?? file, prov.schemaPath);
}
function roleOf(file, prov) {
    return prov.data.has(file) ? 'data' : 'schema';
}
function pathText(path) {
    return '$' + (null != path && 0 < path.length ? '.' + path.join('.') : '');
}
function siteOf(v, prov) {
    if (null == v) {
        return undefined;
    }
    const file = v.site.url;
    const role = roleOf(file, prov);
    return {
        file: displayOf(file, role, prov),
        row: v.site.row,
        col: v.site.col,
        len: v.site.len,
        role,
        src: v.site.src,
        value: v.canon,
    };
}
// The data site first — it is the thing to fix — then the schema site.
// The underlying NilVal fields are untouched: this is a report-layer
// projection, so the existing error.tsv assertions do not move.
function sitesOf(nil, prov) {
    const sites = [siteOf(nil.primary ?? nil, prov)];
    const secondary = siteOf(nil.secondary, prov);
    if (null != secondary) {
        sites.push(secondary);
    }
    return [
        ...sites.filter((s) => 'data' === s.role),
        ...sites.filter((s) => 'schema' === s.role),
    ];
}
function materialise(nil, ctx) {
    if (null == nil.msg || '' === nil.msg) {
        (0, err_1.descErr)(nil, ctx);
    }
}
const UNSHAPED = 'unify_failed';
// The terminal colour escapes the parser puts in its message text. A
// RegExp built from a string, not a literal: the escape is a control
// character, and spelling it `\u001b` keeps the source readable.
const ANSI_RE = new RegExp('\u001b\\[[0-9;]*m', 'g');
function stripAnsi(s) {
    return s.replace(ANSI_RE, '');
}
// The registry's hint and a code's own `details` fields: the same set
// on every finding reporting an ENGINE code.
function fromRegistry(finding, nil) {
    const details = nil.details ?? {};
    const hint = (0, err_1.getHint)(nil.why, nil.details);
    if (null != hint && '' !== hint) {
        finding.hint = stripAnsi(hint).replace(/\s+$/, '');
    }
    if ('string' === typeof details.expected) {
        finding.expected = details.expected;
    }
    if ('string' === typeof details.actual) {
        finding.actual = details.actual;
    }
    if ('string' === typeof details.message) {
        finding.note = details.message;
    }
    return finding;
}
function findingOf(nil, prov) {
    return fromRegistry({
        code: nil.why,
        class: nil.class,
        severity: 'error',
        path: pathText(nil.path),
        message: stripAnsi(nil.msg.split('\n')[0]),
        sites: sitesOf(nil, prov),
    }, nil);
}
const ORDER_PAD = 9;
function pad(n) {
    return String(n).padStart(ORDER_PAD, '0');
}
function orderKey(f, index) {
    const site = f.sites[0];
    return [
        site.file,
        pad(site.row),
        pad(site.col),
        f.code,
        f.path,
        pad(index),
    ].join('\u0000');
}
// An ENGINE code at a path the caller names: class from the registry
// through NilVal.class, message materialised first (a `gen` nil has none).
function engineFinding(nil, ctx, path) {
    if (null == nil) {
        return {
            code: UNSHAPED,
            class: (0, hints_1.codeClass)(UNSHAPED),
            severity: 'error',
            path,
            message: 'The document does not evaluate.',
            sites: [],
        };
    }
    materialise(nil, ctx);
    return fromRegistry({
        code: nil.why,
        class: nil.class,
        severity: 'error',
        path,
        message: stripAnsi(nil.msg.split('\n')[0]),
        sites: [],
    }, nil);
}
function failureFinding(ctx, url, failed) {
    const nil = ctx.err[0] ?? failed;
    materialise(nil, ctx);
    const at = url ?? '';
    const urls = new Set([at]);
    for (const v of [nil, nil.primary, nil.secondary]) {
        if (null == v || null == v.site) {
            continue;
        }
        if (null == v.site.url || '' === v.site.url) {
            v.site.url = at;
        }
        urls.add(v.site.url);
    }
    return findingOf(nil, { data: urls });
}
// Walk the evaluated schema to the anchor path. `$` and `$.a.b` are
// both accepted, as is the bare `a.b` a shell is likely to hand over
// unquoted.
function anchorAt(root, at) {
    const trimmed = at.startsWith('$') ? at.slice(1) : at;
    const parts = trimmed.split('.').filter((p) => '' !== p);
    let node = root;
    for (const part of parts) {
        node = throughResidue(node);
        if (true === node?.isMap) {
            const peg = node.peg;
            if (null == peg || !Object.prototype.hasOwnProperty.call(peg, part)) {
                return undefined;
            }
            node = peg[part];
        }
        else if (true === node?.isList) {
            // CANONICAL DECIMAL, the spelling a reference uses for a list
            // index (`0`, or a non-zero digit run) -- so `$.a.01` names
            // nothing here exactly as it names nothing there.
            const peg = node.peg;
            const index = Number(part);
            if (!/^(0|[1-9][0-9]*)$/.test(part) ||
                !Array.isArray(peg) || peg.length <= index) {
                return undefined;
            }
            node = peg[index];
        }
        else {
            return undefined;
        }
    }
    return node;
}
function throughResidue(v) {
    return (0, BagVal_1.sizingResidue)(v)?.bag ?? v;
}
const COVER_TEMPLATE = '&';
// Is this value a bag with children to walk?
function coverKids(v) {
    const out = [];
    if (true === v.isMap && null != v.peg) {
        for (const k of Object.keys(v.peg).sort(keyorder_1.cmpCodePoint)) {
            out.push({ key: k, val: v.peg[k] });
        }
    }
    else if (true === v.isList && Array.isArray(v.peg)) {
        v.peg.forEach((m, i) => out.push({ key: String(i), val: m }));
    }
    return out;
}
function coverTemplate(v) {
    const cj = v?.spread?.cj;
    return null != cj && true === cj.isVal && true !== cj.isTop ? cj : undefined;
}
function coverDeclare(v, path, out) {
    const tpl = coverTemplate(v);
    if (null != tpl) {
        const at = [...path, COVER_TEMPLATE];
        out.set(pathText(at), tpl);
        coverDeclare(tpl, at, out);
    }
    for (const { key, val } of coverKids(v)) {
        const at = [...path, key];
        out.set(pathText(at), val);
        coverDeclare(val, at, out);
    }
}
// Every path in the data, and whether it is a LEAF -- a node with no
// children, which is where a value lives.
function coverDataPaths(v, path, out) {
    const kids = coverKids(v);
    if (0 < path.length) {
        out.push({ path: pathText(path), leaf: 0 === kids.length });
    }
    for (const { key, val } of kids) {
        coverDataPaths(val, [...path, key], out);
    }
}
// Walk one data path down the schema, naming the declaration that
// constrains it -- the exact key where the schema has one, else the
// covering template. Undefined when the schema declares nothing there.
function coverMatch(anchor, segs) {
    let at = anchor;
    let decl = '';
    for (const seg of segs) {
        const named = true === at.isMap && null != at.peg ? at.peg[seg]
            : true === at.isList && Array.isArray(at.peg) ? at.peg[Number(seg)]
                : undefined;
        if (null != named && true === named.isVal) {
            decl = '' === decl ? seg : decl + '.' + seg;
            at = named;
            continue;
        }
        const tpl = coverTemplate(at);
        if (null == tpl) {
            return undefined;
        }
        decl = '' === decl ? COVER_TEMPLATE : decl + '.' + COVER_TEMPLATE;
        at = tpl;
    }
    return '$.' + decl;
}
// The SHALLOWEST members of a set of paths: one whose parent is also in
// the set is covered by naming the parent, and naming both is noise.
// `render --coverage`'s `dead` is built on the same rule.
function coverShallowest(paths) {
    const held = new Set(paths);
    return paths.filter((p) => {
        for (let at = p; -1 !== at.lastIndexOf('.');) {
            at = at.slice(0, at.lastIndexOf('.'));
            if (held.has(at)) {
                return false;
            }
        }
        return true;
    }).sort(keyorder_1.cmpCodePoint);
}
// The accounting itself: what the schema declared, what the data holds,
// and which of each the other met.
function vetCoverage(anchor, dataVal, coverageAt) {
    const declarations = new Map();
    coverDeclare(anchor, [], declarations);
    const dataPaths = [];
    coverDataPaths(dataVal, [], dataPaths);
    // `--coverage-at` narrows the DATA side, which is the side a caller
    // gating one subtree is asking about. The schema side follows from
    // it: a declaration is unused only among the data actually measured.
    const under = null == coverageAt ? undefined
        : coverageAt.replace(/^\$\.?/, '');
    const inScope = (p) => {
        if (null == under || '' === under) {
            return true;
        }
        const want = '$.' + under;
        return p === want || p.startsWith(want + '.');
    };
    const used = new Set();
    const unchecked = [];
    let checked = 0;
    let leaves = 0;
    for (const { path, leaf } of dataPaths) {
        if (!inScope(path)) {
            continue;
        }
        const segs = path.replace(/^\$\.?/, '').split('.').filter((x) => '' !== x);
        const decl = coverMatch(anchor, segs);
        if (leaf) {
            leaves++;
        }
        if (null == decl) {
            unchecked.push(path);
            continue;
        }
        used.add(decl);
        if (leaf) {
            checked++;
        }
    }
    // A declaration is met when it constrained a data path, or when a
    // declaration BENEATH it was: `$.a` is used by `$.a.b` meeting
    // `$.a.b`, and reporting the parent as unused would be false.
    const unused = [];
    for (const decl of declarations.keys()) {
        const covered = used.has(decl) ||
            [...used].some((u) => u.startsWith(decl + '.'));
        if (!covered) {
            unused.push(decl);
        }
    }
    return {
        checked,
        declared: declarations.size,
        leaves,
        unchecked: coverShallowest(unchecked),
        unused: coverShallowest(unused),
        vacuous: 0 === checked && 0 < leaves,
    };
}
function vet(schemaSrc, dataSrc, opts) {
    const options = opts ?? {};
    const schemaUrl = options.schemaUrl ?? DEFAULT_SCHEMA_URL;
    const dataUrl = options.dataUrl ?? DEFAULT_DATA_URL;
    const maxErrors = options.maxErrors ?? exports.VET_MAX_ERRORS;
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const schemaOpts = null == options.schemaPath ?
        undefined : { path: options.schemaPath };
    const dataOpts = null == options.dataPath ?
        undefined : { path: options.dataPath };
    // 1. The schema alone. If it does not stand up on its own, the data
    //    is never blamed for it.
    const schemaCtx = aontu.ctx({ collect: true });
    const schemaVal = aontu.unify(schemaSrc, schemaOpts, schemaCtx);
    if (0 < schemaCtx.err.length || true === schemaVal?.isNil) {
        const failure = 0 < schemaCtx.err.length ? schemaCtx.err[0] : schemaVal;
        stampUrl(schemaVal, schemaUrl);
        stampUrl(failure, schemaUrl);
        materialise(failure, schemaCtx);
        return {
            verdict: 'error',
            truncated: false,
            // A schema that does not stand up: nothing here is data, so the
            // data-url set is empty and every site reads `schema`.
            findings: [findingOf(failure, { data: new Set() })],
        };
    }
    // 2. The anchor: the whole schema, or the value at `--at`.
    let anchor = schemaVal;
    if (null != options.at) {
        anchor = anchorAt(schemaVal, options.at);
        if (null == anchor) {
            return {
                verdict: 'error',
                truncated: false,
                findings: [(0, query_1.noPathFinding)(schemaVal, options.at)],
            };
        }
    }
    // 3. Both documents get their provenance stamped BEFORE they meet, so
    //    every site in the result knows which document it came from.
    const dataCtx = aontu.ctx({ collect: true });
    const dataVal = aontu.parse(dataSrc, dataOpts, dataCtx);
    if (0 < dataCtx.err.length || null == dataVal) {
        const failure = dataCtx.err[0];
        if (null == failure) {
            return { verdict: 'error', truncated: false, findings: [] };
        }
        failure.site.url = dataUrl;
        materialise(failure, dataCtx);
        return {
            verdict: 'invalid',
            truncated: false,
            findings: [findingOf(failure, { data: new Set([dataUrl]) })],
        };
    }
    stampUrl(schemaVal, schemaUrl);
    const dataUrls = stampUrl(dataVal, dataUrl);
    // The projection every site in this report goes through: roles by
    // url-set membership, names by how the caller reached each document.
    const prov = {
        data: dataUrls,
        schemaUrl, schemaPath: options.schemaPath,
        dataUrl, dataPath: options.dataPath,
    };
    let coverage;
    if (true === options.coverage) {
        const coverCtx = aontu.ctx({ collect: true });
        const settledData = aontu.unify(dataSrc, dataOpts, coverCtx);
        // A data document that does not stand alone is already reported by
        // the meet below; here it falls back to what was parsed, which is
        // the same paths minus whatever an include would have added.
        const measured = 0 === coverCtx.err.length && true !== settledData?.isNil
            ? settledData : dataVal;
        coverage = vetCoverage(anchor, measured, options.coverageAt);
    }
    const lintFindings = [];
    (0, utility_1.walkBagVals)(anchor, (v, path) => {
        if (true === v.isDisjunct && Array.isArray(v.peg)) {
            const d = (0, subsume_1.effectiveDefault)(v);
            if (null != d && 'indeterminate' !== d) {
                const rest = v.peg.filter((m) => true !== m?.isPref);
                const state = {
                    profile: 'values', findings: [],
                    generalUrl: schemaUrl, specificUrl: schemaUrl,
                };
                const admitted = rest.some((m) => 'yes' === (0, subsume_1.subsumeNode)(state, path, m, d));
                if (!admitted && 0 < rest.length) {
                    lintFindings.push({
                        code: 'pref_not_instance',
                        class: 'compat',
                        severity: 'warning',
                        path: pathText(path),
                        message: 'the default ' + d.canon +
                            ' is not an instance of any remaining alternative of ' +
                            v.canon,
                        sites: [{
                                file: schemaUrl,
                                row: d.site?.row ?? -1,
                                col: d.site?.col ?? -1,
                                len: d.site?.len ?? -1,
                                role: 'schema',
                                src: d.site?.src ?? '',
                                value: d.canon,
                            }],
                    });
                }
            }
        }
    });
    if (true === options.closed && (true === anchor.isMap || true === anchor.isList)) {
        anchor.closed = true;
    }
    const ctx = aontu.ctx({ collect: true });
    let meetAnchor = anchor;
    if (null == options.at) {
        const meetCtx = aontu.ctx({ collect: true });
        const freshSchema = aontu.parse(schemaSrc, schemaOpts, meetCtx);
        if (0 === meetCtx.err.length && null != freshSchema) {
            meetAnchor = freshSchema;
            if (true === options.closed &&
                (true === meetAnchor.isMap || true === meetAnchor.isList)) {
                meetAnchor.closed = true;
            }
            stampUrl(meetAnchor, schemaUrl);
        }
    }
    else {
        ;
        ctx._fixroot = schemaVal;
        ctx.path = options.at.replace(/^\$\.?/, '')
            .split('.').filter((s) => '' !== s);
    }
    const pair = new ConjunctVal_1.ConjunctVal({ peg: [meetAnchor, dataVal] }, ctx);
    const unified = aontu.unify(pair, undefined, ctx);
    const seen = new Set();
    const nils = (0, walk_1.collectNils)(unified, seen);
    for (const err of ctx.err) {
        if (true === err?.isNil && '|:trial-nil' !== err.why && !seen.has(err)) {
            seen.add(err);
            nils.push(err);
        }
    }
    const findings = nils.map((n) => {
        materialise(n, ctx);
        return findingOf(n, prov);
    });
    const genCtx = aontu.ctx({ collect: true });
    genCtx.root = unified;
    genCtx.probe = null != options.at;
    unified.gen(genCtx);
    for (const err of genCtx.err) {
        if ('incomplete' === err.class || 'conflict' === err.class) {
            materialise(err, genCtx);
            findings.push(findingOf(err, prov));
        }
    }
    findings.push(...lintFindings);
    for (const { val, path } of (0, utility_1.collectDeprecations)(unified)) {
        const v = val;
        // The same file/role projection sitesOf makes: the url as stamped
        // (empty when the value belongs to neither document), the role by
        // comparing it to the data document's.
        const file = v.site.url;
        findings.push({
            code: 'deprecated',
            class: 'compat',
            severity: 'warning',
            path: pathText(path),
            message: (0, utility_1.deprecationMessage)(v.deprecation),
            sites: [{
                    file: displayOf(file, roleOf(file, prov), prov),
                    row: v.site.row ?? -1,
                    col: v.site.col ?? -1,
                    len: v.site.len ?? -1,
                    role: roleOf(file, prov),
                    src: v.site.src ?? '',
                    value: v.canon,
                }],
        });
    }
    const keyed = findings.map((f, i) => ({ key: orderKey(f, i), finding: f }));
    keyed.sort((a, b) => a.key < b.key ? -1 : 1);
    let ordered = keyed.map((k) => k.finding);
    const causeKey = (f) => f.code + '\u0000' + f.sites.map((s) => [s.file, s.row, s.col, s.role, s.value].join('\u0000')).join('\u0000');
    const depth = (f) => f.path.split('.').length;
    const deepest = new Map();
    for (const f of ordered) {
        const cause = causeKey(f);
        const held = deepest.get(cause);
        if (null == held || depth(held) < depth(f)) {
            deepest.set(cause, f);
        }
    }
    const causes = new Set();
    ordered = ordered.filter((f) => {
        const cause = causeKey(f);
        if (causes.has(cause) || deepest.get(cause) !== f) {
            return false;
        }
        causes.add(cause);
        return true;
    });
    const truncated = maxErrors < ordered.length;
    const kept = truncated ? ordered.slice(0, maxErrors) : ordered;
    let verdict = 'valid';
    const errors = ordered.filter((f) => 'error' === f.severity);
    const unmet = errors.filter((f) => 'incomplete' === f.class).length;
    if (unmet < errors.length) {
        verdict = 'invalid';
    }
    else if (0 < unmet && true !== options.partial) {
        verdict = 'incomplete';
    }
    return {
        verdict, truncated, findings: kept,
        ...(null == coverage ? {} : { coverage }),
    };
}
//# sourceMappingURL=vet.js.map