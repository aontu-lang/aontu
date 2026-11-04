/* Copyright (c) 2026 Richard Rodger, MIT License */

// The grammar seam, ADR-033. Twin of go/grammar.go.

import { Tabnas } from '@tabnas/parser'
import { abnf } from '@tabnas/abnf'

import { AontuContext } from './ctx'


// A constant, not a trust knob: this bounds a third party's grammar.
const PARSE_STEP_MAX = 100000

const PARSE_CHECK_EVERY = 100


const cache = new Map<string, [any, string | undefined]>()


const steps = { n: 0 }


const NUMBER = /%([xXdDbB])([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+)|((?:\.[0-9A-Fa-f]+)+))?/y
const BASE: Record<string, number> = { x: 16, d: 10, b: 2 }
const DIGITS: Record<number, RegExp> = { 16: /^[0-9A-Fa-f]+$/, 10: /^[0-9]+$/, 2: /^[01]+$/ }


// A numeric value is exactly the code points it names in RFC 5234,
// but the host matches one that holds an ASCII letter in either case,
// so each such letter goes to the host as the string `%s` keeps exact.
// One with a digit its base lacks is refused here, as one host reads it
// as far as its digits go.
function numValsExact(src: string): [string, string | undefined] {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const close = '"' === c ? '"' : '<' === c ? '>' : ';' === c ? '\n' : undefined
    if (undefined !== close) {
      const end = src.indexOf(close, i + 1)
      const stop = end < 0 ? src.length : '\n' === close ? end : end + 1
      out += src.slice(i, stop)
      i = stop
      continue
    }
    NUMBER.lastIndex = i
    const m = '%' === c ? NUMBER.exec(src) : null
    const exact = null == m ? c : numValExact(m)
    if (undefined === exact) {
      return [src, 'a numeric value is malformed: ' + (m as RegExpExecArray)[0]]
    }
    out += exact
    i += null == m ? 1 : m[0].length
  }
  return [out, undefined]
}


function numValExact(m: RegExpExecArray): string | undefined {
  const base = BASE[m[1].toLowerCase()]
  const parts = [m[2], ...(undefined === m[3] ? [] : [m[3]]),
    ...(undefined === m[4] ? [] : m[4].slice(1).split('.'))]
  if (!parts.every((p) => DIGITS[base].test(p))) {
    return undefined
  }
  const cps = parts.map((p) => parseInt(p, base))
  const one = undefined === m[3] || cps[0] === cps[1]
  const letter = (cp: number): boolean => (0x41 <= cp && cp <= 0x5a) || (0x61 <= cp && cp <= 0x7a)
  if (!one || !cps.every((cp) => cp <= 0x10ffff) || !cps.some(letter)) {
    return m[0]
  }
  const pieces = (undefined === m[3] ? cps : [cps[0]]).map((cp) => letter(cp) ?
    '%s"' + String.fromCodePoint(cp) + '"' : '%x' + cp.toString(16).toUpperCase())
  return 1 === pieces.length ? pieces[0] : '(' + pieces.join(' ') + ')'
}


function compileGrammar(src: string): [any, string | undefined] {
  const hit = cache.get(src)
  if (undefined !== hit) {
    return hit
  }

  let out: [any, string | undefined]
  try {
    // Lexing off, or the engine reads `1 . 2 . 3` as `1.2.3`. The hook
    // is installed here because the engine takes it at construction.
    const tn = new Tabnas({
      space: { lex: false },
      parse: {
        budget: {
          checkEveryN: PARSE_CHECK_EVERY,
          onCheck: () => (steps.n += PARSE_CHECK_EVERY) <= PARSE_STEP_MAX,
        }
      }
    })
    const [text, bad] = numValsExact(src)
    if (undefined !== bad) {
      throw new Error(bad)
    }
    tn.use(abnf)
    tn.abnf(text)
    out = [tn, undefined]
  }
  catch (e: any) {
    out = [undefined, String(e?.message ?? e).split('\n')[0]]
  }

  cache.set(src, out)
  return out
}


function parseWith(grammar: any, text: string, _ctx: AontuContext):
  [any, string | undefined] {
  steps.n = 0
  try {
    return [grammar.parse(text), undefined]
  }
  catch (e: any) {
    return [undefined, String(e?.message ?? e).split('\n')[0]]
  }
} /* node:coverage ignore next 8 */


export {
  compileGrammar,
  numValsExact,
  parseWith,
  PARSE_STEP_MAX,
  PARSE_CHECK_EVERY,
}
