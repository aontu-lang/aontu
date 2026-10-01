/* Copyright (c) 2026 Richard Rodger, MIT License */


import { cmpCodePoint } from './keyorder'


// A rider record holds a sorted set of distinct values under each key,
// so records meet as their key-wise union: commutative, idempotent, and
// never refused.
type RiderRecord<T> = Record<string, T[]>


function unionRecords<T>(
  records: (RiderRecord<T> | undefined)[], key: (v: T) => string,
): RiderRecord<T> {
  const sets: Record<string, Map<string, T>> = {}
  for (const r of records) {
    if (null == r) {
      continue
    }
    for (const k of Object.keys(r)) {
      const set = sets[k] ?? (sets[k] = new Map())
      for (const v of r[k]) {
        if (!set.has(key(v))) {
          set.set(key(v), v)
        }
      }
    }
  }
  const out: RiderRecord<T> = {}
  for (const k of Object.keys(sets).sort(cmpCodePoint)) {
    const set = sets[k]
    out[k] = [...set.keys()].sort(cmpCodePoint).map((s) => set.get(s) as T)
  }
  return out
}


// The records a rider is written as: the first holds each key's first
// value, the second each key's second, so a reparse unions them back.
function recordLayers<T>(rec: RiderRecord<T>): Record<string, T>[] {
  const keys = Object.keys(rec).sort(cmpCodePoint)
  const n = keys.reduce((m, k) => Math.max(m, rec[k].length), 0)
  const out: Record<string, T>[] = []
  for (let i = 0; i < n; i++) {
    const layer: Record<string, T> = {}
    for (const k of keys.filter((k) => i < rec[k].length)) {
      layer[k] = rec[k][i]
    }
    out.push(layer)
  }
  return out
}


function layerText<T>(layer: Record<string, T>, text: (v: T) => string): string {
  return '{' + Object.keys(layer)
    .map((k) => JSON.stringify(k) + ':' + text(layer[k])).join(',') + '}'
}


// A value's riders around its rendering: the deprecation record, then
// the annotation record, each as the reparseable call that carries it.
function riderText(s: string, v: any): string {
  const d: RiderRecord<string> | undefined = v.deprecation
  if (null != d) {
    const layers = recordLayers(d)
    s = 0 === layers.length ? 'deprecate(' + s + ')' : layers.reduce((acc, l) =>
      'deprecate(' + acc + ',' + layerText(l, (x) => JSON.stringify(x)) + ')', s)
  }
  const m: RiderRecord<any> | undefined = v.meta
  if (null != m) {
    s = 'meta(' + [s, ...recordLayers(m).map((l) =>
      layerText(l, (x: any) => x.canon))].join(',') + ')'
  }
  return s
} /* node:coverage ignore next 7 */


export {
  unionRecords,
  recordLayers,
  riderText,
}
