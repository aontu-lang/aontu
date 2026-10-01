/* Copyright (c) 2026 Richard Rodger, MIT License */


// The JSON Schema importer's paths no shared row reaches: the copy budget
// a root that is not a map spends on references, which a row would
// have to pin as kilobytes of text.

import { test } from 'node:test'
import * as Assert from 'node:assert'

import { agreedForm, importJsonSchema } from '../dist/jsonschema-import'


test('copies-past-the-budget-admit-anything-and-say-so', () => {
  // Each level references the one below twice, so the copies double.
  const defs: Record<string, any> = { d0: { type: 'integer' } }
  for (let i = 1; i < 14; i++) {
    defs['d' + i] = { allOf: [{ $ref: '#/$defs/d' + (i - 1) }, { $ref: '#/$defs/d' + (i - 1) }] }
  }
  const report = importJsonSchema(JSON.stringify({
    minimum: 0, allOf: [{ $ref: '#/$defs/d13' }], $defs: defs,
  }))
  Assert.equal(report.verdict, 'lossy')
  Assert.ok(report.lossy.some((l) => '$ref' === l.construct && /budget/.test(l.reason)),
    JSON.stringify(report.lossy))
})


// Within the nesting bound the formatter reads every text the importer
// writes, so only a stand-in that refuses can show the text kept as written.
test('a-refused-format-keeps-the-text-as-written', () => {
  Assert.equal(agreedForm('a: 1\n', () => ({ verdict: 'error', errors: [] })), 'a: 1\n')
})
