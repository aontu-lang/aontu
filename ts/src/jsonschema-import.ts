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
import { parseUri, resolveUri } from './uri'
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

export type SchemaImportOptions = {
  defaults?: boolean
  documents?: Record<string, string>
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


function aliasName(segs: string[]): string {
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
  '$dynamicRef', '$dynamicAnchor',
  'type', 'enum', 'const', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then',
  'else', 'dependentSchemas', 'dependentRequired', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength',
  'pattern', 'properties', 'required', 'additionalProperties',
  'patternProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'prefixItems', 'items', 'minItems', 'maxItems', 'contains', 'minContains',
  'maxContains', 'uniqueItems', 'unevaluatedProperties', 'unevaluatedItems'])

const ANNOTATION = new Set(['title', 'description', 'default', 'examples',
  'deprecated', 'readOnly', 'writeOnly', '$comment', 'format',
  'contentEncoding', 'contentMediaType', 'contentSchema'])

const LATER = new Set(['$vocabulary'])


type Place = { node: J, ptr: string }

// Each dynamic anchor name in scope, bound to the outermost resource's.
type Env = Map<string, Place>

// How many schemas the import may read once more for each further
// environment a dynamic reference reaches them in.
const CLONE_BUDGET = 1000

type Ctx = {
  root: J
  defaults: boolean
  lossy: SchemaLoss[]
  aliases: Map<string, string | undefined>
  resources: Map<string, Place>
  anchors: Map<string, Map<string, Place>>
  bases: Map<J, string>
  defKeys: Map<J, string>
  unread: Map<string, string>
  dynamics: Map<string, Map<string, Place>>
  env: Env
  rootEnv: Env
  clones: number
  // The places a rest() reads by alias, and those the count or condition
  // beside it reads by the same alias.
  wanted: Set<string>
  hoist: Set<string>
}


function lose(ctx: Ctx, path: string, construct: string, reason: string) {
  ctx.lossy.push({ path, construct, reason })
}


function refuse(path: string, why: string): never {
  throw new Refusal('jsonschema_schema', path, why)
}


function splitFragment(uri: string): [string, string | undefined] {
  const i = uri.indexOf('#')
  return -1 === i ? [uri, undefined] : [uri.slice(0, i), uri.slice(i + 1)]
}


// One URI names one schema, across every document the import reads.
function claim(ctx: Ctx, uri: string, place: Place, path: string) {
  if (place.node !== (ctx.resources.get(uri) ?? place).node) {
    throw new Refusal('jsonschema_duplicate', path,
      'the identifier ' + strLit(uri) + ' names two schemas')
  }
  ctx.resources.set(uri, place)
}


// The resources and anchors of every schema position, each read against
// the base in effect where it stands, before any reference is read: one
// anchor in one resource names one subschema.
function index(ctx: Ctx, node: J, ptr: string, base: string) {
  if (!isObj(node)) {
    return inherit(ctx, node, base)
  }
  if (node.has('$id')) {
    const id = node.get('$id')
    if ('string' !== typeof id) {
      refuse(ptrAt(ptr, '$id'), '$id must be a string')
    }
    const [uri, frag] = splitFragment(resolveUri(base, id as string))
    if ('' !== (frag ?? '')) {
      refuse(ptrAt(ptr, '$id'), 'an $id names a resource, not a fragment ' +
        'of one')
    }
    base = uri
    claim(ctx, base, { node, ptr }, ptrAt(ptr, '$id'))
  }
  ctx.bases.set(node, base)
  for (const kw of ['$anchor', '$dynamicAnchor']) {
    if (node.has(kw)) {
      const name = node.get(kw)
      if ('string' !== typeof name || !/^[A-Za-z_][-A-Za-z0-9._]*$/.test(name)) {
        refuse(ptrAt(ptr, kw), 'an anchor must be a plain name')
      }
      const names = ctx.anchors.get(base) ?? new Map()
      if (node !== (names.get(name as string) ?? { node }).node) {
        throw new Refusal('jsonschema_duplicate', ptrAt(ptr, kw),
          'the anchor ' + strLit(name) + ' names two subschemas')
      }
      ctx.anchors.set(base, names.set(name as string, { node, ptr }))
      if ('$dynamicAnchor' === kw) {
        const dyn = ctx.dynamics.get(base) ?? new Map()
        ctx.dynamics.set(base, dyn.set(name as string, { node, ptr }))
      }
    }
  }
  for (const [k, v] of node) {
    if (SCHEMA_MAPS.includes(k) && isObj(v)) {
      ctx.bases.set(v, base)
      for (const [sk, sv] of v) {
        if ('$defs' === k && isObj(sv)) {
          ctx.defKeys.set(sv, sk)
        }
        index(ctx, sv, ptrAt(ptrAt(ptr, k), sk), base)
      }
    }
    else if (SCHEMA_ONE.includes(k)) {
      index(ctx, v, ptrAt(ptr, k), base)
    }
    else if (SCHEMA_LISTS.includes(k) && Array.isArray(v)) {
      v.forEach((sv, n) => index(ctx, sv, ptrAt(ptrAt(ptr, k), n), base))
    }
    else {
      inherit(ctx, v, base)
    }
  }
}


// What stands in no schema position is data, and names no resource or
// anchor; a reference that reaches into it reads it against the base
// around it.
function inherit(ctx: Ctx, v: J, base: string) {
  if (isObj(v)) {
    ctx.bases.set(v, base)
  }
  if (isObj(v) || Array.isArray(v)) {
    for (const sv of v.values()) {
      inherit(ctx, sv, base)
    }
  }
}


// A document of the set is read when a reference first reaches for it,
// by its retrieval URI, and every one left when a reference names none
// of those, since it may name an $id inside one.
function resource(ctx: Ctx, uri: string): Place | undefined {
  const named = ctx.resources.get(uri)
  const unread = undefined !== named ? [] : ctx.unread.has(uri) ? [uri] :
    [...ctx.unread.keys()].sort(cmpCodePoint)
  for (const doc of unread) {
    const text = ctx.unread.get(doc) as string
    ctx.unread.delete(doc)
    let root: J
    try {
      root = readJson(text)
    }
    catch (e: any) {
      throw new Refusal(e.code, doc + e.path, e.message)
    }
    claim(ctx, doc, { node: root, ptr: doc + '#' }, doc + '#')
    index(ctx, root, doc + '#', doc)
  }
  return ctx.resources.get(uri)
}


// An alias for what a place holds: a place in the document the import
// was handed is named by its pointer, and one in another document by
// that document's URI too.
// Each document of the set is keyed by its URI without the fragment,
// which a retrieval URI does not use.
function readDocuments(ctx: Ctx, docs: Record<string, string>) {
  for (const k of Object.keys(docs).sort(cmpCodePoint)) {
    const uri = splitFragment(k)[0]
    if (ctx.unread.has(uri)) {
      throw new Refusal('jsonschema_duplicate', uri + '#',
        'the identifier ' + strLit(uri) + ' names two schemas')
    }
    ctx.unread.set(uri, docs[k])
  }
}


function placeName(ptr: string): string {
  const at = ptr.indexOf('#')
  const segs = ptr.slice(at + 1).split('/').slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  return 0 === at ? aliasName(segs) :
    '_d-' + enc(ptr.slice(0, at), false) + segs.map((s) => '-' + enc(s, false)).join('')
}


// A reference, resolved against the base of the schema it sits in, to
// the place it names, with the URI it was resolved to.
function target(ctx: Ctx, o: Map<string, J>, kw: string, path: string):
  Place & { frag: string, uri: string } {
  const ref = o.get(kw) as J
  if ('string' !== typeof ref) {
    refuse(path, kw + ' must be a string')
  }
  const bad = (why: string): never => {
    throw new Refusal('jsonschema_ref', path,
      'the reference ' + strLit(ref) + ' ' + why)
  }
  const [uri, raw] = splitFragment(resolveUri(ctx.bases.get(o) as string,
    ref as string))
  const res = resource(ctx, uri) ?? bad('names a document the import was ' +
    'not given')
  let frag: string
  try {
    frag = decodeURIComponent(raw ?? '')
  }
  catch {
    return bad('is not a well-formed fragment')
  }
  let node: J | undefined
  let ptr = res.ptr
  if ('' === frag || frag.startsWith('/')) {
    const segs = '' === frag ? [] : frag.substring(1).split('/')
    if (segs.some((s) => /~[^01]|~$/.test(s))) {
      bad('is not a well-formed JSON pointer')
    }
    node = res.node
    for (const k of segs.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      node = isObj(node as J) ? (node as Map<string, J>).get(k) :
        Array.isArray(node) && /^(0|[1-9][0-9]*)$/.test(k) ? node[Number(k)] :
          undefined
      ptr = ptrAt(ptr, k)
    }
  }
  else {
    const anchored = ctx.anchors.get(uri)?.get(frag)
    node = anchored?.node
    ptr = anchored?.ptr ?? ptr
  }
  if (undefined === node || !isSchema(node)) {
    bad('names no schema in this document')
  }
  return { node: node as J, ptr, frag, uri: uri + '#' + (raw ?? '') }
}


// `$dynamicRef`: where its first target declares the dynamic anchor its
// fragment names, the schema the outermost resource in scope binds it
// to, or that target where none does, and a `$ref` otherwise.
function dynamicAlias(ctx: Ctx, o: Map<string, J>, path: string): string {
  const t = target(ctx, o, '$dynamicRef', path)
  if (!isObj(t.node) || t.frag !== t.node.get('$dynamicAnchor')) {
    return use(ctx, t)
  }
  return 'meta(' + use(ctx, ctx.env.get(t.frag) ?? t) + ', { dynamicRef: ' +
    strLit(t.uri) + ' })'
}


// One place in one environment, one alias: an anchor names the alias of
// the place it stands, so a schema reached by anchor and by pointer is
// one alias, and a schema read in another environment is another.
function use(ctx: Ctx, place: Place): string {
  const name = aliasOf(ctx, place.node, place.ptr)
  declare(ctx, name, place.node, place.ptr)
  return '%' + name
}


function aliasOf(ctx: Ctx, node: J, ptr: string): string {
  const env = enter(ctx, ctx.env, node)
  // An environment only grows from the root resource's, binding names it
  // lacks, so one no larger is the root's.
  if (env.size === ctx.rootEnv.size) {
    return placeName(ptr)
  }
  const name = placeName(ptr) + [...env.keys()].sort(cmpCodePoint).map((n) =>
    '-_e-' + enc(n, false) + '-' + placeName((env.get(n) as Place).ptr)).join('')
  if (!ctx.aliases.has(name) && CLONE_BUDGET < ++ctx.clones) {
    throw new Refusal('jsonschema_budget', ptr, 'more than ' + CLONE_BUDGET +
      ' schemas are read once more in another dynamic scope')
  }
  return name
}


// The environment a schema is read in: the one around it, and the
// dynamic anchors its resource declares that no outer one binds.
function enter(ctx: Ctx, env: Env, node: J): Env {
  const own = ctx.dynamics.get(ctx.bases.get(node) as string)
  const fresh = [...(own ?? new Map()).entries()]
    .filter(([n]) => !env.has(n))
  return 0 === fresh.length ? env : new Map([...env, ...fresh])
}



function declare(ctx: Ctx, name: string, node: J, ptr: string) {
  if (!ctx.aliases.has(name)) {
    ctx.aliases.set(name, undefined)
    const body = bodyOf(ctx, node, ptr)
    const rec = identity(ctx, name, node, ptr)
    ctx.aliases.set(name, '' === rec ? body : 'identity(' + body + ', ' +
      rec + ')')
  }
}


// What the export needs to give a schema back its place: the $id of the
// resource it is, where that is absolute, its $anchor and $dynamicAnchor,
// where the export leaves them in the resource that holds them, and its
// $defs key.
function identity(ctx: Ctx, name: string, node: J, ptr: string): string {
  if (!isObj(node)) {
    return ''
  }
  const at = ptr.indexOf('#')
  const base = ctx.bases.get(node) as string
  const own = node.has('$id') || at === ptr.length - 1 && 0 < at
  const parts: string[] = []
  if (own && undefined !== parseUri(base).scheme) {
    parts.push('id: ' + strLit(base))
  }
  const kept = 1 === parts.length ||
    0 === at && base === ctx.bases.get(ctx.root)
  for (const kw of ['anchor', 'dynamicAnchor']) {
    const anchor = node.get('$' + kw)
    if (undefined !== anchor && kept) {
      parts.push(kw + ': ' + strLit(anchor as string))
    }
  }
  const key = ctx.defKeys.get(node)
  if (undefined !== key && key !== name) {
    parts.push('key: ' + strLit(key))
  }
  return 0 === parts.length ? '' : '{ ' + parts.join(', ') + ' }'
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


// An annotation's value, written as the plain data it is.
function datum(v: J, path: string): string {
  if (Array.isArray(v)) {
    return '[' + v.map((e, n) => datum(e, ptrAt(path, n))).join(', ') + ']'
  }
  if (isObj(v)) {
    return '{' + [...v].map(([k, e]) =>
      strLit(k) + ': ' + datum(e, ptrAt(path, k))).join(', ') + '}'
  }
  return null === v || 'boolean' === typeof v ? '' + v :
    v instanceof JNum ? numberText(v.text, path) : strLit(v as string)
}


// The annotations a schema object carries, each under its rider key, its
// value checked for the JSON kind the draft gives it.
const RIDER: [string, string, string | undefined][] = [
  ['title', 'title', 'string'], ['description', 'description', 'string'],
  ['$comment', 'comment', 'string'], ['default', 'default', undefined],
  ['examples', 'examples', 'array'], ['readOnly', 'readOnly', 'boolean'],
  ['writeOnly', 'writeOnly', 'boolean'], ['format', 'format', 'string'],
  ['contentEncoding', 'contentEncoding', 'string'],
  ['contentMediaType', 'contentMediaType', 'string'],
  ['contentSchema', 'contentSchema', undefined],
]

const CONTENT = ['contentEncoding', 'contentMediaType', 'contentSchema']


function rider(o: Map<string, J>, ptr: string, content: boolean): string {
  const fields: string[] = []
  for (const [k, key, kind] of RIDER) {
    const v = o.get(k)
    if (undefined === v || content !== CONTENT.includes(k) ||
      ('contentSchema' === k && !o.has('contentMediaType'))) {
      continue
    }
    if (undefined !== kind && kind !== (Array.isArray(v) ? 'array' :
      null === v ? 'null' : typeof v)) {
      refuse(ptrAt(ptr, k), k + ' must be ' + ('array' === kind ? 'an ' : 'a ') +
        kind)
    }
    fields.push(key + ': ' + datum(v, ptrAt(ptr, k)))
  }
  const read = undefined !== deprecRecord(o)
  const x = content ? [] : [...o].filter(([k]) => !CARRIED.has(k) &&
    !ANNOTATION.has(k) && !LATER.has(k) && !(read && DEPRECATE_KEY === k))
  if (0 < x.length) {
    fields.push('x: {' + x.map(([k, v]) =>
      strLit(k) + ': ' + datum(v, ptrAt(ptr, k))).join(', ') + '}')
  }
  return 0 === fields.length ? '' : '{' + fields.join(', ') + '}'
}


export const DEPRECATE_KEY = 'x-aontu-deprecate'

// A name the draft gives a meaning, or deprecate()'s own keyword.
export function isKeyword(k: string): boolean {
  return CARRIED.has(k) || ANNOTATION.has(k) || LATER.has(k) ||
    DEPRECATE_KEY === k
}

// deprecate()'s record as the exporter writes it beside `deprecated`;
// in any other shape, or without `deprecated: true`, the keyword is
// unknown to the draft and rides `x` as any other does.
function deprecRecord(o: Map<string, J>): string | undefined {
  const r = o.get(DEPRECATE_KEY) ?? null
  if (true !== o.get('deprecated') || !isObj(r) || ![...r].every(([k, v]) =>
    ['msg', 'use', 'since'].includes(k) && 'string' === typeof v)) {
    return undefined
  }
  return '{' + [...r].map(([k, v]) => k + ': ' + strLit(v as string))
    .join(', ') + '}'
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
  const rest = restAtom(ctx, o, ptr, 'unevaluatedProperties')
  const props = schemaMap(o.get('properties'), ptrAt(ptr, 'properties'))
  const reqv = o.get('required')
  if (undefined !== reqv && (!Array.isArray(reqv) ||
    reqv.some((k) => 'string' !== typeof k) ||
    new Set(reqv).size !== reqv.length)) {
    refuse(ptrAt(ptr, 'required'), 'required must be an array of distinct strings')
  }
  const required = (reqv ?? []) as string[]
  const entries = [...props].map(([k, s]) => {
    const at = ptrAt(ptrAt(ptr, 'properties'), k)
    const own = I(ctx, s, at)
    const d = isObj(s) ? s.get('default') : undefined
    return strLit(k) + (required.includes(k) ? ': ' + own :
      '?: ' + (!ctx.defaults || undefined === d ? own : paren(own) +
        ' & (*' + datum(d, ptrAt(at, 'default')) + ' | any)'))
  })
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
  const lens = [...counts.flatMap((c, n) => undefined === c ? [] :
    ['len(' + (0 === n ? 'min' : 'max') + '(' + c + '))']), ...rest]
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
  const u = o.get('uniqueItems')
  if (undefined !== u && 'boolean' !== typeof u) {
    refuse(ptrAt(ptr, 'uniqueItems'), 'uniqueItems must be a boolean')
  }
  const atoms = [...lens, ...(true === u ? ['unique()'] : []),
    ...containsAtom(ctx, o, ptr)]
  atoms.push(...(atoms.includes('nil') ? [] :
    restAtom(ctx, o, ptr, 'unevaluatedItems')))
  if (atoms.includes('nil')) {
    return 'nil'
  }
  if (undefined === spread && 0 === atoms.length) {
    return undefined
  }
  return both([undefined === spread ? 'list' : '[&: ' + spread + ']', ...atoms])
}


// What a schema evaluates at its own instance location, the members its
// own keywords reach. An applicator in place adds what its schemas
// evaluate: always for `allOf` and a reference, and under the trial
// that decides it for the conditional ones.
type Reach = {
  keys: string[]
  all: boolean
  prefix: number
  items: Place[]
  covers: { trial: Place | string, rec: Reach, alt?: Reach }[]
  inexact: boolean
}


function reachNone(): Reach {
  return { keys: [], all: false, prefix: 0, items: [], covers: [], inexact: false }
}


function reachAdd(a: Reach, b: Reach): Reach {
  a.keys.push(...b.keys.filter((k) => !a.keys.includes(k)))
  a.all = a.all || b.all
  a.prefix = Math.max(a.prefix, b.prefix)
  a.items.push(...b.items)
  a.covers.push(...b.covers)
  a.inexact = a.inexact || b.inexact
  return a
}


function reachEmpty(r: Reach): boolean {
  return 0 === r.keys.length && !r.all && 0 === r.prefix &&
    0 === r.items.length && 0 === r.covers.length
}


function reach(ctx: Ctx, node: J, ptr: string, kw: string,
  path: Set<J>, own: boolean): Reach {
  const r = reachNone()
  if (!isObj(node) || path.has(node)) {
    return r
  }
  const o = node
  const outer = ctx.env
  ctx.env = enter(ctx, outer, node)
  path.add(node)
  try {
    const sub = (s: J, at: string) => reach(ctx, s, at, kw, path, false)
    const at = (k: string, n: string | number) => ptrAt(ptrAt(ptr, k), n)
    if ('unevaluatedProperties' === kw) {
      const props = o.get('properties') as J
      r.keys.push(...(isObj(props) ? [...props.keys()].map(strLit) : []))
      const pats = o.get('patternProperties') as J
      for (const p of isObj(pats) ? pats.keys() : []) {
        const re = pattern(ctx, p, at('patternProperties', p))
        r.inexact = r.inexact || undefined === re
        r.keys.push(...(undefined === re ? [] : [re]))
      }
      r.all = o.has('additionalProperties') ||
        (!own && o.has('unevaluatedProperties'))
    }
    else {
      const prefix = o.get('prefixItems')
      r.prefix = Array.isArray(prefix) ? prefix.length : 0
      r.all = o.has('items') || (!own && o.has('unevaluatedItems'))
      if (o.has('contains')) {
        r.items.push({ node: o.get('contains') as J, ptr: ptrAt(ptr, 'contains') })
      }
    }
    const list = (k: string) => Array.isArray(o.get(k)) ? o.get(k) as J[] : []
    list('allOf').forEach((s, n) => reachAdd(r, sub(s, at('allOf', n))))
    for (const kr of ['$ref', '$dynamicRef']) {
      if (o.has(kr)) {
        const t = target(ctx, o, kr, ptrAt(ptr, kr))
        const to = '$ref' === kr || !isObj(t.node) ||
          t.frag !== t.node.get('$dynamicAnchor') ? t :
          ctx.env.get(t.frag) ?? t
        reachAdd(r, sub(to.node, to.ptr))
      }
    }
    for (const k of ['anyOf', 'oneOf']) {
      list(k).forEach((s, n) => {
        const rec = sub(s, at(k, n))
        r.inexact = r.inexact || rec.inexact
        if (!reachEmpty(rec)) {
          r.covers.push({ trial: { node: s, ptr: at(k, n) }, rec })
        }
      })
    }
    if (o.has('if')) {
      const c = o.get('if') as J
      const then = reachAdd(sub(c, ptrAt(ptr, 'if')),
        o.has('then') ? sub(o.get('then') as J, ptrAt(ptr, 'then')) : reachNone())
      const alt = o.has('else') ? sub(o.get('else') as J, ptrAt(ptr, 'else')) :
        reachNone()
      r.inexact = r.inexact || then.inexact || alt.inexact
      if (true === c || false === c) {
        reachAdd(r, true === c ? then : alt)
      }
      else if (!reachEmpty(then) || !reachEmpty(alt)) {
        r.covers.push({ trial: { node: c, ptr: ptrAt(ptr, 'if') }, rec: then,
          alt: reachEmpty(alt) ? undefined : alt })
      }
    }
    const deps = o.get('dependentSchemas') as J
    for (const [k, s] of isObj(deps) ? deps : []) {
      const rec = sub(s, at('dependentSchemas', k))
      r.inexact = r.inexact || rec.inexact
      if (!reachEmpty(rec)) {
        r.covers.push({ trial: '{' + strLit(k) + ': any}', rec })
      }
    }
    return r
  }
  finally {
    path.delete(node)
    ctx.env = outer
  }
}


// The alias a trial reads, recorded so the check beside it reads it too.
function trialOf(ctx: Ctx, place: Place): string {
  if (!isObj(place.node)) {
    return I(ctx, place.node, place.ptr)
  }
  ctx.wanted.add(place.ptr)
  return use(ctx, place)
}


// A record, as rest() reads one, and the pairs that hold records.
function reachRecord(ctx: Ctx, r: Reach, alt?: Reach): string {
  const fields: string[] = r.all ? ['keys: any'] : [
    ...(0 === r.keys.length ? [] : ['keys: ' + r.keys.join(' | ')]),
    ...(0 === r.prefix ? [] : ['prefix: ' + r.prefix]),
    ...(0 === r.items.length ? [] :
      ['items: ' + disjoin(r.items.map((p) => trialOf(ctx, p)))]),
    ...(0 === r.covers.length ? [] :
      ['covers: [' + reachPairs(ctx, r.covers).join(', ') + ']']),
  ]
  if (undefined !== alt) {
    fields.push('else: ' + reachRecord(ctx, alt))
  }
  return '{' + fields.join(', ') + '}'
}


function reachPairs(ctx: Ctx, covers: Reach['covers']): string[] {
  return covers.map((c) => ('string' === typeof c.trial ? c.trial :
    trialOf(ctx, c.trial)) + ', ' + reachRecord(ctx, c.rec, c.alt))
}


// `unevaluatedProperties` or `unevaluatedItems` as rest(t, ...): every
// member what the schema evaluates in place does not reach must meet t.
// Where everything is reached it asks nothing, and where a pattern it
// would read is not carried it is dropped, since it would refuse the
// keys the pattern reaches.
function restAtom(ctx: Ctx, o: Map<string, J>, ptr: string, kw: string):
  string[] {
  const u = schemaOne(o.get(kw), ptrAt(ptr, kw))
  if (undefined === u || true === u) {
    return []
  }
  const r = reach(ctx, o, ptr, kw, new Set(), true)
  if (r.all) {
    return []
  }
  if (r.inexact) {
    lose(ctx, ptrAt(ptr, kw), kw, 'a pattern a schema in place beside it ' +
      'reads is not carried, so the members it evaluates are not known and ' +
      'it is DROPPED: the import admits instances the schema refuses')
    return []
  }
  const t = I(ctx, u, ptrAt(ptr, kw))
  if ('any' === t) {
    return []
  }
  const own = { ...r, covers: [] }
  return ['rest(' + [t,
    ...(reachEmpty(own) ? [] : ['any, ' + reachRecord(ctx, own)]),
    ...reachPairs(ctx, r.covers)].join(', ') + ')']
}


// minContains and maxContains count only beside contains, the lower one
// defaulting to one; a count no number meets admits no list.
function containsAtom(ctx: Ctx, o: Map<string, J>, ptr: string): string[] {
  if (!o.has('contains')) {
    return []
  }
  const c = branch(ctx, o.get('contains') as J, ptrAt(ptr, 'contains'))
  const lo = count(o.get('minContains'), ptrAt(ptr, 'minContains')) ?? '1'
  const hi = count(o.get('maxContains'), ptrAt(ptr, 'maxContains'))
  if (undefined !== hi && BigInt(hi) < BigInt(lo)) {
    return ['nil']
  }
  const n = lo === hi ? lo : [...('0' === lo ? [] : ['min(' + lo + ')']),
    ...(undefined === hi ? [] : ['max(' + hi + ')'])].join(' & ')
  return ['contains(' + c + (undefined === hi && '1' === lo ? '' :
    ', ' + (n || 'min(0)')) + ')']
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
  const content = rider(o, ptr, true)
  const branch = 0 === parts.length ? undefined : both(['empty()', ...parts])
  return '' === content ? branch :
    'meta(' + (branch ?? 'empty()') + ', ' + content + ')'
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
  const srcs = list.map((s, n) => branch(ctx, s, ptrAt(at, n)))
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
  const srcs = list.map((s, n) => branch(ctx, s, ptrAt(at, n)))
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
  return 'when(' + [branch(ctx, o.get('if') as J, ptrAt(ptr, 'if')),
    o.has('then') ? arm('then') : 'any',
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


// A branch a rest() reads is the alias it reads, so the check beside it
// and the rest share one definition and one verdict.
function branch(ctx: Ctx, node: J, ptr: string): string {
  return isObj(node) && ctx.hoist.has(ptr) ? use(ctx, { node, ptr }) :
    I(ctx, node, ptr)
}


// A schema with an identity of its own is hoisted, so that a
// declaration carries it.
function I(ctx: Ctx, node: J, ptr: string): string {
  if ('' === identity(ctx, placeName(ptr), node, ptr)) {
    return bodyOf(ctx, node, ptr)
  }
  return use(ctx, { node, ptr })
}


// A schema read in the environment its resource makes.
function bodyOf(ctx: Ctx, node: J, ptr: string): string {
  const outer = ctx.env
  ctx.env = enter(ctx, outer, node)
  try {
    return bodyIn(ctx, node, ptr)
  }
  finally {
    ctx.env = outer
  }
}


function bodyIn(ctx: Ctx, node: J, ptr: string): string {
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
    if (LATER.has(k)) {
      lose(ctx, ptrAt(ptr, k), k, 'not carried yet, so it is DROPPED and ' +
        'the import admits instances the schema refuses')
    }
  }
  const dep = o.get('deprecated')
  if (undefined !== dep && 'boolean' !== typeof dep) {
    refuse(ptrAt(ptr, 'deprecated'), 'deprecated must be a boolean')
  }
  const schema = o.get('$schema')
  if (undefined !== schema && DRAFT !== schema) {
    lose(ctx, ptrAt(ptr, '$schema'), '$schema', 'the import reads ' +
      '2020-12, so a schema for another dialect is read as 2020-12')
  }
  const parts: string[] = []
  if (o.has('$ref')) {
    parts.push(use(ctx, target(ctx, o, '$ref', ptrAt(ptr, '$ref'))))
  }
  if (o.has('$dynamicRef')) {
    parts.push(dynamicAlias(ctx, o, ptrAt(ptr, '$dynamicRef')))
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
  const rec = rider(o, ptr, false)
  const met = meetOrNil(parts)
  const src = '' === rec ? met : 'meta(' + met + ', ' + rec + ')'
  const drec = deprecRecord(o)
  return true !== dep ? src :
    'deprecate(' + src + (undefined === drec ? '' : ', ' + drec) + ')'
}


// A branch a rest() reads that its check had already written in place
// is read again by alias, so the import runs once more with it hoisted.
export function importJsonSchema(text: string,
  options?: SchemaImportOptions): SchemaImportReport {
  let hoist = new Set<string>()
  for (;;) {
    const [report, wanted] = importOnce(text, options, hoist)
    if ([...wanted].every((p) => hoist.has(p))) {
      return report
    }
    hoist = new Set([...hoist, ...wanted])
  }
}


function importOnce(text: string, options: SchemaImportOptions | undefined,
  hoist: Set<string>): [SchemaImportReport, Set<string>] {
  const ctx: Ctx = {
    root: null, defaults: true === options?.defaults, lossy: [],
    aliases: new Map(), resources: new Map(), anchors: new Map(),
    bases: new Map(), defKeys: new Map(), unread: new Map(),
    dynamics: new Map(), env: new Map(), rootEnv: new Map(), clones: 0,
    wanted: new Set(), hoist,
  }
  let source: string
  try {
    readDocuments(ctx, options?.documents ?? {})
    ctx.root = readJson(text)
    claim(ctx, '', { node: ctx.root, ptr: '#' }, '#')
    index(ctx, ctx.root, '#', '')
    ctx.env = ctx.rootEnv = enter(ctx, new Map(), ctx.root)
    if (isObj(ctx.root)) {
      for (const [k, s] of schemaMap(ctx.root.get('$defs'), '#/$defs')) {
        use(ctx, { node: s, ptr: ptrAt('#/$defs', k) })
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
    return [{
      source: '', lossy: [], verdict: 'error',
      errors: [{ code: r.code, class: codeClass(r.code), path: r.path,
        message: r.message }],
    }, new Set()]
  }

  // The import writes only source the formatter reads, so the agreed
  // form is always there to take.
  const formatted: any = format(source)
  const seen = new Set<string>()
  const lossy = ctx.lossy.filter((l) => {
    const key = l.path + '\u0000' + l.construct
    return !seen.has(key) && (seen.add(key), true)
  }).sort((a, b) => cmpCodePoint(a.path, b.path))
  return [{
    source: formatted.text,
    lossy,
    verdict: 0 < lossy.length ? 'lossy' : 'ok',
  }, ctx.wanted]
}
