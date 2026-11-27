/* Copyright (c) 2026 Richard Rodger, MIT License */

// The subsume differential: test/spec/def-subsume-rows.tsv holds the
// answers the definition's contract allows for the rows of
// test/spec/subsume.tsv it reads, under the row's name with `def-` in
// front. Each golden verdict must be one of them, and each document the
// definition read must unify as the row's own does.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu } from '../dist/aontu'
import { hcanon } from '../dist/hcanon'


const SPEC = Path.join(__dirname, '..', '..', 'test', 'spec')

const unesc = (t: string) =>
  t.replace(/\\(.)/g, (_, c) => 'n' === c ? '\n' : 't' === c ? '\t' : c)

function rows(file: string): string[][] {
  return Fs.readFileSync(Path.join(SPEC, file), 'utf8').split('\n')
    .filter((l) => '' !== l && !l.startsWith('#'))
    .map((l) => l.split('\t'))
}

function canon(src: string): string {
  return hcanon(new Aontu().unify(src))
}


describe('subsume-contract', () => {
  const golden = new Map(rows('subsume.tsv')
    .filter((r) => 'subsume' === r[1])
    .map((r) => [r[0], r]))
  const contract = rows('def-subsume-rows.tsv')

  test('every-contract-row-names-a-golden-row', () => {
    Assert.ok(100 < contract.length, `only ${contract.length} rows`)
    for (const c of contract) {
      Assert.ok(golden.has(c[0].replace(/^def-/, '')), c[0])
    }
  })

  test('every-golden-verdict-is-one-the-contract-allows', () => {
    for (const c of contract) {
      const g = golden.get(c[0].replace(/^def-/, '')) as string[]
      const want: string[] = JSON.parse(unesc(c[4])).verdict
      const got: string = JSON.parse(unesc(g[4])).verdict
      Assert.ok(want.includes(got), `${g[0]}: ${got}, where the contract allows ${want}`)
    }
  })

  test('every-document-reads-as-the-definition-read-it', () => {
    for (const c of contract) {
      const g = golden.get(c[0].replace(/^def-/, '')) as string[]
      Assert.strictEqual(canon(unesc(c[2])), canon(unesc(g[2])), `${g[0]}: general`)
      Assert.strictEqual(canon(unesc(c[3])), canon(unesc(g[3])), `${g[0]}: specific`)
    }
  })
})
