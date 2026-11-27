/* Copyright (c) 2025 Richard Rodger, MIT License */


import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

import { Aontu } from './aontu'
import { whyParts } from './query'
import { anchorParts, throughResidue } from './vet'
import { cmpCodePoint } from './keyorder'
import { candidates, evalCanon, trimCheck } from './trim'
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

type PathValue = {
  canon: string, kind: string, titles: string[], descriptions: string[]
}

type CursorValue = PathValue & { path: string[], range: Range }

type PathPlace = { file: string, range: Range }

// Where the path a cursor names is written, and where it is read.
type CursorRefs = { path: string[], writes: PathPlace[], reads: PathPlace[] }

type Member = { key: string, canon: string, optional: boolean }

// What may be written at a cursor: the keys a map there may take, or the
// members of the path a reference there has reached.
type CursorMembers = { on: 'key' | 'path', path: string[], members: Member[] }

type CursorOptions = { trust?: TrustOptions }

// One entry of a document's outline, as LSP's DocumentSymbol has it.
type DocSymbol = {
  name: string, kind: number, range: Range, selectionRange: Range,
  children: DocSymbol[]
}

type Parsed = { aontu: Aontu, ctx: any, root: any }

type Hit = {
  on: CursorOn, path: string[], start: number, end: number, reads?: string[]
}


const KEY_DELIMS = ' \t\r\n{}[](),:;"\''

const TOKEN_END = KEY_DELIMS + '&|'

const WORD = /[A-Za-z0-9_\-\u0080-\uffff]/

const CLOSER: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

// What a relative reference may follow, and what a key may not.
const REF_AFTER = ' \t\r\n:{[(,&|+*'

const VALUE_AFTER = ':([&|=.$@%'


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


// Back from i, the place before a value, over blanks and comments. A
// comment ends its line, so the value's own line holds none before it,
// and only a line above it is read for one.
function skipTrivia(src: string, i: number): number {
  for (;;) {
    let crossed = false
    while (0 <= i && ' \t\r\n'.includes(src[i])) {
      crossed = crossed || '\n' === src[i]
      i--
    }
    const c = !crossed || 0 > i ? -1 :
      commentStart(src, src.lastIndexOf('\n', i) + 1, i + 1)
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


type RefText = { end: number, spelt: string, segs: [number, number][] }

// A reference as written at a site, read to its end, with a quoted
// segment read as its text: `$."a b"` spells `$.a b`. Each segment's
// span is kept, an empty one standing for a step up.
function refText(src: string, at: number): RefText {
  let p = at
  let out = '$' === src[p] ? (p++, '$') : ''
  const segs: [number, number][] = []
  while ('.' === src[p]) {
    p++
    const s = p
    if ('"' === src[p] || '\'' === src[p]) {
      p = quoteEnd(src, p) + 1
      out += '.' + src.slice(s + 1, p - 1)
    }
    else {
      while (p < src.length && '.' !== src[p] && !TOKEN_END.includes(src[p])) p++
      out += '.' + src.slice(s, p)
    }
    segs.push([s, p])
  }
  return { end: p, spelt: out, segs }
}


function refSpan(src: string, at: number): [number, string] {
  const r = refText(src, at)
  return [r.end, r.spelt]
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


function siteText(v: any): string {
  return 'string' === typeof v.site?.src ? v.site.src : ''
}


function valueHit(src: string, v: any, at: number, path: string[]): Hit | undefined {
  if (true === v.isConjunct || true === v.isDisjunct || true === v.isNil) {
    return undefined
  }
  const text = siteText(v)
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
    // A value another file wrote has its key where this document
    // loaded it.
    const load = v.site?.load
    const from = 0 > at && null != load && '' === (load.url ?? '') ?
      siteOffset(starts, { site: load }) : at
    const span = 0 <= from && 0 < path.length ?
      keySpan(src, from, path[path.length - 1]) : undefined
    if (undefined !== span) {
      keys.push({ on: 'key', path, start: span[0], end: span[1] })
    }
    if (0 <= at) {
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


// A text the parser throws on, where it should refuse, answers nothing,
// as a refused one does.
function parsed(src: string, opts?: CursorOptions): Parsed | undefined {
  const aontu = new Aontu(null == opts?.trust ? {} : { trust: opts.trust })
  const ctx = aontu.ctx({ collect: true })
  try {
    const root = aontu.parse(src, undefined, ctx)
    return 0 < ctx.err.length ? undefined : { aontu, ctx, root }
  }
  catch {
    return undefined
  }
}


function hitAt(src: string, pos: Position, root: any): CursorPath | undefined {
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


function pathAt(
  src: string, pos: Position, opts?: CursorOptions): CursorPath | undefined {
  const doc = parsed(src, opts)
  return undefined === doc ? undefined : hitAt(src, pos, doc.root)
}


// The path a cursor names: a key its own, a reference the one it reads,
// and a plain value none.
function namedPath(at: CursorPath | undefined): string[] | undefined {
  return 'key' === at?.on ? at.path : at?.reads
}


// A short label for what a value is, the same word in both ports.
function valKind(val: any): string {
  if (val.isNil) return 'error'
  if (val.isTop) return 'any'
  if (val.isScalarKind) return 'type'
  if (val.isConstraint) return 'constraint'
  if (val.isRef) return 'reference'
  if (val.isFunc) return 'function'
  // NumberVal is the binary64 leaf, whose kind keyword is `float`;
  // `number` is the supertype and never labels a concrete value.
  if (val.isNumber) return 'float'
  return val.constructor.name.replace(/Val$/, '').toLowerCase()
}


function metaTexts(val: any, key: string): string[] {
  return ((val.meta ?? {})[key] ?? []).map((t: any) => t.peg)
    .filter((t: any) => 'string' === typeof t)
}


function describeVal(val: any): PathValue {
  return {
    canon: val.canon,
    kind: valKind(val),
    titles: metaTexts(val, 'title'),
    descriptions: metaTexts(val, 'description'),
  }
}


// What stands, once the document has unified, at the path a key or a
// reference under the cursor names; nothing where it names none, or
// names a path that holds nothing.
function describeAt(
  src: string, pos: Position, opts?: CursorOptions): CursorValue | undefined {
  const doc = parsed(src, opts)
  const at = undefined === doc ? undefined : hitAt(src, pos, doc.root)
  const path = namedPath(at)
  if (undefined === doc || undefined === at || undefined === path) {
    return undefined
  }
  const node = anchorParts(doc.aontu.unify(doc.root, undefined, doc.ctx), path)
  return undefined === node ? undefined :
    { path, range: at.range, ...describeVal(node) }
}


// Where the path a key or a reference under the cursor names is
// written: its sites, as places to go to.
function definitionAt(
  src: string, pos: Position, opts?: CursorOptions): PathPlace[] | undefined {
  const path = namedPath(pathAt(src, pos, opts))
  return undefined === path ? undefined :
    sitesOf(src, path, opts)?.map((s) => ({ file: s.file, range: s.range }))
}


// The brackets open before off, the innermost last, and where the run of
// names, dots and quoted text that ends at off starts; nothing where off
// is inside quoted text or a comment.
function openBrackets(src: string, off: number): [[string, number][], number] | undefined {
  const open: [string, number][] = []
  let run = 0
  for (let k = 0; k < off; k++) {
    const quoted = '"\'`'.includes(src[k])
    if (quoted) {
      k = quoteEnd(src, k)
    }
    else if ('#' === src[k]) {
      k = src.indexOf('\n', k)
    }
    if (off <= k || 0 > k) {
      return undefined
    }
    else if ('{[('.includes(src[k])) {
      open.push([src[k], k])
    }
    else if ('}])'.includes(src[k])) {
      open.pop()
    }
    if (!quoted && '.' !== src[k] && !WORD.test(src[k])) {
      run = k + 1
    }
  }
  return [open, run]
}


function closersOf(open: [string, number][]): string {
  return open.map(([c]) => CLOSER[c]).reverse().join('')
}


type RefStart = { start: number, abs: boolean }

// A reference written from s up to the dot before w: dots, then segments,
// each a name or quoted text and a dot. Where it starts, or nothing.
function refAt(src: string, s: number, w: number): RefStart | undefined {
  let i = s
  while (i < w && '.' === src[i]) i++
  const up = i - s
  while (i < w) {
    let j = i
    if ('"\'`'.includes(src[i])) {
      j = quoteEnd(src, i) + 1
    }
    else {
      while (j < w && WORD.test(src[j])) j++
    }
    if (i === j || '.' !== src[j]) {
      return undefined
    }
    i = j + 1
  }
  const abs = '$' === src[s - 1]
  return 0 === up || '.' !== src[w - 1] ||
    (abs ? 1 < up : !REF_AFTER.includes(src[s - 1] ?? ' ')) ? undefined :
    { start: abs ? s - 1 : s, abs }
}


// Every value a walk from root meets, with its path, a constraint's
// written arguments included, until visit answers true.
function cursorWalk(root: any, visit: (v: any, path: string[]) => boolean): void {
  const seen = new Set<any>()
  const stack: [any, string[]][] = [[root, []]]
  while (0 < stack.length) {
    const [v, path] = stack.pop() as [any, string[]]
    if (null == v || true !== v.isVal || seen.has(v)) {
      continue
    }
    seen.add(v)
    if (visit(v, path)) {
      return
    }
    stack.push(...kids(v, path), ...(true === v.isConstraint && Array.isArray(v.peg) ?
      v.peg.map((c: any) => [c, path] as [any, string[]]) : []))
  }
}


// The first value a walk from root meets that take accepts at the offset
// of its site, with its path. A value from an included file is sited in
// that file, so never here.
function findVal(src: string, root: any, take: (v: any, off: number) => boolean):
  { val: any, path: string[] } | undefined {
  const starts = lineStarts(src)
  let found: { val: any, path: string[] } | undefined
  cursorWalk(root, (v, path) => {
    found = '' === (v.site?.url ?? '') && take(v, siteOffset(starts, v)) ?
      { val: v, path } : undefined
    return undefined !== found
  })
  return found
}


// Where a value written at off is sited: there, or, where it is all a
// group holds, at the group's first `(`.
function groupStarts(src: string, off: number): number[] {
  const offs = [off]
  for (let p = skipTrivia(src, off - 1); '(' === src[p]; p = skipTrivia(src, p - 1)) {
    offs.push(p)
  }
  return offs
}


// The map literal whose brace is at off, with its path.
function mapAt(src: string, root: any, off: number): { val: any, path: string[] } | undefined {
  const offs = groupStarts(src, off)
  return findVal(src, root, (v, at) => true === v.isMap && offs.includes(at))
}


// The path that the reference at start reads, as the engine reads it, in
// a text that ends the reference with one more name: from where the
// reference stands, less that name.
function refReads(text: string, start: number, opts?: CursorOptions): string[] | undefined {
  const offs = groupStarts(text, start)
  const ref = findVal(text, parsed(text, opts)?.root, (v, at) => true === v.isRef && offs.includes(at))
  return ref?.val.plainRefPath()?.slice(0, -1).map(String)
}


function membersOf(node: any, written: string[]): Member[] {
  if (true === node?.isMap) {
    return Object.keys(node.peg).sort(cmpCodePoint)
      .filter((k) => !node.aliasKeys.includes(k) && !written.includes(k))
      .map((k) => ({ key: k, canon: node.peg[k].canon, optional: node.optionalKeys.includes(k) }))
  }
  return true === node?.isList ?
    node.peg.map((v: any, i: number) => ({ key: '' + i, canon: v.canon, optional: false })) : []
}


// What may be written at a cursor, read from the document with the word
// being typed taken out and every bracket left open closed: at a key, the
// keys the map there takes once unified and has not written; after a dot
// in a reference, the members of the path it has reached.
function membersAt(
  src: string, pos: Position, opts?: CursorOptions): CursorMembers | undefined {
  const starts = lineStarts(src)
  if (0 > pos.line || starts.length <= pos.line) {
    return undefined
  }
  const cur = offsetAt(src, starts, pos)
  let w = cur
  while (0 < w && WORD.test(src[w - 1])) w--
  const scan = openBrackets(src, w)
  if (undefined === scan) {
    return undefined
  }
  const [open, run] = scan
  const ref = refAt(src, run, w)
  // The reference being written stands as `any`, so that it reads nothing.
  const text = src.slice(0, ref?.start ?? w) + (undefined === ref ? '' : 'any') + src.slice(cur)
  const doc = parsed(text + closersOf(openBrackets(text, text.length)?.[0] ?? []), opts)
  if (undefined === doc) {
    return undefined
  }
  const reads = undefined === ref ? undefined :
    refReads(src.slice(0, w) + 'x' + closersOf(open), ref.start, opts)
  const brace = open.map(([c]) => c).lastIndexOf('{')
  const lit = 0 > brace ? { val: doc.root, path: [] } : mapAt(text, doc.root, open[brace][1])
  const prev = skipTrivia(src, w - 1)
  const atKey = true === lit?.val.isMap && brace === open.length - 1 &&
    (0 > prev || !VALUE_AFTER.includes(src[prev]))
  if (undefined === reads && !atKey) {
    return undefined
  }
  const written = undefined === reads ? Object.keys(lit?.val.peg) : []
  const at = reads ?? (lit as { path: string[] }).path
  const res = doc.aontu.unify(doc.root, undefined, doc.ctx)
  return {
    on: undefined === reads ? 'key' : 'path',
    path: at,
    members: membersOf(throughResidue(anchorParts(res, at)), written),
  }
}


// Where the bracket at k closes, or, from k up to end, where the last
// bracket open by end closes: past quoted text and comments.
function balancedEnd(src: string, k: number, end: number): number {
  for (let depth = 0; k < src.length && (k < end || 0 < depth); k++) {
    if ('"\'`'.includes(src[k])) {
      k = quoteEnd(src, k)
    }
    else if ('#' === src[k]) {
      k = Math.max(k, src.indexOf('\n', k) - 1)
    }
    else {
      depth += '{[('.includes(src[k]) ? 1 : '}])'.includes(src[k]) ? -1 : 0
    }
  }
  return Math.max(end, Math.min(k, src.length))
}


// Where the text of a value written at `at` ends, or the include that
// loaded it at `from`.
function extentEnd(src: string, v: any, at: number, from: number): number {
  if (0 > at) {
    let p = from + 1
    while (' \t\r\n'.includes(src[p])) p++
    return Math.min(quoteEnd(src, p) + 1, src.length)
  }
  const text = siteText(v)
  return '{[('.includes(text) && 1 === text.length ? balancedEnd(src, at, at + 1) :
    true === v.isRef ? refSpan(src, at)[0] : valueEnd(src, at, text)
}


const SYMBOL_KIND: Record<string, number> = {
  map: 19, list: 18, string: 15, integer: 16, float: 16, biginteger: 16,
  bigdecimal: 16, boolean: 17, null: 21,
}

type Sym = {
  name: string, kind: number, start: number, end: number, key: [number, number],
  children: Sym[]
}

type SymStep = {
  v: any, path: string[], into: Sym[], own?: Sym, elem: boolean
}


// A symbol's entry runs over its children's, and on to the bracket that
// closes the last one open in it.
function docSymbol(src: string, starts: number[], s: Sym): [DocSymbol, number] {
  const at = (off: number) => positionOf(starts, off)
  const children = s.children.sort((a, b) => a.start - b.start)
    .map((c) => docSymbol(src, starts, c))
  const end = balancedEnd(src, s.start, Math.max(s.end, ...children.map((c) => c[1])))
  return [{
    name: s.name,
    kind: s.kind,
    range: { start: at(s.start), end: at(end) },
    selectionRange: { start: at(s.key[0]), end: at(s.key[1]) },
    children: children.map((c) => c[0]),
  }, end]
}


// The outline of what a document writes: each key where it is written,
// a key chain's keys nested, and a list's elements by position.
function symbolsOf(src: string, opts?: CursorOptions): DocSymbol[] | undefined {
  const doc = parsed(src, opts)
  return undefined === doc ? undefined : symbolTree(src, doc.root)
}


function symbolTree(src: string, root: any): DocSymbol[] {
  const starts = lineStarts(src)
  const top: Sym[] = []
  const made = new Map<number, Sym>()
  const seen = new Set<any>()
  const stack: SymStep[] = [{ v: root, path: [], into: top, elem: false }]
  while (0 < stack.length) {
    const { v, path, into, own, elem } = stack.pop() as SymStep
    if (null == v || true !== v.isVal || seen.has(v)) {
      continue
    }
    seen.add(v)
    const at = '' === (v.site?.url ?? '') ? siteOffset(starts, v) : -1
    const load = v.site?.load
    const from = 0 > at && null != load && '' === (load.url ?? '') ?
      siteOffset(starts, { site: load }) : at
    const name = path[path.length - 1]
    const span: [number, number] | undefined = 0 > from || undefined === name ? undefined :
      elem ? [from, extentEnd(src, v, at, from)] : keySpan(src, from, name)
    let sym = own
    if (undefined !== span) {
      sym = made.get(span[0])
      if (undefined === sym) {
        sym = {
          name, kind: SYMBOL_KIND[valKind(v)] ?? 13, start: span[0], end: span[1],
          key: span, children: [],
        }
        made.set(span[0], sym)
        into.push(sym)
      }
    }
    // A value written here whose key is not found has no place.
    else if (undefined === own && 0 <= from && 0 < path.length) {
      continue
    }
    if (undefined !== sym && 0 <= from) {
      sym.end = Math.max(sym.end, extentEnd(src, v, at, from))
    }
    const next: [any, string[]][] = [...kids(v, path),
      ...(true === v.isConstraint && Array.isArray(v.peg) ?
        v.peg.map((c: any) => [c, path] as [any, string[]]) : [])]
    for (let i = next.length - 1; 0 <= i; i--) {
      const [k, kpath] = next[i]
      if (kpath.length === path.length) {
        stack.push({ v: k, path, into, own: sym, elem: false })
      }
      else if (undefined !== sym || 0 === path.length) {
        stack.push({
          v: k, path: kpath, into: sym?.children ?? top,
          elem: true === v.isList && '&' !== kpath[kpath.length - 1],
        })
      }
    }
  }
  return top.sort((a, b) => a.start - b.start).map((s) => docSymbol(src, starts, s)[0])
}


// Where a reference that reads path is written: in the document, its
// span, and in an included file, its site and the length of its spelling.
function readsOf(src: string, root: any, path: string[]): PathPlace[] {
  const starts = lineStarts(src)
  const want = JSON.stringify(path)
  const out: PathPlace[] = []
  cursorWalk(root, (v) => {
    if (true !== v.isRef || JSON.stringify(v.plainRefPath()?.map(String)) !== want) {
      return false
    }
    const file: string = v.site.url ?? ''
    const at = siteOffset(starts, v)
    if ('' !== file) {
      const start = { line: v.site.row - 1, character: v.site.col - 1 }
      out.push({ file, range: { start, end: { ...start, character: start.character + v.spelling.length } } })
      return false
    }
    // A reference that is all a group holds is sited at the group.
    let p = at
    while (0 <= p && '( \t\r\n'.includes(src[p])) p++
    const [end, spelt] = refSpan(src, p)
    if (0 <= at && spelt === v.spelling) {
      out.push({ file, range: { start: positionOf(starts, p), end: positionOf(starts, end) } })
    }
    return false
  })
  const key = (r: PathPlace) => [r.range.start.line, r.range.start.character]
  return out.sort((a, b) => cmpCodePoint(a.file, b.file) ||
    key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1])
}


// Where the path a key or a reference under the cursor names is written,
// its sites as `model why` reads them, and where a reference reads it.
function referencesAt(
  src: string, pos: Position, opts?: CursorOptions): CursorRefs | undefined {
  const doc = parsed(src, opts)
  const path = namedPath(undefined === doc ? undefined : hitAt(src, pos, doc.root))
  if (undefined === doc || undefined === path) {
    return undefined
  }
  return {
    path,
    writes: (sitesOf(src, path, opts) ?? []).map((s) => ({ file: s.file, range: s.range })),
    reads: readsOf(src, doc.root, path),
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


type FileEdit = { file: string, range: Range, newText: string }

// A rename at a cursor: the path it renames, the key or the segment the
// cursor is on, and the edits; or why no edit of text keeps it true.
type CursorRename =
  { path: string[], range: Range, placeholder: string, edits?: FileEdit[] } |
  { refused: string }

type RenameOptions = CursorOptions & { root?: string, prepare?: boolean }

type Entry = { v: any, path: string[], calls: any[], arg: boolean, step: boolean, kid: number }

type Place = { file: string, off: number }

type KeyAt = Place & { path: string[], end: number, kid: number }

type RefAt = Place & { e: Entry, reads: string[], ref?: RefText }

type Candidate = Place & { why: string }


const GENERATORS = ['pack', 'each', 'apply', 'emit', 'match']

const BARE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

const NEEDS_ESCAPE = /["\\\u0000-\u001f\u007f]/

const VALUE_SEGMENTS = ['_', 'false', 'nil', 'null', 'true']

const MAX_ALIASES = 64


// Every value of the parse, an included file's too, with its path, the
// calls it stands in, and whether a map's key was the step to it.
function renameEntries(root: any): Entry[] {
  const out: Entry[] = []
  const seen = new Set<any>()
  const stack: Entry[] = [{ v: root, path: [], calls: [], arg: false, step: false, kid: -1 }]
  while (0 < stack.length) {
    const e = stack.pop() as Entry
    if (null == e.v || true !== e.v.isVal || seen.has(e.v)) {
      continue
    }
    seen.add(e.v)
    const kid = e.step ? out.length : e.kid
    out.push({ ...e, kid })
    const v = e.v
    const calls = true === v.isFunc ? [...e.calls, e] : e.calls
    for (const [k, path] of kids(v, e.path)) {
      const step = path.length > e.path.length
      stack.push({
        v: k, path, calls, arg: e.arg,
        step: step && true !== v.isList && '&' !== path[path.length - 1], kid: step ? -1 : kid,
      })
    }
    for (const k of true === v.isConstraint && Array.isArray(v.peg) ? v.peg : []) {
      stack.push({ v: k, path: e.path, calls, arg: true, step: false, kid })
    }
  }
  return out
}


// Whether a and b are one path, where `&` stands for any key.
function alike(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i] || '&' === s || '&' === b[i])
}


function prefixOf(a: string[], b: string[]): boolean {
  return a.length < b.length && alike(a, b.slice(0, a.length))
}


function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i])
}


function callName(e: Entry): string {
  return e.v.funcname()
}


// A call that holds a spread's keys to a pattern.
function isPattern(e: Entry): boolean {
  const name = callName(e)
  return 'keyed' === name || ('match' === name && '&' === e.path[e.path.length - 1])
}


// A name written as a key, or as a reference's segment, in the quotes it
// had where it had them.
function writtenName(name: string, quote: string, segment: boolean): string {
  if ('\'' === quote && !name.includes('\'')) {
    return '\'' + name + '\''
  }
  return '' === quote && BARE_KEY.test(name) && !(segment && VALUE_SEGMENTS.includes(name)) ?
    name : '"' + name + '"'
}


function quoteAt(text: string, off: number): string {
  return '"' === text[off] || '\'' === text[off] ? text[off] : ''
}


// Why a file a rename would edit cannot be edited, if it cannot.
function fileRefusal(file: string, root: string | undefined, readable: boolean): string | undefined {
  if (file.startsWith('aontu:')) {
    return file + ' is a bundled model'
  }
  const abs = resolve(file)
  if (abs.split(/[\\/]/).includes('aontu_meta')) {
    return file + ' is in a package'
  }
  const rel = undefined === root || '' === root ? '..' : relative(resolve(root), abs)
  if ('..' === rel.split(/[\\/]/)[0] || isAbsolute(rel)) {
    return file + ' is outside the workspace root'
  }
  return readable ? undefined : 'the text of ' + file + ' cannot be read'
}


// The text of a file the parse read, as it reads it: an include from
// memory, or a bundled model, is not read again.
function fileText(file: string, mem?: Record<string, string>): string | undefined {
  if (file.startsWith('aontu:') || 'string' === typeof mem?.[file]) {
    return undefined
  }
  try {
    return readFileSync(file, 'utf8')
  }
  catch {
    return undefined
  }
}


function byPlace(a: Place, b: Place): number {
  return cmpCodePoint(a.file, b.file) || a.off - b.off
}


// The reason of the first candidate in order of file and place.
function firstWhy(cs: Candidate[]): string | undefined {
  return cs.sort(byPlace)[0]?.why
}


// What a rename at a cursor edits: the key at every site that writes the
// path, and the segment that names it in every reference that reads it;
// or the site no edit of text can keep true. Under `prepare` no name is
// given and no edit is made.
function renameAt(
  src: string, pos: Position, name: string, opts?: RenameOptions): CursorRename | undefined {
  const doc = parsed(src, opts)
  const at = undefined === doc ? undefined : hitAt(src, pos, doc.root)
  if (undefined === doc || undefined === at || 'value' === at.on) {
    return undefined
  }
  const mem = (opts?.trust?.include as any)?.mem
  const texts = new Map<string, string | undefined>([['', src]])
  const text = (file: string): string | undefined => {
    if (!texts.has(file)) {
      texts.set(file, fileText(file, mem))
    }
    return texts.get(file)
  }
  const starts = new Map<string, number[]>()
  const linesOf = (file: string): number[] => {
    if (!starts.has(file)) {
      starts.set(file, lineStarts(text(file) as string))
    }
    return starts.get(file) as number[]
  }
  const placeOf = (file: string, site: any): Place =>
    ({ file, off: undefined === text(file) ? -1 : siteOffset(linesOf(file), { site }) })
  const where = (p: Place): string => {
    if (0 > p.off) {
      return p.file
    }
    const lc = positionOf(linesOf(p.file), p.off)
    return ('' === p.file ? '' : p.file + ':') + (lc.line + 1) + ':' + (lc.character + 1)
  }

  const entries = renameEntries(doc.root)
  const keys: KeyAt[] = []
  const refs: RefAt[] = []
  const keyFile = new Map<Entry, Place>()
  for (const e of entries) {
    const v = e.v
    const url: string = v.site?.url ?? ''
    const load = v.site?.load
    const from = '' !== url && null != load ? placeOf(load.url ?? '', load) : placeOf(url, v.site)
    keyFile.set(e, from)
    const ktext = text(from.file)
    const span = undefined === ktext || 0 > from.off || 0 === e.path.length ? undefined :
      keySpan(ktext, from.off, e.path[e.path.length - 1])
    if (undefined !== span) {
      keys.push({ file: from.file, off: span[0], end: span[1], path: e.path, kid: e.kid })
    }
    if (true === v.isRef && undefined === v.aliasName && null != v.plainRefPath()) {
      const p = placeOf(url, v.site)
      const rtext = text(url)
      let q = p.off
      while (undefined !== rtext && 0 <= q && q < rtext.length && '( \t\r\n'.includes(rtext[q])) q++
      const ref = undefined === rtext || 0 > q ? undefined : refText(rtext, q)
      refs.push({
        file: url, off: q, e, reads: v.plainRefPath().map(String),
        ...(undefined !== ref && ref.spelt === v.spelling ? { ref } : {}),
      })
    }
  }

  const docStarts = lineStarts(src)
  let P = 'key' === at.on ? at.path : at.reads as string[]
  let range = at.range
  if ('ref' === at.on) {
    const start = offsetAt(src, docStarts, at.range.start)
    const segs = refText(src, start).segs.filter(([s, e]) => s < e)
    const cur = offsetAt(src, docStarts, pos)
    const j = segs.findIndex(([, e]) => cur < e)
    const keep = P.length - segs.length + j + 1
    if ('$' === src[start] && cur === start || 0 > j || 1 > keep) {
      return undefined
    }
    P = P.slice(0, keep)
    range = { start: positionOf(docStarts, segs[j][0]), end: positionOf(docStarts, segs[j][1]) }
  }
  const last = P[P.length - 1]
  const named = 'cannot rename ' + P.join('.')
  const refuse = (why: string): CursorRename => ({ refused: named + ': ' + why })
  const placeOfEntry = (e: Entry) => placeOf(e.v.site?.url ?? '', e.v.site)

  if (true !== opts?.prepare) {
    if ('' === name) {
      return refuse('the new name is empty')
    }
    if (NEEDS_ESCAPE.test(name)) {
      return { refused: named + ' to ' + name + ': the name needs an escape' }
    }
  }
  if (P.includes('&')) {
    return refuse('a spread\'s template writes the key at ' +
      where({ file: '', off: offsetAt(src, docStarts, range.start) }))
  }
  const written = keys.filter((k) => same(k.path, P))
  const reads = refs.filter((r) => r.reads.length >= P.length && same(r.reads.slice(0, P.length), P))
  const calls = entries.filter((e) => true === e.v.isFunc)
  const steps = entries.filter((e) => e.step && same(e.path, P))

  const refusal =
    firstWhy(written.filter((k) => '%' === text(k.file)?.[k.off])
      .map((k) => ({ ...k, why: 'the key at ' + where(k) + ' also declares the alias %' + last }))) ??
    firstWhy(calls.filter((e) => GENERATORS.includes(callName(e)) && !isPattern(e) && prefixOf(e.path, P))
      .map((e) => ({ ...placeOfEntry(e), why: 'a generator, ' + callName(e) + ', makes the key at ' +
        where(placeOfEntry(e)) }))) ??
    firstWhy(calls.filter((e) => isPattern(e) && alike(e.path, [...P.slice(0, -1), '&']))
      .map((e) => ({ ...placeOfEntry(e), why: 'a pattern matches the key at ' + where(placeOfEntry(e)) }))) ??
    firstWhy(calls.filter((e) => 'key' === callName(e) && !e.calls.some(isPattern) &&
      e.path.length >= P.length && alike(e.path.slice(0, P.length), P))
      .map((e) => ({ ...placeOfEntry(e), why: 'key() reads the key at ' + where(placeOfEntry(e)) }))) ??
    firstWhy(keys.filter((k) => !same(k.path, P) && alike(k.path, P) && '&' !== k.path[k.path.length - 1])
      .map((k) => ({ ...k, why: 'a spread\'s template writes the key at ' + where(k) }))) ??
    firstWhy([...steps.map((e) => keyFile.get(e) as Place), ...reads]
      .filter((p) => '' !== p.file).flatMap((p) => {
        const why = fileRefusal(p.file, opts?.root, undefined !== text(p.file))
        return undefined === why ? [] : [{ file: p.file, off: 0, why }]
      })) ??
    firstWhy([
      ...steps.filter((e) => !keys.some((k) => k.kid === e.kid)).map((e) => keyFile.get(e) as Place)
        .map((p) => ({ ...p, why: 'cannot locate the key written at ' + where(p) })),
      ...reads.filter((r) => !segmentOf(r, P, text(r.file) as string)[1])
        .map((r) => ({ ...r, why: 'cannot locate the reference at ' + where(r) })),
    ]) ??
    aliasRefusal(P, keys, refs, where) ??
    (0 === written.length ? 'no key is written for it' : undefined)
  if (undefined !== refusal) {
    return refuse(refusal)
  }
  if (true === opts?.prepare) {
    return { path: P, range, placeholder: last }
  }

  const P2 = [...P.slice(0, -1), name]
  if (name !== last) {
    const clash =
      firstWhy(keys.filter((k) => same(k.path, P2))
        .map((k) => ({ ...k, why: P2.join('.') + ' is already written at ' + where(k) }))) ??
      firstWhy(refs.filter((r) => r.reads.length >= P2.length && same(r.reads.slice(0, P2.length), P2))
        .map((r) => ({ ...r, why: P2.join('.') + ' is already read at ' + where(r) }))) ??
      (undefined === anchorParts(doc.aontu.unify(doc.root, undefined, doc.ctx), P2) ? undefined :
        P2.join('.') + ' already holds a value')
    if (undefined !== clash) {
      return { refused: named + ' to ' + name + ': ' + clash }
    }
  }

  const edits = new Map<string, Place & { end: number, newText: string }>()
  for (const k of written) {
    const t = text(k.file) as string
    edits.set(k.file + ':' + k.off, { ...k, newText: writtenName(name, quoteAt(t, k.off), false) })
  }
  for (const r of reads) {
    const [seg] = segmentOf(r, P, text(r.file) as string)
    if (null != seg) {
      const t = text(r.file) as string
      edits.set(r.file + ':' + seg[0],
        { file: r.file, off: seg[0], end: seg[1], newText: writtenName(name, quoteAt(t, seg[0]), true) })
    }
  }
  return {
    path: P, range, placeholder: last,
    edits: [...edits.values()].sort(byPlace).map((e) => ({
      file: e.file,
      range: { start: positionOf(linesOf(e.file), e.off), end: positionOf(linesOf(e.file), e.end) },
      newText: e.newText,
    })),
  }
}


// The span of the segment of a reference that names the last segment of
// path, null where the reference does not spell it, and whether the
// reference is found as written.
function segmentOf(r: RefAt, path: string[], text: string): [[number, number] | null, boolean] {
  if (undefined === r.ref) {
    return [null, false]
  }
  const segs = r.ref.segs.filter(([s, e]) => s < e)
  const i = path.length - 1 - (r.reads.length - segs.length)
  if (0 > i) {
    return [null, true]
  }
  const [s, e] = segs[i]
  const spelt = '' === quoteAt(text, s) ? text.slice(s, e) : text.slice(s + 1, e - 1)
  return [segs[i], spelt === path[path.length - 1]]
}


// Where the path is also written, or read, through a reference: a path a
// reference copies from it, or one it copies from, which the rename
// would leave behind.
function aliasRefusal(
  P: string[], keys: KeyAt[], refs: RefAt[], where: (p: Place) => string): string | undefined {
  const pairs = refs.filter((r) => !r.e.arg && 0 < r.reads.length)
  const found = new Map<string, { path: string[], via: RefAt }>()
  const queue = [P]
  while (0 < queue.length) {
    const A = queue.shift() as string[]
    for (const r of pairs) {
      const Q = r.e.path
      const T = r.reads
      for (const B of [
        prefixOf(T, A) ? [...Q, ...A.slice(T.length)] : undefined,
        prefixOf(Q, A) ? [...T, ...A.slice(Q.length)] : undefined,
      ]) {
        const id = JSON.stringify(B)
        if (undefined !== B && !same(B, P) && !found.has(id)) {
          if (MAX_ALIASES <= found.size) {
            return 'too many paths reach the key through references'
          }
          found.set(id, { path: B, via: r })
          queue.push(B)
        }
      }
    }
  }
  const cs: Candidate[] = []
  for (const { path, via } of found.values()) {
    const through = ', through the reference at ' + where(via)
    for (const k of keys.filter((k) => alike(k.path, path) && '&' !== k.path[k.path.length - 1])) {
      cs.push({ ...k, why: 'the key is also written as ' + path.join('.') + ' at ' + where(k) + through })
    }
    for (const r of refs.filter((r) => r.reads.length >= path.length &&
      alike(r.reads.slice(0, path.length), path))) {
      cs.push({ ...r, why: 'the key is also read as ' + path.join('.') + ' at ' + where(r) + through })
    }
  }
  return firstWhy(cs)
}


type DocEdit = { range: Range, newText: string }

// A repair whose edit is decided, offered at a range.
type CursorAction = { title: string, path: string[], edits: DocEdit[] }


// What deleting the entry written from s to e takes: its whole line
// where it stands alone on a line that ends, else the comma beside it,
// else the blanks that part it from what follows or, before a closing
// bracket, from what comes before.
function entryDeletion(src: string, s: number, e: number): [number, number] {
  const ls = src.lastIndexOf('\n', s - 1) + 1
  let right = e
  while (right < src.length && ' \t'.includes(src[right])) right++
  const comma = ',' === src[right]
  if (comma) {
    right++
    while (right < src.length && ' \t'.includes(src[right])) right++
  }
  const eol = right >= src.length || '\r\n#'.includes(src[right])
  const le = src.indexOf('\n', right)
  if (/^[ \t]*$/.test(src.slice(ls, s)) && eol && 0 <= le) {
    return [ls, le + 1]
  }
  if (comma) {
    return [s, right]
  }
  let left = s
  while (left > ls && ' \t'.includes(src[left - 1])) left--
  return ',' === src[left - 1] ? [left - 1, e] :
    eol || '}])'.includes(src[right]) ? [left, e] : [s, right]
}


// The symbols an outline has at a path, a key written twice there being
// two.
function symbolsAt(syms: DocSymbol[], path: string[]): DocSymbol[] {
  return path.reduce((at, seg) =>
    at.flatMap((s) => s.children).filter((s) => s.name === seg), [{ children: syms } as DocSymbol])
}


// The repairs whose edit is decided at a range: removing an entry that
// `trim --check` reports, where the range meets it, every place the
// document writes it is found, and the text without it unifies to the
// same. Nothing where the document does not parse.
function actionsAt(src: string, range: Range, opts?: CursorOptions): CursorAction[] | undefined {
  const doc = parsed(src, opts)
  const starts = lineStarts(src)
  if (undefined === doc || 0 > range.start.line || starts.length <= range.start.line) {
    return undefined
  }
  const report = trimCheck(src, { trust: opts?.trust })
  const from = offsetAt(src, starts, range.start)
  const to = offsetAt(src, starts, starts.length <= range.end.line ?
    positionOf(starts, src.length) : range.end)
  const paths: string[][] = []
  candidates(doc.root, [], paths)
  const syms = symbolTree(src, doc.root)
  const entries = renameEntries(doc.root)
  const out: CursorAction[] = []
  for (const text of report.redundant) {
    const named = paths.filter((p) => '$.' + p.join('.') === text)
    if (1 !== named.length) {
      continue
    }
    const P = named[0]
    const steps = entries.filter((e) => e.step && same(e.path, P))
    const keyAt = (e: Entry): number => {
      const load = e.v.site?.load
      const url: string = e.v.site?.url ?? ''
      const off = '' === url ? siteOffset(starts, e.v) :
        null != load && '' === (load.url ?? '') ? siteOffset(starts, { site: load }) : -1
      return 0 > off ? -1 : keySpan(src, off, P[P.length - 1])?.[0] ?? -1
    }
    const keys = new Set(entries.filter((e) => same(e.path, P)).map(keyAt).filter((k) => 0 <= k))
    const found = symbolsAt(syms, P)
    const written = found.map((sym) => offsetAt(src, starts, sym.selectionRange.start))
    if (0 === found.length || steps.some((e) => !entries.some((k) => k.kid === e.kid && 0 <= keyAt(k))) ||
      keys.size !== written.length || written.some((w) => !keys.has(w))) {
      continue
    }
    const spans = found.map((sym) => [
      offsetAt(src, starts, sym.range.start), offsetAt(src, starts, sym.range.end)])
    if (!spans.some(([s, e]) => s <= to && from <= e)) {
      continue
    }
    const cuts = spans.map(([s, e]) => entryDeletion(src, s, e)).sort((a, b) => a[0] - b[0])
      .reduce((m: [number, number][], c) => {
        const last = m[m.length - 1]
        if (undefined !== last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1])
        else m.push([...c])
        return m
      }, [])
    const edited = cuts.reduceRight((t, [s, e]) => t.slice(0, s) + t.slice(e), src)
    if (evalCanon(src, { trust: opts?.trust }) !== evalCanon(edited, { trust: opts?.trust })) {
      continue
    }
    out.push({
      title: 'Remove ' + text + ', which changes nothing',
      path: P,
      edits: cuts.map(([s, e]) => ({
        range: { start: positionOf(starts, s), end: positionOf(starts, e) }, newText: '',
      })),
    })
  }
  return out
} /* node:coverage ignore next 13 */


export {
  pathAt, sitesOf, keySpan, hitsOf, describeAt, definitionAt, describeVal,
  membersAt, mapAt, symbolsOf, symbolTree, referencesAt, renameAt, renameEntries, fileRefusal,
  actionsAt, entryDeletion, fileText,
}

export type {
  CursorAction, CursorMembers, CursorPath, CursorOn, CursorOptions, CursorRefs, CursorRename,
  CursorValue, DocEdit, DocSymbol, FileEdit, Member, RenameOptions,
  PathPlace, PathSite, PathValue, Position, Range,
}
