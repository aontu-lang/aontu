/* Copyright (c) 2025 Richard Rodger, MIT License */

// The differential regex corpus (ADR-003).
//
// `re()` enforces its subset by NORMALISATION: every construct whose
// expansion is engine-defined is rewritten into an explicit form before
// either host engine compiles it. That only works if the two ports
// rewrite identically, and "identically" is not something a comment can
// promise — so `test/spec/files/regex-corpus.tsv` records the verdict
// for several hundred generated patterns, and both ports assert against
// it. The Go twin is `go/regex_corpus_test.go`.
//
// Three properties, in order of what they catch:
//
//  1. VERDICT PARITY — the corpus file is the pinned output of both
//     normalisers. A drift in either port fails on the exact line.
//  2. COMPILATION — an accepted pattern's normalised form must compile
//     in THIS host. A normalisation that emits something the host
//     refuses would otherwise surface only as a runtime error later.
//  3. IDEMPOTENCE — normalising twice equals normalising once. An
//     expansion that re-expands its own output (or that emits a
//     construct it would itself refuse) is caught here.

import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { normaliseRe } from '../dist/val/ConstraintVal'


const CORPUS = Path.join(
  __dirname, '..', '..', 'test', 'spec', 'files', 'regex-corpus.tsv')


type Row = { pattern: string, verdict: string, line: number }


function loadCorpus(): Row[] {
  const rows: Row[] = []
  // Line endings normalised on read, as ts/test/docs.test.ts and
  // ts/test/grammar.test.ts do: .gitattributes pins .tsv to LF twice
  // over, and a reader that only works under one git configuration is
  // still a reader that only works under one git configuration. Here it
  // would be silent rather than loud -- the verdict is sliced with
  // `raw.slice(tab + 1)`, so a trailing \r rides into every expected
  // pattern.
  const text = Fs.readFileSync(CORPUS, 'utf8')
    .replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  let line = 0
  for (const raw of text.split('\n')) {
    line++
    if ('' === raw || raw.startsWith('#')) {
      continue
    }
    const tab = raw.indexOf('\t')
    // The pattern itself may contain anything except a tab; the FIRST
    // tab separates it from the verdict. No unescaping happens here —
    // unlike the spec runner, this file is read verbatim, because the
    // subject under test is backslash handling.
    rows.push({ pattern: raw.slice(0, tab), verdict: raw.slice(tab + 1), line })
  }
  return rows
}


describe('regex-corpus', () => {

  const rows = loadCorpus()

  test('corpus-is-loaded', () => {
    // A guard on the guard: an empty or truncated corpus would make
    // every assertion below vacuous while still reporting green.
    Assert.ok(300 < rows.length, 'corpus too small: ' + rows.length)
    Assert.ok(rows.some((r) => r.verdict.startsWith('!')),
      'corpus has no refusals — it would not exercise the subset bounds')
    Assert.ok(rows.some((r) => !r.verdict.startsWith('!')),
      'corpus has no acceptances')
  })


  test('verdict-parity', () => {
    for (const row of rows) {
      const [norm, why] = normaliseRe(row.pattern)
      const got = '' === why ? norm : '!' + why
      Assert.equal(got, row.verdict,
        'regex-corpus.tsv line ' + row.line + ': ' + JSON.stringify(row.pattern))
    }
  })


  test('accepted-patterns-compile', () => {
    for (const row of rows) {
      if (row.verdict.startsWith('!')) {
        continue
      }
      // The `u` flag is part of the contract, not the test: it is what
      // makes JavaScript match code points as RE2 does.
      Assert.doesNotThrow(() => new RegExp(row.verdict, 'u'),
        'normalised form does not compile, line ' + row.line + ': ' +
        JSON.stringify(row.verdict))
    }
  })


  test('normalisation-is-idempotent', () => {
    for (const row of rows) {
      if (row.verdict.startsWith('!')) {
        continue
      }
      const [again, why] = normaliseRe(row.verdict)
      Assert.equal(why, '',
        'normalised form is refused on re-normalisation, line ' + row.line +
        ': ' + JSON.stringify(row.verdict) + ' -> ' + why)
      Assert.equal(again, row.verdict,
        'normalisation is not idempotent, line ' + row.line)
    }
  })


  // A LONG REPEAT BOUND IS REFUSED, and the same three inputs the Go
  // twin uses (go/regex_corpus_test.go). The COST is what differs
  // between the ports and it is why the two scans are written
  // differently: `digits += c` is a cons-string append in V8 and cost
  // nothing here, while the Go twin rebuilt an immutable string per
  // digit and took eight seconds on the first of these. The VERDICTS
  // are what must not differ, so they are asserted in both.
  test('a-long-repeat-bound-is-refused', () => {
    for (const n of [1000, 100000]) {
      const [, why] = normaliseRe('x{' + '1'.repeat(n) + '}')
      Assert.match(why, /repeat count above/, n + ' digits: ' + why)
    }

    const [, comma] = normaliseRe('x{2,' + '9'.repeat(100000) + '}')
    Assert.match(comma, /repeat count above/)

    // A long run of LEADING ZEROS is a small number, not an over-cap
    // one.
    const zeros = 'x{' + '0'.repeat(100000) + '5}'
    const [out, why] = normaliseRe(zeros)
    Assert.equal(why, '')
    Assert.equal(out, zeros)
  })

})
