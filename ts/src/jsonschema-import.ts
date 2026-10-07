/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE JSON SCHEMA IMPORT (G12 phase 3): a JSON Schema read into aontu
// source, checked by `vet --at $.schema --no-fill --exact-numbers`. The
// schema text is read here, not by the host's JSON parser (ADR-003), so
// a number keeps its text and is written by its value.

import { Aontu } from './aontu'
import { format } from './format'
import { codeClass } from './hints'
import { cmpCodePoint } from './keyorder'
import { normaliseRe } from './val/ConstraintVal'
import { isIntegerStorable } from './val/numkind'
import type { SchemaLoss } from './jsonschema'


export type SchemaImportError = {
  code: string
  class: string
  path: string
  message: string
}

export type SchemaImportReport = {
  source: string
  lossy: SchemaLoss[]
  verdict: 'ok' | 'lossy' | 'error'
  errors?: SchemaImportError[]
}


const DRAFT = 'https://json-schema.org/draft/2020-12/schema'

const MAX_DEPTH = 1000
const BUDGET = 4096

const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/


class JNum {
  constructor(readonly text: string) { }
}

type J = null | boolean | string | JNum | J[] | Map<string, J>


class Refusal extends Error {
  constructor(readonly code: string, readonly path: string, why: string) {
    super(why)
  }
}


function readJson(src: string): J {
  if (LONE_SURROGATE_RE.test(src)) {
    throw new Refusal('jsonschema_schema', '#',
      'the schema is not JSON: the text is not well-formed Unicode')
  }
  let i = 0xfeff === src.charCodeAt(0) ? 1 : 0

  const fail = (why: string): never => {
    const before = [...src.substring(0, i)]
    const line = before.filter((c) => '\n' === c).length + 1
    const col = before.length - before.lastIndexOf('\n')
    throw new Refusal('jsonschema_schema', '#',
      'the schema is not JSON: ' + why + ' (line ' + line + ', column ' +
      col + ')')
  }

  const ws = () => {
    while (' ' === src[i] || '\t' === src[i] || '\n' === src[i] ||
      '\r' === src[i]) {
      i++
    }
  }

  const hex4 = (): number => {
    const h = src.substring(i, i + 4)
    if (!/^[0-9A-Fa-f]{4}$/.test(h)) {
      fail('a \\u escape needs four hex digits')
    }
    i += 4
    return parseInt(h, 16)
  }

  const str = (): string => {
    i++
    let out = ''
    while (true) {
      if (i >= src.length) {
        fail('the text ends inside a string')
      }
      const c = src.charCodeAt(i)
      if (0x22 === c) {
        i++
        return out
      }
      if (c < 0x20) {
        fail('a control character must be escaped in a string')
      }
      if (0x5c !== c) {
        out += src[i++]
        continue
      }
      const e = src[++i]
      if (undefined === e) {
        fail('the text ends inside a string')
      }
      i++
      const simple = '"\\/bfnrt'.indexOf(e)
      if (0 <= simple) {
        out += '"\\/\b\f\n\r\t'[simple]
      }
      else if ('u' === e) {
        const u = hex4()
        if (0xd800 <= u && u <= 0xdbff && '\\u' === src.substring(i, i + 2)) {
          i += 2
          const l = hex4()
          if (l < 0xdc00 || 0xdfff < l) {
            fail('a surrogate escape has no partner')
          }
          out += String.fromCharCode(u, l)
        }
        else if (0xd800 <= u && u <= 0xdfff) {
          fail('a surrogate escape has no partner')
        }
        else {
          out += String.fromCharCode(u)
        }
      }
      else {
        fail('an unknown escape in a string')
      }
    }
  }

  const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/y

  const value = (depth: number): J => {
    if (MAX_DEPTH < depth) {
      fail('nested deeper than ' + MAX_DEPTH)
    }
    ws()
    const c = src[i]
    if ('{' === c || '[' === c) {
      i++
      const obj = '{' === c
      const out: any = obj ? new Map<string, J>() : []
      ws()
      if ((obj ? '}' : ']') === src[i]) {
        i++
        return out
      }
      while (true) {
        ws()
        if (obj) {
          if ('"' !== src[i]) {
            fail('an object key must be a string')
          }
          const k = str()
          ws()
          if (':' !== src[i]) {
            fail('a key needs a colon after it')
          }
          i++
          if (out.has(k)) {
            fail('an object names the key ' + strLit(k) + ' twice')
          }
          out.set(k, value(depth + 1))
        }
        else {
          out.push(value(depth + 1))
        }
        ws()
        if (',' === src[i]) {
          i++
          continue
        }
        if ((obj ? '}' : ']') === src[i]) {
          i++
          return out
        }
        fail(obj ? 'an object needs a comma or a closing brace' :
          'an array needs a comma or a closing bracket')
      }
    }
    if ('"' === c) {
      return str()
    }
    for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (src.startsWith(word, i)) {
        i += word.length
        return v
      }
    }
    NUMBER_RE.lastIndex = i
    const m = NUMBER_RE.exec(src)
    if (null == m) {
      return fail(i >= src.length ? 'the text ends where a value belongs' :
        'not a JSON value')
    }
    i += m[0].length
    return new JNum(m[0])
  }

  const out = value(0)
  ws()
  if (i < src.length) {
    fail('text follows the value')
  }
  return out
}


// A JSON number written as aontu source in the leaf its exact value
// selects: an integer while that leaf holds it, a biginteger beyond, any
// other value a bigdecimal.
function numberText(t: string, path: string): string {
  const neg = '-' === t[0]
  const [mant, expText] = (neg ? t.substring(1) : t).split(/[eE]/)
  const [ip, fp = ''] = mant.split('.')
  let digits = (ip + fp).replace(/^0+/, '')
  if ('' === digits) {
    return '0'
  }
  const tz = (/0*$/.exec(digits) as RegExpExecArray)[0].length
  digits = digits.substring(0, digits.length - tz)
  const scale = fp.length - Number(expText ?? '0') - tz
  if (BUDGET < digits.length || BUDGET < Math.abs(scale)) {
    throw new Refusal('decimal_budget', path,
      'the number has more digits or a larger exponent than the exact ' +
      'budget of ' + BUDGET + ' holds')
  }
  const sign = neg ? '-' : ''
  if (scale <= 0) {
    const int = digits + '0'.repeat(-scale)
    return sign + (isIntegerStorable(BigInt(int)) ? '' : '0d') + int
  }
  const pad = digits.padStart(scale + 1, '0')
  return sign + '0d' + pad.substring(0, pad.length - scale) + '.' +
    pad.substring(pad.length - scale)
}


// A code point ECMA-262's `\s` reads that ASCII has no escape for.
function isEcmaSpace(c: number): boolean {
  return 0xa0 === c || 0x1680 === c || (0x2000 <= c && c <= 0x200a) ||
    0x2028 === c || 0x2029 === c || 0x202f === c || 0x205f === c ||
    0x3000 === c || 0xfeff === c
}


// A string as an aontu literal: the quote, the backslash, the control
// characters and the spaces ECMA-262's `\s` reads beyond ASCII's are
// escaped, the same in both ports.
function strLit(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    const simple = '"\\\b\f\n\r\t'.indexOf(ch)
    out += 0 <= simple ? '\\' + '"\\bfnrt'[simple] :
      c < 0x20 || isEcmaSpace(c) ?
        '\\u' + c.toString(16).padStart(4, '0') : ch
  }
  return out + '"'
}


function isObj(v: J): v is Map<string, J> {
  return v instanceof Map
}


function isSchema(v: J): boolean {
  return isObj(v) || 'boolean' === typeof v
}


function ptrAt(ptr: string, key: string | number): string {
  return ptr + '/' + ('' + key).replace(/~/g, '~0').replace(/\//g, '~1')
}


// An alias name spelled reversibly from what it names: a letter or
// digit stands, `_` doubles, and any other code point is its hex between
// two `_`, as is a digit that would open the name.
function enc(s: string, opens: boolean): string {
  if ('' === s) {
    return '_'
  }
  let out = ''
  for (const ch of s) {
    out += '_' === ch ? '__' :
      /[A-Za-z]/.test(ch) || (/[0-9]/.test(ch) && !(opens && '' === out)) ? ch :
        '_' + (ch.codePointAt(0) as number).toString(16) + '_'
  }
  return out
}


function aliasName(frag: { anchor?: string, segs?: string[] }): string {
  if (undefined !== frag.anchor) {
    return '_a-' + enc(frag.anchor, false)
  }
  const segs = frag.segs as string[]
  if (0 === segs.length) {
    return '_root'
  }
  if (2 === segs.length && '$defs' === segs[0]) {
    return enc(segs[1], true)
  }
  return '_p' + segs.map((s) => '-' + enc(s, false)).join('')
}


const KIND_ORDER = ['null', 'boolean', 'number', 'string', 'object', 'array']
const TYPES = [...KIND_ORDER, 'integer']

const SCHEMA_MAPS = ['properties', 'patternProperties', '$defs',
  'dependentSchemas']
const SCHEMA_ONE = ['additionalProperties', 'propertyNames', 'items',
  'contains', 'not', 'if', 'then', 'else', 'unevaluatedProperties',
  'unevaluatedItems', 'contentSchema']
const SCHEMA_LISTS = ['prefixItems', 'allOf', 'anyOf', 'oneOf']

const CARRIED = new Set(['$schema', '$id', '$ref', '$anchor', '$defs',
  'type', 'enum', 'const', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then',
  'else', 'dependentSchemas', 'dependentRequired', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength',
  'pattern', 'properties', 'required', 'additionalProperties',
  'patternProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'prefixItems', 'items', 'minItems', 'maxItems'])

const ANNOTATION = new Set(['title', 'description', 'default', 'examples',
  'deprecated', 'readOnly', 'writeOnly', '$comment', 'format',
  'contentEncoding', 'contentMediaType', 'contentSchema'])

const LATER = new Set(['contains', 'minContains', 'maxContains', 'uniqueItems', '$dynamicRef',
  '$dynamicAnchor', 'unevaluatedProperties', 'unevaluatedItems',
  '$vocabulary'])


type Ctx = {
  root: J
  lossy: SchemaLoss[]
  aliases: Map<string, string | undefined>
  anchors: Map<string, { node: J, ptr: string }>
}


function lose(ctx: Ctx, path: string, construct: string, reason: string) {
  ctx.lossy.push({ path, construct, reason })
}


function refuse(path: string, why: string): never {
  throw new Refusal('jsonschema_schema', path, why)
}


// The anchors of every schema position, before any reference is read:
// one name in one document is one subschema (`jsonschema_duplicate`).
function collectAnchors(ctx: Ctx, node: J, ptr: string) {
  if (!isObj(node)) {
    return
  }
  const anchor = node.get('$anchor')
  if (node.has('$anchor')) {
    if ('string' !== typeof anchor || !/^[A-Za-z_][-A-Za-z0-9._]*$/.test(anchor)) {
      refuse(ptrAt(ptr, '$anchor'), 'an anchor must be a plain name')
    }
    if (ctx.anchors.has(anchor as string)) {
      throw new Refusal('jsonschema_duplicate', ptrAt(ptr, '$anchor'),
        'the anchor ' + strLit(anchor) + ' names two subschemas')
    }
    ctx.anchors.set(anchor as string, { node, ptr })
  }
  for (const [k, v] of node) {
    if (SCHEMA_MAPS.includes(k) && isObj(v)) {
      for (const [sk, sv] of v) {
        collectAnchors(ctx, sv, ptrAt(ptrAt(ptr, k), sk))
      }
    }
    else if (SCHEMA_ONE.includes(k)) {
      collectAnchors(ctx, v, ptrAt(ptr, k))
    }
    else if (SCHEMA_LISTS.includes(k) && Array.isArray(v)) {
      v.forEach((sv, n) => collectAnchors(ctx, sv, ptrAt(ptrAt(ptr, k), n)))
    }
  }
}


// `$ref` inside this document: `#`, a JSON pointer, or an anchor.
function refAlias(ctx: Ctx, ref: J, path: string): string {
  if ('string' !== typeof ref) {
    refuse(path, '$ref must be a string')
  }
  const bad = (why: string): never => {
    throw new Refusal('jsonschema_ref', path,
      'the reference ' + strLit(ref) + ' ' + why)
  }
  if (!ref.startsWith('#')) {
    bad('names another document, and the import reads one document')
  }
  let frag: string
  try {
    frag = decodeURIComponent(ref.substring(1))
  }
  catch {
    return bad('is not a well-formed fragment')
  }
  let node: J | undefined
  let ptr = '#'
  let name: string
  if ('' === frag || frag.startsWith('/')) {
    const segs = '' === frag ? [] : frag.substring(1).split('/')
    if (segs.some((s) => /~[^01]|~$/.test(s))) {
      bad('is not a well-formed JSON pointer')
    }
    const keys = segs.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    node = ctx.root
    for (const k of keys) {
      node = isObj(node as J) ? (node as Map<string, J>).get(k) :
        Array.isArray(node) && /^(0|[1-9][0-9]*)$/.test(k) ? node[Number(k)] :
          undefined
      ptr = ptrAt(ptr, k)
    }
    name = aliasName({ segs: keys })
  }
  else {
    const anchored = ctx.anchors.get(frag)
    node = anchored?.node
    ptr = anchored?.ptr ?? ptr
    name = aliasName({ anchor: frag })
  }
  if (undefined === node || !isSchema(node)) {
    bad('names no schema in this document')
  }
  declare(ctx, name, node as J, ptr)
  return '%' + name
}


function declare(ctx: Ctx, name: string, node: J, ptr: string) {
  if (!ctx.aliases.has(name)) {
    ctx.aliases.set(name, undefined)
    ctx.aliases.set(name, I(ctx, node, ptr))
  }
}


function lit(ctx: Ctx, v: J, path: string): string {
  if (null === v || 'boolean' === typeof v) {
    return '' + v
  }
  if (v instanceof JNum) {
    return numberText(v.text, path)
  }
  if ('string' === typeof v) {
    return strLit(v)
  }
  if (Array.isArray(v)) {
    return 'close([' + v.map((e, n) => lit(ctx, e, ptrAt(path, n)))
      .join(', ') + '])'
  }
  return 'close({' + [...v].map(([k, e]) =>
    strLit(k) + ': ' + lit(ctx, e, ptrAt(path, k))).join(', ') + '})'
}


function count(v: J | undefined, path: string): string | undefined {
  if (undefined === v) {
    return undefined
  }
  const n = v instanceof JNum ? numberText(v.text, path) : '-'
  if (n.startsWith('-') || n.includes('.')) {
    refuse(path, 'a count must be a non-negative integer')
  }
  return n
}


function num(v: J | undefined, path: string): string | undefined {
  if (undefined === v) {
    return undefined
  }
  if (!(v instanceof JNum)) {
    refuse(path, 'a bound must be a number')
  }
  return numberText((v as JNum).text, path)
}


function divisor(v: J | undefined, path: string): string | undefined {
  if (undefined === v) {
    return undefined
  }
  const n = v instanceof JNum ? numberText(v.text, path) : '-'
  if (n.startsWith('-') || '0' === n) {
    refuse(path, 'a divisor must be a number greater than 0')
  }
  return n
}


function schemaMap(v: J | undefined, path: string): Map<string, J> {
  if (undefined === v) {
    return new Map()
  }
  if (!isObj(v) || [...v.values()].some((s) => !isSchema(s))) {
    refuse(path, 'the value must be an object of schemas')
  }
  return v as Map<string, J>
}


function schemaList(v: J | undefined, path: string): J[] {
  if (undefined === v) {
    return []
  }
  if (!Array.isArray(v) || 0 === v.length || v.some((s) => !isSchema(s))) {
    refuse(path, 'the value must be a non-empty array of schemas')
  }
  return v as J[]
}


function schemaOne(v: J | undefined, path: string): J | undefined {
  if (undefined !== v && !isSchema(v)) {
    refuse(path, 'the value must be a schema')
  }
  return v
}


function both(parts: string[]): string {
  return 0 === parts.length ? 'any' : parts.join(' & ')
}


function paren(s: string): string {
  return s.includes(' & ') || s.includes(' | ') ? '(' + s + ')' : s
}


// ECMA-262's `\s` and `.`, which re() reads more narrowly, in re()'s
// own spelling.
const ECMA_SPACE = ' \\t\\n\\r\\f\\v\u00a0\u1680\u2000-\u200a\u2028\u2029' +
  '\u202f\u205f\u3000\ufeff'
const ECMA_DOT = '[^\\n\\r\u2028\u2029]'

// A letter or digit ECMA-262's `u` mode gives a meaning after a backslash.
const ECMA_ESC = '0123456789bBcdDfknpPrsStuvwWx'


type ReTok = {
  k: 'atom' | 'open' | 'close' | 'alt' | 'quant' | 'raw'
  s: string
  // The atom as one member of a class, where it can be one.
  m?: string
  // A group never written as a class: a lookaround, or a `(?` re() refuses.
  lock?: boolean
}


function reLit(ch: string, inClass: boolean): string {
  return (inClass ? '\\]^-[' : '\\.+*?()[]{}|^$').includes(ch) ? '\\' + ch : ch
}


function isHex(c: string | undefined): boolean {
  return undefined !== c && /^[0-9A-Fa-f]$/.test(c)
}


// The `\u` escape at i of cs as [code point, length], or undefined.
function uEscape(cs: string[], i: number): [number, number] | undefined {
  if ('{' === cs[i + 2]) {
    const end = cs.indexOf('}', i + 3)
    const h = cs.slice(i + 3, end).join('')
    return i + 3 < end && /^[0-9A-Fa-f]{1,6}$/.test(h) &&
      parseInt(h, 16) <= 0x10ffff ? [parseInt(h, 16), end + 1 - i] : undefined
  }
  if (!cs.slice(i + 2, i + 6).every(isHex) || cs.length < i + 6) {
    return undefined
  }
  const hi = parseInt(cs.slice(i + 2, i + 6).join(''), 16)
  const lo = cs.slice(i + 8, i + 12)
  if (0xd800 <= hi && hi <= 0xdbff && '\\' === cs[i + 6] &&
    'u' === cs[i + 7] && 4 === lo.length && lo.every(isHex)) {
    const l = parseInt(lo.join(''), 16)
    if (0xdc00 <= l && l <= 0xdfff) {
      return [0x10000 + ((hi - 0xd800) << 10) + (l - 0xdc00), 12]
    }
  }
  return [hi, 6]
}


// An ECMA-262 pattern in what re() reads alike: `\s`, `\S` and `.` as
// ECMA reads them, a `\u` escape as its character, a named group as a
// non-capturing one, and a quantified alternation of single characters
// as a class. Returns [pattern, why]; what re() still refuses is left
// for it to name.
function ecmaPattern(src: string): [string, string] {
  const cs = [...src]
  const toks: ReTok[] = []

  // The escape at i as [outside a class, inside one, length], or why
  // ECMA-262's grammar refuses it. A lone surrogate stays an escape re()
  // refuses.
  const esc = (i: number): [string, string | undefined, number] | string => {
    const n = cs[i + 1]
    if (undefined === n) {
      return ['\\', undefined, 1]
    }
    if ('u' === n) {
      const u = uEscape(cs, i)
      if (undefined === u || (0xd800 <= u[0] && u[0] <= 0xdfff)) {
        return ['\\u', undefined, 2]
      }
      const ch = String.fromCodePoint(u[0])
      return [reLit(ch, false), reLit(ch, true), u[1]]
    }
    if ('s' === n) {
      return ['[' + ECMA_SPACE + ']', ECMA_SPACE, 2]
    }
    if ('S' === n) {
      return ['[^' + ECMA_SPACE + ']', undefined, 2]
    }
    if (/^[A-Za-z0-9]$/.test(n) && !ECMA_ESC.includes(n)) {
      return '\\' + n + ', an escape ECMA-262 does not define'
    }
    if ('x' === n && isHex(cs[i + 2]) && isHex(cs[i + 3])) {
      const x = '\\x' + cs[i + 2] + cs[i + 3]
      return [x, x, 4]
    }
    const one = '\\' + n
    const member = 'dwfnrtv-^$\\.*+?()[]{}|/'.includes(n)
    return [one, member ? one : undefined, 2]
  }

  // One class body from j, ECMA's ClassRanges: an atom, `-` and an atom
  // is a range, which a class escape may not end in `u` mode.
  const klass = (j: number): [string, number] | string => {
    const items: { s: string, cls: boolean, dash: boolean }[] = []
    while (j < cs.length && ']' !== cs[j]) {
      if ('\\' !== cs[j]) {
        items.push({ s: '[' === cs[j] ? '\\[' : cs[j], cls: false,
          dash: '-' === cs[j] })
        j++
        continue
      }
      const e = esc(j)
      if ('string' === typeof e) {
        return e
      }
      items.push({ s: e[1] ?? cs.slice(j, j + e[2]).join(''),
        cls: 'dDwWsS'.includes(cs[j + 1]), dash: false })
      j += e[2]
    }
    for (let k = 0; k < items.length; k++) {
      if (items[k + 1]?.dash && k + 2 < items.length) {
        if (items[k].cls || items[k + 2].cls) {
          return 'a class escape as the end of a range, which ECMA-262 ' +
            'refuses'
        }
        k += 2
      }
    }
    return [items.map((x) => x.s).join(''), j]
  }

  let i = 0
  while (i < cs.length) {
    const c = cs[i]
    if ('\\' === c) {
      const e = esc(i)
      if ('string' === typeof e) {
        return ['', e]
      }
      const [s, m, len] = e
      toks.push('-' === cs[i + 1] || undefined === m ? { k: 'raw', s } :
        { k: 'atom', s, m })
      i += len
    }
    else if ('[' === c) {
      const neg = '^' === cs[i + 1]
      const body = klass(neg ? i + 2 : i + 1)
      if ('string' === typeof body) {
        return ['', body]
      }
      const closed = body[1] < cs.length
      toks.push({ k: 'atom', s: '[' + (neg ? '^' : '') + body[0] +
        (closed ? ']' : '') })
      i = body[1] + 1
    }
    else if ('(' === c) {
      const named = '?' === cs[i + 1] && '<' === cs[i + 2] ?
        cs.slice(i + 3).join('').match(/^[A-Za-z_$][A-Za-z0-9_$]*>/) : null
      const look = cs.slice(i, i + 4).join('').match(/^\(\?(?:[=!]|<[=!])/)
      if (null != named) {
        toks.push({ k: 'open', s: '(?:' })
        i += 3 + named[0].length
      }
      else if ('?' !== cs[i + 1] || ':' === cs[i + 2]) {
        const s = '?' === cs[i + 1] ? '(?:' : '('
        toks.push({ k: 'open', s })
        i += s.length
      }
      else {
        const s = null == look ? '(?' : look[0]
        toks.push({ k: 'open', s, lock: true })
        i += s.length
      }
    }
    else if (']' === c) {
      return ['', 'a ] outside a character class, which ECMA-262 refuses']
    }
    else {
      toks.push(')' === c ? { k: 'close', s: c } :
        '|' === c ? { k: 'alt', s: c } :
          '*+?{'.includes(c) ? { k: 'quant', s: c } :
            '.' === c ? { k: 'atom', s: ECMA_DOT } :
              '^$}'.includes(c) ? { k: 'raw', s: c } :
                { k: 'atom', s: c, m: reLit(c, true) })
      i++
    }
  }

  const emit = (from: number, to: number): string => {
    let out = ''
    for (let t = from; t < to; t++) {
      const tok = toks[t]
      if ('open' !== tok.k) {
        out += tok.s
        continue
      }
      let depth = 0
      let close = -1
      for (let u = t; u < to && close < 0; u++) {
        depth += 'open' === toks[u].k ? 1 : 'close' === toks[u].k ? -1 : 0
        close = 0 === depth ? u : -1
      }
      if (close < 0) {
        return out + tok.s + emit(t + 1, to)
      }
      const inner = toks.slice(t + 1, close)
      const single = 1 < inner.length && 1 === inner.length % 2 &&
        inner.every((x, n) => 0 === n % 2 ? undefined !== x.m : 'alt' === x.k)
      out += !tok.lock && single && 'quant' === toks[close + 1]?.k ?
        '[' + inner.filter((x) => undefined !== x.m).map((x) => x.m)
          .join('') + ']' :
        tok.s + emit(t + 1, close) + ')'
      t = close
    }
    return out
  }

  return [emit(0, toks.length), '']
}


// A pattern re() carries, or a loss and undefined.
function pattern(ctx: Ctx, p: J, path: string): string | undefined {
  if ('string' !== typeof p) {
    refuse(path, 'a pattern must be a string')
  }
  const [re, ecmaWhy] = ecmaPattern(p as string)
  const why = '' === ecmaWhy ? normaliseRe(re)[1] : ecmaWhy
  if ('' !== why) {
    lose(ctx, path, 'pattern',
      'the pattern uses ' + why + ', which re() does not carry, so it is ' +
      'DROPPED and the import admits strings the schema refuses')
    return undefined
  }
  return 're(' + strLit(re) + ')'
}


function objectBranch(ctx: Ctx, o: Map<string, J>, ptr: string): string | undefined {
  const props = schemaMap(o.get('properties'), ptrAt(ptr, 'properties'))
  const reqv = o.get('required')
  if (undefined !== reqv && (!Array.isArray(reqv) ||
    reqv.some((k) => 'string' !== typeof k) ||
    new Set(reqv).size !== reqv.length)) {
    refuse(ptrAt(ptr, 'required'), 'required must be an array of distinct strings')
  }
  const required = (reqv ?? []) as string[]
  const entries = [...props].map(([k, s]) => strLit(k) +
    (required.includes(k) ? '' : '?') + ': ' +
    I(ctx, s, ptrAt(ptrAt(ptr, 'properties'), k)))
  for (const k of required.filter((k) => !props.has(k))) {
    entries.push(strLit(k) + ': any')
  }

  const guards: string[] = []
  const known: string[] = [...props.keys()].map((k) => strLit(k) + ', any')
  let exact = true
  for (const [p, s] of schemaMap(o.get('patternProperties'),
    ptrAt(ptr, 'patternProperties'))) {
    const at = ptrAt(ptrAt(ptr, 'patternProperties'), p)
    const re = pattern(ctx, p, at)
    if (undefined === re) {
      exact = false
      continue
    }
    guards.push('match(key(0), ' + re + ', ' + I(ctx, s, at) + ', any)')
    known.push(re + ', any')
  }
  const ap = schemaOne(o.get('additionalProperties'),
    ptrAt(ptr, 'additionalProperties'))
  if (undefined !== ap && true !== ap) {
    if (!exact) {
      lose(ctx, ptrAt(ptr, 'additionalProperties'), 'additionalProperties',
        'a pattern beside it is not carried, so the keys it would cover are ' +
        'not known and it is DROPPED: the import admits keys the schema refuses')
    }
    else {
      const rest = I(ctx, ap, ptrAt(ptr, 'additionalProperties'))
      guards.push(0 === known.length ? rest :
        'match(key(0), ' + known.join(', ') + ', ' + rest + ')')
    }
  }
  const pn = schemaOne(o.get('propertyNames'), ptrAt(ptr, 'propertyNames'))
  if (undefined !== pn && true !== pn) {
    guards.push(false === pn ? 'nil' : 'match(key(0), empty() & ' +
      paren(I(ctx, pn, ptrAt(ptr, 'propertyNames'))) + ', any, nil)')
  }

  const counts = [
    count(o.get('minProperties'), ptrAt(ptr, 'minProperties')),
    count(o.get('maxProperties'), ptrAt(ptr, 'maxProperties')),
  ]
  const lens = counts.flatMap((c, n) => undefined === c ? [] :
    ['len(' + (0 === n ? 'min' : 'max') + '(' + c + '))'])
  if (0 === entries.length && 0 === guards.length) {
    return 0 === lens.length ? undefined : both(['map', ...lens])
  }
  const body = [...entries,
    ...(0 === guards.length ? [] : ['&: ' + guards.join(' & ')])]
  return both(['{' + body.join(', ') + '}', ...lens])
}


function arrayBranch(ctx: Ctx, o: Map<string, J>, ptr: string): string | undefined {
  const prefix = o.has('prefixItems') ?
    schemaList(o.get('prefixItems'), ptrAt(ptr, 'prefixItems')) : []
  const items = schemaOne(o.get('items'), ptrAt(ptr, 'items'))
  const rest = undefined === items || true === items ? undefined :
    I(ctx, items, ptrAt(ptr, 'items'))
  const arms = prefix.map((s, n) => strLit('' + n) + ', ' +
    I(ctx, s, ptrAt(ptrAt(ptr, 'prefixItems'), n)))
  const spread = 0 < arms.length ?
    'match(key(0), ' + arms.join(', ') + ', ' + (rest ?? 'any') + ')' : rest
  const counts = [
    count(o.get('minItems'), ptrAt(ptr, 'minItems')),
    count(o.get('maxItems'), ptrAt(ptr, 'maxItems')),
  ]
  const lens = counts.flatMap((c, n) => undefined === c ? [] :
    ['len(' + (0 === n ? 'min' : 'max') + '(' + c + '))'])
  if (undefined === spread && 0 === lens.length) {
    return undefined
  }
  return both([undefined === spread ? 'list' : '[&: ' + spread + ']', ...lens])
}


function numberBranch(o: Map<string, J>, ptr: string, integral: boolean): string | undefined {
  const bounds = ([['minimum', 'min'], ['maximum', 'max'],
    ['exclusiveMinimum', 'above'], ['exclusiveMaximum', 'below']] as const)
    .flatMap(([k, atom]) => {
      const n = num(o.get(k), ptrAt(ptr, k))
      return undefined === n ? [] : [atom + '(' + n + ')']
    })
  const d = divisor(o.get('multipleOf'), ptrAt(ptr, 'multipleOf'))
  const atoms = [...(integral ? ['multiple(1)'] : []), ...bounds,
    ...(undefined === d ? [] : ['multiple(' + d + ')'])]
  return 0 === atoms.length ? undefined : both(['number', ...atoms])
}


function stringBranch(ctx: Ctx, o: Map<string, J>, ptr: string): string | undefined {
  const parts = [
    count(o.get('minLength'), ptrAt(ptr, 'minLength')),
    count(o.get('maxLength'), ptrAt(ptr, 'maxLength')),
  ].flatMap((c, n) => undefined === c ? [] :
    ['len(' + (0 === n ? 'min' : 'max') + '(' + c + '))'])
  if (o.has('pattern')) {
    const re = pattern(ctx, o.get('pattern') as J, ptrAt(ptr, 'pattern'))
    if (undefined !== re) {
      parts.push(re)
    }
  }
  return 0 === parts.length ? undefined : both(['empty()', ...parts])
}


// The kind split (design section 2): each keyword applies to its own
// instance kind and passes every other, so each kind is one branch.
function kinds(ctx: Ctx, o: Map<string, J>, ptr: string): string | undefined {
  const t = o.get('type')
  const typed = undefined === t ? undefined : 'string' === typeof t ? [t] : t
  if (undefined !== typed && (!Array.isArray(typed) || 0 === typed.length ||
    typed.some((n) => 'string' !== typeof n || !TYPES.includes(n)) ||
    new Set(typed).size !== typed.length)) {
    refuse(ptrAt(ptr, 'type'),
      'type must name 2020-12 types, as a string or a non-empty array')
  }
  const names = typed as string[] | undefined
  const allows = (k: string) => undefined === names || names.includes(k) ||
    ('number' === k && names.includes('integer'))
  const integral = undefined !== names && names.includes('integer') &&
    !names.includes('number')
  const scoped: Record<string, string | undefined> = {
    null: undefined, boolean: undefined,
    number: numberBranch(o, ptr, integral),
    string: stringBranch(ctx, o, ptr),
    object: objectBranch(ctx, o, ptr),
    array: arrayBranch(ctx, o, ptr),
  }
  const bare: Record<string, string> = {
    null: 'null', boolean: 'boolean', number: 'number', string: 'empty()',
    object: 'map', array: 'list',
  }
  const live = KIND_ORDER.filter(allows)
  if (undefined === names && live.every((k) => undefined === scoped[k])) {
    return undefined
  }
  const branches = live.map((k) => scoped[k] ?? bare[k])
  return 1 === branches.length ? branches[0] :
    '(' + branches.map(paren).join(' | ') + ')'
}


// The JSON kinds a schema can admit, over-approximated: an alternative
// whose kind no other alternative shares can be told apart by its kind.
function kindsOf(node: J): Set<string> {
  if (!isObj(node)) {
    return new Set(true === node ? KIND_ORDER : [])
  }
  let ks = new Set(KIND_ORDER)
  const keep = (s: Set<string>) => {
    ks = new Set([...ks].filter((k) => s.has(k)))
  }
  const t = node.get('type')
  if (undefined !== t) {
    keep(new Set((Array.isArray(t) ? t : [t])
      .map((n) => 'integer' === n ? 'number' : n as string)))
  }
  if (node.has('const')) {
    keep(new Set([jsonKind(node.get('const') as J)]))
  }
  if (node.has('enum')) {
    keep(new Set((node.get('enum') as J[]).map(jsonKind)))
  }
  for (const s of (node.get('allOf') ?? []) as J[]) {
    keep(kindsOf(s))
  }
  for (const k of ['anyOf', 'oneOf']) {
    if (node.has(k)) {
      keep(new Set((node.get(k) as J[]).flatMap((s) => [...kindsOf(s)])))
    }
  }
  return ks
}


function jsonKind(v: J): string {
  return null === v ? 'null' : 'boolean' === typeof v ? 'boolean' :
    v instanceof JNum ? 'number' : 'string' === typeof v ? 'string' :
      Array.isArray(v) ? 'array' : 'object'
}


// What makes `|` answer differently from a count: a member the value
// may lack, a count decided at generation, a Band B atom, a closed
// container, or a reference the walk cannot see through.
const UNPLAIN = ['required', 'minProperties', 'maxProperties', 'minItems',
  'maxItems', 'contains', 'minContains', 'maxContains', 'uniqueItems',
  'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentRequired',
  'dependentSchemas', 'additionalProperties', 'unevaluatedProperties',
  'unevaluatedItems', '$ref', '$dynamicRef']

function plain(node: J): boolean {
  if (!isObj(node)) {
    return true
  }
  for (const [k, v] of node) {
    const empty = 'required' === k && Array.isArray(v) && 0 === v.length
    const open = true === v && k.endsWith('Properties')
    if ((UNPLAIN.includes(k) && !empty && !open) ||
      (('const' === k || 'enum' === k) &&
        [...('enum' === k ? v as J[] : [v])].some((x) =>
          Array.isArray(x) || isObj(x))) ||
      ('items' === k && false === v)) {
      return false
    }
  }
  const subs: J[] = [
    ...[...schemaMapOf(node.get('properties'))],
    ...[...schemaMapOf(node.get('patternProperties'))],
    ...((node.get('prefixItems') ?? []) as J[]),
    ...((node.get('allOf') ?? []) as J[]),
    ...(['items', 'propertyNames'].flatMap((k) => node.has(k) ?
      [node.get(k) as J] : [])),
  ]
  return subs.every(plain)
}


function schemaMapOf(v: J | undefined): J[] {
  return isObj(v as J) ? [...(v as Map<string, J>).values()] : []
}


// A scalar literal alternative: a `const` or an `enum` of scalars and
// nothing else, its JSON values keyed by value.
function literals(node: J): string[] | undefined {
  if (!isObj(node)) {
    return undefined
  }
  const keys = [...node.keys()].filter((k) => !ANNOTATION.has(k))
  const vals = 1 !== keys.length ? undefined : 'const' === keys[0] ?
    [node.get('const') as J] : 'enum' === keys[0] ? node.get('enum') as J[] :
      undefined
  if (undefined === vals || vals.some((v) => Array.isArray(v) || isObj(v))) {
    return undefined
  }
  return vals.map((v) => null === v ? 'z' : 'boolean' === typeof v ? 'b' + v :
    v instanceof JNum ? 'n' + numberText(v.text, '#') : 's' + v)
}


function disjoin(srcs: string[]): string {
  return 1 === srcs.length ? srcs[0] :
    '(' + srcs.map(paren).join(' | ') + ')'
}


// `anyOf` is `|` where at most one alternative can survive the meet with
// any value, and a count of at least one everywhere else.
function anyOf(ctx: Ctx, o: Map<string, J>, ptr: string): string {
  const at = ptrAt(ptr, 'anyOf')
  const list = schemaList(o.get('anyOf'), at)
  const srcs = list.map((s, n) => I(ctx, s, ptrAt(at, n)))
  const kinds = list.map(kindsOf)
  const apart = kinds.every((a, i) => kinds.every((b, j) =>
    i === j || ![...a].some((k) => b.has(k))))
  return list.every((s) => undefined !== literals(s)) ||
    (apart && list.every(plain)) ? disjoin(srcs) :
    'nof(min(1), ' + srcs.join(', ') + ')'
}


// `oneOf` is `|` only over scalar literals no alternative shares with
// another, since a scalar equals at most one of them.
function oneOf(ctx: Ctx, o: Map<string, J>, ptr: string): string {
  const at = ptrAt(ptr, 'oneOf')
  const list = schemaList(o.get('oneOf'), at)
  const srcs = list.map((s, n) => I(ctx, s, ptrAt(at, n)))
  const lits = list.map(literals)
  const seen = new Set<string>()
  const distinct = lits.every((l) => undefined !== l &&
    [...new Set(l)].every((v) => !seen.has(v) && (seen.add(v), true)))
  return distinct ? disjoin(srcs) : 'nof(1, ' + srcs.join(', ') + ')'
}


// `not: {enum: [...]}` beside a single `string` or `integer` type is an
// exclusion the meet decides, every leaf of a number spelled; anything
// else is a count of none.
function not(ctx: Ctx, o: Map<string, J>, ptr: string): string | undefined {
  const at = ptrAt(ptr, 'not')
  const n = schemaOne(o.get('not'), at) as J
  const src = I(ctx, n, at)
  const t = o.get('type')
  const m = isObj(n) ? n : undefined
  const lits = undefined === m ? [] :
    [...m.keys()].filter((k) => !ANNOTATION.has(k))
  const vals = undefined === m || 1 !== lits.length ? undefined :
    'const' === lits[0] ? [m.get('const') as J] :
      'enum' === lits[0] ? m.get('enum') as J[] : undefined
  if (undefined !== vals && ('string' === t || 'integer' === t)) {
    const spelt = vals.flatMap((v): (string | undefined)[] => {
      if ('string' === t) {
        return 'string' === typeof v ? [strLit(v)] : []
      }
      const num = v instanceof JNum ? numberText(v.text, at) : '0d.'
      if (num.includes('.')) {
        return []
      }
      const neg = num.startsWith('-') ? '-' : ''
      const digits = num.substring(neg.length)
      // Parenthesised, since the TypeScript parser loops on a call whose
      // first argument is negative (use-cases/BUGS.md, 98).
      const spell = (s: string) => '' === neg ? s : '(' + s + ')'
      return digits.startsWith('0d') ? [undefined] :
        [num, num + '.0', neg + '0d' + digits, neg + '0d' + digits + '.0']
          .map(spell)
    })
    if (!spelt.includes(undefined)) {
      return 0 === spelt.length ? undefined : 'neq(' + spelt.join(', ') + ')'
    }
  }
  return 'nof(0, ' + src + ')'
}


// `if` with `then` or `else` is a conditional; one without the other
// asks nothing of a value.
function conditional(ctx: Ctx, o: Map<string, J>, ptr: string): string {
  const arm = (k: string) => I(ctx, o.get(k) as J, ptrAt(ptr, k))
  return 'when(' + [arm('if'), o.has('then') ? arm('then') : 'any',
    ...(o.has('else') ? [arm('else')] : [])].join(', ') + ')'
}


// A dependency is a conditional whose condition is the key's presence.
function dependencies(ctx: Ctx, o: Map<string, J>, ptr: string): string[] {
  const out: string[] = []
  const sat = ptrAt(ptr, 'dependentSchemas')
  for (const [k, s] of schemaMap(o.get('dependentSchemas'), sat)) {
    out.push('when({' + strLit(k) + ': any}, ' + I(ctx, s, ptrAt(sat, k)) + ')')
  }
  const req = o.get('dependentRequired')
  if (undefined !== req && (!isObj(req) || [...req.values()].some((v) =>
    !Array.isArray(v) || v.some((n) => 'string' !== typeof n) ||
    new Set(v).size !== v.length))) {
    refuse(ptrAt(ptr, 'dependentRequired'),
      'dependentRequired must be an object of arrays of distinct strings')
  }
  for (const [k, names] of isObj(req as J) ? req as Map<string, J> : []) {
    if (0 < (names as string[]).length) {
      out.push('when({' + strLit(k) + ': any}, {' + (names as string[])
        .map((n) => strLit(n) + ': any').join(', ') + '})')
    }
  }
  return out
}


// A meet empty where it stands is the schema that admits nothing, which
// aontu writes `nil`; a meet through an alias is left to evaluation.
function meetOrNil(parts: string[]): string {
  const src = both(parts)
  if (parts.length < 2 || src.includes('%')) {
    return src
  }
  const a = new Aontu()
  const v: any = a.unify('x: ' + src, undefined, a.ctx({ collect: true }))
  return true === v.peg.x.isNil ? 'nil' : src
}


function I(ctx: Ctx, node: J, ptr: string): string {
  if (true === node) {
    return 'any'
  }
  if (false === node) {
    return 'nil'
  }
  if (!isObj(node)) {
    return refuse(ptr, 'a schema must be an object or a boolean')
  }
  const o = node
  for (const k of o.keys()) {
    const at = ptrAt(ptr, k)
    if (ANNOTATION.has(k)) {
      lose(ctx, at, k, 'an annotation; it is dropped, and what the ' +
        'import admits is unchanged')
    }
    else if (LATER.has(k)) {
      lose(ctx, at, k, 'not carried yet, so it is DROPPED and the import ' +
        'admits instances the schema refuses')
    }
    else if (!CARRIED.has(k)) {
      lose(ctx, at, k, 'not a 2020-12 keyword; it is ignored, as 2020-12 ' +
        'ignores it')
    }
  }
  const schema = o.get('$schema')
  if (undefined !== schema && DRAFT !== schema) {
    lose(ctx, ptrAt(ptr, '$schema'), '$schema', 'the import reads ' +
      '2020-12, so a schema for another dialect is read as 2020-12')
  }
  if (o.has('$id') && '#' !== ptr) {
    lose(ctx, ptrAt(ptr, '$id'), '$id', 'a nested resource is not ' +
      'carried yet; its references are read against the document')
  }

  const parts: string[] = []
  if (o.has('$ref')) {
    parts.push(refAlias(ctx, o.get('$ref') as J, ptrAt(ptr, '$ref')))
  }
  if (o.has('const')) {
    parts.push(lit(ctx, o.get('const') as J, ptrAt(ptr, 'const')))
  }
  if (o.has('enum')) {
    const e = o.get('enum')
    if (!Array.isArray(e)) {
      refuse(ptrAt(ptr, 'enum'), 'enum must be an array')
    }
    const lits = (e as J[]).map((v, n) => lit(ctx, v, ptrAt(ptrAt(ptr, 'enum'), n)))
    parts.push(0 === lits.length ? 'nil' : 1 === lits.length ? lits[0] :
      '(' + lits.join(' | ') + ')')
  }
  schemaList(o.get('allOf'), ptrAt(ptr, 'allOf')).forEach((s, n) =>
    parts.push(paren(I(ctx, s, ptrAt(ptrAt(ptr, 'allOf'), n)))))
  const k = kinds(ctx, o, ptr)
  if (undefined !== k) {
    parts.push(k)
  }
  if (o.has('not')) {
    const n = not(ctx, o, ptr)
    if (undefined !== n) {
      parts.push(n)
    }
  }
  if (o.has('anyOf')) {
    parts.push(anyOf(ctx, o, ptr))
  }
  if (o.has('oneOf')) {
    parts.push(oneOf(ctx, o, ptr))
  }
  if (o.has('if') && (o.has('then') || o.has('else'))) {
    parts.push(conditional(ctx, o, ptr))
  }
  parts.push(...dependencies(ctx, o, ptr))
  return meetOrNil(parts)
}


export function importJsonSchema(text: string): SchemaImportReport {
  const ctx: Ctx = {
    root: null, lossy: [], aliases: new Map(), anchors: new Map(),
  }
  let source: string
  try {
    ctx.root = readJson(text)
    collectAnchors(ctx, ctx.root, '#')
    if (isObj(ctx.root)) {
      for (const [k, s] of schemaMap(ctx.root.get('$defs'), '#/$defs')) {
        declare(ctx, aliasName({ segs: ['$defs', k] }), s, ptrAt('#/$defs', k))
      }
    }
    const inline = I(ctx, ctx.root, '#')
    const body = ctx.aliases.has('_root') ? '%_root' : inline
    const names = [...ctx.aliases.keys()].sort(cmpCodePoint)
    source = [...names.map((n) => '%' + n + ' = ' + ctx.aliases.get(n)),
      'schema: hide(' + body + ')'].join('\n') + '\n'
  }
  catch (e: any) {
    if (!(e instanceof Refusal)) {
      throw e
    }
    const r = e
    return {
      source: '', lossy: [], verdict: 'error',
      errors: [{ code: r.code, class: codeClass(r.code), path: r.path,
        message: r.message }],
    }
  }

  // The import writes only source the formatter reads, so the agreed
  // form is always there to take.
  const formatted: any = format(source)
  const seen = new Set<string>()
  const lossy = ctx.lossy.filter((l) => {
    const key = l.path + '\u0000' + l.construct
    return !seen.has(key) && (seen.add(key), true)
  }).sort((a, b) => cmpCodePoint(a.path, b.path))
  return {
    source: formatted.text,
    lossy,
    verdict: 0 < lossy.length ? 'lossy' : 'ok',
  }
}
