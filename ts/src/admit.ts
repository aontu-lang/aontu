/* Copyright (c) 2026 Richard Rodger, MIT License */


// The admission trial (G12): whether a settled value IS an instance of a
// trial schema. The meet may add nothing the value lacks, and must
// generate the value's own JSON.

import type { Val } from './type'

import { Aontu } from './aontu'
import { putKey } from './val/BagVal'
import { ConjunctVal } from './val/ConjunctVal'


function isObject(v: any): boolean {
  return null != v && 'object' === typeof v && !Array.isArray(v)
}


// Own keys only: a generated object may carry a key spelt like an
// inherited property (`toString`, `__proto__`).
function hasOwn(v: any, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(v, k)
}


// The member of a settled value at one path, read for its optional keys.
function member(val: any, seg: string): any {
  return Array.isArray(val?.peg) ? val.peg[Number(seg)] : val?.peg?.[seg]
}


// The members `generated` holds that `data` lacks, as paths, but for a key
// the settled value `val` makes optional: that is the schema's to supply.
export function fillDiff(
  generated: any, data: any, val: any, path: string[] = [], out: string[][] = []): string[][] {
  if (isObject(generated) && isObject(data)) {
    const optional: string[] = val?.optionalKeys ?? []
    for (const k of Object.keys(generated)) {
      if (!hasOwn(data, k)) {
        if (!optional.includes(k)) {
          out.push([...path, k])
        }
      }
      else {
        fillDiff(generated[k], data[k], member(val, k), [...path, k], out)
      }
    }
  }
  else if (Array.isArray(generated) && Array.isArray(data)) {
    for (let i = 0; i < generated.length; i++) {
      if (data.length <= i) {
        out.push([...path, String(i)])
      }
      else {
        fillDiff(generated[i], data[i], member(val, String(i)), [...path, String(i)], out)
      }
    }
  }
  return out
}


function sameJson(a: any, b: any): boolean {
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    return ka.length === kb.length &&
      ka.every((k, i) => k === kb[i] && sameJson(a[k], b[k]))
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameJson(v, b[i]))
  }
  if ('bigint' === typeof a || 'bigint' === typeof b) {
    return ('bigint' === typeof a || 'number' === typeof a) &&
      ('bigint' === typeof b || 'number' === typeof b) && BigInt(a) === BigInt(b)
  }
  return a === b
}


function generated(aontu: Aontu, v: Val): any {
  const ctx: any = aontu.ctx({ collect: true })
  ctx.root = v
  const out = (v as any).gen(ctx)
  return 0 === ctx.err.length ? out : undefined
}


// What the data carries: past fillDiff, every other member is optional.
function withoutOptionalFills(generated: any, data: any): any {
  if (isObject(generated) && isObject(data)) {
    const out: any = {}
    for (const k of Object.keys(generated)) {
      if (hasOwn(data, k)) {
        putKey(out, k, withoutOptionalFills(generated[k], data[k]))
      }
    }
    return out
  }
  if (Array.isArray(generated) && Array.isArray(data)) {
    return generated.map((v, i) => withoutOptionalFills(v, data[i]))
  }
  return generated
}


// Whether `trial` admits `value`. Both are cloned: a Val tree is single-use.
export function admits(aontu: Aontu, trial: Val, value: Val): boolean {
  const ctx: any = aontu.ctx({ collect: true })
  const pair = new ConjunctVal({ peg: [trial.clone(ctx), value.clone(ctx)] }, ctx)
  const met: any = aontu.unify(pair, undefined, ctx)
  if (0 < ctx.err.length || true === met?.isNil) {
    return false
  }
  const out = generated(aontu, met)
  const own = generated(aontu, value.clone(aontu.ctx({ collect: true })))
  return undefined !== out && undefined !== own &&
    0 === fillDiff(out, own, met).length &&
    sameJson(withoutOptionalFills(out, own), own)
}
