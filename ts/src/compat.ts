/* Copyright (c) 2025 Richard Rodger, MIT License */


// The outcome half of the publish gate (ADR-022): every position the
// prior version generates with nothing supplied, the next version must
// generate, to the same value. Admission is the subsumption query's.

import { includeOpts } from './utility'

import { Aontu } from './aontu'
import { cmpCodePoint } from './keyorder'
import { pathText, siteOf } from './subsume'
import type { SubsumeOptions } from './subsume'
import type { VetFinding } from './vet'


export type OutcomeReport = {
  verdict: 'ok' | 'breaking' | 'error'
  findings: VetFinding[]
}

type OutcomeState = {
  findings: VetFinding[]
  nextUrl: string
  priorUrl: string
}


function marked(v: any): boolean {
  return true === v?.mark?.type || true === v?.mark?.hide
}


function bag(v: any): boolean {
  return true === v?.isMap || true === v?.isList
}


function keysOf(v: any): string[] {
  return true === v.isMap
    ? Object.keys(v.peg).filter((k) => !v.aliasKeys.includes(k)).sort(cmpCodePoint)
    : Object.keys(v.peg)
}


// The canon of what a position generates with nothing supplied;
// undefined where generation does not settle on one value.
function determined(v: any): string | undefined {
  if (true !== v?.isVal || marked(v)) {
    return undefined
  }
  if (true === v.isScalar) {
    return v.canon
  }
  if (true === v.isPref) {
    return determined(v.peg)
  }
  if (true === v.isDisjunct) {
    const prefs = v.peg.filter((m: any) => true === m?.isPref)
    if (0 < prefs.length) {
      return determined(prefs.reduce((b: any, p: any) => p.rank < b.rank ? p : b))
    }
  }
  return undefined
}


function generates(v: any): boolean {
  if (bag(v)) {
    return !marked(v) && keysOf(v).some((k) => generates(v.peg[k]))
  }
  return undefined !== determined(v)
}


function record(st: OutcomeState, code: string, path: string[],
  prior: any, next: any, message: string): void {
  const present = true === next?.isVal
  st.findings.push({
    code,
    class: 'compat',
    severity: 'error',
    path: pathText(path),
    message,
    sites: [
      ...(present ? [siteOf(next, 'general', st.nextUrl)] : []),
      siteOf(prior, 'specific', st.priorUrl),
    ],
    ...(present ? { expected: next.canon } : {}),
    actual: prior.canon,
  })
}


function walk(st: OutcomeState, prior: any, next: any, path: string[]): void {
  if (bag(prior)) {
    if (marked(prior)) {
      return
    }
    if (bag(next) && prior.isMap === next.isMap) {
      for (const k of keysOf(prior)) {
        walk(st, prior.peg[k], next.peg[k], path.concat(k))
      }
    }
    else if (generates(prior) && undefined === determined(next)) {
      record(st, 'compat_undetermined', path, prior, next,
        'resolved to a value in the prior version; nothing resolves it now')
    }
    return
  }
  const was = determined(prior)
  if (undefined === was) {
    return
  }
  const now = determined(next)
  if (undefined === now) {
    record(st, 'compat_undetermined', path, prior, next,
      'resolved to ' + was + ' in the prior version; nothing resolves it now')
  }
  else if (now !== was) {
    record(st, 'compat_outcome_changed', path, prior, next,
      'resolved to ' + was + ' in the prior version; resolves to ' + now + ' now')
  }
}


export function compatOutcome(nextSrc: string, priorSrc: string,
  opts?: SubsumeOptions): OutcomeReport {
  const options = opts ?? {}
  const load = (src: string, path?: string): any => {
    const aontu = new Aontu(includeOpts(options))
    const ctx = aontu.ctx({ collect: true })
    const v: any = aontu.unify(src, null == path ? undefined : { path }, ctx)
    return 0 < ctx.err.length || true === v?.isNil ? undefined : v
  }
  const next = load(nextSrc, options.generalPath)
  const prior = load(priorSrc, options.specificPath)
  if (null == next || null == prior) {
    return { verdict: 'error', findings: [] }
  }
  const st: OutcomeState = {
    findings: [],
    nextUrl: options.generalUrl ?? 'general',
    priorUrl: options.specificUrl ?? 'specific',
  }
  walk(st, prior, next, [])
  return { verdict: 0 === st.findings.length ? 'ok' : 'breaking', findings: st.findings }
}
