/* Copyright (c) 2026 Richard Rodger, MIT License */

// The sampled groups of the TypeScript suite (ts/test/groups.tsv): the
// standard CI run (.github/workflows/build.yml) runs ONE group per run,
// chosen by the run number, and the daily run and `npm test` run every
// file. A group is a set of compiled test files short enough to finish
// in about two minutes on the hosted runner.
//
//   node scripts/test-group.cjs --check         every test file is in exactly one group
//   node scripts/test-group.cjs --list [N]      the groups, or group N's files
//   node scripts/test-group.cjs --run N         run group N (N from 0; "all" runs them all)
//   node scripts/test-group.cjs --pick          the group this CI run samples (AONTU_TEST_GROUP forces one)
//
// THE MANIFEST IS EXPLICIT, not derived from the directory, for the
// reason use-cases/run-all.sh gives: a test file that is in no group is
// never sampled, and nothing would say so. --check says so, and
// ts/test/groups.test.ts asks it inside every full run.
//
// GROUP 0 IS THE GATE GROUP: the fast tests that hold the repository
// to its rules (the comment gate, the guide's word cap, the version
// literals, the inlined copies), which the happy path runs on every
// push. The sample is drawn from the other groups: (run number +
// attempt) modulo their count, so consecutive runs walk every group,
// the push and pull_request runs of one commit sample two, and a re-run
// samples the next.

const { spawnSync } = require('node:child_process')
const Fs = require('node:fs')
const Os = require('node:os')
const Path = require('node:path')

const TS = Path.join(__dirname, '..')
const MANIFEST = Path.join(TS, 'test', 'groups.tsv')
const TEST_DIR = Path.join(TS, 'test')
const DIST_TEST = Path.join(TS, 'dist-test')


// Rows of `group<TAB>file`, the file a ts/test/*.test.ts basename;
// blank lines and # comments skipped.
function readGroups() {
  const groups = new Map()
  const lines = Fs.readFileSync(MANIFEST, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if ('' === line.trim() || line.startsWith('#')) return
    const parts = line.split('\t')
    if (2 !== parts.length || !/^\d+$/.test(parts[0]) || !parts[1].endsWith('.test.ts')) {
      throw new Error(`${MANIFEST}:${i + 1}: expected "<group>\\t<file>.test.ts", got ${JSON.stringify(line)}`)
    }
    const n = Number(parts[0])
    if (!groups.has(n)) groups.set(n, [])
    groups.get(n).push(parts[1])
  })
  return groups
}


// Every test file in exactly one group, every listed file on disk, and
// the groups numbered 0..G-1 with none empty.
function check() {
  const groups = readGroups()
  const problems = []
  const seen = new Map()
  for (const [n, files] of groups) {
    for (const f of files) {
      if (seen.has(f)) problems.push(`${f} is in groups ${seen.get(f)} and ${n}`)
      seen.set(f, n)
      if (!Fs.existsSync(Path.join(TEST_DIR, f))) problems.push(`${f} is listed and not in ts/test/`)
    }
  }
  const onDisk = Fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.ts')).sort()
  for (const f of onDisk) {
    if (!seen.has(f)) problems.push(`${f} is in no group: add it to ts/test/groups.tsv`)
  }
  const numbers = [...groups.keys()].sort((a, b) => a - b)
  numbers.forEach((n, i) => {
    if (n !== i) problems.push(`groups are numbered ${numbers.join(', ')}; expected 0..${numbers.length - 1}`)
  })
  return { groups, problems }
}


function pick(groups) {
  const env = process.env
  const forced = env.AONTU_TEST_GROUP
  if (null != forced && '' !== forced) return forced
  const sampled = groups.size - 1
  if (sampled < 1) return '0'
  const run = Number(env.GITHUB_RUN_NUMBER || 0) + Number(env.GITHUB_RUN_ATTEMPT || 0)
  return String(1 + (run % sampled))
}


function files(groups, n) {
  const list = groups.get(Number(n))
  if (null == list) throw new Error(`no group ${n}; groups are 0..${groups.size - 1}`)
  return list.map((f) => Path.join(DIST_TEST, f.replace(/\.test\.ts$/, '.test.js')))
}


// One file per core, as scripts/test.cjs runs the whole suite.
function run(groups, which) {
  const picked = 'all' === which ? [...groups.keys()].sort((a, b) => a - b) : [which]
  const paths = picked.flatMap((n) => files(groups, n))
  process.stdout.write(`test-group: group ${which} of ${groups.size}: ${paths.length} file(s)\n`)
  for (const p of paths) process.stdout.write(`  ${Path.relative(TS, p)}\n`)
  const res = spawnSync(process.execPath, [
    '--enable-source-maps',
    '--test',
    `--test-concurrency=${Os.availableParallelism()}`,
    ...paths,
  ], { cwd: TS, stdio: 'inherit' })
  if (res.error) throw res.error
  return null == res.status ? 1 : res.status
}


if (require.main === module) {
  const [verb, arg] = process.argv.slice(2)
  const { groups, problems } = check()
  if ('--check' === verb) {
    if (0 < problems.length) {
      process.stderr.write('test-group: the manifest does not cover the suite:\n  ' + problems.join('\n  ') + '\n')
      process.exit(1)
    }
    process.stdout.write(`test-group: ${groups.size} groups cover ${[...groups.values()].flat().length} test files\n`)
  }
  else if ('--list' === verb) {
    const which = null == arg ? [...groups.keys()].sort((a, b) => a - b) : [Number(arg)]
    for (const n of which) {
      process.stdout.write(`group ${n}:\n`)
      for (const f of groups.get(n) || []) process.stdout.write(`  ${f}\n`)
    }
  }
  else if ('--pick' === verb) {
    process.stdout.write(pick(groups) + '\n')
  }
  else if ('--run' === verb) {
    if (0 < problems.length) {
      process.stderr.write('test-group: fix the manifest first (--check):\n  ' + problems.join('\n  ') + '\n')
      process.exit(1)
    }
    process.exit(run(groups, null == arg || '' === arg ? pick(groups) : arg))
  }
  else {
    process.stderr.write('usage: test-group.cjs --check | --list [N] | --pick | --run N|all\n')
    process.exit(2)
  }
}

module.exports = { readGroups, check, pick }
