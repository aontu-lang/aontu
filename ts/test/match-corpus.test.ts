/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { compilePattern, patternMatches, exportForm, importForm, ecmaWhy } from '../dist/regex'


const CORPUS = Path.join(
  __dirname, '..', '..', 'test', 'spec', 'files', 'match-corpus.tsv')


type Row = {
  pattern: string, texts: string[], match: string, exported: string, imported: string,
  regex: string, line: number
}


function loadCorpus(): Row[] {
  const rows: Row[] = []
  const text = Fs.readFileSync(CORPUS, 'utf8').replaceAll('\r\n', '\n')
  let line = 0
  for (const raw of text.split('\n')) {
    line++
    if ('' === raw || raw.startsWith('#')) {
      continue
    }
    const [pattern, texts, match, exported, imported, regex] = raw.split('\t')
    rows.push({
      pattern: JSON.parse(pattern), texts: JSON.parse(texts), match,
      exported: JSON.parse(exported), imported: JSON.parse(imported), regex, line,
    })
  }
  return rows
}


const form = ([out, why]: [string, string]): string => '' === why ? out : '!' + why


describe('match-corpus', () => {

  const rows = loadCorpus()

  test('corpus-is-loaded', () => {
    // A guard on the guard: a truncated corpus, or one that never
    // matches or never refuses, would leave the checks below vacuous.
    Assert.ok(500 < rows.length, 'corpus too small: ' + rows.length)
    Assert.ok(rows.some((r) => r.match.startsWith('!')), 'corpus has no refusals')
    Assert.ok(rows.some((r) => r.match.includes('1')), 'corpus has no match')
    Assert.ok(rows.some((r) => /^[01]*0[01]*$/.test(r.match)), 'corpus has no mismatch')
  })


  test('verdict-parity', () => {
    for (const r of rows) {
      const [prog, why] = compilePattern(r.pattern, 'aontu')
      const got = undefined === prog ? '!' + why :
        r.texts.map((s) => patternMatches(prog, s) ? '1' : '0').join('')
      Assert.equal(got, r.match, 'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern))
    }
  })


  test('export-parity', () => {
    for (const r of rows) {
      Assert.equal(form(exportForm(r.pattern)), r.exported,
        'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern))
    }
  })


  test('import-parity', () => {
    for (const r of rows) {
      Assert.equal(form(importForm(r.pattern)), r.imported,
        'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern))
    }
  })


  test('regex-parity', () => {
    for (const r of rows) {
      const why = ecmaWhy(r.pattern)
      Assert.equal('' === why ? 'ok' : '!' + why, r.regex,
        'match-corpus.tsv line ' + r.line + ': ' + JSON.stringify(r.pattern))
    }
  })


  // What the exporter writes means what re() means: read back as re()
  // source, the export agrees with the pattern on every text.
  test('export-round-trips', () => {
    for (const r of rows) {
      if (r.exported.startsWith('!')) {
        continue
      }
      const back = importForm(r.exported)
      Assert.equal(back[1], '', 'line ' + r.line + ': the export does not import: ' + back[1])
      const [prog] = compilePattern(back[0], 'aontu')
      Assert.equal(r.texts.map((s) => patternMatches(prog as any, s) ? '1' : '0').join(''), r.match,
        'match-corpus.tsv line ' + r.line + ': the export means otherwise')
    }
  })

})
