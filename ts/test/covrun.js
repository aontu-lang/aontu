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
//
// ONE FILE PER CORE, as `npm test` runs them (scripts/test.cjs). The
// driver ran one file at a time, and once the shared rows grew a pass
// took 25 of the coverage job's 30 minutes on the hosted runner, which
// left no time for the retry above.
//
// BUT THE SHARED ROWS IN ONE PROCESS. `npm test` splits them over three
// test files (test/spec.test.ts); AONTU_SPEC_SHARES=1 keeps them in one
// here, as when the gate was written. The merge is lossy where two
// processes report an arm differently: one that saw it untaken reports
// it, and one that always took it folds it into its parent. Split, the
// rows written together to cover isHexDigit (src/val/ConstraintVal.ts)
// left an arm of it untaken in one run, and test/covcheck.js rightly
// lets no run that reports fewer arms at that line vouch for it.
//
// A PASS REPORTS WHILE IT RUNS. A second reporter, dot, counts the
// tests as they finish, and every pass that comes up short prints its
// gaps: the daily's job is cut off at its time limit, and a pass that
// printed nothing then leaves nothing to fix.

const { spawn, spawnSync } = require('node:child_process')
const Fs = require('node:fs')
const Os = require('node:os')
const Path = require('node:path')

const MAX_RUNS = 3
const BEAT_MS = 20000

const tsDir = Path.join(__dirname, '..')
const covDir = Path.join(tsDir, 'coverage')


function clock(ms) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}


function progress(done, expected) {
  return null == expected
    ? `${done} tests done`
    : `${done}/${expected} tests, ${Math.min(99, Math.floor(100 * done / expected))}%`
}


function runSuite(n, expected) {
  const out = Path.join(covDir, `lcov-${n}.info`)
  const start = Date.now()
  const child = spawn(process.execPath, [
    '--enable-source-maps',
    '--experimental-test-coverage',
    '--test-coverage-exclude=dist-test/**',
    '--test-coverage-exclude=test/**',
    '--test-coverage-exclude=bin/**',
    `--test-concurrency=${Os.availableParallelism()}`,
    '--test-reporter=lcov',
    `--test-reporter-destination=${out}`,
    '--test-reporter=dot',
    '--test-reporter-destination=stdout',
    '--test',
    'dist-test/**/*.test.js',
  ], {
    cwd: tsDir,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, AONTU_SPEC_SHARES: '1' },
  })

  let done = 0
  let text = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    text += chunk
    for (const ch of chunk) {
      if ('.' === ch || 'X' === ch) done++
    }
  })

  const beat = setInterval(() => process.stdout.write(
    `covrun: pass ${n}/${MAX_RUNS}, ${clock(Date.now() - start)}, ` +
    `${progress(done, expected)}\n`), BEAT_MS)

  return new Promise((resolve) => child.on('close', (status) => {
    clearInterval(beat)
    if (0 !== status) {
      process.stdout.write(text.split('\n')
        .filter((line) => !/^[.X]*$/.test(line)).join('\n') + '\n')
      process.stderr.write(`covrun: the suite failed (exit ${status})\n`)
      process.exit(status ?? 1)
    }
    process.stdout.write(`covrun: pass ${n} ran ${done} tests ` +
      `in ${clock(Date.now() - start)}\n`)
    resolve({ out, done })
  }))
}


function check(reports) {
  const res = spawnSync(process.execPath,
    [Path.join(__dirname, 'covcheck.js'), ...reports],
    { cwd: tsDir, stdio: 'inherit' })
  return 0 === res.status
}


async function main() {
  Fs.mkdirSync(covDir, { recursive: true })
  const reports = []
  let expected

  for (let n = 1; n <= MAX_RUNS; n++) {
    const run = await runSuite(n, expected)
    expected = expected ?? run.done
    reports.push(run.out)

    if (check(reports)) {
      if (1 < n) {
        process.stdout.write(`covrun: reached 100% after ${n} runs ` +
          '(the runner dropped observations in an earlier one)\n')
      }
      return
    }
    if (n < MAX_RUNS) {
      process.stdout.write(`covrun: the union of ${n} pass(es) is short; ` +
        'running again, as the runner can drop observations\n')
    }
  }
  process.exit(1)
}


main()
