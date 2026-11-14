"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.genWrite = genWrite;
const err_1 = require("../err");
const Decimal_1 = require("./Decimal");
// The whole number nearest `c / 10 ^ drop`, a tie to the even one.
function roundHalfEven(c, drop) {
    const d = 10n ** BigInt(drop);
    const q = c / d;
    const twice = 2n * (c % d);
    return twice < d ? q : d < twice ? q + 1n : 0n === q % 2n ? q : q + 1n;
}
function roundDigits(c, e, n) {
    const mag = c < 0n ? -c : c;
    const drop = mag.toString().length - n;
    if (drop <= 0) {
        return [c, e];
    }
    const r = roundHalfEven(mag, drop);
    return [c < 0n ? -r : r, e + drop];
}
// A float is read as the decimal it shows and written as the double
// nearest the rounded one, which is an infinity where there is none.
function significant(v, native, n) {
    if (true === v.isBigDecimal) {
        const [c, e] = roundDigits(native.unscaled, -native.scale, n);
        return new Decimal_1.Decimal(c, -e);
    }
    if (true === v.isBigInteger || true === v.isInteger) {
        const [c, e] = roundDigits(BigInt(native), 0, n);
        const whole = c * 10n ** BigInt(e);
        return true === v.isInteger && Number.isSafeInteger(Number(whole)) ? Number(whole) : whole;
    }
    const [mant, exp] = native.toExponential().split('e');
    const digits = mant.replace('-', '').replace('.', '');
    const [c, e] = roundDigits(BigInt(digits) * (native < 0 ? -1n : 1n), Number(exp) - digits.length + 1, n);
    return Number(c.toString() + 'e' + e);
}
function genWrite(ctx, v, native) {
    const n = v.genopts.significant;
    if ('number' !== typeof n) {
        return native;
    }
    const out = significant(v, native, n);
    if ('number' === typeof out && !Number.isFinite(out)) {
        const nil = (0, err_1.makeNilErr)(ctx, 'float_overflow', v);
        (0, err_1.descErr)(nil, ctx);
        ctx?.adderr(nil);
        if (null == ctx || !ctx.collect) {
            throw new err_1.AontuError(nil.msg, [nil]);
        }
        return undefined;
    }
    return out;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=genwrite.js.map