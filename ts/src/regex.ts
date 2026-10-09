/* Copyright (c) 2026 Richard Rodger, MIT License */

// aontu's own pattern matcher (ADR-060): an ECMA-262 u-mode parser, a
// compiler to a Pike VM, and the VM, which reads each code point of a
// text once and never goes back, so a match costs at most the text's
// length times the program's. Twin of go/regex.go.

import { unicodeProperty, union, complement } from './uniprop'
import type { Ranges } from './uniprop'


// The pattern language: ECMA-262's, as JSON Schema writes a pattern, or
// re()'s, which reads the same syntax with \A and \z and gives ., \s and
// \S the ASCII meanings of ADR-003.
type Dialect = 'ecma' | 'aontu'

type Node =
  { k: 'set', set: Ranges } |
  { k: 'cat', items: Node[] } |
  { k: 'alt', alts: Node[] } |
  { k: 'rep', node: Node, min: number, max: number } |
  { k: 'group', node: Node } |
  { k: 'mod', node: Node } |
  { k: 'look', node: Node } |
  { k: 'backref' } |
  { k: 'bol' } | { k: 'eol' } | { k: 'wb' } | { k: 'nwb' }

// A token the dialects read differently, by its place among the
// pattern's code points.
type Sub = { at: number, end: number, tok: string, inClass: boolean }

type Parsed = { ast: Node, subs: Sub[] }

type Inst =
  { op: 'set', set: Ranges } |
  { op: 'split', x: number, y: number } |
  { op: 'jmp', x: number } |
  { op: 'match' } | { op: 'bol' } | { op: 'eol' } | { op: 'wb' } | { op: 'nwb' }

// A program past this many instructions is refused: counted repetition
// copies its operand, so the bound is what keeps a match's cost finite.
const PROGRAM_MAX = 100000

// Groups nest at most this deep, so the parser's recursion stays well
// inside either port's stack.
const NEST_MAX = 256

const MAX = 0x10FFFF
const SYNTAX = '^$\\.*+?()[]{}|'
const DIGIT: Ranges = [[0x30, 0x39]]
const WORD: Ranges = [[0x30, 0x39], [0x41, 0x5A], [0x5F, 0x5F], [0x61, 0x7A]]
const ASCII_SPACE: Ranges = [[0x09, 0x0D], [0x20, 0x20]]
const ECMA_SPACE: Ranges = [[0x09, 0x0D], [0x20, 0x20], [0xA0, 0xA0], [0x1680, 0x1680],
  [0x2000, 0x200A], [0x2028, 0x2029], [0x202F, 0x202F], [0x205F, 0x205F], [0x3000, 0x3000],
  [0xFEFF, 0xFEFF]]

class Refusal {
  constructor(readonly why: string) { }
}

const fail = (why: string): never => {
  throw new Refusal(why)
}

const isDigit = (c: string | undefined): boolean => undefined !== c && '0' <= c && c <= '9'
const isHex = (c: string | undefined): boolean =>
  undefined !== c && (isDigit(c) || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F'))
const isLetter = (c: string | undefined): boolean =>
  undefined !== c && (('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z'))
const inRanges = (rs: Ranges, c: number): boolean => {
  let lo = 0
  let hi = rs.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (c < rs[m][0]) {
      hi = m - 1
    }
    else if (c > rs[m][1]) {
      lo = m + 1
    }
    else {
      return true
    }
  }
  return false
}


function parsePattern(src: string, dialect: Dialect): [Parsed, ''] | [undefined, string] {
  const s = [...src]
  let i = 0
  let groups = 0
  let depth = 0
  let disjunctions = 0
  // Each named group with the alternatives it sits in, outermost first.
  const names: [string, string[]][] = []
  const refs: (number | string)[] = []
  const path: string[] = []
  const subs: Sub[] = []
  const peek = (o = 0): string | undefined => s[i + o]
  const eat = (c: string): boolean => {
    if (s[i] === c) {
      i++
      return true
    }
    return false
  }
  const space = 'ecma' === dialect ? ECMA_SPACE : ASCII_SPACE

  const classEscape = (c: string | undefined): Ranges | undefined =>
    'd' === c ? DIGIT : 'D' === c ? complement(DIGIT) : 'w' === c ? WORD :
      'W' === c ? complement(WORD) : 's' === c ? space : 'S' === c ? complement(space) : undefined

  const property = (negated: boolean): Ranges => {
    if (!eat('{')) {
      fail('\\p and \\P take a property in braces')
    }
    let body = ''
    while (undefined !== peek() && '}' !== peek()) {
      body += s[i++]
    }
    if (!eat('}')) {
      fail('a \\p{...} is not closed')
    }
    const eq = body.indexOf('=')
    const set = -1 === eq ? unicodeProperty(body) :
      unicodeProperty(body.slice(0, eq), body.slice(eq + 1))
    if (undefined === set) {
      fail('\\p{' + body + '} names no property ECMA-262 reads')
    }
    return negated ? complement(set as Ranges) : set as Ranges
  }

  const hex = (n: number): number | undefined => {
    let v = 0
    for (let k = 0; k < n; k++) {
      if (!isHex(peek(k))) {
        return undefined
      }
      v = v * 16 + parseInt(peek(k) as string, 16)
    }
    i += n
    return v
  }

  // \u, as \uHHHH, a surrogate pair of them, or \u{H...}.
  const unicodeEscape = (): number => {
    if (eat('{')) {
      let v = 0
      let n = 0
      while (isHex(peek())) {
        v = v * 16 + parseInt(s[i++], 16)
        n++
        if (MAX < v) {
          fail('a \\u{...} escape is past U+10FFFF')
        }
      }
      if (0 === n || !eat('}')) {
        fail('a \\u{ is not hex digits closed by }')
      }
      return v
    }
    const v = hex(4)
    if (undefined === v) {
      return fail('a \\u is not four hex digits')
    }
    if (0xD800 <= v && v <= 0xDBFF && '\\' === peek() && 'u' === peek(1) && isHex(peek(2))) {
      const save = i
      i += 2
      const t = hex(4)
      if (undefined !== t && 0xDC00 <= t && t <= 0xDFFF) {
        return 0x10000 + ((v - 0xD800) << 10) + (t - 0xDC00)
      }
      i = save
    }
    return v
  }

  // The code point a character escape names, the backslash read.
  const charEscape = (inClass: boolean): number => {
    const c = s[i++]
    switch (c) {
      case 'f': return 0x0C
      case 'n': return 0x0A
      case 'r': return 0x0D
      case 't': return 0x09
      case 'v': return 0x0B
      case 'c':
        if (!isLetter(peek())) {
          fail('\\c is not followed by an ASCII letter')
        }
        return (s[i++].codePointAt(0) as number) % 32
      case '0':
        if (isDigit(peek())) {
          fail('\\0 is followed by a digit, which is an octal escape u mode refuses')
        }
        return 0
      case 'x': {
        const v = hex(2)
        return undefined === v ? fail('\\x is not followed by two hex digits') : v
      }
      case 'u':
        return unicodeEscape()
    }
    if (undefined === c) {
      return fail('the pattern ends in a backslash')
    }
    if (SYNTAX.includes(c) || '/' === c || (inClass && '-' === c)) {
      return c.codePointAt(0) as number
    }
    return fail('\\' + c + ' is not an escape u mode reads')
  }

  const groupName = (): string => {
    let name = ''
    for (let first = true; ; first = false) {
      let c: number
      if ('\\' === peek() && 'u' === peek(1)) {
        i += 2
        c = unicodeEscape()
      }
      else if (undefined === peek() || '>' === peek()) {
        break
      }
      else {
        c = s[i++].codePointAt(0) as number
      }
      const ok = 0x24 === c || 0x5F === c ||
        inRanges(unicodeProperty(first ? 'ID_Start' : 'ID_Continue') as Ranges, c) ||
        (!first && (0x200C === c || 0x200D === c))
      if (!ok) {
        fail('a group name is not an identifier')
      }
      name += String.fromCodePoint(c)
    }
    if ('' === name || !eat('>')) {
      fail('a group name is not an identifier closed by >')
    }
    return name
  }

  const classAtom = (): { set?: Ranges, cp?: number } => {
    const at = i
    if (!eat('\\')) {
      return { cp: s[i++].codePointAt(0) as number }
    }
    const c = peek()
    if ('b' === c) {
      i++
      return { cp: 0x08 }
    }
    const set = classEscape(c)
    if (undefined !== set) {
      i++
      if ('s' === c || 'S' === c || 'd' === c || 'w' === c) {
        subs.push({ at, end: i, tok: '\\' + c, inClass: true })
      }
      return { set }
    }
    if ('p' === c || 'P' === c) {
      i++
      return { set: property('P' === c) }
    }
    if (isDigit(c) && '0' !== c) {
      fail('a decimal escape in a class, which u mode refuses')
    }
    return { cp: charEscape(true) }
  }

  const charClass = (): Node => {
    const negated = eat('^')
    const out: Ranges = []
    while (']' !== peek()) {
      if (undefined === peek()) {
        fail('a character class is not closed')
      }
      const a = classAtom()
      if ('-' === peek() && undefined !== peek(1) && ']' !== peek(1)) {
        i++
        const b = classAtom()
        if (undefined !== a.set || undefined !== b.set) {
          fail('a class escape is an end of a range')
        }
        if ((a.cp as number) > (b.cp as number)) {
          fail('a class range is out of order')
        }
        out.push([a.cp as number, b.cp as number])
        continue
      }
      out.push(...(a.set ?? [[a.cp as number, a.cp as number]]))
    }
    i++
    const set = union([out])
    return { k: 'set', set: negated ? complement(set) : set }
  }

  const quantifier = (): { min: number, max: number } | undefined => {
    const c = peek()
    let min: number
    let max: number
    if ('*' === c || '+' === c || '?' === c) {
      i++
      min = '+' === c ? 1 : 0
      max = '?' === c ? 1 : Infinity
    }
    else if ('{' === c) {
      const save = i++
      const digits = (): string => {
        let t = ''
        while (isDigit(peek())) {
          t += s[i++]
        }
        return t
      }
      const a = digits()
      const b = eat(',') ? digits() : a
      if ('' === a || !eat('}')) {
        i = save
        return fail('a { opens no counted quantifier')
      }
      // Compared as written, so a bound past any machine integer still
      // orders exactly.
      const lead = (d: string): string => d.replace(/^0+(?=.)/, '')
      const [x, y] = [lead(a), lead(b)]
      if ('' !== y && (x.length > y.length || (x.length === y.length && x > y))) {
        fail('a counted quantifier is out of order')
      }
      // A bound longer than a 32-bit integer is sure to hold is past any
      // program's size.
      const count = (d: string): number => 9 < d.length ? 2 ** 30 : Number(d)
      min = count(x)
      max = '' === y ? Infinity : count(y)
    }
    else {
      return undefined
    }
    eat('?')
    return { min, max }
  }

  const group = (): Node => {
    if (!eat('?')) {
      groups++
      return { k: 'group', node: disjunction() }
    }
    if (eat(':')) {
      return { k: 'group', node: disjunction() }
    }
    if ('=' === peek() || '!' === peek()) {
      i++
      return { k: 'look', node: disjunction() }
    }
    if ('<' === peek() && ('=' === peek(1) || '!' === peek(1))) {
      i += 2
      return { k: 'look', node: disjunction() }
    }
    if (eat('<')) {
      const name = groupName()
      groups++
      names.push([name, [...path]])
      return { k: 'group', node: disjunction() }
    }
    let add = ''
    let remove = ''
    while (isLetter(peek())) {
      add += s[i++]
    }
    const dash = eat('-')
    while (dash && isLetter(peek())) {
      remove += s[i++]
    }
    const flags = add + remove
    if (!eat(':') || (dash && '' === flags) || /[^ims]/.test(flags) || new Set(flags).size !== flags.length) {
      fail('a (? group is not one ECMA-262 defines')
    }
    return { k: 'mod', node: disjunction() }
  }

  const atom = (): Node => {
    const at = i
    const c = s[i++]
    if ('(' === c) {
      if (NEST_MAX === depth++) {
        fail('groups nest deeper than ' + NEST_MAX)
      }
      const node = group()
      depth--
      if (!eat(')')) {
        fail('a group is not closed')
      }
      return node
    }
    if ('[' === c) {
      return charClass()
    }
    if ('.' === c) {
      subs.push({ at, end: i, tok: '.', inClass: false })
      return { k: 'set', set: complement('ecma' === dialect ? [[0x0A, 0x0A], [0x0D, 0x0D], [0x2028, 0x2029]] : [[0x0A, 0x0A]]) }
    }
    if ('^' === c || '$' === c) {
      return { k: '^' === c ? 'bol' : 'eol' }
    }
    if ('\\' === c) {
      const e = peek()
      if ('b' === e || 'B' === e) {
        i++
        return { k: 'b' === e ? 'wb' : 'nwb' }
      }
      if ('aontu' === dialect && ('A' === e || 'z' === e)) {
        i++
        subs.push({ at, end: i, tok: '\\' + e, inClass: false })
        return { k: 'A' === e ? 'bol' : 'eol' }
      }
      const set = classEscape(e)
      if (undefined !== set) {
        i++
        subs.push({ at, end: i, tok: '\\' + e, inClass: false })
        return { k: 'set', set }
      }
      if ('p' === e || 'P' === e) {
        i++
        return { k: 'set', set: property('P' === e) }
      }
      if ('k' === e) {
        i++
        if (!eat('<')) {
          fail('\\k is not followed by a group name')
        }
        refs.push(groupName())
        return { k: 'backref' }
      }
      if (isDigit(e) && '0' !== e) {
        let t = ''
        while (isDigit(peek())) {
          t += s[i++]
        }
        refs.push(Number(t))
        return { k: 'backref' }
      }
      const v = charEscape(false)
      return { k: 'set', set: [[v, v]] }
    }
    if (')' === c || ']' === c || '}' === c || '|' === c) {
      return fail('a ' + c + ' stands alone')
    }
    const v = c.codePointAt(0) as number
    return { k: 'set', set: [[v, v]] }
  }

  const alternative = (): Node => {
    const items: Node[] = []
    while (undefined !== peek() && '|' !== peek() && ')' !== peek()) {
      if (('*' === peek() || '+' === peek() || '?' === peek() || '{' === peek())) {
        fail('a quantifier has nothing to repeat')
      }
      const a = atom()
      const q = quantifier()
      if (undefined === q) {
        items.push(a)
        continue
      }
      if ('look' === a.k || 'bol' === a.k || 'eol' === a.k || 'wb' === a.k || 'nwb' === a.k) {
        fail('a quantifier has nothing to repeat')
      }
      items.push({ k: 'rep', node: a, min: q.min, max: q.max })
    }
    return 1 === items.length ? items[0] : { k: 'cat', items }
  }

  const disjunction = (): Node => {
    const id = disjunctions++
    const alts: Node[] = []
    for (let n = 0; ; n++) {
      path.push(id + ':' + n)
      alts.push(alternative())
      path.pop()
      if (!eat('|')) {
        break
      }
    }
    return 1 === alts.length ? alts[0] : { k: 'alt', alts }
  }

  try {
    const ast = disjunction()
    if (i < s.length) {
      fail('a ) stands alone')
    }
    for (const r of refs) {
      if ('number' === typeof r ? groups < r : !names.some(([n]) => n === r)) {
        fail('a backreference names no group')
      }
    }
    // A name stands for a second group only where the two cannot both
    // match: in separate alternatives of one disjunction.
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        if (names[a][0] !== names[b][0]) {
          continue
        }
        const pa = names[a][1]
        const pb = names[b][1]
        let k = 0
        while (k < pa.length && k < pb.length && pa[k] === pb[k]) {
          k++
        }
        if (k === pa.length || k === pb.length || pa[k].split(':')[0] !== pb[k].split(':')[0]) {
          fail('a group name is used twice')
        }
      }
    }
    return [{ ast, subs }, '']
  }
  catch (e: any) {
    // Only a refusal is raised above; anything else is a fault.
    /* node:coverage ignore next 3 */
    if (!(e instanceof Refusal)) {
      throw e
    }
    return [undefined, e.why]
  }
}


function compileNode(ast: Node): [Inst[], ''] | [undefined, string] {
  const prog: Inst[] = []
  const emit = (ins: Inst): number => {
    if (PROGRAM_MAX <= prog.length) {
      fail('the pattern compiles past ' + PROGRAM_MAX + ' instructions')
    }
    prog.push(ins)
    return prog.length - 1
  }
  // Where a split's second branch or a jump goes, once it is known.
  const land = (n: number): void => {
    const ins = prog[n] as { y?: number, x: number }
    if ('split' === (prog[n] as Inst).op) {
      ins.y = prog.length
    }
    else {
      ins.x = prog.length
    }
  }
  const gen = (n: Node): void => {
    switch (n.k) {
      case 'set':
        emit({ op: 'set', set: n.set })
        return
      case 'cat':
        n.items.forEach(gen)
        return
      case 'alt': {
        const jumps: number[] = []
        for (let a = 0; a < n.alts.length - 1; a++) {
          const sp = emit({ op: 'split', x: prog.length + 1, y: -1 })
          gen(n.alts[a])
          jumps.push(emit({ op: 'jmp', x: -1 }))
          land(sp)
        }
        gen(n.alts[n.alts.length - 1])
        jumps.forEach(land)
        return
      }
      case 'group':
        gen(n.node)
        return
      case 'rep': {
        // An operand that compiles to nothing matches only the empty
        // string, which one copy says as well as any number.
        for (let c = 0, start = prog.length; c < n.min; c++) {
          gen(n.node)
          if (start === prog.length) {
            break
          }
        }
        if (Infinity === n.max) {
          const sp = emit({ op: 'split', x: prog.length + 1, y: -1 })
          gen(n.node)
          emit({ op: 'jmp', x: sp })
          land(sp)
          return
        }
        const outs: number[] = []
        for (let c = n.min; c < n.max; c++) {
          outs.push(emit({ op: 'split', x: prog.length + 1, y: -1 }))
          gen(n.node)
        }
        outs.forEach(land)
        return
      }
      case 'look':
        return fail('a lookaround, which no regular language holds')
      case 'backref':
        return fail('a backreference, which no regular language holds')
      case 'mod':
        return fail('a modifier group, whose flags aontu does not apply')
      default:
        emit({ op: n.k } as Inst)
    }
  }
  try {
    gen(ast)
    emit({ op: 'match' })
    return [prog, '']
  }
  catch (e: any) {
    // Only a refusal is raised above; anything else is a fault.
    /* node:coverage ignore next 3 */
    if (!(e instanceof Refusal)) {
      throw e
    }
    return [undefined, e.why]
  }
}


// The program of a pattern in the dialect, or why it is refused.
function compilePattern(src: string, dialect: Dialect): [Inst[], ''] | [undefined, string] {
  const [p, why] = parsePattern(src, dialect)
  return undefined === p ? [undefined, why] : compileNode(p.ast)
}


const isWord = (c: number | undefined): boolean => undefined !== c && inRanges(WORD, c)

// Whether the program matches anywhere in the text: every thread steps
// over a code point together, and a thread that reaches an instruction
// another holds at that step is dropped.
function patternMatches(prog: Inst[], text: string): boolean {
  const cps = [...text].map((c) => c.codePointAt(0) as number)
  const mark = new Int32Array(prog.length).fill(-1)
  let step = 0
  const add = (list: number[], pc: number, pos: number): void => {
    const stack = [pc]
    while (0 < stack.length) {
      const p = stack.pop() as number
      if (step === mark[p]) {
        continue
      }
      mark[p] = step
      const ins = prog[p]
      switch (ins.op) {
        case 'jmp':
          stack.push(ins.x)
          break
        case 'split':
          stack.push(ins.y, ins.x)
          break
        case 'bol':
          if (0 === pos) {
            stack.push(p + 1)
          }
          break
        case 'eol':
          if (cps.length === pos) {
            stack.push(p + 1)
          }
          break
        case 'wb':
        case 'nwb':
          if ((isWord(cps[pos - 1]) !== isWord(cps[pos])) === ('wb' === ins.op)) {
            stack.push(p + 1)
          }
          break
        default:
          list.push(p)
      }
    }
  }
  let list: number[] = []
  add(list, 0, 0)
  for (let pos = 0; ; pos++) {
    if (list.some((p) => 'match' === prog[p].op)) {
      return true
    }
    if (pos === cps.length) {
      return false
    }
    const next: number[] = []
    step++
    for (const p of list) {
      const ins = prog[p]
      if ('set' === ins.op && inRanges(ins.set, cps[pos])) {
        add(next, p + 1, pos + 1)
      }
    }
    add(next, 0, pos + 1)
    list = next
  }
}


// A class body for a set, in ECMA-262's u mode.
function classBody(rs: Ranges): string {
  const ch = (c: number): string => '\\u{' + c.toString(16).toUpperCase() + '}'
  return rs.map(([lo, hi]) => ch(lo) + '-' + ch(hi)).join('')
}

// The text a token is rewritten to, from one dialect to the other.
function rewrite(src: string, subs: Sub[], to: (tok: string, inClass: boolean) => string): string {
  const s = [...src]
  let out = ''
  let i = 0
  for (const sub of subs.sort((a, b) => a.at - b.at)) {
    out += s.slice(i, sub.at).join('') + to(sub.tok, sub.inClass)
    i = sub.end
  }
  return out + s.slice(i).join('')
}

const AONTU_TO_ECMA: Record<string, [string, string]> = {
  '.': ['[^\\n]', ''],
  '\\d': ['[0-9]', '0-9'],
  '\\w': ['[0-9A-Za-z_]', '0-9A-Za-z_'],
  '\\s': ['[ \\t\\n\\r\\f\\v]', ' \\t\\n\\r\\f\\v'],
  '\\D': ['[^0-9]', '\\D'],
  '\\W': ['[^0-9A-Za-z_]', '\\W'],
  '\\S': ['[^ \\t\\n\\r\\f\\v]', classBody(complement(ASCII_SPACE))],
  '\\A': ['^', ''],
  '\\z': ['$', ''],
}

const ECMA_SPACE_BODY = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'

const ECMA_TO_AONTU: Record<string, [string, string]> = {
  '.': ['[^\\n\\r\\u2028\\u2029]', ''],
  '\\d': ['\\d', '\\d'],
  '\\w': ['\\w', '\\w'],
  '\\s': ['[' + ECMA_SPACE_BODY + ']', ECMA_SPACE_BODY],
  '\\D': ['\\D', '\\D'],
  '\\W': ['\\W', '\\W'],
  '\\S': ['[^' + ECMA_SPACE_BODY + ']', classBody(complement(ECMA_SPACE))],
}


// re()'s pattern as ECMA-262 u-mode text that means the same, which the
// exporter writes as `pattern`; or why re() refuses it.
function exportForm(src: string): [string, string] {
  const [p, why] = parsePattern(src, 'aontu')
  const refused = undefined === p ? why : compileNode(p.ast)[1]
  return '' !== refused ? ['', refused] :
    [rewrite(src, (p as Parsed).subs, (t, c) => AONTU_TO_ECMA[t][c ? 1 : 0]), '']
}

// An ECMA-262 pattern as re() source that means the same, or why it
// cannot be one.
function importForm(src: string): [string, string] {
  const [p, why] = parsePattern(src, 'ecma')
  if (undefined === p) {
    return ['', why]
  }
  const out = rewrite(src, p.subs, (t, c) => ECMA_TO_AONTU[t][c ? 1 : 0])
  const refused = compilePattern(out, 'aontu')[1]
  return '' !== refused ? ['', refused] : [out, '']
}

// Why a string is not an ECMA-262 u-mode pattern, or '' where it is.
function ecmaWhy(src: string): string {
  return parsePattern(src, 'ecma')[1]
} /* node:coverage ignore next 12 */


export type { Dialect, Inst }

export {
  compilePattern,
  patternMatches,
  exportForm,
  importForm,
  ecmaWhy,
  PROGRAM_MAX,
}
