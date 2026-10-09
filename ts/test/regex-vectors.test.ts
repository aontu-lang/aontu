/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { compilePattern, patternMatches } from '../dist/regex'
import { union, complement } from '../dist/uniprop'


type Ranges = [number, number][]

const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors')
const ESCAPES = Path.join(VECTORS, 'test262', 'property-escapes')
const DELTA = Path.join(VECTORS, 'test262', 'unicode-17-to-18.tsv')
const RE2 = Path.join(VECTORS, 're2', 're2-search.txt')

const minus = (a: Ranges, b: Ranges): Ranges => complement(union([complement(a), b]))
const show = (rs: Ranges): string => JSON.stringify(rs.slice(0, 4)) + (4 < rs.length ? '...' : '')


// The set a test262 file builds: buildString's loneCodePoints and ranges.
function builtSet(text: string): Ranges {
  const at = text.indexOf('loneCodePoints: [')
  const lone = text.slice(at, text.indexOf(']', at))
  const ranges = text.slice(text.indexOf('ranges: [', at), text.indexOf('\n});', at))
  return union([
    [...lone.matchAll(/0x([0-9A-F]+)/g)].map((m): [number, number] =>
      [parseInt(m[1], 16), parseInt(m[1], 16)]),
    [...ranges.matchAll(/\[0x([0-9A-F]+), 0x([0-9A-F]+)\]/g)].map((m): [number, number] =>
      [parseInt(m[1], 16), parseInt(m[2], 16)]),
  ])
}

// What the delta file says each file's set gains and loses.
function loadDelta(): Map<string, { '+': Ranges, '-': Ranges }> {
  const out = new Map<string, { '+': Ranges, '-': Ranges }>()
  for (const line of Fs.readFileSync(DELTA, 'utf8').split('\n')) {
    if ('' === line || line.startsWith('#')) {
      continue
    }
    const [stem, sign, spans] = line.split('\t')
    const d = out.get(stem) ?? { '+': [], '-': [] }
    d[sign as '+' | '-'] = spans.split(' ').map((s): [number, number] => {
      const [lo, hi] = s.split('..')
      return [parseInt(lo, 16), parseInt(hi ?? lo, 16)]
    })
    out.set(stem, d)
  }
  return out
}

// The set the owned parser reads for a \p{..} or \P{..} escape.
function escapeSet(escape: string): Ranges {
  const [prog, why] = compilePattern(escape, 'ecma')
  Assert.ok(undefined !== prog, escape + ' is refused: ' + why)
  const set = prog[0]
  Assert.equal(set.op, 'set', escape + ' does not compile to a set')
  return (set as { set: Ranges }).set
}


// A Go string literal as the bytes it holds, decoded as UTF-8, which
// every string of the file is.
function goUnquote(lit: string): string {
  const bytes: number[] = []
  const SIMPLE: Record<string, number> = {
    a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34, '\'': 39,
  }
  const body = lit.slice(1, -1)
  for (let i = 0; i < body.length;) {
    const c = body[i]
    if ('\\' !== c) {
      const cp = body.codePointAt(i) as number
      bytes.push(...Buffer.from(String.fromCodePoint(cp), 'utf8'))
      i += cp > 0xFFFF ? 2 : 1
      continue
    }
    const e = body[i + 1]
    if (undefined !== SIMPLE[e]) {
      bytes.push(SIMPLE[e])
      i += 2
    }
    else if ('x' === e) {
      bytes.push(parseInt(body.slice(i + 2, i + 4), 16))
      i += 4
    }
    else if ('u' === e || 'U' === e) {
      const n = 'u' === e ? 4 : 8
      bytes.push(...Buffer.from(String.fromCodePoint(parseInt(body.slice(i + 2, i + 2 + n), 16)), 'utf8'))
      i += 2 + n
    }
    else {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8))
      i += 4
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
}


describe('regex-vectors', () => {

  // The files were generated for Unicode 17.0.0, the tables for 18.0.0:
  // the delta, read from both releases' files, says what moved.
  test('test262-property-escapes', () => {
    const delta = loadDelta()
    const files = Fs.readdirSync(ESCAPES).filter((f) => f.endsWith('.js')).sort()
    let escapes = 0
    for (const file of files) {
      const stem = file.slice(0, -3)
      const text = Fs.readFileSync(Path.join(ESCAPES, file), 'utf8')
      const split = text.indexOf('const nonMatchSymbols')
      const matched = builtSet(-1 === split ? text : text.slice(0, split))
      if (-1 !== split) {
        Assert.deepEqual(builtSet(text.slice(split)), complement(matched),
          file + ': its two sets are not complements')
      }
      const d = delta.get(stem) ?? { '+': [], '-': [] }
      delta.delete(stem)
      const want = union([minus(matched, d['-']), d['+']])
      for (const m of text.matchAll(/\/\^?(\\[pP]\{[^}]+\})(?:\+\$)?\/u/g)) {
        const got = escapeSet(m[1])
        const expect = 'p' === m[1][1] ? want : complement(want)
        Assert.deepEqual(got, expect, file + ': ' + m[1] + ' reads ' + show(minus(got, expect)) +
          ' more and ' + show(minus(expect, got)) + ' fewer')
        escapes++
      }
    }
    Assert.equal(files.length, 441)
    Assert.equal(escapes, 3492)
    Assert.deepEqual([...delta.keys()], [], 'the delta names files that are not vendored')
  })


  // RE2's search tests, read as re() reads a pattern: the second column
  // is RE2's unanchored search, which is the question re() asks. A
  // pattern re() refuses is RE2's syntax and not u mode's: \C, an octal
  // escape, \x{..}, \pN, a script by its bare name, an inline flag. It
  // is counted and passed over.
  test('re2-search', () => {
    const lines = Fs.readFileSync(RE2, 'utf8').split('\n')
    let strings: string[] = []
    let agree = 0
    let refused = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if ('strings' === line) {
        strings = []
        for (i++; 'regexps' !== lines[i]; i++) {
          strings.push(goUnquote(lines[i]))
        }
        continue
      }
      if (!line.startsWith('"')) {
        continue
      }
      const pattern = goUnquote(line)
      const [prog] = compilePattern(pattern, 'aontu')
      for (const s of strings) {
        const found = '-' !== lines[++i].split(';')[1]
        if (undefined === prog) {
          refused++
        }
        else {
          Assert.equal(patternMatches(prog, s), found,
            're2-search.txt line ' + (i + 1) + ': ' + JSON.stringify(pattern) + ' on ' + JSON.stringify(s))
          agree++
        }
      }
    }
    Assert.deepEqual({ agree, refused }, { agree: 1568, refused: 320 })
  })

})
