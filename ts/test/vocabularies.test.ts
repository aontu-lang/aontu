/* Copyright (c) 2026 Richard Rodger, MIT License */


import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { VOCABULARY_TABLE } from '../dist/vocabularies'


const TABLE = Path.join(__dirname, '..', '..', 'grammar', 'jsonschema', 'vocabularies.tsv')


test('the-staged-vocabulary-table-is-the-committed-table', () => {
  Assert.equal(VOCABULARY_TABLE, Fs.readFileSync(TABLE, 'utf8').replaceAll('\r\n', '\n'),
    'ts/src/vocabularies.ts is not grammar/jsonschema/vocabularies.tsv: run make vocabularies')
})
