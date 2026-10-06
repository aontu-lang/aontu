"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decimal = exports.DECIMAL_SCALE_BUDGET = exports.DECIMAL_COEFFICIENT_BUDGET = exports.BIG_LITERAL_RE = void 0;
exports.decimalOverBudget = decimalOverBudget;
exports.readBigLiteral = readBigLiteral;
exports.readExactNumber = readExactNumber;
const numkind_1 = require("./numkind");
const DECIMAL_COEFFICIENT_BUDGET = 4096;
exports.DECIMAL_COEFFICIENT_BUDGET = DECIMAL_COEFFICIENT_BUDGET;
const DECIMAL_SCALE_BUDGET = 4096;
exports.DECIMAL_SCALE_BUDGET = DECIMAL_SCALE_BUDGET;
function pow10(n) {
    return 10n ** BigInt(n);
}
function overBudget(coeffDigits, scale) {
    return DECIMAL_COEFFICIENT_BUDGET < coeffDigits ||
        !(Math.abs(scale) <= DECIMAL_SCALE_BUDGET);
}
// The decimal digit count of a coefficient, sign ignored (zero counts as
// one digit). Only the budget test needs it.
function coeffDigits(unscaled) {
    return (unscaled < 0n ? -unscaled : unscaled).toString().length;
}
class Decimal {
    constructor(unscaled, scale) {
        let u = unscaled;
        let s = Math.trunc(scale);
        if (0n === u) {
            s = 1;
        }
        else {
            // Strip the trailing zeros that scale-as-presentation would
            // otherwise smuggle into identity (`0d0.10` -> `0d0.1`)...
            while (1 < s && 0n === u % 10n) {
                u /= 10n;
                s--;
            }
            // ...and fold a negative scale (an exponent) back up to the one
            // decimal place the leaf marker requires (`0d1e3` -> 10000/10^1).
            if (s < 1) {
                u *= pow10(1 - s);
                s = 1;
            }
        }
        this.unscaled = u;
        this.scale = s;
    }
    // Exact numeric equality. Both operands are normalised by
    // construction, so equal values have equal fields -- this is value
    // comparison, never object identity (D2).
    equals(peer) {
        return this.unscaled === peer.unscaled && this.scale === peer.scale;
    }
    // Exact ordering: -1, 0 or 1. Compares on a common scale, so no
    // float64 ever touches the operands.
    compare(peer) {
        let a = this.unscaled;
        let b = peer.unscaled;
        if (this.scale < peer.scale) {
            a *= pow10(peer.scale - this.scale);
        }
        else if (peer.scale < this.scale) {
            b *= pow10(this.scale - peer.scale);
        }
        return a < b ? -1 : a > b ? 1 : 0;
    }
    negate() {
        return new Decimal(-this.unscaled, this.scale);
    }
    add(peer) {
        const scale = this.scale < peer.scale ? peer.scale : this.scale;
        const a = this.unscaled * pow10(scale - this.scale);
        const b = peer.unscaled * pow10(scale - peer.scale);
        return new Decimal(a + b, scale);
    }
    multiply(peer) {
        return new Decimal(this.unscaled * peer.unscaled, this.scale + peer.scale);
    }
    ceil() {
        return new Decimal(this.intPart(1n), 0);
    }
    floor() {
        return new Decimal(this.intPart(-1n), 0);
    }
    intPart(dir) {
        const p = pow10(this.scale);
        const q = this.unscaled / p;
        const r = this.unscaled % p;
        return 0n !== r && (0n < r) === (0n < dir) ? q + dir : q;
    }
    isZero() {
        return 0n === this.unscaled;
    }
    toString() {
        const neg = this.unscaled < 0n;
        let d = (neg ? -this.unscaled : this.unscaled).toString();
        if (d.length <= this.scale) {
            d = '0'.repeat(this.scale - d.length + 1) + d;
        }
        const cut = d.length - this.scale;
        return (neg ? '-' : '') + d.slice(0, cut) + '.' + d.slice(cut);
    }
    // Canon rendering: the sign goes BEFORE the marker (`-0d1.5`), because
    // `0d-1.5` is not a literal this language accepts.
    canon() {
        const neg = this.unscaled < 0n;
        return (neg ? '-0d' : '0d') + (neg ? this.negate() : this).toString();
    }
    static fromString(src) {
        const m = /^([-+]?)(?:0[dD])?([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$/
            .exec(src);
        if (null == m) {
            throw new Error('not-decimal: ' + src);
        }
        const frac = m[3] ?? '';
        const exp = null == m[4] ? 0 : Number(m[4]);
        const scale = frac.length - exp;
        if (overBudget(m[2].length + frac.length, scale)) {
            throw new Error('decimal-budget: ' + src);
        }
        const unscaled = BigInt(m[2] + frac);
        return new Decimal('-' === m[1] ? -unscaled : unscaled, scale);
    }
}
exports.Decimal = Decimal;
function decimalOverBudget(d) {
    return overBudget(coeffDigits(d.unscaled), d.scale);
}
const BIG_LITERAL_RE = /^0[dD]([0-9](?:_?[0-9])*)(?:\.([0-9](?:_?[0-9])*))?(?:[eE]([-+]?[0-9](?:_?[0-9])*))?/;
exports.BIG_LITERAL_RE = BIG_LITERAL_RE;
function stripSep(s) {
    return -1 === s.indexOf('_') ? s : s.replace(/_/g, '');
}
function readBigLiteral(m) {
    const intd = stripSep(m[1]);
    const fracd = null == m[2] ? undefined : stripSep(m[2]);
    const expd = null == m[3] ? undefined : stripSep(m[3]);
    // Leaf by SOURCE, not by value.
    if (undefined === fracd && undefined === expd) {
        return { leaf: 'biginteger', int: BigInt(intd) };
    }
    const exp = undefined === expd ? 0 : Number(expd);
    const fracLen = undefined === fracd ? 0 : fracd.length;
    const scale = fracLen - exp;
    if (overBudget(intd.length + fracLen, scale)) {
        return { leaf: 'error', code: 'decimal_budget' };
    }
    return {
        leaf: 'bigdecimal',
        dec: new Decimal(BigInt(intd + (fracd ?? '')), scale),
    };
}
// `--exact-numbers`: a plain literal read by the VALUE its digits spell,
// where readBigLiteral reads a `0d` literal by its spelling. An integral
// value is an integer while that leaf stores it and a biginteger beyond;
// any other value is a bigdecimal, under the bigdecimal's budget.
function readExactNumber(intd, fracd, expd) {
    const exp = undefined === expd ? 0 : Number(expd);
    const scale = fracd.length - exp;
    if (overBudget(intd.length + fracd.length, scale)) {
        return { leaf: 'error', code: 'decimal_budget' };
    }
    const unscaled = BigInt(intd + fracd);
    const p = pow10(scale < 0 ? 0 : scale);
    if (0n !== unscaled % p) {
        return { leaf: 'bigdecimal', dec: new Decimal(unscaled, scale) };
    }
    const int = scale < 0 ? unscaled * pow10(-scale) : unscaled / p;
    return (0, numkind_1.isIntegerStorable)(int) ?
        { leaf: 'integer', int } : { leaf: 'biginteger', int };
} /* node:coverage ignore next 14 */
//# sourceMappingURL=Decimal.js.map