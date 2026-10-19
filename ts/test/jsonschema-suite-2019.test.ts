/* Copyright (c) 2026 Richard Rodger, MIT License */


// The dialect before the current one, the default dialect of its own
// run and with its own ledger; see jsonschema-suite.test.ts.

import { test } from 'node:test'
import * as Path from 'node:path'

import { VECTORS, remotes, suiteGroups } from './suite'
import { runCorpus } from './suite-corpus'


test('the-json-schema-test-suite-draft2019-09-runs-under-import-and-vet', () =>
  runCorpus('jsonschema/skips-draft2019-09.tsv', 21,
    suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', 'draft2019-09'), '2019-09'), remotes()))
