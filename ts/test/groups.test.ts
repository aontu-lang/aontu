/* Copyright (c) 2026 Richard Rodger, MIT License */

// The sampled groups cover the suite: a test file in no group is never
// run by the standard CI, and only this and `--check` would say so.

import { test } from 'node:test'
import * as Assert from 'node:assert'
import * as Path from 'node:path'

const { check } = require(Path.join(__dirname, '..', 'scripts', 'test-group.cjs'))


test('every-test-file-is-in-exactly-one-group', () => {
  const { groups, problems } = check()
  Assert.deepStrictEqual(problems, [], problems.join('\n'))
  Assert.ok(2 <= groups.size, `only ${groups.size} group(s)`)
})
