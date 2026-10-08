/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { resolveUri, normalizeUri } from '../dist/uri'


const CORPUS = Path.join(
  __dirname, '..', '..', 'test', 'spec', 'files', 'uri-corpus.tsv')


type Row = { base: string, ref: string, target: string, canonical: string, line: number }


function loadCorpus(): Row[] {
  const rows: Row[] = []
  let line = 0
  for (const raw of Fs.readFileSync(CORPUS, 'utf8').split('\n')) {
    line++
    if ('' === raw || raw.startsWith('#')) {
      continue
    }
    const [base, ref, target, canonical] = raw.split('\t')
    rows.push({ base, ref, target, canonical, line })
  }
  return rows
}


describe('uri-corpus', () => {

  const rows = loadCorpus()

  test('corpus-is-loaded', () => {
    // An empty or truncated corpus would make the parity check vacuous.
    Assert.ok(400 < rows.length, 'corpus too small: ' + rows.length)
  })

  test('resolution-parity', () => {
    for (const row of rows) {
      const target = resolveUri(row.base, row.ref)
      Assert.equal(target, row.target, 'uri-corpus.tsv line ' + row.line)
      Assert.equal(normalizeUri(target), row.canonical, 'uri-corpus.tsv line ' + row.line)
    }
  })

  test('a-reference-without-a-scheme-normalises', () => {
    // Go's TestURIReferenceNormalises asks the same.
    Assert.equal(normalizeUri('../A/%7ex?%7e#F%2f'), '../A/~x?~#F%2F')
  })

})
