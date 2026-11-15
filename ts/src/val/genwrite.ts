/* Copyright (c) 2026 Richard Rodger, MIT License */


import { AontuContext } from '../ctx'
import { AontuError, descErr, makeNilErr } from '../err'
import { cmpCodePoint } from '../keyorder'
import { styleName } from '../casing'

import { Decimal } from './Decimal'
import { caseRange } from './caserange'


function genWrites(ctx: AontuContext | undefined, v: any): boolean {
  return null != v.genopts && true !== ctx?.plain
}


function genPlain(v: any, ctx: any): any {
  const was = ctx.plain
  ctx.plain = true
  try {
    return v.gen(ctx)
  }
  finally {
    ctx.plain = was
  }
}


function genRefuse(
  ctx: AontuContext | undefined, code: string, v: any, details?: Record<string, any>
): undefined {
  const nil = makeNilErr(ctx, code, v, undefined, undefined, details)
  nil.path = ctx?.genat ?? nil.path
  descErr(nil, ctx)
  ctx?.adderr(nil)
  if (null == ctx || !ctx.collect) {
    throw new AontuError(nil.msg, [nil])
  }
  return undefined
}


// The whole number nearest `c / 10 ^ drop`, a tie to the even one.
function roundHalfEven(c: bigint, drop: number): bigint {
  const d = 10n ** BigInt(drop)
  const q = c / d
  const twice = 2n * (c % d)
  return twice < d ? q : d < twice ? q + 1n : 0n === q % 2n ? q : q + 1n
}


// The decimal a number shows, `c * 10 ^ e`: a float's is the shortest
// that reads back as it.
function shown(v: any, native: any): [bigint, number] {
  if (true === v.isBigDecimal) {
    return [native.unscaled, -native.scale]
  }
  if (true === v.isBigInteger || true === v.isInteger) {
    return [BigInt(native), 0]
  }
  const [mant, exp] = (native as number).toExponential().split('e')
  const digits = mant.replace('-', '').replace('.', '')
  return [BigInt(digits) * (native < 0 ? -1n : 1n), Number(exp) - digits.length + 1]
}


// One rounding, at whichever position keeps fewer digits: a second
// rounding of a rounded number can cross a tie the number never met.
function rounded(c: bigint, e: number, sig: any, places: any): [bigint, number] {
  const mag = c < 0n ? -c : c
  const drop = Math.max(
    'number' === typeof sig ? mag.toString().length - sig : 0,
    'number' === typeof places ? -e - places : 0)
  if (drop <= 0) {
    return [c, e]
  }
  const r = roundHalfEven(mag, drop)
  return [c < 0n ? -r : r, e + drop]
}


// A float is the double nearest the decimal, an infinity where there is none.
function inLeaf(v: any, c: bigint, e: number): any {
  if (true === v.isBigDecimal) {
    return new Decimal(c, -e)
  }
  if (true === v.isBigInteger || true === v.isInteger) {
    const whole = c * 10n ** BigInt(e)
    return true === v.isInteger && Number.isSafeInteger(Number(whole)) ? Number(whole) : whole
  }
  return Number(c.toString() + 'e' + e)
}


function fixed(c: bigint, e: number, places: number): string {
  const neg = c < 0n
  const frac = Math.max(0, -e)
  const digits = (neg ? -c : c).toString().padStart(frac + 1, '0') + '0'.repeat(Math.max(0, e))
  const cut = digits.length - frac
  return (neg ? '-' : '') + digits.slice(0, cut) +
    (0 < places ? '.' + digits.slice(cut).padEnd(places, '0') : '')
}


function writeNumber(ctx: AontuContext | undefined, v: any, native: any): any {
  const o = v.genopts
  const [c, e] = rounded(...shown(v, native), o.significant, o.places)
  const out = inLeaf(v, c, e)
  if ('number' === typeof out && !Number.isFinite(out)) {
    return genRefuse(ctx, 'float_overflow', v)
  }
  if ('string' !== o.as) {
    return out
  }
  return 'number' === typeof o.places ? fixed(c, e, o.places) : String(out)
}


function genWrite(ctx: AontuContext | undefined, v: any, native: any): any {
  const o = v.genopts
  if (true === v.isString) {
    return 'omit' === o.empty && '' === native ? undefined :
      'as-written' === o.case ? native : caseRange(native, 0, -1, 'upper' === o.case)
  }
  if (true === v.isBoolean) {
    return 'number' === o.as ? (native ? 1 : 0) : 'string' === o.as ? String(native) : native
  }
  if (true === v.isNull) {
    return 'omit' === o.empty ? undefined : native
  }
  return writeNumber(ctx, v, native)
}


// The members are written in the order of the keys that are written, and
// a clash names its keys in that order, so both are sorted here.
function genWriteBag(ctx: AontuContext, bag: any, out: any): any {
  const o = bag.genopts
  let res = out
  if (true === bag.isMap && 'as-written' !== o.keys) {
    const named = Object.keys(out)
      .map((k): [string, string] => [styleName(k, o.keys, []) ?? k, k])
      .sort((a, b) => cmpCodePoint(a[0], b[0]) || cmpCodePoint(a[1], b[1]))
    res = {}
    for (let i = 0; i < named.length; i++) {
      const [key, from] = named[i]
      if (0 < i && named[i - 1][0] === key) {
        return genRefuse(ctx, 'gen_key_clash', bag, { written: key, a: named[i - 1][1], b: from })
      }
      Object.defineProperty(res, key, {
        value: out[from], writable: true, enumerable: true, configurable: true,
      })
    }
  }
  const none = true === bag.isMap ? 0 === Object.keys(res).length : 0 === res.length
  return 'omit' === o.empty && none ? undefined : res
} /* node:coverage ignore next 9 */


export {
  genPlain,
  genRefuse,
  genWrite,
  genWriteBag,
  genWrites,
}
