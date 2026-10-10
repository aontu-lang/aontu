/* Copyright (c) 2026 Richard Rodger, MIT License */


// Where the importer wrote each keyword, and vet's output units (ADR-066).

import { createHash } from 'node:crypto'

import type { VetReport, VetSite } from './vet'


// A span of the aontu text, as byte offsets into its UTF-8, end exclusive,
// and the keyword written there. A frame is the schema a reference reached,
// 0 the root; `keyword` is the pointer from the frame's schema, `absolute`
// the keyword's resource URI with its pointer as the fragment.
export type SourceSpan = {
  start: number
  end: number
  frame: number
  keyword: string
  absolute: string
  enters?: number
  required?: true
}

export type SourceMap = {
  sha256: string
  spans: SourceSpan[]
}

export type OutputUnit = {
  valid: boolean
  keywordLocation: string
  absoluteKeywordLocation?: string
  instanceLocation: string
  error?: string
  errors?: OutputUnit[]
}

export type VetOutput = { valid: boolean } | OutputUnit


export function textSha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}


// The characters a URI fragment holds as themselves (RFC 3986, 3.5).
const FRAGMENT_RE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/

export function fragmentOf(ptr: string): string {
  let out = ''
  for (const ch of ptr) {
    out += FRAGMENT_RE.test(ch) ? ch : [...Buffer.from(ch, 'utf8')]
      .map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')
  }
  return out
}


export function pointerOf(segs: string[]): string {
  return segs.map((s) => '/' + s.replace(/~/g, '~0').replace(/\//g, '~1')).join('')
}

function segmentsOf(ptr: string): string[] {
  return '' === ptr ? [] : ptr.slice(1).split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}


type Tok = { start: number, end: number, text: string, atom: boolean }

const BREAK_RE = /[ \t\n\r{}[\](),:"|&?]/

// The importer's text as tokens: a string, a bracket, a comma or a colon,
// one of `| & ?`, or a run of anything else. Only brackets, commas and
// colons are ones the formatter may add or drop.
function tokens(s: string): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < s.length;) {
    const c = s[i]
    let j = i + 1
    if ('"' === c) {
      while (j < s.length && '"' !== s[j]) {
        j += '\\' === s[j] ? 2 : 1
      }
      j++
    }
    else if (!BREAK_RE.test(c)) {
      while (j < s.length && !BREAK_RE.test(s[j])) {
        j++
      }
    }
    if (!' \t\n\r'.includes(c)) {
      out.push({ start: i, end: Math.min(j, s.length), text: s.slice(i, j), atom: !'{}[](),:'.includes(c) })
    }
    i = j
  }
  return out
}


// A key the importer quotes, the formatter may write bare.
function sameAtom(printed: string, formatted: string): boolean {
  return printed === formatted || ('"' === printed[0] && printed.slice(1, -1) === formatted)
}


// For each atom that starts a line, the atom starting the line before it
// at the same column, in the same block, else -1; and each atom's line.
function heads(text: string, F: Tok[], fa: number[]): { prev: number[], line: number[] } {
  const prev = fa.map(() => -1)
  const line = fa.map(() => 0)
  const open = new Map<number, number>()
  let from = 0
  let at = 0
  let k = 0
  for (let t = 0; t < F.length; t++) {
    const gap = 0 === t ? 0 : F[t - 1].end
    const nl = text.slice(gap, F[t].start).lastIndexOf('\n')
    from = -1 === nl ? from : gap + nl + 1
    at += 0 < t && -1 !== nl ? 1 : 0
    const col = F[t].start - from
    const first = 0 === t || -1 !== nl
    for (const c of first ? [...open.keys()] : []) {
      if (c > col) {
        open.delete(c)
      }
    }
    if (F[t].atom) {
      prev[k] = first ? open.get(col) ?? -1 : -1
      line[k] = at
      if (first) {
        open.set(col, k)
      }
      k++
    }
  }
  return { prev, line }
}


// How many atoms from `j` the formatter wrote as a copy of the head of
// the line before, ahead of the atom the printed text has next: the
// prefix it repeats for each member of a map it lays out one to a line.
function repeated(head: { prev: number[], line: number[] }, fa: number[], F: Tok[],
  j: number, next: string): number {
  const s = head.prev[j]
  for (let h = 1; -1 !== s && j + h < fa.length && head.line[s + h - 1] === head.line[s] &&
    head.line[j + h] === head.line[j]; h++) {
    if (F[fa[j + h - 1]].text !== F[fa[s + h - 1]].text) {
      return 0
    }
    if (sameAtom(next, F[fa[j + h]].text)) {
      return h
    }
  }
  return 0
}


// The UTF-8 offset of each UTF-16 offset of a text.
function byteOffsets(text: string): number[] {
  const out: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    out.push(out[i] + (c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 :
      c >= 0xdc00 && c < 0xe000 ? 0 : 3))
  }
  return out
}


// Each range of the printed string, carried to the formatted text as byte
// offsets into its UTF-8, by the tokens the two share; undefined where none
// survived. The formatter keeps every token but brackets, commas and colons
// in order, and past one that differs nothing is carried.
export function carry(printed: string, formatted: string,
  ranges: { start: number, end: number }[]): ({ start: number, end: number } | undefined)[] {
  const P = tokens(printed)
  const F = tokens(formatted)
  const pa = P.flatMap((t, i) => t.atom ? [i] : [])
  const fa = F.flatMap((t, i) => t.atom ? [i] : [])
  const head = heads(formatted, F, fa)
  const to: number[] = P.map(() => -1)
  const mp: number[] = []
  const mf: number[] = []
  let i = 0
  let j = 0
  const follows = (pi: number, fj: number): boolean =>
    pi < pa.length && fj < fa.length && sameAtom(P[pa[pi]].text, F[fa[fj]].text)
  while (i < pa.length && j < fa.length) {
    const h = repeated(head, fa, F, j, P[pa[i]].text)
    // Where the atom also matches in place, the copy is skipped only if
    // the atom after it then lines up and does not otherwise.
    j += 0 < h && (!follows(i, j) || (!follows(i + 1, j + 1) && follows(i + 1, j + h + 1))) ? h : 0
    if (!follows(i, j)) {
      break
    }
    to[pa[i]] = fa[j]
    mp.push(pa[i++])
    mf.push(fa[j++])
  }
  // Between carried atoms, the punctuation pairs in order.
  for (let k = 0; k <= mp.length; k++) {
    const p1 = k < mp.length ? mp[k] : i < pa.length ? pa[i] : P.length
    const f1 = k < mf.length ? mf[k] : j < fa.length ? fa[j] : F.length
    let n = 0 === k ? 0 : mf[k - 1] + 1
    for (let m = 0 === k ? 0 : mp[k - 1] + 1; m < p1; m++) {
      let q = n
      while (q < f1 && F[q].text !== P[m].text) {
        q++
      }
      to[m] = q < f1 ? q : -1
      n = q < f1 ? q + 1 : n
    }
  }
  const bytes = byteOffsets(formatted)
  // The first token at or after an offset; a range ends between tokens.
  const lower = (x: number): number => {
    let lo = 0
    let hi = P.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      lo = P[mid].start < x ? mid + 1 : lo
      hi = P[mid].start < x ? hi : mid
    }
    return lo
  }
  return ranges.map(({ start, end }) => {
    let a = lower(start)
    let b = lower(end) - 1
    while (a <= b && -1 === to[a]) {
      a++
    }
    while (a <= b && -1 === to[b]) {
      b--
    }
    return b < a ? undefined : { start: bytes[F[to[a]].start], end: bytes[F[to[b]].end] }
  })
}


// A source map read back, undefined unless shaped as the importer writes.
export function readSourceMap(text: string): SourceMap | undefined {
  let map: any
  try {
    map = JSON.parse(text)
  }
  catch {
    return undefined
  }
  const count = (v: unknown): boolean => Number.isSafeInteger(v) && 0 <= (v as number)
  return null !== map && 'object' === typeof map && 'string' === typeof map.sha256 &&
    /^[0-9a-f]{64}$/.test(map.sha256) && Array.isArray(map.spans) &&
    map.spans.every((s: any) => null !== s && 'object' === typeof s && count(s.start) &&
      count(s.end) && count(s.frame) && 'string' === typeof s.keyword &&
      'string' === typeof s.absolute && (undefined === s.enters || count(s.enters)) &&
      (undefined === s.required || true === s.required)) ? map : undefined
}


// The UTF-8 offset of a site's 1-based row and UTF-16 column.
function siteByte(text: string, site: VetSite): number {
  const idx = text.split('\n').slice(0, site.row - 1)
    .reduce((n, line) => n + line.length + 1, 0) + site.col - 1
  return Buffer.byteLength(text.slice(0, idx), 'utf8')
}


type Step = { key: string } | { index: string } | { any: 'key' | 'index' }

const INDEX_RE = /^(0|[1-9][0-9]*)$/

// The instance steps a keyword's pointer takes from its schema, read in
// whichever dialect wrote it: a property, an index, any of either, or
// none where an applicator stays at the instance it is given.
function steps(keyword: string): Step[] {
  const segs = segmentsOf(keyword)
  const out: Step[] = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const next = segs[i + 1]
    if ('properties' === s) {
      out.push({ key: next })
      i++
    }
    else if ('prefixItems' === s || ('items' === s && INDEX_RE.test(next ?? ''))) {
      out.push({ index: next })
      i++
    }
    else if (['additionalProperties', 'unevaluatedProperties', 'propertyNames',
      'patternProperties'].includes(s)) {
      out.push({ any: 'key' })
      i += 'patternProperties' === s ? 1 : 0
    }
    else if (['items', 'additionalItems', 'contains', 'unevaluatedItems'].includes(s)) {
      out.push({ any: 'index' })
    }
    else if (['allOf', 'anyOf', 'oneOf', 'dependentSchemas', 'dependencies',
      '$defs', 'definitions'].includes(s)) {
      i++
    }
    else if (!['not', 'if', 'then', 'else', '$ref', '$dynamicRef', '$recursiveRef'].includes(s)) {
      break
    }
  }
  return out
}

function fits(step: Step, seg: string): boolean {
  return 'key' in step ? step.key === seg : 'index' in step ? step.index === seg :
    'key' === step.any || INDEX_RE.test(seg)
}


export type Located = { keyword: string, absolute: string, instance: string[] }

// Where a finding's schema site was written: the innermost span holding
// it, and the references that led there, chosen so the instance steps
// they take spell the finding's path. A member the data lacks is placed
// at the `required` that asked for it, on the object that lacks it.
export function locate(map: SourceMap, text: string, site: VetSite, instance: string[],
  missing: boolean): Located | undefined {
  const at = siteByte(text, site)
  const holding = map.spans.filter((s) => s.start <= at && at < s.end)
  const asked = missing ? holding.filter((s) => true === s.required) : []
  const span = 0 < asked.length ? asked[asked.length - 1] : holding[holding.length - 1]
  if (undefined === span) {
    return undefined
  }
  const path = 0 < asked.length ? instance.slice(0, -1) : instance
  const own = steps(span.keyword)
  const tried = new Set<string>()
  const climb = (frame: number, need: number): string | undefined => {
    if (0 === frame || tried.has(frame + ':' + need)) {
      return 0 === frame && 0 === need ? '' : undefined
    }
    tried.add(frame + ':' + need)
    for (const ref of map.spans.filter((s) => s.enters === frame)) {
      const st = steps(ref.keyword)
      const from = need - st.length
      const up = 0 <= from && st.every((x, i) => fits(x, path[from + i])) ?
        climb(ref.frame, from) : undefined
      if (undefined !== up) {
        return up + ref.keyword
      }
    }
    return undefined
  }
  // The site may sit above the finding's path, as a closed map does.
  for (let need = path.length; own.length <= need; need--) {
    const from = need - own.length
    const up = own.every((x, i) => fits(x, path[from + i])) ? climb(span.frame, from) : undefined
    if (undefined !== up) {
      return { keyword: up + span.keyword, absolute: span.absolute, instance: path }
    }
  }
  // No chain spells the path: the first reference into each frame.
  const first = (frame: number, seen: Set<number>): string => {
    const ref = seen.has(frame) ? undefined : map.spans.find((s) => s.enters === frame)
    return undefined === ref ? '' : first(ref.frame, seen.add(frame)) + ref.keyword
  }
  return { keyword: first(span.frame, new Set([0])) + span.keyword, absolute: span.absolute,
    instance: path }
}


// A vet report as JSON Schema's output units: `flag` is the verdict alone,
// `basic` a unit per error kept, located by the schema text's source map.
export function vetOutput(report: VetReport, form: 'flag' | 'basic',
  schema?: { text: string, map: SourceMap }): VetOutput {
  const valid = 'valid' === report.verdict
  if ('flag' === form || undefined === schema) {
    return { valid }
  }
  const root = schema.map.spans.find((s) => 0 === s.frame && '' === s.keyword)
  const errors = report.findings.filter((f) => 'error' === f.severity).map((f) => {
    const instance = segmentsOf(f.pointer ?? '')
    const site = f.sites.find((s) => 'schema' === s.role && 0 < s.row)
    const missing = 0 < instance.length && !f.sites.some((s) => 'data' === s.role)
    const at = undefined === site ? undefined : locate(schema.map, schema.text, site, instance, missing)
    return {
      valid: false,
      keywordLocation: at?.keyword ?? '',
      ...(undefined === at ? {} : { absoluteKeywordLocation: at.absolute }),
      instanceLocation: pointerOf(at?.instance ?? instance),
      error: f.message,
    }
  })
  return {
    valid,
    keywordLocation: '',
    ...(undefined === root ? {} : { absoluteKeywordLocation: root.absolute }),
    instanceLocation: '',
    ...(0 === errors.length ? {} : { errors }),
  }
}
