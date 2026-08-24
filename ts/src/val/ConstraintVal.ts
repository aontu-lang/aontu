/* Copyright (c) 2025 Richard Rodger, MIT License */

/*
 * The constraint algebra's residual value (G1 phase 1: bounds and neq;
 * docs/reference-language.md, "The constraint algebra"). A
 * ConstraintVal is the normal form of any meet of Band A atoms over
 * one domain: an interval (endpoints with open/closed flags), an
 * exclusion set (from neq), and an optional numeric-leaf kind
 * narrowing (from meeting `integer` etc.). Its rules, decided in
 * phase 0 and mirrored by go/constraint.go:
 *
 *  - Order is a property of the number line: a numeric bound admits
 *    ANY numeric leaf at an admissible position, compared exactly
 *    (numcmp.ts), and never narrows the peer's leaf by itself.
 *  - Endpoints keep their written leaf (canon renders the stored
 *    scalar); two endpoints at the SAME point keep the tower-lowest
 *    leaf. No endpoint rewriting, ever (lazy endpoints).
 *  - neq excludes by scalar identity — leaf AND value.
 *  - Emptiness is decided eagerly where it is exact: empty interval,
 *    integral gap under an integer/biginteger narrowing, point
 *    deletion under a narrowed leaf, domain mixing. Representability
 *    holes of the int64-window integer leaf are deliberately NOT
 *    modelled (sound — no false conflicts; incomplete — those
 *    contradictions surface against data), matching the algebra's
 *    regex-approximation philosophy.
 *  - Canonical atom order: kind, lower bound, upper bound, neq
 *    (arguments sorted); `parse(canon(v)) == v` holds because the
 *    reparse is a conjunct of atoms that normalises back to the
 *    identical residual.
 *
 * A constraint violation raises the registered `constraint` code
 * (class conflict), with the admissible set in NilVal.details.
 */

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
} from '../utility'

import { empty } from './Val'

import { cmpCodePoint } from '../keyorder'

import { ConjunctVal } from './ConjunctVal'

import { top } from './top'

import { unite, withDepth } from '../unify'

import { IntegerVal } from './IntegerVal'

import { makeNilErr } from '../err'

import { FeatureVal } from './FeatureVal'

import {
  BigDecimal,
  BigInteger,
  Float,
  Integer,
} from './ScalarKindVal'

import {
  cmpNumeric,
  cmpCodePoints,
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
  v: any          // the stored pattern StringVal (canon renders the literal)
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

type ConstraintState = {
  domain?: 'number' | 'string'
  kind?: any      // numeric leaf marker (Integer | Float | ...) or undefined
  lo?: Bound
  hi?: Bound
  neqs: any[]     // excluded scalars, identity per leaf+value
  res: ReAtom[]   // accumulated patterns, sorted by source (never simplified)
  count?: ConstraintState  // the COUNT residual (length()), itself a residual
                           // over the integer domain -- the count atom reuses
                           // this same algebra recursively
  uniq: boolean   // members must be pairwise distinct (unique())
  musts: MustAtom[]  // Band B checks, kept in written order, never simplified
  clash?: boolean // a kind disagreement inside a length() argument, recorded
                  // rather than raised: the argument's own meet has no
                  // ctx to report through, so emptiness carries the news
  invalid?: string  // why-code when the atom's arguments were unusable
}


// THE PATTERN SUBSET, AND HOW IT IS ENFORCED (G1 phase 2; ADR-003).
//
// `re(p)` must mean the same thing in both engines and cost about the
// same, and the two host engines guarantee neither: TypeScript compiles
// with JavaScript's backtracking RegExp, Go with RE2 — a different
// language in a different complexity class, over a different alphabet.
//
// The enforcement is NORMALISATION, not refusal (ADR-003). Every
// construct whose expansion is engine-defined is rewritten here, by
// this function, into an explicit form that cannot be read two ways;
// only the rewritten pattern reaches a host engine. The alternative —
// refusing everything that might differ — was tried first and leaked
// three times, because its correctness depended on this comment knowing
// every difference between two large engines.
//
// Aontu therefore DEFINES the abbreviations rather than inheriting
// either host's. The definitions are deliberately the small ASCII ones,
// because a config value containing U+00A0 is a mistake to catch, not a
// space to accept silently:
//
//     \d  [0-9]                 \D  [^0-9]
//     \w  [0-9A-Za-z_]          \W  [^0-9A-Za-z_]
//     \s  [ \t\n\r\f\v]         \S  [^ \t\n\r\f\v]
//     .   [^\n]
//     \A  ^                     \z  $
//
// Neither host agreed with all of these before rewriting: JavaScript's
// \s also matches U+00A0 and other Unicode spaces, RE2's omits \v, and
// the two `.` sets differ by \r and the Unicode line separators. After
// rewriting, both engines see one explicit class and cannot disagree.
//
// What is still REFUSED, and why refusal is right for these:
//
//  1. Constructs one engine simply lacks — backreferences and
//     lookaround (not in RE2, and not expressible as regular
//     expressions at all), POSIX classes, `\p{...}`, `\x{...}`, `\u`.
//     There is nothing to normalise them TO.
//  2. `(?` other than `(?:` — named groups are spelled differently
//     (`(?P<n>` in RE2, `(?<n>` in JavaScript) and inline flags change
//     the meaning of everything after them.
//  3. A quantifier applied to a group containing a quantifier or an
//     alternation. This one is about TIME, not meaning: `(a+)+$`
//     against twenty-nine characters takes 45 SECONDS in JavaScript
//     and 0.065s under RE2, and a regex match is counted by no
//     evaluator budget, so an untrusted schema could otherwise stall
//     the TypeScript evaluator indefinitely (docs/trust.md clause 2).
//     Normalisation cannot fix a complexity difference; only owning the
//     matcher could, which ADR-003 records as the future option.
//
// The alphabet is fixed separately, by compiling with the `u` flag:
// JavaScript otherwise matches UTF-16 code units where RE2 matches code
// points, so `^.$` accepted U+1D11E in Go and refused it in TypeScript.
//
// This function is mirrored statement for statement in go/constraint.go,
// and `test/spec/files/regex-corpus.txt` pins that the two produce
// byte-identical output for every pattern in a generated corpus.

// The largest repeat count Aontu's pattern language admits. RE2 caps a
// repeat at 1000 and refuses to compile past it, where JavaScript's
// backtracking engine accepts any count -- so `re("^a{1001}$")` was
// VALID in TypeScript and an `error` verdict in Go, a cross-port
// verdict flip on a schema an agent could be handed
// (status-2026-08-21.md section 4). Under ADR-003 the host's own
// compile failure must never be what a user sees, so the bound is
// Aontu's: at most RE_REPEAT_MAX, refused identically in both ports
// before either engine compiles. Nested products beyond the cap were
// already refused, by the quantified-group rule below.
const RE_REPEAT_MAX = 1000

// The normative expansions. These are Aontu's definitions, not either
// host's; both hosts are rewritten to them.
const RE_CLASS_DIGIT = '0-9'
const RE_CLASS_WORD = '0-9A-Za-z_'
const RE_CLASS_SPACE = ' \\t\\n\\r\\f\\v'

// Metacharacters that may be escaped to mean themselves, in both
// engines. `-` is handled separately: it is legal escaped only INSIDE a
// character class, because RE2 accepts `a\-b` and JavaScript's unicode
// mode makes it a syntax error.
const RE_ESCAPE_PUNCT = '\\.+*?()[]{}|^$/'

// Escapes passed through unchanged: the control characters, the ASCII
// word boundary, and `\xHH`. Each was probed in both engines.
const RE_ESCAPE_PASS = 'tnrfv'

// A counted quantifier `{n}`, `{n,}` or `{n,m}` starting at `src[at]`.
// Two rules, both about what the hosts do NOT share:
//
//  - A bound above RE_REPEAT_MAX: RE2 refuses to compile it, JavaScript
//    accepts it.
//  - A brace that does not open a well-formed counted quantifier at
//    all (`x{y}`, `a{`, `{,5}`): JavaScript compiled with the `u` flag
//    makes it a SYNTAX ERROR, while RE2 reads it as a literal brace, so
//    `re("^x{y}$")` was `constraint_pattern` in TypeScript and a plain
//    unresolved value in Go -- the same class of verdict flip as the
//    repeat cap, found by sweeping around it. A literal brace is
//    written escaped (`a\\{1001\\}`), which both engines share.
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
      ' literal "' + n + '" without a flag Aontu does not set', 0]
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

  // One frame per open group, recording whether it contains a quantifier
  // or an alternation. A group carrying either may not itself be
  // quantified; containment is transitive, so a frame hands its flags up
  // to its parent when it closes.
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
      i += 1 + extra
      continue
    }

    // A POSIX class opener, anywhere: the form lives inside an ordinary
    // class (`[[:alpha:]]`), and refusing it everywhere is one rule
    // rather than two.
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
      // Nothing to repeat. JavaScript under the `u` flag makes this a
      // SYNTAX ERROR, where RE2 quantifies the assertion happily and
      // matches, so `re("^{1}")` was `constraint_pattern` in
      // TypeScript and an accepted schema in Go. (`\b` and `\B`
      // quantify identically in both and are left alone.)
      if (afterAnchor) {
        return ['', 'a quantifier applied to `^` or `$`, which has ' +
          'nothing to repeat']
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

    // A `}` that closes no counted quantifier: JavaScript under `u`
    // refuses it as a lone quantifier bracket, RE2 reads it as a
    // literal. Written escaped inside a class (`[}]`) it is a literal
    // in both, which is the spelling that survives.
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


// Scalar identity: leaf AND value, the lattice's own rule (1 and 1.0
// are different scalars). Exact numeric comparison decides the value
// half for numeric leaves.
function sameScalar(a: any, b: any): boolean {
  if (numericLeaf(a) && numericLeaf(b)) {
    return towerRank(a) === towerRank(b) && 0 === cmpNumeric(a, b)
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


// Conjunct sort order for an atom that must see the WHOLE value.
// Every other value sorts below the container default (99999), so such
// an atom is the LAST term to fold: `a:length(2) a:{x:1} a:{y:2}` must
// count the MERGED map, and a constraint that folded at 50000 would
// count `{x:1}` alone and refuse the layering that is the whole point
// of the language.
//
// The order atoms keep the low slot: `min(2) & 1 & 2` may decide as
// soon as it sees a scalar, because meeting more scalars can only
// narrow. Meeting more containers GROWS the member set, which is why
// the two orders differ.
//
// Three atoms are late: `length` and `unique` (they count members), and
// `must` (an evaluate-only check against the finished value).
const LATE_CJO = 150000

function lateAtom(atom: string): boolean {
  return 'length' === atom || 'unique' === atom || 'must' === atom
}


class ConstraintVal extends FeatureVal {
  isConstraint = true
  cjo = 50000

  domain?: 'number' | 'string'
  kind?: any
  lo?: Bound
  hi?: Bound
  neqs: any[] = []
  res: ReAtom[] = []
  count?: ConstraintState
  uniq = false
  musts: MustAtom[] = []
  // An atom whose arguments have not settled yet (G1 phase 4). Held
  // until unify has a ctx to resolve them through; never present on a
  // residual.
  pending?: { atom: string, args: any[] }
  clash?: boolean
  invalid?: string
  invalidWhy?: string

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
      this.res = spec.state.res ?? []
      this.count = spec.state.count
      this.uniq = spec.state.uniq ?? false
      this.musts = spec.state.musts ?? []
      this.invalid = spec.state.invalid
    }
    else if (spec.atom) {
      const args = atomArgs(spec.atom, (spec.peg as any[]) ?? [])
      // An argument that is not yet concrete — a reference, an
      // arithmetic expression, a conjunct of atoms — makes the whole
      // atom PENDING rather than invalid (G1 phase 4). It is resolved
      // in unify, where there is a ctx to resolve through, and the
      // residual is built from the settled arguments. Only a settled
      // argument of the wrong shape is an `invalid-arg`.
      // The effectful-argument refusal happens HERE, on the written
      // form, and not in fromAtom: settling is what runs the effect, so
      // by the time fromAtom sees a settled `move($.b)` the move has
      // already happened and the argument is just its result.
      if ('must' === spec.atom && args.some((a: any) => holdsMove(a))) {
        this.invalid = 'invalid-arg'
      }
      else if (args.some((a: any) => true !== a?.done)) {
        this.pending = { atom: spec.atom, args }
      }
      else {
        this.fromAtom(spec.atom, args)
      }
    }

    if (null != this.count || this.uniq || 0 < this.musts.length ||
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


  // Normalise one atom call into state. Every argument here is already
  // SETTLED — the constructor routes an unsettled one to `pending` —
  // so a shape this cannot use is a genuine `invalid-arg`, not a
  // not-yet.
  private fromAtom(atom: string, args: any[]): void {
    // Mark the residual invalid. It answers NOTHING: every caller
    // spells its exit `return bad(...)` and none reads a value, so a
    // return type would be a value nobody consumes -- and a routine
    // that answers on some paths and not others is the shape a reader
    // (and a static analyser) has to stop and check.
    const bad = (why: string): void => {
      this.invalid = why
    }

    // `unique()` takes no argument: it is a property of the container,
    // not a comparison against a value. Arity is checked at parse, so a
    // written argument never reaches here.
    if ('unique' === atom) {
      this.uniq = true
      return
    }

    // `must(c, msg)` is Band B: an evaluate-only check against the
    // finished value, carrying the author's own message. It is KEPT,
    // never simplified and never consulted for emptiness or
    // subsumption — Band B is opaque by construction, which is exactly
    // what makes it the honest channel for a rule the algebra cannot
    // reason about (docs/reference-language.md, "Band B: `must`").
    if ('must' === atom) {
      if (2 !== args.length) {
        return bad('arg')
      }
      if (!stringLeaf(args[1])) {
        return bad('invalid-arg')
      }
      // A check carrying a nil can never be satisfied, so it is refused
      // as an ARGUMENT rather than left to fail against every value with
      // the author's message attached -- which would blame the data for
      // a mistake in the check. `must([1-x],m)` is the reachable case: a
      // degenerate expression leaves a nil inside the written list.
      if (holdsNil(args[0])) {
        return bad('invalid-arg')
      }
      // (An effectful argument is refused at construction, in the
      // constructor: by the time this arm sees a settled `move($.b)`
      // the move has already run.)
      this.musts = [{ v: args[0], msg: args[1] }]
      return
    }

    if ('neq' === atom) {
      if (0 === args.length) {
        return bad('arg')
      }
      let domain: 'number' | 'string' | undefined = undefined
      for (const a of args) {
        const d = numericLeaf(a) ? 'number' : stringLeaf(a) ? 'string' : undefined
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

    // `re` is the one atom whose argument is not an ORDER point: a
    // pattern is a membership test, so it takes the string domain
    // outright rather than inferring a domain from the argument's leaf.
    if ('re' === atom) {
      if (!stringLeaf(a)) {
        return bad('invalid-arg')
      }
      const src = a.peg as string
      // Normalise BEFORE compiling: the host engines only ever see a
      // pattern that cannot be read two ways (ADR-003).
      const [norm, why] = normaliseRe(src)
      if ('' !== why) {
        this.invalidWhy = why
        return bad('constraint_pattern')
      }
      let re: RegExp
      try {
        // The `u` flag is REQUIRED for parity, not an optimisation.
        // Without it JavaScript matches UTF-16 code units while RE2
        // matches code points, so `re("^.$")` accepted U+1D11E in Go
        // and refused it in TypeScript (and `^..$` did the reverse).
        // With it, `.` and every quantifier count code points in both.
        // It also makes JavaScript refuse the identity escapes this
        // scanner rejects by hand, which is defence in depth rather
        // than a substitute: RE2 accepts some of them, so the scanner
        // is what keeps the two ports agreeing.
        re = new RegExp(norm, 'u')
      }
      catch (e: any) {
        // The host engine refuses what the subset scanner passed — a
        // malformed quantifier, an unbalanced group. Same refusal under
        // the same code: the author gets one rule, not two. The message
        // is the host's, so it is NOT pinned by a shared row; the code
        // and the located frame are.
        this.invalidWhy = 'not a valid pattern'
        return bad('constraint_pattern')
      }
      this.domain = 'string'
      this.res = [{ v: a, src, norm, re }]
      return
    }

    // `length` is the other non-ORDER atom: its argument constrains the
    // COUNT, not the value, so it is itself a residual over the integer
    // domain (docs/reference-language.md, "`length` semantics"). It is
    // resolved HERE, at construction, by walking the written argument
    // rather than by unifying it: the func-paren handler builds atoms
    // without an AontuContext, so there is nothing to fold a nested
    // conjunct through. Walking is enough because a length argument is by
    // definition a meet of concrete Band A atoms; anything else (a
    // reference, an expression) is refused rather than deferred, the
    // same discipline min/max apply to their own arguments.
    if ('length' === atom) {
      const arg = countArgState(a)
      if (null == arg) {
        return bad('invalid-arg')
      }
      const inner = meetCount(countBase(), arg)
      this.count = inner
      // `length(min(5)&max(3))` is unsatisfiable with no peer in sight, so
      // it is refused at composition time like any other empty meet.
      if (stateEmpty(inner)) {
        return bad('constraint')
      }
      return
    }

    const domain = numericLeaf(a) ? 'number' : stringLeaf(a) ? 'string' : undefined
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

    if (null != this.pending) {
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
    /* node:coverage ignore next 12 */
    else {
      // Every other shape: no order, no membership, nothing to count —
      // a conflict of the constraint family. The ladder above is total
      // in practice: every remaining Val kind either sorts BELOW a
      // constraint in a conjunct (conjunct, disjunct, pref, ref) and so
      // drives the meet from its own side, or resolves to a
      // scalar/container before a constraint sees it (func, op, var,
      // expect). The arm is kept because "in practice" depends on the
      // cjo table, and a future value class would land here rather than
      // falling out of unify with no result.
      out = this.fail(ctx, peer)
    }

    ctx.explain && explainClose(te, out)

    return out
  }


  // Resolve a pending atom's arguments and, once they have all settled,
  // become the residual they describe (G1 phase 4).
  //
  // This is the residuation discipline FuncBaseVal already follows for
  // its own operands: push each unsettled argument one step by unifying
  // it with `top`, and if any is still moving, mark not-done and defer
  // — either as this same pending atom (against a `top` peer) or
  // wrapped with the peer in a conjunct the next pass will re-enter.
  // Nothing is decided from a half-resolved argument, which is what
  // keeps `min($.lo)` from reporting a conflict against a bound that
  // has not arrived yet.
  private settle(peer: Val, ctx: AontuContext): Val {
    const TOP = top()
    const pend = this.pending as { atom: string, args: any[] }

    let settled = true
    const args: any[] = []
    for (const arg of pend.args) {
      let next = arg
      if (true !== arg?.done) {
        // Charged to the depth budget: this recurses without going
        // through `unite`, so the counter would otherwise stay flat
        // while the stack grows (the rule FuncBaseVal follows).
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
    // No scalar has members, so a `unique()` residual admits none.
    if (this.uniq) {
      return this.fail(ctx, peer)
    }
    if (!stateAdmits(this, peer)) {
      return this.fail(ctx, peer)
    }
    if (null != this.count) {
      // Only a string among the scalars has a length, and it is counted
      // in CODE POINTS -- not UTF-16 units (this host's native count)
      // and not bytes (Go's). Iterating a string yields code points.
      if (!stringLeaf(peer)) {
        return this.fail(ctx, peer)
      }
      if (!stateAdmits(this.count, countVal([...peer.peg].length))) {
        return this.fail(ctx, peer)
      }
    }
    const bad = this.checkMusts(peer, ctx)
    if (null != bad) {
      return bad
    }
    return peer
  }


  // Band B, applied to a finished value. Each check is a plain
  // unification against a CLONE of the peer: `must` reports, it never
  // contributes: whatever the check would have added to the value is
  // discarded, and `peer` is returned untouched by the callers.
  //
  // The trial runs in an isolated collect context so a failing check
  // leaves nothing on the caller's error list — only the located nil
  // this returns, carrying the author's own message.
  private checkMusts(peer: any, ctx: AontuContext): Val | undefined {
    for (const m of this.musts) {
      const trial = ctx.clone({ err: [], collect: true })
      const got = unite(trial, m.v.clone(trial), peer.clone(trial), 'must')
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


  // Membership for a container peer. Only the SIZING atoms have anything
  // to say about a map or a list; every other atom is scalar-domain and
  // refuses one.
  //
  // The members that count are the members that GENERATE
  // (docs/reference-language.md, "`length` semantics"), and rather than
  // mirror generation's filter — type/hide marks, optional keys that
  // drop, empty optional values — this asks generation itself, in an
  // isolated collect context so nothing leaks into the caller's errors.
  // A mirror would be a second copy of a filter that has already grown
  // subtle, free to drift from it; asking is correct by construction.
  private admitContainer(peer: any, ctx: AontuContext): Val {
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

    const bad = this.checkMusts(peer, ctx)
    if (null != bad) {
      return bad
    }

    if (!this.uniq && null == this.count) {
      return peer
    }

    const members = emittedMembers(peer, ctx)
    if (null == members) {
      // The container cannot generate at all; its own error is the one
      // worth reporting, so pass it through untouched.
      return peer
    }

    if (null != this.count && !stateAdmits(this.count, countVal(members.length))) {
      return this.fail(ctx, peer)
    }

    if (this.uniq) {
      // Members compare by CANONICAL FORM, which reduces to scalar
      // identity for scalars (so [1, 1.0] is distinct) and gives
      // structural equality for container members without a second
      // rule. A generated value could not express the first: `1` and
      // `1.0` generate the same JSON number.
      const seen = new Set<string>()
      for (const m of members) {
        const key = m.canon
        if (seen.has(key)) {
          return this.fail(ctx, peer)
        }
        seen.add(key)
      }
    }

    return peer
  }


  // Meet with a kind: `number` (or `string` on the string domain) is
  // already implied by an ORDER atom's argument; a numeric LEAF narrows
  // the residual; anything else has an empty intersection with the
  // constraint's domain.
  //
  // A sizing residual (`length`, `unique`) has no domain of its own -- a
  // count says nothing about what is counted -- so a kind here SETS one
  // rather than merely agreeing with it: `string & length(3)` is a
  // three-character string, and `number & length(3)` is empty because a
  // number has no length (stateEmpty decides that, not this).
  private meetKind(peer: any, ctx: AontuContext): Val {
    const marker = peer.peg
    const merged = this.cloneState()

    if (Number === marker || String === marker) {
      const d = Number === marker ? 'number' : 'string'
      if (d === this.domain) {
        return this
      }
      if (null != this.domain) {
        return this.fail(ctx, peer)
      }
      merged.domain = d
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

    const d = (this.domain ?? peer.domain) as 'number' | 'string'
    const merged = this.cloneState()
    merged.domain = d
    merged.kind = this.kind ?? peer.kind
    merged.lo = tighter(d, this.lo, peer.lo, true)
    merged.hi = tighter(d, this.hi, peer.hi, false)
    merged.neqs = dedupSorted(d, [...this.neqs, ...peer.neqs])
    merged.res = dedupSortedRes([...this.res, ...peer.res])
    // `length(c1) & length(c2)` is `length(c1 & c2)`: the count atom reuses
    // numeric algebra recursively, over the counts rather than the
    // values.
    merged.count = null == this.count ? peer.count :
      null == peer.count ? this.count : meetCount(this.count, peer.count)
    // `unique()` is idempotent: two of them are one.
    merged.uniq = this.uniq || peer.uniq
    // Band B checks accumulate in written order and are never merged,
    // deduplicated or reordered: each carries its own author message,
    // and two checks with the same shape may still say different things.
    merged.musts = [...this.musts, ...peer.musts]

    return this.finish(merged, ctx, peer)
  }


  // Build the merged residual, applying the eager emptiness rules.
  private finish(state: ConstraintState, ctx: AontuContext, peer: Val): Val {
    if (stateEmpty(state)) {
      return this.fail(ctx, peer)
    }

    const out = new ConstraintVal({ peg: [], state }, ctx)
    out.path = this.path
    out.site.row = this.site.row
    out.site.col = this.site.col
    out.site.url = this.site.url
    // Marks ratchet across a meet (the propagateMarks rule): a fresh
    // residual must carry both operands' type/hide marks, or a
    // `type(min(0)) & max(10)` merge would silently unmark the field
    // (the Go fold re-ratchets from its terms; this is the TS twin).
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
      res: [...this.res],
      count: this.count,
      uniq: this.uniq,
      musts: [...this.musts],
      invalid: this.invalid,
    }
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
    out.res = [...this.res]
    out.count = this.count
    out.uniq = this.uniq
    out.musts = [...this.musts]
    out.pending = this.pending
    out.cjo = this.cjo
    out.invalid = this.invalid
    out.invalidWhy = this.invalidWhy
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
        '(' + this.pending.args.map((a: any) => a.canon).join(',') + ')'
    }
    return canonState(this)
  }


  same(peer: any): boolean {
    return true === peer?.isConstraint && this.canon === peer.canon
  }

}


// The tighter of two like-direction bounds: the higher lower bound (or
// lower upper bound); on the same point the OPEN bound wins, and on a
// full tie the tower-lowest endpoint spelling survives.
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


// Is this value, or anything inside it, a nil? A written argument that
// holds one can never be satisfied, so the atom refuses it as an
// argument rather than reporting a mystery failure against every peer.
// Every caller passes a Val: `args[0]` comes from atomArgs, and the
// walk below descends only into container pegs, which hold Vals. The
// null/non-Val guard this function used to open with was therefore
// unreachable, and the coverage gate said so.
function holdsNil(v: any): boolean {
  if (true === v.isNil) {
    return true
  }
  const peg = v.peg
  if (Array.isArray(peg)) {
    return peg.some((c: any) => holdsNil(c))
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


// Whether a value, or anything inside it, is an effectful call — one
// whose evaluation changes a node OTHER than the one being computed.
// `move()` is the only builtin that does: it hides its resolution
// target in place. Band B refuses one as an argument, because settling
// it runs the effect against the live root before `must`'s trial clone
// is taken, and a check that mutates cannot be report-only.
function holdsMove(v: any): boolean {
  if (true === v.isFunc && 'move' === v.funcname?.()) {
    return true
  }
  const peg = v.peg
  if (Array.isArray(peg)) {
    return peg.some((c: any) => holdsMove(c))
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


// The written arguments of an atom, flattened.
//
// A multi-argument call arrives from the func-paren grammar as ONE
// entry holding the comma group, and `neq([3,1,2])` means the same as
// `neq(3,1,2)`. The group is always a ListVal by the time it reaches
// here -- the func-paren handler rawToVals every argument (issue #49) --
// so there is no raw-array case to unwrap. Flattening happens before
// the settled check, because an unsettled member hiding inside the
// group would otherwise make the atom look ready.
function atomArgs(atom: string, args: any[]): any[] {
  if (('neq' === atom || 'must' === atom) && 1 === args.length &&
    true === (args[0] as any)?.isList) {
    return (args[0] as any).peg
  }
  return args
}


// The canonical rendering of a residual, in the fixed atom order:
// kind, lower bound, upper bound, neq, re, length, unique. Taken over the
// STATE rather than the Val because `length`'s argument is a residual too,
// and renders by exactly the same rules.
function canonState(s: ConstraintState): string {
  const parts: string[] = []
  if (null != s.kind) {
    parts.push((s.kind as any).name.toLowerCase())
  }
  // An ORDER atom's argument implies the domain, so it is not spelled
  // out. A SIZING residual carries no order, and there `string` is the
  // only thing saying what is being sized -- drop it and the reparse
  // would admit lists and maps too.
  else if ('string' === s.domain &&
    null == s.lo && null == s.hi && 0 === s.neqs.length && 0 === s.res.length) {
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
  for (const r of s.res) {
    parts.push('re(' + r.v.canon + ')')
  }
  if (null != s.count) {
    // Rendered UNABRIDGED, implied parts and all: `length(3)` canonicalises
    // to `length(integer&min(3)&max(3))` because that IS the residual the
    // count must satisfy, and canon is a normal form (G6 hashes it),
    // not a pretty-printer. Abbreviating would mean a second set of
    // rules for when the implied `integer & min(0)` may be dropped.
    parts.push('length(' + canonState(s.count) + ')')
  }
  if (s.uniq) {
    parts.push('unique()')
  }
  for (const m of s.musts) {
    parts.push('must(' + m.v.canon + ',' + m.msg.canon + ')')
  }
  if (0 === parts.length) {
    // Raw invalid atom: render the call so the error frame shows it.
    return 'constraint()'
  }
  return parts.join('&')
}


// SUBSUMPTION over two residuals (G3, the query built on the table in
// docs/reference-language.md "Subsumption"): does every value `s`
// admits pass `g` too? Implemented here because the compare machinery
// (cmpVal, sameScalar, the recursive count state) is this module's.
//
// Three-valued: true / false / 'undecided'. `must` on the GENERAL side
// is undecided by construction (a Band B predicate is opaque — G3 maps
// the table's "never" to the query's honest sub_evaluate_only); every
// other approximation folds toward false, the safe direction.
function constraintStateSubsumes(
  g: {
    domain?: 'number' | 'string', kind?: any, lo?: Bound, hi?: Bound,
    neqs: any[], res: ReAtom[], count?: ConstraintState, uniq: boolean,
    musts: MustAtom[],
  },
  s: {
    domain?: 'number' | 'string', kind?: any, lo?: Bound, hi?: Bound,
    neqs: any[], res: ReAtom[], count?: ConstraintState, uniq: boolean,
    musts: MustAtom[],
  },
): boolean | 'undecided' {
  // A Band B predicate on the general side makes its admitted set
  // unknowable; an extra `must` on the SPECIFIC side only narrows it
  // and is ignored.
  if (0 < g.musts.length) {
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

  // Patterns compare as TEXT sets (the sanctioned approximation:
  // deciding regex containment is what this algebra refuses to do).
  for (const r of g.res) {
    if (!s.res.some((q: ReAtom) => q.src === r.src)) {
      return false
    }
  }

  // `unique()` subsumes only itself on that axis: a general uniqueness
  // demand admits no container the unconstrained specific also admits.
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
  if (0 < g.musts.length) {
    return 'undecided'
  }
  if (g.uniq) {
    return false
  }
  // A count residual admits by LENGTH, which is the meet's business;
  // the query answers false (the safe direction) rather than
  // reimplementing the sizing walk here.
  if (null != (g as any).count) {
    return false
  }
  return stateAdmits(g as any, scalar)
}


// Does this residual's ORDER and MEMBERSHIP part admit the scalar? The
// sizing atoms are deliberately not consulted: `admit` applies them to
// the peer's length, and the count check applies this same function to
// the count.
function stateAdmits(s: ConstraintState, peer: any): boolean {
  const domainOf = numericLeaf(peer) ? 'number' :
    stringLeaf(peer) ? 'string' : undefined

  if (null == s.domain) {
    // A sizing residual has no domain, and admits any scalar the sizing
    // atoms can then rule on. Booleans and null are not among them:
    // they have no order, no length and no members.
    if (null == domainOf) {
      return false
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
  // Every accumulated pattern must match: the meet of two `re` atoms
  // is conjunction, and matching is UNANCHORED in both engines
  // (JS RegExp.test, Go regexp.MatchString), so `re("el")` admits
  // "hello". Anchor with ^ and $ to mean the whole string.
  for (const r of s.res) {
    if (!r.re.test(peer.peg)) {
      return false
    }
  }
  return true
}


// The eager emptiness rules. Each is EXACT -- it reports empty only
// where no value could satisfy the residual -- so the algebra stays
// sound; the incompleteness it accepts is documented in
// docs/reference-language.md, "Emptiness".
function stateEmpty(s: ConstraintState): boolean {
  // Two disagreeing kind narrowings inside a length argument, recorded by
  // meetCount because that meet has no ctx to fail through.
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

  const integral = Integer === s.kind || BigInteger === s.kind

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

  // Point deletion under a narrowed leaf: a closed point interval
  // whose single value of the narrowed leaf is excluded is empty
  // (integer & min(3) & max(3) & neq(3)). Without a narrowing the
  // point survives in the other leaves.
  if (null != s.kind && null != s.lo && null != s.hi &&
    !s.lo.open && !s.hi.open &&
    0 === cmpVal(d, s.lo.v, s.hi.v)) {
    for (const n of s.neqs) {
      if (leafMarker(n) === s.kind && 0 === cmpNumeric(n, s.lo.v)) {
        return true
      }
    }
  }

  // Sizing over the number domain: a number has neither a length nor
  // members, so `integer & length(3)` and `min(2) & unique()` admit
  // nothing. Uniqueness over the string domain is empty for the same
  // reason -- a string's members are not values the algebra compares.
  if ('number' === d && (null != s.count || s.uniq)) {
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


// The base every `length` argument meets: a count is a non-negative
// integer, whatever else the argument says (docs/reference-language.md,
// "`length` semantics" -- `length(c)` is empty iff `c & integer & min(0)`
// is).
function countBase(): ConstraintState {
  return {
    domain: 'number',
    kind: Integer,
    lo: { v: countVal(0), open: false },
    neqs: [],
    res: [],
    musts: [],
    uniq: false,
  }
}


// A count as a Val, so the count residual can be applied by exactly the
// same membership function as any other numeric residual.
function countVal(n: number): any {
  return new IntegerVal({ peg: n })
}


// The pure meet of two count residuals. Both are number-domain and
// carry no pattern or sizing atom of their own, so the merge is the
// interval/exclusion part alone. A kind disagreement becomes a `clash`
// rather than an error: this meet runs at construction, where there is
// no AontuContext to raise through, and an empty residual carries the
// same news to `unify`.
function meetCount(a: ConstraintState, b: ConstraintState): ConstraintState {
  return {
    domain: 'number',
    // `a` is always a countBase()-seeded residual, so its kind is
    // always Integer — there is no kindless side to fall back from.
    kind: a.kind,
    lo: tighter('number', a.lo, b.lo, true),
    hi: tighter('number', a.hi, b.hi, false),
    neqs: dedupSorted('number', [...a.neqs, ...b.neqs]),
    res: [],
    musts: [],
    uniq: false,
    clash: true === a.clash || true === b.clash ||
      (null != a.kind && null != b.kind && a.kind !== b.kind),
  }
}


// Read a WRITTEN `length` argument as a count residual, or undefined when
// it is not one. Accepted: an integer literal (an exact count), a
// numeric kind, a Band A residual over the number domain, and any
// conjunct of those. A conjunct never reaches here any more: an
// unsettled argument is held as `pending` and folded before the count
// reads it (G1 phase 4), so `length(min(2)&max(5))` arrives as the
// single residual it folds to.
//
// Anything else is refused rather than deferred. A reference or an
// expression would have to residuate, and the sizing atoms do not
// residuate on their ARGUMENT -- only on the peer whose members are
// still settling.
function countArgState(arg: any): ConstraintState | undefined {
  if (numericLeaf(arg)) {
    return {
      domain: 'number',
      lo: { v: arg, open: false },
      hi: { v: arg, open: false },
      neqs: [], res: [], musts: [], uniq: false,
    }
  }

  if (true === arg?.isConstraint) {
    const c = arg as ConstraintVal
    // A pattern, a sizing atom or a string bound inside a count is not
    // a count constraint at all, and neither is a broken one.
    if (null != c.invalid || 0 < c.res.length || c.uniq || null != c.count ||
      'number' !== c.domain) {
      return undefined
    }
    return {
      domain: 'number',
      kind: c.kind,
      lo: c.lo,
      hi: c.hi,
      neqs: [...c.neqs],
      res: [], musts: [], uniq: false,
    }
  }

  if (true === arg?.isScalarKind) {
    const marker = arg.peg
    if (Number === marker) {
      return { domain: 'number', neqs: [], res: [], musts: [], uniq: false }
    }
    if (Integer === marker || Float === marker ||
      BigInteger === marker || BigDecimal === marker) {
      return { domain: 'number', kind: marker, neqs: [], res: [], musts: [], uniq: false }
    }
    return undefined
  }

  return undefined
}


// A container is SETTLED when it and every child have converged. Until
// then the member set can still change — an optional key whose value is
// a still-resolving reference may yet generate — so a sizing atom must
// defer rather than decide (docs/reference-language.md, "`length`
// semantics"). Note that an optional holding a settled-but-ungenerable
// value, `{x:1,y?:number}`, IS settled: the map converges on the first
// pass and `y` is simply never emitted.
function containerSettled(bag: any): boolean {
  // The bag's OWN done-counter is enough: BagVal.unify sets it from the
  // AND over its children, so an unsettled child already leaves the bag
  // unsettled. Walking the children again would be a second, drifting
  // copy of that rule.
  return true === bag.done
}


// The child kinds `BagVal.gen` will attempt to generate. Anything else
// is residue: dropped when the key is optional, and a bag-level error
// otherwise.
function genable(child: any): boolean {
  return true === child.isScalar || true === child.isMap ||
    true === child.isList || true === child.isPref ||
    true === child.isRef || true === child.isDisjunct ||
    true === child.isNil
}


// The children a bag would EMIT, mirroring the selection in
// `BagVal.gen` — type/hide marks skipped, non-generable residue and
// values that generate nothing dropped, optional keys dropped when
// they generate empty.
//
// It returns the member VALS rather than their generated values,
// because uniqueness compares canon and a generated value cannot
// express that distinction: `1` and `1.0` generate the same JSON number
// and canon differently. Counting uses the same list, so both sizing
// atoms see exactly one definition of "member".
//
// Returns undefined when a REQUIRED child is residue: the container's
// own `gen` raises there, and that error is the one worth reporting.
function emittedMembers(bag: any, ctx: AontuContext): any[] | undefined {
  const out: any[] = []

  let entries = items(bag.peg)
  if (bag.isMap) {
    // Code-point order, because the two ports disagree on raw key order
    // — JavaScript hoists integer-like keys, Go keeps insertion order —
    // and a duplicate report must name the same pair in both.
    entries = entries
      .slice()
      .sort((a: any, b: any) => cmpCodePoint(String(a[0]), String(b[0])))
  }

  for (const item of entries) {
    const key = item[0]
    const child: any = item[1]

    if (child.mark.type || child.mark.hide) {
      continue
    }

    const optional = bag.optionalKeys.includes('' + key)

    if (!genable(child)) {
      if (optional) {
        continue
      }
      return undefined
    }

    // Generation decides in an isolated collect context, so an
    // unresolved inner value neither raises here nor pollutes the
    // caller's errors — the same isolation BagVal.gen uses for an
    // optional child.
    const cval = child.gen(ctx.clone({ err: [], collect: true }))

    if (undefined === cval || (optional && empty(cval))) {
      continue
    }

    out.push(child)
  }

  return out
}


// Sort accumulated patterns by source in code-point order and drop
// exact duplicates. Patterns are NEVER simplified or compared for
// containment: deciding `re("a")` subsumes `re("a|b")` is regex
// containment, which the algebra deliberately does not do (emptiness
// stays approximate — sound, incomplete). Two spellings of one language
// therefore both survive, and both are tested.
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


// The atom classes registered in the parser's funcMap: each is a
// ConstraintVal that knows its atom name. Constructed by the
// func-paren handler as `new funcval({peg: args})`.
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

class MustConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'must' }, ctx)
  }
}

class LengthConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'length' }, ctx)
  }
}

class UniqueConstraintVal extends ConstraintVal {
  constructor(spec: ValSpec, ctx?: AontuContext) {
    super({ ...spec, atom: 'unique' }, ctx)
  }
} /* node:coverage ignore next 23 */


export {
  // Exported for the differential corpus test (ADR-003): the two ports'
  // normalisers must produce byte-identical output, and that can only be
  // checked by calling them.
  normaliseRe,
  // Exported for the subsumption query (G3, ts/src/subsume.ts): the
  // residual-vs-residual and residual-vs-scalar rules live here beside
  // the compare machinery they reuse.
  constraintSubsumesConstraint,
  constraintAdmitsScalar,
  ConstraintVal,
  MinConstraintVal,
  MaxConstraintVal,
  AboveConstraintVal,
  BelowConstraintVal,
  NeqConstraintVal,
  ReConstraintVal,
  LengthConstraintVal,
  UniqueConstraintVal,
  MustConstraintVal,
}
