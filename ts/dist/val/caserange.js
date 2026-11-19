"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.caseSpan = caseSpan;
exports.caseRange = caseRange;
exports.rangeArg = rangeArg;
const INDEX_MIN = -(2n ** 63n);
const INDEX_MAX = 2n ** 63n - 1n;
// The half-open code-point span [lo, hi) a (start, len) selects over a
// string of `n` code points.
function caseSpan(n, start, len) {
    const span = len < 0 ? n : len;
    if (0 <= start) {
        const lo = Math.min(start, n);
        return [lo, Math.min(lo + span, n)];
    }
    const hi = Math.max(0, n + start);
    return [Math.max(0, hi - span), hi];
}
// `text` with the selected run cased. Outside the run the source is
// returned verbatim, code point for code point.
function caseRange(text, start, len, up) {
    const cps = Array.from(text);
    const [lo, hi] = caseSpan(cps.length, start, len);
    if (hi <= lo) {
        return text;
    }
    const mid = cps.slice(lo, hi).join('');
    return cps.slice(0, lo).join('') +
        (up ? mid.toUpperCase() : mid.toLowerCase()) +
        cps.slice(hi).join('');
}
function rangeArg(v) {
    if (null == v) {
        return undefined;
    }
    const p = (true === v?.isScalar) ? v.peg : undefined;
    if ('number' === typeof p && Number.isInteger(p)) {
        return p;
    }
    // A biginteger is an index where it fits the integer leaf's magnitude,
    // so the integer and the biginteger of one value are one index. A value
    // too large for a number to hold exactly loses that exactness here, but
    // both ends clamp, so it indexes as it would exactly.
    if ('bigint' === typeof p && INDEX_MIN <= p && p <= INDEX_MAX) {
        return Number(p);
    }
    return NaN;
}
//# sourceMappingURL=caserange.js.map