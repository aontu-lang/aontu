"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unionRecords = unionRecords;
exports.recordLayers = recordLayers;
exports.riderText = riderText;
exports.rides = rides;
const keyorder_1 = require("./keyorder");
function unionRecords(records, key) {
    const sets = {};
    for (const r of records) {
        if (null == r) {
            continue;
        }
        for (const k of Object.keys(r)) {
            const set = sets[k] ?? (sets[k] = new Map());
            for (const v of r[k]) {
                if (!set.has(key(v))) {
                    set.set(key(v), v);
                }
            }
        }
    }
    const out = {};
    for (const k of Object.keys(sets).sort(keyorder_1.cmpCodePoint)) {
        const set = sets[k];
        out[k] = [...set.keys()].sort(keyorder_1.cmpCodePoint).map((s) => set.get(s));
    }
    return out;
}
function rides(v) {
    return null != v?.deprecation || null != v?.meta;
}
// The records a rider is written as: the first holds each key's first
// value, the second each key's second, so a reparse unions them back.
function recordLayers(rec) {
    const keys = Object.keys(rec).sort(keyorder_1.cmpCodePoint);
    const n = keys.reduce((m, k) => Math.max(m, rec[k].length), 0);
    const out = [];
    for (let i = 0; i < n; i++) {
        const layer = {};
        for (const k of keys.filter((k) => i < rec[k].length)) {
            layer[k] = rec[k][i];
        }
        out.push(layer);
    }
    return out;
}
function layerText(layer, text) {
    return '{' + Object.keys(layer)
        .map((k) => JSON.stringify(k) + ':' + text(layer[k])).join(',') + '}';
}
// A value's riders around its rendering: the deprecation record, then
// the annotation record, each as the reparseable call that carries it.
function riderText(s, v) {
    const d = v.deprecation;
    if (null != d) {
        const layers = recordLayers(d);
        s = 0 === layers.length ? 'deprecate(' + s + ')' : layers.reduce((acc, l) => 'deprecate(' + acc + ',' + layerText(l, (x) => JSON.stringify(x)) + ')', s);
    }
    const m = v.meta;
    if (null != m) {
        s = 'meta(' + [s, ...recordLayers(m).map((l) => layerText(l, (x) => x.canon))].join(',') + ')';
    }
    return s;
} /* node:coverage ignore next 8 */
//# sourceMappingURL=rider.js.map