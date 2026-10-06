/* Copyright (c) 2025 Richard Rodger, MIT License */

import { isIntegerStorable } from './numkind'


const DECIMAL_COEFFICIENT_BUDGET = 4096
const DECIMAL_SCALE_BUDGET = 4096


function pow10(n: number): bigint {
  return 10n ** BigInt(n)
}


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
  readonly unscaled: bigint

  // Always >= 1: an integral bigdecimal keeps one decimal place so its
  // canon cannot reparse as a biginteger.
  readonly scale: number

  constructor(unscaled: bigint, scale: number) {
    let u = unscaled
    let s = Math.trunc(scale)

    if (0n === u) {
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


  negate(): Decimal {
    return new Decimal(-this.unscaled, this.scale)
  }


  add(peer: Decimal): Decimal {
    const scale = this.scale < peer.scale ? peer.scale : this.scale
    const a = this.unscaled * pow10(scale - this.scale)
    const b = peer.unscaled * pow10(scale - peer.scale)
    return new Decimal(a + b, scale)
  }


  multiply(peer: Decimal): Decimal {
    return new Decimal(this.unscaled * peer.unscaled, this.scale + peer.scale)
  }


  ceil(): Decimal {
    return new Decimal(this.intPart(1n), 0)
  }


  floor(): Decimal {
    return new Decimal(this.intPart(-1n), 0)
  }


  private intPart(dir: bigint): bigint {
    const p = pow10(this.scale)
    const q = this.unscaled / p
    const r = this.unscaled % p
    return 0n !== r && (0n < r) === (0n < dir) ? q + dir : q
  }


  isZero(): boolean {
    return 0n === this.unscaled
  }


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


  static fromString(src: string): Decimal {
    const m = /^([-+]?)(?:0[dD])?([0-9]+)(?:\.([0-9]+))?(?:[eE]([-+]?[0-9]+))?$/
      .exec(src)
    if (null == m) {
      throw new Error('not-decimal: ' + src)
    }
    const frac = m[3] ?? ''
    const exp = null == m[4] ? 0 : Number(m[4])
    const scale = frac.length - exp

    if (overBudget(m[2].length + frac.length, scale)) {
      throw new Error('decimal-budget: ' + src)
    }

    const unscaled = BigInt(m[2] + frac)
    return new Decimal('-' === m[1] ? -unscaled : unscaled, scale)
  }
}


function decimalOverBudget(d: Decimal): boolean {
  return overBudget(coeffDigits(d.unscaled), d.scale)
}


const BIG_LITERAL_RE =
  /^0[dD]([0-9](?:_?[0-9])*)(?:\.([0-9](?:_?[0-9])*))?(?:[eE]([-+]?[0-9](?:_?[0-9])*))?/


type BigLiteral =
  { leaf: 'biginteger', int: bigint } |
  { leaf: 'bigdecimal', dec: Decimal } |
  { leaf: 'error', code: string }


function stripSep(s: string): string {
  return -1 === s.indexOf('_') ? s : s.replace(/_/g, '')
}


function readBigLiteral(m: RegExpExecArray | (string | undefined)[]): BigLiteral {
  const intd = stripSep(m[1] as string)
  const fracd = null == m[2] ? undefined : stripSep(m[2])
  const expd = null == m[3] ? undefined : stripSep(m[3])

  // Leaf by SOURCE, not by value.
  if (undefined === fracd && undefined === expd) {
    return { leaf: 'biginteger', int: BigInt(intd) }
  }

  const exp = undefined === expd ? 0 : Number(expd)
  const fracLen = undefined === fracd ? 0 : fracd.length
  const scale = fracLen - exp

  if (overBudget(intd.length + fracLen, scale)) {
    return { leaf: 'error', code: 'decimal_budget' }
  }

  return {
    leaf: 'bigdecimal',
    dec: new Decimal(BigInt(intd + (fracd ?? '')), scale),
  }
}


type ExactNumber =
  { leaf: 'integer', int: bigint } |
  { leaf: 'biginteger', int: bigint } |
  { leaf: 'bigdecimal', dec: Decimal } |
  { leaf: 'error', code: string }


// `--exact-numbers`: a plain literal read by the VALUE its digits spell,
// where readBigLiteral reads a `0d` literal by its spelling. An integral
// value is an integer while that leaf stores it and a biginteger beyond;
// any other value is a bigdecimal, under the bigdecimal's budget.
function readExactNumber(
  intd: string, fracd: string, expd?: string): ExactNumber {
  const exp = undefined === expd ? 0 : Number(expd)
  const scale = fracd.length - exp
  if (overBudget(intd.length + fracd.length, scale)) {
    return { leaf: 'error', code: 'decimal_budget' }
  }
  const unscaled = BigInt(intd + fracd)
  const p = pow10(scale < 0 ? 0 : scale)
  if (0n !== unscaled % p) {
    return { leaf: 'bigdecimal', dec: new Decimal(unscaled, scale) }
  }
  const int = scale < 0 ? unscaled * pow10(-scale) : unscaled / p
  return isIntegerStorable(int) ?
    { leaf: 'integer', int } : { leaf: 'biginteger', int }
} /* node:coverage ignore next 14 */


export {
  BIG_LITERAL_RE,
  BigLiteral,
  DECIMAL_COEFFICIENT_BUDGET,
  DECIMAL_SCALE_BUDGET,
  Decimal,
  decimalOverBudget,
  ExactNumber,
  readBigLiteral,
  readExactNumber,
}
