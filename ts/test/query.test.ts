/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { get, why } from '../dist/aontu'
import { evalFailure, nearestKey, pathParts } from '../dist/query'
import { setColor } from '../dist/err'
import { hints } from '../dist/hints'


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

  test('an-engine-code-takes-its-class-from-the-registry', () => {
    // The registry wins: the report layer mints no class of its own.
    const r = get('out: folder("src", [line("x")])', '$.out')
    Assert.equal(r.ok, false)
    const f = r.findings[0]
    Assert.equal(f.code, 'invalid-arg')
    Assert.equal(f.class, 'conflict')
    Assert.equal(f.path, '$')
    Assert.deepEqual(f.sites, [])

    // One line, with the repair beside it rather than inside it.
    Assert.equal(
      f.message, '[aontu/invalid-arg]: Cannot children values at path $.out')
    Assert.match(f.hint as string, /^Invalid argument provided\./)
  })


  test('an-engine-message-is-materialised-before-its-first-line', () => {
    // A nil minted in `gen` has no message until the engine renders it.
    const r = get('out: {a: string}', '$.out')
    Assert.equal(r.ok, false)
    const f = r.findings[0]
    Assert.equal(f.code, 'mapval_no_gen')
    Assert.equal(f.class, 'incomplete')
    Assert.equal(
      f.message, '[aontu/mapval_no_gen]: Cannot resolve value at path $.out.a')
    Assert.equal(f.path, '$.out')
  })


  // A PARSE-CLASS FINDING CARRIES THE REGISTRY HINT like any other.
  test('a-parse-code-carries-the-registry-hint', () => {
    const r = why('a:]', '$')
    Assert.equal(r.ok, false)
    const f = r.findings[0]
    Assert.equal(f.code, 'syntax')
    Assert.equal(f.class, 'parse')
    Assert.equal(f.hint, hints['syntax'])
  })


  test('an-engine-message-carries-no-terminal-escapes', () => {
    // Nothing sets colour off for a library or MCP consumer.
    setColor(true)
    try {
      const f = get('out: folder("src", [line("x")])', '$.out').findings[0]
      Assert.ok(!f.message.includes('\u001b'), f.message)
      Assert.ok(!(f.hint as string).includes('\u001b'), f.hint as string)
    }
    finally {
      setColor(undefined)
    }
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

  test('a-failure-with-no-code-is-the-generic-finding', () => {
    // Neither a collected error nor a failed value, which is what the
    // Go port's nil error is (EvalFailure, go/query_test.go).
    const f: any = evalFailure({ err: [] })
    Assert.equal(f.code, 'unify_failed')
    Assert.equal(f.class, 'internal')
    Assert.equal(f.path, '$')
    Assert.equal(f.message, 'The document does not evaluate.')
    Assert.deepEqual(f.sites, [])
  })

})
