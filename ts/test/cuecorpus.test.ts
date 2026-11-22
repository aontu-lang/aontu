/* Copyright (c) 2026 Richard Rodger, MIT License */

// The comparison's probes under test/cue/ (task CG1 of
// sketch/LANG-REFINEMENT-PLAN.0.md) are held by shared rows (CG2): each
// aontu file must be the source of its row, so a file and its row can't
// drift apart. The CUE half is held by the daily workflow (CG3).

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

const REPO = Path.join(__dirname, '..', '..')
const CORPUS = Path.join(REPO, 'test', 'cue')


function rowsOf(file: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const line of Fs.readFileSync(Path.join(REPO, 'test', 'spec', file), 'utf8')
    .split('\n')) {
    const f = line.split('\t')
    if (!line.startsWith('#') && 4 <= f.length) {
      rows.set(f[0], f[2].replace(/\\n/g, '\n'))
    }
  }
  return rows
}


describe('cuecorpus', () => {
  const ids = Fs.readFileSync(Path.join(CORPUS, 'index.tsv'), 'utf8').split('\n')
    .filter((l) => '' !== l && !l.startsWith('#')).map((l) => l.split('\t')[0])

  test('every-probe-has-both-files-and-nothing-else-is-there', () => {
    Assert.equal(ids.length, 154)
    const want = ['index.tsv', ...ids.flatMap((id) => [id + '.aontu', id + '.cue'])]
    Assert.deepEqual(Fs.readdirSync(CORPUS).sort(), want.sort())
  })

  test('every-aontu-file-is-the-source-of-its-shared-row', () => {
    const cue = rowsOf('cue.tsv')
    const routes = rowsOf('comprehension.tsv')
    for (const id of ids) {
      const src = Fs.readFileSync(Path.join(CORPUS, id + '.aontu'), 'utf8')
      const row = id.startsWith('k') ? routes.get('routes-' + id) : cue.get('cue-' + id)
      Assert.equal(row + '\n', src, id)
    }
    Assert.equal(cue.size, ids.filter((id) => !id.startsWith('k')).length)
  })
})
