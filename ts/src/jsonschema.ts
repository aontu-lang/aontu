/* Copyright (c) 2025 Richard Rodger, MIT License */

// JSON SCHEMA EXPORT (the review's finding I / SUPPORT.md act 2).
//
// "JSON Schema's decisive 2026 advantage is not its validator ecosystem
// -- it is that every major LLM provider's structured-output API
// natively constrains generation to JSON Schema." Without an export,
// Aontu cannot ride that path and then apply `vet` as the semantic gate
// -- the hybrid an enterprise would actually deploy -- and an MCP tool's
// `inputSchema`, which the protocol REQUIRES to be JSON Schema, cannot
// be derived from an Aontu tool model at all (use case 09's interop
// wall).
//
// THE MAPPING IS LOSSY, AND SAYS SO PER CONSTRUCT. That is the whole
// design. Aontu's constraint algebra maps cleanly onto JSON Schema's
// core -- bounds, patterns, lengths, enums, required and closed -- and
// then stops: an evaluate-only `must()` is opaque by construction, an
// exact `0d` leaf has no JSON type that preserves it, a cross-field
// reference is not a property constraint at all, and `unique(k)` has no
// JSON Schema spelling. A converter that dropped those silently would
// hand its caller a schema that ADMITS MORE than the model does, which
// is the failure mode this whole language exists to refuse. So every
// loss is reported with its path, its construct and its reason, and
// `--strict` turns the report into a refusal.
//
// It exports the UNIFIED value, not the parse: what a document MEANS is
// what a consumer should be constrained to, and the meaning is what the
// fixpoint produced.
//
// Draft 2020-12, because that is what the structured-output APIs read.

import { Aontu } from './aontu'
import { makeNilErr } from './err'
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
  // `ok` everything carried; `lossy` the schema is a WEAKER statement
  // than the model; `error` the document does not stand up and there is
  // nothing to export.
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
  // The subtree to export, as a path -- the same anchor `vet --at`
  // takes, and parsed by the same walk, so `--at spec` means what it
  // means everywhere else.
  at?: string
  // Where the document came from, so a relative `@"file"` resolves from
  // its own directory.
  path?: string
  trust?: TrustOptions
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


// The JSON type for a kind marker, by the marker CLASS's name -- the
// same load-bearing name canon renders (ScalarKindVal). `number` and
// its four leaves all become JSON's two numeric types; the exactness of
// `biginteger`/`bigdecimal` has no JSON type at all, which is a loss the
// caller is told about rather than a silent widening.
const KIND_TYPE: Record<string, string> = {
  String: 'string',
  Boolean: 'boolean',
  Integer: 'integer',
  BigInteger: 'integer',
  Float: 'number',
  BigDecimal: 'number',
  Number: 'number',
}


// The JSON value of a concrete scalar, for `const`, `enum` and
// `default`. An exact leaf renders through its own digits rather than
// through binary64 -- and is reported as a loss where it is emitted,
// because JSON's number has no exactness to receive it.
function scalarJson(v: any): any {
  if (v.isBigInteger) {
    return Number(v.peg)
  }
  if (v.isBigDecimal) {
    return Number(v.peg.toString())
  }
  return v.peg
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


// The constraint residual's atoms, onto JSON Schema's keywords. The
// three that map exactly (bounds, pattern, count) go across; the two
// that cannot (`must`, `unique(k)`) are reported.
function fromConstraint(ctx: Ctx, path: string[], c: any): any {
  const out: any = {}

  if (null != c.kind && null != KIND_TYPE[c.kind.name]) {
    out.type = KIND_TYPE[c.kind.name]
  }
  else if ('string' === c.domain) {
    out.type = 'string'
  }
  else if ('number' === c.domain) {
    out.type = 'number'
  }

  // Bounds. An OPEN endpoint is JSON Schema's exclusive form, which is
  // a keyword of its own in 2020-12 rather than the boolean flag draft-4
  // used.
  if (null != c.lo) {
    out[c.lo.open ? 'exclusiveMinimum' : 'minimum'] = scalarJson(c.lo.v)
  }
  if (null != c.hi) {
    out[c.hi.open ? 'exclusiveMaximum' : 'maximum'] = scalarJson(c.hi.v)
  }

  // Exclusions. `neq(1,2)` is "not one of these", which is exactly
  // `not: {enum: [...]}`.
  if (0 < c.neqs.length) {
    out.not = { enum: c.neqs.map(scalarJson) }
  }

  // Patterns. Aontu DEFINES its portable subset (`re`'s abbreviations
  // mean the same in both ports); every member of that subset is also
  // an ECMA-262 regular expression, which is what JSON Schema's
  // `pattern` is read as, so this crosses without translation. More
  // than one pattern needs `allOf`: `pattern` is a single keyword.
  if (1 === c.res.length) {
    out.pattern = c.res[0].src
  }
  else if (1 < c.res.length) {
    out.allOf = c.res.map((r: any) => ({ pattern: r.src }))
  }

  // A COUNT is a length or a size depending on what is counted, and the
  // residual does not always know which. Where the domain says string,
  // it is minLength/maxLength; otherwise the container keywords, since
  // a count atom on a container is what `length` overwhelmingly means.
  if (null != c.count) {
    const lo = null == c.count.lo ? undefined : scalarJson(c.count.lo.v)
    const hi = null == c.count.hi ? undefined : scalarJson(c.count.hi.v)
    const str = 'string' === c.domain || 'string' === out.type
    if (null != lo) {
      out[str ? 'minLength' : 'minItems'] = lo
    }
    if (null != hi) {
      out[str ? 'maxLength' : 'maxItems'] = hi
    }
    if (!str && null == c.domain) {
      lose(ctx, path, 'length',
        'a count with no domain is exported as minItems/maxItems; ' +
        'JSON Schema has no keyword that counts a string OR a container')
    }
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


// The exporter proper. Every arm answers a schema; the ones that cannot
// answer honestly report a loss and fall back to `{}`, which admits
// anything -- the safe direction for a document that will be checked
// again by `vet`, and the direction the loss report exists to make
// visible.
// NO DEFENSIVE GUARD ON `v`. Every caller walks a bag's own children
// and a bag holds Vals, so a non-Val here is not a degenerate input,
// it is a bug in this file -- and an unreachable `if` is a branch arm
// the ADR-002 gate counts and no `node:coverage ignore` suppresses
// (the marker drops LINES, not branches). Go's twin keeps its `nil ==
// v` arm because a missing map key there yields a typed nil rather
// than an absent property.
function fromVal(ctx: Ctx, path: string[], v: any): any {
  // A preference is its inner value plus a DEFAULT. JSON Schema's
  // `default` is annotation rather than constraint -- it does not
  // validate -- which is exactly what a preference is when something
  // else supplies the value.
  if (true === v.isPref) {
    const inner = fromVal(ctx, path, v.peg)
    const gen = generated(v.peg)
    return undefined === gen ? inner : { ...inner, default: gen }
  }

  if (true === v.isDisjunct && Array.isArray(v.peg)) {
    return fromDisjunct(ctx, path, v)
  }

  if (true === v.isConstraint) {
    return fromConstraint(ctx, path, v)
  }

  if (true === v.isMap) {
    return fromMap(ctx, path, v)
  }

  if (true === v.isList) {
    return fromList(ctx, path, v)
  }

  if (true === v.isScalarKind) {
    const t = KIND_TYPE[v.peg?.name]
    if ('BigInteger' === v.peg?.name || 'BigDecimal' === v.peg?.name) {
      lose(ctx, path, v.peg.name.toLowerCase(),
        'JSON has one number type and it is binary64, so the EXACTNESS ' +
        'this leaf exists for cannot be carried; the schema says ' +
        '"' + t + '" and a consumer may round')
    }
    // KIND_TYPE is TOTAL over the kinds a marker can carry, so there is
    // no miss to fall back from -- and a fallback that cannot be taken
    // is a branch arm the coverage gate counts. Go's twin keeps its
    // empty-map arm, which its own ignore mechanism can carry.
    return { type: t }
  }

  if (true === v.isNull) {
    return { type: 'null' }
  }

  if (true === v.isTop) {
    return {}
  }

  if (true === v.isScalar) {
    if (v.isBigInteger || v.isBigDecimal) {
      lose(ctx, path, 'exact literal',
        'JSON has one number type and it is binary64, so this exact ' +
        'value is emitted as the nearest JSON number')
    }
    return { const: scalarJson(v), type: scalarType(v) }
  }

  // Everything else is residue: a reference that did not resolve, a
  // function or operator still waiting, a nil. None of them is a
  // property constraint, and guessing one would be inventing a promise.
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
  // No try/catch: a collecting context RECORDS a failed generation on
  // itself instead of throwing, which is the whole point of the mode.
  // Neither `vet` nor the Go twin (`schemaGenerated`) wraps this
  // either, and an untakeable catch is a branch arm the gate counts.
  const a0 = new Aontu()
  const ctx = a0.ctx({ collect: true })
  const out = v.gen(ctx)
  return 0 === ctx.err.length ? out : undefined
}


// A disjunction of CONCRETE members is an enum -- the shape a
// structured-output API constrains best. Anything else is `anyOf`. A
// preferred member contributes the `default` either way, which is how
// `*"a"|"b"|"c"` reaches a provider as a defaulted enum.
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
    { enum: consts } :
    { anyOf: bare.map((m: any) => fromVal(ctx, path, m)) }

  return undefined === def ? out : { ...out, default: def }
}


function fromMap(ctx: Ctx, path: string[], v: any): any {
  const props: Record<string, any> = {}
  const required: string[] = []
  const optional: string[] = v.optionalKeys
  let spread: any = undefined

  for (const key of Object.keys(v.peg).sort()) {
    const child: any = v.peg[key]

    // A hidden child does not generate, so it is not part of the value
    // a consumer produces -- and a schema that demanded it would refuse
    // every correct document.
    if (true === child?.mark?.hide) {
      lose(ctx, [...path, key], 'hide',
        'a hidden entry is not generated, so it is omitted from the ' +
        'schema; a consumer is neither asked for it nor allowed to know ' +
        'about it')
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
    if (null != spread) {
      lose(ctx, path, '&:',
        'a spread on a CLOSED map constrains keys that cannot exist, ' +
        'so additionalProperties:false stands alone and the template ' +
        'is dropped')
    }
  }
  else if (null != spread) {
    // A spread IS additionalProperties-with-a-schema: every key the
    // author did not name must still satisfy the template.
    out.additionalProperties = spread
  }

  return out
}


function fromList(ctx: Ctx, path: string[], v: any): any {
  const els: any[] = v.peg
  const spr: any = v.spread?.cj

  // A list with a spread template is homogeneous: every element, named
  // or not, satisfies it. That is `items`.
  if (null != spr) {
    const out: any = {
      type: 'array',
      items: fromVal(ctx, [...path, '&'], spr),
    }
    if (0 < els.length) {
      out.minItems = els.length
    }
    return out
  }

  // A written list literal is a TUPLE: position by position, and no
  // more. 2020-12 spells that `prefixItems` plus `items: false`.
  return {
    type: 'array',
    prefixItems: els.map((el: any, i: number) =>
      fromVal(ctx, [...path, String(i)], el)),
    items: false,
    minItems: els.length,
  }
}


// The verb. Evaluate, anchor, walk, report.
export function jsonSchema(src: string, options?: SchemaOptions): SchemaReport {
  const opts = options ?? {}
  const aontu = new Aontu(null == opts.trust ? {} : { trust: opts.trust })

  // COLLECT MODE, so a syntax error arrives on the context rather than
  // as a throw -- the same failure Go's `parseEntry` hands back as an
  // error, reached by the branch below. No try/catch here for the same
  // reason `vet` has none: the mode exists so the failure can be
  // reported rather than escape, and a catch that cannot be entered is
  // a branch arm the ADR-002 gate counts.
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

  return {
    verdict: 0 < ctx.lossy.length ? 'lossy' : 'ok',
    schema: { $schema: DRAFT, ...body },
    lossy: ctx.lossy,
  }
}
