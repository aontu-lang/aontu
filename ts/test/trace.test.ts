/* Copyright (c) 2026 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import { traceRun } from '../dist/trace'


const DOC = `%r = emit(_, { match: n: string body: ["L" + .n] })
svc: { a: { n:"a" } }
out: file("x.ts", emit($.svc, %r))
`


describe('trace', () => {

  test('names-the-file-the-node-and-the-rule', () => {
    const report = traceRun(DOC, {})
    Assert.strictEqual(report.verdict, 'ok')
    Assert.deepStrictEqual(report.trace, [{
      file: 'x.ts',
      at: '$.children.0',
      node: '$.svc.a',
      rule: '$.%r#0',
    }])
  })


  test('reads-an-explicit-anchor', () => {
    const src = DOC.replace('out:', 'elsewhere:')
    // The default anchor is `$.out`, which this document does not have.
    Assert.strictEqual(traceRun(src, {}).verdict, 'error')
    Assert.strictEqual(traceRun(src, { at: '$.elsewhere' }).verdict, 'ok')
    Assert.strictEqual(traceRun(src, { at: '$.nowhere' }).verdict, 'error')
  })


  test('answers-findings-rather-than-throwing', () => {
    const bad = traceRun('out: file(', {})
    Assert.strictEqual(bad.verdict, 'error')
    Assert.ok(0 < (bad.errors ?? []).length)

    // Parses, does not unify.
    Assert.strictEqual(traceRun('out: 1 & "x"\n', {}).verdict, 'error')
  })


  // A PIECE OUTSIDE EVERY FILE IS NOT TRACED. The tree is what the
  // entries attribute to, so a rule that wrote no file has nothing to
  // name.
  test('skips-a-piece-that-reached-no-file', () => {
    const report = traceRun(
      'svc: { a: { n:"a" } }\n' +
      'out: emit($.svc, { match: n: string body: ["loose"] })\n', {})
    Assert.strictEqual(report.verdict, 'ok')
    Assert.deepStrictEqual(report.trace, [])
  })


  test('options-are-optional', () => {
    Assert.strictEqual(traceRun(DOC).verdict, 'ok')
  })

})
