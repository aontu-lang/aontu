/* Copyright (c) 2025 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  DONE,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import {
  explainOpen,
  explainClose,
  propagateMarks,
  carryAnnotations,
  items,
} from '../utility'

import { empty } from './Val'

import { cmpCodePoint } from '../keyorder'

import { ConjunctVal } from './ConjunctVal'
import { sizingResidue } from './BagVal'

import { top } from './top'

import { withDepth } from '../unify'

import { IntegerVal } from './IntegerVal'
import { StringVal } from './StringVal'

import { makeNilErr } from '../err'

import { FeatureVal } from './FeatureVal'
import { admits, trialUnify } from './FuncBaseVal'

import {
  BigDecimal,
  BigInteger,
  Float,
  Integer,
  Path,
} from './ScalarKindVal'

import type { Scaled } from './numcmp'

import {
  cmpNumeric,
  cmpCodePoints,
  cmpScaled,
  towerRank,
  scaledOfNumeric,
  scaledIsIntegral,
  scaledFloor,
} from './numcmp'


type Bound = {
  v: any          // the stored endpoint scalar Val (leaf preserved)
  open: boolean   // true for above/below, false for min/max
}

type ReAtom = {
  v: any
  src: string     // the pattern text AS WRITTEN — canon and dedup use this,
                  // never the normalised form, because canon round-trips
                  // source and G6's hash will be taken over canon
  norm: string    // the engine-neutral rewrite actually compiled (ADR-003)
  re: RegExp      // compiled by the host engine, from `norm`
}

type MustAtom = {
  v: any          // the value the peer must unify with (any Aontu value)
  msg: any        // the author's message StringVal (canon renders the literal)
}

type NofAtom = {
  count: ConstraintState  // the admissible number of admitting branches
  branches: any[]         // sorted by canon, never deduplicated
}

type WhenAtom = {
  c: any    // the condition, a trial schema
  t: any    // what a value the condition admits must satisfy
  e?: any   // and what one it refuses must; absent passes
}

type ContainsAtom = {
  c: any                  // the trial schema a member must meet
  count: ConstraintState  // the admissible number of admitted members
}

// What one cover reaches where it applies, read from its record map.
type RestRecord = {
  keys?: any        // a schema the member's key must meet
  prefix?: bigint   // list members below this index
  items?: any       // a schema the member itself must meet
  covers: RestCover[]
  else?: RestRecord // what applies where the trial refuses
}

type RestCover = {
  trial: any        // the trial schema; `any` applies everywhere
  rec: RestRecord
  src: any          // the record map as written
}

type RestAtom = {
  t: any               // what a member no cover reaches must meet
  covers: RestCover[]  // sorted by canon, never deduplicated
}

type ConstraintState = {
  domain?: 'number' | 'string'
  kind?: any      // numeric leaf marker (Integer | Float | ...) or undefined
  lo?: Bound
  hi?: Bound
  neqs: any[]     // excluded scalars, identity per leaf+value
  mults: any[]    // divisors, one per value, in value order (never an lcm)
  res: ReAtom[]   // accumulated patterns, sorted by source (never simplified)
  count?: ConstraintState  // the COUNT residual (len()), itself a residual
                           // over the integer domain -- the count atom reuses
                           // this same algebra recursively
  uniq: boolean
  uniqBy: string[]  // ... and distinct ON EACH OF THESE KEYS
                    // (unique(k)), sorted and deduplicated
  musts: MustAtom[]  // Band B checks, kept in written order, never simplified
  nofs: NofAtom[]    // Band B counts, sorted by canon, one per canon
  whens?: WhenAtom[] // Band B conditionals, sorted by canon, one per canon
  contains?: ContainsAtom[] // Band B member counts, likewise
  rests?: RestAtom[] // Band B evaluated coverage, likewise
  clash?: boolean // a kind disagreement inside a len() argument, recorded
                  // rather than raised: the argument's own meet has no
                  // ctx to report through, so emptiness carries the news
  invalid?: string  // why-code when the atom's arguments were unusable
  nonEmpty?: boolean  // met the `string` kind, which refuses ""
  emptyOk?: boolean   // met `empty()`, which waives nonEmpty
  pathKind?: boolean  // met the `path` kind: the spelling of a path
}


const RE_REPEAT_MAX = 1000

// The normative expansions. These are Aontu's definitions, not either
// host's; both hosts are rewritten to them.
const RE_CLASS_DIGIT = '0-9'
const RE_CLASS_WORD = '0-9A-Za-z_'
const RE_CLASS_SPACE = ' \\t\\n\\r\\f\\v'

const RE_ESCAPE_PUNCT = '\\.+*?()[]{}|^$/'

// Escapes passed through unchanged: the control characters, the ASCII
// word boundary, and `\xHH`. Each was probed in both engines.
const RE_ESCAPE_PASS = 'tnrfv'

function repeatWhy(src: string, at: number): [string, number] {
  const bad = (what: string): [string, number] => [
    'a ' + what + ', which the two engines do not read the same way', -1]

  let i = at + 1
  let digits = ''
  const bounds: number[] = []
  let commas = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if ('0' <= c && c <= '9') {
      digits += c
      continue
    }
    if (',' === c) {
      if ('' === digits || 0 < commas) {
        return bad('{ that does not open a counted quantifier')
      }
      bounds.push(parseInt(digits, 10))
      digits = ''
      commas++
      continue
    }
    if ('}' === c) {
      if ('' !== digits) {
        bounds.push(parseInt(digits, 10))
      }
      else if (0 === commas) {
        return bad('{ that does not open a counted quantifier')
      }
      break
    }
    return bad('{ that does not open a counted quantifier')
  }
  if (i >= src.length) {
    return bad('{ that does not open a counted quantifier')
  }
  for (const b of bounds) {
    if (RE_REPEAT_MAX < b) {
      return ['a repeat count above ' + RE_REPEAT_MAX +
        ', which RE2 refuses to compile', -1]
    }
  }
  // A descending range (`{5,2}`) is refused by both engines' own
  // compilers, so it needs no rule here.
  return ['', i]
}


function isHexDigit(c: string | undefined): boolean {
  return null != c && (
    ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F'))
}


// normaliseEscape rewrites one `\<n>` into its engine-neutral form.
// Returns [emitted, why, extra]: `why` non-empty means refused, and
// `extra` counts source characters consumed beyond the backslash and n.
function normaliseEscape(
  n: string | undefined, src: string, i: number, inClass: boolean
): [string, string, number] {
  if (null == n) {
    return ['', 'a trailing backslash', 0]
  }
  if ('1' <= n && n <= '9') {
    return ['', 'a backreference (\\' + n + '): RE2 has no equivalent, and a' +
      ' pattern with one is not a regular expression', 0]
  }
  if ('k' === n) {
    return ['', 'a named backreference (\\k): RE2 has no equivalent', 0]
  }
  if ('u' === n) {
    return ['', 'a \\u escape, which RE2 spells \\x{...}: write the character' +
      ' itself, or \\xHH for a byte', 0]
  }
  if ('p' === n || 'P' === n) {
    return ['', 'a Unicode class (\\' + n + '), which JavaScript reads as a' +
      ' literal "' + n + '" without a flag aontu does not set', 0]
  }
  if ('Z' === n) {
    return ['', '\\Z, which RE2 does not accept and JavaScript reads as a' +
      ' literal "Z": write $ for end of text', 0]
  }
  if ('x' === n) {
    if ('{' === src[i + 2]) {
      return ['', 'a \\x{...} escape, which JavaScript spells \\u: write the' +
        ' character itself', 0]
    }
    if (!isHexDigit(src[i + 2]) || !isHexDigit(src[i + 3])) {
      return ['', 'an \\x escape without two hex digits', 0]
    }
    return ['\\x' + src[i + 2] + src[i + 3], '', 2]
  }

  // The abbreviations, rewritten to Aontu's definitions. Inside a class
  // the expansion splices without its brackets (`[\dx]` -> `[0-9x]`).
  if ('d' === n || 'w' === n || 's' === n) {
    const set = 'd' === n ? RE_CLASS_DIGIT :
      'w' === n ? RE_CLASS_WORD : RE_CLASS_SPACE
    return [inClass ? set : '[' + set + ']', '', 0]
  }
  if ('D' === n || 'W' === n || 'S' === n) {
    if (inClass) {
      // `[^...]` cannot be spliced into an enclosing class: the negation
      // would apply to the whole class rather than this member.
      return ['', 'a negated abbreviation (\\' + n + ') inside a character' +
        ' class, which cannot be expanded in place: write the characters out', 0]
    }
    const set = 'D' === n ? RE_CLASS_DIGIT :
      'W' === n ? RE_CLASS_WORD : RE_CLASS_SPACE
    return ['[^' + set + ']', '', 0]
  }

  // Anchors. `\A`/`\z` are RE2 spellings that JavaScript reads as
  // literals, so they are rewritten rather than refused. Inside a class
  // an anchor is meaningless, and `[\b]` is a BACKSPACE in JavaScript.
  if ('A' === n || 'z' === n || 'b' === n || 'B' === n) {
    if (inClass) {
      return ['', '\\' + n + ' inside a character class, where the two' +
        ' engines do not agree what it means', 0]
    }
    return ['A' === n ? '^' : 'z' === n ? '$' : '\\' + n, '', 0]
  }

  if ('-' === n) {
    return inClass ? ['\\-', '', 0] :
      ['', '\\- outside a character class: it is a range separator inside' +
        ' one and a syntax error outside one (write a bare -)', 0]
  }
  if (RE_ESCAPE_PASS.includes(n) || RE_ESCAPE_PUNCT.includes(n)) {
    return ['\\' + n, '', 0]
  }
  return ['', '\\' + n + ', an escape whose meaning the two engines do not' +
    ' share', 0]
}


// normaliseRe rewrites a pattern into the engine-neutral subset.
// Returns [normalised, why]: a non-empty `why` means the pattern is
// outside the subset and names the construct.
function normaliseRe(src: string): [string, string] {
  let inClass = false
  const out: string[] = []

  const groups: { q: boolean, alt: boolean }[] = []
  const mark = (k: 'q' | 'alt') => {
    if (0 < groups.length) {
      groups[groups.length - 1][k] = true
    }
  }

  // Where the counted quantifier validated below closes, so its own
  // `}` is told apart from a stray one; and whether the atom just
  // emitted was `^` or `$`, which cannot be quantified.
  let repeatEnd = -1
  let anchorPrev = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const afterAnchor = anchorPrev
    anchorPrev = false

    if ('\\' === c) {
      const [emit, why, extra] = normaliseEscape(src[i + 1], src, i, inClass)
      if ('' !== why) {
        return ['', why]
      }
      out.push(emit)
      if (!inClass && ('b' === src[i + 1] || 'B' === src[i + 1])) {
        anchorPrev = true
      }
      i += 1 + extra
      continue
    }

    if ('[' === c && ':' === src[i + 1]) {
      return ['', 'a POSIX class ([:...:]), which JavaScript does not have']
    }

    if (inClass) {
      if (']' === c) {
        inClass = false
      }
      out.push(c)
      continue
    }

    if ('[' === c) {
      // `[]` is a never-matching class in JavaScript and a parse error in
      // RE2; `[^]` is the same disagreement one character along.
      const first = '^' === src[i + 1] ? src[i + 2] : src[i + 1]
      if (']' === first) {
        return ['', 'an empty character class, which RE2 refuses']
      }
      inClass = true
      out.push(c)
      continue
    }

    if ('.' === c) {
      out.push('[^\\n]')
      continue
    }

    if ('(' === c) {
      if ('?' === src[i + 1]) {
        if (':' !== src[i + 2]) {
          return ['', 'a (?...) group other than the non-capturing (?:']
        }
        out.push('(?:')
        i += 2
      }
      else {
        out.push(c)
      }
      groups.push({ q: false, alt: false })
      continue
    }

    if (')' === c) {
      const g = groups.pop()
      if (null == g) {
        return ['', 'an unbalanced group']
      }
      const nx = src[i + 1]
      const quantified = '*' === nx || '+' === nx || '?' === nx || '{' === nx
      if (quantified && (g.q || g.alt)) {
        return ['', 'a quantifier applied to a group containing ' +
          (g.q ? 'another quantifier' : 'an alternation') +
          ', which backtracks exponentially in JavaScript']
      }
      if (g.q) mark('q')
      if (g.alt) mark('alt')
      out.push(c)
      continue
    }

    if ('|' === c) {
      mark('alt')
      out.push(c)
      continue
    }

    if ('*' === c || '+' === c || '?' === c || '{' === c) {
      if (afterAnchor) {
        return ['', 'a quantifier applied to `^`, `$`, `\\b` or ' +
          '`\\B`, which has nothing to repeat']
      }
      if ('{' === c) {
        const [why, end] = repeatWhy(src, i)
        if ('' !== why) {
          return ['', why]
        }
        repeatEnd = end
      }
      mark('q')
      out.push(c)
      continue
    }

    if ('}' === c) {
      if (i !== repeatEnd) {
        return ['', 'a `}` that closes no counted quantifier, which ' +
          'the two engines do not read the same way']
      }
      out.push(c)
      continue
    }

    out.push(c)
    anchorPrev = ('^' === c || '$' === c)
  }

  if (inClass) {
    return ['', 'an unterminated character class']
  }
  if (0 < groups.length) {
    return ['', 'an unclosed group']
  }

  return [out.join(''), '']
}


// True for a scalar Val the algebra can order: a numeric leaf or a
// string. (Booleans and null have no order and no bounds.)
function numericLeaf(v: any): boolean {
  return true === v?.isScalar &&
    (v.isInteger || v.isNumber || v.isBigInteger || v.isBigDecimal) &&
    !(v.isNumber && Number.isNaN(v.peg))
}

function stringLeaf(v: any): boolean {
  return true === v?.isScalar && 'string' === typeof v.peg && v.isString
}

function stringishLeaf(v: any): boolean {
  return stringLeaf(v) || (true === v?.isScalar && true === v.isPath)
}


function sameScalar(a: any, b: any): boolean {
  if (numericLeaf(a) && numericLeaf(b)) {
    return towerRank(a) === towerRank(b) && 0 === cmpNumeric(a, b)
  }
  if (true === a?.isPath || true === b?.isPath) {
    // Path identity is kind AND spelling (ADR-016): `neq(path($.x))`
    // excludes exactly that address, and never a plain string that
    // happens to spell it.
    return true === a?.isPath && true === b?.isPath && a.peg === b.peg
  }
  if (stringLeaf(a) && stringLeaf(b)) {
    return a.peg === b.peg
  }
  return false
}


// Domain-aware value comparison for bounds and neq ordering.
function cmpVal(domain: 'number' | 'string', a: any, b: any): number {
  return 'number' === domain ? cmpNumeric(a, b) : cmpCodePoints(a.peg, b.peg)
}


// The numeric leaf marker a concrete scalar carries, for the kind
// narrowing check.
function leafMarker(v: any): any {
  return v.isBigDecimal ? BigDecimal : v.isBigInteger ? BigInteger :
    v.isInteger ? Integer : Float
}


const LATE_CJO = 150000

function lateAtom(atom: string): boolean {
  return 'len' === atom || 'unique' === atom || 'must' === atom ||
    'nof' === atom || 'when' === atom || 'contains' === atom ||
    'rest' === atom
}


class ConstraintVal extends FeatureVal {
  isConstraint = true
  cjo = 50000

  domain?: 'number' | 'string'
  kind?: any
  lo?: Bound
  hi?: Bound
  neqs: any[] = []
  mults: any[] = []
  res: ReAtom[] = []
  count?: ConstraintState
  uniq = false
  uniqBy: string[] = []
  musts: MustAtom[] = []
  nofs: NofAtom[] = []
  whens: WhenAtom[] = []
  contains: ContainsAtom[] = []
  rests: RestAtom[] = []
  // An atom whose arguments have not settled yet (G1 phase 4). Held
  // until unify has a ctx to resolve them through; never present on a
  // residual.
  pending?: { atom: string, args: any[] }
  clash?: boolean
  invalid?: string
  invalidWhy?: string
  nonEmpty?: boolean
  emptyOk?: boolean
  pathKind?: boolean

  constructor(
    spec: ValSpec & { atom?: string, state?: ConstraintState },
    ctx?: AontuContext
  ) {
    super({ ...spec, peg: spec.peg ?? [] }, ctx)

    if (spec.state) {
      this.domain = spec.state.domain
      this.kind = spec.state.kind
      this.lo = spec.state.lo
      this.hi = spec.state.hi
      this.neqs = spec.state.neqs
      // A state built by an embedder (or by a per-port test) may predate
      // the pattern field; an absent one means "no patterns", not undefined.
      this.mults = spec.state.mults ?? []
      this.res = spec.state.res ?? []
      this.count = spec.state.count
      this.uniq = spec.state.uniq ?? false
      this.uniqBy = spec.state.uniqBy ?? []
      this.musts = spec.state.musts ?? []
      this.nofs = spec.state.nofs ?? []
      this.whens = spec.state.whens ?? []
      this.contains = spec.state.contains ?? []
      this.rests = spec.state.rests ?? []
      this.invalid = spec.state.invalid
      this.nonEmpty = spec.state.nonEmpty
      this.emptyOk = spec.state.emptyOk
      this.pathKind = spec.state.pathKind
    }
    else if (spec.atom) {
      const args = atomArgs(spec.atom, (spec.peg as any[]) ?? [])
      if (('must' === spec.atom || 'nof' === spec.atom ||
        'when' === spec.atom || 'contains' === spec.atom ||
        'rest' === spec.atom) &&
        args.some((a: any) => holdsMove(a))) {
        this.invalid = 'invalid-arg'
      }
      else if (args.some((a: any) => true !== a?.done)) {
        this.pending = { atom: spec.atom, args }
      }
      else {
        this.fromAtom(spec.atom, args)
      }
    }

    if (null != this.count || this.uniq || 0 < this.uniqBy.length ||
      0 < this.musts.length || 0 < this.nofs.length ||
      0 < this.whens.length || 0 < this.contains.length ||
      0 < this.rests.length ||
      (null != this.pending && lateAtom(this.pending.atom))) {
      this.cjo = LATE_CJO
    }

    // A residual constraint is stable, like a ScalarKindVal — but a
    // pending atom is not a residual yet, and must be re-entered on
    // later passes until its arguments settle.
    if (null == this.pending) {
      this.dc = DONE
    }
    else {
      this.notdone()
    }
  }


  private fromAtom(atom: string, args: any[]): void {
    const bad = (why: string): void => {
      this.invalid = why
    }

    if ('unique' === atom) {
      if (0 === args.length) {
        this.uniq = true
        return
      }
      if (1 !== args.length || !stringLeaf(args[0])) {
        return bad('invalid-arg')
      }
      this.uniqBy = [args[0].peg]
      return
    }

    if ('must' === atom) {
      if (2 !== args.length) {
        return bad('arg')
      }
      if (!stringLeaf(args[1])) {
        return bad('invalid-arg')
      }
      if (holdsNil(args[0])) {
        return bad('invalid-arg')
      }
      // (An effectful argument is refused at construction, in the
      // constructor: by the time this arm sees a settled `move($.b)`
      // the move has already run.)
      this.musts = [{ v: args[0], msg: args[1] }]
      return
    }

    if ('nof' === atom) {
      const n = countArgState(args[0])
      if (null == n) {
        return bad('invalid-arg')
      }
      const count = meetCount(countBase(), n)
      if (stateEmpty(count)) {
        return bad('constraint')
      }
      this.nofs = [{ count, branches: sortedByCanon(args.slice(1)) }]
      return
    }

    if ('when' === atom) {
      this.whens = [{ c: args[0], t: args[1], e: args[2] }]
      return
    }

    if ('contains' === atom) {
      const n = 1 === args.length ? atLeastOne() : countArgState(args[1])
      if (null == n) {
        return bad('invalid-arg')
      }
      const count = meetCount(countBase(), n)
      if (stateEmpty(count)) {
        return bad('constraint')
      }
      this.contains = [{ c: args[0], count }]
      return
    }

    if ('rest' === atom) {
      if (0 === args.length % 2) {
        return bad('arg')
      }
      const covers = restCovers(args.slice(1))
      if (undefined === covers) {
        return bad('invalid-arg')
      }
      this.rests = [{ t: args[0], covers }]
      return
    }

    if ('neq' === atom) {
      if (0 === args.length) {
        return bad('arg')
      }
      let domain: 'number' | 'string' | undefined = undefined
      for (const a of args) {
        const d = numericLeaf(a) ? 'number' : stringishLeaf(a) ? 'string' : undefined
        if (null == d || (null != domain && d !== domain)) {
          return bad('invalid-arg')
        }
        domain = d
      }
      this.domain = domain
      this.neqs = dedupSorted(domain as any, args)
      return
    }

    if (1 !== args.length) {
      return bad('arg')
    }
    const a = args[0]

    if ('multiple' === atom) {
      const d = numericLeaf(a) ? decimalOf(a) : undefined
      if (undefined === d || d.unscaled <= 0n) {
        return bad('invalid-arg')
      }
      this.domain = 'number'
      this.mults = [a]
      return
    }

    // `re` is the one atom whose argument is not an ORDER point: a
    // pattern is a membership test, so it takes the string domain
    // outright rather than inferring a domain from the argument's leaf.
    if ('re' === atom) {
      if (!stringLeaf(a)) {
        return bad('invalid-arg')
      }
      const src = a.peg as string
      const [norm, why] = normaliseRe(src)
      if ('' !== why) {
        this.invalidWhy = why
        return bad('constraint_pattern')
      }
      let re: RegExp
      try {
        re = new RegExp(norm, 'u')
      }
      catch (e: any) {
        this.invalidWhy = 'not a valid pattern'
        return bad('constraint_pattern')
      }
      this.domain = 'string'
      this.res = [{ v: a, src, norm, re }]
      return
    }

    if ('len' === atom) {
      const arg = countArgState(a)
      if (null == arg) {
        return bad('invalid-arg')
      }
      const inner = meetCount(countBase(), arg)
      this.count = inner
      // `len(min(5)&max(3))` is unsatisfiable with no peer in sight, so
      // it is refused at composition time like any other empty meet.
      if (stateEmpty(inner)) {
        return bad('constraint')
      }
      return
    }

    const domain = numericLeaf(a) ? 'number' : stringishLeaf(a) ? 'string' : undefined
    if (null == domain) {
      return bad('invalid-arg')
    }
    this.domain = domain

    const open = 'above' === atom || 'below' === atom
    const bound: Bound = { v: a, open }
    if ('min' === atom || 'above' === atom) {
      this.lo = bound
    }
    else {
      this.hi = bound
    }
  }


  unify(peer: Val, ctx: AontuContext): Val {
    const te = ctx.explain && explainOpen(ctx, ctx.explain, 'Constraint', this, peer)

    // Every branch of the ladder assigns, so no initialiser: a
    // residual is stable and the ladder is total.
    let out: Val

    if (true === (peer as any)?.isRel
      || true === (peer as any)?.isGraphAtom) {
      out = (peer as any).unify(this, ctx)
    }
    else if (null != this.pending) {
      out = this.settle(peer, ctx)
    }
    // An atom whose arguments are still settling holds no state to meet
    // yet, so it settles against this one rather than be read as empty.
    else if (true === (peer as any)?.isConstraint &&
      null != (peer as any).pending) {
      out = (peer as any).settle(this, ctx)
    }
    else if (null != this.invalid) {
      out = makeNilErr(ctx, this.invalid, this, undefined, 'constrain',
        null == this.invalidWhy ? undefined : { reason: this.invalidWhy })
    }
    else if (null == peer || (peer as any).isTop) {
      out = this
    }
    else if ((peer as any).isNil) {
      out = peer
    }
    else if ((peer as any).isConstraint) {
      out = this.meetConstraint(peer as ConstraintVal, ctx)
    }
    else if ((peer as any).isScalarKind) {
      out = this.meetKind(peer, ctx)
    }
    else if ((peer as any).isScalar) {
      out = this.admit(peer, ctx)
    }
    else if ((peer as any).isMap || (peer as any).isList) {
      out = this.admitContainer(peer, ctx)
    }
    else if ((peer as any).isContainerKind) {
      out = null != this.domain ? this.fail(ctx, peer) : this.hold(peer, ctx)
    }
    /* node:coverage ignore next 12 */
    else {
      out = this.fail(ctx, peer)
    }

    ctx.explain && explainClose(te, out)

    return out
  }


  settle(peer: Val, ctx: AontuContext): Val {
    const TOP = top()
    const pend = this.pending as { atom: string, args: any[] }

    let settled = true
    const args: any[] = []
    for (const arg of pend.args) {
      let next = arg
      if (true !== arg?.done) {
        next = withDepth(ctx, arg, TOP, () => arg.unify(TOP, ctx))
      }
      settled = settled && true === next?.done
      args.push(next)
    }

    if (settled) {
      // Build the residual the atom always meant, at this atom's site,
      // then let the ordinary ladder meet it with the peer.
      const built = new ConstraintVal({ peg: args, atom: pend.atom }, ctx)
      built.path = this.path
      built.site.row = this.site.row
      built.site.col = this.site.col
      built.site.url = this.site.url
      propagateMarks(this, built)
      return built.unify(peer, ctx)
    }

    this.notdone()

    // A fresh pending atom carrying the partially-resolved arguments, so
    // the next pass starts from the progress this one made rather than
    // re-resolving from source.
    const again = new ConstraintVal({ peg: args, atom: pend.atom }, ctx)
    again.path = this.path
    again.site.row = this.site.row
    again.site.col = this.site.col
    again.site.url = this.site.url
    propagateMarks(this, again)

    if (null == peer || (peer as any).isTop) {
      return again
    }
    // No nil-peer arm: `unite` returns a nil operand before any Val's
    // unify (ts/src/unify.ts), and the conjunct below would fold one.
    return new ConjunctVal({ peg: [again, peer] }, ctx)
  }


  // Membership: the peer scalar passes every part of the residual, or
  // the whole meet is a located conflict.
  private admit(peer: any, ctx: AontuContext): Val {
    // No scalar has members, so a `unique()` residual admits none --
    // and neither does a `unique(k)` or a `contains` one.
    if (this.uniq || 0 < this.uniqBy.length || 0 < this.contains.length) {
      return this.fail(ctx, peer)
    }
    if (!stateAdmits(this, peer) ||
      (true === this.nonEmpty && true === peer.isPath) ||
      (true === this.pathKind && true !== peer.isPath)) {
      return this.fail(ctx, peer)
    }
    if (this.nonEmpty && true === peer.isString) {
      peer = peer.withNonEmpty(ctx)
    }
    if (this.emptyOk && true === peer.isString) {
      peer = peer.withEmpty(ctx)
    }
    if (null != this.count) {
      if (!stringishLeaf(peer)) {
        return this.fail(ctx, peer)
      }
      if (!stateAdmits(this.count, countVal([...peer.peg].length))) {
        return this.fail(ctx, peer)
      }
    }
    // A SCALAR HAS NO MEMBERS to accumulate, so its musts are decided
    // here and never residuate: the final reading is the only reading
    // a scalar has.
    const gives: Gives | undefined = true === ctx.annotate ? [] : undefined
    const bad = this.checkMusts(peer, ctx, true, gives) ??
      this.checkNofs(peer, ctx, true, gives) ??
      this.checkWhens(peer, ctx, true, gives)
    if (null != bad) {
      return bad
    }
    gives?.forEach(([into, met]) => harvestRiders(into, met))
    return peer
  }


  // `must(c)` asks the admission trial `nof(1, c)` asks (ADR-047). Before
  // the value is settled the one answer given is a refusal no member
  // could retract, a meet already empty, as for every Band B check.
  private checkMusts(peer: any, ctx: AontuContext, final?: boolean,
    gives?: Gives): Val | undefined {
    for (const m of this.musts) {
      const tctx = ctx.clone({})
      tctx.settle = false
      const ok = true === final ?
        admits(tctx, peer, m.v, () => [peer.clone(tctx), m.v.clone(tctx)], true,
          give(gives, peer)) :
        undefined !== trialUnify(tctx, peer.clone(tctx), m.v.clone(tctx))
      if (!ok) {
        return makeNilErr(ctx, 'must', this, peer, undefined, {
          message: m.msg.peg,
          expected: m.v.canon,
          actual: peer.canon,
        })
      }
    }
    return undefined
  }


  // Each branch is tried while a remaining one can still move the
  // verdict, so `nof(min(1), ...)` stops at the first that admits. The
  // value is settled, so each trial runs to settlement from a first meet
  // that is not.
  private checkNofs(peer: any, ctx: AontuContext, final?: boolean,
    gives?: Gives): Val | undefined {
    for (const n of this.nofs) {
      const tctx = ctx.clone({})
      tctx.settle = false
      const k = n.branches.length
      const tried: string[] = []
      let admitted = 0
      let refused = false
      if (true === final) {
        // Every branch that passes annotates, so none is left untried.
        for (let i = 0; i < k && (undefined !== gives ||
          !settledCount(n.count, admitted, k - i)); i++) {
          const b = n.branches[i]
          const ok = admits(tctx, peer, b,
            () => [peer.clone(tctx), b.clone(tctx)], true, give(gives, peer))
          admitted += ok ? 1 : 0
          tried.push(b.canon + (ok ? ' admits' : ' refuses'))
        }
        refused = !stateAdmits(n.count, countVal(admitted))
      }
      else {
        // An alternative whose meet is already empty can never admit
        // the value, so the count is at most the rest.
        for (const b of n.branches) {
          const open = undefined !== trialUnify(tctx, peer.clone(tctx),
            b.clone(tctx))
          admitted += open ? 1 : 0
          tried.push(b.canon + (open ? ' may admit' : ' refuses'))
        }
        refused = settledCount(n.count, 0, admitted) &&
          !stateAdmits(n.count, countVal(0))
      }
      if (refused) {
        return makeNilErr(ctx, 'nof', this, peer, undefined, {
          expected: nofCanon(n),
          actual: peer.canon,
          count: canonState(n.count),
          observed: (true === final ? '' : 'at most ') + admitted,
          tried: 0 === tried.length ? 'none' : tried.join(', '),
        })
      }
    }
    return undefined
  }


  // The condition chooses the branch the value must satisfy. Before the
  // value is settled the one answer is a refusal no member could
  // retract: every branch that could still apply already empty.
  private checkWhens(peer: any, ctx: AontuContext, final?: boolean,
    gives?: Gives): Val | undefined {
    for (const w of this.whens) {
      const tctx = ctx.clone({})
      tctx.settle = false
      const trial = (v: any) => true === final ?
        admits(tctx, peer, v, () => [peer.clone(tctx), v.clone(tctx)], true,
          give(gives, peer)) :
        undefined !== trialUnify(tctx, peer.clone(tctx), v.clone(tctx))
      const cond = trial(w.c)
      const shut = (v: any) => undefined !== v && !trial(v)
      const refused = true === final ? shut(cond ? w.t : w.e) :
        shut(w.e) && (!cond || shut(w.t))
      if (refused) {
        return makeNilErr(ctx, 'when', this, peer, undefined, {
          expected: whenCanon(w),
          actual: peer.canon,
          condition: !cond ? 'refuses' : true === final ? 'admits' :
            'may admit',
          branch: !cond ? 'else' : true === final ? 'then' : 'then and else',
        })
      }
    }
    return undefined
  }


  // A member counts when the trial admits it, and counting stops once no
  // member left can move the verdict. Before generation only a concrete
  // scalar's admission is final, so the one refusal then is an upper
  // bound those members already pass.
  private checkContains(peer: any, ctx: AontuContext, final?: boolean,
    gives?: Gives): Val | undefined {
    if (0 === this.contains.length) {
      return undefined
    }
    const keys: string[] = []
    const members = emittedMembers(peer, ctx, keys)
    if (undefined === members) {
      return undefined
    }
    for (const a of this.contains) {
      const tctx = ctx.clone({})
      tctx.settle = false
      const matched: string[] = []
      for (let i = 0; i < members.length && (undefined !== gives ||
        !countSettled(a.count, matched.length)); i++) {
        const m = members[i]
        if ((true === final || true === m.isScalar) && admits(tctx, m, a.c,
          () => [m.clone(tctx), a.c.clone(tctx)], true, give(gives, m))) {
          matched.push(keys[i])
        }
      }
      if (countExceeded(a.count, matched.length) || (true === final &&
        !stateAdmits(a.count, countVal(matched.length)))) {
        return makeNilErr(ctx, 'contains', this, peer, undefined, {
          expected: containsCanon(a),
          actual: peer.canon,
          count: canonState(a.count),
          admitted: '' + matched.length,
          matched: 0 === matched.length ? 'none' : matched.join(', '),
        })
      }
    }
    return undefined
  }


  // A member is reached by a cover whose trial admits the value, or by
  // the else of one whose trial refuses it, and every member none reaches
  // must meet t. Before generation each trial and member schema counts as
  // admitting unless its meet is already empty, so the one refusal then
  // is a member no cover could reach whose meet with t is empty.
  private checkRests(peer: any, ctx: AontuContext, final?: boolean,
    gives?: Gives): Val | undefined {
    if (0 === this.rests.length) {
      return undefined
    }
    const keys: string[] = []
    const members = emittedMembers(peer, ctx, keys)
    if (undefined === members) {
      return undefined
    }
    const tctx = ctx.clone({})
    tctx.settle = false
    const trial = (node: any, v: any, passed?: (met: Val) => void): boolean =>
      (true === v.isTop && (passed?.(v), true)) ||
      (true !== v.isNil && (true === final ?
        admits(tctx, node, v, () => [node.clone(tctx), v.clone(tctx)], true,
          passed) :
        undefined !== trialUnify(tctx, node.clone(tctx), v.clone(tctx))))
    const verdicts = new Map<any, boolean>()
    const passes = (v: any): boolean => {
      if (!verdicts.has(v)) {
        verdicts.set(v, trial(peer, v))
      }
      return verdicts.get(v) as boolean
    }
    let at = 0
    const reach = (r: RestRecord): boolean =>
      (undefined !== r.keys && trial(new StringVal({ peg: keys[at] }, ctx),
        r.keys)) ||
      (undefined !== r.prefix && true === peer.isList &&
        BigInt(keys[at]) < r.prefix) ||
      (undefined !== r.items && trial(members[at], r.items)) ||
      covered(r.covers)
    const covered = (cs: RestCover[]): boolean => cs.some((c) => {
      const pass = passes(c.trial)
      return (pass && reach(c.rec)) || (undefined !== c.rec.else &&
        (true !== final || !pass) && reach(c.rec.else))
    })
    for (const r of this.rests) {
      for (at = 0; at < members.length; at++) {
        if ((true !== final && peer.optionalKeys.includes(keys[at])) ||
          covered(r.covers) || trial(members[at], r.t, give(gives, members[at]))) {
          continue
        }
        return makeNilErr(ctx, 'rest', this, peer, undefined, {
          expected: restCanon(r),
          actual: peer.canon,
          key: keys[at],
        })
      }
    }
    return undefined
  }


  settleContainer(peer: any, ctx: AontuContext): Val {
    return this.admitContainer(peer, ctx, true)
  }


  private admitContainer(
    peer: any, ctx: AontuContext, final?: boolean): Val {
    const gives: Gives | undefined =
      true === final && true === ctx.annotate ? [] : undefined
    const out = this.admitChecked(peer, ctx, final, gives)
    if (out === peer) {
      gives?.forEach(([into, met]) => harvestRiders(into, met))
    }
    return out
  }


  private admitChecked(peer: any, ctx: AontuContext, final: boolean | undefined,
    gives: Gives | undefined): Val {
    // A scalar-domain residual has no reading over a container.
    if (null != this.domain) {
      return this.fail(ctx, peer)
    }
    // Not yet settled: the container, or an optional child, may still
    // resolve, so the member set is not final. Defer rather than decide
    // — the same discipline OpBaseVal follows for a non-concrete operand.
    if (!containerSettled(peer)) {
      this.dc = 0
      return new ConjunctVal({ peg: [this, peer] }, ctx)
    }

    const bad = this.checkMusts(peer, ctx, final, gives) ??
      this.checkNofs(peer, ctx, final, gives) ??
      this.checkWhens(peer, ctx, final, gives) ??
      this.checkContains(peer, ctx, final, gives) ??
      this.checkRests(peer, ctx, final, gives)
    if (null != bad) {
      return bad
    }

    if (!this.uniq && 0 === this.uniqBy.length && null == this.count) {
      if (true === final || (0 === this.musts.length &&
        0 === this.nofs.length && 0 === this.whens.length &&
        0 === this.contains.length && 0 === this.rests.length)) {
        return peer
      }
      return this.hold(peer, ctx)
    }

    const members = emittedMembers(peer, ctx)
    if (null == members) {
      if (true === final) {
        return peer
      }
      return this.hold(peer, ctx)
    }

    const count = null == this.count ? undefined : this.count
    const n = members.length
    if (null != count) {
      if (null != count.hi && !stateAdmits({ ...count, lo: undefined },
        countVal(n))) {
        return this.fail(ctx, peer)
      }
      if (0 < count.neqs.length && !stateAdmits(
        { ...count, lo: undefined, hi: undefined }, countVal(n))) {
        return this.fail(ctx, peer)
      }
      // The provisional half, decided only when nothing more can
      // arrive: a lower bound still short is a refusal at generation
      // and a residue before it.
      if (true === final && !stateAdmits(count, countVal(n))) {
        return this.fail(ctx, peer)
      }
    }

    if (this.uniq) {
      const seen = new Set<string>()
      for (const m of members) {
        const key = m.canon
        if (seen.has(key)) {
          return this.fail(ctx, peer)
        }
        seen.add(key)
      }
    }

    for (const field of this.uniqBy) {
      const seen = new Set<string>()
      for (const m of members) {
        const at: any = true === (m as any).isMap ?
          (m as any).peg[field] : undefined
        if (null == at) {
          return this.fail(ctx, peer)
        }
        const key = at.canon
        if (seen.has(key)) {
          return this.fail(ctx, peer)
        }
        seen.add(key)
      }
    }

    // WHAT IS LEFT IS PROVISIONAL, so the atom stays on the value. A
    // lower bound already met is the one reading that cannot be undone,
    // and an atom holding nothing else is spent: that is when it goes.
    const spent = true === final || (0 === this.musts.length &&
      0 === this.nofs.length && 0 === this.whens.length &&
      0 === this.contains.length && 0 === this.rests.length && !this.uniq &&
      0 === this.uniqBy.length && (null == count ||
        (null == count.hi && 0 === count.neqs.length &&
          stateAdmits(count, countVal(n)))))
    if (spent) {
      return peer
    }
    return this.hold(peer, ctx)
  }


  private hold(peer: any, ctx: AontuContext): Val {
    this.dc = DONE
    const held: any = new ConjunctVal({ peg: [this, peer] }, ctx)
    held.dc = DONE
    return held
  }


  private meetKind(peer: any, ctx: AontuContext): Val {
    const marker = peer.peg
    const merged = this.cloneState()

    // `path` and `string` share the string domain, whose atoms read a
    // spelling, but they are different kinds.
    if (Path === marker) {
      if (true === this.emptyOk) {
        return makeNilErr(ctx, 'empty_domain', peer, this)
      }
      if ('number' === this.domain || true === this.nonEmpty) {
        return this.fail(ctx, peer)
      }
      if (true === this.pathKind) {
        return this
      }
      const merged = this.cloneState()
      merged.domain = 'string'
      merged.pathKind = true
      return this.finish(merged, ctx, peer)
    }

    if (String === marker && true === this.pathKind) {
      return this.fail(ctx, peer)
    }

    if (Number === marker || String === marker) {
      const d = Number === marker ? 'number' : 'string'
      const nonEmpty = true === this.nonEmpty || String === marker
      const emptyOk = true === this.emptyOk || true === peer.emptyOk
      if (d === this.domain && nonEmpty === (true === this.nonEmpty) &&
        emptyOk === (true === this.emptyOk)) {
        return this
      }
      if (null != this.domain && d !== this.domain) {
        return this.fail(ctx, peer)
      }
      merged.domain = d
      merged.nonEmpty = nonEmpty || undefined
      merged.emptyOk = emptyOk || undefined
      return this.finish(merged, ctx, peer)
    }

    const isLeaf = Integer === marker || Float === marker ||
      BigInteger === marker || BigDecimal === marker
    if (!isLeaf || 'string' === this.domain) {
      return this.fail(ctx, peer)
    }
    if (null != this.kind && this.kind !== marker) {
      return this.fail(ctx, peer)
    }
    merged.domain = 'number'
    merged.kind = marker
    return this.finish(merged, ctx, peer)
  }


  // Meet with another residual: interval intersection, exclusion
  // union, kind union — then the eager emptiness rules.
  private meetConstraint(peer: ConstraintVal, ctx: AontuContext): Val {
    if (null != peer.invalid) {
      return makeNilErr(ctx, peer.invalid, peer, undefined, 'constrain',
        null == peer.invalidWhy ? undefined : { reason: peer.invalidWhy })
    }
    if (null != this.domain && null != peer.domain && this.domain !== peer.domain) {
      return this.fail(ctx, peer)
    }
    if (null != this.kind && null != peer.kind && this.kind !== peer.kind) {
      return this.fail(ctx, peer)
    }
    if ((true === this.pathKind && true === peer.nonEmpty) ||
      (true === this.nonEmpty && true === peer.pathKind)) {
      return this.fail(ctx, peer)
    }
    if ((true === this.pathKind && true === peer.emptyOk) ||
      (true === this.emptyOk && true === peer.pathKind)) {
      return makeNilErr(ctx, 'empty_domain', peer, this)
    }

    const d = (this.domain ?? peer.domain) as 'number' | 'string'
    const merged = this.cloneState()
    merged.domain = d
    merged.kind = this.kind ?? peer.kind
    merged.lo = tighter(d, this.lo, peer.lo, true)
    merged.hi = tighter(d, this.hi, peer.hi, false)
    merged.neqs = dedupSorted(d, [...this.neqs, ...peer.neqs])
    merged.mults = dedupMults([...this.mults, ...peer.mults])
    merged.res = dedupSortedRes([...this.res, ...peer.res])
    // `len(c1) & len(c2)` is `len(c1 & c2)`: the count atom reuses
    // numeric algebra recursively, over the counts rather than the
    // values.
    merged.count = null == this.count ? peer.count :
      null == peer.count ? this.count : meetCount(this.count, peer.count)
    // `unique()` is idempotent: two of them are one.
    merged.uniq = this.uniq || peer.uniq
    merged.uniqBy = [...new Set([...this.uniqBy, ...peer.uniqBy])].sort()
    merged.musts = [...this.musts, ...peer.musts]
    merged.nofs = dedupNofs([...this.nofs, ...peer.nofs])
    merged.whens = dedupWhens([...this.whens, ...peer.whens])
    merged.contains = dedupContains([...this.contains, ...peer.contains])
    merged.rests = dedupRests([...this.rests, ...peer.rests])
    merged.nonEmpty = this.nonEmpty || peer.nonEmpty || undefined
    merged.emptyOk = this.emptyOk || peer.emptyOk || undefined
    merged.pathKind = this.pathKind || peer.pathKind || undefined

    return this.finish(merged, ctx, peer)
  }


  // Build the merged residual, applying the eager emptiness rules.
  private finish(state: ConstraintState, ctx: AontuContext, peer: Val): Val {
    if (stateEmpty(state)) {
      return this.fail(ctx, peer)
    }

    const out = new ConstraintVal({ peg: [], state }, ctx)
    out.path = this.path
    // The whole site, span and text included: a report frames the
    // merged residual at the atom that was written.
    out.site.row = this.site.row
    out.site.col = this.site.col
    out.site.url = this.site.url
    out.site.len = this.site.len
    out.site.src = this.site.src
    propagateMarks(this, out)
    propagateMarks(peer, out)
    return out
  }


  private fail(ctx: AontuContext, peer: Val): Val {
    return makeNilErr(ctx, 'constraint', this, peer, undefined, {
      expected: this.canon,
      actual: (peer as any)?.canon,
    })
  }


  private cloneState(): ConstraintState {
    return {
      domain: this.domain,
      kind: this.kind,
      lo: this.lo,
      hi: this.hi,
      neqs: [...this.neqs],
      mults: [...this.mults],
      res: [...this.res],
      count: this.count,
      uniq: this.uniq,
      uniqBy: [...this.uniqBy],
      musts: [...this.musts],
      nofs: [...this.nofs],
      whens: [...this.whens],
      contains: [...this.contains],
      rests: [...this.rests],
      invalid: this.invalid,
      nonEmpty: this.nonEmpty,
      emptyOk: this.emptyOk,
      pathKind: this.pathKind,
    }
  }


  // Meet with `empty()`: the residual becomes a string one that also
  // admits "".
  allowEmpty(ctx: AontuContext, peer: Val): Val {
    if ('number' === this.domain || null != this.kind || this.pathKind) {
      return makeNilErr(ctx, 'empty_domain', peer, this)
    }
    if (this.emptyOk && 'string' === this.domain) {
      return this
    }
    const merged = this.cloneState()
    merged.domain = 'string'
    merged.emptyOk = true
    return this.finish(merged, ctx, peer)
  }


  clone(ctx: AontuContext, spec?: ValSpec): Val {
    let out = (super.clone(ctx, {
      ...(spec || {}),
      peg: this.peg,
    }) as ConstraintVal)
    out.domain = this.domain
    out.kind = this.kind
    out.lo = this.lo
    out.hi = this.hi
    out.neqs = [...this.neqs]
    out.mults = [...this.mults]
    out.res = [...this.res]
    out.count = this.count
    out.uniq = this.uniq
    out.uniqBy = [...this.uniqBy]
    out.musts = [...this.musts]
    out.nofs = [...this.nofs]
    out.whens = [...this.whens]
    out.contains = [...this.contains]
    out.rests = [...this.rests]
    out.pending = this.pending
    out.cjo = this.cjo
    out.invalid = this.invalid
    out.invalidWhy = this.invalidWhy
    out.nonEmpty = this.nonEmpty
    out.emptyOk = this.emptyOk
    out.pathKind = this.pathKind
    return out
  }


  // The fixed canonical atom order: kind, lower, upper, neq (arguments
  // sorted), multiple (by value), re, length, unique. No spaces; reparses
  // to a conjunct that normalises back to this exact residual.
  get canon() {
    if (null != this.pending) {
      // A pending atom has no residual yet, so canon renders the call as
      // written — the same shape FuncBaseVal renders while deferring.
      return this.pending.atom +
        '(' + this.pending.args.map((a: any) => a.canon).join(',') + ')'
    }
    return canonState(this)
  }


  same(peer: any): boolean {
    return true === peer?.isConstraint && this.canon === peer.canon
  }

}


function tighter(
  domain: 'number' | 'string',
  a: Bound | undefined,
  b: Bound | undefined,
  lower: boolean
): Bound | undefined {
  if (null == a) return b
  if (null == b) return a
  const c = cmpVal(domain, a.v, b.v)
  if (0 !== c) {
    return (lower ? 0 < c : c < 0) ? a : b
  }
  if (a.open !== b.open) {
    return a.open ? a : b
  }
  if ('number' === domain && towerRank(b.v) < towerRank(a.v)) {
    return b
  }
  return a
}


// Sort excluded scalars for canon (numeric: by point then tower rank;
// string: code-point order) and drop identity duplicates.
function dedupSorted(domain: 'number' | 'string', neqs: any[]): any[] {
  const sorted = [...neqs].sort((a: any, b: any) => {
    const c = cmpVal(domain, a, b)
    if (0 !== c) return c
    return 'number' === domain ? towerRank(a) - towerRank(b) : 0
  })
  const out: any[] = []
  for (const n of sorted) {
    if (0 === out.length || !sameScalar(out[out.length - 1], n)) {
      out.push(n)
    }
  }
  return out
}


function holdsNil(v: any): boolean {
  if (true === v.isNil) {
    return true
  }
  const peg = v.peg
  if (Array.isArray(peg)) {
    return peg.some((c: any) => holdsNil(c))
  }
  if (true === peg?.isVal) {
    return holdsNil(peg)
  }
  if (null != peg && 'object' === typeof peg) {
    for (const k in peg) {
      if (holdsNil(peg[k])) {
        return true
      }
    }
  }
  return false
}


// Each place a passing branch annotates, with the branch's settled meet.
type Gives = [any, Val][]


function give(gives: Gives | undefined, into: any):
  ((met: Val) => void) | undefined {
  return undefined === gives ? undefined : (met) => { gives.push([into, met]) }
}


// The riders a branch's meet leaves at each place land on the value at
// that place, as JSON Schema collects every passing subschema's.
function harvestRiders(into: any, from: any): void {
  const at = sizingResidue(into)?.bag ?? into
  carryAnnotations(at, from)
  if ((true === at.isMap && true === from.isMap) ||
    (true === at.isList && true === from.isList)) {
    for (const k of Object.keys(at.peg)) {
      if (undefined !== from.peg[k]) {
        harvestRiders(at.peg[k], from.peg[k])
      }
    }
  }
}


function holdsMove(v: any): boolean {
  if (true === v.isFunc && 'move' === v.funcname?.()) {
    return true
  }
  const peg = v.peg
  if (Array.isArray(peg)) {
    return peg.some((c: any) => holdsMove(c))
  }
  if (true === peg?.isVal) {
    return holdsMove(peg)
  }
  if (null != peg && 'object' === typeof peg) {
    for (const k in peg) {
      if (holdsMove(peg[k])) {
        return true
      }
    }
  }
  return false
}


function atomArgs(atom: string, args: any[]): any[] {
  if (('neq' === atom || 'must' === atom || 'nof' === atom ||
    'when' === atom || 'rest' === atom) && 1 === args.length &&
    true === (args[0] as any)?.isList) {
    return (args[0] as any).peg
  }
  return args
}


function canonState(s: ConstraintState): string {
  const parts: string[] = []
  if (null != s.kind) {
    parts.push((s.kind as any).name.toLowerCase())
  }
  else if (true === s.pathKind) {
    parts.push('path')
  }
  else if ('number' === s.domain && null == s.invalid && null == s.lo &&
    null == s.hi && 0 === s.neqs.length && 0 === s.mults.length) {
    parts.push('number')
  }
  else if ('string' === s.domain && (true === s.nonEmpty ||
    (null == s.lo && null == s.hi && 0 === s.neqs.length &&
      0 === s.res.length && true !== s.emptyOk))) {
    parts.push('string')
  }
  if (null != s.lo) {
    parts.push((s.lo.open ? 'above(' : 'min(') + s.lo.v.canon + ')')
  }
  if (null != s.hi) {
    parts.push((s.hi.open ? 'below(' : 'max(') + s.hi.v.canon + ')')
  }
  if (0 < s.neqs.length) {
    parts.push('neq(' + s.neqs.map((n: any) => n.canon).join(',') + ')')
  }
  for (const m of s.mults) {
    parts.push('multiple(' + m.canon + ')')
  }
  for (const r of s.res) {
    parts.push('re(' + r.v.canon + ')')
  }
  if (null != s.count) {
    parts.push('len(' + canonState(s.count) + ')')
  }
  if (s.uniq) {
    parts.push('unique()')
  }
  for (const key of s.uniqBy) {
    parts.push('unique(' + JSON.stringify(key) + ')')
  }
  for (const m of s.musts) {
    parts.push('must(' + m.v.canon + ',' + m.msg.canon + ')')
  }
  for (const n of s.nofs) {
    parts.push(nofCanon(n))
  }
  for (const w of s.whens ?? []) {
    parts.push(whenCanon(w))
  }
  for (const a of s.contains ?? []) {
    parts.push(containsCanon(a))
  }
  for (const r of s.rests ?? []) {
    parts.push(restCanon(r))
  }
  if (true === s.emptyOk) {
    parts.push('empty()')
  }
  if (0 === parts.length) {
    // Raw invalid atom: render the call so the error frame shows it.
    return 'constraint()'
  }
  return parts.join('&')
}


function constraintStateSubsumes(
  g: {
    domain?: 'number' | 'string', kind?: any, lo?: Bound, hi?: Bound,
    neqs: any[], mults: any[], res: ReAtom[], count?: ConstraintState,
    uniq: boolean, uniqBy: string[],
    musts: MustAtom[], nofs: NofAtom[], whens?: WhenAtom[],
    contains?: ContainsAtom[], rests?: RestAtom[],
  },
  s: {
    domain?: 'number' | 'string', kind?: any, lo?: Bound, hi?: Bound,
    neqs: any[], mults: any[], res: ReAtom[], count?: ConstraintState,
    uniq: boolean, uniqBy: string[],
    musts: MustAtom[], nofs: NofAtom[],
  },
): boolean | 'undecided' {
  // A Band B predicate on the general side makes its admitted set
  // unknowable; an extra one on the SPECIFIC side only narrows it and
  // is ignored.
  if (0 < g.musts.length || 0 < g.nofs.length || 0 < (g.whens ?? []).length ||
    0 < (g.contains ?? []).length || 0 < (g.rests ?? []).length) {
    return 'undecided'
  }

  // Domains must agree where both constrain one; a sizing-only residual
  // has no domain and passes this gate.
  if (null != g.domain && g.domain !== s.domain) {
    return false
  }

  // A general leaf restriction requires the same leaf on the specific
  // side (leaves are disjoint; an unrestricted specific admits other
  // leaves the general refuses).
  if (null != g.kind && g.kind !== s.kind) {
    return false
  }

  // `path` and `string` are disjoint kinds, and a non-empty general
  // does not cover a specific that admits "".
  const ga: any = g, sa: any = s
  if (true === ga.pathKind && true !== sa.pathKind) {
    return false
  }
  if (true === ga.nonEmpty && true !== ga.emptyOk &&
    !(true === sa.nonEmpty && true !== sa.emptyOk)) {
    return false
  }

  // Interval containment: the general's endpoints at or beyond the
  // specific's, and where they coincide the general's may not be the
  // open one.
  const d = g.domain ?? s.domain
  if (null != g.lo) {
    if (null == s.lo || null == d) {
      return false
    }
    const c = cmpVal(d, g.lo.v, s.lo.v)
    if (0 < c || (0 === c && g.lo.open && !s.lo.open)) {
      return false
    }
  }
  if (null != g.hi) {
    if (null == s.hi || null == d) {
      return false
    }
    const c = cmpVal(d, g.hi.v, s.hi.v)
    if (c < 0 || (0 === c && g.hi.open && !s.hi.open)) {
      return false
    }
  }

  // Excluding FEWER values is more general: every general exclusion
  // must be excluded by the specific too.
  for (const n of g.neqs) {
    if (!s.neqs.some((m: any) => sameScalar(n, m))) {
      return false
    }
  }

  // The multiples of a divisor hold every multiple of its multiples, and
  // an integer leaf is all multiples of 1.
  for (const m of g.mults) {
    if (!s.mults.some((q: any) => isMultipleOf(q, m)) &&
      !((Integer === s.kind || BigInteger === s.kind) &&
        divides(decimalOf(m), { unscaled: 1n, scale: 0 }))) {
      return false
    }
  }

  // Patterns compare as TEXT sets (the sanctioned approximation:
  // deciding regex containment is what this algebra refuses to do).
  for (const r of g.res) {
    if (!s.res.some((q: ReAtom) => q.src === r.src)) {
      return false
    }
  }

  if (g.uniqBy.some((k: string) => !s.uniqBy.includes(k))) {
    return false
  }
  if (g.uniq && !s.uniq) {
    return false
  }

  // The count atom reuses this same table over the integer domain.
  if (null != g.count) {
    if (null == s.count) {
      return false
    }
    return constraintStateSubsumes(g.count, s.count)
  }

  return true
}


// The query surface for ts/src/subsume.ts: residual-vs-residual, and
// residual-vs-scalar membership (with `must` and `unique` making the
// scalar case undecided/false exactly as the meet would).
function constraintSubsumesConstraint(
  g: ConstraintVal, s: ConstraintVal): boolean | 'undecided' {
  return constraintStateSubsumes(g as any, s as any)
}

function constraintAdmitsScalar(
  g: ConstraintVal, scalar: any): boolean | 'undecided' {
  if (0 < g.musts.length || 0 < g.nofs.length || 0 < g.whens.length ||
    0 < g.contains.length) {
    return 'undecided'
  }
  if (g.uniq || 0 < g.uniqBy.length) {
    return false
  }
  if (null != (g as any).count) {
    return false
  }
  const ga: any = g
  if ((true === ga.pathKind && true !== scalar.isPath) ||
    (true === ga.nonEmpty && true === scalar.isPath) ||
    (true === ga.nonEmpty && true !== ga.emptyOk &&
      true === scalar.isString && '' === scalar.peg)) {
    return false
  }
  return stateAdmits(g as any, scalar)
}


function stateAdmits(s: ConstraintState, peer: any): boolean {
  const domainOf = numericLeaf(peer) ? 'number' :
    stringishLeaf(peer) ? 'string' : undefined

  if (null == s.domain) {
    // A sizing residual has no domain, and admits any scalar the sizing
    // atoms can then rule on. Booleans and null are not among them:
    // they have no order, no length and no members. A residual of
    // evaluate-only checks alone leaves every scalar to the checks.
    if (null == domainOf) {
      return null == s.count && !s.uniq && 0 === s.uniqBy.length
    }
    return true
  }
  if (domainOf !== s.domain) {
    return false
  }
  if (null != s.kind && leafMarker(peer) !== s.kind) {
    return false
  }
  const d = s.domain
  if (null != s.lo) {
    const c = cmpVal(d, peer, s.lo.v)
    if (c < 0 || (0 === c && s.lo.open)) {
      return false
    }
  }
  if (null != s.hi) {
    const c = cmpVal(d, peer, s.hi.v)
    if (c > 0 || (0 === c && s.hi.open)) {
      return false
    }
  }
  for (const n of s.neqs) {
    if (sameScalar(peer, n)) {
      return false
    }
  }
  for (const m of s.mults) {
    if (!isMultipleOf(peer, m)) {
      return false
    }
  }
  for (const r of s.res) {
    if (!r.re.test(peer.peg)) {
      return false
    }
  }
  return true
}


function stateEmpty(s: ConstraintState): boolean {
  if (s.clash) {
    return true
  }

  const d = s.domain as 'number' | 'string'

  // Empty interval.
  if (null != s.lo && null != s.hi) {
    const c = cmpVal(d, s.hi.v, s.lo.v)
    if (c < 0 || (0 === c && (s.lo.open || s.hi.open))) {
      return true
    }
  }

  const integral = Integer === s.kind || BigInteger === s.kind ||
    s.mults.some((m: any) => scaledIsIntegral(decimalOf(m)))

  // Integral gap: an interval containing no whole number is empty when
  // all it admits is whole, under an integer leaf or a whole divisor
  // (integer & above(1) & below(2), multiple(2) & above(1) & below(2)).
  if (integral && null != s.lo && null != s.hi) {
    const lo = scaledOfNumeric(s.lo.v)
    const hi = scaledOfNumeric(s.hi.v)
    if (!lo.inf && !hi.inf) {
      // Smallest admissible integer above/at the lower bound.
      let n = scaledFloor(lo)
      if (!scaledIsIntegral(lo) || s.lo.open) {
        n += 1n
      }
      // Largest admissible integer below/at the upper bound.
      let m = scaledFloor(hi)
      if (s.hi.open && scaledIsIntegral(hi)) {
        m -= 1n
      }
      if (m < n) {
        return true
      }
    }
  }

  if (null != s.kind && null != s.lo && null != s.hi &&
    !s.lo.open && !s.hi.open &&
    0 === cmpVal(d, s.lo.v, s.hi.v)) {
    for (const n of s.neqs) {
      if (leafMarker(n) === s.kind && 0 === cmpNumeric(n, s.lo.v)) {
        return true
      }
    }
  }

  if ('number' === d && (null != s.count || s.uniq ||
    0 < s.uniqBy.length)) {
    return true
  }
  if ('string' === d && s.uniq) {
    return true
  }

  // An empty count residual makes the whole thing empty: no container
  // and no string has a length no integer can take.
  if (null != s.count && stateEmpty(s.count)) {
    return true
  }

  return false
}


function countBase(): ConstraintState {
  return {
    domain: 'number',
    kind: Integer,
    lo: { v: countVal(0), open: false },
    neqs: [],
    mults: [],
    res: [],
    musts: [],
    nofs: [],
    // A COUNT is a number, and a number has no members to be distinct.
    uniq: false,
    uniqBy: [],
  }
}


// A count as a Val, so the count residual can be applied by exactly the
// same membership function as any other numeric residual.
function countVal(n: number): any {
  return new IntegerVal({ peg: n })
}


function meetCount(a: ConstraintState, b: ConstraintState): ConstraintState {
  return {
    domain: 'number',
    // `a` is always a countBase()-seeded residual, so its kind is
    // always Integer — there is no kindless side to fall back from.
    kind: a.kind,
    lo: tighter('number', a.lo, b.lo, true),
    hi: tighter('number', a.hi, b.hi, false),
    neqs: dedupSorted('number', [...a.neqs, ...b.neqs]),
    mults: [],
    res: [],
    musts: [],
    nofs: [],
    uniq: false,
    uniqBy: [],
    clash: true === a.clash || true === b.clash ||
      (null != a.kind && null != b.kind && a.kind !== b.kind),
  }
}


function countArgState(arg: any): ConstraintState | undefined {
  if (numericLeaf(arg)) {
    return {
      domain: 'number',
      lo: { v: arg, open: false },
      hi: { v: arg, open: false },
      neqs: [], mults: [], res: [], musts: [], nofs: [], uniq: false,
      uniqBy: [],
    }
  }

  if (true === arg?.isConstraint) {
    const c = arg as ConstraintVal
    // A pattern, a divisor, a branch count, a sizing atom or a string
    // bound inside a count is not a count constraint, nor is a broken one.
    if (null != c.invalid || 0 < c.res.length || 0 < c.mults.length || c.uniq ||
      0 < c.uniqBy.length || null != c.count || 0 < c.nofs.length ||
      0 < c.whens.length || 0 < c.contains.length || 0 < c.rests.length ||
      'number' !== c.domain) {
      return undefined
    }
    return {
      domain: 'number',
      kind: c.kind,
      lo: c.lo,
      hi: c.hi,
      neqs: [...c.neqs],
      mults: [], res: [], musts: [], nofs: [], uniq: false, uniqBy: [],
    }
  }

  if (true === arg?.isScalarKind) {
    const marker = arg.peg
    if (Number === marker) {
      return {
        domain: 'number', neqs: [], mults: [], res: [], musts: [], nofs: [],
        uniq: false, uniqBy: [],
      }
    }
    if (Integer === marker || Float === marker ||
      BigInteger === marker || BigDecimal === marker) {
      return {
        domain: 'number', kind: marker, neqs: [], mults: [], res: [],
        musts: [], nofs: [],
        uniq: false, uniqBy: [],
      }
    }
    return undefined
  }

  return undefined
}


function containerSettled(bag: any): boolean {
  return true === bag.done
}


// The child kinds `BagVal.gen` will attempt to generate. Anything else
// is residue: dropped when the key is optional, and a bag-level error
// otherwise.
function genable(child: any): boolean {
  return true === child.isScalar || true === child.isMap ||
    true === child.isList || true === child.isPref ||
    true === child.isRef || true === child.isDisjunct ||
    true === child.isNil ||
    undefined !== sizingResidue(child)
}


function emittedMembers(bag: any, ctx: AontuContext, keys?: string[]):
  any[] | undefined {
  const out: any[] = []

  let entries = items(bag.peg)
  if (bag.isMap) {
    entries = entries
      .slice()
      .sort((a: any, b: any) => cmpCodePoint(String(a[0]), String(b[0])))
  }

  for (const item of entries) {
    const key = item[0]
    const child: any = item[1]

    // Inside `hide()` a member shares its container's mark, and counts.
    if ((child.mark.type && !bag.mark.type) || (child.mark.hide && !bag.mark.hide)) {
      continue
    }

    const optional = bag.optionalKeys.includes('' + key)

    if (optional && true === ctx.noFill) {
      continue
    }

    if (!genable(child)) {
      if (optional) {
        continue
      }
      return undefined
    }

    const cval = child.gen(ctx.clone({ err: [], collect: true }))

    if (undefined === cval || (optional && empty(cval))) {
      continue
    }

    out.push(child)
    keys?.push('' + key)
  }

  return out
}


// A float is read through its shortest rendering: divisibility, unlike
// order, does not survive binary rounding, and the double nearest 0.3 is
// no multiple of 0.1.
function decimalOf(v: any): Scaled {
  if (Float !== leafMarker(v)) {
    return scaledOfNumeric(v)
  }
  const [m, e] = (v.peg as number).toExponential().split('e')
  const [whole, frac = ''] = m.split('.')
  return { unscaled: BigInt(whole + frac), scale: frac.length - Number(e) }
}


function divides(d: Scaled, v: Scaled): boolean {
  const s = Math.max(d.scale, v.scale)
  return 0n === (v.unscaled * 10n ** BigInt(s - v.scale)) %
    (d.unscaled * 10n ** BigInt(s - d.scale))
}


function isMultipleOf(v: any, d: any): boolean {
  return divides(decimalOf(d), decimalOf(v))
}


function dedupMults(ms: any[]): any[] {
  const sorted = [...ms].sort((a: any, b: any) =>
    cmpScaled(decimalOf(a), decimalOf(b)) || towerRank(a) - towerRank(b))
  const out: any[] = []
  for (const m of sorted) {
    if (0 === out.length ||
      0 !== cmpScaled(decimalOf(out[out.length - 1]), decimalOf(m))) {
      out.push(m)
    }
  }
  return out
}


function sortedByCanon(vs: any[]): any[] {
  return [...vs].sort((a: any, b: any) => cmpCodePoint(a.canon, b.canon))
}


function nofCanon(n: NofAtom): string {
  return 'nof(' + [canonState(n.count),
    ...n.branches.map((b: any) => b.canon)].join(',') + ')'
}


function dedupNofs(ns: NofAtom[]): NofAtom[] {
  const byCanon = new Map<string, NofAtom>()
  for (const n of ns) {
    const key = nofCanon(n)
    if (!byCanon.has(key)) {
      byCanon.set(key, n)
    }
  }
  return [...byCanon.keys()].sort(cmpCodePoint)
    .map((key) => byCanon.get(key) as NofAtom)
}


function whenCanon(w: WhenAtom): string {
  return 'when(' + [w.c, w.t, ...(undefined === w.e ? [] : [w.e])]
    .map((v: any) => v.canon).join(',') + ')'
}


function dedupWhens(ws: WhenAtom[]): WhenAtom[] {
  const byCanon = new Map<string, WhenAtom>()
  for (const w of ws) {
    const key = whenCanon(w)
    if (!byCanon.has(key)) {
      byCanon.set(key, w)
    }
  }
  return [...byCanon.keys()].sort(cmpCodePoint)
    .map((key) => byCanon.get(key) as WhenAtom)
}


// Without a count, `contains` asks for one admitted member at least.
// A cover is a trial and the record of what it reaches: `keys` a key
// schema, `prefix` a list length, `items` a member schema, `covers` the
// pairs read where it applies and `else` the record read where it does not.
function restCovers(args: any[]): RestCover[] | undefined {
  const out: RestCover[] = []
  for (let i = 0; i < args.length; i += 2) {
    const rec = restRecord(args[i + 1])
    if (undefined === rec) {
      return undefined
    }
    out.push({ trial: args[i], rec, src: args[i + 1] })
  }
  return out.sort((a, b) => cmpCodePoint(coverCanon(a), coverCanon(b)))
}


function coverCanon(c: RestCover): string {
  return c.trial.canon + ',' + c.src.canon
}


function restRecord(v: any): RestRecord | undefined {
  if (true !== v.isMap || Object.keys(v.peg).some((k) =>
    !['keys', 'prefix', 'items', 'covers', 'else'].includes(k))) {
    return undefined
  }
  const { keys, prefix, items, covers, else: other } = v.peg
  const p = true === prefix?.isInteger || true === prefix?.isBigInteger ?
    BigInt(prefix.peg) : undefined
  if ((undefined !== prefix && (undefined === p || p < 0n)) ||
    (undefined !== covers && (true !== covers.isList ||
      0 !== covers.peg.length % 2))) {
    return undefined
  }
  const nested = undefined === covers ? [] : restCovers(covers.peg)
  const alt = undefined === other ? undefined : restRecord(other)
  if (undefined === nested || (undefined !== other && undefined === alt)) {
    return undefined
  }
  return { keys, prefix: p, items, covers: nested, else: alt }
}


function restCanon(r: RestAtom): string {
  return 'rest(' + [r.t.canon, ...r.covers.map(coverCanon)].join(',') + ')'
}


function dedupRests(rs: RestAtom[]): RestAtom[] {
  const byCanon = new Map<string, RestAtom>()
  for (const r of rs) {
    const key = restCanon(r)
    if (!byCanon.has(key)) {
      byCanon.set(key, r)
    }
  }
  return [...byCanon.keys()].sort(cmpCodePoint)
    .map((key) => byCanon.get(key) as RestAtom)
}


function atLeastOne(): ConstraintState {
  return { ...countBase(), lo: { v: countVal(1), open: false } }
}


function containsCanon(a: ContainsAtom): string {
  return 'contains(' + a.c.canon + ',' + canonState(a.count) + ')'
}


function dedupContains(cs: ContainsAtom[]): ContainsAtom[] {
  const byCanon = new Map<string, ContainsAtom>()
  for (const a of cs) {
    const key = containsCanon(a)
    if (!byCanon.has(key)) {
      byCanon.set(key, a)
    }
  }
  return [...byCanon.keys()].sort(cmpCodePoint)
    .map((key) => byCanon.get(key) as ContainsAtom)
}


// A count of admitted members only grows as members are tried, so past
// the upper bound it is refused for good.
function countExceeded(count: ConstraintState, a: number): boolean {
  return null != count.hi &&
    !stateAdmits({ ...count, lo: undefined, neqs: [] }, countVal(a))
}


function countSettled(count: ConstraintState, a: number): boolean {
  return countExceeded(count, a) || (null == count.hi &&
    0 === count.neqs.length && stateAdmits(count, countVal(a)))
}


// The counts of admitting branches, from none to all of them, that an
// atom accepts: what the export names its keyword by.
function nofCounts(n: NofAtom): number[] {
  const out: number[] = []
  for (let i = 0; i <= n.branches.length; i++) {
    if (stateAdmits(n.count, countVal(i))) {
      out.push(i)
    }
  }
  return out
}


// No branch left to try can move the verdict: every count from `a` to
// `a + r` answers alike.
function settledCount(count: ConstraintState, a: number, r: number): boolean {
  const first = stateAdmits(count, countVal(a))
  for (let i = 1; i <= r; i++) {
    if (stateAdmits(count, countVal(a + i)) !== first) {
      return false
    }
  }
  return true
}


function dedupSortedRes(res: ReAtom[]): ReAtom[] {
  const sorted = [...res].sort((a, b) => cmpCodePoints(a.src, b.src))
  const out: ReAtom[] = []
  for (const r of sorted) {
    if (0 === out.length || out[out.length - 1].src !== r.src) {
      out.push(r)
    }
  }
  return out
}


class MinConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'min' }, ctx)
  }
}

class MaxConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'max' }, ctx)
  }
}

class AboveConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'above' }, ctx)
  }
}

class BelowConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'below' }, ctx)
  }
}

class NeqConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'neq' }, ctx)
  }
}

class ReConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 're' }, ctx)
  }
}

class MultipleConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'multiple' }, ctx)
  }
}

class MustConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'must' }, ctx)
  }
}

class NofConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'nof' }, ctx)
  }
}

class WhenConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'when' }, ctx)
  }
}

class ContainsConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'contains' }, ctx)
  }
}

class RestConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'rest' }, ctx)
  }
}

class LenConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'len' }, ctx)
  }
}

class UniqueConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'unique' }, ctx)
  }
} /* node:coverage ignore next 28 */


export {
  normaliseRe,
  // Exported for the subsumption query (G3, ts/src/subsume.ts): the
  // residual-vs-residual and residual-vs-scalar rules live here beside
  // the compare machinery they reuse.
  constraintSubsumesConstraint,
  constraintAdmitsScalar,
  nofCounts,
  restCanon,
  ConstraintVal,
  MinConstraintVal,
  MaxConstraintVal,
  AboveConstraintVal,
  BelowConstraintVal,
  NeqConstraintVal,
  MultipleConstraintVal,
  ReConstraintVal,
  LenConstraintVal,
  UniqueConstraintVal,
  MustConstraintVal,
  NofConstraintVal,
  WhenConstraintVal,
  ContainsConstraintVal,
  RestConstraintVal,
}
