/* Copyright (c) 2025 Richard Rodger, MIT License */


import type { VetReport, VetFinding, VetSite } from './vet'

import { exactJSON } from './exactjson'


// SARIF levels are error/warning/note; the report's severities are
// error/warning/info. Only `info` needs translating, but the map spells
// out all three so a new severity fails loudly here rather than
// silently emitting itself.
const SARIF_LEVEL: Record<string, string> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
}


function sarifUri(path: string): string {
  const bytes = Buffer.from(path, 'utf8')
  let out = ''
  for (const b of bytes) {
    const c = String.fromCharCode(b)
    if (b < 128 && /[A-Za-z0-9\-._~/!$&'()*+,;=:@]/.test(c)) {
      out += c
    }
    else {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  return out
}


function sarifLocation(site: VetSite): any {
  const physical: any = {
    artifactLocation: { uri: sarifUri(site.file) },
  }
  // SARIF regions are 1-based. A finding with no position — a parse
  // failure reports at -1:-1 — gets a location with no region rather
  // than an invented one.
  if (1 <= site.row) {
    physical.region = { startColumn: site.col, startLine: site.row }
  }
  return { physicalLocation: physical }
}


function sarifResult(finding: VetFinding): any {
  const result: any = {
    level: SARIF_LEVEL[finding.severity],
    locations: [sarifLocation(finding.sites[0])],
    message: { text: finding.message },
    properties: finding,
    ruleId: 'aontu/' + finding.code,
  }
  const related = finding.sites.slice(1)
  if (0 < related.length) {
    result.relatedLocations = related.map(sarifLocation)
  }
  return result
}


function sarifReport(report: VetReport, version: string): string {
  return exactJSON({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      invocations: [{
        executionSuccessful: 'error' !== report.verdict,
      }],
      results: report.findings.map(sarifResult),
      tool: {
        driver: {
          informationUri: 'https://github.com/aontu-lang/aontu',
          name: 'aontu',
          version,
        },
      },
    }],
    version: '2.1.0',
  }, 2)
} /* node:coverage ignore next 6 */


export {
  sarifReport,
}
