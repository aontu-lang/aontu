/* Copyright (c) 2026 Richard Rodger, MIT License */


// G12 phase 18 (ADR-068): every schema of the official suite, in every
// dialect, comes back from import(export(import(S))) as import(S), canon
// for canon and subsuming both ways, or its group is a row of the ledger
// test/vectors/jsonschema/roundtrip.tsv.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { importJsonSchema } from '../dist/jsonschema-import'
import { jsonSchema } from '../dist/jsonschema'
import { subsume } from '../dist/subsume'
import { hcanon } from '../dist/hcanon'
import { exactJSON } from '../dist/exactjson'
import { VECTORS, rows, remotes, suiteGroups } from './suite'
import type { Group } from './suite'


const DIALECTS: [string, string | undefined][] = [['draft2020-12', undefined],
  ['draft2019-09', '2019-09'], ['draft7', 'draft-07'], ['draft6', 'draft-06'], ['draft4', 'draft-04']]


function settle(text: string): any {
  try {
    return new Aontu().unify(text)
  }
  catch (_e) {
    return undefined
  }
}


// Why a group's schema does not come back, or undefined where it does.
function roundTrip(g: Group, documents: Record<string, string>): string | undefined {
  const opts = { documents, formatAssertion: g.file.startsWith('optional/format/'), noMetaCheck: true }
  const first = importJsonSchema(g.schema, { ...opts, path: g.file, dialect: g.dialect })
  const v1 = 'error' === first.verdict ? undefined : settle(first.aontu)
  if (undefined === v1) {
    return 'error' === first.verdict ? undefined : 'the import does not stand'
  }
  const out = jsonSchema(first.aontu)
  if ('error' === out.verdict) {
    return 'the export refuses it'
  }
  const second = importJsonSchema(exactJSON(out.schema), opts)
  const v2 = 'error' === second.verdict ? undefined : settle(second.aontu)
  if (undefined === v2) {
    return 'the export does not import back'
  }
  if (hcanon(v1) === hcanon(v2)) {
    return undefined
  }
  const there = subsume(first.aontu, second.aontu).verdict
  const back = subsume(second.aontu, first.aontu).verdict
  return v1.canon !== v2.canon ? 'the canon differs' :
    'subsumes' === there && 'subsumes' === back ? undefined : `subsume answers ${there}, ${back}`
}


// The ledger may not grow past its bound; the register tightens it.
test('the-json-schema-test-suite-round-trips', () => {
  const ledger = rows(Path.join(VECTORS, 'jsonschema', 'roundtrip.tsv'))
  Assert.ok(ledger.length <= 47, `the round-trip ledger holds ${ledger.length} rows, past its bound`)
  const listed = new Map(ledger.map(([dir, file, group, construct]) =>
    [dir + ' | ' + file + ' | ' + group, construct]))
  const documents = remotes()
  const problems: string[] = []
  let total = 0
  for (const [dir, dialect] of DIALECTS) {
    for (const g of suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', dir), dialect)) {
      const key = dir + ' | ' + g.file + ' | ' + g.group
      const why = roundTrip(g, documents)
      total++
      if (undefined === why && listed.has(key)) {
        problems.push(`${key}: listed (${listed.get(key)}) and round-trips; delete its row`)
      }
      else if (undefined !== why && !listed.has(key)) {
        problems.push(`${key}: ${why}, with no ledger row`)
      }
      listed.delete(key)
    }
  }
  problems.push(...[...listed.keys()].map((key) => `${key}: listed and not in the suite; delete its row`))
  console.log(`round trip: ${total} groups, ${ledger.length} ledger rows`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
})
