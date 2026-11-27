/* Copyright (c) 2025 Richard Rodger, MIT License */


import { Aontu } from './aontu'
import { whyParts } from './query'
import { anchorParts, throughResidue } from './vet'
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


type RefText = { start: number, abs: boolean }

// A reference written from s up to the dot before w: dots, then segments,
// each a name or quoted text and a dot. Where it starts, or nothing.
function refAt(src: string, s: number, w: number): RefText | undefined {
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


// Where a reference that reads path is written, in the document or in
// the text of the file that holds it, as the reference spans it there.
function readsOf(
  src: string, root: any, path: string[], texts: Record<string, string>): PathPlace[] {
  const want = JSON.stringify(path)
  const out: PathPlace[] = []
  cursorWalk(root, (v) => {
    if (true !== v.isRef || JSON.stringify(v.plainRefPath()?.map(String)) !== want) {
      return false
    }
    const file: string = v.site.url ?? ''
    // A file with no text recorded reads as empty.
    const text = '' === file ? src : [texts[file]].join('')
    const starts = lineStarts(text)
    const at = siteOffset(starts, v)
    // A reference that is all a group holds is sited at the group.
    let p = at
    while (0 <= p && '( \t\r\n'.includes(text[p])) p++
    const [end, spelt] = refSpan(text, p)
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
    reads: readsOf(src, doc.root, path, Object.fromEntries(
      doc.ctx.manifest.map((m: any) => [m.path, m.src]))),
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


export {
  pathAt, sitesOf, keySpan, hitsOf, describeAt, definitionAt, describeVal,
  membersAt, mapAt, symbolsOf, symbolTree, referencesAt, readsOf,
}

export type {
  CursorMembers, CursorPath, CursorOn, CursorOptions, CursorRefs, CursorValue, DocSymbol,
  Member,
  PathPlace, PathSite, PathValue, Position, Range,
}
