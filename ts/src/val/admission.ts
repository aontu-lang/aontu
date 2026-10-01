/* Copyright (c) 2026 Richard Rodger, MIT License */


// The admission trial (G12): whether a settled value IS an instance of a
// trial schema, the meet adding nothing and generating the value's JSON.

import type { Val } from '../type'
import { DONE } from '../type'

import { AontuContext } from '../ctx'
import { unite } from '../unify'
import { putKey } from './BagVal'
import { top } from './top'


function isObject(v: any): boolean {
  return null != v && 'object' === typeof v && !Array.isArray(v)
}


// Own keys only: a generated object may carry a key spelt like an
// inherited property (`toString`, `__proto__`).
function hasOwn(v: any, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(v, k)
}


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


export function sameJson(a: any, b: any): boolean {
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


// What the data carries: past fillDiff, every other member is optional.
export function withoutOptionalFills(generated: any, data: any): any {
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


export function admitsJson(met: any, out: any, own: any): boolean {
  return 0 === fillDiff(out, own, met).length &&
    sameJson(withoutOptionalFills(out, own), own)
}


export function ownJson(value: Val, ctx: AontuContext): any {
  const gctx = ctx.clone({ err: [], collect: true })
  const own = value.clone(gctx).gen(gctx)
  return 0 < gctx.err.length ? undefined : own
}


// The meet run to a fixpoint as the document is, the calls that wait for
// a settled tree, `match` among them, resolving once a pass changes nothing.
function trialMeet(tctx: any, trial: Val, value: Val): any {
  tctx.settle = false
  tctx.seen = {}
  tctx.cc = 0
  let met: any = unite(tctx, trial.clone(tctx), value.clone(tctx), 'nof')
  let last = ''
  for (let cc = 1; cc < tctx.budget.passes && DONE !== met.dc; cc++) {
    const now = met.canon
    tctx.settle = now === last
    last = now
    tctx.seen = {}
    tctx.cc = cc
    met = unite(tctx, met, top(), 'nof')
  }
  return met
}


// The trial inside the engine: `trial` admits the settled `value`, whose
// JSON is `own`. A failed meet is reported to a throwaway list.
export function admitsSettled(
  ctx: AontuContext, trial: Val, value: Val, own: any): boolean {
  if (true === (trial as any).isNil) {
    return false
  }
  const tctx = ctx.clone({ err: [], collect: true })
  const met: any = trialMeet(tctx, trial, value)
  if (true === met.isNil || 0 < tctx.err.length) {
    return false
  }
  const out = met.gen(tctx)
  return 0 === tctx.err.length && undefined !== out && admitsJson(met, out, own)
}
