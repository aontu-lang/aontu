/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { makeNilErr } from './err'
import { sizingResidue } from './val/BagVal'
import { Decimal } from './val/Decimal'
import {
  cmpNumeric,
  scaledFloor,
  scaledIsIntegral,
  scaledOfNumeric,
} from './val/numcmp'
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

const RAW: { rawJSON(text: string): any } = JSON as any


function pathText(path: string[]): string {
  return '$' + (0 < path.length ? '.' + path.join('.') : '')
}


type Ctx = { lossy: SchemaLoss[], failed?: any }


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


// The numeric leaves, and the ones `vet` reads JSON data as: a spelling
// with a point is a float, one without is an integer, and nothing is
// read as an exact leaf.
type Leaf = 'integer' | 'float' | 'exact'

const BOTH: Leaf[] = ['integer', 'float']

const KIND_LEAVES: Record<string, Leaf[]> = {
  Integer: ['integer'],
  Float: ['float'],
  BigInteger: [],
  BigDecimal: [],
  Number: BOTH,
}

const KIND_LOSS: Record<string, string> = {
  Integer: 'the schema says "integer" and admits a JSON spelling such as ' +
    '1.0, which vet reads as a float and the integer leaf refuses',
  Float: 'the schema says "number" and admits a JSON spelling such as 1, ' +
    'which vet reads as an integer and the float leaf refuses',
  BigInteger: 'the schema says "integer" and admits every JSON integer, ' +
    'which vet reads as an integer or a float, never as the biginteger leaf',
  BigDecimal: 'the schema says "number" and admits every JSON number, ' +
    'which vet reads as an integer or a float, never as the bigdecimal leaf',
}

const LITERAL_LOSS: Record<Leaf, string> = {
  integer: 'the schema admits the float spelling of this value, which vet ' +
    'reads as a float and the integer leaf refuses',
  float: 'the schema admits the integer spelling of this value, which vet ' +
    'reads as an integer and the float leaf refuses',
  exact: 'the schema admits this value in every JSON spelling, which vet ' +
    'reads as an integer or a float, never as the exact leaf; the digits ' +
    'are written exactly',
}


function leafOf(v: any): Leaf | undefined {
  return true === v.isInteger ? 'integer' :
    true === v.isNumber ? 'float' :
      true === v.isBigInteger || true === v.isBigDecimal ? 'exact' : undefined
}


function readings(v: any): Leaf[] {
  return scaledIsIntegral(scaledOfNumeric(v)) ? BOTH : ['float']
}


function jsonOf(v: any): any {
  return true === v.isBigInteger || true === v.isBigDecimal ?
    RAW.rawJSON(v.peg.toString()) : v.peg
}


function sameJSON(a: any, b: any): boolean {
  return undefined !== leafOf(a) && undefined !== leafOf(b) ?
    0 === cmpNumeric(a, b) :
    a.peg === b.peg && typeof a.peg === typeof b.peg
}


type Group = { v: any, leaves: Leaf[] }

// One entry per JSON value, in written order, with every leaf the value
// is written in.
function groups(members: any[]): Group[] {
  const out: Group[] = []
  for (const m of members) {
    let g = out.find((x) => sameJSON(x.v, m))
    if (undefined === g) {
      g = { v: m, leaves: [] }
      out.push(g)
    }
    const leaf = leafOf(m)
    if (undefined !== leaf && !g.leaves.includes(leaf)) {
      g.leaves.push(leaf)
    }
  }
  return out
}


// The first number with an admitted JSON spelling no member is written
// in: there the schema and the model disagree.
function lone(gs: Group[], admitted: Leaf[]): any {
  return gs.find((g) => undefined !== leafOf(g.v) && readings(g.v)
    .some((r) => admitted.includes(r) && !g.leaves.includes(r)))?.v
}


function loseLiterals(ctx: Ctx, path: string[], gs: Group[]) {
  const v = lone(gs, BOTH)
  if (undefined !== v) {
    const leaf = leafOf(v) as Leaf
    lose(ctx, path, leaf + ' literal', LITERAL_LOSS[leaf])
  }
}


function loseKind(ctx: Ctx, path: string[], kind: any) {
  const reason = KIND_LOSS[kind?.name]
  if (undefined !== reason) {
    lose(ctx, path, kind.name.toLowerCase(), reason)
  }
}


// A path is its address string at the JSON boundary, and the schema
// cannot say which strings are addresses.
function losePath(ctx: Ctx, path: string[]) {
  lose(ctx, path, 'path',
    'a path admits only path values, but JSON Schema has no path type; ' +
    'the schema says "string" and admits any string here')
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


function allOf(out: any, part: any) {
  out.allOf = [...(out.allOf ?? []), part]
}


function bound(ctx: Ctx, path: string[], out: any, b: any,
  key: string, openKey: string, atom: string, openAtom: string) {
  if (null == b) {
    return
  }
  if (true === b.v.isString) {
    lose(ctx, path, b.open ? openAtom : atom,
      'JSON Schema has no ordering keyword for strings, so this bound is ' +
      'DROPPED and the schema admits strings outside it')
    return
  }
  out[b.open ? openKey : key] = jsonOf(b.v)
}


const COUNT_KEYS: Record<string, [string, string]> = {
  string: ['minLength', 'maxLength'],
  map: ['minProperties', 'maxProperties'],
  list: ['minItems', 'maxItems'],
}


// The integer a count bound admits at its edge: counts are whole, so an
// open or fractional bound moves to the nearest whole count inside it.
function countEdge(b: any, upper: boolean): number {
  const s = scaledOfNumeric(b.v)
  const whole = scaledIsIntegral(s)
  const floor = scaledFloor(s)
  return Number(upper ? (b.open && whole ? floor - 1n : floor) :
    (b.open || !whole ? floor + 1n : floor))
}


function count(ctx: Ctx, path: string[], out: any, n: any, kind?: string) {
  const [lo, hi] = COUNT_KEYS[kind ?? 'list']
  out[lo] = countEdge(n.lo, false)
  if (null != n.hi) {
    out[hi] = countEdge(n.hi, true)
  }
  // A count is an integer leaf, so only an integer exclusion meets one.
  for (const x of n.neqs) {
    if (true === x.isInteger) {
      allOf(out, { not: { [lo]: x.peg, [hi]: x.peg } })
    }
  }
  if (undefined === kind) {
    lose(ctx, path, 'len',
      'a count with no domain is exported as minItems/maxItems; ' +
      'JSON Schema has no keyword that counts a string OR a container')
  }
}


function elementLeaves(e: any): Leaf[] | undefined {
  if (true === e.isScalar) {
    const leaf = leafOf(e)
    return undefined === leaf ? [] : [leaf]
  }
  if (true === e.isScalarKind) {
    return KIND_LEAVES[e.peg?.name] ?? []
  }
  if (true === e.isConstraint && null == e.count) {
    return KIND_LEAVES[e.kind?.name] ?? ('string' === e.domain ? [] : BOTH)
  }
  if (true === e.isEmptyConstraint) {
    return []
  }
  if (true === e.isDisjunct && Array.isArray(e.peg)) {
    const all: (Leaf[] | undefined)[] = e.peg.map(elementLeaves)
    return all.includes(undefined) ? undefined :
      [...new Set((all as Leaf[][]).flat())]
  }
  return undefined
}


// unique() tells an integer from a float of the same value and
// uniqueItems does not, so they agree only on a list that cannot hold
// both.
function uniqueExact(bag: any): boolean {
  if (true !== bag?.isList) {
    return false
  }
  const spr = bag.spread?.cj
  if (null == spr && true !== bag.closed) {
    return false
  }
  const leaves = new Set<Leaf>()
  for (const e of null == spr ? bag.peg : [spr, ...bag.peg]) {
    const ls = elementLeaves(e)
    if (undefined === ls) {
      return false
    }
    ls.forEach((l) => leaves.add(l))
  }
  return leaves.size <= 1
}


function fromConstraint(ctx: Ctx, path: string[], c: any, bag?: any): any {
  const out: any = {}

  if (null != c.invalid) {
    ctx.failed = ctx.failed ?? c
    return out
  }

  if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
    out.type = KIND_TYPE[c.kind.name]
    loseKind(ctx, path, c.kind)
  }
  else if ('string' === c.domain) {
    out.type = 'string'
  }
  else if ('number' === c.domain) {
    out.type = 'number'
  }

  bound(ctx, path, out, c.lo, 'minimum', 'exclusiveMinimum', 'min', 'above')
  bound(ctx, path, out, c.hi, 'maximum', 'exclusiveMaximum', 'max', 'below')

  if (0 < c.neqs.length) {
    const gs = groups(c.neqs)
    out.not = { enum: gs.map((g) => jsonOf(g.v)) }
    if (undefined !== lone(gs, KIND_LEAVES[c.kind?.name] ?? BOTH)) {
      lose(ctx, path, 'neq',
        'the schema refuses every JSON spelling of an excluded number, and ' +
        'neq excludes only the leaves it names, so the model admits a ' +
        'spelling the schema refuses')
    }
  }

  for (const r of c.res) {
    if (1 === c.res.length) {
      out.pattern = r.norm
    }
    else {
      allOf(out, { pattern: r.norm })
    }
  }

  if (null != c.count) {
    count(ctx, path, out, c.count,
      'string' === c.domain ? 'string' :
        true === bag?.isMap ? 'map' : true === bag?.isList ? 'list' : undefined)
  }

  if (true === c.nonEmpty && true !== c.emptyOk && !(1 <= out.minLength)) {
    out.minLength = 1
  }
  if (true === c.pathKind) {
    losePath(ctx, path)
  }

  if (c.uniq) {
    out.uniqueItems = true
    if (!uniqueExact(bag)) {
      lose(ctx, path, 'unique',
        'uniqueItems compares numbers by value, so the schema refuses a list ' +
        'such as [1, 1.0], which unique() admits because vet reads the two ' +
        'as different leaves')
    }
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

const MIN_COUNT = /^min(Items|Length|Properties)$/


// A bag and its sizing atom, described as one schema object: the bag's
// positions and the atom both give a lower count, and the higher holds.
function meet(a: any, b: any): any {
  const out: any = { ...a }
  for (const k of Object.keys(b)) {
    out[k] = MIN_COUNT.test(k) && null != out[k] ? Math.max(out[k], b[k]) : b[k]
  }
  return out
}


function fromValInner(ctx: Ctx, path: string[], v: any): any {
  if (true === v.isPref) {
    const inner = fromVal(ctx, path, v.superpeg)
    const gen = generated(v.peg)
    return undefined === gen ? inner : { ...inner, default: gen }
  }

  if (true === v.isDisjunct && Array.isArray(v.peg)) {
    return fromDisjunct(ctx, path, v)
  }

  if (true === v.isConstraint) {
    return fromConstraint(ctx, path, v)
  }

  const residue = sizingResidue(v)
  if (undefined !== residue) {
    return meet(fromVal(ctx, path, residue.bag),
      fromConstraint(ctx, path, residue.con, residue.bag))
  }

  if (true === v.isConjunct && v.peg.every((t: any) => true === t?.isMap)) {
    return { allOf: v.peg.map((t: any) => fromVal(ctx, path, t)) }
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
    loseKind(ctx, path, v.peg)
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
    loseLiterals(ctx, path, groups([v]))
    return { const: jsonOf(v), type: scalarType(v) }
  }

  // The written `nil` is the bottom, which admits nothing; any other nil
  // is a failure the document carries, and refuses the run.
  if (true === v.isNil) {
    if ('literal_nil' !== v.why) {
      ctx.failed = ctx.failed ?? v
    }
    return false
  }

  lose(ctx, path, residueName(v),
    'this is not a value yet, so there is nothing to constrain a ' +
    'consumer to; the schema admits anything here')
  return {}
}


function residueName(v: any): string {
  return true === v.isRef ? 'reference' :
    true === v.isFunc ? v.funcname() :
      'unresolved'
}


// Exact numbers as raw JSON text, so every serialiser writes their digits.
function exactSafe(x: any): any {
  if ('bigint' === typeof x || x instanceof Decimal) {
    return RAW.rawJSON(x.toString())
  }
  if (Array.isArray(x)) {
    return x.map(exactSafe)
  }
  if (null != x && 'object' === typeof x) {
    return Object.fromEntries(
      Object.entries(x).map(([k, e]) => [k, exactSafe(e)]))
  }
  return x
}


// The generated JSON of a value, or undefined where it does not
// generate. Used for `default` and for `enum` members: both are VALUES
// in the schema, so a member that is itself a shape has none to give.
function generated(v: any): any {
  const a0 = new Aontu()
  const ctx = a0.ctx({ collect: true })
  const out = v.gen(ctx)
  return 0 === ctx.err.length ? exactSafe(out) : undefined
}


function bareType(s: any): string | undefined {
  return 1 === Object.keys(s).length && 'string' === typeof s.type ?
    s.type : undefined
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

  let out: any
  if (bare.every((m: any) => true === m?.isScalar)) {
    const gs = groups(bare)
    loseLiterals(ctx, path, gs)
    out = { enum: gs.map((g) => jsonOf(g.v)) }
  }
  else {
    const arms = bare.map((m: any) => fromVal(ctx, path, m))
    const types = arms.map(bareType)
    out = types.includes(undefined) ? { anyOf: arms } :
      { type: 1 === new Set(types).size ? types[0] : [...new Set(types)] }
  }

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

  for (const key of Object.keys(v.peg).sort()) {
    const child: any = v.peg[key]

    if (v.aliasKeys.includes(key)) {
      continue
    }

    // A marked child does not generate, so it is not part of the value
    // a consumer produces -- and a schema that demanded it would refuse
    // every correct document.
    if (skipMarked(ctx, [...path, key], v, child)) {
      continue
    }

    props[key] = fromVal(ctx, [...path, key], child)
    if (!optional.includes(key)) {
      required.push(key)
    }
  }

  const out: any = { type: 'object', properties: props }
  if (0 < required.length) {
    out.required = required
  }

  // CLOSEDNESS IS THE ONE THING JSON SCHEMA SAYS EXACTLY AS AONTU DOES.
  // A closed map is `additionalProperties: false`; an open one leaves
  // the keyword off, since JSON Schema's default is already open.
  const spr: any = v.spread?.cj
  if (true === v.closed) {
    out.additionalProperties = false
  }
  else if (null != spr) {
    out.additionalProperties = fromVal(ctx, [...path, '&'], spr)
  }

  return out
}


// A written list is open unless closed, and its spread already holds for
// every position, so positions are prefixItems and the spread is items.
function fromList(ctx: Ctx, path: string[], v: any): any {
  const at = (i: number) => [...path, String(i)]
  const kept: number[] = []
  v.peg.forEach((el: any, i: number) => {
    if (!skipMarked(ctx, at(i), v, el)) {
      kept.push(i)
    }
  })

  const out: any = { type: 'array' }
  if (0 < kept.length) {
    out.prefixItems = kept.map((i) => fromVal(ctx, at(i), v.peg[i]))
    out.minItems = kept.length
  }

  const spr: any = v.spread?.cj
  if (true === v.closed) {
    out.items = false
  }
  else if (null != spr) {
    out.items = fromVal(ctx, [...path, '&'], spr)
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

  if (null != ctx.failed) {
    const f: any = ctx.failed
    const nil = true === f.isNil ? f :
      makeNilErr(actx, f.invalid, f, undefined, 'constrain')
    return {
      verdict: 'error', schema: {}, lossy: [],
      errors: [failureFinding(actx, opts.path, nil)],
    }
  }

  return {
    verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
    schema: { $schema: DRAFT, ...(false === body ? { not: {} } : body) },
    lossy: ctx.lossy,
  }
}
