/* Copyright (c) 2025 Richard Rodger, MIT License */
import { includeOpts } from './utility'


import { Aontu } from './aontu'
import { makeNilErr } from './err'
import { aliasPathSegment } from './aliasname'
import { sizingResidue } from './val/BagVal'
import { walkTarget } from './val/RecurseVal'
import { funcSig } from './sig'
import { unite } from './unify'
import { top } from './val/top'
import { cmpCodePoint } from './keyorder'
import { Decimal } from './val/Decimal'
import {
  cmpNumeric,
  scaledFloor,
  scaledIsIntegral,
  scaledOfNumeric,
} from './val/numcmp'
import { isIntegerStorable } from './val/numkind'
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
  // Judge the export against `vet --exact-numbers`, which reads every
  // number by its value, rather than against plain `vet`.
  exactNumbers?: boolean
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


type Ctx = {
  lossy: SchemaLoss[], failed?: any, exact: boolean,
  root: any, defs: Map<string, any>, names: Map<string, string>,
  anchor: string[],
}


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
  Null: 'null',
}


// The numeric leaves, and the ones `vet` reads JSON data as. Plain `vet`
// reads a spelling with a point as a float and one without as an
// integer, and nothing as an exact leaf; `vet --exact-numbers` reads a
// number by its value alone, never as a float.
type Leaf = 'integer' | 'float' | 'biginteger' | 'bigdecimal'

const ALL: Leaf[] = ['integer', 'float', 'biginteger', 'bigdecimal']

const PLAIN_READ: Leaf[] = ['integer', 'float']

const KIND_LEAVES: Record<string, Leaf[]> = {
  Integer: ['integer'],
  Float: ['float'],
  BigInteger: ['biginteger'],
  BigDecimal: ['bigdecimal'],
  Number: ALL,
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

const EXACT_KIND_LOSS: Record<string, string> = {
  Integer: 'the schema says "integer" and admits an integral JSON number ' +
    'beyond the integer leaf, which vet --exact-numbers reads as a ' +
    'biginteger and the integer leaf refuses',
  Float: 'the schema says "number" and admits every JSON number, which vet ' +
    '--exact-numbers reads by its value, never as a float',
  BigInteger: 'the schema says "integer" and admits an integral JSON number ' +
    'the integer leaf holds, which vet --exact-numbers reads as an integer ' +
    'and the biginteger leaf refuses',
  BigDecimal: 'the schema says "number" and admits an integral JSON number, ' +
    'which vet --exact-numbers reads as an integer or a biginteger and the ' +
    'bigdecimal leaf refuses',
}

const EXACT_LITERAL_REASON = 'the schema admits this value in every JSON spelling, ' +
  'which vet reads as an integer or a float, never as the exact leaf; the ' +
  'digits are written exactly'

const LITERAL_LOSS: Record<Leaf, string> = {
  integer: 'the schema admits the float spelling of this value, which vet ' +
    'reads as a float and the integer leaf refuses',
  float: 'the schema admits the integer spelling of this value, which vet ' +
    'reads as an integer and the float leaf refuses',
  biginteger: EXACT_LITERAL_REASON,
  bigdecimal: EXACT_LITERAL_REASON,
}

// An integer literal is always a value the integer leaf holds, so under
// the exact reading it is never lone.
const EXACT_LITERAL_LOSS: Record<Leaf, string> = {
  integer: '',
  float: 'the schema admits this value, which vet --exact-numbers reads by ' +
    'its value, never as a float',
  biginteger: 'the schema admits this value, which vet --exact-numbers reads ' +
    'as an integer, and the biginteger leaf refuses it',
  bigdecimal: 'the schema admits this integral value, which vet ' +
    '--exact-numbers reads as an integer or a biginteger, and the ' +
    'bigdecimal leaf refuses it',
}


function leafOf(v: any): Leaf | undefined {
  return true === v.isInteger ? 'integer' :
    true === v.isNumber ? 'float' :
      true === v.isBigInteger ? 'biginteger' :
        true === v.isBigDecimal ? 'bigdecimal' : undefined
}


function readings(ctx: Ctx, v: any): Leaf[] {
  const s = scaledOfNumeric(v)
  if (!scaledIsIntegral(s)) {
    return ctx.exact ? ['bigdecimal'] : ['float']
  }
  if (!ctx.exact) {
    return PLAIN_READ
  }
  return isIntegerStorable(scaledFloor(s)) ? ['integer'] : ['biginteger']
}


// A preference with nothing to generate, as `*any` has, is dropped from
// the document, so the schema does not ask for it.
function dropped(v: any): boolean {
  if (true !== v.isPref) {
    return false
  }
  const ctx = new Aontu().ctx({ collect: true })
  return undefined === v.gen(ctx) && 0 === ctx.err.length
}


// An integer past 2^53 is held as the double equal to it, whose shortest
// spelling is another integer.
function jsonOf(v: any): any {
  return true === v.isBigInteger || true === v.isBigDecimal ?
    RAW.rawJSON(v.peg.toString()) :
    true === v.isInteger && !Number.isSafeInteger(v.peg) ?
      RAW.rawJSON(BigInt(v.peg).toString()) : v.peg
}


function sameJSON(a: any, b: any): boolean {
  return undefined !== leafOf(a) && undefined !== leafOf(b) ?
    0 === cmpNumeric(a, b) : a.peg === b.peg
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
function lone(ctx: Ctx, gs: Group[], admitted: Leaf[]): any {
  return gs.find((g) => undefined !== leafOf(g.v) && readings(ctx, g.v)
    .some((r) => admitted.includes(r) && !g.leaves.includes(r)))?.v
}


function loseLiterals(ctx: Ctx, path: string[], gs: Group[]) {
  const v = lone(ctx, gs, ALL)
  if (undefined !== v) {
    const leaf = leafOf(v) as Leaf
    lose(ctx, path,
      ('integer' === leaf || 'float' === leaf ? leaf : 'exact') + ' literal',
      (ctx.exact ? EXACT_LITERAL_LOSS : LITERAL_LOSS)[leaf])
  }
}


function loseKind(ctx: Ctx, path: string[], kind: any) {
  const reason = (ctx.exact ? EXACT_KIND_LOSS : KIND_LOSS)[kind?.name]
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
    return KIND_LEAVES[e.kind?.name] ?? ('string' === e.domain ? [] : ALL)
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
function uniqueExact(ctx: Ctx, bag: any): boolean {
  if (true !== bag?.isList) {
    return false
  }
  // Read by value, JSON numbers equal in value are one aontu value.
  if (ctx.exact) {
    return true
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
    ls.filter((l) => PLAIN_READ.includes(l)).forEach((l) => leaves.add(l))
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
    if (undefined !== lone(ctx, gs, KIND_LEAVES[c.kind?.name] ?? ALL)) {
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
    if (!uniqueExact(ctx, bag)) {
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
  const ref = aliasRef(ctx, v)
  if (undefined !== ref) {
    return ref
  }
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


// An alias's copy, unchanged, or a recursion back into a definition, is
// written once under $defs and referred to wherever it is used.
function aliasRef(ctx: Ctx, v: any): any {
  let target: string[] | undefined
  if (true === v?.isRecurse) {
    target = v.target
    if (ctx.anchor.length === v.target.length &&
      v.target.every((s: string, i: number) => s === ctx.anchor[i])) {
      return { $ref: '#' }
    }
  }
  else if (null != v?.aliasOrigin &&
    walkTarget(ctx.root, [v.aliasOrigin])?.canon === v.canon) {
    target = [v.aliasOrigin]
  }
  const body = undefined === target ? undefined : walkTarget(ctx.root, target)
  if (undefined === target || undefined === body) {
    return undefined
  }
  const at = target.map(aliasPathSegment)
  const id = JSON.stringify(target)
  let key = ctx.names.get(id)
  if (undefined === key) {
    const base = at.join('.').replace(/^%/, '')
    key = base
    for (let n = 2; ctx.defs.has(key); n++) {
      key = base + '-' + n
    }
    ctx.names.set(id, key)
    ctx.defs.set(key, {})
    ctx.defs.set(key, fromVal(ctx, at, body))
  }
  return { $ref: '#/$defs/' + pointerToken(key) }
}


// A JSON pointer token (RFC 6901), escaped again as the URI fragment
// that carries it (RFC 3986).
function pointerToken(key: string): string {
  let out = ''
  for (const ch of key.replace(/~/g, '~0').replace(/\//g, '~1')) {
    out += /^[A-Za-z0-9\-._~!$&'()*+,;=:@]$/.test(ch) ? ch :
      [...new TextEncoder().encode(ch)].map((b) =>
        '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')
  }
  return out
}

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

  if (true === v.isConjunct) {
    return fromConjunct(ctx, path, v)
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

  const kind = true === v.isFunc ?
    RESULT_TYPE[funcSig[v.funcname()]?.out] : undefined
  if (undefined !== kind) {
    lose(ctx, path, residueName(v),
      'this is computed when the document is evaluated, which a schema ' +
      'cannot say, so the schema admits any ' + kind + ' here')
    return { type: kind }
  }
  lose(ctx, path, residueName(v),
    'this is not a value yet, so there is nothing to constrain a ' +
    'consumer to; the schema admits anything here')
  return {}
}


const RESULT_TYPE: Record<string, string> = {
  string: 'string', number: 'number', map: 'object', list: 'array',
}


// A conjunct held unmet in a template meets here on its own, so a kind
// and its atoms export as one schema object. Terms that read the
// document, or do not meet alone, export side by side.
function plainTerm(t: any): boolean {
  return true === t.isScalarKind || true === t.isConstraint ||
    true === t.isEmptyConstraint || true === t.isScalar || true === t.isNull ||
    true === t.isTop || true === t.isMapKind || true === t.isListKind ||
    ((true === t.isDisjunct || true === t.isConjunct) && t.peg.every(plainTerm))
}


function fromConjunct(ctx: Ctx, path: string[], v: any): any {
  if (v.peg.every(plainTerm)) {
    // Each term meets top first, as a parsed value does: a nested
    // disjunction is held unflattened until then.
    const trial: any = new Aontu().ctx({ collect: true })
    let met: any = top()
    for (const t of v.peg) {
      met = unite(trial, met,
        unite(trial, top(), t.clone(trial), 'jsonschema'), 'jsonschema')
    }
    if (0 === trial.err.length && true !== met.isConjunct &&
      true !== met.isNil) {
      return fromVal(ctx, path, met)
    }
  }
  return { allOf: v.peg.map((t: any) => fromVal(ctx, path, t)) }
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


// The keywords that hold for one JSON kind and pass every other, so the
// arms of a split by kind may share one schema object.
const SCOPED: Record<string, string[]> = {
  null: [],
  boolean: [],
  number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'],
  integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'],
  string: ['minLength', 'maxLength', 'pattern'],
  object: ['properties', 'required', 'additionalProperties',
    'patternProperties', 'propertyNames', 'minProperties', 'maxProperties'],
  array: ['prefixItems', 'items', 'minItems', 'maxItems', 'uniqueItems'],
}

const KINDS = ['null', 'boolean', 'number', 'string', 'object', 'array']


function schemaText(s: any): string {
  return JSON.stringify(s, (_k, x) => null != x && 'object' === typeof x &&
    !Array.isArray(x) ?
    Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)
}


// Arms of distinct kinds as one schema object: `type` names the kinds,
// left off when all six are there, and each arm's own keywords join it.
// The numeric arms must agree on their keywords, or the fold is refused.
function foldKinds(arms: any[]): any {
  const out: any = {}
  const types: string[] = []
  const held: Record<string, string> = {}
  for (const arm of arms) {
    const t = arm?.type
    const scoped = SCOPED[t]
    if (undefined === scoped) {
      return undefined
    }
    const { type: _, ...own } = arm
    if (Object.keys(own).some((k) => !scoped.includes(k))) {
      return undefined
    }
    const family = 'integer' === t ? 'number' : t
    if (undefined === held[family]) {
      held[family] = schemaText(own)
      Object.assign(out, own)
    }
    else if (held[family] !== schemaText(own)) {
      return undefined
    }
    if (!types.includes(t)) {
      types.push(t)
    }
  }
  if (types.length !== KINDS.length || !KINDS.every((k) => types.includes(k))) {
    out.type = 1 === types.length ? types[0] : types
  }
  return out
}


// A disjunction held unmet in a template keeps the nesting it was
// written with, which says nothing a flat one does not.
function disjuncts(v: any): any[] {
  return v.peg.flatMap((m: any) => true === m?.isDisjunct ? disjuncts(m) : [m])
}


function fromDisjunct(ctx: Ctx, path: string[], v: any): any {
  const members: any[] = disjuncts(v)
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
    out = foldKinds(arms) ?? { anyOf: arms }
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
  const props: [string, any][] = []
  const required: string[] = []
  const optional: string[] = v.optionalKeys

  for (const key of Object.keys(v.peg).sort(cmpCodePoint)) {
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

    props.push([key, fromVal(ctx, [...path, key], child)])
    if (!optional.includes(key) && !dropped(child)) {
      required.push(key)
    }
  }

  const out: any = { type: 'object', properties: Object.fromEntries(props) }
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
    mapSpread(ctx, [...path, '&'], out, spr,
      Object.keys(v.peg).filter((k) => !v.aliasKeys.includes(k)))
  }

  return out
}


type Guard = { arms: [any, any][], dflt: any }

// A spread the import wrote as a test on the key: `match(key(0), ...)`
// with its arms and its default.
function keyGuard(t: any): Guard | undefined {
  const a: any[] = t?.peg
  if (true !== t?.isMatchFunc || true !== a[0]?.isKeyFunc ||
    !(0 === a[0].peg.length || 0 === a[0].peg[0]?.peg) || 0 !== a.length % 2) {
    return undefined
  }
  const arms: [any, any][] = []
  for (let i = 1; i < a.length - 1; i += 2) {
    arms.push([a[i], a[i + 1]])
  }
  return { arms, dflt: a[a.length - 1] }
}


// The one pattern a bare `re()` holds, and nothing for anything more.
function lonePattern(c: any): string | undefined {
  return true === c?.isConstraint && 1 === c.res.length && null == c.kind &&
    null == c.lo && null == c.hi && 0 === c.neqs.length && null == c.count &&
    0 === c.musts.length ? c.res[0].norm : undefined
}


// The map guards of design section 6: one per pattern, one naming every
// declared key and every pattern, and one on the key itself. A spread
// with no guard is the schema every further key meets.
function mapSpread(ctx: Ctx, path: string[], out: any, spr: any,
  names: string[]) {
  const terms: any[] = true === spr.isConjunct ? spr.peg : [spr]
  const guards = terms.map(keyGuard)
  if (guards.every((g) => undefined === g)) {
    out.additionalProperties = fromVal(ctx, path, spr)
    return
  }
  const patterns: [string, any][] = []
  const exempts: Guard[] = []
  const apart: any[] = []
  let lost = false
  for (const g of guards) {
    const [test, then] = g?.arms[0] ?? []
    const p = 1 === g?.arms.length ? lonePattern(test) : undefined
    if (undefined === g) {
      continue
    }
    else if (undefined !== p && true === g.dflt.isTop) {
      const s = fromVal(ctx, path, then)
      if (patterns.some(([q]) => q === p)) {
        apart.push({ patternProperties: Object.fromEntries([[p, s]]) })
      }
      else {
        patterns.push([p, s])
      }
    }
    else if (1 === g.arms.length && true === test.isConjunct &&
      2 === test.peg.length && true === test.peg[0].isEmptyConstraint &&
      true === then.isTop && true === g.dflt.isNil) {
      const c = fromVal(ctx, path, test)
      if (undefined === out.propertyNames) {
        out.propertyNames = c
      }
      else {
        apart.push({ propertyNames: c })
      }
    }
    else if (g.arms.every(([k, a]) => true === a.isTop &&
      (true === k.isString || undefined !== lonePattern(k)))) {
      exempts.push(g)
    }
    else {
      lost = true
    }
  }
  if (0 < patterns.length) {
    out.patternProperties = Object.fromEntries(patterns)
  }

  // `additionalProperties` exempts the keys its own object names, so a
  // guard exempting any other keys stands in an object of its own.
  for (const g of exempts) {
    const named = g.arms.filter(([k]) => true === k.isString)
      .map(([k]) => k.peg)
    const pats = g.arms.map(([k]) => lonePattern(k))
      .filter((x) => undefined !== x)
    const d = fromVal(ctx, path, g.dflt)
    if (undefined === out.additionalProperties && sameSet(named, names) &&
      sameSet(pats, patterns.map(([q]) => q))) {
      out.additionalProperties = d
    }
    else {
      const own: any = {}
      if (0 < named.length) {
        own.properties = Object.fromEntries(named.map((n) => [n, {}]))
      }
      if (0 < pats.length) {
        own.patternProperties = Object.fromEntries(pats.map((q) => [q, {}]))
      }
      own.additionalProperties = d
      apart.push(own)
    }
  }

  // A template holds for every key, which `additionalProperties` says
  // only in an object whose patterns exempt none.
  const plain = terms.filter((_t, i) => undefined === guards[i])
    .map((t) => fromVal(ctx, path, t))
  if (0 < plain.length) {
    const t = 1 === plain.length ? plain[0] : { allOf: plain }
    if (undefined === out.additionalProperties && 0 === patterns.length) {
      out.additionalProperties = t
    }
    else {
      apart.push({ additionalProperties: t })
    }
  }
  if (0 < apart.length) {
    out.allOf = apart
  }
  if (lost) {
    lose(ctx, path, 'match',
      'this spread tests each key in a way no keyword says, so it is ' +
      'DROPPED and the schema admits keys it refuses')
  }
}


function sameSet(a: string[], b: string[]): boolean {
  const x = [...new Set(a)].sort()
  const y = [...new Set(b)].sort()
  return x.length === y.length && x.every((e, i) => e === y[i])
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
    let need = kept.length
    while (0 < need && dropped(v.peg[kept[need - 1]])) {
      need--
    }
    if (0 < need) {
      out.minItems = need
    }
  }

  const spr: any = v.spread?.cj
  const g = keyGuard(spr)
  if (true === v.closed) {
    out.items = false
  }
  else if (undefined !== g && kept.length === v.peg.length &&
    g.arms.every(([k], i) => true === k.isString && String(i) === k.peg)) {
    out.prefixItems = [...(out.prefixItems ?? []), ...g.arms
      .slice(kept.length).map(([, a], i) => fromVal(ctx, at(kept.length + i), a))]
    if (true !== g.dflt.isTop) {
      out.items = fromVal(ctx, [...path, '&'], g.dflt)
    }
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

  const ctx: Ctx = {
    lossy: [], exact: true === opts.exactNumbers, root, defs: new Map(),
    names: new Map(), anchor,
  }
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

  const defs = 0 === ctx.defs.size ? {} : {
    $defs: Object.fromEntries([...ctx.defs.entries()]
      .sort(([a], [b]) => cmpCodePoint(a, b))),
  }
  return {
    verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
    schema: { $schema: DRAFT, ...(false === body ? { not: {} } : body), ...defs },
    lossy: ctx.lossy,
  }
}
