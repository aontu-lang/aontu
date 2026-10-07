/* Copyright (c) 2026 Richard Rodger, MIT License */

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { IDNATABLE } from '../dist/idnatable'


test('idnatable-is-the-shared-table', () => {
  const shared = Fs.readFileSync(
    Path.join(__dirname, '..', '..', 'test', 'spec', 'files', 'idna.txt'), 'utf8')
  Assert.ok(IDNATABLE === shared,
    'ts/src/idnatable.ts does not match test/spec/files/idna.txt: run `make idna`')
})
