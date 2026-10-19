/* Copyright (c) 2026 Richard Rodger, MIT License */


// G12 phase 18 (ADR-068): every schema of the pinned SchemaStore subset
// comes back from import(export(import(S))) as import(S), as the official
// suite's do, or it is a row of the ledger
// test/vectors/jsonschema/schemastore/roundtrip.tsv.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { STORE, rows, roundTrip, storeDocuments } from './suite'


// The ledger may not grow past its bound; the register tightens it.
test('the-schemastore-subset-round-trips', () => {
  const ledger = rows(Path.join(STORE, 'roundtrip.tsv'))
  Assert.ok(ledger.length <= 6, `the SchemaStore ledger holds ${ledger.length} rows, past its bound`)
  const listed = new Map(ledger.map(([file, construct]) => [file, construct]))
  const names = Fs.readdirSync(Path.join(STORE, 'schemas')).filter((f) => f.endsWith('.json')).sort()
  const docs = storeDocuments(names)
  const problems: string[] = []
  const start = Date.now()
  for (const name of names) {
    const schema = Fs.readFileSync(Path.join(STORE, 'schemas', name), 'utf8')
    const why = roundTrip(schema, { documents: docs, path: name })
    if (undefined === why && listed.has(name)) {
      problems.push(`${name}: listed (${listed.get(name)}) and round-trips; delete its row`)
    }
    else if (undefined !== why && !listed.has(name)) {
      problems.push(`${name}: ${why}, with no ledger row`)
    }
    listed.delete(name)
  }
  problems.push(...[...listed.keys()].map((name) => `${name}: listed and not vendored; delete its row`))
  console.log(`schemastore round trip: ${names.length} schemas, ${ledger.length} ledger rows, ` +
    `${Date.now() - start} ms`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
})
