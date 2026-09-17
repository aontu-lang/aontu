/* Copyright (c) 2025 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { Aontu, viewTree } from '../dist/aontu'
import {
  evalSource, runVet, runSubsume, runBreaking, runTrim, runRelations,
  runJsonSchema,
  runReaches,
  runView,
  runHash, runGet, runWhy,
  renderWhyText, runSet, runAllow, runAgentsMd, runFmt, runTemplate,
  runTrace, runRender, renderSkipped,
  replCommand,
  watchChange, watchSignature, vetWaiter, deprecatedAt,
  main as cliMainVet, runPkg, runModel,
} from '../dist/cli'


const CLI = Path.join(__dirname, '..', 'bin', 'aontu.js')


function run(args: string[], input?: string): { out: string; code: number } {
  const env = { ...process.env }
  delete env.NODE_V8_COVERAGE

  try {
    const out = execFileSync('node', [CLI, ...args], {
      input: input ?? '',
      encoding: 'utf8',
      env,
    })
    return { out, code: 0 }
  }
  catch (err: any) {
    // execFileSync throws on non-zero exit; capture stdout/stderr + code.
    return { out: (err.stdout ?? '') + (err.stderr ?? ''), code: err.status ?? 1 }
  }
}



const NO_SERVERS: any = {
  lsp: () => undefined, mcp: () => undefined, serve: async () => undefined, http: () => ({}),
}

describe('cli', () => {

  // --- unit: evalSource is the pure core the CLI renders with ---

  test('eval-json', () => {
    const r = evalSource(new Aontu(), 'a:1 b:$.a', 'json')
    Assert.equal(r.ok, true)
    Assert.deepEqual(JSON.parse(r.text), { a: 1, b: 1 })
  })

  test('eval-canon', () => {
    const r = evalSource(new Aontu(), 'a:*1|number', 'canon')
    Assert.equal(r.ok, true)
    Assert.equal(r.text, '{"a":*1|number}')
  })

  test('eval-error', () => {
    const r = evalSource(new Aontu(), 'a:1 a:2', 'json')
    Assert.equal(r.ok, false)
    Assert.match(r.text, /Cannot unify value: 2 with value: 1/)
  })

  test('eval-empty', () => {
    const r = evalSource(new Aontu(), '', 'json')
    Assert.equal(r.ok, true)
    Assert.deepEqual(JSON.parse(r.text), {})
  })

  // --- integration: the built binary, driven via stdin/args ---

  test('cli-version', () => {
    const r = run(['--version'])
    Assert.equal(r.code, 0)
    Assert.match(r.out, /^\d+\.\d+\.\d+/)
  })

  test('cli-help', () => {
    const r = run(['--help'])
    Assert.equal(r.code, 0)
    Assert.match(r.out, /Usage: aontu/)
  })

  test('cli-stdin-json', () => {
    const r = run([], 'port: *8080 | integer\nhost: localhost')
    Assert.equal(r.code, 0)
    Assert.deepEqual(JSON.parse(r.out), { port: 8080, host: 'localhost' })
  })

  test('cli-stdin-canon', () => {
    const r = run(['--canon'], 'a:1|2')
    Assert.equal(r.code, 0)
    Assert.equal(r.out.trim(), '{"a":1|2}')
  })

  test('cli-error-exit-code', () => {
    const r = run([], 'a:1 a:2')
    Assert.equal(r.code, 1)
    Assert.match(r.out, /Cannot unify value: 2 with value: 1/)
  })

  test('cli-unknown-option', () => {
    const r = run(['--nope'])
    Assert.equal(r.code, 2)
    Assert.match(r.out, /unknown option/)
  })


  test('cli-mistyped-verb-is-a-usage-error', () => {
    const r = run(['vet2', 'schema.aon', 'data.json'])
    Assert.equal(r.code, 2)
    Assert.match(r.out, /evaluates one document, and 3 were given/)
    Assert.match(r.out, /mistyped verb reads as a file name/)
  })


  test('cli-two-files-is-a-usage-error', () => {
    const r = run(['a.aon', 'b.aon'])
    Assert.equal(r.code, 2)
    Assert.match(r.out, /evaluates one document, and 2 were given/)
  })
})


// --- the vet verb (G2 phase 3) ---------------------------------------

function vetCapture(fn: () => void): { out: string; err: string } {
  const so = process.stdout.write
  const se = process.stderr.write
  let out = ''
  let err = ''
  ;(process.stdout as any).write = (s: any) => ((out += s), true)
  ;(process.stderr as any).write = (s: any) => ((err += s), true)
  try {
    fn()
  }
  finally {
    process.stdout.write = so
    process.stderr.write = se
    process.exitCode = 0
  }
  return { out, err }
}


function vetFiles(schema: string, data: string): { dir: string, schema: string, data: string } {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-'))
  const s = Path.join(dir, 'schema.aon')
  const d = Path.join(dir, 'data.json')
  Fs.writeFileSync(s, schema)
  Fs.writeFileSync(d, data)
  return { dir, schema: s, data: d }
}


const VET_SCHEMA = 'service: { name: string, port: integer }'


describe('cli-vet', () => {

  test('vet-reports-conflicts-with-both-sites', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }')
    const r = vetCapture(() => runVet([f.schema, f.data]))
    Assert.match(r.out, /verdict: invalid/)
    Assert.match(r.out, /\$\.service\.port: no_scalar_unify \[conflict\]/)
    Assert.match(r.out, /data: .*data\.json:1:\d+ \("8080"\)/)
    Assert.match(r.out, /schema: .*schema\.aon:1:\d+ \(integer\)/)
  })


  test('vet-reports-findings-that-never-reached-the-tree', () => {
    const f = vetFiles(
      'service: close({ name: string, port: integer, replicas: integer })',
      'service: { name: "auth", prot: 8080, replicas: "3" }')
    const r = vetCapture(() => runVet([f.schema, f.data]))
    Assert.match(r.out, /\$\.service\.prot: closed/)
    Assert.match(r.out, /\$\.service\.replicas: no_scalar_unify/)
  })


  test('vet-exit-codes-are-verdict-classes', () => {
    const valid = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')
    Assert.equal(vetCapture(() => {
      Assert.equal(runVet([valid.schema, valid.data]), 0)
    }).out.trim(), 'verdict: valid')

    const invalid = vetFiles(VET_SCHEMA, 'service: { name: 1, port: 8080 }')
    vetCapture(() => Assert.equal(runVet([invalid.schema, invalid.data]), 1))

    const incomplete = vetFiles(VET_SCHEMA, 'service: { name: "auth" }')
    vetCapture(() => Assert.equal(runVet([incomplete.schema, incomplete.data]), 3))

    // --partial keeps reporting the residue but stops it failing.
    vetCapture(() =>
      Assert.equal(runVet(['--partial', incomplete.schema, incomplete.data]), 0))

    const broken = vetFiles('a: 1\na: 2', 'a: 1')
    vetCapture(() => Assert.equal(runVet([broken.schema, broken.data]), 4))
  })


  test('vet-unparseable-data-exits-1-and-names-the-file', () => {
    const f = vetFiles(VET_SCHEMA, 'service: ]')
    const r = vetCapture(() => Assert.equal(runVet([f.schema, f.data]), 1))
    Assert.match(r.out, /verdict: invalid/)
    Assert.match(r.out, /\$: syntax \[parse\]/)
    Assert.match(r.out, /data: .*data\.json:1:10 \(nil\)/)

    const good = Path.join(f.dir, 'good.json')
    Fs.writeFileSync(good, 'service: { name: 1, port: 8080 }')
    const both = vetCapture(() =>
      Assert.equal(runVet([f.schema, good, f.data]), 1))
    Assert.match(both.out, /no_scalar_unify/)
    Assert.match(both.out, /syntax/)
  })


  test('vet-json-format-names-its-producer', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }')
    const r = vetCapture(() => runVet(['--format', 'json', f.schema, f.data]))
    const report = JSON.parse(r.out)
    Assert.equal(report.aontu.verb, 'vet')
    Assert.match(report.aontu.version, /^\d+\.\d+\.\d+$/)
    Assert.equal(report.verdict, 'invalid')
    Assert.equal(report.truncated, false)
    Assert.equal(report.findings[0].code, 'no_scalar_unify')
    Assert.equal(report.findings[0].sites[0].role, 'data')
  })


  test('vet-resolves-includes-from-each-document', () => {
    const f = vetFiles('@"./part.aon"\nname: string', 'name: "auth"\nport: 8080')
    Fs.writeFileSync(Path.join(f.dir, 'part.aon'), 'port: integer')

    const cwd = process.cwd()
    const decoy = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vet-cwd-'))
    Fs.writeFileSync(Path.join(decoy, 'part.aon'), 'port: string')
    try {
      process.chdir(decoy)
      vetCapture(() => Assert.equal(runVet([f.schema, f.data]), 0))
    }
    finally {
      process.chdir(cwd)
    }
  })


  test('vet-at-and-closed-reach-the-engine', () => {
    const f = vetFiles('services: { auth: { port: integer } }',
      'auth: { port: 8080 }')
    vetCapture(() => Assert.equal(runVet(['--at', '$.services', f.schema, f.data]), 0))

    const g = vetFiles('service: { name: string }',
      'service: { name: "auth" }\nextra: 1')
    vetCapture(() => Assert.equal(runVet([g.schema, g.data]), 0))
    vetCapture(() => Assert.equal(runVet(['--closed', g.schema, g.data]), 1))
  })


  test('vet-max-errors-truncates-and-says-so', () => {
    const f = vetFiles('a: integer\nb: integer\nc: integer',
      'a: "x"\nb: "y"\nc: "z"')
    const r = vetCapture(() =>
      Assert.equal(runVet(['--max-errors', '2', f.schema, f.data]), 1))
    Assert.match(r.out, /findings truncated/)
  })


  test('vet-max-errors-caps-the-report-not-each-file', () => {
    const f = vetFiles('a: integer\nb: integer', 'a: "x"\nb: "y"')
    const other = Path.join(f.dir, 'other.json')
    Fs.writeFileSync(other, 'a: "p"\nb: "q"')

    const r = vetCapture(() => Assert.equal(
      runVet(['--max-errors', '3', f.schema, f.data, other]), 1))
    Assert.match(r.out, /findings truncated/)
    Assert.equal(r.out.match(/no_scalar_unify \[conflict\]/g)?.length, 3)
  })


  // Several data files are several candidates for one truth, so each is
  // vetted on its own and the worst verdict wins.
  test('vet-takes-more-than-one-data-file', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')
    const bad = Path.join(f.dir, 'bad.json')
    Fs.writeFileSync(bad, 'service: { name: "auth", port: "nope" }')

    const r = vetCapture(() =>
      Assert.equal(runVet([f.schema, f.data, bad]), 1))
    Assert.match(r.out, /verdict: invalid/)
    Assert.match(r.out, /bad\.json/)
  })


  test('vet-schema-error-reports-once', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth" }')
    const broken = Path.join(f.dir, 'broken.aon')
    Fs.writeFileSync(broken, 'a: 1\na: 2\n')
    const second = Path.join(f.dir, 'second.json')
    Fs.writeFileSync(second, '{"a":1}')

    const r = vetCapture(() => Assert.equal(
      runVet(['--format', 'json', broken,
        f.data, second, f.data, second]), 4))
    const report = JSON.parse(r.out)
    Assert.equal(report.verdict, 'error')
    Assert.equal(report.findings.length, 1, r.out)
    Assert.equal(report.truncated, false)

    // The same for an anchor that names nothing: also data-independent.
    const at = vetCapture(() => Assert.equal(
      runVet(['--format', 'json', '--at', '$.nope', f.schema,
        f.data, second, f.data]), 4))
    const atReport = JSON.parse(at.out)
    Assert.equal(atReport.findings.length, 1, at.out)
    Assert.equal(atReport.findings[0].code, 'no_path')
  })


  // The usage errors all end with "(try --help)", so the verb answers
  // to it: same text as `aontu --help`, exit 0.
  test('vet-help-is-help-not-an-unknown-option', () => {
    for (const args of [['--help'], ['-h'], ['--help', 'a.aon', 'b.json']]) {
      const r = vetCapture(() => Assert.equal(runVet(args), 0))
      Assert.match(r.out, /aontu vet \[options\]/)
      Assert.equal(r.err, '')
    }
  })


  test('vet-usage-errors-exit-2', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')

    for (const args of [
      [],
      [f.schema],
      ['--at'],
      ['--format', 'yaml', f.schema, f.data],
      ['--max-errors', 'lots', f.schema, f.data],
      ['--max-errors', '0', f.schema, f.data],
      ['--nope', f.schema, f.data],
    ]) {
      const r = vetCapture(() => Assert.equal(runVet(args), 2))
      Assert.match(r.err, /^aontu: /)
    }
  })


  test('vet-unreadable-file-exits-2-and-names-it', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')
    const missing = Path.join(f.dir, 'no-such.json')
    const r = vetCapture(() => Assert.equal(runVet([f.schema, missing]), 2))
    Assert.match(r.err, /cannot read .*no-such\.json/)
  })


  test('vet-note-and-alternatives-reach-the-text-report', () => {
    const f = vetFiles(
      'service: { tier: must("gold"|"silver","tier must be supported"),' +
      ' port: integer & min(1024) }',
      'service: { tier: "lead", port: 80 }')
    const r = vetCapture(() => runVet([f.schema, f.data]))
    Assert.match(r.out, /note: tier must be supported/)
    Assert.match(r.out, /expected: integer&min\(1024\)/)
    Assert.match(r.out, /actual: +80/)
  })


  test('vet-site-off-peg-still-names-its-document', () => {
    const f = vetFiles('a: *1', 'a: {}')
    const r = vetCapture(() => runVet([f.schema, f.data]))
    Assert.match(r.out, /schema: .*schema\.aon:1:\d+ \(\*1\)/)
  })


  // The verb dispatches only as the FIRST argument, so a file argument
  // is never shadowed by a verb name.
  test('vet-dispatches-through-main', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')
    const r = vetCapture(() => cliMainVet(['node', 'cli', 'vet', f.schema, f.data]))
    Assert.match(r.out, /verdict: valid/)
  })


  test('vet-verb-appears-in-help', () => {
    const r = run(['--help'])
    Assert.match(r.out, /aontu vet \[options\]/)
    Assert.match(r.out, /3 {2}incomplete/)
  })


  test('vet-end-to-end-exit-code', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }')
    const r = run(['vet', f.schema, f.data])
    Assert.equal(r.code, 1)
    Assert.match(r.out, /verdict: invalid/)
  })


  // --- SARIF and watch (G2 phase 5) -----------------------------------

  test('vet-sarif-format-embeds-the-finding', () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: "8080" }')
    const r = vetCapture(() => runVet(['--format', 'sarif', f.schema, f.data]))
    const log = JSON.parse(r.out)
    Assert.equal(log.version, '2.1.0')
    Assert.match(log.$schema, /sarif-2\.1\.0/)
    const result = log.runs[0].results[0]
    Assert.equal(result.ruleId, 'aontu/no_scalar_unify')
    Assert.equal(result.level, 'error')
    Assert.equal(result.properties.path, '$.service.port')
    Assert.equal(
      decodeURIComponent(
        result.locations[0].physicalLocation.artifactLocation.uri),
      f.data)
    Assert.equal(result.relatedLocations.length, 1)
    Assert.match(log.runs[0].tool.driver.version, /^\d+\.\d+\.\d+$/)
  })


  test('vet-watch-streams-a-report-per-change', async () => {
    const f = vetFiles(VET_SCHEMA, 'service: { name: "auth", port: 8080 }')
    let calls = 0
    const wait = async (files: string[], before: string) => {
      Assert.deepEqual(files, [f.schema, f.data])
      // The baseline is recorded BEFORE the run it follows, so a save
      // landing during the run still reads as a change.
      Assert.equal(typeof before, 'string')
      if (0 === calls++) {
        Fs.writeFileSync(f.data, 'service: { name: "auth", port: "80" }')
        return true
      }
      return false
    }

    let code = -1
    const so = process.stdout.write
    let out = ''
    ;(process.stdout as any).write = (s: any) => ((out += s), true)
    try {
      code = await (runVet(['--watch', f.schema, f.data], wait) as Promise<number>)
    }
    finally {
      process.stdout.write = so
    }

    Assert.equal(code, 1)
    Assert.match(out, /verdict: valid[\s\S]*verdict: invalid/)
  })


  test('vet-watch-change-resolves-on-touch', async () => {
    const f = vetFiles(VET_SCHEMA, 'service: {}')
    const missing = Path.join(f.dir, 'not-yet.json')
    const files = [f.schema, missing]

    const change = watchChange(files, watchSignature(files), 20)
    setTimeout(() => Fs.writeFileSync(missing, 'service: {}'), 120)
    Assert.equal(await change, true)
  })


  // The production waiter itself — the real poll interval, driven by a
  // real touch, so the composition runVet actually uses is exercised.
  test('vet-watch-production-waiter', async () => {
    const f = vetFiles(VET_SCHEMA, 'service: {}')
    const files = [f.schema, f.data]

    const change = vetWaiter(files, watchSignature(files))
    setTimeout(() => Fs.writeFileSync(f.data, 'service: { x: 1 }'), 250)
    Assert.equal(await change, true)
  })
})


describe('cli-subsume', () => {

  function subFiles(general: string, specific: string) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-sub-'))
    const g = Path.join(dir, 'general.aon')
    const s = Path.join(dir, 'specific.aon')
    Fs.writeFileSync(g, general)
    Fs.writeFileSync(s, specific)
    return { dir, general: g, specific: s }
  }

  test('subsume-exit-codes-are-verdict-classes', () => {
    const yes = subFiles('a:integer', 'a:1')
    Assert.equal(vetCapture(() =>
      Assert.equal(runSubsume([yes.general, yes.specific]), 0)
    ).out.trim(), 'verdict: subsumes')

    const no = subFiles('a:integer', 'a:hello')
    const r = vetCapture(() =>
      Assert.equal(runSubsume([no.general, no.specific]), 1))
    Assert.match(r.out, /verdict: does_not_subsume/)
    Assert.match(r.out, /\$\.a: compat_narrowed \[compat\]/)
    Assert.match(r.out, /general: .*general\.aon:1:3 \(integer\)/)
    Assert.match(r.out, /specific: .*specific\.aon:1:3 \("hello"\)/)

    const und = subFiles('a:{x:1}|{x:2}', 'a:{x:1|2}')
    vetCapture(() =>
      Assert.equal(runSubsume([und.general, und.specific]), 3))

    const broken = subFiles('a:1 a:2', 'a:1')
    vetCapture(() =>
      Assert.equal(runSubsume([broken.general, broken.specific]), 4))
  })

  test('subsume-profile-selects-the-comparison', () => {
    const f = subFiles('a:*2|number', 'a:*1|number')
    vetCapture(() => Assert.equal(
      runSubsume(['--profile', 'values', f.general, f.specific]), 0))
    const r = vetCapture(() => Assert.equal(
      runSubsume(['--profile', 'defaults', f.general, f.specific]), 1))
    Assert.match(r.out, /compat_default_changed/)
  })

  test('subsume-at-anchors-both-documents', () => {
    const f = subFiles('a:{x:integer} b:2', 'a:{x:1} b:xyz')
    vetCapture(() => Assert.equal(
      runSubsume(['--at', '$.a', f.general, f.specific]), 0))
    // A path missing from either side is an error verdict.
    vetCapture(() => Assert.equal(
      runSubsume(['--at', '$.zz', f.general, f.specific]), 4))
  })

  test('subsume-json-names-the-producer', () => {
    const f = subFiles('a:integer', 'a:hello')
    const r = vetCapture(() =>
      Assert.equal(runSubsume(['--format', 'json', f.general, f.specific]), 1))
    const report = JSON.parse(r.out)
    Assert.equal(report.aontu.verb, 'subsume')
    Assert.equal(report.verdict, 'does_not_subsume')
    Assert.equal(report.findings[0].code, 'compat_narrowed')
    Assert.equal(report.aontu.mode, undefined)
  })

  test('subsume-usage-errors-exit-2', () => {
    Assert.equal(vetCapture(() =>
      Assert.equal(runSubsume(['--bogus']), 2)
    ).err.includes('unknown subsume option'), true)
    vetCapture(() => Assert.equal(runSubsume(['one.aon']), 2))
    vetCapture(() => Assert.equal(
      runSubsume(['--profile', 'bogus', 'a.aon', 'b.aon']), 2))
    vetCapture(() => Assert.equal(runSubsume(['--at']), 2))
    vetCapture(() => Assert.equal(
      runSubsume(['--format', 'sarif', 'a.aon', 'b.aon']), 2))
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(
      runSubsume([Path.join(f.dir, 'missing.aon'), f.specific]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runSubsume(['--help']), 0)
    ).out.includes('aontu subsume'), true)
  })

  test('breaking-detects-the-designs-v1-v2-break', () => {
    const f = subFiles(
      'service: close({name:string,port:*9090|integer,owner:string})',
      'service: close({name:string,port:*8080|integer})')
    const r = vetCapture(() => Assert.equal(
      runBreaking(['--against', f.specific, f.general]), 1))
    Assert.match(r.out, /verdict: breaking/)
    Assert.match(r.out, /\$\.service\.owner: compat_required_added/)
    Assert.match(r.out, /\$\.service\.port: compat_default_changed/)
  })

  test('breaking-modes-choose-the-directions', () => {
    // Widening (v2 admits more) is fine backward, breaking forward.
    const f = subFiles('a:number', 'a:integer')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--mode', 'backward', f.general]), 0))
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--mode', 'forward', f.general]), 1))
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--mode', 'full', f.general]), 1))
  })

  test('breaking-at-gates-a-subtree', () => {
    const f = subFiles(
      'version: "2.0.0"\nsvc: {port: integer}',
      'version: "1.0.0"\nsvc: {port: integer}')
    const whole = vetCapture(() => Assert.equal(
      runBreaking(['--against', f.specific, f.general]), 1))
    Assert.match(whole.out, /\$\.version: compat_narrowed/)

    const at = vetCapture(() => Assert.equal(
      runBreaking(['--at', '$.svc', '--against', f.specific, f.general]), 0))
    Assert.match(at.out, /verdict: compatible/)

    const g = subFiles(
      'version: "2.0.0"\nsvc: {port: 8080}',
      'version: "1.0.0"\nsvc: {port: integer}')
    const narrowed = vetCapture(() => Assert.equal(
      runBreaking(['--at', '$.svc', '--against', g.specific, g.general]), 1))
    Assert.match(narrowed.out, /\$\.port: compat_narrowed/)
  })

  test('breaking-resolves-git-revisions', () => {
    const { execFileSync } = require('node:child_process')
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-brk-'))
    const file = Path.join(dir, 'svc.aon')
    const git = (...args: string[]) => execFileSync('git', [
      '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args,
    ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '.')
    Fs.writeFileSync(file, 'service: close({name:string,port:*8080|integer})')
    git('add', 'svc.aon')
    git('commit', '-q', '-m', 'v1')
    Fs.writeFileSync(file,
      'service: close({name:string,port:*9090|integer,owner:string})')

    const r = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#HEAD', file]), 1))
    Assert.match(r.out, /verdict: breaking/)
    Assert.match(r.out, /specific: git#HEAD:1:\d+/)

    // The forward direction puts the git source on the general side.
    const fwd = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#HEAD', '--mode', 'forward', file]), 1))
    Assert.match(fwd.out, /general: git#HEAD:1:\d+/)

    // An unknown revision is a usage failure naming the spelling.
    const bad = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#no-such-rev', file]), 2))
    Assert.match(bad.err, /cannot resolve git#no-such-rev/)

    // A file the revision does not carry is refused by name rather
    // than compared against nothing.
    const absent = Path.join(dir, 'absent.aon')
    Fs.writeFileSync(absent, 'a: 1')
    const miss = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#HEAD', absent]), 2))
    Assert.match(miss.err, /absent\.aon is not in that revision/)
  })

  test('breaking-git-compares-the-old-tree', () => {
    const { execFileSync } = require('node:child_process')
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-brk-tree-'))
    const model = Path.join(dir, 'model')
    Fs.mkdirSync(model)
    const entry = Path.join(model, 'entry.aon')
    const inc = Path.join(model, 'schema.aon')
    const git = (...args: string[]) => execFileSync('git', [
      '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args,
    ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '.')
    Fs.writeFileSync(entry, 'svc: @"./schema.aon"')
    Fs.writeFileSync(inc, 'port: *8080|integer')
    // A file no include can name: the materialiser must skip it.
    Fs.writeFileSync(Path.join(dir, 'README.md'), '# not a source')
    git('add', '-A')
    git('commit', '-q', '-m', 'v1')

    // Unchanged tree: compatible.
    const same = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#HEAD', entry]), 0))
    Assert.match(same.out, /verdict: compatible/)

    // The narrowing lives in the INCLUDED file only.
    Fs.writeFileSync(inc, 'port: 8080')
    const r = vetCapture(() => Assert.equal(
      runBreaking(['--against', 'git#HEAD', entry]), 1))
    Assert.match(r.out, /verdict: breaking/)
    Assert.match(r.out, /\$\.svc\.port/)

    const linked = Path.join(dir, 'linked')
    let symlinked = true
    try {
      Fs.symlinkSync(model, linked, 'dir')
    }
    catch {
      symlinked = false
    }
    if (symlinked) {
      const via = vetCapture(() => Assert.equal(
        runBreaking(['--against', 'git#HEAD', Path.join(linked, 'entry.aon')]),
        1))
      Assert.match(via.out, /verdict: breaking/)
    }

    // No git binary at all: still a located usage failure, using the
    // spawn error's own message since there is no stderr to quote.
    const savedPath = process.env.PATH
    try {
      process.env.PATH = ''
      const gone = vetCapture(() => Assert.equal(
        runBreaking(['--against', 'git#HEAD', entry]), 2))
      Assert.match(gone.err, /cannot resolve git#HEAD/)
    }
    finally {
      process.env.PATH = savedPath
    }
  })

  test('breaking-reads-the-documents-own-policy', () => {
    const f = subFiles(
      'aontu_policy: hide({compat: *none|backward|forward|full})\na:1',
      'a:hello')
    const r = vetCapture(() => Assert.equal(
      runBreaking(['--against', f.specific, '--format', 'json', f.general]), 0))
    const report = JSON.parse(r.out)
    Assert.equal(report.aontu.mode, 'none')
    Assert.equal(report.verdict, 'compatible')

    // --mode overrides the declaration.
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--mode', 'backward', f.general]), 1))

    // The none path renders as text too.
    Assert.equal(vetCapture(() => Assert.equal(
      runBreaking(['--against', f.specific, f.general]), 0)
    ).out.trim(), 'verdict: compatible')
  })

  test('breaking-policy-spellings', () => {
    const noPref = subFiles(
      'aontu_policy: hide({compat: none|backward})\na:1', 'a:hello')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', noPref.specific, noPref.general]), 0))

    const bare = subFiles(
      'aontu_policy: hide({compat: none})\na:1', 'a:hello')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', bare.specific, bare.general]), 0))

    const notString = subFiles(
      'aontu_policy: hide({compat: 1})\na:integer',
      'aontu_policy: hide({compat: 1})\na:1')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', notString.specific, notString.general]), 0))

    const notMode = subFiles(
      'aontu_policy: hide({compat: sideways})\na:integer',
      'aontu_policy: hide({compat: sideways})\na:1')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', notMode.specific, notMode.general]), 0))

    const broken = subFiles('a:1 a:2', 'a:1')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', broken.specific, broken.general]), 4))
  })

  test('breaking-allow-undecided-downgrades-the-exit', () => {
    const f = subFiles('a:{x:1}|{x:2}', 'a:{x:1|2}')
    const r = vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, f.general]), 3))
    Assert.match(r.out, /verdict: undecided/)
    Assert.match(r.out, /sub_disjunct_distribution/)
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--allow-undecided', f.general]), 0))

    const j = vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--format', 'json', f.general]), 3))
    Assert.equal(JSON.parse(j.out).aontu.mode, 'backward')
    Assert.equal(JSON.parse(j.out).verdict, 'undecided')
  })

  test('breaking-usage-errors-exit-2', () => {
    vetCapture(() => Assert.equal(runBreaking(['file.aon']), 2))
    vetCapture(() => Assert.equal(runBreaking(['--against']), 2))
    const gf = subFiles('a:1', 'a:1')
    Assert.equal(vetCapture(() => Assert.equal(runBreaking(
      ['--against', 'git#', gf.general]), 2)
    ).err.includes('git# needs a revision'), true)
    vetCapture(() => Assert.equal(runBreaking(
      ['--mode', 'sideways', '--against', 'a.aon', 'b.aon']), 2))
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', 'a.aon', 'b.aon', '--at']), 2))
    vetCapture(() => Assert.equal(runBreaking(
      ['--format', 'yaml', '--against', 'a.aon', 'b.aon']), 2))
    vetCapture(() => Assert.equal(runBreaking(['--bogus']), 2))
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', Path.join(f.dir, 'missing.aon'), f.general]), 2))
    vetCapture(() => Assert.equal(runBreaking(
      [Path.join(f.dir, 'missing.aon'), '--against', f.specific]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runBreaking(['--help']), 0)
    ).out.includes('aontu breaking'), true)
  })

  test('breaking-allow-deprecated-removal', () => {
    const f = subFiles(
      'service: close({name:string, listen:integer})',
      'service: close({name:string, listen:integer,' +
      ' port:deprecate(integer,{msg:"renamed",use:"$.service.listen"})})')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, f.general]), 1))
    const r = vetCapture(() => Assert.equal(runBreaking(
      ['--against', f.specific, '--allow-deprecated-removal', f.general]), 0))
    Assert.match(r.out, /verdict: compatible/)
    Assert.match(r.out, /\$\.service\.port: compat_narrowed/)

    const g = subFiles(
      'service: close({name:string})',
      'service: close({name:string, port:integer})')
    vetCapture(() => Assert.equal(runBreaking(
      ['--against', g.specific, '--allow-deprecated-removal', g.general]), 1))
  })

  test('breaking-deprecated-at-reader', () => {
    const src = 'a:[deprecate(1,{msg:"m"})] b:{c:deprecate(2,{msg:"n"})} d:3'
    Assert.equal(deprecatedAt(src, '$.a.0', 'x.aon'), true)
    Assert.equal(deprecatedAt(src, '$.b.c', 'x.aon'), true)
    Assert.equal(deprecatedAt(src, '$.a.5', 'x.aon'), false)
    Assert.equal(deprecatedAt(src, '$.zz', 'x.aon'), false)
    Assert.equal(deprecatedAt(src, '$.d.deeper', 'x.aon'), false)
    Assert.equal(deprecatedAt(src, '$.d', 'x.aon'), false)
    // A document that does not stand alone answers false: the check
    // that produced the finding already reported why.
    Assert.equal(deprecatedAt('a:1 a:2', '$.a', 'x.aon'), false)
  })

  // The trim reporter (G3 phase 6). Go twin: TestTrimVerb in
  // go/cmd/aontu/trim_test.go.
  test('trim-check-reports-redundant-paths', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trim-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file, 'a:{&:{deep:1}, b:{deep:1}, c:{other:2}}')
    const r = vetCapture(() => Assert.equal(runTrim(['--check', file]), 1))
    Assert.match(r.out, /verdict: redundant/)
    Assert.match(r.out, /\$\.a\.b\.deep/)

    Fs.writeFileSync(file, 'x:{y:1}')
    Assert.equal(vetCapture(() =>
      Assert.equal(runTrim(['--check', file]), 0)
    ).out.trim(), 'verdict: clean')

    Fs.writeFileSync(file, 'a:1 a:2')
    const broken = vetCapture(() =>
      Assert.equal(runTrim(['--check', file]), 4))
    Assert.match(broken.out, /verdict: error/)
    Assert.match(broken.out, /\$\.a: scalar_value \[conflict\]/)
    const bj = JSON.parse(vetCapture(() => Assert.equal(
      runTrim(['--check', '--format', 'json', file]), 4)).out)
    Assert.equal(bj.errors[0].code, 'scalar_value')
    // The document's own name, exactly as the command line spelled it.
    Assert.equal(bj.errors[0].sites[0].file, file)

    Fs.writeFileSync(file, 'a:{&:{k:1},m:{k:1}}')
    const j = vetCapture(() => Assert.equal(
      runTrim(['--check', '--format', 'json', file]), 1))
    const report = JSON.parse(j.out)
    Assert.equal(report.aontu.verb, 'trim')
    Assert.equal(report.verdict, 'redundant')
    Assert.deepEqual(report.redundant, ['$.a.m.k'])
    // ABSENT, not empty, on a run that stood up: a consumer's presence
    // check is the whole test.
    Assert.equal('errors' in report, false)
  })

  test('trim-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    // Report-only: rewriting needs a format-preserving editor (G7),
    // so --check is required rather than silently defaulted.
    Assert.equal(vetCapture(() =>
      Assert.equal(runTrim([f.general]), 2)
    ).err.includes('pass --check'), true)
    vetCapture(() => Assert.equal(runTrim(['--check']), 2))
    vetCapture(() => Assert.equal(
      runTrim(['--check', f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runTrim(['--bogus']), 2))
    vetCapture(() => Assert.equal(
      runTrim(['--check', '--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(
      runTrim(['--check', Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runTrim(['--help']), 0)
    ).out.includes('aontu trim'), true)
  })

  test('relations-reports-cycles-and-missing-inverses', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-rel-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
      'b: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.a)]}\n')
    const r = vetCapture(() => Assert.equal(runRelations([file]), 1))
    Assert.match(r.out, /verdict: fail/)
    Assert.match(r.out, /cycle \$\.a -> \$\.b -> \$\.a/)
    Assert.match(r.out, /\$\.b does not list \$\.a under usedBy/)


    // Acyclic AND mirrored: nothing to report.
    Fs.writeFileSync(file,
      'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
      'b: {usedBy: rel() & [path($.a)]}\n')
    Assert.equal(vetCapture(() =>
      Assert.equal(runRelations([file]), 0)
    ).out.trim(), 'verdict: pass')

    Fs.writeFileSync(file, 'a: 1 & 2')
    const rbroken = vetCapture(() => Assert.equal(runRelations([file]), 4))
    Assert.match(rbroken.out, /verdict: error/)
    Assert.match(rbroken.out, /\$\.a: scalar_value \[conflict\]/)
    const rbj = JSON.parse(vetCapture(() => Assert.equal(
      runRelations(['--format', 'json', file]), 4)).out)
    Assert.deepEqual(rbj.findings, [])
    Assert.equal(rbj.errors[0].code, 'scalar_value')

    Fs.writeFileSync(file,
      'a: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.b)]}\n' +
      'b: {dependsOn: rel() & inverse(usedBy) & acyclic() & [path($.a)]}\n')
    const j = vetCapture(() => Assert.equal(
      runRelations(['--format', 'json', file]), 1))
    const report = JSON.parse(j.out)
    Assert.equal(report.aontu.verb, 'relations')
    Assert.equal(report.verdict, 'fail')
    Assert.equal(report.findings.length, 3)
    Assert.equal(report.findings[0].code, 'relation_cycle')
    Assert.deepEqual(report.findings[0].detail, ['$.a', '$.b', '$.a'])
    // ABSENT, not empty, on a run that stood up: the graph had
    // findings, and nothing stopped the graph being looked at.
    Assert.equal('errors' in report, false)
  })

  test('jsonschema-exports-the-model-and-names-what-it-cannot-carry', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-js-'))
    const file = Path.join(dir, 'doc.aon')

    Fs.writeFileSync(file,
      'spec: {\n' +
      '  name: string & re("^[a-z]+$")\n' +
      '  tier: *"internal" | "critical"\n' +
      '  port?: integer & min(1024)\n' +
      '}\n')

    // THE SCHEMA GOES TO STDOUT so `aontu jsonschema x.aon > s.json`
    // writes a usable file, and --at names the subtree as vet's does.
    const r = vetCapture(() =>
      Assert.equal(runJsonSchema(['--at', 'spec', file]), 0))
    const schema = JSON.parse(r.out)
    Assert.equal(schema.$schema,
      'https://json-schema.org/draft/2020-12/schema')
    Assert.equal(schema.properties.name.pattern, '^[a-z]+$')
    Assert.equal(schema.properties.tier.default, 'internal')
    Assert.deepEqual(schema.properties.tier.enum, ['internal', 'critical'])
    // An OPTIONAL key is simply absent from required, which is what
    // `k?:` means and what a consumer must be told.
    Assert.equal(schema.required.includes('port'), false)
    Assert.equal(r.err, '')

    // A LOSS IS NEVER SILENT -- and lands on the OTHER stream, so a
    // redirect keeps the schema clean and the warning visible.
    Fs.writeFileSync(file, 'a: integer & must(min(2), "two")\n')
    const lossy = vetCapture(() => Assert.equal(runJsonSchema([file]), 0))
    Assert.match(lossy.out, /"type": "integer"/)
    Assert.match(lossy.err, /^lossy: \$\.a must:/)

    // ... and --strict turns the report into a refusal.
    vetCapture(() => Assert.equal(runJsonSchema(['--strict', file]), 1))

    // A document that does not stand up has nothing to export, and
    // says why in vet's finding shape.
    Fs.writeFileSync(file, 'a: 1\na: 2\n')
    const broken = vetCapture(() => Assert.equal(runJsonSchema([file]), 4))
    Assert.equal(broken.out, '')
    Assert.match(broken.err, /scalar_value/)

    // An anchor that names nothing is the same class of refusal.
    Fs.writeFileSync(file, 'a: 1\n')
    const noat = vetCapture(() =>
      Assert.equal(runJsonSchema(['--at', 'nope', file]), 4))
    Assert.match(noat.err, /no_path/)

    const j = JSON.parse(vetCapture(() => Assert.equal(
      runJsonSchema(['--format', 'json', file]), 0)).out)
    Assert.equal(j.aontu.verb, 'jsonschema')
    Assert.equal(j.verdict, 'ok')
    Assert.deepEqual(j.lossy, [])
    Assert.equal('errors' in j, false)

    // The SAME refusal under --format json puts the findings in the
    // envelope instead of on stderr, so one redirect keeps both halves.
    Fs.writeFileSync(file, 'a: 1\na: 2\n')
    const je = JSON.parse(vetCapture(() => Assert.equal(
      runJsonSchema(['--format', 'json', file]), 4)).out)
    Assert.equal(je.verdict, 'error')
    Assert.deepEqual(je.schema, {})
    Assert.equal(je.errors[0].code, 'scalar_value')
  })

  test('jsonschema-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runJsonSchema([]), 2))
    vetCapture(() => Assert.equal(
      runJsonSchema([f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runJsonSchema(['--bogus', f.general]), 2))
    vetCapture(() => Assert.equal(
      runJsonSchema(['--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(runJsonSchema(['--at']), 2))
    vetCapture(() => Assert.equal(
      runJsonSchema([Path.join(f.dir, 'missing.aon')]), 2))
    vetCapture(() => Assert.equal(
      runJsonSchema(['--trust', 'nonsense', f.general]), 2))
    // ... and one the parser ACCEPTS reaches the export.
    Assert.equal(JSON.parse(vetCapture(() => Assert.equal(
      runJsonSchema(['--trust', 'none', f.general]), 0)).out).type,
      'object')
    Assert.equal(vetCapture(() =>
      Assert.equal(runJsonSchema(['--help']), 0)
    ).out.includes('aontu jsonschema'), true)
  })

  test('reaches-answers-with-the-path-and-its-exit-code', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-rc-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'a: {dependsOn: [&: refer(), path($.b)]}\n' +
      'b: {dependsOn: [&: refer(), path($.c)], usedBy: [&: refer(), path($.d)]}\n' +
      'c: {}\nd: {}\n')

    // THE PATH IS THE ANSWER: "yes" is worth little to an operator
    // asking what a failure would take out.
    const hit = vetCapture(() =>
      Assert.equal(runReaches(['$.a', '$.c', file]), 0))
    Assert.match(hit.out, /verdict: reaches/)
    Assert.match(hit.out, /\$\.a -> \$\.b -> \$\.c/)

    // An unreachable pair is a FAILED CHECK, not an error: the question
    // was answered, and the answer was no.
    const miss = vetCapture(() =>
      Assert.equal(runReaches(['$.c', '$.a', file]), 1))
    Assert.match(miss.out, /verdict: unreachable/)
    Assert.match(miss.out, /\$\.c does not reach \$\.a/)

    // --relation follows one relation, which is the difference between
    // "can this reach that at all" and "can it reach it THIS way".
    vetCapture(() => Assert.equal(runReaches(['$.a', '$.d', file]), 0))
    vetCapture(() => Assert.equal(
      runReaches(['$.a', '$.d', '--relation', 'dependsOn', file]), 1))

    // An endpoint that names no node is a REFUSAL, not a `no`:
    // answering no would report a typo as a fact about the model.
    const bad = vetCapture(() =>
      Assert.equal(runReaches(['$.a', '$.nope', file]), 4))
    Assert.match(bad.out, /refer_unresolved/)
    Assert.match(bad.out, /nodes with links: \$\.a, \$\.b, \$\.c, \$\.d/)

    const j = JSON.parse(vetCapture(() => Assert.equal(
      runReaches(['$.a', '$.c', '--format', 'json', file]), 0)).out)
    Assert.equal(j.aontu.verb, 'reaches')
    Assert.deepEqual(j.path, ['$.a', '$.b', '$.c'])
    Assert.equal('errors' in j, false)

    // A `no` carries no path -- there is no evidence for a negative
    // answer -- and a refusal carries its findings instead.
    const jn = JSON.parse(vetCapture(() => Assert.equal(
      runReaches(['$.c', '$.a', '--format', 'json', file]), 1)).out)
    Assert.equal(jn.verdict, 'unreachable')
    Assert.equal('path' in jn, false)
    Assert.equal('errors' in jn, false)
    const je = JSON.parse(vetCapture(() => Assert.equal(
      runReaches(['$.a', '$.nope', '--format', 'json', file]), 4)).out)
    Assert.equal(je.verdict, 'error')
    Assert.equal(je.errors[0].code, 'refer_unresolved')
    Assert.equal('path' in je, false)

    // A --trust the parser ACCEPTS reaches the graph.
    vetCapture(() => Assert.equal(
      runReaches(['--trust', 'none', '$.a', '$.c', file]), 0))

    // A document that does not stand up has no graph to ask about.
    Fs.writeFileSync(file, 'a: 1\na: 2\n')
    const broken = vetCapture(() =>
      Assert.equal(runReaches(['a', 'b', file]), 4))
    Assert.match(broken.out, /scalar_value/)
  })

  test('view-draws-the-tree-and-its-exit-code', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vw-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'cli: {dependsOn: [&: refer(), path($.web), path($.db)]}\n' +
      'web: {dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n' +
      'db: {dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n' +
      'disk: {}\n')
    const tree = 'cli\n├── db\n│   └── disk\n└── web\n    └── db (*)\n'

    // THE FIGURE AND NOTHING ELSE on stdout: a redirect is a golden.
    const drawn = vetCapture(() =>
      Assert.equal(runView(['tree', '--relation', 'dependsOn', file]), 0))
    Assert.equal(drawn.out, tree)
    Assert.equal(drawn.err, '')

    // One subtree, from a named root.
    const sub = vetCapture(() => Assert.equal(
      runView(['tree', '--relation', 'dependsOn', '--root', '$.web', file]), 0))
    Assert.equal(sub.out, 'web\n└── db\n    └── disk\n')

    const bad = vetCapture(() => Assert.equal(
      runView(['tree', '--relation', 'dependsOn', '--root', '$.nope', file]), 4))
    Assert.equal(bad.out, '')
    Assert.match(bad.err, /refer_unresolved/)
    Assert.match(bad.err, /\$\.nope is not a node of the dependsOn graph/)
    Assert.match(bad.err, /nodes in the graph: \$\.cli, \$\.db, \$\.disk, \$\.web/)

    // A relation with no edges is refused the same way.
    const rel = vetCapture(() =>
      Assert.equal(runView(['tree', '--relation', 'nope', file]), 4))
    Assert.match(rel.err, /view_relation_unknown/)
    Assert.match(rel.err, /relations with edges: dependsOn, usedBy/)

    // The machine-readable form carries the figure under the envelope.
    const j = JSON.parse(vetCapture(() => Assert.equal(
      runView(['tree', '--relation', 'dependsOn', '--format', 'json', file]),
      0)).out)
    Assert.equal(j.aontu.verb, 'view')
    Assert.equal(j.kind, 'tree')
    Assert.equal(j.verdict, 'rendered')
    Assert.equal(j.text, tree.trimEnd())
    Assert.equal('errors' in j, false)

    // ... and a refusal carries its findings instead of a figure.
    const je = JSON.parse(vetCapture(() => Assert.equal(
      runView(['tree', '--root', '$.nope', '--format', 'json', file]),
      4)).out)
    Assert.equal(je.verdict, 'error')
    Assert.equal(je.errors[0].code, 'refer_unresolved')
    Assert.equal('text' in je, false)

    // A --trust the parser ACCEPTS reaches the graph.
    vetCapture(() => Assert.equal(
      runView(['--trust', 'none', 'tree', file]), 0))

    // The packaged binary, end to end: the figure is the goldens'.
    const r = run(['view', 'tree', '--relation', 'dependsOn', file])
    Assert.equal(r.code, 0)
    Assert.equal(r.out, tree)

    // A document that does not stand up has no graph to draw.
    Fs.writeFileSync(file, 'a: 1\na: 2\n')
    const broken = vetCapture(() =>
      Assert.equal(runView(['tree', file]), 4))
    Assert.match(broken.err, /scalar_value/)

    // The library form, with no options at all: a model with no links
    // renders an empty figure rather than refusing.
    Assert.deepEqual(viewTree('a: 1'),
      { verdict: 'rendered', kind: 'tree', text: '', loss: [] })
  })


  test('view-kinds-and-the-flags-around-the-figure', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vk-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'cli: {layer: "app", dependsOn: [&: refer(), path($.web), path($.db)]}\n' +
      'web: {layer: "svc", dependsOn: [&: refer(), path($.db)], usedBy: [&: refer(), path($.cli)]}\n' +
      'db: {layer: "data", dependsOn: [&: refer(), path($.disk)], usedBy: [&: refer(), path($.cli), path($.web)]}\n' +
      'disk: {layer: "data", dependsOn: []}\n')

    // A figure written to a file, then --check agrees with it; a
    // different figure does not, and nothing is written.
    const out = Path.join(dir, 'm.txt')
    const wrote = vetCapture(() => Assert.equal(
      runView(['matrix', '--relation', 'dependsOn', '--out', out, file]), 0))
    Assert.equal(wrote.out, '')
    const matrix = Fs.readFileSync(out, 'utf8')
    Assert.match(matrix, /# above-diagonal direct cells: 3\n$/)
    vetCapture(() => Assert.equal(
      runView(['matrix', '--relation', 'dependsOn', '--out', out, '--check', file]), 0))
    const mis = vetCapture(() => Assert.equal(
      runView(['matrix', '--relation', 'dependsOn', '--order', 'partition',
        '--closure', '--out', out, '--check', file]), 1))
    Assert.match(mis.err, /differs from the matrix figure/)
    Assert.equal(Fs.readFileSync(out, 'utf8'), matrix)
    vetCapture(() => Assert.equal(
      runView(['matrix', '--relation', 'dependsOn', '--out',
        Path.join(dir, 'none.txt'), '--check', file]), 1))

    // The loss report on stderr, and --strict refusing it.
    const hid = Path.join(dir, 'hid.aon')
    Fs.writeFileSync(hid,
      'a: hide({dependsOn: [&: refer(), path($.b)]})\n' +
      'b: {dependsOn: [&: refer(), path($.c)]}\nc: {}\n')
    const lossy = vetCapture(() => Assert.equal(runView(['tree', hid]), 0))
    Assert.equal(lossy.out, 'b\n└── c\n')
    Assert.equal(lossy.err, 'hidden_contribution  1  $.a.dependsOn.0\n')
    vetCapture(() => Assert.equal(runView(['tree', '--strict', hid]), 1))
    const lj = JSON.parse(vetCapture(() => Assert.equal(
      runView(['tree', '--strict', '--format', 'json', hid]), 1)).out)
    Assert.equal(lj.verdict, 'lossy')
    Assert.equal(lj.loss[0].code, 'hidden_contribution')

    // Every other kind renders through the verb.
    const g = vetCapture(() => Assert.equal(
      runView(['graph', '--relation', 'dependsOn', '--relation', 'usedBy',
        '--group-by', 'layer', '--label', 'layer', '--at', '$', file]), 0))
    Assert.match(g.out, /^flowchart LR\n  subgraph g0\["app"\]/)
    const er = vetCapture(() => Assert.equal(
      runView(['graph', '--as', 'er', file]), 0))
    Assert.match(er.out, /^erDiagram\n/)
    const layer = vetCapture(() => Assert.equal(
      runView(['layer', '--relation', 'dependsOn', '--group-by', 'layer',
        '--layers', 'app,svc,data', file]), 0))
    Assert.match(layer.out, /^\+-+\+\n\| app   cli/)
    const sets = vetCapture(() => Assert.equal(
      runView(['sets', '--sets', '$', '--member', 'dependsOn',
        '--min-degree', '1', '--max-cols', '2', file]), 0))
    Assert.match(sets.out, /^# upset  sets=\$\(4\)/)
    const layers = vetCapture(() => Assert.equal(
      runView(['layers', '--min-size', '1', file]), 0))
    Assert.match(layers.out, /^# layers  file=doc\.aon  documents=1/)
    const ladder = vetCapture(() => Assert.equal(
      runView(['ladder', '--at', '$.db.layer', '--as', 'dot', file]), 0))
    Assert.match(ladder.out, /^digraph G \{/)
    const other = Path.join(dir, 'other.aon')
    Fs.writeFileSync(other, 'cli: {layer: string}\n')
    const poset = vetCapture(() => Assert.equal(
      runView(['poset', '--at', '$.cli.layer', '--profile', 'values',
        file, other]), 0))
    Assert.match(poset.out, /n0\["doc"\]\n  n1\["other"\]\n  n0 --> n1\n$/)
    const unreadable = vetCapture(() => Assert.equal(
      runView(['poset', file, Path.join(dir, 'nope.aon')]), 2))
    Assert.match(unreadable.err, /cannot read/)
  })


  test('view-document-draws-every-figure-it-declares', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vd-'))
    Fs.writeFileSync(Path.join(dir, 'model.aon'),
      'app: {layer: "app", dependsOn: [&: refer(), path($.core)]}\n' +
      'core: {layer: "core"}\n')
    const file = Path.join(dir, 'views.aon')
    Fs.writeFileSync(file, '@"./model.aon"\nviews: {\n' +
      '  tree: {kind: tree, out: "out/tree.txt"}\n' +
      '  bands: {kind: layer, groupBy: layer, out: "out/bands.txt"}\n}\n')
    Fs.mkdirSync(Path.join(dir, 'out'))

    const drew = vetCapture(() => Assert.equal(
      runView(['--views', '$.views', '--trust', 'root', file]), 0))
    Assert.equal(drew.out, '')
    Assert.match(drew.err, /wrote out\/bands\.txt {2}bands \(layer\)/)
    Assert.equal(Fs.readFileSync(Path.join(dir, 'out/tree.txt'), 'utf8'),
      'app\n└── core\n')

    // --check gates what was committed, and names every difference.
    Assert.equal(
      vetCapture(() => Assert.equal(runView(
        ['--views', '$.views', '--check', '--trust', 'root', file]), 0)).err, '')
    Fs.writeFileSync(Path.join(dir, 'out/tree.txt'), 'drifted\n')
    Fs.writeFileSync(Path.join(dir, 'out/bands.txt'), 'drifted\n')
    const gate = vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--check', '--trust', 'root', file]), 1))
    Assert.match(gate.err, /out\/tree\.txt differs from the tree figure/)
    Assert.match(gate.err, /out\/bands\.txt differs from the bands figure/)

    // A figure that was never committed is a mismatch, not a crash: the
    // gate is what a first run of --out would have written.
    Fs.rmSync(Path.join(dir, 'out/tree.txt'))
    Assert.match(vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--check', '--trust', 'root', file]), 1)).err,
      /out\/tree\.txt differs from the tree figure/)

    // The whole report, machine-readable.
    const json = JSON.parse(vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--format', 'json', '--trust', 'root', file]), 0)).out)
    Assert.equal(json.verdict, 'rendered')
    Assert.deepEqual(json.views.map((v: any) => v.name), ['bands', 'tree'])
    Assert.equal(json.views[1].out, 'out/tree.txt')

    // ALL OR NOTHING: a set whose second figure refuses writes neither,
    // and the refusal names the figure it came from.
    const bad = Path.join(dir, 'bad.aon')
    Fs.writeFileSync(bad, '@"./model.aon"\nviews: {\n' +
      '  tree: {kind: tree, out: "out/nope.txt"}\n' +
      '  small: {kind: tree, maxRows: 1, out: "out/small.txt"}\n}\n')
    const refused = vetCapture(() => Assert.equal(
      runView(['--views', '$.views', '--trust', 'root', bad]), 2))
    Assert.match(refused.err, /small \(tree\):/)
    Assert.match(refused.err, /view_rows_exceeded/)
    Assert.equal(Fs.existsSync(Path.join(dir, 'out/nope.txt')), false)

    // A LOSSY set still writes -- the loss report says what it could
    // not draw, and --strict is the gate on that.
    const lossy = Path.join(dir, 'lossy.aon')
    Fs.writeFileSync(lossy,
      'a: hide({dependsOn: [&: refer(), path($.b)]})\nb: {}\n' +
      'views: {t: {kind: tree, out: "out/lossy.txt"}}\n')
    const loose = vetCapture(() => Assert.equal(
      runView(['--views', '$.views', lossy]), 0))
    Assert.match(loose.err, /t {2}hidden_contribution {2}1/)
    Assert.equal(vetCapture(() => Assert.equal(
      runView(['--views', '$.views', '--strict', lossy]), 1)).err.length > 0, true)

    // THE MACHINE-READABLE FORM OF A REFUSAL: the figures that drew
    // still carry their bytes, and the one that refused carries its
    // findings, so a reader of the JSON sees what the run did.
    const badJson = JSON.parse(vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--format', 'json', '--trust', 'root', bad]), 2)).out)
    Assert.equal(badJson.verdict, 'error')
    Assert.equal(badJson.views[1].name, 'tree')
    Assert.equal(typeof badJson.views[1].text, 'string')
    Assert.equal(badJson.views[0].errors[0].code, 'view_rows_exceeded')

    // A declaration the document cannot answer for is the SET's
    // refusal, and usage: nothing is drawn at all.
    const shape = Path.join(dir, 'shape.aon')
    Fs.writeFileSync(shape, 'views: {a: {kind: tree}}\n')
    Assert.match(vetCapture(() => Assert.equal(
      runView(['--views', '$.views', shape]), 2)).err,
      /view_document_shape/)
    const shapeJson = JSON.parse(vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--format', 'json', shape]), 2)).out)
    Assert.deepEqual(shapeJson.views, [])
    Assert.equal(shapeJson.errors[0].code, 'view_document_shape')

    // A figure that refuses for the DOCUMENT's sake rather than the
    // caller's exits 4, as a single figure does.
    const unknown = Path.join(dir, 'unknown.aon')
    Fs.writeFileSync(unknown, '@"./model.aon"\n' +
      'views: {a: {kind: tree, relation: nope, out: "out/a.txt"}}\n')
    Assert.match(vetCapture(() => Assert.equal(runView(
      ['--views', '$.views', '--trust', 'root', unknown]), 4)).err,
      /view_relation_unknown/)
  })


  test('view-document-usage-errors', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vdu-'))
    const file = Path.join(dir, 'views.aon')
    Fs.writeFileSync(file, 'views: {a: {kind: tree, out: "a.txt"}}\n')
    for (const [args, want] of [
      [['--views', '$.views'], /view --views takes one file/],
      [['--views', '$.views', file, file], /view --views takes one file/],
      [['--views', '$.views', '--out', 'x.txt', file],
        /--out is per figure in a view document/],
      [['--views', '$.views', Path.join(dir, 'nope.aon')], /cannot read/],
    ] as [string[], RegExp][]) {
      const got = vetCapture(() => Assert.equal(runView(args), 2))
      Assert.match(got.err, want, args.join(' '))
    }

    // A DIRECTORY IS NOT A FILE: the write fails and says so, rather
    // than leaving the set half-written.
    const blocked = Path.join(dir, 'blocked.aon')
    Fs.writeFileSync(blocked, 'views: {a: {kind: tree, out: "sub"}}\n')
    Fs.mkdirSync(Path.join(dir, 'sub'))
    Assert.match(vetCapture(() => Assert.equal(
      runView(['--views', '$.views', blocked]), 2)).err, /cannot write/)
  })


  test('view-usage-errors', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vu-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file, 'a: {dependsOn: [&: refer(), path($.b)]}\nb: {}\n')
    for (const [args, want] of [
      [[], /view needs a kind and a file/],
      [['tree'], /view needs a kind and a file/],
      [['tree', file, file], /view tree takes one file/],
      [['bogus', file], /unknown view kind bogus/],
      [['tree', '--bogus', file], /unknown view option --bogus/],
      [['tree', '--as', 'png', file], /--as needs one of text, mermaid, dot, er, svg/],
      [['tree', '--as', 'dot', file], /view_profile_unknown/],
      [['matrix', '--order', 'random', file], /--order needs canon or partition/],
      [['layer', '--edges', 'sideways', file], /--edges needs one of upward, all, none/],
      [['poset', '--profile', 'loose', file], /--profile needs values, defaults or gen/],
      [['tree', '--relation', 'a', '--relation', 'b', file], /view tree takes one --relation/],
      [['tree', '--check', file], /--check needs --out/],
      [['tree', file, '--out'], /--out needs a file/],
      [['tree', file, '--at'], /--at needs a value/],
      [['tree', '--max-rows', 'many', file], /--max-rows needs a count/],
      [['tree', '--max-rows', '1', file], /view_rows_exceeded/],
      [['layer', '--layers', '', file], /--layers needs a comma-separated list/],
      [['layer', '--relation', 'dependsOn', file], /view_group_required/],
      [['ladder', file], /view_at_required/],
      [['sets', file], /view_sets_required/],
      [['tree', '--format', 'yaml', file], /--format needs text or json/],
      [['tree', file, '--format'], /--format needs text or json/],
      [['tree', file, '--relation'], /--relation needs a name/],
      [['tree', '--relation', '', file], /--relation needs a name/],
      [['tree', file, '--root'], /--root needs a node path/],
      [['tree', Path.join(dir, 'nope.aon')], /cannot read/],
      [['--trust', 'bogus', 'tree', file], /--trust needs/],
    ] as [string[], RegExp][]) {
      const r = vetCapture(() => Assert.equal(runView(args), 2, args.join(' ')))
      Assert.equal(r.out, '', args.join(' '))
      Assert.match(r.err, want, args.join(' '))
    }

    const help = vetCapture(() => Assert.equal(runView(['--help']), 0))
    Assert.match(help.out, /aontu view <kind>/)

    // The verb dispatches through main as the FIRST argument.
    const viaMain = vetCapture(() =>
      cliMainVet(['node', 'cli', 'view', 'tree', file]))
    Assert.equal(viaMain.out, 'a\n└── b\n')
  })


  test('a-nil-root-with-no-collected-error-is-reported-not-thrown', () => {
    const f = subFiles('&:\n', 'a:1')
    for (const run of [
      () => runRelations([f.general]),
      () => runReaches(['$.b', '$.b', f.general]),
      () => runView(['tree', f.general]),
      () => runJsonSchema([f.general]),
      () => runTrim(['--check', f.general]),
    ]) {
      const r = vetCapture(() => Assert.equal(run(), 4))
      // out OR err: jsonschema puts its refusal on stderr, because
      // stdout is the schema's stream.
      Assert.match(r.out + r.err, /elided_value/)
    }
  })

  test('reaches-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runReaches([]), 2))
    vetCapture(() => Assert.equal(runReaches(['a', f.general]), 2))
    vetCapture(() => Assert.equal(runReaches(['--bogus', 'a', 'b', f.general]), 2))
    vetCapture(() => Assert.equal(
      runReaches(['a', 'b', '--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(runReaches(['a', 'b', '--relation']), 2))
    vetCapture(() => Assert.equal(
      runReaches(['--trust', 'nonsense', 'a', 'b', f.general]), 2))
    vetCapture(() => Assert.equal(
      runReaches(['a', 'b', Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runReaches(['--help']), 0)
    ).out.includes('aontu reaches'), true)
  })

  test('relations-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runRelations([]), 2))
    vetCapture(() => Assert.equal(
      runRelations([f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runRelations(['--bogus']), 2))
    vetCapture(() => Assert.equal(
      runRelations(['--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(
      runRelations([Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runRelations(['--help']), 0)
    ).out.includes('aontu relations'), true)
  })

  // G7 phase 7: the REPL as an inspection tool. The command handler
  // is a pure function of (state, line), so every answer the session
  // gives is as checkable as the CLI's.
  test('repl-loads-a-document-and-answers-about-it', () => {
    const doc = 'services: {\n  &: { replicas: *1 | integer }\n' +
      '  auth: { replicas: 3 }\n}'
    const read = (f: string) => {
      if ('missing.aon' === f) {
        throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
      }
      return doc
    }
    let st: any = { mode: 'json', jsonl: false }
    const run = (line: string) => {
      const r = replCommand(st, line, read)
      st = r.state
      return r
    }

    // Nothing loaded yet: the inspection commands say so rather than
    // guessing.
    Assert.match(run(':get $.a').out, /nothing loaded/)
    Assert.match(run(':why $.a').out, /nothing loaded/)

    Assert.match(run(':load sys.aon').out, /^loaded: sys\.aon/)
    Assert.equal(run(':keys $.services').out, 'auth')
    Assert.equal(run(':get $.services.auth').out, '{\n  "replicas": 3\n}')
    Assert.match(run(':why $.services.auth.replicas').out,
      /\*1\|integer.*\(spread\)/)

    // The `:canon` toggle reaches the query surface too.
    run(':canon')
    Assert.equal(run(':get $.services.auth').out, '{"replicas":3}')

    // A path that names nothing is a refusal, not an answer.
    Assert.match(run(':get $.nope').out, /no_path/)
    Assert.match(run(':why $.nope').out, /no_path/)

    // And the session's own commands still work.
    Assert.equal(run('').out, '')
    Assert.match(run(':help').out, /Usage: aontu/)
    Assert.match(run(':bogus').out, /unknown command/)
    Assert.match(run(':load').out, /needs a file/)
    Assert.match(run(':load missing.aon').out, /cannot read/)
    // A document that does not stand up is refused at :load, and
    // nothing is held: the session keeps whatever it had.
    const broken = replCommand(
      { mode: 'json', jsonl: false } as any, ':load broken.aon',
      () => 'a:1 a:2')
    Assert.equal(broken.state.src, undefined)
    Assert.match(broken.out, /Cannot unify/)
    Assert.equal(run('a:1').out, '{"a":1}')
    Assert.equal(run(':quit').close, true)
    Assert.equal(run(':exit').close, true)
  })

  test('repl-jsonl-is-reachable-over-a-pipe', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-jsonl-'))
    const file = Path.join(dir, 'm.aon')
    Fs.writeFileSync(file, 'a: 1\n')

    const r = run(["--jsonl"], `:load ${file}\n:get $.a\n`)
    Assert.equal(r.code, 0, r.out)

    Assert.ok(r.out.endsWith('\n'), JSON.stringify(r.out))
    const lines = r.out.slice(0, -1).split('\n')
    Assert.equal(lines.length, 2, JSON.stringify(r.out))
    for (const line of lines) {
      const m = JSON.parse(line)
      Assert.equal(m.ok, true, line)
    }
    Assert.equal(JSON.parse(lines[1]).out, '1')
  })


  test('repl-jsonl-answers-in-one-line', () => {
    const read = () => 'a: 1'
    let st: any = { mode: 'json', jsonl: true }
    const run = (line: string) => {
      const r = replCommand(st, line, read)
      st = r.state
      return JSON.parse(r.out)
    }
    Assert.deepEqual(run(':load doc.aon'),
      { ok: true, out: 'loaded: doc.aon\n{\n  "a": 1\n}' })
    Assert.deepEqual(run(':keys'), { ok: true, out: 'a' })
    Assert.equal(run(':get $.zz').ok, false)
    Assert.equal(run('a:1 a:2').ok, false)
  })

  // G7 phase 6: the generated AGENTS.md stanza. The stanza itself is
  // pinned byte for byte by test/spec/agentsmd.tsv in both ports;
  // these cases hold the command line and the SPLICE.
  test('agentsmd-writes-between-its-markers', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-md-'))
    const entry = Path.join(dir, 'sys.aon')
    const target = Path.join(dir, 'AGENTS.md')
    Fs.writeFileSync(entry, 'services: { auth: { owner: string } }')

    const r = vetCapture(() => Assert.equal(runAgentsMd([entry]), 0))
    Assert.match(r.out, /<!-- aontu:begin -->/)
    Assert.match(r.out, /aontu model get \$\.services/)
    Assert.match(r.out, /Pin: `aon1-/)

    // An ABSENT target is an empty one, and prose already there is
    // kept: a generator that rewrote the file is one nobody dares run
    // twice.
    Fs.writeFileSync(target, 'Intro prose.\n')
    vetCapture(() => Assert.equal(runAgentsMd(['--write', target, entry]), 0))
    const first = Fs.readFileSync(target, 'utf8')
    Assert.match(first, /^Intro prose\./)
    Assert.match(first, /<!-- aontu:end -->/)

    vetCapture(() => Assert.equal(runAgentsMd(['--write', target, entry]), 0))
    Assert.equal(Fs.readFileSync(target, 'utf8'), first)

    // A target with no trailing newline gets one, so appending never
    // joins the stanza onto someone's last line.
    const bare = Path.join(dir, 'BARE.md')
    Fs.writeFileSync(bare, 'no trailing newline')
    vetCapture(() => Assert.equal(runAgentsMd(['--write', bare, entry]), 0))
    Assert.match(Fs.readFileSync(bare, 'utf8'),
      /^no trailing newline\n\n<!-- aontu:begin -->/)

    const crlf = Path.join(dir, 'CRLF.md')
    Fs.writeFileSync(crlf,
      'head\r\n\r\n<!-- aontu:begin -->\r\nOLD\r\n<!-- aontu:end -->\r\ntail\r\n')
    vetCapture(() => Assert.equal(runAgentsMd(['--write', crlf, entry]), 0))
    const spliced = Fs.readFileSync(crlf, 'utf8')
    Assert.match(spliced, /<!-- aontu:end -->\ntail\r\n$/)
    vetCapture(() => Assert.equal(runAgentsMd(['--write', crlf, entry]), 0))
    Assert.equal(Fs.readFileSync(crlf, 'utf8'), spliced)

    // The end marker as the LAST content, with no terminator after it.
    const eof = Path.join(dir, 'EOF.md')
    Fs.writeFileSync(eof,
      'head\n\n<!-- aontu:begin -->\nOLD\n<!-- aontu:end -->')
    vetCapture(() => Assert.equal(runAgentsMd(['--write', eof, entry]), 0))
    const ended = Fs.readFileSync(eof, 'utf8')
    Assert.match(ended, /^head\n\n<!-- aontu:begin -->\n/)
    Assert.equal(ended.includes('OLD'), false)

    // A target that does not exist yet is created.
    const fresh = Path.join(dir, 'NEW.md')
    vetCapture(() => Assert.equal(runAgentsMd(['--write', fresh, entry]), 0))
    Assert.match(Fs.readFileSync(fresh, 'utf8'), /<!-- aontu:begin -->/)
  })

  test('agentsmd-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runAgentsMd([]), 2))
    vetCapture(() => Assert.equal(runAgentsMd([f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runAgentsMd(['--bogus', f.general]), 2))
    vetCapture(() => Assert.equal(runAgentsMd(['--write']), 2))
    vetCapture(() => Assert.equal(
      runAgentsMd([Path.join(f.dir, 'missing.aon')]), 2))
    // A target that cannot be read (a directory) is usage, not empty.
    vetCapture(() => Assert.equal(
      runAgentsMd(['--write', f.dir, f.general]), 2))
    vetCapture(() => Assert.equal(
      runAgentsMd(['--write', Path.join(f.dir, 'no-dir', 'A.md'), f.general]),
      2))

    // A document that does not stand up has no stanza: exit 4.
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-md-err-'))
    const broken = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(broken, 'a:1 a:2')
    vetCapture(() => Assert.equal(runAgentsMd([broken]), 4))

    Assert.equal(vetCapture(() =>
      Assert.equal(runAgentsMd(['--help']), 0)
    ).out.includes('aontu agentsmd'), true)
  })


  test('vacuity-signals-on-view-and-relations', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-vacuous-'))
    const plain = Path.join(dir, 'plain.aon')
    Fs.writeFileSync(plain, 'a: { b: 1 }\n')

    // `pass` over NO declarations: the graph is not sound, it is
    // unexamined.
    const rel = vetCapture(() => Assert.equal(runRelations([plain]), 0))
    Assert.match(rel.out, /verdict: pass/)
    Assert.match(rel.err, /declares no relations/)

    // A figure identical to what the same kind draws for `{}`.
    const view = vetCapture(() => Assert.equal(runView(['graph', plain]), 0))
    Assert.match(view.out, /flowchart LR/)
    Assert.match(view.err, /nothing to draw/)

    // AND THE NEGATIVE: a document that DOES declare says nothing.
    const graph = Path.join(dir, 'graph.aon')
    Fs.writeFileSync(graph,
      'a: {dependsOn: rel() & acyclic() & [path($.b)]}\n' +
      'b: {}\n')
    const declared = vetCapture(() => runRelations([graph]))
    Assert.doesNotMatch(declared.err, /declares no relations/)

    Fs.rmSync(dir, { recursive: true, force: true })
  })


  // --- G11 phase 7: --depth on the stanza, --format json on the bare
  // command ---

  test('agentsmd-depth-projects-the-shape', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-md-depth-'))
    const entry = Path.join(dir, 'model.aon')
    Fs.writeFileSync(entry,
      'entity: { &: { table: string, fields: { &: { type: string } } } }')

    const shapeOf = (args: string[]) => {
      const r = vetCapture(() => Assert.equal(runAgentsMd([...args, entry]), 0))
      const line = r.out.split('\n').find((l) => l.startsWith('- Shape: '))
      Assert.ok(null != line, r.out)
      return line
    }

    const deep = shapeOf(['--depth', '4'])
    Assert.notEqual(deep, shapeOf([]), '--depth changed nothing')
    Assert.match(deep, /table/)
    Assert.equal(shapeOf(['--depth', '2']), shapeOf([]),
      '--depth 2 is not the default')

    vetCapture(() => Assert.equal(runAgentsMd(['--depth', '0', entry]), 2))
    vetCapture(() => Assert.equal(runAgentsMd(['--depth', 'two', entry]), 2))
    vetCapture(() => Assert.equal(runAgentsMd(['--depth']), 2))

    // THE LANGUAGE DOOR. A stanza is the first thing an agent reads
    // about a document, and it says where to learn the language the
    // document is written in -- offline, from the binary it has.
    Assert.match(
      vetCapture(() => Assert.equal(runAgentsMd([entry]), 0)).out,
      /aontu help language/)

    Fs.rmSync(dir, { recursive: true, force: true })
  })

  // THE DEFAULT ENTRY POINT WAS THE ONE AN AGENT HAD TO PARSE WITH A
  // REGULAR EXPRESSION: every verb but this one could answer as an
  // object, and this is the one an agent reaches for first.
  test('bare-command-format-json', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-fmtjson-'))
    const good = Path.join(dir, 'good.aon')
    Fs.writeFileSync(good, 'a:1 b:$.a')

    const ok = run(['--format', 'json', good])
    Assert.equal(ok.code, 0)
    const report = JSON.parse(ok.out)
    Assert.equal(report.aontu.verb, 'eval')
    Assert.deepEqual(report.findings, [])
    Assert.equal(report.ok, true)
    // `out` is exactly what the text form prints.
    Assert.equal(report.out, run([good]).out.replace(/\n$/, ''))

    // `--canon` chooses what the answer IS, `--format` how it is
    // wrapped.
    Assert.equal(JSON.parse(run(['-c', '--format', 'json', good]).out).out,
      '{"a":1,"b":1}')

    const bad = Path.join(dir, 'bad.aon')
    Fs.writeFileSync(bad, 'a: 1 & 2\n')
    const failed = run(['--format', 'json', bad])
    Assert.equal(failed.code, 1)
    const report2 = JSON.parse(failed.out)
    Assert.equal(report2.ok, false)
    Assert.equal(report2.out, '')
    Assert.deepEqual(report2.findings, [{
      class: 'conflict',
      code: 'scalar_value',
      message: '[aontu/scalar_value]: Cannot unify values at path $.a',
      path: '$',
      severity: 'error',
      sites: [],
    }])

    // The stdin entry answers the same way.
    Assert.equal(
      JSON.parse(run(['--format', 'json'], 'a: 1 & 2\n').out).findings[0].code,
      'scalar_value')

    for (const args of [['--format', 'yaml'], ['--format']]) {
      const r = run([...args, good])
      Assert.equal(r.code, 2, args.join(' '))
      Assert.match(r.out, /--format needs text or json/)
    }

    Fs.rmSync(dir, { recursive: true, force: true })
  })

  test('set-in-place-rewrites-the-pinned-literal', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'))
    const entry = Path.join(dir, 'schema.aon')
    const overlay = Path.join(dir, 'deploy.aon')
    Fs.writeFileSync(entry, 'replicas: integer & above(0) & below(10)\n')
    Fs.writeFileSync(overlay, '# the deployment\nreplicas: 42   # too many\n')

    // WITHOUT the flag this is the defect: nothing written, exit 1.
    const before = vetCapture(() => Assert.equal(runSet(
      ['$.replicas=5', '--entry', entry, '--overlay', overlay]), 1))
    Assert.match(before.err, /verdict: invalid/)
    Assert.equal(Fs.readFileSync(overlay, 'utf8'),
      '# the deployment\nreplicas: 42   # too many\n', 'untouched')

    // WITH it, the literal is rewritten where it was written.
    const r = vetCapture(() => Assert.equal(runSet(
      ['$.replicas=5', '--entry', entry, '--overlay', overlay,
        '--in-place']), 0))
    Assert.match(r.out, /verdict: valid/)
    Assert.match(r.out, /replaced: .*deploy\.aon:2:11 42 -> 5/)
    Assert.match(r.out, /wrote:/)
    // BOTH COMMENTS SURVIVE, the one on the edited line included.
    Assert.equal(Fs.readFileSync(overlay, 'utf8'),
      '# the deployment\nreplicas: 5   # too many\n')
  })


  // Where it cannot rewrite it APPENDS, exactly as plain set would, and
  // says why. --dry-run still writes nothing.
  test('set-in-place-appends-and-explains-when-it-cannot-rewrite', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'))
    const entry = Path.join(dir, 'schema.aon')
    const overlay = Path.join(dir, 'ov.aon')
    Fs.writeFileSync(entry, 'a: integer\n')
    Fs.writeFileSync(overlay, 'a: 1+2\n')

    const r = vetCapture(() => Assert.equal(runSet(
      ['$.a=5', '--entry', entry, '--overlay', overlay,
        '--in-place', '--dry-run']), 1))
    Assert.match(r.err, /patch_not_editable/)
    Assert.match(r.err, /opening token/)
    Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'a: 1+2\n', 'dry run')
  })


  // WHAT THE TEXT RENDERER SAYS ABOUT AN EDIT THAT DID NOT HAPPEN, and
  // WHICH STREAM A SUCCESSFUL RUN WRITES TO. Both were wrong when
  // --in-place landed and both are load-bearing for an operator.
  test('set-in-place-reports-unapplied-edits-and-uses-the-right-stream', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'))
    const entry = Path.join(dir, 'e.aon')
    const overlay = Path.join(dir, 'ov.aon')

    // ONE ASSIGNMENT REPLACEABLE, ANOTHER REFUSED. The write is refused
    // as a whole, so the file is untouched -- and the renderer must not
    // report the replaceable one in the PAST TENSE.
    Fs.writeFileSync(entry, 'a: integer\nb: integer & below(10)\n')
    Fs.writeFileSync(overlay, 'a: 1\nb: 42\n')
    const r = vetCapture(() => Assert.equal(runSet(
      ['$.a=2', '$.b=99', '--entry', entry, '--overlay', overlay,
        '--in-place']), 1))
    Assert.match(r.err, /would replace: .*1 -> 2/)
    Assert.doesNotMatch(r.err, /^replaced:/m, 'nothing was replaced')
    Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'a: 1\nb: 42\n')

    Fs.writeFileSync(entry, 'a: integer\n')
    Fs.writeFileSync(overlay, 'a: integer\n')
    const ok = vetCapture(() => Assert.equal(runSet(
      ['$.a=5', '--entry', entry, '--overlay', overlay, '--in-place']), 0))
    Assert.match(ok.out, /verdict: valid/)
    Assert.match(ok.out, /wrote:/)
    Assert.match(ok.err, /patch_not_editable/, 'the warning is a diagnostic')
    Assert.doesNotMatch(ok.err, /verdict:/, 'status is not duplicated')
  })


  test('set-appends-to-the-overlay-when-the-change-holds', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-'))
    const entry = Path.join(dir, 'sys.aon')
    const overlay = Path.join(dir, 'ov.aon')
    Fs.writeFileSync(entry,
      'services: { auth: { owner: string, replicas: *1 | integer } }')

    // An ABSENT overlay is the empty overlay, and the file is created.
    const r = vetCapture(() => Assert.equal(runSet(
      ['$.services.auth.owner="identity-2"',
        '--entry', entry, '--overlay', overlay]), 0))
    Assert.match(r.out, /verdict: valid/)
    Assert.match(r.out, /wrote:/)
    Assert.equal(Fs.readFileSync(overlay, 'utf8'),
      '"services": "auth": "owner": "identity-2"\n')

    // A second assignment appends after the first.
    vetCapture(() => Assert.equal(runSet(
      ['$.services.auth.replicas=5',
        '--entry', entry, '--overlay', overlay]), 0))
    Assert.equal(Fs.readFileSync(overlay, 'utf8'),
      '"services": "auth": "owner": "identity-2"\n' +
      '"services": "auth": "replicas": 5\n')

    const j = JSON.parse(vetCapture(() => Assert.equal(runSet(
      ['$.services.auth.owner="identity-2"', '--format', 'json',
        '--entry', entry, '--overlay', overlay]), 0)).out)
    Assert.equal(j.aontu.verb, 'model set')
    Assert.equal(j.verdict, 'valid')
    Assert.equal(j.written, true)
    Assert.deepEqual(j.appended, ['"services": "auth": "owner": "identity-2"'])
  })

  // A change that contradicts a PINNED value is a question for the
  // author at the pinning site: reported, exit 1, and NOT written —
  // leaving it in the overlay would leave the configuration broken.
  test('set-refuses-to-write-a-change-that-does-not-hold', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-set-no-'))
    const entry = Path.join(dir, 'sys.aon')
    const overlay = Path.join(dir, 'ov.aon')
    Fs.writeFileSync(entry, 'port: 3')
    Fs.writeFileSync(overlay, 'x: 1\n')

    const r = vetCapture(() => Assert.equal(runSet(
      ['$.port=5', '--entry', entry, '--overlay', overlay]), 1))
    Assert.match(r.err, /verdict: invalid/)
    Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n')

    // --dry-run prints the verdict and writes nothing, even when it
    // would have held.
    const d = vetCapture(() => Assert.equal(runSet(
      ['$.port=3', '--dry-run', '--entry', entry, '--overlay', overlay]), 0))
    Assert.match(d.out, /\(dry run\)/)
    Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n')

    // An entry that does not stand up is verdict error, exit 4.
    Fs.writeFileSync(entry, 'a:1 a:2')
    vetCapture(() => Assert.equal(runSet(
      ['$.b=1', '--entry', entry, '--overlay', overlay]), 4))
    Assert.equal(Fs.readFileSync(overlay, 'utf8'), 'x: 1\n')
  })

  test('set-usage-errors-exit-2', () => {
    const f = subFiles('a:{b:integer}', 'a:1')
    const ov = Path.join(f.dir, 'ov.aon')
    vetCapture(() => Assert.equal(runSet([]), 2))
    vetCapture(() => Assert.equal(runSet(['$.a.b=1']), 2))
    vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--entry', f.general]), 2))
    vetCapture(() => Assert.equal(runSet(
      ['--entry', f.general, '--overlay', ov]), 2))
    vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--bogus', '--entry', f.general, '--overlay', ov]), 2))
    vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--format', 'yaml', '--entry', f.general, '--overlay', ov]), 2))
    vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--entry', Path.join(f.dir, 'missing.aon'),
        '--overlay', ov]), 2))
    // An overlay that cannot be READ (a directory, not a missing file)
    // is a usage error, not an empty overlay.
    vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--entry', f.general, '--overlay', f.dir]), 2))
    // An overlay whose DIRECTORY does not exist reads as absent (the
    // empty overlay) and then fails to write, which is also usage.
    Assert.equal(vetCapture(() => Assert.equal(runSet(
      ['$.a.b=1', '--entry', f.general,
        '--overlay', Path.join(f.dir, 'no-such-dir', 'ov.aon')]), 2)
    ).err.includes('cannot write'), true)
    Assert.equal(vetCapture(() =>
      Assert.equal(runSet(['--help']), 0)
    ).out.includes('aontu model set'), true)
  })

  // G7 phase 3: provenance. The record itself is pinned by
  // test/spec/why.tsv in both ports; these cases hold the command
  // line and the text rendering.
  test('why-names-every-contribution', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-why-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'services: {\n  &: { replicas: *1 | integer }\n' +
      '  auth: { replicas: 3 }\n  db: {}\n}\n')

    const r = vetCapture(() =>
      Assert.equal(runWhy(['$.services.auth.replicas', file]), 0))
    Assert.match(r.out, /^\$\.services\.auth\.replicas = 3/)
    Assert.match(r.out, /1\. \*1\|integer.*doc\.aon:2:18  \(spread\)/)
    Assert.match(r.out, /2\. 3.*doc\.aon:3:21/)

    const q = vetCapture(() =>
      Assert.equal(runWhy(['$.services.db.replicas', file]), 0))
    Assert.match(q.out, /1\. \*1\|integer.*doc\.aon:2:18  \(spread\)/)

    const topFile = Path.join(dir, 'top.aon')
    Fs.writeFileSync(topFile, 'a: top\n')
    const t = vetCapture(() => Assert.equal(runWhy(['$.a', topFile]), 0))
    Assert.match(t.out, /no contributions/)

    const j = JSON.parse(vetCapture(() => Assert.equal(
      runWhy(['$.services.auth.replicas', '--format', 'json', file]), 0)).out)
    Assert.equal(j.aontu.verb, 'model why')
    Assert.equal(j.ok, true)
    Assert.equal(j.record.value, '3')
    Assert.equal(j.record.conjuncts.length, 2)
    Assert.equal(j.record.conjuncts[0].role, 'spread')
  })

  test('why-exit-codes-and-usage', () => {
    const f = subFiles('a:{b:1}', 'a:1')
    const miss = vetCapture(() => Assert.equal(runWhy(['$.zz', f.general]), 1))
    Assert.match(miss.err, /no_path/)

    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-why-err-'))
    const broken = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(broken, 'a:1 a:2')
    vetCapture(() => Assert.equal(runWhy(['$.a', broken]), 4))

    vetCapture(() => Assert.equal(runWhy([]), 2))
    vetCapture(() => Assert.equal(runWhy(['$.a']), 2))
    vetCapture(() => Assert.equal(runWhy(['$.a', f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runWhy(['--bogus', '$.a', f.general]), 2))
    vetCapture(() => Assert.equal(
      runWhy(['$.a', '--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(runWhy(['$.a', '--format']), 2))
    vetCapture(() => Assert.equal(
      runWhy(['$.a', Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runWhy(['--help']), 0)
    ).out.includes('aontu model why'), true)

    // The JSON form of a refusal carries the findings and no record.
    const j = JSON.parse(vetCapture(() => Assert.equal(
      runWhy(['$.zz', '--format', 'json', f.general]), 1)).out)
    Assert.equal(j.ok, false)
    Assert.equal(j.record, undefined)
    Assert.equal(j.findings[0].code, 'no_path')
  })

  test('why-renders-a-siteless-contribution', () => {
    Assert.equal(
      renderWhyText({
        conjuncts: [
          {
            canon: '1', role: 'literal', src: '',
            site: { col: -1, file: '', len: -1, row: -1 },
          },
          {
            canon: 'integer', role: 'spread', src: 'integer',
            site: { col: 3, file: '', len: 7, row: 2 },
          },
        ],
        path: '$.a',
        value: '1',
      }),
      '$.a = 1\n  1. 1\n  2. integer  2:3  (spread)')
  })

  test('get-renders-one-node-per-view', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-get-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file,
      'svc:{auth:{image:"a:v2",replicas:3}}\nport: *8080|integer\n')

    Assert.equal(
      vetCapture(() => Assert.equal(runGet(['$.svc.auth.replicas', file]), 0))
        .out.trim(), '3')
    Assert.equal(
      vetCapture(() => Assert.equal(
        runGet(['$.svc.auth', '--canon', file]), 0)).out.trim(),
      '{"image":"a:v2","replicas":3}')
    Assert.equal(
      vetCapture(() => Assert.equal(
        runGet(['$.svc.auth', '--types', file]), 0)).out.trim(),
      '{"image":string,"replicas":integer}')
    Assert.equal(
      vetCapture(() => Assert.equal(runGet(['$.svc', '--keys', file]), 0))
        .out.trim(), 'auth')
    Assert.equal(
      vetCapture(() => Assert.equal(
        runGet(['$', '--canon', '--depth', '1', file]), 0)).out.trim(),
      '{"port":top,"svc":top}')

    const j = JSON.parse(vetCapture(() => Assert.equal(
      runGet(['$.svc.auth', '--format', 'json', file]), 0)).out)
    Assert.equal(j.aontu.verb, 'model get')
    Assert.equal(j.ok, true)
    Assert.equal(j.findings.length, 0)
  })

  // A path that names nothing is the QUESTION's answer -- exit 1, the
  // "no" class -- while a document that does not stand up is exit 4.
  test('get-exit-codes-separate-no-from-broken', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-get-err-'))
    const file = Path.join(dir, 'doc.aon')

    Fs.writeFileSync(file, 'svc:{auth:{image:"a"}}')
    const miss = vetCapture(() =>
      Assert.equal(runGet(['$.svc.auht', file]), 1))
    Assert.equal(miss.out, '')
    Assert.match(miss.err, /no_path/)
    Assert.match(miss.err, /did you mean auth\?/)

    Fs.writeFileSync(file, 'a:1 a:2')
    vetCapture(() => Assert.equal(runGet(['$', file]), 4))

    // A value that is not concrete has no JSON, and says so as an
    // error rather than inventing one.
    Fs.writeFileSync(file, 'k: integer')
    vetCapture(() => Assert.equal(runGet(['$.k', file]), 4))
    Assert.equal(vetCapture(() =>
      Assert.equal(runGet(['$.k', '--canon', file]), 0)).out.trim(), 'integer')
  })

  test('get-usage-errors-exit-2', () => {
    const f = subFiles('a:{b:1}', 'a:1')
    vetCapture(() => Assert.equal(runGet([]), 2))
    vetCapture(() => Assert.equal(runGet(['$.a']), 2))
    vetCapture(() => Assert.equal(runGet(['$.a', f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runGet(['--bogus', '$.a', f.general]), 2))
    vetCapture(() => Assert.equal(
      runGet(['$.a', '--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(runGet(['$.a', '--depth', 'x', f.general]), 2))
    vetCapture(() => Assert.equal(runGet(['$.a', '--depth', '0', f.general]), 2))
    vetCapture(() => Assert.equal(runGet(['$.a', '--depth', f.general]), 2))
    // Eliding below a depth means rendering `top`, which JSON cannot
    // say -- refused rather than silently switching the view.
    Assert.equal(vetCapture(() =>
      Assert.equal(runGet(['$.a', '--depth', '1', f.general]), 2)
    ).err.includes('JSON cannot say top'), true)
    vetCapture(() => Assert.equal(
      runGet(['$.a', Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runGet(['--help']), 0)
    ).out.includes('aontu model get'), true)
  })

  test('hash-pins-meaning-not-text', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-hash-'))
    const file = Path.join(dir, 'doc.aon')

    Fs.writeFileSync(file, 'b: 2\na: 1\n')
    const first = vetCapture(() => Assert.equal(runHash([file]), 0)).out.trim()
    Assert.match(first, /^aon1-[A-Za-z0-9_-]{43}$/)

    // Same meaning, different bytes: comments, whitespace, key order.
    Fs.writeFileSync(file, '# the module\n\n   a:1\n   b:2  # trailing\n')
    Assert.equal(
      vetCapture(() => Assert.equal(runHash([file]), 0)).out.trim(), first)

    // A semantic change moves it -- closedness is IN the hash form
    // even though canon drops it.
    Fs.writeFileSync(file, 'a: 1\nb: 3\n')
    Assert.notEqual(
      vetCapture(() => Assert.equal(runHash([file]), 0)).out.trim(), first)

    Fs.writeFileSync(file, 'x: {a:1}')
    const open = vetCapture(() => Assert.equal(runHash([file]), 0)).out.trim()
    Fs.writeFileSync(file, 'x: close({a:1})')
    const closed = vetCapture(() => Assert.equal(runHash([file]), 0)).out.trim()
    Assert.notEqual(closed, open)

    // --form prints the hashed TEXT, which is what to diff when a pin
    // moves, and the JSON report carries both.
    Assert.equal(
      vetCapture(() => Assert.equal(runHash(['--form', file]), 0)).out.trim(),
      '{"x":close({"a":1})}')
    const j = JSON.parse(vetCapture(() =>
      Assert.equal(runHash(['--format', 'json', file]), 0)).out)
    Assert.equal(j.aontu.verb, 'hash')
    Assert.equal(j.hash, closed)
    Assert.equal(j.form, '{"x":close({"a":1})}')
  })

  test('hash-usage-errors-exit-2', () => {
    const f = subFiles('a:1', 'a:1')
    vetCapture(() => Assert.equal(runHash([]), 2))
    vetCapture(() => Assert.equal(runHash([f.general, f.specific]), 2))
    vetCapture(() => Assert.equal(runHash(['--bogus', f.general]), 2))
    vetCapture(() => Assert.equal(runHash(['--format', 'yaml', f.general]), 2))
    vetCapture(() => Assert.equal(runHash(['--format']), 2))
    vetCapture(() => Assert.equal(
      runHash([Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runHash(['--help']), 0)
    ).out.includes('aontu hash'), true)
  })

  // A document that does not stand up on its own has no meaning to
  // pin: exit 4, the verbs' error class, and NOT a hash of the wreck
  // (which would agree with every other wreck).
  test('hash-broken-document-exits-4', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-hash-err-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file, 'a:1 a:2')
    const r = vetCapture(() => Assert.equal(runHash([file]), 4))
    Assert.equal(r.out, '')
    Assert.match(r.err, /does not evaluate on its own/)
  })

  // The verbs ride the same first-argument dispatch vet does.
  test('subsume-verbs-dispatch-from-main', () => {
    const f = subFiles('a:integer', 'a:1')
    const r = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'subsume', f.general, f.specific]))
    Assert.match(r.out, /verdict: subsumes/)
    const b = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'breaking', '--against', f.specific, f.general]))
    Assert.match(b.out, /verdict: compatible/)
    const t = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'trim', '--check', f.general]))
    Assert.match(t.out, /verdict: clean/)
    const rl = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'relations', f.general]))
    Assert.match(rl.out, /verdict: pass/)
    const h = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'hash', f.general]))
    Assert.match(h.out, /^aon1-/)
    const g = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'model', 'get', '$.a', '--canon', f.general]))
    Assert.match(g.out, /integer/)
    const w = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'model', 'why', '$.a', f.general]))
    Assert.match(w.out, /\$\.a = integer/)
    const st = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'model', 'set', '$.a=1', '--dry-run',
        '--entry', f.general, '--overlay', Path.join(f.dir, 'ov.aon')]))
    Assert.match(st.out, /verdict: valid/)
    const md = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'agentsmd', f.general]))
    Assert.match(md.out, /aontu:begin/)
    const js = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'jsonschema', f.general]))
    Assert.match(js.out, /"type": "integer"/)
    const rc = vetCapture(() => cliMainVet(
      ['node', 'aontu', 'reaches', 'x', 'y', f.general]))
    Assert.match(rc.out, /verdict: error/)
  })

})


describe('cli-repair-loop', () => {

  function loopFiles(): { dir: string; schema: string; deploy: string } {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-loop-'))
    const schema = Path.join(dir, 'schema.aon')
    const deploy = Path.join(dir, 'deploy.aon')
    Fs.writeFileSync(schema,
      'service: {\n' +
      '  name: string\n' +
      '  port: integer & above(1023)\n' +
      '}\n')
    // What an agent emitted: the name is right, the port was never
    // written. A HOLE, which is the shape `set` can repair.
    Fs.writeFileSync(deploy, 'service: { name: "auth" }\n')
    return { dir, schema, deploy }
  }


  test('emit-vet-why-set-revet-closes', () => {
    const f = loopFiles()
    const overlay = Path.join(f.dir, 'overlay.aon')

    const vet1 = run(['vet', f.schema, f.deploy])
    Assert.equal(vet1.code, 3)
    Assert.match(vet1.out, /verdict: incomplete/)
    Assert.match(vet1.out, /\$\.service\.port/)

    // 2. WHY, on the schema, for what the hole has to satisfy. The
    //    finding named the path; this is the step that turns it into a
    //    constraint the emitter can meet.
    const why = run(['model', 'why', '$.service.port', f.schema])
    Assert.equal(why.code, 0)
    Assert.match(why.out, /above\(1023\)/)

    // 3. SET, which writes the overlay only if the change holds.
    const set = run(['model', 'set', '$.service.port=8080',
      '--entry', f.deploy, '--overlay', overlay])
    Assert.equal(set.code, 0)
    Assert.match(set.out, /verdict: valid/)
    Assert.match(set.out, /wrote: /)
    Assert.match(Fs.readFileSync(overlay, 'utf8'), /"service": "port": 8080/)

    // The entry is UNTOUCHED: the overlay is the change, which is what
    // makes the loop safe to run against a file a human also edits.
    Assert.equal(Fs.readFileSync(f.deploy, 'utf8'),
      'service: { name: "auth" }\n')

    const all = Path.join(f.dir, 'all.aon')
    Fs.writeFileSync(all, '@"./deploy.aon"\n@"./overlay.aon"\n')
    const vet2 = run(['vet', f.schema, all])
    Assert.equal(vet2.code, 0)
    Assert.match(vet2.out, /verdict: valid/)
  })


  test('a-pinned-value-refuses-the-repair-and-writes-nothing', () => {
    const f = loopFiles()
    const overlay = Path.join(f.dir, 'overlay.aon')

    const set = run(['model', 'set', '$.service.name="other"',
      '--entry', f.deploy, '--overlay', overlay])
    Assert.equal(set.code, 1)
    Assert.match(set.out, /verdict: invalid/)
    Assert.match(set.out, /\$\.service\.name/)
    Assert.equal(Fs.existsSync(overlay), false)
    Assert.equal(Fs.readFileSync(f.deploy, 'utf8'),
      'service: { name: "auth" }\n')
  })


  test('a-broken-schema-stops-the-loop-and-says-why', () => {
    const f = loopFiles()
    const broken = Path.join(f.dir, 'broken.aon')
    Fs.writeFileSync(broken, 'a: 1\na: 2\n')
    const r = run(['vet', '--format', 'json', broken, f.deploy])
    Assert.equal(r.code, 4)
    const report = JSON.parse(r.out)
    Assert.equal(report.verdict, 'error')
    Assert.equal(report.findings.length, 1)
    Assert.equal(report.findings[0].code, 'scalar_value')
    for (const site of report.findings[0].sites) {
      Assert.equal(site.role, 'schema')
      Assert.equal(site.file, broken)
    }
  })

})


// --- the fmt verb (docs/design/FMT.0.md P1) ---------------------------


function fmtFiles(...srcs: string[]): { dir: string, files: string[] } {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-fmt-'))
  const files = srcs.map((src, i) => {
    const file = Path.join(dir, `d${i}.aon`)
    Fs.writeFileSync(file, src)
    return file
  })
  return { dir, files }
}

describe('cli-fmt', () => {
  test('fmt-prints-one-file', async () => {
    const f = fmtFiles('a:{b:1}\n', 'x: 1\n')
    // THE FORM AND NOTHING ELSE on stdout: a redirect is the file.
    const r = vetCapture(() => Assert.equal(runFmt([f.files[0]]), 0))
    Assert.equal(r.out, 'a: b: 1\n')
    Assert.equal(r.err, '')
    // A file already in the form prints unchanged, and is not touched.
    const clean = vetCapture(() => Assert.equal(runFmt([f.files[1]]), 0))
    Assert.equal(clean.out, 'x: 1\n')
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a:{b:1}\n')
  })

  test('fmt-takes-its-marker-from-a-profile', async () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-fmt-profile-'))
    const profile = Path.join(dir, 'ocaml.aon')
    Fs.writeFileSync(profile, '@"aontu:profile"\n\n' +
      'aontu: Lang: lang: "ocaml"\n' +
      'aontu: Lang: indent: { unit:" " width:2 }\n' +
      'aontu: Lang: template: ' +
      '{ marker:"(*-" close:"*)" ext:["ml" "mli"] }\n')
    const unit = Path.join(dir, 'gen.ml')
    Fs.writeFileSync(unit, '(*- x:[ *)\nlet a = 1\n(*- ] *)\n')

    // A GENERATOR IN A LANGUAGE THE TABLE DOES NOT KNOW formats when a
    // profile names its marker, and is refused when nothing does.
    const r = vetCapture(
      () => Assert.equal(runFmt(['--profile', profile, unit]), 0))
    Assert.equal(r.out, '(*- x: [ *)\nlet a = 1\n(*- ] *)\n')

    const bare = vetCapture(() => Assert.equal(runFmt([unit]), 2))
    Assert.match(bare.err, /--profile reads one that declares it/)

    // Markdown is in the table, so it needs no profile at all.
    const note = Path.join(dir, 'note.md')
    Fs.writeFileSync(note, '<!--- x:[ -->\n# T\n<!--- ] -->\n')
    Assert.equal(
      vetCapture(() => Assert.equal(runFmt([note]), 0)).out,
      '<!--- x: [ -->\n# T\n<!--- ] -->\n')

    Assert.match(
      vetCapture(() => Assert.equal(runFmt(['--profile']), 2)).err,
      /--profile needs a file/)
    Assert.match(
      vetCapture(() => Assert.equal(
        runFmt(['--profile', Path.join(dir, 'no.aon'), unit]), 2)).err,
      /cannot read/)
    vetCapture(() => Assert.equal(runFmt(['--trust', 'nonsense', unit]), 2))
  })


  test('fmt-list-check-diff', async () => {
    const f = fmtFiles('a:{b:1}\n', 'x: 1\n')
    // --list names the files whose form would change; --check is the
    // same list and exit 1 when it is not empty.
    const l = vetCapture(() => Assert.equal(runFmt(['--list', ...f.files]), 0))
    Assert.equal(l.out, f.files[0] + '\n')
    const c = vetCapture(() => Assert.equal(runFmt(['--check', ...f.files]), 1))
    Assert.equal(c.out, f.files[0] + '\n')
    Assert.equal(vetCapture(() =>
      Assert.equal(runFmt(['--check', f.files[1]]), 0)).out, '')
    // --diff is the unified diff, per file that would change.
    const d = vetCapture(() => Assert.equal(runFmt(['-d', ...f.files]), 0))
    Assert.equal(d.out,
      `--- a/${f.files[0]}\n+++ b/${f.files[0]}\n@@ -1,1 +1,1 @@\n-a:{b:1}\n+a: b: 1\n`)
    // Nothing was written by any of them.
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a:{b:1}\n')
  })

  test('fmt-write', async () => {
    const f = fmtFiles('a:{b:1}\n', 'x: 1\n')
    const before = Fs.statSync(f.files[1]).mtimeMs
    const w = vetCapture(() => Assert.equal(runFmt(['-w', ...f.files]), 0))
    Assert.equal(w.out, '')
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a: b: 1\n')
    // A file already in the form is left alone, not rewritten.
    Assert.equal(Fs.statSync(f.files[1]).mtimeMs, before)
    // --list with --write says what was rewritten.
    Fs.writeFileSync(f.files[0], 'a:{b:1}\n')
    const lw = vetCapture(() => Assert.equal(runFmt(['-l', '--write', f.files[0]]), 0))
    Assert.equal(lw.out, f.files[0] + '\n')
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a: b: 1\n')
    // A file that cannot be written back is reported, exit 2. The
    // write is made to fail from here: a permission that would stop it
    // is one the user running the suite may not be subject to.
    Fs.writeFileSync(f.files[0], 'a:{b:1}\n')
    const fs = require('node:fs')
    const real = fs.writeFileSync
    fs.writeFileSync = () => {
      throw new Error('EACCES: permission denied')
    }
    try {
      const bad = vetCapture(() => Assert.equal(runFmt(['-w', f.files[0]]), 2))
      Assert.match(bad.err, /cannot write .*EACCES/)
    }
    finally {
      fs.writeFileSync = real
    }
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a:{b:1}\n')
  })

  test('fmt-usage-errors-exit-2', async () => {
    const f = fmtFiles('a:1\n', 'b:1\n')
    // Several files onto stdout is refused: say what to do with each.
    const two = vetCapture(() => Assert.equal(runFmt(f.files), 2))
    Assert.match(two.err, /fmt prints one file; with 2, say --write/)
    Assert.equal(two.out, '')
    vetCapture(() => Assert.equal(runFmt(['--bogus', f.files[0]]), 2))
    vetCapture(() => Assert.equal(runFmt(['-w']), 2))
    vetCapture(() => Assert.equal(runFmt([Path.join(f.dir, 'missing.aon')]), 2))
    Assert.equal(vetCapture(() =>
      Assert.equal(runFmt(['--help']), 0)).out.includes('aontu fmt'), true)
  })

  // A document that does not parse is not formatted: exit 4, the
  // finding on stderr, nothing on stdout, nothing written -- and the
  // other files given with it are still done.
  test('fmt-syntax-error-exits-4', async () => {
    const f = fmtFiles('a: {b\n', 'x:1\n')
    const r = vetCapture(() => Assert.equal(runFmt([f.files[0]]), 4))
    Assert.equal(r.out, '')
    Assert.match(r.err, /was not formatted/)
    Assert.match(r.err, /syntax \[parse\]/)
    const both = vetCapture(() => Assert.equal(runFmt(['-w', ...f.files]), 4))
    Assert.equal(both.out, '')
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'a: {b\n')
    Assert.equal(Fs.readFileSync(f.files[1], 'utf8'), 'x: 1\n')
  })

  // --lint points at the style the formatter never touches: the
  // findings on stderr as `file:line:col: rule: message`, nothing on
  // stdout, and the exit code left alone unless --strict asks.
  test('fmt-lint-and-strict', async () => {
    const f = fmtFiles('credit_cents: 1\n', 'x:{y:1}\n')
    const where = `${f.files[0]}:1:1: style/key-case: key credit_cents holds ` +
      'an underscore; creditCents would follow the form\n'
    const l = vetCapture(() => Assert.equal(runFmt(['--lint', ...f.files]), 0))
    Assert.equal(l.out, '')
    Assert.equal(l.err, where)
    const clean = vetCapture(() => Assert.equal(runFmt(['--lint', f.files[1]]), 0))
    Assert.equal(clean.out + clean.err, '')
    // --strict is --lint with the exit code: 1 when there is a finding,
    // 0 when there is none.
    const s = vetCapture(() => Assert.equal(runFmt(['--strict', f.files[0]]), 1))
    Assert.equal(s.err, where)
    Assert.equal(vetCapture(() => Assert.equal(runFmt(['--strict', f.files[1]]), 0)).err, '')
    // With --list the names still go to stdout; --check's 1 and
    // --strict's 1 are one exit code.
    const ls = vetCapture(() => Assert.equal(runFmt(['--strict', '--list', ...f.files]), 1))
    Assert.equal(ls.out, f.files[1] + '\n')
    Assert.equal(ls.err, where)
    Assert.equal(vetCapture(() =>
      Assert.equal(runFmt(['--check', '--lint', f.files[1]]), 1)).out, f.files[1] + '\n')
    Assert.equal(Fs.readFileSync(f.files[0], 'utf8'), 'credit_cents: 1\n')
  })

  // Standard input, formatted onto standard output, or listed under
  // the name <stdin>.
  test('fmt-stdin', async () => {
    const out = execFileSync(process.execPath, [CLI, 'fmt'], { input: 'a:{b:1}\n' })
    Assert.equal(out.toString(), 'a: b: 1\n')
    let code = 0
    let listed = ''
    try {
      execFileSync(process.execPath, [CLI, 'fmt', '--check'], { input: 'a:{b:1}\n' })
    }
    catch (err: any) {
      code = err.status
      listed = err.stdout.toString()
    }
    Assert.equal(code, 1)
    Assert.equal(listed, '<stdin>\n')
  })

  test('fmt-dispatches-from-main', async () => {
    const f = fmtFiles('a:{b:1}\n')
    const r = vetCapture(() => cliMainVet(['node', 'aontu', 'fmt', f.files[0]]))
    // The verb is asynchronous through main (stdin is one of its
    // sources), so the capture sees the write on the next turn.
    await new Promise((resolve) => setImmediate(resolve))
    Assert.equal(r.out, 'a: b: 1\n')
  })
})


describe('cli-servers', () => {
  // The dispatch, seen through the injectable pair: the CLI hands the
  // process to the server and gives no answer of its own.
  test('lsp-and-mcp-verbs-dispatch-to-the-servers', () => {
    const calls: string[] = []
    const servers = {
      lsp: () => void calls.push('lsp'),
      mcp: (argv: string[]) => void calls.push('mcp ' + argv.join(' ')),
      serve: async () => undefined,
      http: () => ({} as any),
    }
    vetCapture(() => cliMainVet(['node', 'cli', 'lsp'], servers))
    vetCapture(() => cliMainVet(['node', 'cli', 'mcp', '--root', '/tmp'], servers))
    Assert.deepEqual(calls, ['lsp', 'mcp --root /tmp'])
    const h = vetCapture(() => {
      cliMainVet(['node', 'cli', 'lsp', '--help'], servers)
      Assert.equal(process.exitCode, 0)
    })
    Assert.ok(h.out.includes('aontu lsp'))
    const u = vetCapture(() => {
      cliMainVet(['node', 'cli', 'lsp', 'extra'], servers)
      Assert.equal(process.exitCode, 2)
    })
    Assert.match(u.err, /lsp takes no arguments/)
    Assert.equal(calls.length, 2)
  })

  // The real servers behind the verbs, through the executable entry:
  // one initialize round trip each.
  test('lsp-verb-serves-lsp-over-stdio', () => {
    const frame = (s: string) => `Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`
    const input =
      frame('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}') +
      frame('{"jsonrpc":"2.0","id":2,"method":"shutdown"}') +
      frame('{"jsonrpc":"2.0","method":"exit"}')
    const out = execFileSync(process.execPath, [CLI, 'lsp'], { input }).toString()
    Assert.ok(out.includes('"serverInfo"'), out)
    Assert.ok(out.startsWith('Content-Length:'), out)
  })

  test('mcp-verb-serves-mcp-over-stdio', () => {
    const input = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
    const out = execFileSync(process.execPath, [CLI, 'mcp'], { input }).toString()
    const answer = JSON.parse(out.trim().split('\n')[0])
    Assert.equal(answer.id, 1)
    Assert.ok(answer.result, out)
  })
})


// --- the template surface -------------------------------------------

describe('cli-trace', () => {

  const DOC = '%r = emit(_, { match: n: string body: ["L" + .n] })\n' +
    'svc: { a: { n:"a" } }\n' +
    'out: file("x.ts", emit($.svc, %r))\n'

  function traceDir(text: string): string {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trace-'))
    Fs.writeFileSync(Path.join(dir, 'doc.aon'), text)
    return dir
  }

  function traceCode(want: number, args: string[]): { out: string, err: string } {
    return vetCapture(() => Assert.equal(runTrace(args), want, args.join(' ')))
  }

  test('trace-names-the-file-the-node-and-the-rule', () => {
    const file = Path.join(traceDir(DOC), 'doc.aon')
    const text = traceCode(0, [file]).out
    Assert.equal(text, 'x.ts\t$.children.0\t$.svc.a\t$.%r#0\n')
    const json = JSON.parse(traceCode(0, ['--format', 'json', file]).out)
    Assert.equal(json.trace.length, 1)
    Assert.equal(json.trace[0].file, 'x.ts')
  })

  test('trace-reads-an-anchor', () => {
    const file = Path.join(
      traceDir(DOC.replace('out:', 'elsewhere:')), 'doc.aon')
    // The default anchor is `$.out`, which this document does not have.
    traceCode(4, [file])
    Assert.match(traceCode(0, ['--at', '$.elsewhere', file]).out, /x\.ts/)
    traceCode(4, ['--at', '$.nowhere', file])
  })

  test('trace-usage-errors-exit-2', () => {
    const dir = traceDir(DOC)
    const file = Path.join(dir, 'doc.aon')
    Assert.match(traceCode(2, []).err, /trace needs one file/)
    Assert.match(traceCode(2, [file, file]).err, /trace needs one file/)
    Assert.match(traceCode(2, ['--format', 'yaml', file]).err,
      /--format needs text or json/)
    Assert.match(traceCode(2, ['--format']).err, /--format needs text or json/)
    Assert.match(traceCode(2, ['--at']).err, /--at needs a path/)
    Assert.match(traceCode(2, ['--bogus', file]).err,
      /unknown trace option --bogus/)
    Assert.match(traceCode(2, [Path.join(dir, 'missing.aon')]).err,
      /cannot read/)
    traceCode(2, ['--trust', 'nosuchlevel', file])
    Assert.equal(traceCode(0, ['--help']).out.includes('aontu trace'), true)
  })

  test('trace-reads-a-template-entry', () => {
    // The entry's extension decides, so the file whose provenance is
    // asked for is the one the author edits.
    const dir = traceDir(DOC)
    const write = (name: string, text: string) => {
      const at = Path.join(dir, name)
      Fs.writeFileSync(at, text)
      return at
    }
    const body = 'svc: { a: { n:"a" } }\n' +
      'out: file("x.ts", emit($.svc, { match: n: string body: [\n'
    const gen = write('gen.ts', '//- ' + body.replaceAll('\n', '\n//- ') +
      'L\n//- ]}))\n')
    const zz = write('gen.zz', ';;- ' + body.replaceAll('\n', '\n;;- ') +
      'L\n;;- ]}))\n')
    const profile = write('zz.aon', '@"aontu:profile"\n\naontu: Lang: ' +
      '{ lang:"zz" template: { marker:";;-" ext: [zz] } }\n')

    const want = 'x.ts\t$.children.0\t$.svc.a\t#0\n'
    Assert.equal(traceCode(0, [gen]).out, want)
    Assert.equal(traceCode(0, ['--marker', ';;-', zz]).out, want)
    Assert.equal(traceCode(0, ['--profile', profile, zz]).out, want)

    Assert.match(traceCode(2, ['--marker']).err, /--marker needs a token/)
    Assert.match(traceCode(2, ['--profile']).err, /--profile needs a file/)
    Assert.match(
      traceCode(2, ['--profile', Path.join(dir, 'gone.aon'), gen]).err,
      /cannot read/)

    // A --profile document that does not stand up is exit 4; a second
    // profile claiming the same language is exit 2.
    const bad = write('bad.aon', 'aontu: Lang: { lang: 1 }\n')
    Assert.match(traceCode(4, ['--profile', bad, gen]).err, /aontu\//)
    const dup = write('zz2.aon', '@"aontu:profile"\n\naontu: Lang: ' +
      '{ lang:"zz" template: { marker:";;-" ext: [zz] } }\n')
    Assert.match(
      traceCode(2, ['--profile', profile, '--profile', dup, gen]).err,
      /two profiles claim zz/)
  })

})


describe('cli-template', () => {

  const GEN =
    '//- n: [\n' +
    'export const N = 1\n' +
    '//- ]\n'

  const CANON =
    'n: [\n' +
    '`export const N = 1`\n' +
    ']\n'

  function templateDir(files: Record<string, string>): string {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-template-'))
    for (const [name, text] of Object.entries(files)) {
      Fs.writeFileSync(Path.join(dir, name), text)
    }
    return dir
  }

  function templateCode(want: number, args: string[]): { out: string, err: string } {
    return vetCapture(() => Assert.equal(runTemplate(args), want, args.join(' ')))
  }

  test('template-prints-the-canonical-form-and-resugars-it', () => {
    const dir = templateDir({ 'gen.ts': GEN, 'canon.aon': CANON })
    // THE DEFAULT DIRECTION is desugar: the aontu the marked lines
    // mean, with every other line quoted as one string.
    Assert.equal(templateCode(0, [Path.join(dir, 'gen.ts')]).out, CANON)
    Assert.equal(
      templateCode(0, ['--resugar', Path.join(dir, 'canon.aon')]).out, GEN)
    // The marker comes from the extension, and --marker names one the
    // table does not know.
    const hash = templateDir({ 'gen.rb': '#- n: [\nputs 1\n#- ]\n' })
    Assert.equal(templateCode(0, [Path.join(hash, 'gen.rb')]).out,
      'n: [\n`puts 1`\n]\n')
    const odd = templateDir({ 'gen.zz': ';;- n: [\nx\n;;- ]\n' })
    Assert.equal(
      templateCode(0, ['--marker', ';;-', Path.join(odd, 'gen.zz')]).out,
      'n: [\n`x`\n]\n')
    const bare = templateDir({ 'gen': GEN })
    Assert.equal(templateCode(0, [Path.join(bare, 'gen')]).out, CANON)
    // The dispatch: `aontu template` is the verb.
    Assert.equal(vetCapture(() => {
      cliMainVet(['node', 'aontu', 'template', Path.join(dir, 'gen.ts')])
    }).out, CANON)
  })

  test('template-takes-its-marker-from-a-profile', () => {
    const OCAML = '@"aontu:profile"\n\n' +
      'aontu: Lang: lang: "ocaml"\n' +
      'aontu: Lang: indent: { unit:" " width:2 }\n' +
      'aontu: Lang: template: ' +
      '{ marker:"(*-" close:"*)" ext:["ml" "mli"] }\n'
    const dir = templateDir({
      'ocaml.aon': OCAML,
      'gen.ml': '(*- n: [ *)\nlet a = 1\n(*- ] *)\n',
      'plain.aon': '@"aontu:profile"\n\naontu: Lang: lang: "plain"\n',
    })
    const profile = Path.join(dir, 'ocaml.aon')
    const unit = Path.join(dir, 'gen.ml')

    // A CLOSER AFTER A SPACE reaches a block comment the table has
    // never seen, and the round trip holds.
    Assert.equal(templateCode(0, ['--profile', profile, unit]).out,
      'n: [\n`let a = 1`\n]\n')
    Assert.equal(
      templateCode(0, ['--check', '--profile', profile, unit]).out, '')

    // --marker still wins, and a profile that claims no extension of
    // this file leaves the table's answer in place.
    Assert.equal(
      templateCode(0, ['--marker', '(*- *)', unit]).out,
      'n: [\n`let a = 1`\n]\n')
    Assert.equal(
      templateCode(0, ['--profile', Path.join(dir, 'plain.aon'), unit]).out,
      '`(*- n: [ *)`\n`let a = 1`\n`(*- ] *)`\n')

    // Markdown needs none of it: the extension names the marker.
    const md = templateDir({ 'note.md': '<!--- n: [ -->\n# T\n<!--- ] -->\n' })
    Assert.equal(templateCode(0, [Path.join(md, 'note.md')]).out,
      'n: [\n`# T`\n]\n')

    Assert.match(templateCode(2, ['--profile']).err, /--profile needs a file/)
    Assert.match(
      templateCode(2, ['--profile', Path.join(dir, 'nope.aon'), unit]).err,
      /cannot read/)
    templateCode(2, ['--trust', 'nonsense', unit])
  })


  test('template-check-is-the-round-trip', () => {
    const dir = templateDir({ 'gen.ts': GEN })
    Assert.equal(templateCode(0, ['--check', Path.join(dir, 'gen.ts')]).out, '')

    const bad = templateDir({ 'gen.ts': '//- n: [\n  //- {\n//- ]\n' })
    const r = templateCode(1, ['--check', Path.join(bad, 'gen.ts')])
    Assert.match(r.err, /gen\.ts:2 is not what the round trip answers/)
    Assert.match(r.err, /have: " {2}\/\/- \{"/)
    Assert.match(r.err, /want: "\/\/- {3}\{"/)
  })

  test('template-usage-errors-exit-2', () => {
    const dir = templateDir({ 'gen.ts': GEN })
    const file = Path.join(dir, 'gen.ts')
    Assert.match(templateCode(2, ['--resugar', '--check', file]).err,
      /one of --resugar or --check/)
    Assert.match(templateCode(2, []).err, /template needs one file/)
    Assert.match(templateCode(2, [file, file]).err, /template needs one file/)
    Assert.match(templateCode(2, ['--marker']).err, /--marker needs a token/)
    Assert.match(templateCode(2, ['--bogus', file]).err,
      /unknown template option --bogus/)
    Assert.match(templateCode(2, [Path.join(dir, 'missing.ts')]).err,
      /cannot read/)
    Assert.equal(
      templateCode(0, ['--help']).out.includes('aontu template'), true)
  })

  test('fmt-formats-a-generator-through-the-template-surface', () => {
    const dir = templateDir({ 'gen.rb': '#- n: [\nputs 1\n#- ]\n' })
    const file = Path.join(dir, 'gen.rb')
    Assert.equal(
      vetCapture(() => Assert.equal(runFmt([file]), 0)).out,
      '#- n: [\nputs 1\n#- ]\n')
    // The aontu is indented AFTER the marker, and -w writes it back.
    const deep = templateDir({ 'g.rb': '#- a: [\n#- { b: [\nx\n#- ] }\n#- ]\n' })
    const dfile = Path.join(deep, 'g.rb')
    Assert.equal(vetCapture(() => Assert.equal(runFmt(['-w', dfile]), 0)).out, '')
    Assert.equal(Fs.readFileSync(dfile, 'utf8'),
      '#- a: [\n#-   b: [\nx\n#-   ]\n#- ]\n')
    // `--marker` reaches fmt too, for a language the table has not met.
    const zz = templateDir({ 'g.zz': ';;- a: [\nx\n;;- ]\n' })
    Assert.equal(
      vetCapture(() => Assert.equal(
        runFmt(['--marker', ';;-', Path.join(zz, 'g.zz')]), 0)).out,
      ';;- a: [\nx\n;;- ]\n')
    Assert.match(
      vetCapture(() => Assert.equal(runFmt(['--marker']), 2)).err,
      /--marker needs a token/)
    // A FILE WITH NO MARKER LINE IS ANOTHER LANGUAGE'S, and is refused
    // by name: FMT.0.md §9's boundary, which the marker is the
    // evidence for.
    const data = templateDir({ 'd.json': '{"a":1}\n' })
    const dj = Path.join(data, 'd.json')
    const r = vetCapture(() => Assert.equal(runFmt([dj]), 2))
    Assert.equal(r.out, '')
    Assert.match(r.err, /is not aontu source \(\.aon, \.aontu\)/)
    Assert.match(r.err, /carries no \/\/- marker line/)
    Assert.equal(Fs.readFileSync(dj, 'utf8'), '{"a":1}\n')
    // `.aontu` is aontu source, and is formatted as one.
    const ok = templateDir({ 'd.aontu': 'a:{b:1}\n' })
    Assert.equal(
      vetCapture(() => Assert.equal(runFmt([Path.join(ok.toString(), 'd.aontu')]), 0)).out,
      'a: b: 1\n')
  })
})


describe('cli-pkg-layout', () => {
  // A project still carrying the older layout -- mod.aon, a root or
  // aontu_meta/ mod-lock.aon, aon_vendor/ -- is told the current one,
  // once, whatever the verb; nothing there is read (ADR-039).
  test('pkg-names-the-old-layout', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-layout-'))
    Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: { path: "corp.example/app" }\n')
    Fs.mkdirSync(Path.join(dir, 'aon_vendor'))
    const r = vetCapture(() => runPkg(['verify', dir], NO_SERVERS))
    Assert.match(r.err, /aon_vendor, mod.aon belong to an older layout/)
    Assert.match(r.err, /rename pkg.aon's `mod` block to `pkg`/)
    // The lockfile alone at the root is the same hint.
    const dir2 = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-layout-'))
    Fs.writeFileSync(Path.join(dir2, 'pkg.aon'), 'pkg: { path: "corp.example/app" }\n')
    Fs.writeFileSync(Path.join(dir2, 'mod-lock.aon'), '# mod-lock.aon\n{"lock":{}}\n')
    Assert.match(vetCapture(() => runPkg(['verify', dir2], NO_SERVERS)).err, /older layout/)
    const dir3 = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-layout-'))
    Fs.writeFileSync(Path.join(dir3, 'pkg.aon'), 'pkg: { path: "corp.example/app" }\n')
    Assert.doesNotMatch(vetCapture(() => runPkg(['verify', dir3], NO_SERVERS)).err, /older layout/)
  })

  test('model-dispatches-the-document-verbs', () => {
    Assert.equal(vetCapture(() => Assert.equal(runModel(['--help']), 0)).out
      .includes('Usage: aontu'), true)
    Assert.match(vetCapture(() => Assert.equal(runModel([]), 2)).err,
      /model needs get, why or set/)
    Assert.match(vetCapture(() => Assert.equal(runModel(['nope']), 2)).err,
      /model needs get, why or set/)
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-model-'))
    const file = Path.join(dir, 'doc.aon')
    Fs.writeFileSync(file, 'a: 1\n')
    Assert.equal(vetCapture(() => Assert.equal(runModel(['get', '$.a', file]), 0)).out.trim(), '1')
    Assert.match(vetCapture(() => Assert.equal(runModel(['why', '$.a', file]), 0)).out, /\$\.a = 1/)
    Assert.equal(runModel(['set', '$.b=2', '--dry-run', '--entry', file,
      '--overlay', Path.join(dir, 'ov.aon')]), 0)
  })
})


describe('cli-allow', () => {

  const ROLES = [
    'roles: {',
    '  admin: { allow: ["$"] }',
    '  dev: { allow: ["$.services"] deny: ["$.services.*.tier"] }',
    '  qa: { allow: ["$.tests"] }',
    '}',
    '',
  ].join('\n')

  function rolesFile(src: string = ROLES): string {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-allow-cli-'))
    const file = Path.join(dir, 'roles.aon')
    Fs.writeFileSync(file, src)
    return file
  }


  test('allow-answers-every-path-and-names-the-rule', () => {
    const file = rolesFile()

    const yes = vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', file, '$.services.auth.replicas']), 0))
    Assert.equal(yes.out, [
      'verdict: allowed',
      'role: dev',
      '$.services.auth.replicas: allowed by $.roles.dev.allow.0 ($.services)',
      '',
    ].join('\n'))
    Assert.equal(yes.err, '')

    // Every reason has its line: deny names the rule, uncovered says
    // no rule reached, and the verdict is the exit code.
    const no = vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', file, '$.services.auth', '$.tests']), 1))
    Assert.equal(no.out, [
      'verdict: refused',
      'role: dev',
      '$.services.auth: refused by $.roles.dev.deny.0 ($.services.*.tier)',
      '$.tests: refused (no allow entry of dev covers it)',
      '',
    ].join('\n'))
  })


  test('allow-takes-the-assignment-spelling', () => {
    const file = rolesFile()
    const r = vetCapture(() => Assert.equal(
      runAllow(['--role', 'qa', file,
        '$.tests.smoke="on"', '$.tests.x="a=b"', '$.tests.y={ a: 1 }']), 0))
    Assert.match(r.out, /^\$\.tests\.smoke: allowed/m)
    Assert.match(r.out, /^\$\.tests\.x: allowed/m)
    Assert.match(r.out, /^\$\.tests\.y: allowed/m)

    // The value must be ONE value. `set` appends it as source after
    // the flattened path, so a second pair in it writes a sibling of
    // the overlay root -- a subtree the gate was never asked about.
    for (const bad of [
      '$.tests.smoke=3 secrets: key: "x"',
      '$.tests.smoke=3\nsecrets: 1',
      '$.tests.smoke="unterminated',
      '$.tests.smoke=@"./other.aon"',
    ]) {
      const r = vetCapture(() => Assert.equal(runAllow(['--role', 'qa', file, bad]), 2))
      Assert.match(r.err, /the value of \$\.tests\.smoke is not one value/)
      Assert.equal(r.out, '')
    }
  })


  test('allow-undeclared-role-is-refused-with-a-finding', () => {
    const file = rolesFile()
    const r = vetCapture(() => Assert.equal(
      runAllow(['--role', 'ops', file, '$.a']), 1))
    Assert.equal(r.out, [
      'verdict: refused',
      'role: ops',
      '$.a: refused (role ops is not declared)',
      '',
      '$.roles.ops: no_path [reference]',
      '  The role ops is not declared at $.roles in this document.',
      '',
    ].join('\n'))
  })


  test('allow-broken-model-is-exit-4-with-the-engines-finding', () => {
    const file = rolesFile('roles: dev: { allow: "$.a" }\n')
    const r = vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', file, '$.a']), 4))
    // The engine's code brings the registry's class with it.
    Assert.match(r.out, /^verdict: error\nrole: dev\n\n\$: scalar_kind \[conflict\]/)

    // The same report as an object.
    const j = JSON.parse(vetCapture(() => Assert.equal(
      runAllow(['--format', 'json', '--role', 'dev', file, '$.a']), 4)).out)
    Assert.equal(j.verdict, 'error')
    Assert.deepEqual(j.paths, [])
    Assert.equal(j.findings[0].code, 'scalar_kind')
    Assert.equal(j.findings[0].class, 'conflict')
    Assert.equal(
      j.findings[0].message,
      '[aontu/scalar_kind]: Cannot unify values at path $.roles.dev.allow')
  })


  test('allow-json-names-the-producer', () => {
    const file = rolesFile()
    const j = JSON.parse(vetCapture(() => Assert.equal(
      runAllow(['--format', 'json', '--role', 'dev', file, '$.services.x.replicas']), 0)).out)
    Assert.equal(j.aontu.verb, 'allow')
    Assert.equal(j.verdict, 'allowed')
    Assert.equal(j.role, 'dev')
    Assert.deepEqual(j.findings, [])
    Assert.deepEqual(j.paths, [{
      allowed: true, by: '$.roles.dev.allow.0', path: '$.services.x.replicas',
      pattern: '$.services', reason: 'allow',
    }])
  })


  test('allow-at-moves-the-roles-map', () => {
    const file = rolesFile('policy: roles: dev: { allow: ["$.a"] }\n')
    const r = vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', '--at', '$.policy.roles', file, '$.a.b']), 0))
    Assert.match(r.out, /allowed by \$\.policy\.roles\.dev\.allow\.0/)
  })


  test('allow-trust-reaches-the-engine', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-allow-trust-'))
    Fs.writeFileSync(Path.join(dir, 'dev.aon'), 'roles: dev: { allow: ["$"] }')
    const file = Path.join(dir, 'roles.aon')
    Fs.writeFileSync(file, '@"./dev.aon"\n')
    vetCapture(() => Assert.equal(runAllow(['--role', 'dev', file, '$.a']), 0))
    const denied = vetCapture(() => Assert.equal(
      runAllow(['--trust', 'none', '--role', 'dev', file, '$.a']), 4))
    Assert.match(denied.out, /include_denied/)
  })


  test('allow-usage-errors-exit-2', () => {
    const file = rolesFile()
    vetCapture(() => Assert.equal(runAllow([]), 2))
    vetCapture(() => Assert.equal(runAllow([file, '$.a']), 2))
    vetCapture(() => Assert.equal(runAllow(['--role', 'dev', file]), 2))
    vetCapture(() => Assert.equal(runAllow(['--role']), 2))
    vetCapture(() => Assert.equal(runAllow(['--role', 'dev', '--at']), 2))

    for (const role of ['', '.', 'dev.allow', 'a.b']) {
      const r = vetCapture(() => Assert.equal(runAllow(['--role', role, file, '$.a']), 2))
      Assert.match(r.err, /--role needs one key, without dots/)
    }
    // A path starts with $: an empty argument, an assignment that
    // lost its path, and a second file name are all refused rather
    // than read as paths and answered.
    for (const arg of ['', '=', '=1', 'services.auth', file]) {
      const r = vetCapture(() => Assert.equal(runAllow(['--role', 'admin', file, arg]), 2))
      Assert.match(r.err, /a path starts with \$/)
    }
    vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', '--format', 'yaml', file, '$.a']), 2))
    vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', '--bogus', file, '$.a']), 2))
    vetCapture(() => Assert.equal(
      runAllow(['--trust', 'bogus', '--role', 'dev', file, '$.a']), 2))
    const missing = vetCapture(() => Assert.equal(
      runAllow(['--role', 'dev', Path.join(Path.dirname(file), 'no.aon'), '$.a']), 2))
    Assert.match(missing.err, /cannot read/)
    Assert.equal(vetCapture(() =>
      Assert.equal(runAllow(['--help']), 0)
    ).out.includes('aontu allow --role'), true)
  })


  test('allow-dispatches-through-main', () => {
    const file = rolesFile()
    const r = vetCapture(() =>
      cliMainVet(['node', 'cli', 'allow', '--role', 'admin', file, '$']))
    Assert.match(r.out, /verdict: allowed/)
    Assert.match(run(['--help']).out, /aontu allow --role <role>/)
    Assert.match(run(['--help']).out, /Allow exit codes/)
  })


  // The star schema is a key NAMED `*`, so it constrains nothing.
  const COV_STAR = 'entity: { "*": { name: string, table: string } }'
  const COV_GOOD = 'entity: { &: { name: string, table: string } }'
  const COV_DATA = 'entity: { planet: { name: "P", table: "planets" } }'

  function covFiles(schema: string, data: string): [string, string] {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov-'))
    const s = Path.join(dir, 'schema.aon')
    const d = Path.join(dir, 'data.aon')
    Fs.writeFileSync(s, schema)
    Fs.writeFileSync(d, data)
    return [s, d]
  }

  test('vet-coverage-is-absent-unless-asked', () => {
    const [s, d] = covFiles(COV_STAR, COV_DATA)
    const r = run(['vet', '--partial', s, d])
    Assert.equal(r.code, 0)
    Assert.ok(!r.out.includes('coverage'),
      `a run that did not ask for coverage reported it: ${r.out}`)
    const j = run(['vet', '--partial', '--format', 'json', s, d])
    Assert.ok(!j.out.includes('"coverage"'),
      `the JSON report carries coverage unasked: ${j.out}`)
  })

  // THE DEFECT THE PHASE EXISTS FOR, at the command line: the verdict
  // is `valid` and the run examined nothing.
  test('vet-coverage-reports-a-vacuous-run', () => {
    const [s, d] = covFiles(COV_STAR, COV_DATA)
    const r = run(['vet', '--partial', '--coverage', s, d])
    Assert.equal(r.code, 0, 'the verdict word is unchanged')
    Assert.ok(r.out.includes('verdict: valid'))
    for (const want of [
      'VACUOUS', '0/2 data leaves checked', 'unused: $.entity.*',
      'unchecked: $.entity.planet',
    ]) {
      Assert.ok(r.out.includes(want),
        `the coverage block omits ${want}:\n${r.out}`)
    }
  })

  // AND THE GATE: only under --strict-coverage, and it is the exit code
  // that moves, never the verdict word.
  test('vet-strict-coverage-exits-one-on-vacuous', () => {
    const [s, d] = covFiles(COV_STAR, COV_DATA)
    const r = run(['vet', '--partial', '--strict-coverage', s, d])
    Assert.equal(r.code, 1)
    Assert.ok(r.out.includes('verdict: valid'), 'the verdict word changed')
    Assert.ok(r.out.includes('checked nothing'), r.out)
    // The reason names the fix, because the caller who hit this does
    // not know the template exists.
    Assert.ok(r.out.includes('aontu help language'), r.out)
  })

  test('vet-strict-coverage-passes-a-real-check', () => {
    const [s, d] = covFiles(COV_GOOD, COV_DATA)
    const r = run(['vet', '--strict-coverage', s, d])
    Assert.equal(r.code, 0, r.out)
    Assert.ok(!r.out.includes('VACUOUS'), r.out)
    Assert.ok(r.out.includes('2/2 data leaves checked'), r.out)
  })

  // --strict-coverage and --coverage-at IMPLY the accounting: a gate
  // cannot fire on what was never measured.
  test('vet-coverage-flags-imply-the-accounting', () => {
    const [s, d] = covFiles(COV_GOOD, COV_DATA)
    Assert.ok(run(['vet', '--strict-coverage', s, d]).out.includes('coverage:'))
    Assert.ok(
      run(['vet', '--coverage-at', '$.entity', s, d]).out.includes('coverage:'))
  })

  test('vet-coverage-json', () => {
    const [s, d] = covFiles(COV_STAR, COV_DATA)
    const r = run(
      ['vet', '--partial', '--coverage', '--format', 'json', s, d])
    Assert.equal(r.code, 0)
    const report = JSON.parse(r.out)
    Assert.equal(report.verdict, 'valid')
    Assert.equal(report.coverage.vacuous, true)
    Assert.equal(report.coverage.checked, 0)
    Assert.deepEqual(Object.keys(report.coverage).sort(),
      ['checked', 'declared', 'leaves', 'unchecked', 'unused', 'vacuous'])
  })

  // SEVERAL DATA FILES ARE ONE ACCOUNTING: the schema side is the same
  // for each, so a declaration one file exercised is not unused, while
  // the data side adds up.
  test('vet-coverage-across-several-data-files', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov-'))
    const write = (name: string, src: string): string => {
      const p = Path.join(dir, name)
      Fs.writeFileSync(p, src)
      return p
    }
    const s = write('s.aon', 'a: string\nb: integer')
    const d1 = write('d1.aon', 'a: "x"')
    const d2 = write('d2.aon', 'b: 1')
    const r = run(['vet', '--partial', '--coverage', s, d1, d2])
    Assert.equal(r.code, 0, r.out)
    Assert.ok(r.out.includes('2/2 data leaves checked'), r.out)
    Assert.ok(!r.out.includes('unused:'),
      `a declaration another file met was called unused: ${r.out}`)
  })

  test('vet-coverage-text-caps-the-lists', () => {
    let data = '{'
    for (let i = 0; i < 14; i++) {
      data += `k${i}: ${i},\n`
    }
    data += '}'
    const [s, d] = covFiles('declared: string', data)
    const r = run(['vet', '--partial', '--coverage', s, d])
    Assert.ok(r.out.includes('unchecked: … and 4 more'),
      `the list was not capped and counted:\n${r.out}`)
    const j = run(
      ['vet', '--partial', '--coverage', '--format', 'json', s, d])
    Assert.equal(JSON.parse(j.out).coverage.unchecked.length, 14,
      'the JSON list was capped too')
  })

  test('vet-coverage-usage-refusals', () => {
    const r = run(['vet', '--coverage-at'])
    Assert.equal(r.code, 2)
    Assert.ok(r.out.includes('--coverage-at needs a path'), r.out)
  })

})


// The writer: the tree a generator answers, handed to jostraca. Every
// branch in-process, so the coverage floor sees it; the bin once.
describe('render', () => {

  const ONE = 'out: file("zed.txt", ["foo = BAR"])\n'
  const MANY =
    'out: [file("a.txt", ["a"]) folder("sub", [file("b.txt", ["b1" "b2"])])]\n'

  function dir(): string {
    return Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-render-'))
  }

  function file(d: string, name: string, src: string): string {
    const p = Path.join(d, name)
    Fs.writeFileSync(p, src)
    return p
  }

  async function render(args: string[]):
    Promise<{ out: string; err: string; code: number }> {
    const so = process.stdout.write
    const se = process.stderr.write
    let out = ''
    let err = ''
    ;(process.stdout as any).write = (s: any) => ((out += s), true)
    ;(process.stderr as any).write = (s: any) => ((err += s), true)
    try {
      const code = await runRender(args)
      return { out, err, code }
    }
    finally {
      process.stdout.write = so
      process.stderr.write = se
    }
  }


  test('writes-one-file-to-the-path', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon', ONE)

    // The path names the file: the tree's own name is not used.
    const dest = Path.join(d, 'deep', 'one.txt')
    const r = await render([gen, dest])
    Assert.deepStrictEqual(r, { out: '', err: '', code: 0 })
    Assert.equal(Fs.readFileSync(dest, 'utf8'), 'foo = BAR\n')

    // A directory as the path keeps the tree's name.
    const sub = Path.join(d, 'd')
    Fs.mkdirSync(sub)
    Assert.equal((await render([gen, sub])).code, 0)
    Assert.equal(Fs.readFileSync(Path.join(sub, 'zed.txt'), 'utf8'), 'foo = BAR\n')
  })


  test('writes-a-tree-below-the-path', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon', MANY)
    const build = Path.join(d, 'build')
    const r = await render(['--format', 'json', gen, build])
    Assert.equal(r.code, 0, r.err)
    const got = JSON.parse(r.out)
    Assert.equal(got.verdict, 'ok')
    Assert.equal(got.files.written.length, 2)
    Assert.deepStrictEqual(got.files.unchanged, [])
    Assert.equal(Fs.readFileSync(Path.join(build, 'sub', 'b.txt'), 'utf8'), 'b1\nb2\n')
  })


  test('check-holds-the-path', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon', MANY)
    const build = Path.join(d, 'build')
    Assert.equal((await render([gen, build])).code, 0)
    const clean = await render(['--check', gen, build])
    Assert.deepStrictEqual(clean, { out: '', err: '', code: 0 })

    // An edited file and a missing one, each named with its kind.
    file(build, 'a.txt', 'edited\n')
    Fs.rmSync(Path.join(build, 'sub', 'b.txt'))
    const drift = await render(['--check', gen, build])
    Assert.equal(drift.code, 1)
    Assert.equal(drift.out, 'content: a.txt\nmissing: sub/b.txt\n')

    const j = await render(['--check', '--format', 'json', gen, build])
    Assert.equal(j.code, 1)
    const got = JSON.parse(j.out)
    Assert.equal(got.verdict, 'drift')
    Assert.deepStrictEqual(got.checked, ['a.txt', 'sub/b.txt'])
    Assert.equal(got.drift[1].kind, 'missing')

    // Nothing was written by the checks.
    Assert.equal(Fs.readFileSync(Path.join(build, 'a.txt'), 'utf8'), 'edited\n')
  })


  test('check-skips-an-excluded-file', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon',
      'out: project(".", [\n' +
      '  file({name: "keep.txt", exclude: true}, ["generated"])\n' +
      '  file({name: "held.txt"}, ["generated"])\n' +
      '])\n')
    const build = Path.join(d, 'build')
    Assert.equal((await render([gen, build])).code, 0)

    // `render` leaves the excluded file alone, so `--check` says
    // nothing about it -- and still holds the one beside it.
    file(build, 'keep.txt', 'hand written\n')
    const one = await render(['--check', gen, build])
    Assert.deepStrictEqual(one, { out: '', err: '', code: 0 })

    file(build, 'held.txt', 'hand written\n')
    const both = await render(['--check', gen, build])
    Assert.equal(both.code, 1)
    Assert.equal(both.out, 'content: held.txt\n')

    // `checked` still names every path the generator claims.
    const j = await render(['--check', '--format', 'json', gen, build])
    Assert.equal(j.code, 1)
    const got = JSON.parse(j.out)
    Assert.deepStrictEqual(got.checked, ['held.txt', 'keep.txt'])
    Assert.deepStrictEqual(got.drift, [{ kind: 'content', path: 'held.txt' }])
  })


  test('check-reports-an-absent-excluded-file', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon',
      'out: project(".", [file({name: "keep.txt", exclude: true}, ["gen"])])\n')
    const build = Path.join(d, 'build')
    Fs.mkdirSync(build)

    // `exclude` is gated on the target existing, so the write path
    // WOULD write this one: `missing` survives the skip.
    const r = await render(['--check', gen, build])
    Assert.equal(r.code, 1)
    Assert.equal(r.out, 'missing: keep.txt\n')
  })


  test('check-skips-an-excluded-mode', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon',
      'out: project(".", [' +
      'file({name: "run.sh", exclude: true, mode: 493}, ["#!/bin/sh"])])\n')
    const build = Path.join(d, 'build')
    Assert.equal((await render([gen, build])).code, 0)

    // The write path returns before it saves, so it does not chmod
    // either: the mode difference is not a difference `render` makes.
    Fs.chmodSync(Path.join(build, 'run.sh'), 0o644)
    Assert.equal((await render([gen, build])).code, 0)
    const r = await render(['--check', gen, build])
    Assert.deepStrictEqual(r, { out: '', err: '', code: 0 })
  })


  test('check-follows-the-write-path-for-every-exclude-form', async () => {
    const d = dir()
    const build = Path.join(d, 'build')

    // What the write path skips, and nothing else. A pattern form is
    // matched against the COMPONENT path, so `k.txt` skips the file and
    // `other.txt` does not, which is the rule rather than the spelling.
    for (const [name, prop, drift] of [
      ['none.aon', '', true],
      ['false.aon', ', exclude: false', true],
      ['string.aon', ', exclude: "k.txt"', false],
      ['list.aon', ', exclude: ["k.txt"]', false],
      ['other.aon', ', exclude: "other.txt"', true],
    ] as [string, string, boolean][]) {
      const gen = file(d, name,
        `out: project(".", [file({name: "k.txt"${prop}}, ["generated"])])\n`)
      Assert.equal((await render([gen, build])).code, 0)
      file(build, 'k.txt', 'hand written\n')
      const r = await render(['--check', gen, build])
      Assert.equal(r.code, drift ? 1 : 0, name)
      Assert.equal(r.out, drift ? 'content: k.txt\n' : '', name)

      // The write path's own answer, which the check must match: the
      // bytes survive a render exactly where no drift was reported.
      Assert.equal((await render([gen, build])).code, 0)
      Assert.equal(Fs.readFileSync(Path.join(build, 'k.txt'), 'utf8'),
        drift ? 'generated\n' : 'hand written\n', name)
      Fs.rmSync(Path.join(build, 'k.txt'))
    }
  })


  test('check-skips-an-excluded-file-in-a-set', async () => {
    const d = dir()
    const gens = Path.join(d, 'gens')
    Fs.mkdirSync(gens)
    file(gens, 'a.aon', 'out: file({name: "solo.txt", exclude: true}, ["gen"])\n')
    file(gens, 'b.aon',
      'out: project(".", [file({name: "two.txt", exclude: true}, ["gen"])])\n')
    const build = Path.join(d, 'build')
    Assert.equal((await render([gens, build])).code, 0)

    // A set is an ARRAY of trees, and a tree may itself BE the
    // excluded File: pruning empties the array.
    file(build, 'solo.txt', 'hand\n')
    file(build, 'two.txt', 'hand\n')
    const r = await render(['--check', gens, build])
    Assert.deepStrictEqual(r, { out: '', err: '', code: 0 })
  })


  test('check-skips-an-excluded-root-file', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon',
      'out: file({name: "ignored.txt", exclude: true}, ["generated"])\n')
    const dest = Path.join(d, 'target.txt')

    // The path names the file, so the root File is renamed first and
    // pruning leaves no tree at all.
    Assert.equal((await render([gen, dest])).code, 0)
    Fs.writeFileSync(dest, 'hand written\n')
    const r = await render(['--check', gen, dest])
    Assert.deepStrictEqual(r, { out: '', err: '', code: 0 })
    Assert.equal(Fs.readFileSync(dest, 'utf8'), 'hand written\n')
  })


  test('check-skips-an-excluded-file-beside-a-bare-node', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon',
      'out: { cmp: "Project", props: {folder: "."}, children: [\n' +
      '  { cmp: "File", props: {name: "keep.txt", exclude: true},\n' +
      '    children: [{cmp: "Line", props: {src: "gen"}}] }\n' +
      '  { cmp: "Folder", props: {name: "empty"} }\n' +
      '  { cmp: "File", children: [] }\n' +
      '] }\n')
    const build = Path.join(d, 'build')
    Assert.equal((await render([gen, build])).code, 0)

    // A hand-written tree carries nodes with no `children` and a File
    // with no `props`: the walk reads both without composing a path.
    file(build, 'keep.txt', 'hand written\n')
    const r = await render(['--check', gen, build])
    Assert.deepStrictEqual(r, { out: '', err: '', code: 0 })
  })


  test('check-one-file-in-the-current-directory', async () => {
    const d = dir()
    file(d, 'gen.aon', ONE)
    const cwd = process.cwd()
    process.chdir(d)
    try {
      Assert.equal((await render(['gen.aon', 'one.txt'])).code, 0)
      const clean = await render(['--check', '--format', 'json', 'gen.aon', 'one.txt'])
      Assert.equal(clean.code, 0)
      Assert.deepStrictEqual(JSON.parse(clean.out).checked, ['one.txt'])
      file(d, 'one.txt', 'edited\n')
      const drift = await render(['--check', 'gen.aon', 'one.txt'])
      Assert.equal(drift.code, 1)
      Assert.equal(drift.out, 'content: one.txt\n')
    }
    finally {
      process.chdir(cwd)
    }
  })


  test('reads-a-template-entry', async () => {
    const d = dir()
    const tmpl = '#- out: file("zed.txt", emit(["BAR"], {\n' +
      '#-   match: string\n#-   replace: VALUE: _\n#-   body: [\n' +
      'foo = VALUE\n#-   ]\n#- }))\n'
    const gen = file(d, 'zed.txt', tmpl)
    const dest = Path.join(d, 'out.txt')
    const r = await render(['--marker', '#-', gen, dest])
    Assert.equal(r.code, 0, r.err)
    Assert.equal(Fs.readFileSync(dest, 'utf8'), 'foo = BAR\n')

    // The profile names the marker for the extension.
    const profile = file(d, 'text.aon', '@"aontu:profile"\n\n' +
      'aontu: Lang: lang: "text"\n' +
      'aontu: Lang: template: { marker:"#-" ext: ["txt"] }\n')
    Assert.equal((await render(['--profile', profile, gen, dest])).code, 0)

    // The extension's own marker, when nothing names one.
    const ts = file(d, 'gen.ts', tmpl.replaceAll('#-', '//-'))
    Assert.equal((await render([ts, dest])).code, 0)
  })


  test('reads-another-anchor', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon', ONE.replace('out:', 'elsewhere:'))
    const dest = Path.join(d, 'x.txt')
    const r = await render([gen, dest])
    Assert.equal(r.code, 4)
    Assert.ok(r.err.includes('no_path'), r.err)
    Assert.equal((await render(['--at', '$.elsewhere', gen, dest])).code, 0)
  })


  test('refuses-what-jostraca-refuses', async () => {
    const d = dir()
    const dest = Path.join(d, 'build')

    // A map that is not a component the runtime knows.
    const bad = file(d, 'bad.aon', 'out: { cmp: "Nope", props: {}, children: [] }\n')
    const r = await render([bad, dest])
    Assert.equal(r.code, 4)
    Assert.ok(r.err.includes('unknown component: Nope'), r.err)

    // A File written by hand with no name is refused before the runtime.
    const nameless = file(d, 'nameless.aon', 'out: { cmp: "File", children: [] }\n')
    const n = await render([nameless, Path.join(d, 'n.txt')])
    Assert.equal(n.code, 4)
    Assert.ok(n.err.includes('the file at $.out has no name'), n.err)

    // A fragment whose source is not there fails the write and the check.
    const frag = file(d, 'frag.aon', 'out: file("x.txt", [fragment("nope.txt")])\n')
    const w = await render([frag, dest])
    Assert.equal(w.code, 2)
    Assert.ok(w.err.includes('nope.txt'), w.err)
    const c = await render(['--check', frag, dest])
    Assert.equal(c.code, 2)
    Assert.ok(c.err.includes('nope.txt'), c.err)

    // A path below a file cannot be made.
    const gen = file(d, 'gen.aon', ONE)
    const afile = file(d, 'afile', 'x\n')
    Assert.equal((await render([gen, Path.join(afile, 'x.txt')])).code, 2)
  })


  test('document-errors', async () => {
    const d = dir()
    const dest = Path.join(d, 'x.txt')
    const broken = file(d, 'broken.aon', 'out: file(\n')
    const r = await render([broken, dest])
    Assert.equal(r.code, 4)
    Assert.notEqual(r.err, '')

    // An include the trust does not admit.
    file(d, 'model.aon', 'foo: "BAR"\n')
    const gen = file(d, 'gen.aon',
      '@"./model.aon"\nout: file("zed.txt", ["foo = " + $.foo])\n')
    const denied = await render(['--trust', 'none', gen, dest])
    Assert.equal(denied.code, 4)
    Assert.ok(denied.err.includes('include_denied'), denied.err)
    Assert.equal((await render([gen, dest])).code, 0)
  })


  test('usage', async () => {
    const d = dir()
    const gen = file(d, 'gen.aon', ONE)
    const help = await render(['--help'])
    Assert.equal(help.code, 0)
    Assert.ok(help.out.includes('aontu render [--check]'))

    for (const [args, want] of [
      [[gen], 'render needs a file and a path'],
      [[gen, 'a', 'b'], 'render needs a file and a path'],
      [['--bogus', gen, 'x'], 'unknown render option --bogus'],
      [['--at'], '--at needs a path'],
      [['--at', '', gen, 'x'], '--at needs a path'],
      [['--marker'], '--marker needs a token'],
      [['--marker', '', gen, 'x'], '--marker needs a token'],
      [['--profile'], '--profile needs a file'],
      [['--profile', '', gen, 'x'], '--profile needs a file'],
      [['--format'], '--format needs text or json'],
      [['--format', 'xml', gen, 'x'], '--format needs text or json'],
      [['--trust', 'nonsense', gen, 'x'], '--trust'],
      [[Path.join(d, 'missing.aon'), 'x'], 'cannot read'],
      [['--profile', Path.join(d, 'missing.aon'), gen, 'x'], 'cannot read'],
    ] as [string[], string][]) {
      const r = await render(args)
      Assert.equal(r.code, 2, args.join(' '))
      Assert.ok(r.err.includes(want), `${args.join(' ')}: ${r.err}`)
    }
  })


  test('writes-a-folder-of-generators-as-one', async () => {
    const d = dir()
    const gen = Path.join(d, 'gen')
    Fs.mkdirSync(Path.join(gen, 'sub'), { recursive: true })
    file(gen, 'a.aon', 'out: file("a.txt", ["a"])\n')
    file(gen, 'b.rb', '#- out: folder("lib", [file("b.rb", [\nputs "b"\n#- ])])\n')
    file(gen, 'c.aon', 'out: [file("c.txt", ["c"])]\n')
    file(gen, '.keep', '')
    file(Path.join(gen, 'sub'), 'ignored.aon', 'out: file("ignored.txt", ["no"])\n')
    const out = Path.join(d, 'out')

    // A set is written below the path, a one-file tree under its own name.
    const r = await render(['--format', 'json', gen, out])
    Assert.equal(r.code, 0, r.err)
    Assert.equal(JSON.parse(r.out).files.written.length, 3)
    Assert.equal(Fs.readFileSync(Path.join(out, 'a.txt'), 'utf8'), 'a\n')
    Assert.equal(Fs.readFileSync(Path.join(out, 'lib', 'b.rb'), 'utf8'), 'puts "b"\n')
    Assert.equal(Fs.readFileSync(Path.join(out, 'c.txt'), 'utf8'), 'c\n')
    Assert.ok(!Fs.existsSync(Path.join(out, 'ignored.txt')), 'a subfolder is not read')

    Assert.deepStrictEqual(await render(['--check', gen, out]), { out: '', err: '', code: 0 })
    file(out, 'a.txt', 'edited\n')
    const drift = await render(['--check', gen, out])
    Assert.equal(drift.code, 1)
    Assert.equal(drift.out, 'content: a.txt\n')
  })


  test('refuses-a-folder-it-cannot-render-whole', async () => {
    const d = dir()
    const out = Path.join(d, 'out')

    // Nothing but dotfiles and subfolders is no generator.
    const empty = Path.join(d, 'empty')
    Fs.mkdirSync(Path.join(empty, 'sub'), { recursive: true })
    file(empty, '.keep', '')
    const e = await render([empty, out])
    Assert.equal(e.code, 2)
    Assert.ok(e.err.includes('holds no generator'), e.err)

    // A file with no marker line is refused by name, and nothing is written.
    const notes = Path.join(d, 'notes')
    Fs.mkdirSync(notes)
    file(notes, 'a.aon', 'out: file("a.txt", ["a"])\n')
    file(notes, 'notes.md', '# notes\n')
    const n = await render([notes, out])
    Assert.equal(n.code, 2)
    Assert.ok(n.err.includes('notes.md carries no') && n.err.includes('marker line'), n.err)
    Assert.ok(!Fs.existsSync(out), 'wrote before refusing')

    // A generator that does not stand up refuses the set before it writes.
    const broken = Path.join(d, 'broken')
    Fs.mkdirSync(broken)
    file(broken, 'a.aon', 'out: file("a.txt", ["a"])\n')
    file(broken, 'b.aon', 'out: file(\n')
    Assert.equal((await render([broken, out])).code, 4)
    Assert.ok(!Fs.existsSync(out), 'wrote before refusing')

    // A nameless File anywhere in the set is refused.
    const nameless = Path.join(d, 'nameless')
    Fs.mkdirSync(nameless)
    file(nameless, 'a.aon', 'out: file("a.txt", ["a"])\n')
    file(nameless, 'b.aon', 'out: { cmp: "File", children: [] }\n')
    const nl = await render([nameless, out])
    Assert.equal(nl.code, 4)
    Assert.ok(nl.err.includes('has no name'), nl.err)

    // The same path claimed twice is refused by the runtime.
    const twice = Path.join(d, 'twice')
    Fs.mkdirSync(twice)
    file(twice, 'a.aon', 'out: file("same.txt", ["a"])\n')
    file(twice, 'b.aon', 'out: file("same.txt", ["b"])\n')
    for (const args of [[twice, out], ['--check', twice, out]]) {
      const tw = await render(args)
      Assert.equal(tw.code, 2, args.join(' '))
      Assert.ok(tw.err.includes('same output path'), tw.err)
    }

    // Alone, a file with no marker line is refused the same way.
    const plain = file(d, 'plain.txt', 'just text\n')
    const p = await render([plain, Path.join(d, 'p.txt')])
    Assert.equal(p.code, 2)
    Assert.ok(p.err.includes('carries no //- marker line'), p.err)
  })


  // The record is the runtime's, so a run that never wrote one, or wrote
  // one this cannot read, answers with no skips rather than refusing.
  test('a-record-it-cannot-read-names-no-skips', () => {
    const d = dir()
    Assert.deepEqual(renderSkipped(d, 0), [])

    const at = Path.join(d, '.jostraca')
    Fs.mkdirSync(at)
    file(at, 'jostraca.meta.log', 'not json')
    Assert.deepEqual(renderSkipped(d, 0), [])

    // Readable JSON that is not a record, or holds no entry.
    file(at, 'jostraca.meta.log', 'null')
    Assert.deepEqual(renderSkipped(d, 0), [])
    file(at, 'jostraca.meta.log', '{"files":{"odd.txt":null}}')
    Assert.deepEqual(renderSkipped(d, 0), [])

    file(at, 'jostraca.meta.log', JSON.stringify({
      files: {
        'old.txt': { action: 'skip', when: 10 },
        'zed.txt': { action: 'skip', when: 30 },
        'kept.txt': { action: 'write', when: 30 },
      },
    }))
    Assert.deepEqual(renderSkipped(d, 20), ['zed.txt'])
  })


  test('the-bin-writes-the-file', () => {
    const d = dir()
    const gen = file(d, 'gen.aon', ONE)
    const dest = Path.join(d, 'zed.txt')
    Assert.deepStrictEqual(run(['render', gen, dest]), { out: '', code: 0 })
    Assert.equal(Fs.readFileSync(dest, 'utf8'), 'foo = BAR\n')
    Assert.deepStrictEqual(run(['render', '--check', gen, dest]), { out: '', code: 0 })
  })

})
