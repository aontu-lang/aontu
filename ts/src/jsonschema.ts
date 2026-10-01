/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { makeNilErr } from './err'
import { sizingResidue } from './val/BagVal'
import { Decimal } from './val/Decimal'
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


function loseExactKind(ctx: Ctx, path: string[], leaf: string, t: string) {
  lose(ctx, path, leaf,
    'JSON has one number type and it is binary64, so the EXACTNESS ' +
    'this leaf exists for cannot be carried; the schema says ' +
    '"' + t + '" and a consumer may round')
}


function scalarJson(v: any): any {
  if (v.isBigInteger) {
    return Number(v.peg)
  }
  if (v.isBigDecimal) {
    return Number(v.peg.toString())
  }
  return v.peg
}


function constJson(ctx: Ctx, path: string[], v: any): any {
  if (v.isBigInteger || v.isBigDecimal) {
    const n = scalarJson(v)
    if (!Number.isFinite(n)) {
      lose(ctx, path, 'exact literal',
        'this exact value lies beyond binary64, and JSON has no number ' +
        'for it, so the schema cannot carry it')
      return undefined
    }
    lose(ctx, path, 'exact literal',
      'JSON has one number type and it is binary64, so this exact ' +
      'value is emitted as the nearest JSON number')
  }
  return scalarJson(v)
}


// m / 2^e is m * 5^e / 10^e, and doubling a double never rounds.
function decimalOfDouble(f: number): Decimal {
  let m = Math.abs(f)
  let e = 0
  while (!Number.isInteger(m)) {
    m *= 2
    e++
  }
  const unscaled = BigInt(m) * (5n ** BigInt(e))
  return new Decimal(f < 0 ? -unscaled : unscaled, e)
}


// The nearest double, whether it is exact, and undefined when none is finite.
function endpointJson(v: any): [number | undefined, boolean] {
  if (v.isBigInteger) {
    const f = Number(v.peg)
    return Number.isFinite(f) ? [f, BigInt(f) === v.peg] : [undefined, false]
  }
  if (v.isBigDecimal) {
    const f = Number(v.peg.toString())
    return Number.isFinite(f) ?
      [f, decimalOfDouble(f).equals(v.peg)] : [undefined, false]
  }
  return [v.peg, true]
}


// `1` and `1.0` are one JSON number, so an enum carries it once.
function dedupeJson(vals: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const v of vals) {
    const key = JSON.stringify(v)
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
  const [n, exact] = endpointJson(v)
  if (undefined === n) {
    lose(ctx, path, atom,
      'this exact endpoint lies beyond binary64, and JSON has no number ' +
      'for it, so the bound is OMITTED and the schema admits values the ' +
      'model refuses')
    return
  }
  if (!exact) {
    lose(ctx, path, atom,
      'JSON has one number type and it is binary64, which cannot hold ' +
      'this exact endpoint; the schema carries the nearest number, so ' +
      'the boundary it draws is not the model\'s')
  }
  out[isLo ? (b.open ? 'exclusiveMinimum' : 'minimum') :
    (b.open ? 'exclusiveMaximum' : 'maximum')] = n
}


// The whole number a count keyword takes: `above(2)` is at least 3.
function countEndpoint(b: any, isLo: boolean): number | undefined {
  if (null == b) {
    return undefined
  }
  const n = scalarJson(b.v)
  return isLo ? (b.open ? Math.floor(n) + 1 : Math.ceil(n)) :
    (b.open ? Math.ceil(n) - 1 : Math.floor(n))
}


function fromConstraint(ctx: Ctx, path: string[], c: any, bag?: 'map' | 'list'): any {
  const out: any = {}
  // `allOf` members: a second pattern or exclusion has no keyword of its own.
  const extra: any[] = []
  const nots: any[] = []

  if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
    out.type = KIND_TYPE[c.kind.name]
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
    if (null != lo && 0 < lo) {
      out[lokey] = lo
    }
    if (null != hi) {
      out[hikey] = hi
    }
    // An excluded length is exactly `not` both bounds at it.
    for (const n of c.count.neqs) {
      const k = scalarJson(n)
      if (Number.isInteger(k)) {
        nots.push({ [lokey]: k, [hikey]: k })
      }
    }
    if (undefined === domain) {
      lose(ctx, path, 'len',
        'a count with no domain is exported as minItems/maxItems; ' +
        'JSON Schema has no keyword that counts a string OR a container')
    }
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
      'an evaluate-only check is opaque by construction -- it carries ' +
      'the author\'s own message and the algebra never reasons about ' +
      'it -- so it is DROPPED and the schema admits values `vet` refuses')
  }

  return out
}


function fromVal(ctx: Ctx, path: string[], v: any): any {
  const out = fromValInner(ctx, path, v)

  const dep = v?.deprecation
  if (null != dep && null != out && 'object' === typeof out) {
    const said = DEPRECATION_TEXT.filter((k) => null != dep[k])
    if (0 < said.length) {
      lose(ctx, path, 'deprecate',
        'JSON Schema 2020-12 has the `deprecated` flag and no field for ' +
        'what it SAYS, so ' + said.join('/') + ' cannot cross; the ' +
        'schema marks the property deprecated and a consumer must read ' +
        'the model for the reason')
    }
    return { ...out, deprecated: true }
  }

  return out
}


const DEPRECATION_TEXT = ['msg', 'use', 'since']


// The schema of a literal's kind: what a bare `*x` admits beside x.
function kindOfLiteral(ctx: Ctx, path: string[], v: any): any {
  const t = scalarType(v)
  if (v.isBigInteger || v.isBigDecimal) {
    loseExactKind(ctx, path, v.isBigInteger ? 'biginteger' : 'bigdecimal', t)
  }
  return 'string' === t ? { type: t, minLength: 1 } : { type: t }
}


function fromValInner(ctx: Ctx, path: string[], v: any): any {
  if (true === v.isPref) {
    // A bare `*x` admits every value of x's kind and prefers x (ADR-004),
    // so `const: x` would refuse what the model admits.
    if (true === v.peg?.isScalar) {
      const kind = kindOfLiteral(ctx, path, v.peg)
      const d = constJson(ctx, path, v.peg)
      return undefined === d ? kind : { ...kind, default: d }
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
    if ('BigInteger' === v.peg?.name || 'BigDecimal' === v.peg?.name) {
      loseExactKind(ctx, path, v.peg.name.toLowerCase(), t)
    }
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
    const c = constJson(ctx, path, v)
    const t = scalarType(v)
    return undefined === c ? { type: t } : { const: c, type: t }
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
  return 0 === ctx.err.length ? out : undefined
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

  // A member no finite double holds is reported and left out.
  const out: any = consts.every((c: any) => undefined !== c) ?
    { enum: dedupeJson(bare.map((m: any) => constJson(ctx, path, m))
      .filter((c: any) => undefined !== c)) } :
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

  for (const key of Object.keys(v.peg).sort()) {
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
