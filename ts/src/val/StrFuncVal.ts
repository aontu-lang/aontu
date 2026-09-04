/* Copyright (c) 2025 Richard Rodger, MIT License */

// THE STRING BUILTINS the rule layer needs (G9 phase 6,
// docs/design/TEMPLATE.0.md D4 and D5).
//
//   esc(s, variant?)      make `s` safe inside a literal
//   usc(s, variant?)      read it back out
//   rep(s, pattern, sub)  replace every match
//   split(s, sep)         a list of fields
//
// All four are ORDINARY string builtins beside `upper` and `lower`:
// they return values, compose with `+`, and know nothing about
// generation, which is why they can land before the renderer does.
// They are not staged -- a scalar argument that is `done` is done.
//
// WHY `rep` AND `split` CARRY THEIR OWN MATCHING LOOPS. The host
// engines disagree about every part of this. `String.replace` reads
// `$1x` as group 1 then `x` while Go's Expand reads the name `1x`;
// `String.split` INSERTS a pattern's capture groups into the result
// and Go's Split does not; and the two disagree about empty matches at
// the ends. So the loops below are written once, in the semantics Go's
// regexp package defines, and go/strfunc.go is their twin -- the same
// discipline ADR-003 applies to the pattern language itself.
//
// THE PATTERN IS THE PORTABLE SUBSET `re()` TAKES, normalised before
// either engine compiles it. One regexp language in the document, not
// two -- and the subset's linear-time guarantee matters more here than
// in a constraint, because a generator runs this over model data.

import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'
import { isEscVariant, escapeText, unescapeText } from '../escape'
import { StringVal } from './StringVal'
import { ListVal } from './ListVal'
import { FuncBaseVal } from './FuncBaseVal'
import { normaliseRe } from './ConstraintVal'


// The string a value carries, or undefined when it is not a string.
// Mirrors `stringLeaf` in ConstraintVal: a path is a string too, so a
// spelled address may be escaped and split like any other text.
function textOf(v: Val | undefined): string | undefined {
  const s: any = v
  return true === s?.isScalar && 'string' === typeof s.peg ? s.peg : undefined
}


// The variant an optional second argument names: '' for the absent
// argument (the C/JSON convention), or undefined when it is not a
// variant name.
function variantOf(v: Val | undefined): string | undefined {
  if (null == v) { return '' }
  const s = textOf(v)
  return undefined !== s && isEscVariant(s) ? s : undefined
}


// The number of CAPTURING groups in a normalised pattern. Counted by
// scanning rather than by asking either host, because the count decides
// whether a substitution is refused and the two ports must refuse the
// same ones. The subset admits no named groups, so a capturing group is
// exactly `(` that is not `(?`.
function reGroupCount(norm: string): number {
  let count = 0
  let inClass = false
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i]
    if ('\\' === c) { i++; continue }
    if (inClass) {
      if (']' === c) { inClass = false }
      continue
    }
    if ('[' === c) { inClass = true; continue }
    if ('(' === c && '?' !== norm[i + 1]) { count++ }
  }
  return count
}


// One code point at `at`, as a count of UTF-16 units: the "advance by
// one rune" Go's matching loop performs after an empty match.
function stepAt(src: string, at: number): number {
  const c = src.codePointAt(at)
  return undefined === c ? 1 : (0xFFFF < c ? 2 : 1)
}


// Every match of `re` in `src`, as [start, end, ...group pairs], under
// Go's rule: scanning resumes at the end of each match, and an empty
// match ADJACENT to the previous match's end is skipped rather than
// delivered. Written out because JavaScript has no equivalent and the
// difference is visible in `rep("aa", "a*", "-")`.
function allMatches(src: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = []
  // Its own scanner, so `lastIndex` is this walk's to move: the caller's
  // regexp is shared with whatever else holds it.
  const scan = new RegExp(re.source, re.flags)

  let pos = 0
  let prevEnd = -1
  while (pos <= src.length) {
    scan.lastIndex = pos
    const m = scan.exec(src)
    if (null === m) { break }

    const start = m.index
    const end = start + m[0].length
    let accept = true

    if (end === pos) {
      if (start === prevEnd) { accept = false }
      pos += stepAt(src, pos)
    }
    else {
      pos = end
    }

    prevEnd = end
    if (accept) { out.push(m) }
  }

  return out
}


// A substitution template expanded against one match. `$1`..`$9` are
// the numbered groups, `$&` the whole match and `$$` a literal `$`;
// anything else after a `$` names nothing, and naming nothing is a
// REFUSAL rather than a silent literal. A group the pattern does not
// have is the same refusal -- a generator that expands it to the empty
// string writes a file with a hole in it and says nothing.
function expandSub(sub: string, m: RegExpExecArray, groups: number)
  : string | undefined {
  let out = ''
  for (let i = 0; i < sub.length; i++) {
    if ('$' !== sub[i]) { out += sub[i]; continue }

    const n = sub[i + 1]
    if ('$' === n) { out += '$'; i++; continue }
    if ('&' === n) { out += m[0]; i++; continue }

    if (undefined === n || '1' > n || '9' < n) { return undefined }
    const g = n.charCodeAt(0) - 0x30
    if (groups < g) { return undefined }
    out += m[g] ?? ''
    i++
  }
  return out
}


// The fields `re` cuts `src` into, under Go's Split: an empty match at
// the very start opens no field, and a match ending at the end of the
// input closes none.
function splitRe(src: string, re: RegExp): string[] {
  const out: string[] = []
  let beg = 0
  let end = 0
  for (const m of allMatches(src, re)) {
    end = m.index
    if (0 !== m.index + m[0].length) {
      out.push(src.slice(beg, end))
    }
    beg = m.index + m[0].length
  }
  if (end !== src.length) { out.push(src.slice(beg)) }
  return out
}


// An EMPTY separator yields the CODE POINTS, not the UTF-16 units a
// host split would give: `split("é", "")` is one field in both ports.
function splitLiteral(src: string, sep: string): string[] {
  if ('' === sep) { return [...src] }
  return src.split(sep)
}


// The compiled form of a pattern argument, or the code naming what is
// wrong with it.
function compileRe(src: string): RegExp | string {
  const [norm, why] = normaliseRe(src)
  if ('' !== why) { return 'rep_pattern' }
  try {
    // The `u` flag is REQUIRED for parity, exactly as it is for `re()`:
    // without it JavaScript counts UTF-16 units where Go counts code
    // points.
    return new RegExp(norm, 'gu')
  }
  catch (e: any) {
    return 'rep_pattern'
  }
}


class EscFuncVal extends FuncBaseVal {
  isEscFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx) }

  make(_ctx: AontuContext, spec: ValSpec): Val { return new EscFuncVal(spec) }

  funcname() { return 'esc' }

  resolve(ctx: AontuContext, args: Val[]) {
    const src = textOf(args?.[0])
    if (undefined === src) { return makeNilErr(ctx, 'invalid-arg', this) }

    const variant = variantOf(args?.[1])
    if (undefined === variant) { return makeNilErr(ctx, 'esc_variant', this) }

    return this.place(new StringVal({ peg: escapeText(src, variant) }, ctx))
  }

} /* node:coverage ignore next 2 */


class UscFuncVal extends FuncBaseVal {
  isUscFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx) }

  make(_ctx: AontuContext, spec: ValSpec): Val { return new UscFuncVal(spec) }

  funcname() { return 'usc' }

  resolve(ctx: AontuContext, args: Val[]) {
    const src = textOf(args?.[0])
    if (undefined === src) { return makeNilErr(ctx, 'invalid-arg', this) }

    const variant = variantOf(args?.[1])
    if (undefined === variant) { return makeNilErr(ctx, 'esc_variant', this) }

    const [out, ok] = unescapeText(src, variant)
    if (!ok) { return makeNilErr(ctx, 'usc_malformed', this) }

    return this.place(new StringVal({ peg: out }, ctx))
  }

} /* node:coverage ignore next 2 */


class RepFuncVal extends FuncBaseVal {
  isRepFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx) }

  make(_ctx: AontuContext, spec: ValSpec): Val { return new RepFuncVal(spec) }

  funcname() { return 'rep' }

  resolve(ctx: AontuContext, args: Val[]) {
    const src = textOf(args?.[0])
    const pat = textOf(args?.[1])
    const sub = textOf(args?.[2])
    if (undefined === src || undefined === pat || undefined === sub) {
      return makeNilErr(ctx, 'invalid-arg', this)
    }

    const re = compileRe(pat)
    if ('string' === typeof re) { return makeNilErr(ctx, re, this) }

    const groups = reGroupCount(re.source)

    let out = ''
    let at = 0
    for (const m of allMatches(src, re)) {
      const piece = expandSub(sub, m, groups)
      if (undefined === piece) { return makeNilErr(ctx, 'rep_sub', this) }
      out += src.slice(at, m.index) + piece
      at = m.index + m[0].length
    }
    out += src.slice(at)

    return this.place(new StringVal({ peg: out }, ctx))
  }

} /* node:coverage ignore next 2 */


class SplitFuncVal extends FuncBaseVal {
  isSplitFunc = true

  constructor(spec: ValSpec, ctx?: AontuContext) { super(spec, ctx) }

  make(_ctx: AontuContext, spec: ValSpec): Val { return new SplitFuncVal(spec) }

  funcname() { return 'split' }

  resolve(ctx: AontuContext, args: Val[]) {
    const src = textOf(args?.[0])
    if (undefined === src) { return makeNilErr(ctx, 'invalid-arg', this) }

    // A PLAIN STRING IS A LITERAL and an `re(…)` is a pattern. The
    // asymmetry with `rep` is deliberate: splitting is usually on a
    // literal, replacing is usually by pattern, and it removes the trap
    // where `split(v, ".")` silently cuts between every character.
    const sep: any = args?.[1]
    const lit = textOf(sep)

    let fields: string[]
    if (undefined !== lit) {
      fields = splitLiteral(src, lit)
    }
    else if (true === sep?.isConstraint && 1 === sep.res?.length) {
      fields = splitRe(src, new RegExp(sep.res[0].re.source, 'gu'))
    }
    else {
      return makeNilErr(ctx, 'split_sep', this)
    }

    const peg = fields.map((f, i) =>
      new StringVal({ peg: f }, ctx.descend(String(i))))

    return this.place(new ListVal({ peg }, ctx))
  }

} /* node:coverage ignore next 8 */


export {
  EscFuncVal,
  UscFuncVal,
  RepFuncVal,
  SplitFuncVal,
}
