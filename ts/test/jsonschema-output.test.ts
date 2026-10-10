/* Copyright (c) 2026 Richard Rodger, MIT License */


// The official suite's output tests (ADR-066). Each schema is imported
// with its source map, each instance vetted as JSON Schema asks, and the
// report's basic output units checked against the schema the test gives
// for them, by the importer and vet themselves, against the ledger
// test/vectors/jsonschema/output-tests/skips.tsv.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { exactJSON } from '../dist/exactjson'
import { importJsonSchema } from '../dist/jsonschema-import'
import { vet } from '../dist/vet'
import { vetOutput } from '../dist/sourcemap'


const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'jsonschema', 'output-tests')

// The ledger may not grow past this; the register tightens it per phase.
const SKIP_BOUND = 4

// Each release's directory, and the dialect its schemas are read in.
const RELEASES: [string, string][] = [['draft2019-09', '2019-09'], ['draft2020-12', '2020-12']]

const VET = { noFill: true, exactNumbers: true }


test('the-suites-output-tests-check-the-basic-units', () => {
  const skips = Fs.readFileSync(Path.join(DIR, 'skips.tsv'), 'utf8').split('\n')
    .filter((l) => '' !== l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t')).map(([file, group, name, construct]) =>
      ({ file, group, test: name, construct, used: false }))
  Assert.ok(skips.length <= SKIP_BOUND,
    `the output ledger holds ${skips.length} rows, past its bound of ${SKIP_BOUND}`)

  const problems: string[] = []
  let total = 0
  let passed = 0
  for (const [release, dialect] of RELEASES) {
    const outputSchema = Fs.readFileSync(Path.join(DIR, release, 'output-schema.json'), 'utf8')
    const documents = { [JSON.parse(outputSchema).$id]: outputSchema }
    for (const name of Fs.readdirSync(Path.join(DIR, release, 'content')).sort()) {
      const file = release + '/content/' + name
      for (const g of JSON.parse(Fs.readFileSync(Path.join(DIR, file), 'utf8'))) {
        const imported = importJsonSchema(JSON.stringify(g.schema), { dialect, sourceMap: true })
        for (const t of g.tests) {
          total++
          const report = vet(imported.aontu, JSON.stringify(t.data), VET)
          const output = vetOutput(report, 'basic',
            { text: imported.aontu, map: imported.map as any })
          const check = importJsonSchema(JSON.stringify(t.output.basic), { dialect, documents })
          const verdict = vet(check.aontu, exactJSON(output), VET).verdict
          const skip = skips.find((s) => s.file === file && s.group === g.description &&
            s.test === t.description)
          if ('valid' === verdict) {
            passed++
            if (null != skip) {
              problems.push(`${file} | ${g.description} | ${t.description}: listed as a ` +
                `skip (${skip.construct}) and passes; delete its row`)
            }
          }
          else if (null == skip) {
            problems.push(`${file} | ${g.description} | ${t.description}: the output ` +
              `${exactJSON(output)} is ${verdict} against the test's schema, with no skip listed`)
          }
          else {
            skip.used = true
          }
        }
      }
    }
  }
  for (const s of skips) {
    if (!s.used) {
      problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
        'and nothing under it fails; delete its row')
    }
  }
  console.log(`output: ${total} tests, ${passed} pass, ${skips.length} ledger rows`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
})
