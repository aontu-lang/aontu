"use strict";
/* Copyright (c) 2024-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlusOpVal = void 0;
exports.plusText = plusText;
const err_1 = require("../err");
const IntegerVal_1 = require("../val/IntegerVal");
const NumberVal_1 = require("../val/NumberVal");
const StringVal_1 = require("../val/StringVal");
const BooleanVal_1 = require("../val/BooleanVal");
const ListVal_1 = require("../val/ListVal");
const BigIntegerVal_1 = require("../val/BigIntegerVal");
const BigDecimalVal_1 = require("../val/BigDecimalVal");
const Decimal_1 = require("../val/Decimal");
const numkind_1 = require("../val/numkind");
const numkind_2 = require("../val/numkind");
const OpBaseVal_1 = require("./OpBaseVal");
const EXACT_RANK = {
    integer: 1,
    biginteger: 2,
    bigdecimal: 3,
};
function isBig(k) {
    return 'biginteger' === k || 'bigdecimal' === k;
}
function operand(v) {
    while (v?.isPref) {
        v = v.peg;
    }
    return v;
}
// The operand's LEAF, not the JavaScript type of its peg: integer and
// float share `number`, while the exact leaves are told apart from each
// other and from everything else by their own flags. The whole ladder in
// `operate` dispatches on this and never on `typeof`.
function opkind(v) {
    if (!(v?.isVal && v.isScalar)) {
        return undefined;
    }
    if (v.isBigInteger) {
        return 'biginteger';
    }
    if (v.isBigDecimal) {
        return 'bigdecimal';
    }
    if (v.isInteger) {
        return 'integer';
    }
    const t = typeof v.peg;
    return 'number' === t ? 'float' :
        'string' === t ? 'string' :
            'boolean' === t ? 'boolean' :
                undefined;
}
function plusText(v) {
    const o = operand(v);
    const k = opkind(o);
    return undefined === k ? undefined : digits(o, k);
}
class PlusOpVal extends OpBaseVal_1.OpBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPlusOp = true;
    }
    make(_ctx, spec) {
        return new PlusOpVal(spec);
    }
    opname() {
        return 'plus';
    }
    operate(ctx, args) {
        const av = operand(args[0]);
        const bv = operand(args[1]);
        // ABSENCE PROPAGATES.
        if (true === av?.isAbsent) {
            return av;
        }
        if (true === bv?.isAbsent) {
            return bv;
        }
        // Lists concatenate.
        if (true === av?.isList && true === bv?.isList) {
            const peg = [...av.peg, ...bv.peg].map((v, i) => v.clone(ctx.descend(String(i))));
            return new ListVal_1.ListVal({ peg }, ctx);
        }
        const ak = opkind(av);
        const bk = opkind(bv);
        if (undefined === ak || undefined === bk) {
            return undefined;
        }
        if ('boolean' === ak && 'boolean' === bk) {
            return new BooleanVal_1.BooleanVal({ peg: av.peg || bv.peg });
        }
        if ('string' === ak || 'string' === bk) {
            return new StringVal_1.StringVal({ peg: digits(av, ak) + digits(bv, bk) });
        }
        // A boolean mixed with a number does not coerce (no JS 0/1).
        if ('boolean' === ak || 'boolean' === bk) {
            return undefined;
        }
        if (('float' === ak && isBig(bk)) || (isBig(ak) && 'float' === bk)) {
            return (0, err_1.makeNilErr)(ctx, 'exact_float_mix', this, undefined, 'add', { left: ak, right: bk });
        }
        if ('float' === ak || 'float' === bk) {
            const sum = av.peg + bv.peg;
            return Number.isFinite(sum) ?
                new NumberVal_1.NumberVal({ peg: sum }) :
                (0, err_1.makeNilErr)(ctx, 'float_overflow', this, undefined, 'add');
        }
        // Both operands are on the exact ladder: promote to the widest.
        const rank = EXACT_RANK[bk] < EXACT_RANK[ak] ? EXACT_RANK[ak] : EXACT_RANK[bk];
        if (EXACT_RANK.bigdecimal === rank) {
            // Exact scaled-decimal addition. The budget applies to results as
            // well as literals (D6): an exact sum too wide to hold is refused,
            // never rounded to fit.
            const sum = decimal(av, ak).add(decimal(bv, bk));
            return (0, Decimal_1.decimalOverBudget)(sum) ?
                (0, err_1.makeNilErr)(ctx, 'decimal_budget', this, undefined, 'add') :
                new BigDecimalVal_1.BigDecimalVal({ peg: sum });
        }
        // integer and biginteger both add as exact integers.
        const sum = integer(av, ak) + integer(bv, bk);
        if (EXACT_RANK.biginteger === rank) {
            // Unbounded and exact: nothing to check, and no demotion to
            // `integer` however small the result.
            return new BigIntegerVal_1.BigIntegerVal({ peg: sum });
        }
        return (0, numkind_2.isIntegerStorable)(sum) ?
            new IntegerVal_1.IntegerVal({ peg: Number(sum) }) :
            (0, err_1.makeNilErr)(ctx, 'inexact_integer_sum', this, undefined, 'add', { sum: sum.toString() });
    }
    get canon() {
        return this.peg[0]?.canon + '+' + this.peg[1]?.canon;
    }
}
exports.PlusOpVal = PlusOpVal;
function digits(v, k) {
    return 'bigdecimal' === k ? v.peg.toString() :
        'integer' === k ? (0, numkind_1.integerDigits)(v.peg) :
            String(v.peg);
}
function integer(v, k) {
    return 'biginteger' === k ? v.peg : BigInt(v.peg);
}
function decimal(v, k) {
    return 'bigdecimal' === k ? v.peg : new Decimal_1.Decimal(integer(v, k), 0);
} /* node:coverage ignore next 6 */
//# sourceMappingURL=PlusOpVal.js.map