/* Copyright (c) 2025 Richard Rodger, MIT License */

// The diff API around the shared rows (G7 phase 6). Every change kind
// and every path shape is pinned by test/spec/diff.tsv in both ports;
// what is left here is the options, which no row exercises.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { diff } from '../dist/aontu'


describe('diff', () => {

  test('root-change-is-reported-at-the-root', () => {
    const r = diff('a: 1', '[1]')
    Assert.equal(r.ok, true)
    Assert.deepEqual(r.changes.map((c) => c.path), ['$'])
    Assert.equal(r.changes[0].kind, 'changed')
  })

  test('each-side-resolves-includes-from-its-own-directory', () => {
    const left = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-diff-l-'))
    const right = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-diff-r-'))
    Fs.writeFileSync(Path.join(left, 'part.aontu'), 'k: 1')
    Fs.writeFileSync(Path.join(right, 'part.aontu'), 'k: 2')
    // The entry file has to EXIST: the resolver stats it to root the
    // relative load, exactly as it does for `aontu <file>`.
    Fs.writeFileSync(Path.join(left, 'doc.aontu'), 'a: @"./part.aontu"')
    Fs.writeFileSync(Path.join(right, 'doc.aontu'), 'a: @"./part.aontu"')

    const r = diff('a: @"./part.aontu"', 'a: @"./part.aontu"', {
      leftPath: Path.join(left, 'doc.aontu'),
      rightPath: Path.join(right, 'doc.aontu'),
    })
    Assert.equal(r.ok, true)
    Assert.deepEqual(r.changes,
      [{ kind: 'changed', left: '1', path: '$.a.k', right: '2' }])
  })

})
