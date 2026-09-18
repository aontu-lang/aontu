/* Copyright (c) 2025 Richard Rodger, MIT License */


import type { TrustOptions, Val } from './type'

import { Aontu } from './aontu'
import {
  dirname, isAbsolute, join as pathJoin, relative as pathRelative,
  resolve as pathResolve,
} from 'node:path'

import { descErr, getHint } from './err'
import { codeClass } from './hints'
import { ConjunctVal } from './val/ConjunctVal'
import { walkVals, collectNils } from './walk'
import { sizingResidue } from './val/BagVal'
import { collectDeprecations, walkBagVals, deprecationMessage,
  includeOpts,
} from './utility'
import { subsumeNode, effectiveDefault } from './subsume'
import { noPathFinding } from './query'
import { cmpCodePoint } from './keyorder'


export type VetVerdict = 'valid' | 'invalid' | 'incomplete' | 'error'

export type VetRole = 'data' | 'schema'

export type VetSite = {
  file: string
  row: number
  col: number
  len: number
  role: VetRole
  src?: string
  value?: string
}

export type VetFinding = {
  code: string
  class: string
  severity: 'error' | 'warning' | 'info'
  path: string
  message: string

  hint?: string

  sites: VetSite[]
  expected?: string
  actual?: string
  note?: string
}

export type VetCoverage = {
  checked: number
  declared: number
  // Data leaves in all, under `coverageAt` when it is given. `checked`
  // over this is the ratio a reader wants.
  leaves: number
  unchecked: string[]
  // The SHALLOWEST declarations no data path met.
  unused: string[]
  // NO data leaf was constrained, over a document that has leaves.
  // The exact condition of the `"*"` failure, and what
  // `--strict-coverage` exits 1 on.
  vacuous: boolean
}

export type VetReport = {
  verdict: VetVerdict
  truncated: boolean
  findings: VetFinding[]
  // Absent unless the run asked for it.
  coverage?: VetCoverage
}

export type VetOptions = {
  at?: string          // validate against this path of the schema
  closed?: boolean     // close() the anchor for this run
  partial?: boolean    // residue is not a failure
  maxErrors?: number   // cap the finding list (default 20)

  // Account for what the check examined (G11 phase 5). Off by default:
  // the report gains a `coverage` object only when this is set, so no
  // existing caller's report changes shape.
  coverage?: boolean
  coverageAt?: string
  schemaUrl?: string
  dataUrl?: string     // provenance label for data sites

  schemaPath?: string
  dataPath?: string

  trust?: TrustOptions

  // Extensions additionally read as text (the CLI's `--text-ext`).
  // Rides beside `trust` because it is the other half of what an
  // include may read.
  textExt?: string[]
}


// The default cap, exported because the CLI applies it to the WHOLE
// report across several data files and must not carry a second copy of
// the number (ts/src/cli.ts).
export const VET_MAX_ERRORS = 20

const DEFAULT_SCHEMA_URL = 'schema'
const DEFAULT_DATA_URL = 'data'


function stampUrl(v: any, url: string, seen?: Set<string>): Set<string> {
  const urls = seen ?? new Set<string>()
  urls.add(url)
  walkVals(v, (n: any) => {
    if (null == n.site.url || '' === n.site.url) {
      n.site.url = url
    }
    urls.add(n.site.url)
    return true
  }, new Set())
  return urls
}


type Prov = {
  // The urls the data walk reached. Roles are decided by membership,
  // on the RAW url -- never by a name comparison.
  data: Set<string>
  schemaUrl?: string
  schemaPath?: string
  dataUrl?: string
  dataPath?: string
}


export function displayFile(
  url: string, label: string, path?: string): string {
  if (url === label || null == path || '' === url || !isAbsolute(url)) {
    return url
  }
  const rel = pathRelative(dirname(pathResolve(path)), url)
  const dir = dirname(label)
  return '.' === dir ? rel : pathJoin(dir, rel)
}


function displayOf(file: string, role: VetRole, prov: Prov): string {
  return 'data' === role
    ? displayFile(file, prov.dataUrl ?? file, prov.dataPath)
    : displayFile(file, prov.schemaUrl ?? file, prov.schemaPath)
}


function roleOf(file: string, prov: Prov): VetRole {
  return prov.data.has(file) ? 'data' : 'schema'
}


function pathText(path?: string[]): string {
  return '$' + (null != path && 0 < path.length ? '.' + path.join('.') : '')
}


function siteOf(v: any, prov: Prov): VetSite | undefined {
  if (null == v) {
    return undefined
  }
  const file = v.site.url
  const role = roleOf(file, prov)
  return {
    file: displayOf(file, role, prov),
    row: v.site.row,
    col: v.site.col,
    len: v.site.len,
    role,
    src: v.site.src,
    value: v.canon,
  }
}


// The data site first — it is the thing to fix — then the schema site.
// The underlying NilVal fields are untouched: this is a report-layer
// projection, so the existing error.tsv assertions do not move.
function sitesOf(nil: any, prov: Prov): VetSite[] {
  const sites: VetSite[] = [siteOf(nil.primary ?? nil, prov) as VetSite]

  const secondary = siteOf(nil.secondary, prov)
  if (null != secondary) {
    sites.push(secondary)
  }

  return [
    ...sites.filter((s) => 'data' === s.role),
    ...sites.filter((s) => 'schema' === s.role),
  ]
}


function materialise(nil: any, ctx: any): void {
  if (null == nil.msg || '' === nil.msg) {
    descErr(nil, ctx)
  }
}


const UNSHAPED = 'unify_failed'


// The terminal colour escapes the parser puts in its message text. A
// RegExp built from a string, not a literal: the escape is a control
// character, and spelling it `\u001b` keeps the source readable.
const ANSI_RE = new RegExp('\u001b\\[[0-9;]*m', 'g')

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}


// The registry's hint and a code's own `details` fields: the same set
// on every finding reporting an ENGINE code.
function fromRegistry(finding: VetFinding, nil: any): VetFinding {
  const details = nil.details ?? {}

  const hint = getHint(nil.why, nil.details)
  if (null != hint && '' !== hint) {
    finding.hint = stripAnsi(hint).replace(/\s+$/, '')
  }

  if ('string' === typeof details.expected) {
    finding.expected = details.expected
  }
  if ('string' === typeof details.actual) {
    finding.actual = details.actual
  }
  if ('string' === typeof details.message) {
    finding.note = details.message
  }

  return finding
}


function findingOf(nil: any, prov: Prov): VetFinding {
  return fromRegistry({
    code: nil.why,
    class: nil.class,
    severity: 'error',
    path: pathText(nil.path),
    message: stripAnsi(nil.msg.split('\n')[0]),
    sites: sitesOf(nil, prov),
  }, nil)
}


const ORDER_PAD = 9


function pad(n: number): string {
  return String(n).padStart(ORDER_PAD, '0')
}


function orderKey(f: VetFinding, index: number): string {
  const site = f.sites[0]
  return [
    site.file,
    pad(site.row),
    pad(site.col),
    f.code,
    f.path,
    pad(index),
  ].join('\u0000')
}


// An ENGINE code at a path the caller names: class from the registry
// through NilVal.class, message materialised first (a `gen` nil has none).
export function engineFinding(
  nil: any, ctx: any, path: string): VetFinding {
  if (null == nil) {
    return fromRegistry({
      code: UNSHAPED,
      class: codeClass(UNSHAPED),
      severity: 'error',
      path,
      message: 'The document does not evaluate.',
      sites: [],
    }, { why: UNSHAPED })
  }

  materialise(nil, ctx)

  return fromRegistry({
    code: nil.why,
    class: nil.class,
    severity: 'error',
    path,
    message: stripAnsi(nil.msg.split('\n')[0]),
    sites: [],
  }, nil)
}


export function failureFinding(
  ctx: any, url?: string, failed?: any): VetFinding {
  const nil: any = ctx.err[0] ?? failed
  materialise(nil, ctx)

  const at = url ?? ''
  const urls = new Set([at])
  for (const v of [nil, nil.primary, nil.secondary]) {
    if (null == v || null == v.site) {
      continue
    }
    if (null == v.site.url || '' === v.site.url) {
      v.site.url = at
    }
    urls.add(v.site.url)
  }

  return findingOf(nil, { data: urls })
}


// Walk the evaluated schema to the anchor path. `$` and `$.a.b` are
// both accepted, as is the bare `a.b` a shell is likely to hand over
// unquoted.
export function anchorAt(root: any, at: string): Val | undefined {
  const trimmed = at.startsWith('$') ? at.slice(1) : at
  const parts = trimmed.split('.').filter((p) => '' !== p)

  let node: any = root
  for (const part of parts) {
    node = throughResidue(node)

    if (true === node?.isMap) {
      const peg = node.peg
      if (null == peg || !Object.prototype.hasOwnProperty.call(peg, part)) {
        return undefined
      }
      node = peg[part]
    }
    else if (true === node?.isList) {
      // CANONICAL DECIMAL, the spelling a reference uses for a list
      // index (`0`, or a non-zero digit run) -- so `$.a.01` names
      // nothing here exactly as it names nothing there.
      const peg = node.peg
      const index = Number(part)
      if (!/^(0|[1-9][0-9]*)$/.test(part) ||
        !Array.isArray(peg) || peg.length <= index) {
        return undefined
      }
      node = peg[index]
    }
    else {
      return undefined
    }
  }

  return node
}


export function throughResidue(v: any): any {
  return sizingResidue(v)?.bag ?? v
}


const COVER_TEMPLATE = '&'


// Is this value a bag with children to walk?
function coverKids(v: any): { key: string, val: any }[] {
  const out: { key: string, val: any }[] = []
  if (true === v.isMap && null != v.peg) {
    for (const k of Object.keys(v.peg).sort(cmpCodePoint)) {
      out.push({ key: k, val: v.peg[k] })
    }
  }
  else if (true === v.isList && Array.isArray(v.peg)) {
    v.peg.forEach((m: any, i: number) => out.push({ key: String(i), val: m }))
  }
  return out
}


function coverTemplate(v: any): any {
  const cj = v?.spread?.cj
  return null != cj && true === cj.isVal && true !== cj.isTop ? cj : undefined
}


function coverDeclare(
  v: any, path: string[], out: Map<string, any>): void {
  const tpl = coverTemplate(v)
  if (null != tpl) {
    const at = [...path, COVER_TEMPLATE]
    out.set(pathText(at), tpl)
    coverDeclare(tpl, at, out)
  }
  for (const { key, val } of coverKids(v)) {
    const at = [...path, key]
    out.set(pathText(at), val)
    coverDeclare(val, at, out)
  }
}


// Every path in the data, and whether it is a LEAF -- a node with no
// children, which is where a value lives.
function coverDataPaths(
  v: any, path: string[],
  out: { path: string, leaf: boolean }[]): void {
  const kids = coverKids(v)
  if (0 < path.length) {
    out.push({ path: pathText(path), leaf: 0 === kids.length })
  }
  for (const { key, val } of kids) {
    coverDataPaths(val, [...path, key], out)
  }
}


// Walk one data path down the schema, naming the declaration that
// constrains it -- the exact key where the schema has one, else the
// covering template. Undefined when the schema declares nothing there.
function coverMatch(
  anchor: any, segs: string[]): string | undefined {
  let at: any = anchor
  let decl = ''
  for (const seg of segs) {
    const named = true === at.isMap && null != at.peg ? at.peg[seg]
      : true === at.isList && Array.isArray(at.peg) ? at.peg[Number(seg)]
        : undefined
    if (null != named && true === named.isVal) {
      decl = '' === decl ? seg : decl + '.' + seg
      at = named
      continue
    }
    const tpl = coverTemplate(at)
    if (null == tpl) {
      return undefined
    }
    decl = '' === decl ? COVER_TEMPLATE : decl + '.' + COVER_TEMPLATE
    at = tpl
  }
  return '$.' + decl
}


// The SHALLOWEST members of a set of paths: one whose parent is also in
// the set is covered by naming the parent, and naming both is noise.
// `render --coverage`'s `dead` is built on the same rule.
function coverShallowest(paths: string[]): string[] {
  const held = new Set(paths)
  return paths.filter((p) => {
    for (let at = p; -1 !== at.lastIndexOf('.');) {
      at = at.slice(0, at.lastIndexOf('.'))
      if (held.has(at)) {
        return false
      }
    }
    return true
  }).sort(cmpCodePoint)
}


// The accounting itself: what the schema declared, what the data holds,
// and which of each the other met.
export function vetCoverage(
  anchor: any, dataVal: any, coverageAt?: string): VetCoverage {
  const declarations = new Map<string, any>()
  coverDeclare(anchor, [], declarations)

  const dataPaths: { path: string, leaf: boolean }[] = []
  coverDataPaths(dataVal, [], dataPaths)

  // `--coverage-at` narrows the DATA side, which is the side a caller
  // gating one subtree is asking about. The schema side follows from
  // it: a declaration is unused only among the data actually measured.
  const under = null == coverageAt ? undefined
    : coverageAt.replace(/^\$\.?/, '')
  const inScope = (p: string): boolean => {
    if (null == under || '' === under) {
      return true
    }
    const want = '$.' + under
    return p === want || p.startsWith(want + '.')
  }

  const used = new Set<string>()
  const unchecked: string[] = []
  let checked = 0
  let leaves = 0
  for (const { path, leaf } of dataPaths) {
    if (!inScope(path)) {
      continue
    }
    const segs = path.replace(/^\$\.?/, '').split('.').filter((x) => '' !== x)
    const decl = coverMatch(anchor, segs)
    if (leaf) {
      leaves++
    }
    if (null == decl) {
      unchecked.push(path)
      continue
    }
    used.add(decl)
    if (leaf) {
      checked++
    }
  }

  // A declaration is met when it constrained a data path, or when a
  // declaration BENEATH it was: `$.a` is used by `$.a.b` meeting
  // `$.a.b`, and reporting the parent as unused would be false.
  const unused: string[] = []
  for (const decl of declarations.keys()) {
    const covered = used.has(decl) ||
      [...used].some((u) => u.startsWith(decl + '.'))
    if (!covered) {
      unused.push(decl)
    }
  }

  return {
    checked,
    declared: declarations.size,
    leaves,
    unchecked: coverShallowest(unchecked),
    unused: coverShallowest(unused),
    vacuous: 0 === checked && 0 < leaves,
  }
}


export function vet(
  schemaSrc: string, dataSrc: string, opts?: VetOptions): VetReport {
  const options = opts ?? {}
  const schemaUrl = options.schemaUrl ?? DEFAULT_SCHEMA_URL
  const dataUrl = options.dataUrl ?? DEFAULT_DATA_URL
  const maxErrors = options.maxErrors ?? VET_MAX_ERRORS

  const aontu = new Aontu(includeOpts(options))
  const schemaOpts = null == options.schemaPath ?
    undefined : { path: options.schemaPath }
  const dataOpts = null == options.dataPath ?
    undefined : { path: options.dataPath }

  // 1. The schema alone. If it does not stand up on its own, the data
  //    is never blamed for it.
  const schemaCtx = aontu.ctx({ collect: true })
  const schemaVal: any = aontu.unify(schemaSrc, schemaOpts, schemaCtx)
  if (0 < schemaCtx.err.length || true === schemaVal?.isNil) {
    const failure: any =
      0 < schemaCtx.err.length ? schemaCtx.err[0] : schemaVal
    stampUrl(schemaVal, schemaUrl)
    stampUrl(failure, schemaUrl)
    materialise(failure, schemaCtx)
    return {
      verdict: 'error',
      truncated: false,
      // A schema that does not stand up: nothing here is data, so the
      // data-url set is empty and every site reads `schema`.
      findings: [findingOf(failure, { data: new Set<string>() })],
    }
  }

  // 2. The anchor: the whole schema, or the value at `--at`.
  let anchor: any = schemaVal
  if (null != options.at) {
    anchor = anchorAt(schemaVal, options.at)
    if (null == anchor) {
      return {
        verdict: 'error',
        truncated: false,
        findings: [noPathFinding(schemaVal, options.at)],
      }
    }
  }

  // 3. Both documents get their provenance stamped BEFORE they meet, so
  //    every site in the result knows which document it came from.
  const dataCtx = aontu.ctx({ collect: true })
  const dataVal: any = aontu.parse(dataSrc, dataOpts, dataCtx)
  if (0 < dataCtx.err.length || null == dataVal) {
    const failure = dataCtx.err[0]
    if (null == failure) {
      return { verdict: 'error', truncated: false, findings: [] }
    }
    failure.site.url = dataUrl
    materialise(failure, dataCtx)
    return {
      verdict: 'invalid',
      truncated: false,
      findings: [findingOf(failure, { data: new Set([dataUrl]) })],
    }
  }
  stampUrl(schemaVal, schemaUrl)
  const dataUrls = stampUrl(dataVal, dataUrl)
  // The projection every site in this report goes through: roles by
  // url-set membership, names by how the caller reached each document.
  const prov: Prov = {
    data: dataUrls,
    schemaUrl, schemaPath: options.schemaPath,
    dataUrl, dataPath: options.dataPath,
  }

  let coverage: VetCoverage | undefined
  if (true === options.coverage) {
    const coverCtx = aontu.ctx({ collect: true })
    const settledData: any = aontu.unify(dataSrc, dataOpts, coverCtx)
    // A data document that does not stand alone is already reported by
    // the meet below; here it falls back to what was parsed, which is
    // the same paths minus whatever an include would have added.
    const measured = 0 === coverCtx.err.length && true !== settledData?.isNil
      ? settledData : dataVal
    coverage = vetCoverage(anchor, measured, options.coverageAt)
  }

  const lintFindings: VetFinding[] = []
  walkBagVals(anchor, (v: any, path: string[]): void => {
    if (true === v.isDisjunct && Array.isArray(v.peg)) {
      const d = effectiveDefault(v)
      if (null != d && 'indeterminate' !== d) {
        const rest = v.peg.filter((m: any) => true !== m?.isPref)
        const state: any = {
          profile: 'values', findings: [],
          generalUrl: schemaUrl, specificUrl: schemaUrl,
        }
        const admitted = rest.some(
          (m: any) => 'yes' === subsumeNode(state, path, m, d))
        if (!admitted && 0 < rest.length) {
          lintFindings.push({
            code: 'pref_not_instance',
            class: 'compat',
            severity: 'warning',
            path: pathText(path),
            message: 'the default ' + d.canon +
              ' is not an instance of any remaining alternative of ' +
              v.canon,
            sites: [{
              file: schemaUrl,
              row: d.site?.row ?? -1,
              col: d.site?.col ?? -1,
              len: d.site?.len ?? -1,
              role: 'schema',
              src: d.site?.src ?? '',
              value: d.canon,
            }],
          })
        }
      }
    }
  })

  if (true === options.closed && (true === anchor.isMap || true === anchor.isList)) {
    anchor.closed = true
  }

  const ctx = aontu.ctx({ collect: true })
  let meetAnchor: any = anchor
  if (null == options.at) {
    const meetCtx = aontu.ctx({ collect: true })
    const freshSchema: any = aontu.parse(schemaSrc, schemaOpts, meetCtx)
    if (0 === meetCtx.err.length && null != freshSchema) {
      meetAnchor = freshSchema
      if (true === options.closed &&
        (true === meetAnchor.isMap || true === meetAnchor.isList)) {
        meetAnchor.closed = true
      }
      stampUrl(meetAnchor, schemaUrl)
    }
  }
  else {
    ; (ctx as any)._fixroot = schemaVal
    ; (ctx as any).path = options.at.replace(/^\$\.?/, '')
      .split('.').filter((s: string) => '' !== s)
  }
  const pair = new ConjunctVal({ peg: [meetAnchor, dataVal] }, ctx)
  const unified: any = aontu.unify(pair, undefined, ctx)

  const seen = new Set<any>()
  const nils: any[] = collectNils(unified, seen)
  for (const err of ctx.err) {
    if (true === err?.isNil && '|:trial-nil' !== err.why && !seen.has(err)) {
      seen.add(err)
      nils.push(err)
    }
  }

  const findings: VetFinding[] = nils.map((n) => {
    materialise(n, ctx)
    return findingOf(n, prov)
  })

  const genCtx: any = aontu.ctx({ collect: true })
  genCtx.root = unified
  genCtx.probe = null != options.at
  unified.gen(genCtx)
  for (const err of genCtx.err) {
    if ('incomplete' === err.class || 'conflict' === err.class) {
      materialise(err, genCtx)
      findings.push(findingOf(err, prov))
    }
  }

  findings.push(...lintFindings)
  for (const { val, path } of collectDeprecations(unified)) {
    const v: any = val
    // The same file/role projection sitesOf makes: the url as stamped
    // (empty when the value belongs to neither document), the role by
    // comparing it to the data document's.
    const file = v.site.url
    findings.push({
      code: 'deprecated',
      class: 'compat',
      severity: 'warning',
      path: pathText(path),
      message: deprecationMessage(v.deprecation),
      sites: [{
        file: displayOf(file, roleOf(file, prov), prov),
        row: v.site.row ?? -1,
        col: v.site.col ?? -1,
        len: v.site.len ?? -1,
        role: roleOf(file, prov),
        src: v.site.src ?? '',
        value: v.canon,
      }],
    })
  }

  const keyed = findings.map((f, i) => ({ key: orderKey(f, i), finding: f }))
  keyed.sort((a, b) => a.key < b.key ? -1 : 1)
  let ordered = keyed.map((k) => k.finding)

  const causeKey = (f: VetFinding): string =>
    f.code + '\u0000' + f.sites.map((s) =>
      [s.file, s.row, s.col, s.role, s.value].join('\u0000')).join('\u0000')
  const depth = (f: VetFinding): number => f.path.split('.').length
  const deepest = new Map<string, VetFinding>()
  for (const f of ordered) {
    const cause = causeKey(f)
    const held = deepest.get(cause)
    if (null == held || depth(held) < depth(f)) {
      deepest.set(cause, f)
    }
  }
  const causes = new Set<string>()
  ordered = ordered.filter((f) => {
    const cause = causeKey(f)
    if (causes.has(cause) || deepest.get(cause) !== f) {
      return false
    }
    causes.add(cause)
    return true
  })

  const truncated = maxErrors < ordered.length
  const kept = truncated ? ordered.slice(0, maxErrors) : ordered

  let verdict: VetVerdict = 'valid'
  const errors = ordered.filter((f) => 'error' === f.severity)
  const unmet = errors.filter((f) => 'incomplete' === f.class).length
  if (unmet < errors.length) {
    verdict = 'invalid'
  }
  else if (0 < unmet && true !== options.partial) {
    verdict = 'incomplete'
  }

  return {
    verdict, truncated, findings: kept,
    ...(null == coverage ? {} : { coverage }),
  }
}
