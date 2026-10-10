"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unicodeProperty = unicodeProperty;
exports.union = union;
exports.complement = complement;
// The Unicode properties a pattern's \p{...} names in ECMA-262's u mode
// (ADR-060), read from the tables ts/scripts/unicodegen.cjs writes. A
// table is decoded the first time a pattern names it. Twin of
// go/uniprop.go.
const unicodeprops_1 = require("./unicodeprops");
const MAX = 0x10FFFF;
let tables;
function decode(data) {
    const out = [];
    let at = 0;
    let i = 0;
    const next = () => {
        let n = 0;
        let shift = 1;
        for (;;) {
            const d = A64.indexOf(data[i++]);
            n += (d & 31) * shift;
            if (0 === (d & 32)) {
                return n;
            }
            shift *= 32;
        }
    };
    while (i < data.length) {
        const lo = at + next();
        const hi = lo + next();
        out.push([lo, hi]);
        at = hi + 1;
    }
    return out;
}
const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function union(sets) {
    const out = [];
    for (const [lo, hi] of sets.flat().sort((a, b) => a[0] - b[0])) {
        const top = out[out.length - 1];
        if (undefined !== top && lo <= top[1] + 1) {
            top[1] = Math.max(top[1], hi);
        }
        else {
            out.push([lo, hi]);
        }
    }
    return out;
}
function complement(rs) {
    const out = [];
    let at = 0;
    for (const [lo, hi] of rs) {
        if (at < lo) {
            out.push([at, lo - 1]);
        }
        at = hi + 1;
    }
    if (at <= MAX) {
        out.push([at, MAX]);
    }
    return out;
}
function minus(a, b) {
    return complement(union([complement(a), b]));
}
function load() {
    const t = { byName: new Map(), scx: [], scxCache: new Map() };
    for (const line of unicodeprops_1.UNICODE_PROPS.split('\n')) {
        if ('' === line || line.startsWith('#')) {
            continue;
        }
        const [kind, names, data] = line.split('\t');
        const e = { kind, names: names.split(' '), data };
        if ('scx' === kind) {
            t.scx.push(e);
            continue;
        }
        for (const n of e.names) {
            t.byName.set(('gcg' === kind ? 'gc' : kind) + ':' + n, e);
        }
    }
    return t;
}
function rangesOf(t, e) {
    if (undefined !== e.ranges) {
        return e.ranges;
    }
    if ('gcg' === e.kind) {
        e.ranges = union(e.data.split(' ').map((v) => rangesOf(t, t.byName.get('gc:' + v))));
    }
    else if ('sc' === e.kind && 'Zzzz' === e.names[0]) {
        // Unknown is every code point no other script holds.
        const all = [...new Set(t.byName.values())].filter((x) => 'sc' === x.kind && x !== e);
        e.ranges = complement(union(all.map((x) => rangesOf(t, x))));
    }
    else {
        e.ranges = decode(e.data);
    }
    return e.ranges;
}
// A script's Script_Extensions: its own code points where
// ScriptExtensions.txt says nothing, and each set the file names it in.
function extensionsOf(t, e) {
    const had = t.scxCache.get(e.names[0]);
    if (undefined !== had) {
        return had;
    }
    t.scxAll ??= union(t.scx.map((x) => rangesOf(t, x)));
    const out = union([minus(rangesOf(t, e), t.scxAll),
        ...t.scx.filter((x) => x.names.includes(e.names[0])).map((x) => rangesOf(t, x))]);
    t.scxCache.set(e.names[0], out);
    return out;
}
const OWN = new Map([['ASCII', [[0, 0x7F]]], ['Any', [[0, MAX]]]]);
// The code points of \p{name} or \p{name=value}, or undefined where
// ECMA-262's lists hold no such property or value. Names are exact.
function unicodeProperty(name, value) {
    const t = (tables ??= load());
    const get = (kind, n) => {
        const e = t.byName.get(kind + ':' + n);
        return undefined === e ? undefined : rangesOf(t, e);
    };
    if (undefined === value) {
        if ('Assigned' === name) {
            return complement(get('gc', 'Cn'));
        }
        return OWN.get(name) ?? get('gc', name) ?? get('bin', name);
    }
    if ('General_Category' === name || 'gc' === name) {
        return get('gc', value);
    }
    if ('Script' === name || 'sc' === name) {
        return get('sc', value);
    }
    if ('Script_Extensions' === name || 'scx' === name) {
        const e = t.byName.get('sc:' + value);
        return undefined === e ? undefined : extensionsOf(t, e);
    }
    return undefined;
} /* node:coverage ignore next 9 */
//# sourceMappingURL=uniprop.js.map