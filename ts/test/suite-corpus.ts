/* Copyright (c) 2026 Richard Rodger, MIT License */


// The vendored JSON Schema corpora through the importer and `vet
// --no-fill --exact-numbers`, each against its own skip ledger, as
// test/vectors/README.md describes. The three jsonschema-suite*.test.ts
// files run the corpora, one dialect group each, so that no one of
// them is longer than a sampled group allows (ts/test/groups.tsv).

import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { importJsonSchema } from '../dist/jsonschema-import'
import { vet } from '../dist/vet'
import { admits } from '../dist/admit'
import { VECTORS, rows } from './suite'
import type { Group } from './suite'


type Skip = { file: string, group: string, test: string, construct: string, used: boolean }

function readSkips(ledger: string): Skip[] {
  return rows(ledger).map(([file, group, name, construct]) =>
    ({ file, group, test: name, construct, used: false }))
}


// The whole file, the whole group, or the one test, in that order.
function listed(skips: Skip[], file: string, group: string, name: string): Skip | undefined {
  return skips.find((s) => s.file === file && '*' === s.group) ??
    skips.find((s) => s.file === file && s.group === group && '*' === s.test) ??
    skips.find((s) => s.file === file && s.group === group && s.test === name)
}


// JSONTestSuite's shape: one JSON text per file, read as an instance of
// `true`; an implementation-defined file takes the answer pinned for it.
export function parsingGroups(dir: string): Group[] {
  const decided = new Map(rows(Path.join(dir, 'decisions.tsv'))
    .map(([file, valid]) => [file, 'true' === valid]))
  const cases = Path.join(dir, 'test_parsing')
  return Fs.readdirSync(cases).sort().map((file) => {
    const want = 'y' === file[0] || ('n' !== file[0] && true === decided.get(file))
    Assert.ok('i' !== file[0] || decided.has(file), file + ' has no answer in decisions.tsv')
    return {
      file, group: file[0], schema: 'true',
      cases: [{ test: 'parse', data: Fs.readFileSync(Path.join(cases, file), 'utf8'), want }],
    }
  })
}


export function runCorpus(name: string, bound: number, groups: Group[],
  documents?: Record<string, string>): void {
  const skips = readSkips(Path.join(VECTORS, name))
  Assert.ok(skips.length <= bound,
    `the ${name} ledger holds ${skips.length} rows, past its bound of ${bound}`)

  const problems: string[] = []
  let total = 0
  let passed = 0
  let skipped = 0
  const aontu = new Aontu()

  for (const g of groups) {
    // The suite's optional/format/ asks for format assertion (ADR-059).
    const report = importJsonSchema(g.schema, {
      path: g.file, documents, formatAssertion: g.file.startsWith('optional/format/'),
      dialect: g.dialect,
    })
    for (const c of g.cases) {
      total++
      let got = false
      if ('error' !== report.verdict) {
        got = 'valid' === vet(report.aontu, c.data, { noFill: true, exactNumbers: true }).verdict

        // The differential: the admission trial of the imported schema
        // over the exact instance answers as vet does.
        const sctx = aontu.ctx({ collect: true })
        const sval = aontu.parse(report.aontu, {}, sctx)
        const dctx = aontu.ctx({ collect: true })
        const dval = aontu.parse(c.data, { exactNumbers: true }, dctx)
        if (0 === sctx.err.length && 0 === dctx.err.length && null != sval && null != dval) {
          const admitted = admits(aontu, sval, dval)
          if (admitted !== got) {
            problems.push(`${g.file} | ${g.group} | ${c.test}: vet says ${got}, ` +
              `the admission trial says ${admitted}`)
          }
        }
      }
      const skip = listed(skips, g.file, g.group, c.test)
      if (got === c.want) {
        passed++
        if (null != skip && '*' !== skip.test) {
          problems.push(`${g.file} | ${g.group} | ${c.test}: listed as a skip ` +
            `(${skip.construct}) and passes; delete its row`)
        }
      }
      else if (null == skip) {
        problems.push(`${g.file} | ${g.group} | ${c.test}: wanted valid=${c.want} ` +
          `and got valid=${got}, with no skip listed`)
      }
      else {
        skip.used = true
        skipped++
      }
    }
  }

  for (const s of skips) {
    if (!s.used) {
      problems.push(`${s.file} | ${s.group} | ${s.test}: listed as a skip (${s.construct}) ` +
        'and nothing under it fails; delete its row')
    }
  }

  console.log(`${name}: ${total} tests, ${passed} pass, ${skipped} skipped, ` +
    `${skips.length} ledger rows`)
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
}
