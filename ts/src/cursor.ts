/* Copyright (c) 2025 Richard Rodger, MIT License */


import { Aontu } from './aontu'
import { whyParts } from './query'
import { cmpCodePoint } from './keyorder'
import type { TrustOptions } from './type'


type Position = { line: number, character: number }

type Range = { start: Position, end: Position }

type CursorOn = 'key' | 'value' | 'ref'

// What a cursor is on, the path that stands there and, on a reference,
// the absolute path it reads.
type CursorPath = {
  on: CursorOn
  path: string[]
  range: Range
  reads?: string[]
}

type PathSite = { canon: string, file: string, range: Range, role: string }

type CursorOptions = { trust?: TrustOptions }

type Hit = {
  on: CursorOn, path: string[], start: number, end: number, reads?: string[]
}


const KEY_DELIMS = ' \t\r\n{}[](),:;"\''

const TOKEN_END = KEY_DELIMS + '&|'


function lineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if ('\n' === src[i]) {
      starts.push(i + 1)
    }
  }
  return starts
}


// A character past the end of its line is the line's end, as LSP has it.
function offsetAt(src: string, starts: number[], pos: Position): number {
  const end = pos.line + 1 < starts.length ? starts[pos.line + 1] - 1 : src.length
  return starts[pos.line] + Math.max(0, Math.min(pos.character, end - starts[pos.line]))
}


function positionOf(starts: number[], off: number): Position {
  let line = starts.length - 1
  while (0 < line && off < starts[line]) {
    line--
  }
  return { line, character: off - starts[line] }
}


function siteOffset(starts: number[], v: any): number {
  const row = v.site?.row ?? -1
  const col = v.site?.col ?? -1
  return 1 > row || 1 > col || starts.length < row ? -1 : starts[row - 1] + col - 1
}


// Where quoted text that opens at k closes, or the end of the source.
function quoteEnd(src: string, k: number): number {
  let e = k + 1
  while (e < src.length && src[k] !== src[e]) e += '\\' === src[e] ? 2 : 1
  return e
}


// Where a `#` comment starts between from and to, or -1.
function commentStart(src: string, from: number, to: number): number {
  for (let k = from; k < to; k++) {
    if ('"\'`'.includes(src[k])) {
      k = quoteEnd(src, k)
    }
    else if ('#' === src[k]) {
      return k
    }
  }
  return -1
}


// Back from i over blanks and comments to the last character of neither.
function skipTrivia(src: string, i: number): number {
  for (;;) {
    while (0 <= i && ' \t\r\n'.includes(src[i])) i--
    const c = 0 > i ? -1 : commentStart(src, src.lastIndexOf('\n', i) + 1, i + 1)
    if (0 > c) {
      return i
    }
    i = c - 1
  }
}


// The key written just before a value, where it is the path's last
// segment: `seg:`, `seg?:` or `"seg":` with blanks or comments between.
function keySpan(src: string, at: number, seg: string): [number, number] | undefined {
  let i = skipTrivia(src, at - 1)
  if (':' !== src[i]) {
    return undefined
  }
  i--
  if ('?' === src[i]) i--
  while (0 <= i && ' \t'.includes(src[i])) i--
  if (0 > i) {
    return undefined
  }
  const q = src[i]
  let j = i
  if ('"' === q || '\'' === q) {
    j--
    while (0 <= j && (q !== src[j] || '\\' === src[j - 1])) j--
    return 0 <= j && src.slice(j + 1, i) === seg ? [j, i + 1] : undefined
  }
  while (0 <= j && !KEY_DELIMS.includes(src[j])) j--
  const word = src.slice(j + 1, i + 1)
  return word === seg || word === '%' + seg ? [j + 1, i + 1] : undefined
}


function kids(v: any, path: string[]): [any, string[]][] {
  if ((true === v.isMap || true === v.isList) && null != v.peg) {
    const keys = Object.keys(v.peg)
    if (true === v.isMap) {
      keys.sort(cmpCodePoint)
    }
    const aliases: string[] = v.aliasKeys ?? []
    const out: [any, string[]][] = keys.filter((k) => !aliases.includes(k))
      .map((k) => [v.peg[k], [...path, k]])
    if (null != v.spread?.cj) {
      out.push([v.spread.cj, [...path, '&']])
    }
    return out
  }
  if (true === v.isConjunct || true === v.isDisjunct || true === v.isFunc ||
    true === v.isPlusOp) {
    return (v.peg as any[]).map((k) => [k, path])
  }
  return true === v.isPref ? [[v.peg, path]] : []
}


// A reference as written at a site, read to its end, with a quoted
// segment read as its text: `$."a b"` spells `$.a b`.
function refSpan(src: string, at: number): [number, string] {
  let p = at
  let out = '$' === src[p] ? (p++, '$') : ''
  while ('.' === src[p]) {
    p++
    const s = p
    if ('"' === src[p] || '\'' === src[p]) {
      p = quoteEnd(src, p) + 1
      out += '.' + src.slice(s + 1, p - 1)
      continue
    }
    while (p < src.length && '.' !== src[p] && !TOKEN_END.includes(src[p])) p++
    out += '.' + src.slice(s, p)
  }
  return [p, out]
}


// Where the value sited at `at` ends: a sign runs to its number's end,
// and an open paren to the one that closes it.
function valueEnd(src: string, at: number, text: string): number {
  let p = at + 1
  if ('-' === text || '+' === text) {
    while (p < src.length && !TOKEN_END.includes(src[p])) p++
    return p
  }
  if ('(' === text) {
    for (let depth = 1; p < src.length && 0 < depth; p++) {
      if ('"\'`'.includes(src[p])) p = quoteEnd(src, p)
      else depth += '(' === src[p] ? 1 : ')' === src[p] ? -1 : 0
    }
    return p
  }
  return at + text.length
}


function valueHit(src: string, v: any, at: number, path: string[]): Hit | undefined {
  if (true === v.isConjunct || true === v.isDisjunct || true === v.isNil) {
    return undefined
  }
  const text: string = 'string' === typeof v.site?.src ? v.site.src : ''
  if ((true === v.isMap || true === v.isList) && '{' !== text && '[' !== text) {
    return undefined
  }
  if (true === v.isRef) {
    // A reference whose spelling is not at its site was sited elsewhere
    // by the parser, so the cursor can't be said to be on it.
    if (undefined !== v.aliasName) {
      return undefined
    }
    const [end, spelt] = refSpan(src, at)
    return spelt === v.spelling ? {
      on: 'ref', path, start: at, end, reads: v.plainRefPath(),
    } : undefined
  }
  return '' === text ? undefined : { on: 'value', path, start: at, end: valueEnd(src, at, text) }
}


function hitsOf(src: string, root: any): { keys: Hit[], values: Hit[] } {
  const starts = lineStarts(src)
  const keys: Hit[] = []
  const values: Hit[] = []
  const seen = new Set<any>()
  const stack: [any, string[]][] = [[root, []]]
  while (0 < stack.length) {
    const [v, path] = stack.pop() as [any, string[]]
    if (null == v || true !== v.isVal || seen.has(v)) {
      continue
    }
    seen.add(v)
    const at = '' === (v.site?.url ?? '') ? siteOffset(starts, v) : -1
    if (0 <= at) {
      const span = 0 < path.length ? keySpan(src, at, path[path.length - 1]) : undefined
      if (undefined !== span) {
        keys.push({ on: 'key', path, start: span[0], end: span[1] })
      }
      const hit = valueHit(src, v, at, path)
      if (undefined !== hit) {
        values.push(hit)
      }
    }
    const next = kids(v, path)
    for (let i = next.length - 1; 0 <= i; i--) {
      stack.push(next[i])
    }
  }
  return { keys, values }
}


function pathAt(
  src: string, pos: Position, opts?: CursorOptions): CursorPath | undefined {
  const aontu = new Aontu(null == opts?.trust ? {} : { trust: opts.trust })
  const ctx = aontu.ctx({ collect: true })
  const root = aontu.parse(src, undefined, ctx)
  if (0 < ctx.err.length) {
    return undefined
  }
  const starts = lineStarts(src)
  if (0 > pos.line || starts.length <= pos.line) {
    return undefined
  }
  const cur = offsetAt(src, starts, pos)
  const within = (h: Hit) => h.start <= cur && cur < h.end
  const { keys, values } = hitsOf(src, root)
  let best = keys.find(within)
  for (const h of undefined === best ? values : []) {
    if (within(h) && (undefined === best || h.end - h.start < best.end - best.start ||
      (h.end - h.start === best.end - best.start && h.path.length > best.path.length))) {
      best = h
    }
  }
  if (undefined === best) {
    return undefined
  }
  return {
    on: best.on,
    path: best.path,
    range: { start: positionOf(starts, best.start), end: positionOf(starts, best.end) },
    ...(undefined === best.reads ? {} : { reads: best.reads }),
  }
}


// Every site that writes a path, as `model why` reads them; nothing
// where the document does not evaluate or names no such path.
function sitesOf(
  src: string, path: string[], opts?: CursorOptions): PathSite[] | undefined {
  const report = whyParts(src, path, { trust: opts?.trust } as any)
  if (!report.ok || null == report.record) {
    return undefined
  }
  const starts = lineStarts(src)
  return report.record.conjuncts.map((c) => {
    const start = { line: c.site.row - 1, character: c.site.col - 1 }
    const end = '' === c.site.file && c.site.row <= starts.length ?
      positionOf(starts, starts[c.site.row - 1] + c.site.col - 1 + c.site.len) :
      { line: start.line, character: start.character + c.site.len }
    return { canon: c.canon, file: c.site.file, range: { start, end }, role: c.role }
  })
}


export { pathAt, sitesOf, keySpan, hitsOf }

export type { CursorPath, CursorOn, CursorOptions, PathSite, Position, Range }
