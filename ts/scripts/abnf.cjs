/* Copyright (c) 2026 Richard Rodger, MIT License */

// AN ABNF READER (RFC 5234, plus RFC 7405's `%s`), producing the same
// expression tree ts/test/grammar.test.ts already interprets for the
// GBNF file. One shape, two notations: the matcher, the reachability
// check and the corpus test in that file work on grammar/aontu.abnf
// without a second interpreter, and ts/scripts/figures.cjs renders the
// railroad diagram from the same tree.
//
// PLAIN CJS, and here rather than in the test, because two callers need
// it and only one of them is a test. It reads a file; it does not
// execute one.
//
// The expression tree, identical to the GBNF reader's:
//
//   { t: 'lit',   v: string }
//   { t: 'class', neg: boolean, set: [lo, hi][] }
//   { t: 'ref',   v: string }
//   { t: 'seq',   v: Expr[] }
//   { t: 'alt',   v: Expr[] }
//   { t: 'rep',   v: Expr, min: number, max: number }
//
// `neg` is always false here: ABNF has no negated class, and every
// exclusion in grammar/aontu.abnf is written as the ranges that remain.

// The subset this reads, which is the subset the published file uses:
// `=` definitions with indented continuation, `;` comments, `/`
// alternation, concatenation, `( )` groups, `[ ]` options, the
// `*` / `n*` / `*m` / `n*m` / `n` repetitions, `%s"..."` literals,
// `%xHH` and `%xHH-HH` character values, and rule references. NOT
// read: `=/` incremental alternatives, `%d` / `%b` radices, `%x` dot
// concatenation, and `<prose>` --- none of which the file needs, and
// each of which would be a silent misreading if it appeared.

class AbnfError extends Error { }

class AbnfReader {
  constructor(text) {
    // Comments run to end of line, and a `;` inside a quoted literal is
    // not one: strip with the quotes accounted for, which a line-wise
    // regular expression cannot do.
    this.text = stripComments(text)
    this.at = 0
  }

  // Every rule in the file, in the order it is defined. A definition
  // starts at the left margin; a continuation line is indented, which
  // is what lets one rule span lines without a joining character.
  rules() {
    const out = new Map()
    const parts = this.text.split(/^([A-Za-z][A-Za-z0-9-]*)[ \t]*=[ \t]*/m)
    if ('' !== parts[0].trim()) {
      throw new AbnfError(
        'abnf: text before the first rule: ' +
        JSON.stringify(parts[0].trim().slice(0, 40)))
    }
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i]
      this.text = parts[i + 1]
      this.at = 0
      out.set(name, this.alt())
      this.skip()
      if (this.at !== this.text.length) {
        throw new AbnfError(
          `abnf: unread text in rule ${name}: ` +
          JSON.stringify(this.text.slice(this.at, this.at + 40)))
      }
    }
    return out
  }

  skip() {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) {
      this.at++
    }
  }

  alt() {
    const v = [this.seq()]
    for (; ;) {
      this.skip()
      if ('/' !== this.text[this.at]) {
        return 1 === v.length ? v[0] : { t: 'alt', v }
      }
      this.at++
      v.push(this.seq())
    }
  }

  seq() {
    const v = []
    for (; ;) {
      this.skip()
      const c = this.text[this.at]
      if (null == c || '/' === c || ')' === c || ']' === c) {
        return 1 === v.length ? v[0] : { t: 'seq', v }
      }
      v.push(this.repeat())
    }
  }

  // ABNF puts the repetition BEFORE its element, and the four
  // spellings are one production: `*e`, `n*e`, `*m e`, `n*m e`, plus
  // the bare `n e` that is exactly n.
  repeat() {
    const m = /^(?:([0-9]*)\*([0-9]*)|([0-9]+))/.exec(this.text.slice(this.at))
    if (null == m || '' === m[0]) {
      return this.prim()
    }
    this.at += m[0].length
    const e = this.prim()
    if (undefined !== m[3]) {
      const n = Number(m[3])
      return { t: 'rep', v: e, min: n, max: n }
    }
    return {
      t: 'rep',
      v: e,
      min: '' === m[1] ? 0 : Number(m[1]),
      max: '' === m[2] ? Infinity : Number(m[2]),
    }
  }

  prim() {
    const c = this.text[this.at]
    if ('(' === c) {
      this.at++
      const e = this.alt()
      this.close(')')
      return e
    }
    if ('[' === c) {
      this.at++
      const e = this.alt()
      this.close(']')
      return { t: 'rep', v: e, min: 0, max: 1 }
    }
    if ('%' === c) {
      return this.value()
    }
    if ('"' === c) {
      // RFC 5234's bare literal is CASE-INSENSITIVE, and Aontu is not:
      // `TRUE` is a bare word where `true` is a boolean. Refusing is
      // the only reading that cannot be wrong.
      throw new AbnfError(
        'abnf: a case-insensitive literal at ' +
        JSON.stringify(this.text.slice(this.at, this.at + 20)) +
        ' -- write %s"..." (RFC 7405), since every literal in this ' +
        'grammar is case-sensitive')
    }
    const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(this.text.slice(this.at))
    if (null == m) {
      throw new AbnfError(
        'abnf: unexpected text: ' +
        JSON.stringify(this.text.slice(this.at, this.at + 30)))
    }
    this.at += m[0].length
    return { t: 'ref', v: m[0] }
  }

  close(ch) {
    this.skip()
    if (ch !== this.text[this.at]) {
      throw new AbnfError(`abnf: expected ${ch} at ` +
        JSON.stringify(this.text.slice(this.at, this.at + 20)))
    }
    this.at++
  }

  // `%s"..."` (a case-sensitive literal) and `%xHH` / `%xHH-HH` (a
  // character or a range).
  value() {
    const rest = this.text.slice(this.at)
    const s = /^%s"([^"]*)"/.exec(rest)
    if (null != s) {
      this.at += s[0].length
      return { t: 'lit', v: s[1] }
    }
    const x = /^%x([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(rest)
    if (null == x) {
      throw new AbnfError(
        'abnf: only %s"..." and %xHH[-HH] are read here, not ' +
        JSON.stringify(rest.slice(0, 20)))
    }
    this.at += x[0].length
    const lo = parseInt(x[1], 16)
    return {
      t: 'class',
      neg: false,
      set: [[lo, undefined === x[2] ? lo : parseInt(x[2], 16)]],
    }
  }
}


// Comments to end of line, with quoted literals respected. A `;` can
// appear inside `%s"..."` -- it does not today, and a reader that
// depended on that would be one edit from silently truncating a rule.
function stripComments(text) {
  let out = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if ('"' === c) {
      quoted = !quoted
    }
    if (!quoted && ';' === c) {
      while (i < text.length && '\n' !== text[i]) {
        i++
      }
      out += '\n'
      continue
    }
    out += c
  }
  return out
}


module.exports = { AbnfReader, AbnfError }
