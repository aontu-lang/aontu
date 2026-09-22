/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { AONTU_SCHEME, AONTU_SOURCES, AONTU_MODELS } from '../dist/aontumodel'


const REPO = Path.join(__dirname, '..', '..')
const TREE = Path.join(REPO, 'aontu')


// Every .aontu is a module, named by its path; a file named after the
// directory holding it collapses, so aontu/profile/profile.aontu is
// `aontu:profile` and aontu/lang/text.aontu is `aontu:lang/text`.
function walk(dir: string, rel: string, found: string[]): string[] {
  for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
    const subrel = rel ? rel + '/' + entry.name : entry.name
    if (entry.isDirectory()) {
      walk(Path.join(dir, entry.name), subrel, found)
      continue
    }
    if (!entry.name.endsWith('.aontu')) { continue }
    const part = subrel.slice(0, -'.aontu'.length).split('/')
    if (1 < part.length && part[part.length - 1] === part[part.length - 2]) {
      part.pop()
    }
    found.push(AONTU_SCHEME + part.join('/'))
  }
  return found
}


function leafOf(name: string): string {
  const rel = name.slice(AONTU_SCHEME.length).split('/')
  const deep = Path.join(TREE, ...rel, rel[rel.length - 1] + '.aontu')
  return Fs.existsSync(deep) ? deep : Path.join(TREE, ...rel) + '.aontu'
}


describe('aontumodel', () => {

  // A generated copy that nothing compares is a second source of truth
  // waiting to drift.
  test('sources-are-identical-with-the-tree', () => {
    Assert.ok(0 < AONTU_MODELS.length, 'no models: has the generator run?')
    for (const name of AONTU_MODELS) {
      const text = Fs.readFileSync(leafOf(name), 'utf8')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n')
      Assert.equal(AONTU_SOURCES[name], text,
        name + ' is stale against aontu/ — run `make aontu`')
    }
  })

  test('tree-serves-exactly-the-listed-models', () => {
    Assert.deepEqual(AONTU_MODELS, walk(TREE, '', []).sort(),
      'aontu/ and AONTU_MODELS disagree — run `make aontu`')
    Assert.deepEqual(AONTU_MODELS, [...AONTU_MODELS].sort(),
      'AONTU_MODELS is not sorted')
    Assert.deepEqual(Object.keys(AONTU_SOURCES).sort(), AONTU_MODELS)
  })

  test('every-name-carries-the-scheme', () => {
    for (const name of AONTU_MODELS) {
      Assert.ok(name.startsWith(AONTU_SCHEME), name)
    }
  })
})
