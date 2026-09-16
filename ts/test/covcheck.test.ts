/* Copyright (c) 2026 Richard Rodger, MIT License */

// The ADR-002 gate's own union rule: a gate that clears a gap fails
// silently. `test/covrun.js` calls the same checker.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { spawnSync } from 'node:child_process'

const TS = Path.join(__dirname, '..')

type Fn = { line: number, name: string, hits: number }


// Every line ran, so only the function check can fail these reports.
function report(fns: Fn[]): string {
  return ['SF:src/x.ts']
    .concat(fns.map((f) => `FN:${f.line},${f.name}`))
    .concat(fns.map((f) => `FNDA:${f.hits},${f.name}`))
    .concat(fns.map((f) => `DA:${f.line},1`))
    .concat(['end_of_record', ''])
    .join('\n')
}


function check(...reports: string[]) {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'covcheck-'))
  const files = reports.map((text, i) => {
    const file = Path.join(dir, `lcov-${i}.info`)
    Fs.writeFileSync(file, text)
    return file
  })
  const res = spawnSync(process.execPath,
    [Path.join(TS, 'test', 'covcheck.js'), ...files], { encoding: 'utf8' })
  return { code: res.status, out: res.stdout + res.stderr }
}


describe('covcheck', () => {

  // A run numbers the anonymous functions of its own list, so the same
  // number names a different function in the next run.
  test('a-run-s-own-numbering-never-clears-another-line', () => {
    const one = report([
      { line: 10, name: 'anonymous_1', hits: 5 },
      { line: 20, name: 'anonymous_2', hits: 0 },
    ])
    const two = report([
      { line: 20, name: 'anonymous_1', hits: 0 },
      { line: 30, name: 'anonymous_2', hits: 7 },
    ])
    const r = check(one, two)
    Assert.equal(r.code, 1, r.out)
    Assert.match(r.out, /src\/x\.ts:20 function anonymous_\d+ never called/)
    Assert.equal(r.out.match(/never called/g)?.length, 1, r.out)
  })

  test('an-observation-one-run-dropped-is-recovered-by-another', () => {
    const lost = report([
      { line: 10, name: 'anonymous_1', hits: 0 },
      { line: 20, name: 'anonymous_2', hits: 3 },
    ])
    const kept = report([
      { line: 10, name: 'anonymous_1', hits: 4 },
      { line: 20, name: 'anonymous_2', hits: 3 },
    ])
    const r = check(lost, kept)
    Assert.equal(r.code, 0, r.out)
    Assert.match(r.out, /functions 100\.00%/)
  })

  test('a-gap-every-run-reports-stays-a-gap', () => {
    const fns = [{ line: 10, name: 'anonymous_1', hits: 0 }]
    const r = check(report(fns), report(fns), report(fns))
    Assert.equal(r.code, 1, r.out)
    Assert.match(r.out, /src\/x\.ts:10 function anonymous_1 never called/)
  })
})
