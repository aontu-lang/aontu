/* Copyright (c) 2025 Richard Rodger, MIT License */

/*
 * The exact base-10 decimal value behind the `bigdecimal` leaf, and the
 * parser for the `0d` literal family that reaches both exact leaves.
 *
 * A Decimal is a coefficient and a scale:
 *
 *   value = unscaled / 10^scale
 *
 * with `unscaled` a native bigint and `scale` a plain integer. Every
 * operation here is EXACT: aontu's whole numeric operator surface
 * (`+`, `upper()`, `lower()`, unary minus) is exact, so no rounding
 * context, precision or rounding mode exists anywhere in this file --
 * addition aligns scales and adds coefficients, and ceiling/floor is
 * coefficient arithmetic that never lets a float64 near the value.
 * Where an exact answer will not fit the budget the answer is refused,
 * never rounded (see decimalOverBudget).
 *
 * D4 -- ONE VALUE, ONE RENDERING. In a unifier canon must be a function
 * of the value, so scale is presentation and not identity: `0d0.10`,
 * `0d0.1` and `0d1e-1` are the same lattice point and must render
 * identically. A Decimal therefore NORMALISES IN ITS CONSTRUCTOR --
 * every Decimal in existence is in minimal form, which is what makes
 * `equals` a two-field comparison and `same()` correct without any
 * pointer identity (D2).
 *
 * The minimal form keeps ONE decimal place at the bottom. `0d` names the
 * numeric FAMILY, not the leaf, so an integral bigdecimal that rendered
 * as `0d1000` would reparse as a biginteger -- a kind-flipping canon of
 * exactly the sort R4's `.0` suffix exists to prevent. So `0d1e3` canons
 * as `0d1000.0`, and scale is never reduced below 1.
 *
 * Go mirror (D8): a struct of (coeff *big.Int, scale int32) normalised
 * by the same rule -- strip trailing zeros while scale > 1, then raise
 * the scale to 1 when it is lower, zero always at scale 1.
 */


// D6 -- THE EXACTNESS BUDGET, enforced at parse.
//
// Both halves are needed and the scale half is the load-bearing one: a
// coefficient-only check never fires for `0d1e1000000000`, whose
// coefficient is one digit, yet plain-form rendering of that value would
// have to materialise a gigabyte of zeros (and overflow the Go port's
// int32 scale field) without any arithmetic having occurred.
//
// A literal over either bound is a located error, never a rounded or
// expanded value: this language does not round, so the only honest
// answer at the limit is refusal.
const DECIMAL_COEFFICIENT_BUDGET = 4096
const DECIMAL_SCALE_BUDGET = 4096


// Powers of ten as bigints, memoised: normalisation of an
// exponent-bearing literal needs one per parse.
function pow10(n: number): bigint {
  return 10n ** BigInt(n)
}


// True when a decimal's SOURCE form is over either budget bound.
//
// Every route that builds a Decimal from text must ask this BEFORE
// constructing one, because normalising an over-budget value is itself
// the resource event the bound exists to prevent: the constructor folds
// a negative scale by multiplying the coefficient by 10^-scale, so
// `1e1000000000` would try to build a billion-digit bigint.
//
// Written once and used by both routes -- the `0d` literal and the
// exact-input API -- because the Go port bounds both (NewBigDecimal
// shares the literal path's checker) and a TypeScript route that did not
// would be a silent cross-port divergence as well as a hazard.
//
// `scale` may be Infinity or NaN when the exponent digits overflow a JS
// number; the comparison is written so that either answers "over".
function overBudget(coeffDigits: number, scale: number): boolean {
  return DECIMAL_COEFFICIENT_BUDGET < coeffDigits ||
    !(Math.abs(scale) <= DECIMAL_SCALE_BUDGET)
}


// The decimal digit count of a coefficient, sign ignored (zero counts as
// one digit). Only the budget test needs it.
function coeffDigits(unscaled: bigint): number {
  return (unscaled < 0n ? -unscaled : unscaled).toString().length
}


class Decimal {
  // value = unscaled / 10^scale, always in minimal form (see above).
  readonly unscaled: bigint

  // Always >= 1: an integral bigdecimal keeps one decimal place so its
  // canon cannot reparse as a biginteger.
  readonly scale: number

  constructor(unscaled: bigint, scale: number) {
    let u = unscaled
    let s = Math.trunc(scale)

    if (0n === u) {
      // R2/D5: there is no negative zero here to begin with (a bigint
      // has one zero), and every zero is the same lattice point, so it
      // takes the one canonical form `0d0.0`.
      s = 1
    }
    else {
      // Strip the trailing zeros that scale-as-presentation would
      // otherwise smuggle into identity (`0d0.10` -> `0d0.1`)...
      while (1 < s && 0n === u % 10n) {
        u /= 10n
        s--
      }
      // ...and fold a negative scale (an exponent) back up to the one
      // decimal place the leaf marker requires (`0d1e3` -> 10000/10^1).
      if (s < 1) {
        u *= pow10(1 - s)
        s = 1
      }
    }

    this.unscaled = u
    this.scale = s
  }


  // Exact numeric equality. Both operands are normalised by
  // construction, so equal values have equal fields -- this is value
  // comparison, never object identity (D2).
  equals(peer: Decimal): boolean {
    return this.unscaled === peer.unscaled && this.scale === peer.scale
  }


  // Exact ordering: -1, 0 or 1. Compares on a common scale, so no
  // float64 ever touches the operands.
  compare(peer: Decimal): number {
    let a = this.unscaled
    let b = peer.unscaled
    if (this.scale < peer.scale) {
      a *= pow10(peer.scale - this.scale)
    }
    else if (peer.scale < this.scale) {
      b *= pow10(this.scale - peer.scale)
    }
    return a < b ? -1 : a > b ? 1 : 0
  }


  // Exact negation, keeping the leaf. -0 folds to 0 (D5) because the
  // normalising constructor sends every zero to the same form.
  negate(): Decimal {
    return new Decimal(-this.unscaled, this.scale)
  }


  // D6 -- EXACT ADDITION. Align the scales, add the coefficients. That
  // is the entire algorithm: there is no rounding mode to consult and no
  // precision to run out of, which is why `0d0.1 + 0d0.2` is exactly
  // `0d0.3` here and 0.30000000000000004 in binary64.
  //
  // The work is bounded because both operands are within the parse-time
  // budget, so alignment can inflate a coefficient only by the scale
  // span. The RESULT, however, can be over budget even when both
  // operands are inside it (`0d1e4000 + 0d1e-4000` needs 8001
  // coefficient digits), so every caller must test the result with
  // decimalOverBudget() and report `decimal_budget` rather than store
  // it. Refusal is the only honest answer at the limit: rounding to fit
  // is exactly what this leaf exists to prevent.
  add(peer: Decimal): Decimal {
    const scale = this.scale < peer.scale ? peer.scale : this.scale
    const a = this.unscaled * pow10(scale - this.scale)
    const b = peer.unscaled * pow10(scale - peer.scale)
    return new Decimal(a + b, scale)
  }


  // D6 -- EXACT MULTIPLICATION. Multiply the coefficients, ADD the
  // scales: (a/10^s)(b/10^t) is ab/10^(s+t), with no alignment step and
  // no rounding mode, exactly as add() has none.
  //
  // The result leaves the budget far more readily than a sum does --
  // scales add rather than taking the maximum, and coefficient digits
  // add too -- so squaring a value at half the budget is already over
  // it. Every caller must test with decimalOverBudget() and report
  // `decimal_budget`, for the same reason add()'s callers must: at the
  // limit, refusing is the only answer that is not a rounded one.
  multiply(peer: Decimal): Decimal {
    return new Decimal(this.unscaled * peer.unscaled, this.scale + peer.scale)
  }


  // Exact ceiling and floor, for `upper()`/`lower()`. Coefficient
  // arithmetic only -- Math.ceil of this value would mean rounding it to
  // binary64 first, which for a leaf that exists to escape binary64 is
  // no answer at all.
  //
  // The leaf is kept (R5 contagion): the result is a bigdecimal whose
  // value happens to be integral, so it keeps the one decimal place the
  // family marker requires -- `upper(0d1.1)` is `0d2.0`, not `0d2`.
  //
  // Neither can leave the exactness budget: with scale >= 1 the integer
  // part drops `scale` digits and normalisation adds one back, so the
  // coefficient never grows. That is why these return a Decimal
  // directly while add() makes its caller check.
  ceil(): Decimal {
    return new Decimal(this.intPart(1n), 0)
  }


  floor(): Decimal {
    return new Decimal(this.intPart(-1n), 0)
  }


  // The integer part, stepped one in the direction of `dir` when a
  // remainder of that sign was discarded. bigint division truncates
  // toward zero and the remainder carries the dividend's sign, so
  // truncation already IS the floor of a positive and the ceiling of a
  // negative; only the other half of each case needs the step.
  private intPart(dir: bigint): bigint {
    const p = pow10(this.scale)
    const q = this.unscaled / p
    const r = this.unscaled % p
    return 0n !== r && (0n < r) === (0n < dir) ? q + dir : q
  }


  isZero(): boolean {
    return 0n === this.unscaled
  }


  // Plain digits, no `0d` marker: `1000.0`, `-0.1`. Plain form at every
  // magnitude, never scientific -- the budget is what makes that safe.
  // This is also the rendering string concatenation will want in Phase 4
  // (`"q" + 0d0.1` is `"q0.1"`), which is why the marker lives in
  // `canon()` and not here.
  toString(): string {
    const neg = this.unscaled < 0n
    let d = (neg ? -this.unscaled : this.unscaled).toString()
    if (d.length <= this.scale) {
      d = '0'.repeat(this.scale - d.length + 1) + d
    }
    const cut = d.length - this.scale
    return (neg ? '-' : '') + d.slice(0, cut) + '.' + d.slice(cut)
  }


  // Canon rendering: the sign goes BEFORE the marker (`-0d1.5`), because
  // `0d-1.5` is not a literal this language accepts.
  canon(): string {
    const neg = this.unscaled < 0n
    return (neg ? '-0d' : '0d') + (neg ? this.negate() : this).toString()
  }


  // Exact-input construction for library consumers (D8). A JS `number`
  // argument is already rounded before this library could inspect it, so
  // the exact leaves are reachable only from a bigint or from text.
  // Accepts `[+-]?digits[.digits][(e|E)[+-]digits]`, with or without the
  // `0d` marker, and no `_` separators (those are literal syntax).
  static fromString(src: string): Decimal {
    const m = /^([-+]?)(?:0[dD])?([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$/
      .exec(src)
    if (null == m) {
      throw new Error('not-decimal: ' + src)
    }
    const frac = m[3] ?? ''
    const exp = null == m[4] ? 0 : Number(m[4])
    const scale = frac.length - exp

    // The same bound the `0d` literal obeys (D6). Without it this API
    // route reached the resource exhaustion the budget exists to
    // prevent -- `fromString('1e1000000000')` would normalise by
    // building a billion-digit coefficient -- and disagreed with the Go
    // port, whose NewBigDecimal shares the literal path's checker.
    if (overBudget(m[2].length + frac.length, scale)) {
      throw new Error('decimal-budget: ' + src)
    }

    const unscaled = BigInt(m[2] + frac)
    return new Decimal('-' === m[1] ? -unscaled : unscaled, scale)
  }
}


// D6 -- THE BUDGET APPLIES TO RESULTS, NOT JUST LITERALS. True when a
// Decimal produced by arithmetic is over either bound and so must be
// refused with `decimal_budget`.
//
// The test is applied to the NORMAL form -- the representation the value
// is actually stored and rendered in -- rather than to some minimal
// re-derived source form. That keeps the rule cheap and mechanical
// enough for the Go port to mirror exactly (count the coefficient's
// digits, read the scale), and it bounds precisely the thing the bound
// exists to bound: the digits plain-form rendering will have to
// materialise.
//
// One consequence is worth naming: a literal is budget-checked on its
// SOURCE form, so an extreme literal whose normal form is wider than its
// source (`0d1e4096` -- one written digit, 4098 normalised ones) parses
// but cannot take part in arithmetic. Both bounds are deliberately far
// beyond any real document, and the alternative -- re-deriving a minimal
// form per operation -- only moves the same edge somewhere else
// (`0d100e4096` has minimal scale -4098, over the bound its source form
// was under), at the cost of a second normal form that both ports would
// then have to agree on digit for digit.
function decimalOverBudget(d: Decimal): boolean {
  return overBudget(coeffDigits(d.unscaled), d.scale)
}


// D3 -- THE `0d` LITERAL.
//
//   0[dD] digits [ . digits ] [ (e|E) [+-] digits ]
//
// with single `_` separators between digits, exactly as the landed
// separator rule allows for ordinary numbers (`[0-9](?:_?[0-9])*` admits
// `1_000` and refuses `1__0`, `_1`, `1_`).
//
// LEAF BY SOURCE, mirroring R1's precedent that the source text and not
// the value decides the kind: digits only is a biginteger, a `.` or an
// exponent anywhere makes it a bigdecimal. So `0d5` is a biginteger and
// `0d1e3` is a bigdecimal whose value happens to be integral.
//
// THE SIGN IS NOT PART OF THIS PATTERN, though it is part of the D3
// grammar: `-0d5` is read as the existing unary-minus prefix applied to
// `0d5` (see negative-prefix in lang.ts), exactly as `-1.5` already is.
// Aontu's lexer runs regexp value matchers BEFORE the fixed-token
// matcher, so a `[-+]?` here would claim the `+` of `0d1 +0d2` as a
// literal sign and silently turn an addition into an implicit list --
// while plain `1 +2` stayed an addition. The sign belongs to the same
// operator for both, which is also what keeps `0d-5` rejected.
//
// Kept RE2-compatible (no lookaround, no backreferences) so the Go port
// can use the byte-identical pattern.
const BIG_LITERAL_RE =
  /^0[dD]([0-9](?:_?[0-9])*)(?:\.([0-9](?:_?[0-9])*))?(?:[eE]([-+]?[0-9](?:_?[0-9])*))?/


// The outcome of reading a `0d` literal: one of the two exact leaves, or
// a budget refusal. `undefined` is impossible for text the matcher above
// claimed, and is reported as an error rather than guessed at.
type BigLiteral =
  { leaf: 'biginteger', int: bigint } |
  { leaf: 'bigdecimal', dec: Decimal } |
  { leaf: 'error', code: string }


function stripSep(s: string): string {
  return -1 === s.indexOf('_') ? s : s.replace(/_/g, '')
}


// Read a `0d` literal from the groups of BIG_LITERAL_RE:
//   1 integer digits, 2 fraction digits, 3 exponent.
function readBigLiteral(m: RegExpExecArray | (string | undefined)[]): BigLiteral {
  const intd = stripSep(m[1] as string)
  const fracd = null == m[2] ? undefined : stripSep(m[2])
  const expd = null == m[3] ? undefined : stripSep(m[3])

  // Leaf by SOURCE, not by value.
  if (undefined === fracd && undefined === expd) {
    return { leaf: 'biginteger', int: BigInt(intd) }
  }

  // The exponent is read as a plain number on purpose: a 4000-digit
  // exponent lands on Infinity, whose absolute value is over budget, so
  // the refusal below fires without any bigint ever being built.
  const exp = undefined === expd ? 0 : Number(expd)
  const fracLen = undefined === fracd ? 0 : fracd.length
  const scale = fracLen - exp

  // The budget is checked on the SOURCE form, before normalisation:
  // normalising `0d1e1000000000` is itself the resource event the bound
  // exists to prevent. Coefficient digits are counted as written
  // (leading zeros included) so the two ports need not agree on any
  // cleverer rule.
  if (overBudget(intd.length + fracLen, scale)) {
    return { leaf: 'error', code: 'decimal_budget' }
  }

  return {
    leaf: 'bigdecimal',
    dec: new Decimal(BigInt(intd + (fracd ?? '')), scale),
  }
} /* node:coverage ignore next 12 */


export {
  BIG_LITERAL_RE,
  BigLiteral,
  DECIMAL_COEFFICIENT_BUDGET,
  DECIMAL_SCALE_BUDGET,
  Decimal,
  decimalOverBudget,
  readBigLiteral,
}
