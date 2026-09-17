/* Copyright (c) 2025 Richard Rodger, MIT License */

// ADR-002 gate: read an lcov report of ts/src and fail unless every
// line, branch and function is covered.
//
//   node test/covcheck.js [lcov.info ...]
//
// Several reports are UNIONED: a line observed executing in any run did
// execute, so unioning recovers observations that a single run lost (see
// test/covrun.js for why that happens).
//
// Why lcov and not the runner's own summary table: Node's built-in
// coverage reporter attributes the re-export accessors tsc emits for
// `export { X }` (six of them in src/aontu.ts) to the import lines, and
// then counts one of them unhit even when V8 recorded a call. The lcov
// reporter and the raw NODE_V8_COVERAGE data agree with each other, so
// this gate reads lcov. The summary table stays useful as a human
// report — it is just not the thing CI checks.
//
// bin/ is excluded deliberately: those two files are the packaging
// entry points, executed only by the spawned-binary tests in
// cli.test.ts, and a child process's coverage is not always flushed
// before the parent aggregates. Their content (one require + one call)
// is covered in-process through the exported main().

const Fs = require('node:fs')
const Path = require('node:path')


function parseLcov(text) {
  const files = []
  let cur = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('SF:')) {
      cur = {
        file: line.slice(3),
        lines: new Map(),
        branches: new Map(),
        functions: new Map(),
        fns: new Map(),
        fnhits: new Map(),
      }
      files.push(cur)
    }
    else if (null == cur) {
      continue
    }
    else if (line.startsWith('DA:')) {
      const [ln, count] = line.slice(3).split(',')
      cur.lines.set(+ln, +count)
    }
    else if (line.startsWith('BRDA:')) {
      // line, block, branch, taken. The block number is NOT an identity:
      // Node's reporter writes an arm's position in the run's list for
      // the file, and V8 reports a block only when its count differs from
      // its parent's, so the list, and every later position, differs from
      // run to run. Arms are kept per line, and unioned per line.
      const p = line.slice(5).split(',')
      const ln = +p[0]
      let arms = cur.branches.get(ln)
      if (null == arms) {
        cur.branches.set(ln, arms = [])
      }
      arms.push({ line: ln, taken: p[3] })
    }
    else if (line.startsWith('FN:')) {
      // line, name. The name is NOT an identity either: `anonymous_N`
      // numbers the anonymous functions of the run's own list for the
      // file, so a function the run never reported renames every later
      // one. Pair FN with FNDA inside the report, where the name does
      // identify, then key by line, as the arms are.
      const ix = line.indexOf(',')
      cur.fns.set(line.slice(ix + 1), +line.slice(3, ix))
    }
    else if (line.startsWith('FNDA:')) {
      const ix = line.indexOf(',')
      cur.fnhits.set(line.slice(ix + 1), +line.slice(5, ix))
    }
  }

  for (const f of files) {
    for (const [name, ln] of f.fns) {
      let fns = f.functions.get(ln)
      if (null == fns) {
        f.functions.set(ln, fns = [])
      }
      fns.push({ line: ln, name, hits: f.fnhits.get(name) ?? 0 })
    }
  }

  return files
}


function check(files) {
  const gaps = []
  const total = { lines: [0, 0], branches: [0, 0], fns: [0, 0] }

  for (const f of files) {
    if (!f.file.startsWith('src/')) continue

    for (const [ln, count] of f.lines) {
      total.lines[1]++
      if (0 < count) total.lines[0]++
      else gaps.push(`${f.file}:${ln} line never executed`)
    }

    for (const arms of f.branches.values()) {
      for (const b of arms) {
        total.branches[1]++
        if (taken(b)) total.branches[0]++
        else gaps.push(`${f.file}:${b.line} branch arm never taken`)
      }
    }

    for (const fns of f.functions.values()) {
      for (const fn of fns) {
        total.fns[1]++
        if (called(fn)) total.fns[0]++
        else gaps.push(`${f.file}:${fn.line} function ${fn.name} never called`)
      }
    }
  }

  return { gaps, total }
}


function taken(b) {
  return '0' !== b.taken && '-' !== b.taken
}


function called(fn) {
  return 0 < fn.hits
}


function pct(hit, all) {
  return 0 === all ? '100.00' : (100 * hit / all).toFixed(2)
}


// A line's arms, and its functions, come from one run. A run vouches
// for a line when everything it reports there was covered and it
// reports at least as many entries there as any other run: a genuine
// gap is uncovered in every run that reports it, so no run reporting it
// vouches for its line, and a run in which an enclosing block or
// function went unobserved folds the gap into that block, or drops the
// entry, and so reports fewer entries at the line, which is not allowed
// to vouch either.
function vouched(cur, incoming, covered) {
  for (const [ln, entries] of incoming) {
    const have = cur.get(ln)
    if (null == have || entries.length > have.length ||
      (entries.length === have.length &&
        !have.every(covered) && entries.every(covered))) {
      cur.set(ln, entries)
    }
  }
}


// Union several parsed reports into one, keyed by file.
function union(reports) {
  const byFile = new Map()
  for (const files of reports) {
    for (const f of files) {
      const cur = byFile.get(f.file)
      if (null == cur) {
        byFile.set(f.file, f)
        continue
      }
      for (const [ln, count] of f.lines) {
        cur.lines.set(ln, Math.max(cur.lines.get(ln) ?? 0, count))
      }
      vouched(cur.branches, f.branches, taken)
      vouched(cur.functions, f.functions, called)
    }
  }
  return [...byFile.values()]
}


function main() {
  const paths = 2 <= process.argv.length - 2
    ? process.argv.slice(2)
    : [process.argv[2] ?? Path.join(__dirname, '..', 'coverage', 'lcov.info')]

  const missing = paths.filter((p) => !Fs.existsSync(p))
  if (0 < missing.length) {
    process.stderr.write(`covcheck: no lcov report at ${missing[0]}\n`)
    process.exitCode = 2
    return
  }

  const { gaps, total } = check(union(
    paths.map((p) => parseLcov(Fs.readFileSync(p, 'utf8')))))

  process.stdout.write(
    `ts/src coverage: lines ${pct(...total.lines)}% (${total.lines[0]}/${total.lines[1]}), ` +
    `branches ${pct(...total.branches)}% (${total.branches[0]}/${total.branches[1]}), ` +
    `functions ${pct(...total.fns)}% (${total.fns[0]}/${total.fns[1]})\n`)

  if (0 === gaps.length) {
    process.stdout.write('covcheck: 100% (ADR-002)\n')
    return
  }

  process.stderr.write(`\ncovcheck: ${gaps.length} uncovered item(s) — ADR-002 requires 100%:\n`)
  for (const g of gaps) {
    process.stderr.write('  ' + g + '\n')
  }
  process.stderr.write(
    '\nClose each with a shared spec row (preferred), a unit test, or — only\n' +
    'when genuinely unreachable — by removing the dead code. See ADR.md.\n')
  process.exitCode = 1
}


main()
