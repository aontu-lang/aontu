/* Copyright (c) 2025 Richard Rodger, MIT License */

// The SARIF renderer (G2 phase 5, ts/src/report-sarif.ts). The shape
// contract is the shared golden in test/spec/files/vet-sarif/, which
// go/report_sarif_test.go holds the Go twin to byte for byte; the
// severity mapping and the no-position branch are pinned here on
// synthetic reports, because no engine path emits them yet (warnings
// are reserved for G3's deprecation mark, info for --surplus).

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { exactJSON, sarifReport, vet } from '../dist/aontu'
import type { VetReport } from '../dist/vet'


const GOLDEN_DIR = Path.join(
  __dirname, '..', '..', 'test', 'spec', 'files', 'vet-sarif')


// The redaction the golden's README specifies: message text and
// producer version are the two things deliberately not in cross-port
// parity, so the comparing test removes them from its own output the
// same way test/spec/vet.tsv carves the message out of its goldens.
function redact(sarif: string): string {
  const log = JSON.parse(sarif)
  log.runs[0].tool.driver.version = '<VERSION>'
  for (const result of log.runs[0].results) {
    result.message.text = '<MESSAGE>'
    result.properties.message = '<MESSAGE>'
    // CONDITIONAL, so the golden still records which codes carry a
    // hint and which do not -- that presence IS in parity, only the
    // prose is not.
    if (null != result.properties.hint) {
      result.properties.hint = '<HINT>'
    }
  }
  return exactJSON(log, 2)
}


describe('sarif', () => {

  test('sarif-golden', () => {
    const schema = Fs.readFileSync(Path.join(GOLDEN_DIR, 'schema.aon'), 'utf8')
    const data = Fs.readFileSync(Path.join(GOLDEN_DIR, 'data.aon'), 'utf8')
    // Normalised on read: the golden is compared BYTE FOR BYTE against
    // a generated string that always uses \n, so a CRLF checkout could
    // never match. .gitattributes pins test/spec/files/** to LF, and
    // this is the half that holds when the file did not come from a
    // checkout. The Go twin does the same (go/report_sarif_test.go).
    const expect = Fs.readFileSync(Path.join(GOLDEN_DIR, 'expect.sarif'), 'utf8')
      .replaceAll('\r\n', '\n').replaceAll('\r', '\n')

    const report = vet(schema, data, {
      schemaUrl: 'schema.aon', dataUrl: 'data.aon',
    })
    Assert.equal(redact(sarifReport(report, 'x')) + '\n', expect)
  })


  // error/warning/info map to SARIF error/warning/note. Only `info`
  // translates, but all three are pinned so a drift in any of them
  // fails here rather than in a consumer.
  test('sarif-levels', () => {
    const report: VetReport = {
      verdict: 'invalid',
      truncated: false,
      findings: (['error', 'warning', 'info'] as const).map((severity) => ({
        code: 'x',
        class: 'conflict',
        severity,
        path: '$',
        message: 'm',
        sites: [{ file: 'f', row: 1, col: 1, len: -1, role: 'data' as const }],
      })),
    }
    const log = JSON.parse(sarifReport(report, 'x'))
    Assert.deepEqual(
      log.runs[0].results.map((r: any) => r.level),
      ['error', 'warning', 'note'])
  })


  // A finding with no position — a parse failure reports at -1:-1 —
  // gets a location with no region rather than an invented one, because
  // SARIF regions are 1-based.
  test('sarif-no-position-no-region', () => {
    const report: VetReport = {
      verdict: 'invalid',
      truncated: false,
      findings: [{
        code: 'syntax',
        class: 'parse',
        severity: 'error',
        path: '$',
        message: 'm',
        sites: [{ file: 'data.aon', row: -1, col: -1, len: -1, role: 'data' }],
      }],
    }
    const log = JSON.parse(sarifReport(report, 'x'))
    const physical = log.runs[0].results[0].locations[0].physicalLocation
    Assert.equal(physical.artifactLocation.uri, 'data.aon')
    Assert.equal(physical.region, undefined)
    Assert.equal(log.runs[0].results[0].relatedLocations, undefined)
  })


  // A clean run is still a report: one run, empty results, the tool
  // named — what a CI upload of a passing check looks like. A FAILED
  // run (verdict error: the schema was unusable) also has empty
  // results, and the difference is carried in SARIF's own invocation
  // metadata so a consumer never mistakes "could not check" for
  // "checked and clean".
  test('sarif-empty', () => {
    const report: VetReport = { verdict: 'valid', truncated: false, findings: [] }
    const log = JSON.parse(sarifReport(report, '1.2.3'))
    Assert.equal(log.version, '2.1.0')
    Assert.deepEqual(log.runs[0].results, [])
    Assert.equal(log.runs[0].tool.driver.name, 'aontu')
    Assert.equal(log.runs[0].tool.driver.version, '1.2.3')
    Assert.equal(log.runs[0].invocations[0].executionSuccessful, true)

    const failed: VetReport = { verdict: 'error', truncated: false, findings: [] }
    const flog = JSON.parse(sarifReport(failed, '1.2.3'))
    Assert.deepEqual(flog.runs[0].results, [])
    Assert.equal(flog.runs[0].invocations[0].executionSuccessful, false)
  })


  // A site's file is a filesystem path; the SARIF uri percent-encodes
  // every URI-significant byte (by UTF-8 byte, so the Go twin's loop
  // produces identical text) — otherwise text after `#` reads as a
  // fragment and the consumer loses the file association.
  test('sarif-uri-encoding', () => {
    const report: VetReport = {
      verdict: 'invalid',
      truncated: false,
      findings: [{
        code: 'x',
        class: 'conflict',
        severity: 'error',
        path: '$',
        message: 'm',
        sites: [{ file: 'a b#c%.aon', row: 1, col: 1, len: -1, role: 'data' }],
      }],
    }
    const log = JSON.parse(sarifReport(report, 'x'))
    Assert.equal(
      log.runs[0].results[0].locations[0].physicalLocation
        .artifactLocation.uri,
      'a%20b%23c%25.aon')
  })
})
