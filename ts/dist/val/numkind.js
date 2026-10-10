"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exactNumberText = exactNumberText;
exports.integerDigits = integerDigits;
exports.isExactInBinary64 = isExactInBinary64;
exports.isIntegerKind = isIntegerKind;
exports.isIntegerStorable = isIntegerStorable;
exports.isLossyIntegerLiteral = isLossyIntegerLiteral;
exports.readExactNumber = readExactNumber;
const INT64_MIN = -9223372036854775808.0;
const INT64_LIMIT = 9223372036854775808.0;
function isIntegerKind(n, src) {
    if (null != src && src.includes('.')) {
        return false;
    }
    return Number.isInteger(n) && INT64_MIN <= n && n < INT64_LIMIT;
}
const INT64_MIN_EXACT = -9223372036854775808n;
const INT64_LIMIT_EXACT = 9223372036854775808n;
function isIntegerStorable(n) {
    return INT64_MIN_EXACT <= n && n < INT64_LIMIT_EXACT &&
        isExactInBinary64(n);
}
function isExactInBinary64(n) {
    const d = Number(n);
    return Number.isFinite(d) && BigInt(d) === n;
}
function isLossyIntegerLiteral(n, src) {
    if (null == src) {
        return false;
    }
    if (Number.isInteger(n) && -POW53 < n && n < POW53) {
        return false;
    }
    if (-1 !== src.indexOf('.')) {
        return false;
    }
    let exact;
    const dec = DEC_INT_LITERAL_RE.exec(src);
    if (null != dec) {
        // A negative exponent does not denote an integer -- out of scope.
        const exp = null == dec[3] ? 0 : Number(stripSep(dec[3]));
        if (!(0 <= exp) || !Number.isFinite(exp)) {
            return false;
        }
        const coeff = BigInt(stripSep(dec[2]));
        if (0n === coeff) {
            return false;
        }
        if (MAX_EXPONENT < exp) {
            return true;
        }
        exact = coeff * 10n ** BigInt(exp);
    }
    else {
        const base = BASE_INT_LITERAL_RE.exec(src);
        if (null == base) {
            return false;
        }
        exact = BigInt('0' + base[2].toLowerCase() + stripSep(base[3]));
    }
    return !isExactInBinary64(exact);
}
// `[+-]? digits [ (e|E) [+-] digits ]`, with the landed single-`_`-
// between-digits separator rule. No `.`: that is a float source (R1).
const DEC_INT_LITERAL_RE = /^([-+]?)([0-9](?:_?[0-9])*)(?:[eE]([-+]?[0-9](?:_?[0-9])*))?$/;
const BASE_INT_LITERAL_RE = /^([-+]?)0([xXoObB])([0-9a-fA-F](?:_?[0-9a-fA-F])*)$/;
// Above this the value cannot be finite in binary64, so it cannot be
// exact either, and 10n ** BigInt(exp) must not be built.
const MAX_EXPONENT = 400;
// 2^53, the point at which the integers stop being contiguous in
// binary64 and so the first magnitude at which a literal can be lossy.
const POW53 = 9007199254740992;
function stripSep(s) {
    return -1 === s.indexOf('_') ? s : s.replace(/_/g, '');
}
function integerDigits(peg) {
    return BigInt(peg).toString();
}
const JSON_NUMBER_RE = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$/;
const EXACT_BUDGET = 4096n;
// The integer leaf by MAGNITUDE, so that a sign, which aontu writes as an
// operator, never moves a value between leaves: -2^63 is a biginteger,
// because 2^63 is one.
function inIntegerLeaf(n) {
    const mag = n < 0n ? -n : n;
    return mag < INT64_LIMIT_EXACT && isExactInBinary64(mag);
}
function readExactNumber(src) {
    const m = JSON_NUMBER_RE.exec(src);
    if (null == m) {
        return undefined;
    }
    const frac = m[3] ?? '';
    let unscaled = BigInt(m[2] + frac);
    let scale = BigInt(frac.length) - BigInt(m[4] ?? '0');
    if (0n === unscaled) {
        return { leaf: 'integer', int: 0 };
    }
    while (0n < scale && 0n === unscaled % 10n) {
        unscaled /= 10n;
        scale--;
    }
    const neg = '-' === m[1];
    if (scale <= 0n) {
        if (EXACT_BUDGET < -scale) {
            return { leaf: 'error', code: 'decimal_budget' };
        }
        const whole = unscaled * 10n ** -scale;
        const n = neg ? -whole : whole;
        return inIntegerLeaf(n) ? { leaf: 'integer', int: Number(n) } :
            { leaf: 'biginteger', int: n };
    }
    if (EXACT_BUDGET < scale || EXACT_BUDGET < BigInt(unscaled.toString().length)) {
        return { leaf: 'error', code: 'decimal_budget' };
    }
    return { leaf: 'bigdecimal', scale: Number(scale), unscaled: neg ? -unscaled : unscaled };
}
// The aontu literal for an exact number: plain digits in the integer
// leaf, `0d` digits beyond and a `0d` decimal otherwise, sign first.
function exactNumberText(n) {
    if ('integer' === n.leaf) {
        return integerDigits(n.int);
    }
    if ('biginteger' === n.leaf) {
        return n.int < 0n ? '-0d' + (-n.int).toString() : '0d' + n.int.toString();
    }
    if ('bigdecimal' === n.leaf) {
        const neg = n.unscaled < 0n;
        const digits = (neg ? -n.unscaled : n.unscaled).toString();
        const whole = digits.length <= n.scale ?
            '0.' + '0'.repeat(n.scale - digits.length) + digits :
            digits.slice(0, digits.length - n.scale) + '.' +
                digits.slice(digits.length - n.scale);
        return (neg ? '-0d' : '0d') + whole;
    }
    return undefined;
} /* node:coverage ignore next 16 */
//# sourceMappingURL=numkind.js.map