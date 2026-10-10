"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const aontu_1 = require("../dist/aontu");
const Decimal_1 = require("../dist/val/Decimal");
const BigDecimalVal_1 = require("../dist/val/BigDecimalVal");
const BigIntegerVal_1 = require("../dist/val/BigIntegerVal");
const numkind_1 = require("../dist/val/numkind");
const canon = (src) => new aontu_1.Aontu().unify(src).canon;
(0, node_test_1.describe)('decimal', () => {
    (0, node_test_1.test)('normalises-at-construction', () => {
        // Scale is presentation, not identity (D4): trailing zeros go...
        Assert.equal(new Decimal_1.Decimal(10n, 2).toString(), '0.1');
        Assert.equal(new Decimal_1.Decimal(1500n, 3).toString(), '1.5');
        Assert.equal(new Decimal_1.Decimal(1000n, 0).toString(), '1000.0');
        Assert.equal(new Decimal_1.Decimal(1n, -3).toString(), '1000.0');
        Assert.equal(new Decimal_1.Decimal(10000n, 1).toString(), '1000.0');
        // Zero has exactly one form, at scale 1 (D5: no negative zero).
        Assert.equal(new Decimal_1.Decimal(0n, 7).toString(), '0.0');
        Assert.equal(new Decimal_1.Decimal(-0n, 0).toString(), '0.0');
        Assert.equal(new Decimal_1.Decimal(0n, -9).scale, 1);
    });
    (0, node_test_1.test)('renders-plain-at-every-magnitude', () => {
        Assert.equal(new Decimal_1.Decimal(1n, 1).toString(), '0.1');
        Assert.equal(new Decimal_1.Decimal(1n, 9).toString(), '0.000000001');
        Assert.equal(new Decimal_1.Decimal(-15n, 1).toString(), '-1.5');
        Assert.equal(new Decimal_1.Decimal(-1n, 3).toString(), '-0.001');
        Assert.equal(new Decimal_1.Decimal(-15n, 1).canon(), '-0d1.5');
        Assert.equal(new Decimal_1.Decimal(15n, 1).canon(), '0d1.5');
    });
    (0, node_test_1.test)('equals-and-compares-by-value', () => {
        Assert.ok(new Decimal_1.Decimal(10n, 2).equals(new Decimal_1.Decimal(1n, 1)));
        Assert.ok(!new Decimal_1.Decimal(15n, 1).equals(new Decimal_1.Decimal(16n, 1)));
        // Distinct objects, one value: `===` would say no.
        Assert.ok(new Decimal_1.Decimal(1n, 1) !== new Decimal_1.Decimal(1n, 1));
        Assert.ok(new Decimal_1.Decimal(1n, 1).equals(new Decimal_1.Decimal(1n, 1)));
        Assert.equal(new Decimal_1.Decimal(1n, 1).compare(new Decimal_1.Decimal(2n, 1)), -1);
        Assert.equal(new Decimal_1.Decimal(2n, 1).compare(new Decimal_1.Decimal(1n, 1)), 1);
        Assert.equal(new Decimal_1.Decimal(1n, 1).compare(new Decimal_1.Decimal(100n, 3)), 0);
        // Different scales, so the comparison must align them exactly.
        Assert.equal(new Decimal_1.Decimal(1n, 0).compare(new Decimal_1.Decimal(999n, 3)), 1);
        Assert.equal(new Decimal_1.Decimal(-15n, 1).compare(new Decimal_1.Decimal(15n, 1)), -1);
    });
    (0, node_test_1.test)('negates-exactly-and-folds-negative-zero', () => {
        Assert.equal(new Decimal_1.Decimal(15n, 1).negate().toString(), '-1.5');
        Assert.equal(new Decimal_1.Decimal(-15n, 1).negate().toString(), '1.5');
        Assert.equal(new Decimal_1.Decimal(0n, 1).negate().toString(), '0.0');
    });
    (0, node_test_1.test)('fromString-is-an-exact-input-constructor', () => {
        Assert.equal(Decimal_1.Decimal.fromString('1.5').canon(), '0d1.5');
        Assert.equal(Decimal_1.Decimal.fromString('0d1.5').canon(), '0d1.5');
        Assert.equal(Decimal_1.Decimal.fromString('-0d0.10').canon(), '-0d0.1');
        Assert.equal(Decimal_1.Decimal.fromString('1e3').canon(), '0d1000.0');
        Assert.equal(Decimal_1.Decimal.fromString('1e-1').canon(), '0d0.1');
        // Beyond binary64's exact reach, and exact anyway.
        Assert.equal(Decimal_1.Decimal.fromString('9007199254740993.5').canon(), '0d9007199254740993.5');
        Assert.throws(() => Decimal_1.Decimal.fromString('1.5.6'));
        Assert.throws(() => Decimal_1.Decimal.fromString('0d.5'));
        Assert.throws(() => Decimal_1.Decimal.fromString('1_000'));
    });
});
(0, node_test_1.describe)('bignum-vals', () => {
    (0, node_test_1.test)('exact-input-constructors', () => {
        Assert.equal(new BigIntegerVal_1.BigIntegerVal({ peg: 5n }).canon, '0d5');
        Assert.equal(new BigIntegerVal_1.BigIntegerVal({ peg: -5n }).canon, '-0d5');
        Assert.equal(new BigIntegerVal_1.BigIntegerVal({ peg: '9007199254740993' }).canon, '0d9007199254740993');
        Assert.throws(() => new BigIntegerVal_1.BigIntegerVal({ peg: 5 }), /not-biginteger/);
        Assert.throws(() => new BigIntegerVal_1.BigIntegerVal({ peg: '5.5' }), /not-biginteger/);
        Assert.equal(new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(15n, 1) }).canon, '0d1.5');
        Assert.equal(new BigDecimalVal_1.BigDecimalVal({ peg: '0.10' }).canon, '0d0.1');
        Assert.throws(() => new BigDecimalVal_1.BigDecimalVal({ peg: 1.5 }), /not-bigdecimal/);
        Assert.throws(() => new BigDecimalVal_1.BigDecimalVal({ peg: 'q' }), /not-bigdecimal/);
    });
    (0, node_test_1.test)('same-compares-value-not-object', () => {
        const a = new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(10n, 2) });
        const b = new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(1n, 1) });
        Assert.ok(a.peg !== b.peg);
        Assert.ok(a.same(b));
        Assert.ok(!a.same(new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(2n, 1) })));
        const big = '123456789012345678901234567890';
        Assert.ok(new BigIntegerVal_1.BigIntegerVal({ peg: big })
            .same(new BigIntegerVal_1.BigIntegerVal({ peg: big })));
        Assert.ok(!new BigIntegerVal_1.BigIntegerVal({ peg: big })
            .same(new BigIntegerVal_1.BigIntegerVal({ peg: big + '1' })));
        // Never across leaves, however equal the numbers look.
        Assert.ok(!new BigIntegerVal_1.BigIntegerVal({ peg: 1n })
            .same(new BigDecimalVal_1.BigDecimalVal({ peg: '1.0' })));
    });
});
(0, node_test_1.describe)('bignum-literal', () => {
    (0, node_test_1.test)('leaf-by-source', () => {
        Assert.equal(canon('x:0d5'), '{"x":0d5}');
        Assert.equal(canon('x:0d1e3'), '{"x":0d1000.0}');
        Assert.equal(canon('x:0d1.5e2'), '{"x":0d150.0}');
        Assert.equal(canon('x:0D12'), '{"x":0d12}');
        // Separators are legal only BETWEEN digits, as for ordinary numbers.
        Assert.equal(canon('x:0d1_000'), '{"x":0d1000}');
        Assert.equal(canon('x:0d1_0.0_1'), '{"x":0d10.01}');
    });
    (0, node_test_1.test)('sign-is-the-unary-prefix', () => {
        Assert.equal(canon('x:-0d5'), '{"x":-0d5}');
        Assert.equal(canon('x:-0d1.5'), '{"x":-0d1.5}');
        Assert.equal(canon('x:-0d0'), '{"x":0d0}');
        Assert.equal(canon('x:-0d0.0'), '{"x":0d0.0}');
        Assert.equal(canon('x:0d-5'), '{"x":"0d-5"}');
    });
    (0, node_test_1.test)('a-bare-0d-is-not-an-exact-leaf', () => {
        Assert.equal(canon('x:0d'), '{"x":"0d"}');
        Assert.equal(canon('x:"0d5"'), '{"x":"0d5"}');
        Assert.equal(canon('x:0d5.0'), '{"x":0d5.0}');
    });
    (0, node_test_1.test)('budget-is-enforced-on-the-exact-input-api-too', () => {
        Assert.throws(() => Decimal_1.Decimal.fromString('1e1000000000'), /decimal-budget/);
        Assert.throws(() => Decimal_1.Decimal.fromString('1e200000'), /decimal-budget/);
        Assert.throws(() => Decimal_1.Decimal.fromString('1.' + '2'.repeat(Decimal_1.DECIMAL_COEFFICIENT_BUDGET)), /decimal-budget/);
        // And through the Val constructor that accepts text.
        Assert.throws(() => new BigDecimalVal_1.BigDecimalVal({ peg: '1e1000000000' }), /not-bigdecimal/);
        Assert.equal(Decimal_1.Decimal.fromString('1e-' + Decimal_1.DECIMAL_SCALE_BUDGET).scale, Decimal_1.DECIMAL_SCALE_BUDGET);
    });
    (0, node_test_1.test)('budget-is-enforced-at-parse', () => {
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d1e1000000000'), /exceeds the exactness budget/);
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d1e-1000000000'), /exceeds the exactness budget/);
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d1e' + '9'.repeat(4000)), /exceeds the exactness budget/);
        // The coefficient bound, at one digit over.
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d1.' + '2'.repeat(Decimal_1.DECIMAL_COEFFICIENT_BUDGET)), /exceeds the exactness budget/);
        // Both bounds are inclusive, and a literal at the limit is a value.
        Assert.equal(canon('x:0d1e-' + Decimal_1.DECIMAL_SCALE_BUDGET), '{"x":0d0.' + '0'.repeat(Decimal_1.DECIMAL_SCALE_BUDGET - 1) + '1}');
        Assert.equal(canon('x:0d1e-' + (Decimal_1.DECIMAL_SCALE_BUDGET + 1)), '{"x":nil}');
        Assert.equal(canon('x:0d' + '9'.repeat(5000)), '{"x":0d' + '9'.repeat(5000) + '}');
    });
    // As Go's Aontu.ExactNumbers; a module is read as written, as Go's
    // fresh instance for one reads it.
    (0, node_test_1.test)('exact-numbers-on-the-instance', () => {
        const exact = new aontu_1.Aontu({ exactNumbers: true });
        Assert.equal(exact.unify('x: 0.1 y: 1.0').canon, '{"x":0d0.1,"y":1}');
        Assert.equal(new aontu_1.Aontu().unify('x: 0.1 y: 1.0').canon, '{"x":0.1,"y":1.0}');
        Assert.equal(new aontu_1.Aontu().unify('x: 0.1', { exactNumbers: true }).canon, '{"x":0d0.1}');
        const mod = (a) => a.opts.mod.eval('x: 0.1', 'p.aontu').hash;
        Assert.equal(mod(exact), mod(new aontu_1.Aontu()));
    });
});
(0, node_test_1.describe)('bignum-arithmetic', () => {
    (0, node_test_1.test)('adds-exactly-aligning-scales', () => {
        const add = (a, b) => Decimal_1.Decimal.fromString(a).add(Decimal_1.Decimal.fromString(b)).canon();
        Assert.equal(add('0.1', '0.2'), '0d0.3');
        Assert.equal(add('0.25', '0.75'), '0d1.0');
        Assert.equal(add('1e3', '0.001'), '0d1000.001');
        // Signs, and R2/D5: a sum of zero is THE zero.
        Assert.equal(add('1.5', '-1.5'), '0d0.0');
        Assert.equal(add('-1.5', '-1.5'), '-0d3.0');
        // Exactness well past binary64's 2^53 reach, in both halves.
        Assert.equal(add('9007199254740992.5', '0.5'), '0d9007199254740993.0');
        Assert.equal(add('0.00000000000000000001', '1'), '0d1.00000000000000000001');
    });
    (0, node_test_1.test)('ceils-and-floors-exactly', () => {
        const ceil = (s) => Decimal_1.Decimal.fromString(s).ceil().canon();
        const floor = (s) => Decimal_1.Decimal.fromString(s).floor().canon();
        Assert.equal(ceil('1.1'), '0d2.0');
        Assert.equal(floor('1.9'), '0d1.0');
        Assert.equal(ceil('-1.1'), '-0d1.0');
        Assert.equal(floor('-1.1'), '-0d2.0');
        // An integral value is its own ceiling and floor.
        Assert.equal(ceil('2.0'), '0d2.0');
        Assert.equal(floor('-2.0'), '-0d2.0');
        Assert.equal(ceil('0.0'), '0d0.0');
        Assert.equal(floor('0.0'), '0d0.0');
        Assert.equal(ceil('9007199254740993.5'), '0d9007199254740994.0');
        Assert.equal(floor('9007199254740993.5'), '0d9007199254740993.0');
        Assert.equal(ceil('999.9'), '0d1000.0');
    });
    (0, node_test_1.test)('the-ladder-promotes-to-the-widest-exact-leaf', () => {
        const val = (src) => new aontu_1.Aontu().unify(src).peg.x;
        Assert.ok(val('x:1+0d2') instanceof BigIntegerVal_1.BigIntegerVal);
        Assert.ok(val('x:0d2+1') instanceof BigIntegerVal_1.BigIntegerVal);
        // Never demotes: 3 would fit an int64, and stays a biginteger.
        Assert.ok(val('x:0d5+-0d2') instanceof BigIntegerVal_1.BigIntegerVal);
        Assert.ok(val('x:1+0d0.5') instanceof BigDecimalVal_1.BigDecimalVal);
        Assert.ok(val('x:0d2+0d0.5') instanceof BigDecimalVal_1.BigDecimalVal);
        // ... and the integer leaf is not widened by the ladder's existence.
        Assert.equal(canon('x:1+2'), '{"x":3}');
        Assert.equal(canon('x:1+2.0'), '{"x":3.0}');
    });
    (0, node_test_1.test)('the-budget-applies-to-results-not-just-literals', () => {
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d1e4000+0d1e-4000'), /exceeds the exactness budget/);
        const nines = '9'.repeat(Decimal_1.DECIMAL_COEFFICIENT_BUDGET - 1);
        Assert.equal(canon('x:0d' + nines + '.0+0d0.1'), '{"x":0d' + nines + '.1}');
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d' + nines + '.0+0d1.0'), /exceeds the exactness budget/);
    });
    (0, node_test_1.test)('integer-sums-are-exact-or-refused', () => {
        Assert.ok((0, numkind_1.isIntegerStorable)(9007199254740992n));
        Assert.ok(!(0, numkind_1.isIntegerStorable)(9007199254740993n));
        Assert.ok((0, numkind_1.isIntegerStorable)(9007199254740994n));
        // The int64 window, whose upper bound is exclusive.
        Assert.ok(!(0, numkind_1.isIntegerStorable)(9223372036854775808n));
        Assert.ok(!(0, numkind_1.isIntegerStorable)(-9223372036854775809n));
        // The largest and smallest values that satisfy both halves.
        Assert.ok((0, numkind_1.isIntegerStorable)(9223372036854774784n));
        Assert.ok((0, numkind_1.isIntegerStorable)(-9223372036854775808n));
        Assert.throws(() => new aontu_1.Aontu().generate('x:9223372036854774784+9223372036854774784'), /exactly representable/);
        Assert.equal(canon('x:0d9223372036854774784+0d9223372036854774784'), '{"x":0d18446744073709549568}');
    });
    (0, node_test_1.test)('a-big-leaf-never-becomes-a-binary-float', () => {
        Assert.throws(() => new aontu_1.Aontu().generate('x:1.0+0d2'), /operands are float and biginteger/);
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d2+1.0'), /operands are biginteger and float/);
        Assert.throws(() => new aontu_1.Aontu().generate('x:1.0+0d0.5'), /operands are float and bigdecimal/);
        Assert.throws(() => new aontu_1.Aontu().generate('x:0d0.5+1.0'), /operands are bigdecimal and float/);
    });
    (0, node_test_1.test)('upper-and-lower-keep-the-exact-leaf', () => {
        const val = (src) => new aontu_1.Aontu().unify(src).peg.x;
        Assert.ok(val('x:upper(0d1.1)') instanceof BigDecimalVal_1.BigDecimalVal);
        Assert.ok(val('x:lower(0d1.9)') instanceof BigDecimalVal_1.BigDecimalVal);
        Assert.ok(val('x:upper(0d5)') instanceof BigIntegerVal_1.BigIntegerVal);
        Assert.ok(val('x:lower(-0d5)') instanceof BigIntegerVal_1.BigIntegerVal);
        Assert.equal(canon('x:lower(-0d5)'), '{"x":-0d5}');
        // Exact past binary64, where Math.ceil never sees the true value.
        Assert.equal(canon('x:upper(0d9007199254740993.5)'), '{"x":0d9007199254740994.0}');
    });
    (0, node_test_1.test)('concatenation-renders-digits-not-kind-decoration', () => {
        Assert.equal(canon('x:q+0d5'), '{"x":"q5"}');
        Assert.equal(canon('x:q+-0d5'), '{"x":"q-5"}');
        // The normalised digits, so `0d0.10` concatenates as `0.1`.
        Assert.equal(canon('x:q+0d0.10'), '{"x":"q0.1"}');
        Assert.equal(canon('x:0d1e3+q'), '{"x":"1000.0q"}');
        Assert.equal(canon('x:q+0d' + '9'.repeat(40)), '{"x":"q' + '9'.repeat(40) + '"}');
    });
});
(0, node_test_1.describe)('lossy-integer-literal', () => {
    const lossy = (src) => (0, numkind_1.isLossyIntegerLiteral)(Number(src.replace(/_/g, '')), src);
    const genErr = (src) => {
        try {
            new aontu_1.Aontu().generate(src);
        }
        catch (e) {
            return String(e.message);
        }
        return '';
    };
    (0, node_test_1.test)('the-rule-is-exactness-not-magnitude', () => {
        for (const src of [
            '9007199254740993',
            '0x7fffffffffffffff', // 2^63-1, which rounds UP to 2^63
            '0xffffffffffffffff',
            '0o777777777777777777777', // 2^63-1 again, in octal
            '9007199254740993',
            '18446744073709551615', // 2^64-1 in decimal
        ]) {
            Assert.ok(lossy(src), 'expected lossy: ' + src);
            Assert.match(genErr('x:' + src), /exactly representable/);
        }
        for (const src of [
            '9007199254740992',
            '9007199254740994',
            '0x10000000000000000000000000000000', // 2^124, a power of two
            '100000000000000000000',
            '1e21',
            '18446744073709551616',
            '0x8000000000000000',
            '1_0e1_0', // separators and an exponent
        ]) {
            Assert.ok(!lossy(src), 'expected exact: ' + src);
            Assert.doesNotThrow(() => new aontu_1.Aontu().generate('x:' + src));
        }
    });
    (0, node_test_1.test)('a-float-source-is-out-of-scope', () => {
        for (const src of ['0.1', '1.5', '2e-1', '1e-7', '1e-400', '0e500']) {
            Assert.ok(!lossy(src), 'expected out of scope: ' + src);
        }
        Assert.equal(canon('x:2e-1'), '{"x":0.2}');
        Assert.equal(canon('x:1e-400'), '{"x":0}');
    });
    (0, node_test_1.test)('the-hint-names-the-0d-escape', () => {
        const msg = genErr('x:9007199254740993');
        Assert.match(msg, /lossy_integer_literal/);
        Assert.match(msg, /exactly representable/);
        // The escape has to be nameable, and it has to work.
        Assert.match(msg, /0d/);
        // The literal itself is quoted back, so the error names the culprit
        // when a document has several numbers on one line.
        Assert.match(msg, /9007199254740993/);
        Assert.equal(canon('x:0d9007199254740993'), '{"x":0d9007199254740993}');
    });
    (0, node_test_1.test)('the-refusal-is-located-and-reaches-every-literal-position', () => {
        // A list element and a nested map value go through the same val
        // rule as a top-level pair, so all three refuse.
        Assert.match(genErr('x:[1,9007199254740993]'), /exactly representable/);
        Assert.match(genErr('x:{y:0xffffffffffffffff}'), /exactly representable/);
        // Located: the message points at the literal's line.
        Assert.match(genErr('a:1\nb:9007199254740993'), /2 \|/);
    });
    (0, node_test_1.test)('a-literal-and-a-computed-sum-agree-about-exactness', () => {
        // Both ask isExactInBinary64, so the same value cannot be a legal
        // literal and an illegal sum (or the reverse).
        Assert.ok((0, numkind_1.isExactInBinary64)(9007199254740992n));
        Assert.ok(!(0, numkind_1.isExactInBinary64)(9007199254740993n));
        // Total, not partial: a value far past binary64's range converts to
        // Infinity, and BigInt(Infinity) throws rather than returning false.
        Assert.ok(!(0, numkind_1.isExactInBinary64)(10n ** 400n));
        Assert.ok(!(0, numkind_1.isExactInBinary64)(-(10n ** 400n)));
        // The int64 window belongs to the SUM rule only: 10^20 is storable
        // nowhere as an integer, yet is a perfectly good float-kind literal.
        Assert.ok(!(0, numkind_1.isIntegerStorable)(100000000000000000000n));
        Assert.ok((0, numkind_1.isExactInBinary64)(100000000000000000000n));
        Assert.ok(!lossy('100000000000000000000'));
    });
});
//# sourceMappingURL=bignum.test.js.map