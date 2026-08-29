"use strict";
/* Copyright (c) 2023-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.items = items;
exports.propagateMarks = propagateMarks;
exports.constantIdFunc = constantIdFunc;
exports.canonRiders = canonRiders;
exports.collectDeprecations = collectDeprecations;
exports.walkBagVals = walkBagVals;
exports.deprecationMessage = deprecationMessage;
exports.formatPath = formatPath;
exports.walk = walk;
exports.explainOpen = explainOpen;
exports.ec = ec;
exports.explainClose = explainClose;
exports.formatExplain = formatExplain;
// Default walk() depth limit. High enough that real configs are never
// silently truncated (the old default of 32 dropped marks on deeply
// nested refs/funcs → wrong output), while still bounding runaway or
// accidentally-cyclic walks (walk has no cycle detection). Pass null for
// truly unbounded.
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
// Collect every value in the tree carrying the deprecation record (G3
// phase 4), with its path — the one walk behind vet's `deprecated`
// warnings and the LSP's Deprecated tags. The record travels on meets
// (the unite rider) and clones, so this sees the declaration and every
// use resolving through it. The non-Val guard is for a bag's raw peg
// entries, which degenerate parses can leave behind.
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
    const msg = 'string' === typeof d.msg ? d.msg : '';
    return 'deprecated' + ('' === msg ? '' : ': ' + msg) +
        ('string' === typeof d.use ? ' (use ' + d.use + ')' : '') +
        ('string' === typeof d.since ? ' (since ' + d.since + ')' : '');
}
// SPREAD TEMPLATES MAY NOT STAMP ONE ID ONTO EVERY CHILD (G4 phase
// 1, clearing rule 3). `&: id(svc_thing) & {…}` says that every child
// of the bag IS the entity `svc_thing`, and the identity merge then
// unifies all of them into one another: an author who wrote a
// per-child template would get a single merged blob, and any two
// children that disagreed about a field would fail at a site that
// explains nothing.
//
// A PATH-DEPENDENT argument is allowed, and is how the author says
// what they meant: `&: id(key()) & {…}` names each child distinctly,
// resolved per destination by the existing spreadClone machinery.
// Duck-typed on the `isIdFunc` flag rather than imported: this file
// is below the Val classes, and the identity function sits above
// them.
function constantIdFunc(v, seen) {
    if (null == v || true !== v.isVal) {
        return undefined;
    }
    const s = seen ?? new Set();
    if (s.has(v)) {
        return undefined;
    }
    s.add(v);
    if (true === v.isIdFunc && true !== v.isPathDependent) {
        return v;
    }
    const peg = v.peg;
    if (null != peg && 'object' === typeof peg) {
        for (const k of Object.keys(peg)) {
            const found = constantIdFunc(peg[k], s);
            if (undefined !== found) {
                return found;
            }
        }
    }
    return constantIdFunc(v.spread?.cj, s);
}
// The IDENTITY wrapper (G4 phase 1): `id("svc_auth")&{…}`, written
// as the conjunct an author writes, so canon reparses to the same
// entity. This deliberately differs from the type/hide MARKS, which
// canon drops (test/spec/marks.tsv, row `type-canon`): identity is
// semantic content, and G6's canon-hash must see it — two documents
// that disagree about which entity a node IS do not mean the same
// thing and must not hash alike.
//
// The name is JSON-quoted whatever it spells: `-` is not a bare-text
// character (test/spec/op-chars.tsv pins `a:6-2` as a parse error), so
// an unquoted `id(team-pay)` would not reparse.
function canonEntity(v) {
    const c = v.canon;
    const e = v.entity;
    return null == e ? c : 'id(' + JSON.stringify(e) + ')&' + c;
}
// The canonical form of a value, wrapped in the RIDERS it carries —
// the identity (G4 phase 1) and the deprecation record (G3 phase 4) —
// reparseably, so `id(name) & x` and `deprecate(x, m)` survive canon.
// Bags render their children through this (MapVal/ListVal canon),
// which is where a marked FIELD — the realistic case — lives.
//
// The riders render HERE and not in the value's own `canon` for the
// same reason the guard at the MapVal call site tests the isVal flag:
// a bag's canon recursion visits each child once, and a child that
// wrapped itself as well would render its subtree twice per level —
// 2^depth on a nested document.
function canonRiders(v) {
    const c = canonEntity(v);
    const d = v.deprecation;
    if (null == d) {
        return c;
    }
    const keys = Object.keys(d).sort();
    const rec = keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(d[k])).join(',');
    return 'deprecate(' + c + ('' === rec ? '' : ',{' + rec + '}') + ')';
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
} /* node:coverage ignore next 18 */
//# sourceMappingURL=utility.js.map