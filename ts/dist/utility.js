"use strict";
/* Copyright (c) 2023-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.includeOpts = includeOpts;
exports.items = items;
exports.propagateMarks = propagateMarks;
exports.canonRiders = canonRiders;
exports.bareTop = bareTop;
exports.hasRiders = hasRiders;
exports.unionRider = unionRider;
exports.carryRiders = carryRiders;
exports.wrapRiders = wrapRiders;
exports.collectDeprecations = collectDeprecations;
exports.walkBagVals = walkBagVals;
exports.deprecationMessage = deprecationMessage;
exports.formatPath = formatPath;
exports.walk = walk;
exports.explainOpen = explainOpen;
exports.ec = ec;
exports.explainClose = explainClose;
exports.formatExplain = formatExplain;
const keyorder_1 = require("./keyorder");
function includeOpts(options) {
    return {
        ...(null == options.trust ? {} : { trust: options.trust }),
        ...(null == options.textExt || 0 === options.textExt.length
            ? {} : { textExt: options.textExt }),
    };
}
const WALK_DEFAULT_MAXDEPTH = 9999;
// Mark value in source is propagated to target (true ratchets).
function propagateMarks(source, target) {
    // Don't infect top!
    if (source.isTop || target.isTop) {
        return;
    }
    for (let name in source.mark) {
        target.mark[name] = target.mark[name] || source.mark[name];
    }
}
function collectDeprecations(root) {
    const out = [];
    walkBagVals(root, (v, path) => {
        if (null != v.deprecation) {
            out.push({ val: v, path });
        }
    });
    return out;
}
// Visit every Val reachable through bag children, with its path — the
// walk under collectDeprecations and vet's default-validity lint. The
// non-Val guard is for a bag's raw peg entries, which degenerate
// parses can leave behind (pinned by the collect-deprecations direct
// test, ts/test/coverage3.test.ts).
function walkBagVals(root, fn) {
    const walk = (v, path) => {
        if (null == v || true !== v.isVal) {
            return;
        }
        fn(v, path);
        if ((true === v.isMap || true === v.isList) && null != v.peg) {
            for (const k of Object.keys(v.peg)) {
                walk(v.peg[k], [...path, k]);
            }
        }
    };
    walk(root, []);
}
// The one-line prose for a deprecation record, shared by vet's warning
// findings and the LSP's tagged diagnostics.
function deprecationMessage(d) {
    const msg = (d.msg ?? []).join('; ');
    return 'deprecated' + ('' === msg ? '' : ': ' + msg) +
        (null != d.use ? ' (use ' + d.use.join('; ') + ')' : '') +
        (null != d.since ? ' (since ' + d.since.join('; ') + ')' : '');
}
// A rider's meet: key by key, the union of their value sets, kept
// sorted by canon so that the meet commutes.
function unionRider(a, b, canon) {
    if (null == a || null == b || a === b) {
        return a ?? b;
    }
    const out = { ...a };
    for (const k of Object.keys(b)) {
        const byCanon = new Map();
        for (const t of [...(a[k] ?? []), ...b[k]]) {
            byCanon.set(canon(t), byCanon.get(canon(t)) ?? t);
        }
        out[k] = [...byCanon.keys()].sort(keyorder_1.cmpCodePoint)
            .map((c) => byCanon.get(c));
    }
    return out;
}
// A rider written as records, the i-th holding each key's i-th value,
// which a reparse unions back to the same rider.
function riderLayers(r, render) {
    const keys = Object.keys(r).sort();
    const out = [];
    for (let i = 0; keys.some((k) => i < r[k].length); i++) {
        out.push('{' + keys.filter((k) => i < r[k].length).map((k) => JSON.stringify(k) + ':' + render(r[k][i])).join(',') + '}');
    }
    return out;
}
// The riders of a meet's operands land on its result.
function carryRiders(out, a, b) {
    const d = unionRider(unionRider(out.deprecation, a?.deprecation, String), b?.deprecation, String);
    if (d !== out.deprecation) {
        out.deprecation = d;
    }
    const canon = (m) => m.canon;
    const m = unionRider(unionRider(out.meta, a?.meta, canon), b?.meta, canon);
    if (m !== out.meta) {
        out.meta = m;
    }
    const i = unionRider(unionRider(out.identity, a?.identity, String), b?.identity, String);
    if (i !== out.identity) {
        out.identity = i;
    }
}
function wrapRiders(c, v) {
    const d = v.deprecation;
    if (null != d) {
        const ls = riderLayers(d, (s) => JSON.stringify(s));
        c = 0 === ls.length ? 'deprecate(' + c + ')' :
            ls.reduce((s, l) => 'deprecate(' + s + ',' + l + ')', c);
    }
    if (null != v.meta) {
        c = 'meta(' + [c, ...riderLayers(v.meta, (m) => m.canon)].join(',') + ')';
    }
    return c;
}
function hasRiders(v) {
    return null != v?.meta || null != v?.deprecation || null != v?.identity;
}
// A top a meet may pass over: one that carries a rider carries it into
// whatever it meets, so it has to be met.
function bareTop(v) {
    return true === v?.isTop && !hasRiders(v);
}
function canonRiders(v) {
    return wrapRiders(v.canon, v);
}
function formatPath(path, absolute) {
    let parts;
    if (Array.isArray(path)) {
        parts = path;
    }
    else {
        parts = path.path;
    }
    let pathstr = (0 < parts.length && false !== absolute ? '$.' : '') + parts.join('.');
    return pathstr;
}
/**
 * Walk a Val structure depth first, applying functions before and after descending.
 * Only traverses Val instances - stops at non-Val children.
 */
function walk(
// These arguments are the public interface.
val, 
// Before descending into a node.
before, 
// After descending into a node.
after, 
// Maximum recursive depth, default: WALK_DEFAULT_MAXDEPTH. Use null for
// infinite depth.
maxdepth, 
// These arguments are used for recursive state.
key, parent, path) {
    let out = null == before ? val : before(key, val, parent, path || []);
    maxdepth = null != maxdepth && 0 <= maxdepth ? maxdepth : WALK_DEFAULT_MAXDEPTH;
    if (null != maxdepth && 0 === maxdepth) {
        return out;
    }
    if (null != path && null != maxdepth && 0 < maxdepth && maxdepth <= path.length) {
        return out;
    }
    const child = out.peg;
    // Container Vals (Map etc) have peg = plain {} or []
    if (null != child && !child.isVal) {
        // A ListVal's array peg is an object too, and for-in yields its
        // indices as string keys, so this one loop covers both bag shapes.
        if ('object' === typeof child) {
            for (let ckey in child) {
                if (child[ckey] && child[ckey].isVal) {
                    child[ckey] = walk(child[ckey], before, after, maxdepth, ckey, out, [...(path || []), ckey]);
                }
            }
        }
    }
    out = null == after ? out : after(key, out, parent, path || []);
    return out;
}
const T_NOTE = 0;
const T_WHY = 1;
const T_PATH = 2;
const T_AVAL = 3;
const T_BVAL = 4;
const T_OVAL = 5;
const T_CHILDREN = 6;
function explainOpen(ctx, t, note, ac, bc) {
    if (false === t)
        return null;
    t = t ?? [null, 'root', null, null, null, null];
    t[T_WHY] = t[T_WHY] ?? '';
    t[T_NOTE] = (0 <= ctx.cc ? ctx.cc + '~' : '') + note;
    t[T_PATH] = ['$', ctx.path.join('.')].filter(p => '' != p).join('.') + '  ';
    if (ac) {
        t[T_AVAL] = ac.id + (ac.done ? '' : '!') + '=' + ac.canon;
    }
    if (bc) {
        t[T_BVAL] = bc.id + (bc.done ? '' : '!') + '=' + bc.canon;
    }
    return t;
}
function ec(t, why) {
    if (null == t)
        return;
    const child = [null, why, null, null, null, null];
    t[T_CHILDREN] = t[T_CHILDREN] ?? [];
    t[T_CHILDREN].push(child);
    return child;
}
function explainClose(t, out) {
    if (null == t)
        return;
    if (out) {
        t[T_OVAL] = '-> ' + out.id + (out.done ? '' : '!') + '=' + out.canon;
    }
}
function formatExplain(t, d) {
    d = null == d ? 0 : d;
    const indent = ('  '.repeat(d));
    if (Array.isArray(t)) {
        const b = [
            indent + t.slice(0, t.length - 1).join(' ')
        ];
        const children = t[t.length - 1];
        if (Array.isArray(children)) {
            for (let ce of children) {
                b.push(formatExplain(ce, d + 1));
            }
        }
        return b.join('\n');
    }
    else {
        return indent + t;
    }
}
function items(o) {
    if (Array.isArray(o)) {
        return o.map((n, i) => ([i, n]));
    }
    else if (null != o && 'object' === typeof o) {
        return Object.entries(o);
    }
    else {
        return [];
    }
} /* node:coverage ignore next 25 */
//# sourceMappingURL=utility.js.map