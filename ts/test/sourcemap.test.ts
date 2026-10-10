/* Copyright (c) 2026 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import { carry, locate, readSourceMap, textSha, vetOutput } from '../dist/sourcemap'
import type { SourceMap } from '../dist/sourcemap'
import type { VetReport } from '../dist/vet'


const SITE = { file: 'schema', len: 1, role: 'schema' as const }


describe('sourcemap', () => {
  test('carry-follows-a-key-the-formatter-writes-bare', () => {
    const printed = '{\n  "a"?: number\n}\n'
    const formatted = '{ a?:number }\n'
    const at = printed.indexOf('number')
    Assert.deepStrictEqual(carry(printed, formatted, [
      { start: 0, end: printed.length - 1 }, { start: at, end: at + 6 },
    ]), [{ start: 0, end: 13 }, { start: 5, end: 11 }])
  })

  test('carry-drops-a-range-whose-tokens-the-formatter-dropped', () => {
    const printed = 'a: { b: 1 }'
    Assert.deepStrictEqual(carry(printed, 'a: b: 1', [
      { start: 3, end: 4 }, { start: 3, end: 11 },
    ]), [undefined, { start: 3, end: 7 }])
  })

  test('carry-stops-at-the-first-token-that-differs', () => {
    Assert.deepStrictEqual(carry('a b c', 'a x c', [{ start: 0, end: 1 }, { start: 4, end: 5 }]),
      [{ start: 0, end: 1 }, undefined])
    Assert.deepStrictEqual(carry('a', 'a b', [{ start: 0, end: 1 }]), [{ start: 0, end: 1 }])
    Assert.deepStrictEqual(carry('a b', 'a', [{ start: 2, end: 3 }]), [undefined])
    Assert.deepStrictEqual(carry('a:b', 'a,:b', [{ start: 1, end: 2 }]), [{ start: 2, end: 3 }])
  })

  test('carry-skips-the-head-the-formatter-repeats', () => {
    const printed = '%d = {\n  "a": 1\n  "b": 2\n}\n'
    Assert.deepStrictEqual(carry(printed, '%d = a: 1\n%d = b: 2\n', [
      { start: 23, end: 24 }, { start: 5, end: 26 }, { start: 18, end: 24 },
    ]), [{ start: 18, end: 19 }, { start: 5, end: 19 }, { start: 15, end: 19 }])
  })

  test('carry-reads-a-key-the-head-repeats-as-the-key', () => {
    const printed = 'a: {\n  "b": 1\n  "a": 2\n}\n'
    Assert.deepStrictEqual(carry(printed, 'a: b: 1\na: a: 2\n', [
      { start: 16, end: 19 }, { start: 16, end: 22 },
    ]), [{ start: 11, end: 12 }, { start: 11, end: 15 }])
  })

  test('carry-keeps-a-line-that-starts-as-the-one-before', () => {
    const text = 'meta(\n  x\n)\nmeta(meta(y))\nz\n'
    Assert.deepStrictEqual(carry(text, text, [
      { start: 22, end: 23 }, { start: 12, end: 25 }, { start: 26, end: 27 },
    ]), [{ start: 22, end: 23 }, { start: 12, end: 25 }, { start: 26, end: 27 }])
  })

  test('carry-counts-utf-8-bytes', () => {
    Assert.deepStrictEqual(carry('"é" | "😀" | x', '"é"|"😀"|x', [{ start: 13, end: 14 }]),
      [{ start: 12, end: 13 }])
  })

  test('a-map-read-back-must-have-the-shape-the-importer-writes', () => {
    const sha = textSha('x')
    const span = { start: 0, end: 1, frame: 0, keyword: '', absolute: 'a:/b#' }
    const map = (spans: any[]): string => JSON.stringify({ sha256: sha, spans })
    Assert.deepStrictEqual(readSourceMap(map([span, { ...span, enters: 1, required: true }])),
      { sha256: sha, spans: [span, { ...span, enters: 1, required: true }] })
    for (const bad of ['not json', 'null', '[]', JSON.stringify({ sha256: 'x', spans: [] }),
      JSON.stringify({ sha256: sha }), map([null]), map([{ ...span, start: -1 }]),
      map([{ ...span, end: 1.5 }]), map([{ ...span, keyword: 1 }]),
      map([{ ...span, enters: -1 }]), map([{ ...span, required: false }])]) {
      Assert.strictEqual(readSourceMap(bad), undefined, bad)
    }
  })

  test('a-chain-no-instance-spells-takes-the-first-reference', () => {
    const map: SourceMap = {
      sha256: textSha('x'), spans: [
        { start: 0, end: 4, frame: 1, keyword: '/minimum', absolute: 'a:/s#/$defs/d/minimum' },
        { start: 6, end: 9, frame: 0, keyword: '/properties/a/$ref', absolute: 'a:/s#/x', enters: 1 },
      ],
    }
    Assert.deepStrictEqual(locate(map, 'min(1) %d', { ...SITE, row: 1, col: 1 }, ['b'], false),
      { keyword: '/properties/a/$ref/minimum', absolute: 'a:/s#/$defs/d/minimum', instance: ['b'] })
    Assert.strictEqual(locate(map, 'min(1) %d', { ...SITE, row: 1, col: 10 }, [], false), undefined)
  })

  test('a-reference-that-takes-no-step-reaches-the-root-only-with-the-path-spent', () => {
    const map: SourceMap = {
      sha256: textSha('x'), spans: [
        { start: 0, end: 4, frame: 1, keyword: '/minimum', absolute: 'a:/s#/$defs/d/minimum' },
        { start: 6, end: 9, frame: 0, keyword: '/$ref', absolute: 'a:/s#/$ref', enters: 1 },
      ],
    }
    Assert.deepStrictEqual(locate(map, 'min(1) %d', { ...SITE, row: 1, col: 1 }, ['b'], false),
      { keyword: '/$ref/minimum', absolute: 'a:/s#/$defs/d/minimum', instance: ['b'] })
  })

  test('the-flag-form-is-the-verdict-alone', () => {
    const report: VetReport = { verdict: 'incomplete', truncated: false, findings: [] }
    Assert.deepStrictEqual(vetOutput(report, 'flag'), { valid: false })
    Assert.deepStrictEqual(vetOutput({ ...report, verdict: 'valid' }, 'basic'), { valid: true })
  })

  test('a-unit-is-an-error-and-one-with-no-schema-site-is-unlocated', () => {
    const report: VetReport = {
      verdict: 'invalid', truncated: false, findings: [
        { code: 'deprecated', class: 'compat', severity: 'warning', path: '$', pointer: '',
          message: 'old', sites: [] },
        { code: 'syntax', class: 'parse', severity: 'error', path: '$.a', pointer: '/a',
          message: 'bad', sites: [{ ...SITE, role: 'data', row: 1, col: 1 }] },
        { code: 'syntax', class: 'parse', severity: 'error', path: '$', message: 'bare', sites: [] },
      ],
    }
    Assert.deepStrictEqual(vetOutput(report, 'basic', { text: 'x', map: { sha256: textSha('x'), spans: [] } }), {
      valid: false, keywordLocation: '', instanceLocation: '',
      errors: [{ valid: false, keywordLocation: '', instanceLocation: '/a', error: 'bad' },
        { valid: false, keywordLocation: '', instanceLocation: '', error: 'bare' }],
    })
  })
})
