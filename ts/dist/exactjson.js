"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exactJSON = exactJSON;
const Decimal_1 = require("./val/Decimal");
const err_1 = require("./err");
const keyorder_1 = require("./keyorder");
// JS leaves U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR)
// literal in a JSON string; Go's encoder escapes them. Byte parity wins.
const LSPS_RE = new RegExp('[\u2028\u2029]', 'g');
function indentUnit(indent) {
    if ('number' === typeof indent) {
        const n = Math.min(10, Math.floor(indent));
        return 0 < n ? ' '.repeat(n) : '';
    }
    if ('string' === typeof indent) {
        return indent.slice(0, 10);
    }
    return '';
}
function quote(s) {
    const out = JSON.stringify(s);
    // A raw separator can only appear as itself in the output (never
    // inside an escape), so a straight replace is safe.
    return out.replace(LSPS_RE, (c) => '\u2028' === c ? '\\u2028' : '\\u2029');
}
function skipped(v) {
    return undefined === v || 'function' === typeof v || 'symbol' === typeof v;
}
function emit(v, unit, pad, seen) {
    if (null === v) {
        return 'null';
    }
    const t = typeof v;
    if ('string' === t) {
        return quote(v);
    }
    if ('number' === t) {
        // JSON has no NaN, no Infinity and no negative zero: JSON.stringify
        // writes `null` for the first two and `0` for the last, and gen()
        // has already normalised -0 away (R2).
        return JSON.stringify(v);
    }
    if ('bigint' === t) {
        // THE POINT OF THIS MODULE: exact digits, as a raw JSON number.
        return v.toString();
    }
    if ('boolean' === t) {
        return v ? 'true' : 'false';
    }
    if (skipped(v)) {
        return 'null';
    }
    // Before any other object handling: a Decimal is a value, not a
    // structure, and its plain digit form is the JSON number.
    if (v instanceof Decimal_1.Decimal) {
        return v.toString();
    }
    if (JSON.isRawJSON(v)) {
        return v.rawJSON;
    }
    if ('object' === t && 'function' === typeof v.toJSON) {
        return emit(v.toJSON(), unit, pad, seen);
    }
    if (seen.has(v)) {
        throw new err_1.AontuError('aontu: cannot convert circular structure to JSON');
    }
    seen.add(v);
    const inner = pad + unit;
    const nl = '' === unit ? '' : '\n';
    let out;
    if (Array.isArray(v)) {
        if (0 === v.length) {
            out = '[]';
        }
        else {
            const parts = v.map((e) => inner + emit(skipped(e) ? null : e, unit, inner, seen));
            out = '[' + nl + parts.join(',' + nl) + nl + pad + ']';
        }
    }
    else {
        const colon = '' === unit ? ':' : ': ';
        const parts = [];
        for (const k of Object.keys(v).sort(keyorder_1.cmpCodePoint)) {
            const cv = v[k];
            if (skipped(cv)) {
                continue;
            }
            parts.push(inner + quote(k) + colon + emit(cv, unit, inner, seen));
        }
        out = 0 === parts.length ? '{}' :
            '{' + nl + parts.join(',' + nl) + nl + pad + '}';
    }
    seen.delete(v);
    return out;
}
function exactJSON(value, indent) {
    return emit(value, indentUnit(indent), '', new Set());
} /* node:coverage ignore next 6 */
//# sourceMappingURL=exactjson.js.map