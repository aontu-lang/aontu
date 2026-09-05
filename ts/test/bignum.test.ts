/* Copyright (c) 2025 Richard Rodger, MIT License */

/*
 * Unit tests for the exact leaves of the number tower: the Decimal value
 * type, the two Vals built on it, and the `0d` literal.
 *
 * The shared, cross-port contract lives in test/spec/number-tower.tsv.
 * What is here is the part a TSV row cannot reach: the TypeScript-side
 * representation (D8), the exact-input constructors, and the value-not-
 * identity comparisons (D2) that a spec row can only observe indirectly.
 */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import { Aontu } from '../dist/aontu'
import {
  DECIMAL_COEFFICIENT_BUDGET,
  DECIMAL_SCALE_BUDGET,
  Decimal,
} from '../dist/val/Decimal'
import { BigDecimalVal } from '../dist/val/BigDecimalVal'
import { BigIntegerVal } from '../dist/val/BigIntegerVal'
import {
  isExactInBinary64,
  isIntegerStorable,
  isLossyIntegerLiteral,
} from '../dist/val/numkind'


const canon = (src: string) => new Aontu().unify(src).canon


describe('decimal', () => {

  test('normalises-at-construction', () => {
    // Scale is presentation, not identity (D4): trailing zeros go...
    Assert.equal(new Decimal(10n, 2).toString(), '0.1')
    Assert.equal(new Decimal(1500n, 3).toString(), '1.5')
    // ...but never below one decimal place, so an integral bigdecimal
    // cannot render as something that reparses as a biginteger.
    Assert.equal(new Decimal(1000n, 0).toString(), '1000.0')
    Assert.equal(new Decimal(1n, -3).toString(), '1000.0')
    Assert.equal(new Decimal(10000n, 1).toString(), '1000.0')
    // Zero has exactly one form, at scale 1 (D5: no negative zero).
    Assert.equal(new Decimal(0n, 7).toString(), '0.0')
    Assert.equal(new Decimal(-0n, 0).toString(), '0.0')
    Assert.equal(new Decimal(0n, -9).scale, 1)
  })

  test('renders-plain-at-every-magnitude', () => {
    Assert.equal(new Decimal(1n, 1).toString(), '0.1')
    Assert.equal(new Decimal(1n, 9).toString(), '0.000000001')
    Assert.equal(new Decimal(-15n, 1).toString(), '-1.5')
    Assert.equal(new Decimal(-1n, 3).toString(), '-0.001')
    // Sign before the marker: `0d-1.5` is not a literal, so canon must
    // not produce it.
    Assert.equal(new Decimal(-15n, 1).canon(), '-0d1.5')
    Assert.equal(new Decimal(15n, 1).canon(), '0d1.5')
  })

  test('equals-and-compares-by-value', () => {
    Assert.ok(new Decimal(10n, 2).equals(new Decimal(1n, 1)))
    Assert.ok(!new Decimal(15n, 1).equals(new Decimal(16n, 1)))
    // Distinct objects, one value: `===` would say no.
    Assert.ok(new Decimal(1n, 1) !== new Decimal(1n, 1))
    Assert.ok(new Decimal(1n, 1).equals(new Decimal(1n, 1)))

    Assert.equal(new Decimal(1n, 1).compare(new Decimal(2n, 1)), -1)
    Assert.equal(new Decimal(2n, 1).compare(new Decimal(1n, 1)), 1)
    Assert.equal(new Decimal(1n, 1).compare(new Decimal(100n, 3)), 0)
    // Different scales, so the comparison must align them exactly.
    Assert.equal(new Decimal(1n, 0).compare(new Decimal(999n, 3)), 1)
    Assert.equal(new Decimal(-15n, 1).compare(new Decimal(15n, 1)), -1)
  })

  test('negates-exactly-and-folds-negative-zero', () => {
    Assert.equal(new Decimal(15n, 1).negate().toString(), '-1.5')
    Assert.equal(new Decimal(-15n, 1).negate().toString(), '1.5')
    Assert.equal(new Decimal(0n, 1).negate().toString(), '0.0')
  })

  test('fromString-is-an-exact-input-constructor', () => {
    Assert.equal(Decimal.fromString('1.5').canon(), '0d1.5')
    Assert.equal(Decimal.fromString('0d1.5').canon(), '0d1.5')
    Assert.equal(Decimal.fromString('-0d0.10').canon(), '-0d0.1')
    Assert.equal(Decimal.fromString('1e3').canon(), '0d1000.0')
    Assert.equal(Decimal.fromString('1e-1').canon(), '0d0.1')
    // Beyond binary64's exact reach, and exact anyway.
    Assert.equal(
      Decimal.fromString('9007199254740993.5').canon(),
      '0d9007199254740993.5')
    Assert.throws(() => Decimal.fromString('1.5.6'))
    Assert.throws(() => Decimal.fromString('0d.5'))
    Assert.throws(() => Decimal.fromString('1_000'))
  })

})


describe('bignum-vals', () => {

  test('exact-input-constructors', () => {
    // D8: a bigint or text, never a JS number -- binary64 has already
    // rounded a number argument before this library could inspect it.
    Assert.equal(new BigIntegerVal({ peg: 5n }).canon, '0d5')
    Assert.equal(new BigIntegerVal({ peg: -5n }).canon, '-0d5')
    Assert.equal(
      new BigIntegerVal({ peg: '9007199254740993' }).canon,
      '0d9007199254740993')
    Assert.throws(() => new BigIntegerVal({ peg: 5 }), /not-biginteger/)
    Assert.throws(() => new BigIntegerVal({ peg: '5.5' }), /not-biginteger/)

    Assert.equal(new BigDecimalVal({ peg: new Decimal(15n, 1) }).canon, '0d1.5')
    Assert.equal(new BigDecimalVal({ peg: '0.10' }).canon, '0d0.1')
    Assert.throws(() => new BigDecimalVal({ peg: 1.5 }), /not-bigdecimal/)
    Assert.throws(() => new BigDecimalVal({ peg: 'q' }), /not-bigdecimal/)
  })

  test('same-compares-value-not-object', () => {
    // D2's Go hazard, in its TypeScript form: a Decimal peg is an
    // OBJECT, so `peer.peg === this.peg` is object identity and would
    // make `0d0.10 & 0d0.1` fail while `0d1.5 & 0d1.5` accidentally
    // worked (or not) depending on allocation.
    const a = new BigDecimalVal({ peg: new Decimal(10n, 2) })
    const b = new BigDecimalVal({ peg: new Decimal(1n, 1) })
    Assert.ok(a.peg !== b.peg)
    Assert.ok(a.same(b))
    Assert.ok(!a.same(new BigDecimalVal({ peg: new Decimal(2n, 1) })))

    // A bigint peg needs no help: `===` on two bigints is value
    // equality even for values far outside binary64.
    const big = '123456789012345678901234567890'
    Assert.ok(new BigIntegerVal({ peg: big })
      .same(new BigIntegerVal({ peg: big })))
    Assert.ok(!new BigIntegerVal({ peg: big })
      .same(new BigIntegerVal({ peg: big + '1' })))

    // Never across leaves, however equal the numbers look.
    Assert.ok(!new BigIntegerVal({ peg: 1n })
      .same(new BigDecimalVal({ peg: '1.0' })))
  })

})


describe('bignum-literal', () => {

  test('leaf-by-source', () => {
    // Digits only is a biginteger; a `.` or an exponent anywhere makes
    // it a bigdecimal, even when the VALUE is integral.
    Assert.equal(canon('x:0d5'), '{"x":0d5}')
    Assert.equal(canon('x:0d1e3'), '{"x":0d1000.0}')
    Assert.equal(canon('x:0d1.5e2'), '{"x":0d150.0}')
    Assert.equal(canon('x:0D12'), '{"x":0d12}')
    // Separators are legal only BETWEEN digits, as for ordinary numbers.
    Assert.equal(canon('x:0d1_000'), '{"x":0d1000}')
    Assert.equal(canon('x:0d1_0.0_1'), '{"x":0d10.01}')
  })

  test('sign-is-the-unary-prefix', () => {
    // D3 accepts `-0d5` and does not read `0d-5` as a literal. The sign
    // is the existing unary-minus operator, so the literal itself never
    // carries one -- which is what keeps `0d1 +0d2` an addition rather
    // than an implicit list of `0d1` and a signed literal. `0d-5` is a
    // bare string, as `6-2` is (test/spec/op-chars.tsv).
    Assert.equal(canon('x:-0d5'), '{"x":-0d5}')
    Assert.equal(canon('x:-0d1.5'), '{"x":-0d1.5}')
    Assert.equal(canon('x:-0d0'), '{"x":0d0}')
    Assert.equal(canon('x:-0d0.0'), '{"x":0d0.0}')
    Assert.equal(canon('x:0d-5'), '{"x":"0d-5"}')
  })

  test('a-bare-0d-is-not-an-exact-leaf', () => {
    Assert.equal(canon('x:0d'), '{"x":"0d"}')
    Assert.equal(canon('x:"0d5"'), '{"x":"0d5"}')
    Assert.equal(canon('x:0d5.0'), '{"x":0d5.0}')
  })

  test('budget-is-enforced-on-the-exact-input-api-too', () => {
    // The literal path and the exact-input API (D8) must obey the SAME
    // bound. They did not: Decimal.fromString normalised first, so
    // `1e200000` quietly built a 200,002-digit coefficient and
    // `1e1000000000` would have exhausted memory -- through the very
    // API the design offers as the exact route. The Go port bounds
    // this path already (NewBigDecimal shares the literal checker), so
    // the gap was a cross-port divergence as well as a hazard.
    Assert.throws(() => Decimal.fromString('1e1000000000'),
      /decimal-budget/)
    Assert.throws(() => Decimal.fromString('1e200000'), /decimal-budget/)
    Assert.throws(
      () => Decimal.fromString('1.' + '2'.repeat(DECIMAL_COEFFICIENT_BUDGET)),
      /decimal-budget/)

    // And through the Val constructor that accepts text.
    Assert.throws(() => new BigDecimalVal({ peg: '1e1000000000' }),
      /not-bigdecimal/)

    // At the limit it is still a value, so the bound is inclusive here
    // exactly as it is for a literal.
    Assert.equal(
      Decimal.fromString('1e-' + DECIMAL_SCALE_BUDGET).scale,
      DECIMAL_SCALE_BUDGET)
  })


  test('budget-is-enforced-at-parse', () => {
    // The scale bound is the load-bearing half: this coefficient is ONE
    // digit, so a coefficient-only check never fires, yet plain-form
    // rendering would have to materialise a gigabyte of zeros.
    Assert.throws(() => new Aontu().generate('x:0d1e1000000000'),
      /exceeds the exactness budget/)
    Assert.throws(() => new Aontu().generate('x:0d1e-1000000000'),
      /exceeds the exactness budget/)
    // An exponent too long to be a number at all is still refused, and
    // still refused without building anything.
    Assert.throws(() => new Aontu().generate('x:0d1e' + '9'.repeat(4000)),
      /exceeds the exactness budget/)
    // The coefficient bound, at one digit over.
    Assert.throws(
      () => new Aontu().generate(
        'x:0d1.' + '2'.repeat(DECIMAL_COEFFICIENT_BUDGET)),
      /exceeds the exactness budget/)

    // Both bounds are inclusive, and a literal at the limit is a value.
    Assert.equal(
      canon('x:0d1e-' + DECIMAL_SCALE_BUDGET),
      '{"x":0d0.' + '0'.repeat(DECIMAL_SCALE_BUDGET - 1) + '1}')
    Assert.equal(
      canon('x:0d1e-' + (DECIMAL_SCALE_BUDGET + 1)), '{"x":nil}')

    // A biginteger has no coefficient budget: it is bounded by the
    // source it is written in, and cannot blow up from a short literal.
    Assert.equal(
      canon('x:0d' + '9'.repeat(5000)),
      '{"x":0d' + '9'.repeat(5000) + '}')
  })

})


// D6 -- ARITHMETIC. The cross-port contract is the PHASE 4 block of
// test/spec/number-tower.tsv; what is here is what a TSV row cannot
// reach: the exact operations themselves, the runtime types the ladder
// produces, and the two limits (the exactness budget applied to a
// RESULT, and the integer storage contract applied to a SUM) whose
// operands are too wide to write in a spec row comfortably.
describe('bignum-arithmetic', () => {

  test('adds-exactly-aligning-scales', () => {
    const add = (a: string, b: string) =>
      Decimal.fromString(a).add(Decimal.fromString(b)).canon()

    // The headline: exact in base 10, where binary64 gives
    // 0.30000000000000004.
    Assert.equal(add('0.1', '0.2'), '0d0.3')
    // Unequal scales align, and the result renormalises (0.25 + 0.75 is
    // one decimal place, not two).
    Assert.equal(add('0.25', '0.75'), '0d1.0')
    Assert.equal(add('1e3', '0.001'), '0d1000.001')
    // Signs, and R2/D5: a sum of zero is THE zero.
    Assert.equal(add('1.5', '-1.5'), '0d0.0')
    Assert.equal(add('-1.5', '-1.5'), '-0d3.0')
    // Exactness well past binary64's 2^53 reach, in both halves.
    Assert.equal(
      add('9007199254740992.5', '0.5'), '0d9007199254740993.0')
    Assert.equal(
      add('0.00000000000000000001', '1'), '0d1.00000000000000000001')
  })

  test('ceils-and-floors-exactly', () => {
    const ceil = (s: string) => Decimal.fromString(s).ceil().canon()
    const floor = (s: string) => Decimal.fromString(s).floor().canon()

    Assert.equal(ceil('1.1'), '0d2.0')
    Assert.equal(floor('1.9'), '0d1.0')
    // Truncation toward zero is already the floor of a positive and the
    // ceiling of a negative; only the other half of each case steps.
    Assert.equal(ceil('-1.1'), '-0d1.0')
    Assert.equal(floor('-1.1'), '-0d2.0')
    // An integral value is its own ceiling and floor.
    Assert.equal(ceil('2.0'), '0d2.0')
    Assert.equal(floor('-2.0'), '-0d2.0')
    Assert.equal(ceil('0.0'), '0d0.0')
    Assert.equal(floor('0.0'), '0d0.0')
    // Exact past binary64: Math.ceil could not even receive this value
    // without rounding it first.
    Assert.equal(ceil('9007199254740993.5'), '0d9007199254740994.0')
    Assert.equal(floor('9007199254740993.5'), '0d9007199254740993.0')
    // Carrying into a new digit does not leave the budget: the integer
    // part is what survives, so the coefficient can only shrink.
    Assert.equal(ceil('999.9'), '0d1000.0')
  })

  test('the-ladder-promotes-to-the-widest-exact-leaf', () => {
    // canon pins the kind, but only the runtime type pins what the
    // engine actually built -- and biginteger and bigdecimal can hold
    // the same number.
    const val = (src: string) => (new Aontu().unify(src) as any).peg.x

    Assert.ok(val('x:1+0d2') instanceof BigIntegerVal)
    Assert.ok(val('x:0d2+1') instanceof BigIntegerVal)
    // Never demotes: 3 would fit an int64, and stays a biginteger.
    Assert.ok(val('x:0d5+-0d2') instanceof BigIntegerVal)
    Assert.ok(val('x:1+0d0.5') instanceof BigDecimalVal)
    Assert.ok(val('x:0d2+0d0.5') instanceof BigDecimalVal)
    // ... and the integer leaf is not widened by the ladder's existence.
    Assert.equal(canon('x:1+2'), '{"x":3}')
    Assert.equal(canon('x:1+2.0'), '{"x":3.0}')
  })

  test('the-budget-applies-to-results-not-just-literals', () => {
    // Both operands are within the budget; their exact sum is not, and
    // there is no rounding available to make it fit (D6). Scale
    // alignment is the inflation route: 10^4000 + 10^-4000 needs 8001
    // coefficient digits.
    Assert.throws(() => new Aontu().generate('x:0d1e4000+0d1e-4000'),
      /exceeds the exactness budget/)

    // The bound is inclusive for a result exactly as it is for a
    // literal: this operand's normal form is the widest coefficient
    // there is, and a sum that keeps that width is a value...
    const nines = '9'.repeat(DECIMAL_COEFFICIENT_BUDGET - 1)
    Assert.equal(
      canon('x:0d' + nines + '.0+0d0.1'), '{"x":0d' + nines + '.1}')
    // ...while a sum that carries one digit further is refused. There
    // is no rounding to fall back on, so the answer is a located error.
    Assert.throws(() => new Aontu().generate('x:0d' + nines + '.0+0d1.0'),
      /exceeds the exactness budget/)
  })

  test('integer-sums-are-exact-or-refused', () => {
    // The storage contract R1 applies to a literal, applied to a sum:
    // integral, within int64, AND exactly representable in binary64.
    Assert.ok(isIntegerStorable(9007199254740992n))
    Assert.ok(!isIntegerStorable(9007199254740993n))
    Assert.ok(isIntegerStorable(9007199254740994n))
    // The int64 window, whose upper bound is exclusive.
    Assert.ok(!isIntegerStorable(9223372036854775808n))
    Assert.ok(!isIntegerStorable(-9223372036854775809n))
    // The largest and smallest values that satisfy both halves.
    Assert.ok(isIntegerStorable(9223372036854774784n))
    Assert.ok(isIntegerStorable(-9223372036854775808n))

    // Leaving the int64 range is a refusal too, where it used to widen
    // the sum to a float.
    Assert.throws(
      () => new Aontu().generate(
        'x:9223372036854774784+9223372036854774784'),
      /exactly representable/)

    // The exact leaves have no such window: the same sum written `0d`
    // is a value.
    Assert.equal(
      canon('x:0d9223372036854774784+0d9223372036854774784'),
      '{"x":0d18446744073709549568}')
  })

  test('a-big-leaf-never-becomes-a-binary-float', () => {
    // Both orders, both big leaves. The message names the operands in
    // the order they were written.
    Assert.throws(() => new Aontu().generate('x:1.0+0d2'),
      /operands are float and biginteger/)
    Assert.throws(() => new Aontu().generate('x:0d2+1.0'),
      /operands are biginteger and float/)
    Assert.throws(() => new Aontu().generate('x:1.0+0d0.5'),
      /operands are float and bigdecimal/)
    Assert.throws(() => new Aontu().generate('x:0d0.5+1.0'),
      /operands are bigdecimal and float/)
  })

  test('upper-and-lower-keep-the-exact-leaf', () => {
    const val = (src: string) => (new Aontu().unify(src) as any).peg.x

    Assert.ok(val('x:upper(0d1.1)') instanceof BigDecimalVal)
    Assert.ok(val('x:lower(0d1.9)') instanceof BigDecimalVal)
    // A biginteger is already integral, so it is its own ceiling and
    // floor -- and stays a biginteger.
    Assert.ok(val('x:upper(0d5)') instanceof BigIntegerVal)
    Assert.ok(val('x:lower(-0d5)') instanceof BigIntegerVal)
    Assert.equal(canon('x:lower(-0d5)'), '{"x":-0d5}')
    // Exact past binary64, where Math.ceil never sees the true value.
    Assert.equal(
      canon('x:upper(0d9007199254740993.5)'),
      '{"x":0d9007199254740994.0}')
  })

  test('concatenation-renders-digits-not-kind-decoration', () => {
    // The `0d` marker names the leaf for canon; like R4's `.0` float
    // suffix it never leaks into a string.
    Assert.equal(canon('x:q+0d5'), '{"x":"q5"}')
    Assert.equal(canon('x:q+-0d5'), '{"x":"q-5"}')
    // The normalised digits, so `0d0.10` concatenates as `0.1`.
    Assert.equal(canon('x:q+0d0.10'), '{"x":"q0.1"}')
    Assert.equal(canon('x:0d1e3+q'), '{"x":"1000.0q"}')
    Assert.equal(canon('x:q+0d' + '9'.repeat(40)),
      '{"x":"q' + '9'.repeat(40) + '"}')
  })

})


// D7 -- a lossy integer literal is refused, not rounded. The shared
// rows are in test/spec/number-tower.tsv; what is here is the boundary
// of the rule, which those rows sample rather than map.
describe('lossy-integer-literal', () => {

  // The engine passes the LEXED double alongside the source (the double
  // is only ever a fast path -- the verdict comes from the text), so
  // reproduce that here.
  const lossy = (src: string) =>
    isLossyIntegerLiteral(Number(src.replace(/_/g, '')), src)

  const genErr = (src: string) => {
    try {
      new Aontu().generate(src)
    }
    catch (e: any) {
      return String(e.message)
    }
    return ''
  }

  test('the-rule-is-exactness-not-magnitude', () => {
    // Refused: the double cannot hold these, so the parsed token is
    // ALREADY a different number by the time a Val is built.
    for (const src of [
      '9007199254740993',            // 2^53+1
      '0x7fffffffffffffff',          // 2^63-1, which rounds UP to 2^63
      '0xffffffffffffffff',          // 2^64-1
      '0o777777777777777777777',     // 2^63-1 again, in octal
      '9007199254740993',
      '18446744073709551615',        // 2^64-1 in decimal
    ]) {
      Assert.ok(lossy(src), 'expected lossy: ' + src)
      Assert.match(genErr('x:' + src), /exactly representable/)
    }

    // Kept: every one of these is far outside the int64 window and
    // lands EXACTLY on a binary64, so magnitude alone decides nothing.
    for (const src of [
      '9007199254740992',                    // 2^53
      '9007199254740994',                    // 2^53+2
      '0x10000000000000000000000000000000',  // 2^124, a power of two
      '100000000000000000000',               // 10^20
      '1e21',
      '18446744073709551616',                // 2^64
      '0x8000000000000000',                  // 2^63
      '1_0e1_0',                             // separators and an exponent
    ]) {
      Assert.ok(!lossy(src), 'expected exact: ' + src)
      Assert.doesNotThrow(() => new Aontu().generate('x:' + src))
    }
  })

  test('a-float-source-is-out-of-scope', () => {
    // A `.` makes it a float literal by R1, and a NEGATIVE exponent
    // denotes a fraction: neither is an integer source, and testing
    // either for binary64 exactness would refuse `0.1` and `2e-1` --
    // which is emphatically not what D7 is about.
    for (const src of ['0.1', '1.5', '2e-1', '1e-7', '1e-400', '0e500']) {
      Assert.ok(!lossy(src), 'expected out of scope: ' + src)
    }
    Assert.equal(canon('x:2e-1'), '{"x":0.2}')
    Assert.equal(canon('x:1e-400'), '{"x":0}')
  })

  test('the-hint-names-the-0d-escape', () => {
    const msg = genErr('x:9007199254740993')
    Assert.match(msg, /lossy_integer_literal/)
    Assert.match(msg, /exactly representable/)
    // The escape has to be nameable, and it has to work.
    Assert.match(msg, /0d/)
    // The literal itself is quoted back, so the error names the culprit
    // when a document has several numbers on one line.
    Assert.match(msg, /9007199254740993/)
    Assert.equal(canon('x:0d9007199254740993'), '{"x":0d9007199254740993}')
  })

  test('the-refusal-is-located-and-reaches-every-literal-position', () => {
    // A list element and a nested map value go through the same val
    // rule as a top-level pair, so all three refuse.
    Assert.match(genErr('x:[1,9007199254740993]'), /exactly representable/)
    Assert.match(genErr('x:{y:0xffffffffffffffff}'), /exactly representable/)
    // Located: the message points at the literal's line.
    Assert.match(genErr('a:1\nb:9007199254740993'), /2 \|/)
  })

  test('a-literal-and-a-computed-sum-agree-about-exactness', () => {
    // Both ask isExactInBinary64, so the same value cannot be a legal
    // literal and an illegal sum (or the reverse).
    Assert.ok(isExactInBinary64(9007199254740992n))
    Assert.ok(!isExactInBinary64(9007199254740993n))
    // Total, not partial: a value far past binary64's range converts to
    // Infinity, and BigInt(Infinity) throws rather than returning false.
    Assert.ok(!isExactInBinary64(10n ** 400n))
    Assert.ok(!isExactInBinary64(-(10n ** 400n)))

    // The int64 window belongs to the SUM rule only: 10^20 is storable
    // nowhere as an integer, yet is a perfectly good float-kind literal.
    Assert.ok(!isIntegerStorable(100000000000000000000n))
    Assert.ok(isExactInBinary64(100000000000000000000n))
    Assert.ok(!lossy('100000000000000000000'))
  })

})
