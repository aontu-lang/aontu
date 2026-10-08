/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { makeNilErr } from './err'
import { sizingResidue } from './val/BagVal'
import { Decimal } from './val/Decimal'
import { exactNumberText, readExactNumber } from './val/numkind'
import type { ExactNumber } from './val/numkind'
import { cmpScaled, scaledOfShown } from './val/numcmp'
import { nofCounts } from './val/ConstraintVal'
import { recordLayers } from './rider'
import { cmpCodePoint } from './keyorder'
import { failureFinding } from './vet'
import type { VetFinding } from './vet'
import type { TrustOptions } from './type'
import { anchorAt } from './vet'


export type SchemaLoss = {
  // Where in the document, in the same `$.a.b` spelling every other
  // report uses.
  path: string
  // WHAT could not be carried: the Aontu construct's own name, so a
  // reader can grep their source for it.
  construct: string
  // One sentence: why JSON Schema cannot say it, and what the schema
  // says instead.
  reason: string
}

export type SchemaVerdict = 'ok' | 'lossy' | 'error'

export type SchemaReport = {
  verdict: SchemaVerdict
  // The JSON Schema document. Empty object on `error`.
  schema: any
  // Every construct that could not be carried, in document order.
  lossy: SchemaLoss[]
  // WHY the run could not be made, in vet's finding shape. Present only
  // on `error`, exactly as trim's is.
  errors?: VetFinding[]
}

export type SchemaOptions = {
  at?: string
  // Where the document came from, so a relative `@"file"` resolves from
  // its own directory.
  path?: string
  trust?: TrustOptions

  textExt?: string[]
}


const DRAFT = 'https://json-schema.org/draft/2020-12/schema'


function pathText(path: string[]): string {
  return '$' + (0 < path.length ? '.' + path.join('.') : '')
}


// The exporter's running state: the losses collected so far, in the
// order the walk meets them.
type Ctx = { lossy: SchemaLoss[] }


function lose(ctx: Ctx, path: string[], construct: string, reason: string) {
  ctx.lossy.push({ path: pathText(path), construct, reason })
}


const KIND_TYPE: Record<string, string> = {
  String: 'string',
  Boolean: 'boolean',
  Integer: 'integer',
  BigInteger: 'integer',
  Float: 'number',
  BigDecimal: 'number',
  Number: 'number',
  Path: 'string',
}


const COUNT_KEYS: Record<string, [string, string]> = {
  string: ['minLength', 'maxLength'],
  map: ['minProperties', 'maxProperties'],
  list: ['minItems', 'maxItems'],
}


// A path is its address string at the JSON boundary, and the schema
// cannot say which strings are addresses.
function losePath(ctx: Ctx, path: string[]) {
  lose(ctx, path, 'path',
    'a path admits only path values, but JSON Schema has no path type; ' +
    'the schema says "string" and admits any string here')
}


// A kind narrowed to one leaf of a number has no JSON Schema type, since
// JSON Schema reads a number by its value.
function loseLeafKind(ctx: Ctx, path: string[], name: string, t: string) {
  if ('BigInteger' === name || 'BigDecimal' === name) {
    loseExactKind(ctx, path, name.toLowerCase(), t)
  }
  else if ('Integer' === name) {
    lose(ctx, path, 'integer',
      'JSON Schema reads a number by its value, so its integer also admits ' +
      '1.0 and whole numbers past the integer leaf, which this kind refuses; ' +
      'number & multiple(1) is the integer it means')
  }
  else if ('Float' === name) {
    lose(ctx, path, 'float',
      'JSON Schema has no float: its number also admits the integer leaf, ' +
      'which this kind refuses')
  }
}




function loseExactKind(ctx: Ctx, path: string[], leaf: string, t: string) {
  lose(ctx, path, leaf,
    'JSON Schema has no type for one leaf of a number: the schema says "' + t +
    '", which admits the other leaves too, where this kind refuses them')
}


// An exact leaf's digits as a JSON number, written directly rather than
// through a double: JSON Schema compares numbers by their value.
function exactJson(v: any): any {
  if ('bigint' === typeof v || v instanceof Decimal) {
    return (JSON as any).rawJSON(v.toString())
  }
  if (Array.isArray(v)) {
    return v.map(exactJson)
  }
  if (null != v && 'object' === typeof v && !(JSON as any).isRawJSON(v)) {
    const out: any = {}
    for (const k of Object.keys(v)) {
      out[k] = exactJson(v[k])
    }
    return out
  }
  return v
}


function scalarJson(v: any): any {
  return exactJson(v.peg)
}


// The whole number at or above a count's bound (`up`), or at or below
// it, exactly: a count a double would round keeps its digits.
function wholeCount(v: any, up: boolean): bigint {
  const p = v.peg
  if ('bigint' === typeof p) {
    return p
  }
  if (p instanceof Decimal) {
    const w = up ? p.ceil() : p.floor()
    return w.unscaled / 10n ** BigInt(w.scale)
  }
  return BigInt(up ? Math.ceil(p) : Math.floor(p))
}


function countJson(n: bigint): any {
  return BigInt(Number.MIN_SAFE_INTEGER) <= n && n <= BigInt(Number.MAX_SAFE_INTEGER) ?
    Number(n) : (JSON as any).rawJSON(n.toString())
}


// One JSON value by its meaning: `1` and `1.0` are one number.
function valueKey(v: any): string {
  if ('number' === typeof v || (JSON as any).isRawJSON(v)) {
    const text = 'number' === typeof v ? String(v) : v.rawJSON
    return exactNumberText(readExactNumber(text) as ExactNumber) ?? text
  }
  return JSON.stringify(v)
}


// One value is carried once, however its members are spelt.
function dedupeJson(vals: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const v of vals) {
    const key = valueKey(v)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(v)
    }
  }
  return out
}


function scalarType(v: any): string {
  if (v.isBigDecimal) {
    return 'number'
  }
  if (v.isInteger || v.isBigInteger) {
    return 'integer'
  }
  const t = typeof v.peg
  return 'number' === t ? 'number' : 'boolean' === t ? 'boolean' : 'string'
}


// What JSON cannot say about a bound is reported, never approximated.
function boundOut(ctx: Ctx, path: string[], out: any, b: any, isLo: boolean) {
  const atom = isLo ? (b.open ? 'above' : 'min') : (b.open ? 'below' : 'max')
  const v = b.v
  if (!('number' === typeof v.peg || v.isBigInteger || v.isBigDecimal)) {
    lose(ctx, path, atom,
      'JSON Schema has no keyword for a bound on a string (minimum and ' +
      'maximum take numbers only), so this bound is DROPPED and the ' +
      'schema admits strings outside it')
    return
  }
  out[isLo ? (b.open ? 'exclusiveMinimum' : 'minimum') :
    (b.open ? 'exclusiveMaximum' : 'maximum')] = scalarJson(v)
}


// The whole number a count keyword takes: `above(2)` is at least 3.
function countEndpoint(b: any, isLo: boolean): bigint | undefined {
  if (null == b) {
    return undefined
  }
  return isLo ? (b.open ? wholeCount(b.v, false) + 1n : wholeCount(b.v, true)) :
    (b.open ? wholeCount(b.v, true) - 1n : wholeCount(b.v, false))
}


function fromConstraint(ctx: Ctx, path: string[], c: any, bag?: 'map' | 'list'): any {
  const out: any = {}
  // `allOf` members: a second pattern or exclusion has no keyword of its own.
  const extra: any[] = []
  const nots: any[] = []

  if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
    out.type = KIND_TYPE[c.kind.name]
    loseLeafKind(ctx, path, c.kind.name, out.type)
  }
  else if ('string' === c.domain) {
    out.type = 'string'
  }
  else if ('number' === c.domain) {
    out.type = 'number'
  }

  if (null != c.lo) {
    boundOut(ctx, path, out, c.lo, true)
  }
  if (null != c.hi) {
    boundOut(ctx, path, out, c.hi, false)
  }

  // `neq(1,2)` is "not one of these", which is exactly `not: {enum}`.
  if (0 < c.neqs.length) {
    nots.push({ enum: dedupeJson(c.neqs.map(scalarJson)) })
  }

  // A number with no leaf that is a multiple of 1 is JSON Schema's integer.
  const one = (m: any): boolean => 0 === cmpScaled(scaledOfShown(m), { unscaled: 1n, scale: 0 })
  let mults: any[] = c.mults
  if (null == c.kind && 'number' === out.type && mults.some(one)) {
    out.type = 'integer'
    mults = mults.filter((m: any) => !one(m))
  }
  const divisors = mults.map(scalarJson)
  if (1 === divisors.length) {
    out.multipleOf = divisors[0]
  }
  else {
    extra.push(...divisors.map((n: any) => ({ multipleOf: n })))
  }

  // The normalised form, valid in ECMA-262 and meaning what aontu means.
  if (1 === c.res.length) {
    out.pattern = c.res[0].norm
  }
  else if (1 < c.res.length) {
    extra.push(...c.res.map((r: any) => ({ pattern: r.norm })))
  }

  if (null != c.count) {
    const domain = 'string' === c.domain || 'string' === out.type ? 'string' : bag
    const [lokey, hikey] = COUNT_KEYS[domain ?? 'list']
    const lo = countEndpoint(c.count.lo, true)
    const hi = countEndpoint(c.count.hi, false)
    // A whole-number count's zero lower bound says nothing.
    if (null != lo && 0n < lo) {
      out[lokey] = countJson(lo)
    }
    if (null != hi) {
      out[hikey] = countJson(hi)
    }
    // An excluded length is exactly `not` both bounds at it.
    for (const n of c.count.neqs) {
      const k = wholeCount(n, true)
      if (k === wholeCount(n, false)) {
        nots.push({ [lokey]: countJson(k), [hikey]: countJson(k) })
      }
    }
    if (undefined === domain) {
      lose(ctx, path, 'len',
        'a count with no domain is exported as minItems/maxItems; ' +
        'JSON Schema has no keyword that counts a string OR a container')
    }
    if (0 < (c.count.mults ?? []).length) {
      lose(ctx, path, 'len',
        'JSON Schema has no keyword for a divisor of a count, so it is ' +
        'DROPPED and the schema admits lengths the model refuses')
    }
  }

  for (const n of c.nofs) {
    const branches = (): any[] => n.cs.map((b: any) =>
      true === b.isNil ? false : fromVal(ctx, path, b))
    const counts: boolean[] = nofCounts(n)
    const only = (...at: number[]): boolean =>
      counts.every((ok: boolean, i: number) => ok === at.includes(i))
    const k = n.cs.length
    const all = counts.map((_ok: boolean, i: number) => i)
    if (only(...all)) {
      continue
    }
    if (only(...all.slice(1))) {
      keyword(out, extra, 'anyOf', branches())
    }
    else if (only(1)) {
      keyword(out, extra, 'oneOf', branches())
    }
    else if (only(0)) {
      nots.push(1 === k ? branches()[0] : { anyOf: branches() })
    }
    else if (only(k)) {
      extra.push(...branches())
    }
    else if (only()) {
      extra.push(false)
    }
    else {
      lose(ctx, path, 'nof',
        'JSON Schema counts its branches only as anyOf, oneOf, allOf and not, ' +
        'so this count is DROPPED and the schema admits values the model refuses')
    }
  }

  for (const w of c.whens) {
    whenOut(ctx, path, out, extra, w)
  }

  for (const k of c.contains) {
    containsOut(ctx, path, out, extra, k, bag)
  }

  for (const m of c.musts) {
    extra.push(fromVal(ctx, path, m.v))
  }

  if (1 === nots.length) {
    out.not = nots[0]
  }
  else if (1 < nots.length) {
    extra.push(...nots.map((n: any) => ({ not: n })))
  }
  if (0 < extra.length) {
    out.allOf = extra
  }

  if (true === c.nonEmpty && true !== c.emptyOk && !(1 <= out.minLength)) {
    out.minLength = 1
  }
  if (true === c.pathKind) {
    losePath(ctx, path)
  }

  if (c.uniq) {
    out.uniqueItems = true
  }

  for (const key of c.uniqBy) {
    lose(ctx, path, 'unique(' + key + ')',
      'JSON Schema has no uniqueness-by-property keyword; uniqueItems ' +
      'compares whole items, so this constraint is DROPPED and the ' +
      'schema admits records sharing a `' + key + '`')
  }

  if (0 < c.musts.length) {
    lose(ctx, path, 'must',
      'JSON Schema has no keyword for a check\'s message, so the check ' +
      'crosses as allOf of its trial schema and its message is DROPPED')
  }

  return out
}


// A keyword this schema object has once; a second goes under allOf.
// A member count is contains, with its endpoints as minContains and
// maxContains; JSON Schema counts an array's items only.
function containsOut(ctx: Ctx, path: string[], out: any, extra: any[], k: any,
  bag?: 'map' | 'list'): void {
  if ('map' === bag) {
    lose(ctx, path, 'contains',
      'JSON Schema counts only the items of an array, so a count of a ' +
      'map\'s members is DROPPED and the schema admits maps the model refuses')
    return
  }
  if (undefined === bag) {
    lose(ctx, path, 'contains',
      'JSON Schema applies contains to an array only and passes any other ' +
      'value, where the model refuses a scalar and counts a map\'s members')
  }
  if (0 < k.count.neqs.length + k.count.mults.length) {
    lose(ctx, path, 'contains',
      'JSON Schema bounds a count of matching items only above and below, ' +
      'so an excluded count or a divisor is DROPPED')
  }
  const part: any = { contains: true === k.c.isNil ? false : fromVal(ctx, path, k.c) }
  const lo = countEndpoint(k.count.lo, true)
  const hi = countEndpoint(k.count.hi, false)
  if (1n !== lo) {
    part.minContains = countJson(lo as bigint)
  }
  if (undefined !== hi) {
    part.maxContains = countJson(hi)
  }
  if (undefined === out.contains) {
    Object.assign(out, part)
  }
  else {
    extra.push(part)
  }
}


// A conditional on one key's presence is a dependent keyword, and one
// whose branch only asks for keys is dependentRequired.
function whenOut(ctx: Ctx, path: string[], out: any, extra: any[], w: any): void {
  const arm = (b: any): any => true === b.isNil ? false : fromVal(ctx, path, b)
  const key = presentKeys(w.c)
  if (undefined !== key && 1 === key.length && undefined === w.e) {
    const names = presentKeys(w.t)
    const [dep, val] = undefined === names ? ['dependentSchemas', arm(w.t)] :
      ['dependentRequired', names]
    if (undefined === out[dep]?.[key[0]]) {
      out[dep] = { ...out[dep], [key[0]]: val }
    }
    else {
      extra.push({ [dep]: { [key[0]]: val } })
    }
    return
  }
  if (true === w.t.isTop && undefined === w.e) {
    return
  }
  const cond: any = { if: arm(w.c) }
  if (true !== w.t.isTop) {
    cond.then = arm(w.t)
  }
  if (undefined !== w.e) {
    cond.else = arm(w.e)
  }
  if (undefined === out.if) {
    Object.assign(out, cond)
  }
  else {
    extra.push(cond)
  }
}


// The keys of a map that holds each of them as `any`, and nothing else.
function presentKeys(v: any): string[] | undefined {
  if (true !== v.isMap || null != v.spread?.cj || true === v.closed) {
    return undefined
  }
  const keys = Object.keys(v.peg).sort(cmpCodePoint)
  return 0 < keys.length && keys.every((k) => true === v.peg[k]?.isTop &&
    !v.optionalKeys.includes(k)) ? keys : undefined
}


function keyword(out: any, extra: any[], key: string, val: any): void {
  if (undefined === out[key]) {
    out[key] = val
  }
  else {
    extra.push({ [key]: val })
  }
}


function fromVal(ctx: Ctx, path: string[], v: any): any {
  const out = fromValInner(ctx, path, v)
  return null == out || 'object' !== typeof out ||
    (null == v?.deprecation && null == v?.meta) ? out : annotate(ctx, path, out, v)
}


const DEPRECATION_TEXT = ['msg', 'use', 'since']

const META_KEYWORD: Record<string, string> = {
  title: 'title', description: 'description', comment: '$comment', default: 'default',
  examples: 'examples', readOnly: 'readOnly', writeOnly: 'writeOnly', format: 'format',
  contentEncoding: 'contentEncoding', contentMediaType: 'contentMediaType',
  contentSchema: 'contentSchema',
}

// The JSON Schema keywords: one held under `x` would assert where the
// record only annotates, so it is not written.
const KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$anchor', '$dynamicRef', '$dynamicAnchor', '$vocabulary',
  '$comment', '$defs', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
  'dependentSchemas', 'prefixItems', 'items', 'contains', 'properties',
  'patternProperties', 'additionalProperties', 'propertyNames', 'unevaluatedItems',
  'unevaluatedProperties', 'type', 'enum', 'const', 'multipleOf', 'maximum',
  'exclusiveMaximum', 'minimum', 'exclusiveMinimum', 'maxLength', 'minLength',
  'pattern', 'maxItems', 'minItems', 'uniqueItems', 'maxContains', 'minContains',
  'maxProperties', 'minProperties', 'required', 'dependentRequired', 'title',
  'description', 'default', 'deprecated', 'readOnly', 'writeOnly', 'examples',
  'format', 'contentEncoding', 'contentMediaType', 'contentSchema',
])


// A value's riders as annotations: the first record inline and any other
// in an allOf of annotation-only subschemas, and a deprecation record as
// `deprecated`, its fields under x-aontu-deprecate.
function annotate(ctx: Ctx, path: string[], out: any, v: any): any {
  const res: any = { ...out }
  const dep = v.deprecation
  if (null != dep) {
    res.deprecated = true
    const rec: any = {}
    for (const k of DEPRECATION_TEXT.filter((k) => undefined !== dep[k])) {
      rec[k] = 1 === dep[k].length ? dep[k][0] : dep[k]
    }
    if (0 < Object.keys(rec).length) {
      res['x-aontu-deprecate'] = rec
    }
  }
  const extra: any[] = []
  for (const layer of null == v.meta ? [] : recordLayers(v.meta)) {
    const part: any = {}
    for (const [k, val] of Object.entries(layer)) {
      const json = generated(val)
      if ('x' !== k) {
        part[META_KEYWORD[k]] = json
        continue
      }
      for (const xk of Object.keys(json).sort(cmpCodePoint)) {
        const xv = json[xk]
        if (KEYWORDS.has(xk)) {
          lose(ctx, path, 'meta',
            'the unknown keyword ' + xk + ' is a JSON Schema keyword, which ' +
            'would assert where the record only annotates, so it is DROPPED')
        }
        else {
          part[xk] = xv
        }
      }
    }
    if (0 === extra.length && Object.keys(part).every((k) => undefined === res[k])) {
      Object.assign(res, part)
    }
    else if (0 < Object.keys(part).length) {
      extra.push(part)
    }
  }
  if (0 < extra.length) {
    res.allOf = [...(res.allOf ?? []), ...extra]
  }
  return res
}


// The schema of a literal's kind: what a bare `*x` admits beside x.
function kindOfLiteral(ctx: Ctx, path: string[], v: any): any {
  const t = scalarType(v)
  loseLeafKind(ctx, path, v.isBigDecimal ? 'BigDecimal' : v.isBigInteger ? 'BigInteger' :
    v.isInteger ? 'Integer' : 'number' === typeof v.peg ? 'Float' : '', t)
  return 'string' === t ? { type: t, minLength: 1 } : { type: t }
}


function fromValInner(ctx: Ctx, path: string[], v: any): any {
  if (true === v.isPref) {
    // A bare `*x` admits every value of x's kind and prefers x (ADR-004),
    // so `const: x` would refuse what the model admits.
    if (true === v.peg?.isScalar) {
      return { ...kindOfLiteral(ctx, path, v.peg), default: scalarJson(v.peg) }
    }
    const inner = fromVal(ctx, path, v.peg)
    const gen = generated(v.peg)
    return undefined === gen ? inner : { ...inner, default: gen }
  }

  if (true === v.isDisjunct && Array.isArray(v.peg)) {
    return fromDisjunct(ctx, path, v)
  }

  if (true === v.isConstraint) {
    // Arguments the constructor refused (`neq(1, "a")` spans domains)
    // leave a constraint that refuses every peer: it admits nothing.
    return null != v.invalid ? false : fromConstraint(ctx, path, v)
  }

  const residue = sizingResidue(v)
  if (undefined !== residue) {
    return {
      ...fromVal(ctx, path, residue.bag),
      ...fromConstraint(ctx, path, residue.con,
        true === residue.bag.isMap ? 'map' : 'list'),
    }
  }

  // The member a second map literal expects reads through to its constraint.
  if (true === v.isExpect) {
    return fromVal(ctx, path, v.peg)
  }

  if (true === v.isMap) {
    return fromMap(ctx, path, v)
  }

  if (true === v.isList) {
    return fromList(ctx, path, v)
  }

  if (true === v.isMapKind) {
    return { type: 'object' }
  }

  if (true === v.isListKind) {
    return { type: 'array' }
  }

  if (true === v.isScalarKind) {
    const t = KIND_TYPE[v.peg?.name]
    loseLeafKind(ctx, path, v.peg?.name, t)
    if ('Path' === v.peg?.name) {
      losePath(ctx, path)
    }
    // `string` refuses "", and `string & empty()` does not.
    return String === v.peg && true !== v.emptyOk ?
      { type: t, minLength: 1 } : { type: t }
  }

  if (true === v.isNull) {
    return { type: 'null' }
  }

  if (true === v.isTop) {
    return {}
  }

  // `empty()` admits exactly the strings, "" included.
  if (true === v.isEmptyConstraint) {
    return { type: 'string' }
  }

  if (true === v.isScalar) {
    return { const: scalarJson(v), type: scalarType(v) }
  }

  // A written `nil` is bottom and admits nothing; a minted one is a refusal nobody collected.
  if (true === v.isNil && 'literal_nil' === v.why) {
    return false
  }

  lose(ctx, path, residueName(v),
    'this is not a value yet, so there is nothing to constrain a ' +
    'consumer to; the schema admits anything here')
  return {}
}


function residueName(v: any): string {
  return true === v.isNil ? 'nil' :
    true === v.isRef ? 'reference' :
      true === v.isFunc ? v.funcname() :
        'unresolved'
}


// The generated JSON of a value, or undefined where it does not
// generate. Used for `default` and for `enum` members: both are VALUES
// in the schema, so a member that is itself a shape has none to give.
function generated(v: any): any {
  const a0 = new Aontu()
  const ctx = a0.ctx({ collect: true })
  const out = v.gen(ctx)
  return 0 === ctx.err.length ? exactJson(out) : undefined
}


// Bare kinds fold to a `type` array; anything more keeps the `anyOf`.
function typeFold(members: any[]): any {
  const types = members.map((m: any) =>
    1 === Object.keys(m).length && 'string' === typeof m.type ?
      m.type : undefined)
  return types.every((t: any) => undefined !== t) ?
    { type: types } : { anyOf: members }
}


function fromDisjunct(ctx: Ctx, path: string[], v: any): any {
  const members: any[] = v.peg
  let def: any = undefined

  for (const m of members) {
    if (true === m?.isPref && undefined === def) {
      def = generated(m.peg)
    }
  }

  const bare = members.map((m: any) => true === m?.isPref ? m.peg : m)
  const consts = bare.map((m: any) =>
    true === m?.isScalar && true !== m?.isNil ? scalarJson(m) : undefined)

  const out: any = consts.every((c: any) => undefined !== c) ?
    { enum: dedupeJson(consts) } :
    typeFold(bare.map((m: any) => fromVal(ctx, path, m)))

  return undefined === def ? out : { ...out, default: def }
}


function skipMarked(ctx: Ctx, path: string[], bag: any, child: any): boolean {
  // A mark the container carries too is read through (an export
  // anchored inside it); one of the child's own is not.
  if (true === child?.mark?.hide && true !== bag.mark?.hide) {
    lose(ctx, path, 'hide',
      'a hidden entry is not generated, so it is omitted from the ' +
      'schema; a consumer is neither asked for it nor allowed to know ' +
      'about it')
    return true
  }
  if (true === child?.mark?.type && true !== bag.mark?.type) {
    lose(ctx, path, 'type',
      'a type() entry is a definition and is not generated, so it is ' +
      'omitted from the schema')
    return true
  }
  return false
}


function fromMap(ctx: Ctx, path: string[], v: any): any {
  const props: Record<string, any> = {}
  const required: string[] = []
  const optional: string[] = v.optionalKeys
  let spread: any = undefined

  for (const key of Object.keys(v.peg).sort(cmpCodePoint)) {
    const child: any = v.peg[key]

    if (v.aliasKeys.includes(key)) {
      continue
    }

    // A marked child does not generate, so it is not part of the value
    // a consumer produces -- and a schema that demanded it would refuse
    // every correct document. Inside a marked container (an export
    // anchored in a `type()` block) the marks are the container's own.
    if (skipMarked(ctx, [...path, key], v, child)) {
      continue
    }

    props[key] = fromVal(ctx, [...path, key], child)
    if (!optional.includes(key)) {
      required.push(key)
    }
  }

  const spr: any = v.spread?.cj
  if (null != spr) {
    spread = fromVal(ctx, [...path, '&'], spr)
  }

  const out: any = { type: 'object', properties: props }
  if (0 < required.length) {
    out.required = required
  }

  // CLOSEDNESS IS THE ONE THING JSON SCHEMA SAYS EXACTLY AS AONTU DOES.
  // A closed map is `additionalProperties: false`; an open one leaves
  // the keyword off, since JSON Schema's default is already open.
  if (true === v.closed) {
    out.additionalProperties = false
  }
  else if (null != spread) {
    out.additionalProperties = spread
  }

  return out
}


function fromList(ctx: Ctx, path: string[], v: any): any {
  const els: any[] = v.peg.filter((el: any, i: number) =>
    !skipMarked(ctx, [...path, String(i)], v, el))
  const spr: any = v.spread?.cj

  const out: any = { type: 'array' }
  if (0 < els.length) {
    out.prefixItems = els.map((el: any) =>
      fromVal(ctx, [...path, String(v.peg.indexOf(el))], el))
    out.minItems = els.length
  }

  // An open list admits anything after its positions, as the meet does.
  if (null != spr) {
    out.items = fromVal(ctx, [...path, '&'], spr)
  }
  else if (true === v.closed) {
    out.items = false
  }
  return out
}


// The verb. Evaluate, anchor, walk, report.
export function jsonSchema(src: string, options?: SchemaOptions): SchemaReport {
  const opts = options ?? {}
  const aontu = new Aontu(includeOpts(opts))

  const actx = aontu.ctx({ collect: true })
  const root: any = aontu.unify(src, { path: opts.path, collect: true }, actx)

  // A nil root always arrives with its reason collected beside it, which
  // is failureFinding's stated precondition (ts/src/vet.ts: "ctx.err is
  // never empty at a call site").
  if (0 < actx.err.length || true === root?.isNil) {
    return {
      verdict: 'error', schema: {}, lossy: [],
      errors: [failureFinding(actx, opts.path, root)],
    }
  }

  let node: any = root
  const anchor: string[] = []
  if (null != opts.at && '' !== opts.at) {
    const found: any = anchorAt(root, opts.at)
    if (null == found) {
      // The anchor names nothing. Reported as a `no_path` nil through
      // the same finding shape every other refusal here uses, so a
      // caller reads one error format rather than two.
      const nil: any = makeNilErr(actx, 'no_path', root, undefined, 'at')
      actx.err.push(nil)
      return {
        verdict: 'error', schema: {}, lossy: [],
        errors: [failureFinding(actx, opts.path, root)],
      }
    }
    node = found
    anchor.push(...opts.at.replace(/^\$/, '').split('.').filter((p) => '' !== p))
  }

  const ctx: Ctx = { lossy: [] }
  const body = fromVal(ctx, anchor, node)

  // A root admitting nothing cannot carry `$schema` as `false`; `not: {}` can.
  const schema: any = { $schema: DRAFT }
  if ('object' === typeof body) {
    Object.assign(schema, body)
  }
  else {
    schema.not = {}
  }

  return {
    verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
    schema,
    lossy: ctx.lossy,
  }
}
