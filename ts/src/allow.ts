/* Copyright (c) 2025 Richard Rodger, MIT License */


import { Aontu } from './aontu'
import { ConjunctVal } from './val/ConjunctVal'
import { anchorAt, engineFinding } from './vet'
import type { VetFinding } from './vet'
import { evalFailure, nearestKey, pathParts } from './query'
import { includeOpts } from './utility'
import type { IncludeOptions } from './utility'


// Where the roles map lives when the caller does not say.
export const ALLOW_AT = '$.roles'


export type AllowVerdict = 'allowed' | 'refused' | 'error'


// What decided one path: the entry that covers it, the entry that
// intersects it, nothing at all, or a role the model does not declare.
export type AllowReason = 'allow' | 'deny' | 'uncovered' | 'no_role'


export type AllowDecision = {
  path: string
  allowed: boolean
  reason: AllowReason
  by?: string           // the deciding entry's path in the role model
  pattern?: string      // that entry's text, as the author wrote it
}


export type AllowReport = {
  verdict: AllowVerdict
  role: string
  paths: AllowDecision[]
  findings: VetFinding[]
}


export type AllowOptions = IncludeOptions & {
  // Where the role model came from: relative loads resolve against
  // its directory, and a finding's site names it.
  path?: string
  // The path of the roles map inside the model (default `$.roles`).
  at?: string
}


const ENTRY = 'string & re("^[$]") & re("[^.]$")'

// The shape every role must satisfy, in the language: a list of
// subtree entries to allow, and optionally one to deny.
const ROLE_SHAPE = `{ allow: [&: ${ENTRY}] deny?: [&: ${ENTRY}] }`


function shapeSource(at: string): string {
  const keys = pathParts(at).map((p) => JSON.stringify(p))
  return 0 === keys.length
    ? '&: ' + ROLE_SHAPE
    : keys.join(': ') + ': { &: ' + ROLE_SHAPE + ' }'
}


// `$.a.b` for a segment list, `$` for none: the spelling every report
// uses for a path, whatever the caller wrote.
function pathText(parts: string[]): string {
  return '$' + (0 < parts.length ? '.' + parts.join('.') : '')
}


function finding(
  code: string, path: string, message: string, note?: string): VetFinding {
  return {
    code,
    class: 'reference',
    severity: 'error',
    path,
    message,
    sites: [],
    ...(null == note ? {} : { note }),
  }
}


type Entry = {
  parts: string[]
  text: string
  by: string
}


function readEntries(
  list: any, by: string, ctx: any,
): { entries: Entry[], finding?: VetFinding } {
  const entries: Entry[] = []
  for (let i = 0; i < list.peg.length; i++) {
    const el: any = list.peg[i]
    const before = ctx.err.length
    const text: string = true === el.isString ? el.peg : el.gen(ctx)
    if (before < ctx.err.length) {
      const err: any = ctx.err[before]
      return { entries, finding: engineFinding(err, ctx, `${by}.${i}`) }
    }
    entries.push({ parts: pathParts(text), text, by: `${by}.${i}` })
  }
  return { entries }
}


// One segment of an entry against one segment of a path: `*` matches
// any key, anything else matches itself.
function segmentMatches(pattern: string, segment: string): boolean {
  return '*' === pattern || pattern === segment
}


function intersects(entry: string[], path: string[]): boolean {
  const n = Math.min(entry.length, path.length)
  for (let i = 0; i < n; i++) {
    if (!segmentMatches(entry[i], path[i])) {
      return false
    }
  }
  return true
}


function covers(entry: string[], path: string[]): boolean {
  return entry.length <= path.length && intersects(entry, path)
}


function decide(asked: string, allows: Entry[], denies: Entry[]): AllowDecision {
  const parts = pathParts(asked)
  const path = pathText(parts)

  for (const d of denies) {
    if (intersects(d.parts, parts)) {
      return { path, allowed: false, reason: 'deny', by: d.by, pattern: d.text }
    }
  }
  for (const a of allows) {
    if (covers(a.parts, parts)) {
      return { path, allowed: true, reason: 'allow', by: a.by, pattern: a.text }
    }
  }
  return { path, allowed: false, reason: 'uncovered' }
}


function errorReport(role: string, f: VetFinding): AllowReport {
  return { verdict: 'error', role, paths: [], findings: [f] }
}


// Evaluate the role model, select the role, and decide every path.
export function allow(
  src: string, role: string, paths: string[], opts?: AllowOptions,
): AllowReport {
  const options = opts ?? {}
  const at = pathText(pathParts(options.at ?? ALLOW_AT))

  const aontu = new Aontu(includeOpts(options))
  const ctx = aontu.ctx({ collect: true })
  const parseOpts = null == options.path ? undefined : { path: options.path }

  const shape = aontu.parse(shapeSource(at), undefined, ctx)
  const model = aontu.parse(src, parseOpts, ctx)
  if (0 < ctx.err.length) {
    return errorReport(role, evalFailure(ctx))
  }
  const root: any = aontu.unify(
    new ConjunctVal({ peg: [model, shape] }, ctx), undefined, ctx)
  if (0 < ctx.err.length || true === root.isNil) {
    return errorReport(role, evalFailure(ctx, root))
  }

  const roles: any = anchorAt(root, at)
  const atRole = `${at}.${role}`
  if (!Object.prototype.hasOwnProperty.call(roles.peg, role)) {
    const near = nearestKey(role, Object.keys(roles.peg))
    return {
      verdict: 'refused',
      role,
      paths: paths.map((p) => ({
        path: pathText(pathParts(p)), allowed: false, reason: 'no_role',
      })),
      findings: [finding(
        'no_path',
        atRole,
        `The role ${role} is not declared at ${at} in this document.`,
        null == near ? undefined : `did you mean ${near}?`)],
    }
  }
  const node: any = roles.peg[role]

  const allows = readEntries(node.peg.allow, `${atRole}.allow`, ctx)
  if (null != allows.finding) {
    return errorReport(role, allows.finding)
  }
  const denies = readEntries(node.peg.deny, `${atRole}.deny`, ctx)
  if (null != denies.finding) {
    return errorReport(role, denies.finding)
  }

  const decisions = paths.map((p) => decide(p, allows.entries, denies.entries))

  // Nothing asked is nothing allowed: a gate that answered `allowed`
  // to an empty question would let a caller that dropped its
  // arguments through.
  const allowed = 0 < decisions.length && decisions.every((d) => d.allowed)

  return {
    verdict: allowed ? 'allowed' : 'refused',
    role,
    paths: decisions,
    findings: [],
  }
}
