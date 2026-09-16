/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { get } from '../dist/aontu'
import { nearestKey, pathParts } from '../dist/query'


describe('query', () => {

  test('defaults-to-the-json-view', () => {
    // No options at all: the whole document, generated.
    const r = get('a:{b:1}', '$.a')
    Assert.equal(r.ok, true)
    Assert.equal(r.out, '{\n  "b": 1\n}')
    Assert.deepEqual(r.findings, [])
  })

  test('a-refusal-is-a-g2-finding', () => {
    // `get` invents no error format: the refusal is the same finding
    // object vet and subsume report, so one consumer reads all three.
    const r = get('a:{b:1}', '$.a.c')
    Assert.equal(r.ok, false)
    Assert.equal(r.out, '')
    Assert.equal(r.findings.length, 1)
    const f = r.findings[0]
    Assert.equal(f.code, 'no_path')
    Assert.equal(f.class, 'reference')
    Assert.equal(f.severity, 'error')
    Assert.equal(f.path, '$.a.c')
    Assert.deepEqual(f.sites, [])
    Assert.match(f.message, /names nothing/)
  })

  test('relative-loads-resolve-from-the-documents-own-directory', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-query-'))
    Fs.writeFileSync(Path.join(dir, 'part.aon'), 'k: 7')
    const doc = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(doc, 'a: @"./part.aon"')
    Assert.equal(
      get('a: @"./part.aon"', '$.a.k', { path: doc, view: 'canon' }).out, '7')
  })

  test('nearest-key-suggests-only-when-close', () => {
    Assert.equal(nearestKey('imag', ['image', 'ports']), 'image')
    Assert.equal(nearestKey('image', []), undefined)
    Assert.equal(nearestKey('replicas', ['image']), undefined)
    // A one-character name still gets its one-character neighbour.
    Assert.equal(nearestKey('a', ['b']), 'b')
  })

  test('path-parts-drops-the-root-and-empty-segments', () => {
    Assert.deepEqual(pathParts('$'), [])
    Assert.deepEqual(pathParts(''), [])
    Assert.deepEqual(pathParts('$.'), [])
    Assert.deepEqual(pathParts('$.a.b'), ['a', 'b'])
    // Written without the root marker, as a reference may be.
    Assert.deepEqual(pathParts('a.b'), ['a', 'b'])
  })

})
