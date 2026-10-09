/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { UNICODE_PROPS } from '../dist/unicodeprops'


describe('regex', () => {

  // One generated table, staged into both ports: the copy each reads
  // must be the same bytes, or the two would match different code
  // points under one property name.
  test('unicode-tables-are-the-go-tables', () => {
    const go = Fs.readFileSync(
      Path.join(__dirname, '..', '..', 'go', 'unicodeprops.txt'), 'utf8')
    Assert.ok(UNICODE_PROPS.startsWith('# GENERATED'), 'the table has no header')
    Assert.equal(UNICODE_PROPS, go)
  })

})
