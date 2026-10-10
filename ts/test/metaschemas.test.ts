/* Copyright (c) 2026 Richard Rodger, MIT License */


import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { META_SCHEMAS, META_SCHEMA_LICENSE } from '../dist/metaschemas'


const DIR = Path.join(__dirname, '..', '..', 'test', 'vectors', 'json-schema-spec')
const read = (at: string): string => Fs.readFileSync(at, 'utf8').replaceAll('\r\n', '\n')


test('the-staged-meta-schemas-are-the-vendored-documents', () => {
  const want: Record<string, string> = {}
  const walk = (at: string): void => {
    for (const e of Fs.readdirSync(at, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(Path.join(at, e.name))
      }
      else if (e.name.endsWith('.json')) {
        const text = read(Path.join(at, e.name))
        const doc = JSON.parse(text)
        want[(doc.$id ?? doc.id).replace(/#$/, '')] = text
      }
    }
  }
  walk(DIR)
  Assert.deepEqual(META_SCHEMAS, want,
    'ts/src/metaschemas.ts is not test/vectors/json-schema-spec/: run make metaschemas')
  Assert.equal(META_SCHEMA_LICENSE, read(Path.join(DIR, 'LICENSE')))
})
