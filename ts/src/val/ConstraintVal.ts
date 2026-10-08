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
  items,
  canonRiders,
} from '../utility'

import { empty, repathInstance } from './Val'

import { cmpCodePoint } from '../keyorder'

import { ConjunctVal } from './ConjunctVal'
import { sizingResidue } from './BagVal'
import { NilVal } from './NilVal'
import { admitsSettled, ownJson } from './admission'

import { top } from './top'

import { unite, withDepth } from '../unify'

import { IntegerVal } from './IntegerVal'

import { makeNilErr } from '../err'
import { codeClass } from '../hints'

import { FeatureVal } from './FeatureVal'

import {
  BigDecimal,
  BigInteger,
  Float,
  Integer,
  Path,
} from './ScalarKindVal'

import {
  cmpNumeric,
  cmpCodePoints,
  cmpScaled,
  towerRank,
  scaledOfNumeric,
  scaledOfShown,
  scaledIsMultiple,
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
  count: ConstraintState  // over the integers, as len()'s count is
  cs: any[]               // canon-sorted, and never deduplicated
}

type WhenAtom = { c: any, t: any, e?: any }

type ContainsAtom = {
  c: any                  // the trial schema a member must meet
  count: ConstraintState  // over the integers, at least one unless written
}

type ConstraintState = {
  domain?: 'number' | 'string'
  kind?: any      // numeric leaf marker (Integer | Float | ...) or undefined
  lo?: Bound
  hi?: Bound
  neqs: any[]     // excluded scalars, identity per leaf+value
  mults?: any[]   // divisors, each a positive number (multiple())
  res: ReAtom[]   // accumulated patterns, sorted by source (never simplified)
  count?: ConstraintState  // the COUNT residual (len()), itself a residual
                           // over the integer domain -- the count atom reuses
                           // this same algebra recursively
  uniq: boolean
  uniqBy: string[]  // ... and distinct ON EACH OF THESE KEYS
                    // (unique(k)), sorted and deduplicated
  musts: MustAtom[]  // Band B checks, kept in written order, never simplified
  nofs?: NofAtom[]   // Band B counts, canon-sorted, each canon once
  whens?: WhenAtom[] // Band B conditionals, canon-sorted, each canon once
  contains?: ContainsAtom[] // member counts, canon-sorted, each canon once
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
  return 'len' === atom || 'unique' === atom || 'contains' === atom ||
    BAND_B.includes(atom)
}


const BAND_B = ['must', 'nof', 'when']

// The atoms whose arguments are trial schemas, which may not move.
const TRIAL_ATOMS = [...BAND_B, 'contains']


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
      this.mults = spec.state.mults ?? []
      // A state built by an embedder (or by a per-port test) may predate
      // the pattern field; an absent one means "no patterns", not undefined.
      this.res = spec.state.res ?? []
      this.count = spec.state.count
      this.uniq = spec.state.uniq ?? false
      this.uniqBy = spec.state.uniqBy ?? []
      this.musts = spec.state.musts ?? []
      this.nofs = spec.state.nofs ?? []
      this.whens = spec.state.whens ?? []
      this.contains = spec.state.contains ?? []
      this.invalid = spec.state.invalid
      this.nonEmpty = spec.state.nonEmpty
      this.emptyOk = spec.state.emptyOk
      this.pathKind = spec.state.pathKind
    }
    else if (spec.atom) {
      const args = atomArgs(spec.atom, (spec.peg as any[]) ?? [])
      if (TRIAL_ATOMS.includes(spec.atom) && args.some((a: any) => holdsMove(a))) {
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
      0 < this.musts.length + this.nofs.length + this.whens.length +
      this.contains.length ||
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
      const arg = countArgState(args[0])
      if (null == arg) {
        return bad('invalid-arg')
      }
      const count = meetCount(countBase(), arg)
      if (stateEmpty(count)) {
        return bad('constraint')
      }
      this.nofs = [{ count, cs: canonSorted(args.slice(1)) }]
      return
    }

    if ('when' === atom) {
      this.whens = [{ c: args[0], t: args[1], e: args[2] }]
      return
    }

    if ('contains' === atom) {
      const arg = 1 === args.length ? atLeastOne() : countArgState(args[1])
      if (null == arg) {
        return bad('invalid-arg')
      }
      const count = meetCount(countBase(), arg)
      if (stateEmpty(count)) {
        return bad('constraint')
      }
      this.contains = [{ c: args[0], count }]
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
      if (!numericLeaf(a) || scaledOfShown(a).unscaled <= 0n) {
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
      out = null != this.domain ? this.fail(ctx, peer) :
        new ConjunctVal({ peg: [this, peer] }, ctx)
    }
    /* node:coverage ignore next 12 */
    else {
      out = this.fail(ctx, peer)
    }

    ctx.explain && explainClose(te, out)

    return out
  }


  private settle(peer: Val, ctx: AontuContext): Val {
    const TOP = top()
    const pend = this.pending as { atom: string, args: any[] }

    let settled = true
    const args: any[] = []
    for (const [i, arg] of pend.args.entries()) {
      let next = arg
      if (('nof' === pend.atom && 0 < i) || 'when' === pend.atom ||
        ('contains' === pend.atom && 0 === i)) {
        next = trialArg(ctx, arg, this.path)
      }
      else if (true !== arg?.done) {
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
    // No nil-peer arm: `unite` returns a nil operand before dispatching
    // to any Val's unify (ts/src/unify.ts), so a nil never reaches here
    // — and were one to, the conjunct below folds to it unchanged.
    return new ConjunctVal({ peg: [again, peer] }, ctx)
  }


  // Membership: the peer scalar passes every part of the residual, or
  // the whole meet is a located conflict.
  private admit(peer: any, ctx: AontuContext): Val {
    // No scalar has members, so a `unique()` residual admits none --
    // and neither does a `unique(k)` or a `contains` one.
    if (this.uniq || 0 < this.uniqBy.length + this.contains.length) {
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
    const bad = this.checkMusts(peer, ctx, true)
    if (null != bad) {
      return bad
    }
    return this.checkNofs(peer, ctx) ?? this.checkWhens(peer, ctx) ?? peer
  }


  private checkMusts(
    peer: any, ctx: AontuContext, final?: boolean): Val | undefined {
    for (const m of this.musts) {
      const trial = ctx.clone({ err: [], collect: true })
      let got: any = unite(trial, m.v.clone(trial), peer.clone(trial), 'must')
      const residue = sizingResidue(got)
      if (undefined !== residue) {
        if (true !== final) {
          continue
        }
        got = residue.con.settleContainer(residue.bag, trial)
      }
      if (true === (got as any)?.isNil || 0 < trial.err.length) {
        return makeNilErr(ctx, 'must', this, peer, undefined, {
          message: m.msg.peg,
          expected: m.v.canon,
          actual: peer.canon,
        })
      }
    }
    return undefined
  }


  // The branch the condition picks must admit the peer; no else passes.
  private checkWhens(peer: any, ctx: AontuContext): Val | undefined {
    const own = 0 === this.whens.length ? undefined : ownJson(peer, ctx)
    if (undefined === own) {
      return undefined
    }
    for (const w of this.whens) {
      const holds = admitsSettled(ctx, w.c, peer, own)
      const branch = holds ? w.t : w.e
      if (undefined !== branch && !admitsSettled(ctx, branch, peer, own)) {
        return makeNilErr(ctx, 'when', this, peer, undefined, {
          expected: whenCanon(w),
          actual: peer.canon,
          branch: holds ? 'then' : 'else',
          condition: holds ? 'admits' : 'does not admit',
        })
      }
    }
    return undefined
  }


  // Every branch is tried; the number that admit must be one the count admits.
  private checkNofs(peer: any, ctx: AontuContext): Val | undefined {
    const own = 0 === this.nofs.length ? undefined : ownJson(peer, ctx)
    if (undefined === own) {
      return undefined
    }
    for (const n of this.nofs) {
      const verdicts = n.cs.map((c: any) => admitsSettled(ctx, c, peer, own))
      const k = verdicts.filter((v: boolean) => v).length
      if (!stateAdmits(n.count, countVal(k))) {
        return makeNilErr(ctx, 'nof', this, peer, undefined, {
          expected: nofCanon(n),
          actual: peer.canon,
          count: countCanon(n.count),
          admitted: String(k),
          branches: n.cs.map((c: any, i: number) =>
            c.canon + (verdicts[i] ? ' admits' : ' refuses')).join('; '),
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
    // A scalar-domain residual has no reading over a container.
    if (null != this.domain) {
      return this.fail(ctx, peer)
    }
    // Not yet settled: the container, or an optional child, may still
    // resolve, so the member set is not final. Defer rather than decide
    // — the same discipline OpBaseVal follows for a non-concrete operand.
    // At generation nothing more arrives, and what never settled is
    // read as it stands.
    if (!containerSettled(peer) && true !== final) {
      this.dc = 0
      return new ConjunctVal({ peg: [this, peer] }, ctx)
    }

    const bad = this.checkMusts(peer, ctx, final) ?? (true === final ?
      this.checkNofs(peer, ctx) ?? this.checkWhens(peer, ctx) : undefined)
    if (null != bad) {
      return bad
    }

    if (!this.uniq && 0 === this.uniqBy.length + this.contains.length &&
      null == this.count) {
      if (true === final ||
        0 === this.musts.length + this.nofs.length + this.whens.length) {
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
      if (0 < count.neqs.length + multsOf(count).length && !stateAdmits(
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

    for (const k of this.contains) {
      const matched = countVal(containsMatches(ctx, k, members).length)
      if ((null != k.count.hi && !stateAdmits({ ...k.count, lo: undefined }, matched)) ||
        (0 < k.count.neqs.length + multsOf(k.count).length &&
          !stateAdmits({ ...k.count, lo: undefined, hi: undefined }, matched)) ||
        (true === final && !stateAdmits(k.count, matched))) {
        return this.fail(ctx, peer)
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
    const spent = true === final ||
      (0 === this.musts.length + this.nofs.length + this.whens.length +
        this.contains.length && !this.uniq && 0 === this.uniqBy.length &&
      (null == count ||
        (null == count.hi && 0 === count.neqs.length + multsOf(count).length &&
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

    // A Band B atom asserts nothing about a kind it does not test, so
    // the boolean kind stays beside a residual that holds only those.
    if (Boolean === marker && null == this.domain && null == this.count &&
      !this.uniq && 0 === this.uniqBy.length + this.contains.length) {
      return new ConjunctVal({ peg: [this, peer] }, ctx)
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
    merged.nofs = mergeNofs([...this.nofs, ...peer.nofs])
    merged.whens = byCanon([...this.whens, ...peer.whens], whenCanon)
    merged.contains = byCanon([...this.contains, ...peer.contains], containsCanon)
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
  // sorted), re, length, unique. No spaces; reparses to a conjunct that
  // normalises back to this exact residual.
  get canon() {
    if (null != this.pending) {
      // A pending atom has no residual yet, so canon renders the call as
      // written — the same shape FuncBaseVal renders while deferring.
      return this.pending.atom +
        '(' + this.pending.args.map((a: any) => canonRiders(a)).join(',') + ')'
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


// Divisors sort by the value they show, and one value is kept once: the
// atoms accumulate, and no least common multiple is synthesised.
function dedupMults(ms: any[]): any[] {
  const sorted = [...ms].sort((a: any, b: any) =>
    cmpScaled(scaledOfShown(a), scaledOfShown(b)) || towerRank(a) - towerRank(b))
  return sorted.filter((m: any, i: number) =>
    0 === i || 0 !== cmpScaled(scaledOfShown(sorted[i - 1]), scaledOfShown(m)))
}


function multsOf(s: ConstraintState): any[] {
  return s.mults ?? []
}


function isMultiple(peer: any, d: any): boolean {
  return scaledIsMultiple(scaledOfShown(peer), scaledOfShown(d))
}


// Integral: an integer leaf, or a whole divisor, whose multiples are whole.
function integralState(s: ConstraintState): boolean {
  return Integer === s.kind || BigInteger === s.kind ||
    multsOf(s).some((m: any) => scaledIsIntegral(scaledOfShown(m)))
}


function canonSorted(vals: any[]): any[] {
  return [...vals].sort((a: any, b: any) => cmpCodePoint(canonRiders(a), canonRiders(b)))
}


// Each canon once: equal checks over one value are one check.
function byCanon<T>(atoms: T[], canon: (a: T) => string): T[] {
  const out = new Map<string, T>()
  for (const a of atoms) {
    out.set(canon(a), a)
  }
  return [...out.keys()].sort(cmpCodePoint).map((k) => out.get(k) as T)
}


function mergeNofs(nofs: NofAtom[]): NofAtom[] {
  return byCanon(nofs, nofCanon)
}


// A count of at least one is the default, and is not written.
function containsCanon(k: ContainsAtom): string {
  const c = k.count
  const one = null != c.lo && !c.lo.open && 0 === cmpVal('number', c.lo.v, countVal(1)) &&
    null == c.hi && 0 === c.neqs.length + multsOf(c).length
  return 'contains(' + canonRiders(k.c) + (one ? '' : ',' + countCanon(c)) + ')'
}


function atLeastOne(): ConstraintState {
  return {
    domain: 'number', lo: { v: countVal(1), open: false },
    neqs: [], res: [], musts: [], uniq: false, uniqBy: [],
  }
}


// The members the trial schema admits, each settled member tried alone.
function containsMatches(ctx: AontuContext, k: ContainsAtom, members: any[]): any[] {
  return members.filter((m: any) => {
    const own = ownJson(m, ctx)
    return undefined !== own && admitsSettled(ctx, k.c, m, own)
  })
}


function whenCanon(w: WhenAtom): string {
  return 'when(' + [w.c, w.t, ...(undefined === w.e ? [] : [w.e])]
    .map((v: any) => canonRiders(v)).join(',') + ')'
}


// A count is written bare where it is one integer, as `nof(1, …)` reads.
function countCanon(c: ConstraintState): string {
  const point = null != c.lo && null != c.hi && !c.lo.open && !c.hi.open &&
    0 === cmpVal('number', c.lo.v, c.hi.v)
  return point ? (c.lo as Bound).v.canon : canonState({ ...c, kind: undefined })
}


function nofCanon(n: NofAtom): string {
  return 'nof(' + [countCanon(n.count), ...n.cs.map((c: any) => canonRiders(c))].join(',') + ')'
}


// A trial schema settles apart from the document: one that conflicts
// admits nothing, while any other failure is the document's own.
function trialArg(ctx: AontuContext, arg: any, path: string[]): any {
  if (true === arg?.done) {
    return arg
  }
  const at = arg.clone(ctx)
  repathInstance(at, path)
  const tctx = ctx.clone({ err: [], collect: true })
  const next = withDepth(tctx, at, top(), () => at.unify(top(), tctx))
  const conflict = (e: any) =>
    '|:trial-nil' === e.why || 'conflict' === codeClass(e.why)
  if (0 === tctx.err.length || !tctx.err.every(conflict)) {
    for (const e of tctx.err) {
      ctx.adderr(e)
    }
    return next
  }
  return new NilVal({ why: 'nof' })
}


// The members of a list, map or disjunction; not a wrapper's one Val, as in Go.
function heldVals(v: any): any[] {
  const peg = v.peg
  return Array.isArray(peg) ? peg :
    null != peg && 'object' === typeof peg && true !== peg.isVal ?
      Object.values(peg) : []
}


function holdsNil(v: any): boolean {
  return true === v.isNil || heldVals(v).some((c: any) => holdsNil(c))
}


function holdsMove(v: any): boolean {
  return (true === v.isFunc && 'move' === v.funcname?.()) ||
    heldVals(v).some((c: any) => holdsMove(c))
}


function atomArgs(atom: string, args: any[]): any[] {
  if (('neq' === atom || BAND_B.includes(atom)) && 1 === args.length &&
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
  else if ('string' === s.domain && (true === s.nonEmpty ||
    (null == s.lo && null == s.hi && 0 === s.neqs.length &&
      0 === s.res.length && true !== s.emptyOk))) {
    parts.push('string')
  }
  else if ('number' === s.domain && null == s.lo && null == s.hi &&
    0 === s.neqs.length + multsOf(s).length) {
    parts.push('number')
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
  for (const m of multsOf(s)) {
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
  for (const k of s.contains ?? []) {
    parts.push(containsCanon(k))
  }
  for (const m of s.musts) {
    parts.push('must(' + canonRiders(m.v) + ',' + m.msg.canon + ')')
  }
  for (const n of s.nofs ?? []) {
    parts.push(nofCanon(n))
  }
  for (const w of s.whens ?? []) {
    parts.push(whenCanon(w))
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
    neqs: any[], res: ReAtom[], count?: ConstraintState, uniq: boolean,
    uniqBy: string[],
    musts: MustAtom[],
    nofs?: NofAtom[],
    whens?: WhenAtom[],
    contains?: ContainsAtom[],
  },
  s: {
    domain?: 'number' | 'string', kind?: any, lo?: Bound, hi?: Bound,
    neqs: any[], res: ReAtom[], count?: ConstraintState, uniq: boolean,
    uniqBy: string[],
    musts: MustAtom[],
  },
): boolean | 'undecided' {
  // A Band B predicate or a member count on the general side makes its
  // admitted set unknowable; an extra `must` on the SPECIFIC side only
  // narrows it and is ignored.
  if (0 < g.musts.length + (g.nofs ?? []).length + (g.whens ?? []).length +
    (g.contains ?? []).length) {
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

  // A general divisor holds where some specific divisor is its multiple,
  // or where the specific side is integral and 1 is.
  const one = new IntegerVal({ peg: 1 })
  for (const a of multsOf(g as ConstraintState)) {
    if (!multsOf(s as ConstraintState).some((b: any) => isMultiple(b, a)) &&
      !(integralState(s as ConstraintState) && isMultiple(one, a))) {
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

// A numeric kind meets the query as the residual it names.
function constraintSubsumesKind(g: ConstraintVal, marker: any): boolean {
  const leaf = Integer === marker || Float === marker ||
    BigInteger === marker || BigDecimal === marker
  return (leaf || Number === marker) && true === constraintStateSubsumes(g as any, {
    domain: 'number', kind: leaf ? marker : undefined,
    neqs: [], res: [], musts: [], uniq: false, uniqBy: [],
  })
}

function constraintAdmitsScalar(
  g: ConstraintVal, scalar: any): boolean | 'undecided' {
  if (0 < g.musts.length + g.nofs.length + g.whens.length) {
    return 'undecided'
  }
  if (g.uniq || 0 < g.uniqBy.length + g.contains.length) {
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
    // A residual with no domain admits any scalar its atoms can rule on.
    // A sizing atom reads no boolean or null, which have no order, length
    // or members; a Band B check reads anything.
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
  for (const m of multsOf(s)) {
    if (!isMultiple(peer, m)) {
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

  const integral = integralState(s)

  // Integral gap: an integer-narrowed interval containing no whole
  // number is empty (integer & above(1) & below(2)).
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
    res: [],
    musts: [],
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
    mults: dedupMults([...multsOf(a), ...multsOf(b)]),
    res: [],
    musts: [],
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
      neqs: [], res: [], musts: [], uniq: false, uniqBy: [],
    }
  }

  if (true === arg?.isConstraint) {
    const c = arg as ConstraintVal
    // A pattern, a sizing atom or a string bound inside a count is not
    // a count constraint at all, and neither is a broken one.
    if (null != c.invalid || 0 < c.res.length || c.uniq ||
      0 < c.uniqBy.length || null != c.count ||
      'number' !== c.domain) {
      return undefined
    }
    return {
      domain: 'number',
      kind: c.kind,
      lo: c.lo,
      hi: c.hi,
      neqs: [...c.neqs],
      mults: [...c.mults],
      res: [], musts: [], uniq: false, uniqBy: [],
    }
  }

  if (true === arg?.isScalarKind) {
    const marker = arg.peg
    if (Number === marker) {
      return {
        domain: 'number', neqs: [], res: [], musts: [],
        uniq: false, uniqBy: [],
      }
    }
    if (Integer === marker || Float === marker ||
      BigInteger === marker || BigDecimal === marker) {
      return {
        domain: 'number', kind: marker, neqs: [], res: [], musts: [],
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


function emittedMembers(bag: any, ctx: AontuContext): any[] | undefined {
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

    if (child.mark.type || child.mark.hide || bag.aliasKeys?.includes('' + key)) {
      continue
    }

    const optional = bag.optionalKeys.includes('' + key)

    if (!genable(child)) {
      if (optional) {
        continue
      }
      return undefined
    }

    const gctx = ctx.clone({ err: [], collect: true })
    const cval = child.gen(gctx)

    // A required member that fails is a member: its own failure is the
    // finding, so the count does not decide on the members that remain.
    if (undefined === cval && !optional && 0 < gctx.err.length) {
      return undefined
    }
    if (undefined === cval || (optional && empty(cval))) {
      continue
    }

    out.push(child)
  }

  return out
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

class MultipleConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'multiple' }, ctx)
  }
}

class ReConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 're' }, ctx)
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

class ContainsConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'contains' }, ctx)
  }
}

class WhenConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'when' }, ctx)
  }
}

class LenConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'len' }, ctx)
  }
}

// Which counts from none to every branch a nof atom admits.
function nofCounts(n: NofAtom): boolean[] {
  return [...n.cs, undefined].map((_c: any, i: number) => stateAdmits(n.count, countVal(i)))
}

class UniqueConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'unique' }, ctx)
  }
} /* node:coverage ignore next 26 */


export {
  normaliseRe,
  nofCounts,
  // Exported for the subsumption query (G3, ts/src/subsume.ts): the
  // residual-vs-residual and residual-vs-scalar rules live here beside
  // the compare machinery they reuse.
  constraintSubsumesConstraint,
  constraintSubsumesKind,
  constraintAdmitsScalar,
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
}
