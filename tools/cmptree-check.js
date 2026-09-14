#!/usr/bin/env node
/* Copyright (c) 2026 Richard Rodger, MIT License */

// Hold a committed tree to what a generator produces, by handing
// aontu's component tree to jostraca. The seam is a PIPE: this reads
// the tree on stdin and requires jostraca at run time, so nothing in
// `ts/src` or `go/` depends on it.
//
//   aontu gen.aon | node tools/cmptree-check.js --folder <dir>
//   aontu gen.aon | node tools/cmptree-check.js --out <dir>
//
// Exits 0 when the folder is what the generators produce, 1 on drift,
// and 3 when jostraca is not installed -- which a caller may treat as
// a skip, the way check.sh already skips when Ruby is absent. `--out`
// writes the tree instead of comparing it, for a check that needs the
// output to be real: a compiler run, a parser run.

const args = process.argv.slice(2)
const at = args.indexOf('--folder')
const outAt = args.indexOf('--out')
if ((at < 0 && outAt < 0) ||
  (0 <= at && undefined === args[at + 1]) ||
  (0 <= outAt && undefined === args[outAt + 1])) {
  process.stderr.write(
    'usage: cmptree-check (--folder <dir> | --out <dir>) [--at <key>]\n')
  process.exit(2)
}
const write = outAt >= 0
const folder = write ? args[outAt + 1] : args[at + 1]
const keyAt = args.indexOf('--at')
const key = keyAt < 0 ? 'out' : args[keyAt + 1]

let jostraca
try {
  jostraca = require(process.env.JOSTRACA_PATH || 'jostraca')
}
catch (err) {
  process.stderr.write('cmptree-check: jostraca is not installed (skipping)\n')
  process.exit(3)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { input += c })
process.stdin.on('end', async () => {
  let val
  try {
    val = JSON.parse(input)
  }
  catch (err) {
    process.stderr.write('cmptree-check: stdin is not JSON\n')
    process.exit(2)
  }

  const tree = (null != val && !Array.isArray(val) && undefined !== val[key]) ?
    val[key] : val

  // `raw` for the whole tree: aontu hands over FINAL bytes, so a `$$`
  // sequence in a generated shell script is not a substitution.
  const root = jostraca.cmpTree(tree, { raw: true })
  const j = jostraca.Jostraca()

  let res
  try {
    if (write) {
      await j.generate({ folder }, root)
      process.exit(0)
    }
    res = await j.check({ folder }, root)
  }
  catch (err) {
    process.stderr.write('cmptree-check: ' + err.message + '\n')
    process.exit(1)
  }
  for (const d of res.drift) {
    process.stdout.write(d.kind + ': ' + d.path + '\n')
  }
  process.stdout.write(
    res.drift.length + ' of ' + res.checked.length + ' drifted\n')
  process.exit(0 === res.drift.length ? 0 : 1)
})
