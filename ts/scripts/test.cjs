/* Copyright (c) 2025 Richard Rodger, MIT License */

// `npm test`: the compiled suite under the node test runner, one test
// file per core. The runner's own default leaves a core to itself, and
// on a three-core host that ran two files at a time: the suite is bound
// by CPU, and the parent process only collects what the files report.

const { spawnSync } = require('node:child_process')
const Os = require('node:os')
const Path = require('node:path')

const res = spawnSync(process.execPath, [
  '--enable-source-maps',
  '--test',
  `--test-concurrency=${Os.availableParallelism()}`,
  ...process.argv.slice(2),
  'dist-test/**/*.test.js',
], { cwd: Path.join(__dirname, '..'), stdio: 'inherit' })

if (res.error) {
  throw res.error
}
process.exit(null == res.status ? 1 : res.status)
