/* Copyright (c) 2026 Richard Rodger, MIT License */


// The current dialect's corpus, Ajv's extra tests and JSONTestSuite;
// the earlier dialects are jsonschema-suite-2019.test.ts and
// jsonschema-suite-earlier.test.ts. The runner is suite-corpus.ts.

import { test } from 'node:test'
import * as Path from 'node:path'

import { VECTORS, remotes, suiteGroups } from './suite'
import { runCorpus, parsingGroups } from './suite-corpus'


// Each ledger may not grow past its bound; the register tightens them.
test('the-json-schema-test-suite-runs-under-import-and-vet', () =>
  runCorpus('jsonschema/skips.tsv', 13,
    suiteGroups(Path.join(VECTORS, 'jsonschema', 'tests', 'draft2020-12')), remotes()))

test('ajvs-extra-tests-run-under-import-and-vet', () =>
  runCorpus('ajv-extras/skips.tsv', 0, suiteGroups(Path.join(VECTORS, 'ajv-extras', 'tests'))))

test('jsontestsuite-runs-as-instances-under-vet', () =>
  runCorpus('jsontestsuite/skips.tsv', 87, parsingGroups(Path.join(VECTORS, 'jsontestsuite'))))
