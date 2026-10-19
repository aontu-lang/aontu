/* Copyright (c) 2026 Richard Rodger, MIT License */


// The draft-07, draft-06 and draft-04 corpora, each the default dialect
// of its own run and each with its own ledger; see
// jsonschema-suite.test.ts.

import { test } from 'node:test'
import * as Path from 'node:path'

import { VECTORS, remotes, suiteGroups } from './suite'
import { runCorpus } from './suite-corpus'


for (const [dir, dialect, bound] of [['draft7', 'draft-07', 14],
  ['draft6', 'draft-06', 4], ['draft4', 'draft-04', 4]] as const) {
  test(`the-json-schema-test-suite-${dir}-runs-under-import-and-vet`, () =>
    runCorpus(`jsonschema/skips-${dir}.tsv`, bound,
      suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', dir), dialect), remotes()))
}
