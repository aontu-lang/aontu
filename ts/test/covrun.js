/* Copyright (c) 2025 Richard Rodger, MIT License */

// ADR-002 gate driver: run the compiled suite under V8 coverage and
// check the lcov report with test/covcheck.js, retrying if — and only
// if — the run came up short.
//
//   node test/covrun.js
//
// WHY A RETRY AT ALL. `node --test` runs each test FILE in its own
// child process and merges their coverage at the end. Under load that
// merge is lossy: roughly one run in six drops a handful of
// observations, and which ones it drops moves around (a branch in
// ListVal one run, one in FuncBaseVal the next). Those are lost
// OBSERVATIONS, not real gaps — a line seen executing in any run did
// execute — so the reports are UNIONED, exactly as the Go side unions
// the unit-test and GOCOVERDIR profiles with scripts/covmerge.
//
// The retry cannot mask a genuine gap: code no test exercises is
// missing from every run, so the union is still short and the gate
// still fails. It only removes the flake. What the union may key on to
// hold that, since a run's own numbering of arms and functions does
// not, is in test/covcheck.js.
//
// Single-process mode (--experimental-test-isolation=none) would avoid
// the merge entirely, but the suite is not written for a shared
// process: several cases depend on a fresh module registry, and
// coverage drops to ~99.6 % because those cases stop exercising what
// they were written to exercise.

const { spawnSync } = require('node:child_process')
const Fs = require('node:fs')
const Path = require('node:path')

const MAX_RUNS = 3

const tsDir = Path.join(__dirname, '..')
const covDir = Path.join(tsDir, 'coverage')


function runSuite(n) {
  const out = Path.join(covDir, `lcov-${n}.info`)
  const res = spawnSync(process.execPath, [
    '--enable-source-maps',
    '--experimental-test-coverage',
    '--test-coverage-exclude=dist-test/**',
    '--test-coverage-exclude=test/**',
    '--test-coverage-exclude=bin/**',
    '--test-concurrency=1',
    '--test-reporter=lcov',
    `--test-reporter-destination=${out}`,
    '--test',
    'dist-test/**/*.test.js',
  ], { cwd: tsDir, stdio: ['ignore', 'ignore', 'inherit'] })

  if (0 !== res.status) {
    process.stderr.write(`covrun: the suite failed (exit ${res.status})\n`)
    process.exit(res.status ?? 1)
  }
  return out
}


function check(reports, quiet) {
  const res = spawnSync(process.execPath,
    [Path.join(__dirname, 'covcheck.js'), ...reports],
    { cwd: tsDir, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  return 0 === res.status
}


function main() {
  Fs.mkdirSync(covDir, { recursive: true })
  const reports = []

  for (let n = 1; n <= MAX_RUNS; n++) {
    reports.push(runSuite(n))
    const last = n === MAX_RUNS
    if (check(reports, !last)) {
      if (1 < n) {
        process.stdout.write(`covrun: reached 100% after ${n} runs ` +
          '(the runner dropped observations in an earlier one)\n')
      }
      check(reports, false)
      return
    }
    if (last) {
      process.exit(1)
    }
  }
}


main()
