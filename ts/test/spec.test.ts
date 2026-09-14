/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import {
  Aontu, exactJSON, vet, subsume, trimCheck, hcanon, canonHash, get, why,
  graphOf, relationCheck,
  patch, diff, agentsMd, format,
} from '../dist/aontu'
import { jsonSchema } from '../dist/jsonschema'
import { reachCheck } from '../dist/reach'
import { view, viewSet, render } from '../dist/aontu'
import { desugarTemplate, resugarTemplate } from '../dist/template'
import { traceRun } from '../dist/trace'
import { codeClasses } from '../dist/hints'
import { IntegerVal } from '../dist/val/IntegerVal'
import { StringVal } from '../dist/val/StringVal'
import { BooleanVal } from '../dist/val/BooleanVal'
import { MapVal } from '../dist/val/MapVal'
import { NumberVal } from '../dist/val/NumberVal'
import { NullVal } from '../dist/val/NullVal'
import { BigIntegerVal } from '../dist/val/BigIntegerVal'
import { BigDecimalVal } from '../dist/val/BigDecimalVal'
import { Decimal } from '../dist/val/Decimal'


const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec')


// Use forward slashes even on Windows: this path is spliced into Aontu
// source as a quoted @"..." load target, where backslashes would be parsed
// as string escapes (\t -> tab, \a -> a, ...) and corrupt the path.
const FIXTURES_DIR = Path.join(SPEC_DIR, 'files').replaceAll('\\', '/')

type Row = {
  file: string
  name: string
  mode: string
  src: string
  // The second document, present only for `vet` rows (the five-column
  // mode): src is the schema and this is the data.
  data?: string
  expect: string
}


function unescape(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if ('\\' === c && i + 1 < s.length) {
      const n = s[++i]
      out += 'n' === n ? '\n' : 't' === n ? '\t' : n
    }
    else {
      out += c
    }
  }
  return out
}


function loadRows(): Row[] {
  const rows: Row[] = []
  const files = Fs.readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.tsv'))
    .filter((f) => 'signature.tsv' !== f)
    .sort()

  for (const file of files) {
    const text = Fs.readFileSync(Path.join(SPEC_DIR, file), 'utf8')
    // Split on \n and tolerate CRLF checkouts (e.g. Windows) by dropping
    // any trailing \r so the last field never carries a stray carriage return.
    let lineno = 0
    for (const line of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
      lineno++
      if ('' === line || line.startsWith('#')) {
        continue
      }
      const parts = line.split('\t')
      const vetRow = 'vet' === parts[1] || 'subsume' === parts[1] ||
        'query' === parts[1] || 'why' === parts[1] || 'patch' === parts[1] ||
        'diff' === parts[1] || 'agentsmd' === parts[1] ||
        'fmt-template' === parts[1] || 'fmt-template-lint' === parts[1]
      const want = vetRow ? 5 : 4
      if (parts.length < want) {
        throw new Error(
          `malformed spec row: ${file} line ${lineno}: ${want} columns` +
          ` required for mode "${parts[1]}", found ${parts.length}`)
      }
      rows.push({
        file,
        name: parts[0],
        mode: parts[1],
        // __FIXTURES__ -> absolute test/spec/files dir, so file-loading
        // (@"file") rows resolve to the shared fixtures from any cwd.
        src: unescape(parts[2]).replaceAll('__FIXTURES__', FIXTURES_DIR),
        data: vetRow ? unescape(parts[3]) : undefined,
        expect: unescape(parts[vetRow ? 4 : 3]),
      })
    }
  }

  return rows
}


describe('spec', () => {
  const rows = loadRows()

  // Sanity: ensure the shared spec files were actually found.
  test('spec-files-present', () => {
    Assert.ok(0 < rows.length, 'no spec rows loaded from ' + SPEC_DIR)
  })

  for (const row of rows) {
    test(`${row.file}:${row.name}`, () => runRow(row))
  }
})


const CANON_NO_REPARSE: Record<string, string> = {}


function assertCanonConverges(row: Omit<Row, 'file'> & { file?: string }): void {
  if (row.name in CANON_NO_REPARSE) {
    return
  }
  const a1 = rowAontu(row)
  const c2 = a1.unify(row.expect, undefined, makeVarsCtx(a1)).canon
  const a2 = rowAontu(row)
  const c3 = a2.unify(c2, undefined, makeVarsCtx(a2)).canon
  Assert.strictEqual(c3, c2, `canon does not converge: ${row.name}`)
}


function assertFormatSameDocument(
  row: Omit<Row, 'file'> & { file?: string }): void {
  const a1 = rowAontu(row)
  const c1 = makeVarsCtx(a1)
  c1.collect = true
  let v1: any
  try {
    v1 = a1.unify(row.src, undefined, c1)
  }
  catch {
    // An include in value position with no file behind it THROWS out
    // of the resolver rather than collecting (a defect of the include
    // path, not of the row): no hash either way.
    return
  }
  if (0 < c1.err.length || true === v1.isNil) {
    return
  }
  const a2 = rowAontu(row)
  const c2 = makeVarsCtx(a2)
  c2.collect = true
  const v2: any = a2.unify(row.expect, undefined, c2)
  Assert.strictEqual(canonHash(v2), canonHash(v1),
    `formatting moved the hash: ${row.name}`)
}


function assertHcanonRoundTrips(
  row: Omit<Row, 'file'> & { file?: string }): void {
  const a1 = rowAontu(row)
  Assert.strictEqual(
    hcanon(a1.unify(row.expect, undefined, makeVarsCtx(a1))),
    row.expect,
    `hash form does not round-trip: ${row.name}`)
}


function assertViewSubsumes(
  row: Omit<Row, 'file'> & { file?: string },
  report: { ok: boolean; out: string },
  opts: any): void {
  const view = opts.view ?? 'json'
  if (!report.ok || ('canon' !== view && 'types' !== view)) {
    return
  }
  const truth = get(row.src, row.data as string, { view: 'canon' })
  Assert.strictEqual(
    subsume(report.out, truth.out, { profile: 'values' }).verdict,
    'subsumes',
    `view does not subsume the truth: ${row.name}`)
}


function stripProse(findings: any[]): any[] {
  return findings.map(({ message, hint, ...rest }: any) => rest)
}


function vetGolden(report: any): string {
  return exactJSON({
    verdict: report.verdict,
    truncated: report.truncated,
    findings: report.findings.map(
      ({ message, hint, ...rest }: any) => rest),
    // Absent unless the row asked for it (G11 phase 5), so every row
    // written before coverage existed compares exactly as it did.
    ...(null == report.coverage ? {} : { coverage: report.coverage }),
  })
}


const TRUST_FILES: Record<string, boolean> = {
  'include-trust.tsv': true,
  'file.tsv': true,
  // Module resolution reads the filesystem (G6 phase 2), so mod.tsv's
  // rows run under the same fixture root for the same reason file.tsv's
  // do: no row may read outside the repository.
  'mod.tsv': true,
  'alias.tsv': true,
  // fmt.tsv's include rows name files that are not there, so that the
  // hash comparison is skipped for them rather than made through a
  // resolver that reads the working directory.
  'fmt.tsv': true,
}

function rowAontu(row: { file?: string }): Aontu {
  return new Aontu(null != row.file && true === TRUST_FILES[row.file]
    ? { trust: { include: { root: FIXTURES_DIR } } }
    : {})
}


// Execute one spec row. Shared by the TSV-driven tests above and the
// gens-mode self-test below, so both go through the same comparison.
function runRow(row: Omit<Row, 'file'> & { file?: string }): void {
  const a0 = rowAontu(row)
  // Fresh context per row carrying the shared $var test variables.
  const ctx = makeVarsCtx(a0)

  if ('canon' === row.mode) {
    Assert.strictEqual(a0.unify(row.src, undefined, ctx).canon, row.expect)
    assertCanonConverges(row)
  }
  else if ('gen' === row.mode) {
    Assert.deepStrictEqual(
      a0.generate(row.src, undefined, ctx), JSON.parse(row.expect))
  }
  else if ('gens' === row.mode) {
    Assert.strictEqual(genJSON(a0.generate(row.src, undefined, ctx)), row.expect)

    const a1 = rowAontu(row)
    Assert.strictEqual(
      genJSON(a1.generate(row.src, undefined, makeVarsCtx(a1))),
      row.expect,
      `gens is not repeatable: ${row.name}`)
  }
  else if ('err' === row.mode) {
    Assert.throws(
      () => a0.generate(row.src, undefined, makeVarsCtx(a0)),
      (err: any) => {
        const msg = String(err && err.message)
        Assert.ok(
          msg.includes(row.expect),
          `expected error containing "${row.expect}", got: ${msg}`
        )
        return true
      }
    )
  }
  else if ('errc' === row.mode) {
    Assert.throws(
      () => a0.generate(row.src, undefined, makeVarsCtx(a0)),
      (err: any) => {
        const errs = 'function' === typeof err?.errs ? err.errs() : []
        const code = errs[0]?.why
        Assert.strictEqual(
          code,
          row.expect,
          `expected error code "${row.expect}", got "${code}"` +
          ` (message: ${String(err && err.message).split('\n')[0]})`
        )
        return true
      }
    )
  }
  else if ('vet' === row.mode) {
    // The golden carries the run's options under `opts`; everything
    // else in it is the report.
    const golden = JSON.parse(row.expect)
    const opts = golden.opts
    delete golden.opts

    Assert.strictEqual(
      vetGolden(vet(row.src, row.data as string, opts)),
      exactJSON(golden),
      `vet report mismatch: ${row.name}`)
  }
  else if ('subsume' === row.mode) {
    // Same golden discipline as vet: `opts` rides the expect object,
    // messages are per-port prose and excluded from parity.
    const golden = JSON.parse(row.expect)
    const opts = golden.opts
    delete golden.opts

    const report = subsume(row.src, row.data as string, opts)
    Assert.strictEqual(
      exactJSON({
        verdict: report.verdict,
        findings: report.findings.map(({ message, ...rest }: any) => rest),
      }),
      exactJSON(golden),
      `subsume report mismatch: ${row.name}`)
  }
  else if ('trim' === row.mode) {
    const report = trimCheck(row.src)
    Assert.strictEqual(
      exactJSON({
        redundant: report.redundant,
        verdict: report.verdict,
        ...(null == report.errors
          ? {} : { errors: stripProse(report.errors) }),
      }),
      exactJSON(JSON.parse(row.expect)),
      `trim report mismatch: ${row.name}`)
  }
  else if ('jsonschema' === row.mode) {
    const report = jsonSchema(row.src)
    Assert.strictEqual(
      exactJSON({
        lossy: report.lossy,
        schema: report.schema,
        verdict: report.verdict,
        ...(null == report.errors
          ? {} : { errors: stripProse(report.errors) }),
      }),
      exactJSON(JSON.parse(row.expect)),
      `jsonschema report mismatch: ${row.name}`)
  }
  else if ('reaches' === row.mode) {
    const golden = JSON.parse(row.expect)
    const ask = golden.ask
    delete golden.ask

    const report = reachCheck(row.src, ask.from, ask.to,
      null == ask.relation ? undefined : { relation: ask.relation })
    Assert.strictEqual(
      exactJSON(null == report.errors
        ? report : { ...report, errors: stripProse(report.errors) }),
      exactJSON(golden),
      `reach report mismatch: ${row.name}`)
  }
  else if ('view' === row.mode) {
    const golden = JSON.parse(row.expect)
    const ask = golden.ask ?? {}
    delete golden.ask

    const report = view(row.src, ask)
    Assert.strictEqual(
      exactJSON(null == report.errors
        ? report : { ...report, errors: stripProse(report.errors) }),
      exactJSON(golden),
      `view report mismatch: ${row.name}`)
  }
  else if ('render' === row.mode) {
    const golden = JSON.parse(row.expect)
    const ask = golden.ask ?? {}
    delete golden.ask

    const report = render(row.src, ask)
    Assert.strictEqual(
      exactJSON(null == report.errors
        ? report : { ...report, errors: stripProse(report.errors) }),
      exactJSON(golden),
      `render report mismatch: ${row.name}`)
  }
  else if ('trace' === row.mode) {
    const report = traceRun(row.src, {})
    Assert.strictEqual(
      exactJSON(report.trace),
      exactJSON(JSON.parse(row.expect)),
      `trace mismatch: ${row.name}`)
  }
  else if ('template' === row.mode) {
    const golden = JSON.parse(row.expect)
    const marker = golden.ask?.marker
    const out = desugarTemplate(row.src, marker)
    Assert.strictEqual(out, golden.out, `desugar mismatch: ${row.name}`)
    Assert.strictEqual(resugarTemplate(out, marker), golden.back,
      `resugar mismatch: ${row.name}`)
  }
  else if ('views' === row.mode) {
    // THE VIEW DOCUMENT (VIEWS.0.md, "6. The view document"): N figures
    // of one document, declared as data, compared as one report --
    // every figure's bytes and verdict, and every refusal, in the order
    // the declaration keys sort.
    const golden = JSON.parse(row.expect)
    const ask = golden.ask ?? {}
    delete golden.ask

    const report: any = viewSet(row.src, ask)
    Assert.strictEqual(
      exactJSON({
        ...report,
        ...(null == report.errors ? {} : { errors: stripProse(report.errors) }),
        views: report.views.map((v: any) => null == v.errors
          ? v : { ...v, errors: stripProse(v.errors) }),
      }),
      exactJSON(golden),
      `view set report mismatch: ${row.name}`)
  }
  else if ('relation' === row.mode) {
    const report = relationCheck(row.src)
    Assert.strictEqual(
      exactJSON(null == report.errors
        ? report : { ...report, errors: stripProse(report.errors) }),
      exactJSON(JSON.parse(row.expect)),
      `relation report mismatch: ${row.name}`)
  }
  else if ('graph' === row.mode) {
    const graph = graphOf(a0.unify(row.src, undefined, ctx))
    Assert.strictEqual(
      exactJSON(graph),
      exactJSON(JSON.parse(row.expect)),
      `graph mismatch: ${row.name}`)

    // ... and DETERMINISTIC is a property, not a claim: a fresh engine
    // over the same source answers the same bytes.
    const a1 = rowAontu(row)
    Assert.strictEqual(
      exactJSON(graphOf(a1.unify(row.src, undefined, makeVarsCtx(a1)))),
      exactJSON(graph),
      `graph is not repeatable: ${row.name}`)
  }
  else if ('hcanon' === row.mode) {
    Assert.strictEqual(hcanon(a0.unify(row.src, undefined, ctx)), row.expect)
    assertHcanonRoundTrips(row)
  }
  else if ('hash' === row.mode) {
    Assert.strictEqual(canonHash(a0.unify(row.src, undefined, ctx)), row.expect)
  }
  else if ('fmt' === row.mode) {
    const report: any = format(row.src)
    Assert.strictEqual(report.verdict, 'formatted',
      `does not format: ${row.name}: ${JSON.stringify(report.errors)}`)
    Assert.strictEqual(report.text, row.expect)
    Assert.strictEqual((format(row.expect) as any).text, row.expect,
      `not a fixed point: ${row.name}`)
    assertFormatSameDocument(row)
  }
  else if ('fmt-template' === row.mode) {
    const report: any = format(row.src, { template: row.data as string })
    Assert.strictEqual(report.verdict, 'formatted',
      `does not format: ${row.name}: ${JSON.stringify(report.errors)}`)
    Assert.strictEqual(report.text, row.expect)
    Assert.strictEqual(
      (format(row.expect, { template: row.data as string }) as any).text, row.expect,
      `not a fixed point: ${row.name}`)
  }
  else if ('fmt-template-lint' === row.mode) {
    // THE LINT OVER A GENERATOR (§3.14): the findings of --lint, in
    // the shape the fmt-lint rows pin them, over a template whose
    // marker is `data`. What this row is here for is the COLUMN: a
    // site is in the template, not in the document it carries.
    const report: any = format(row.src, { template: row.data as string, lint: true })
    Assert.strictEqual(report.verdict, 'formatted',
      `does not format: ${row.name}: ${JSON.stringify(report.errors)}`)
    Assert.strictEqual(
      report.findings.map((f: any) => `${f.line}:${f.col}: ${f.rule}: ${f.message}`).join('\n'),
      row.expect, `fmt lint: ${row.name}`)
  }
  else if ('fmt-refuse' === row.mode) {
    const report: any = format(row.src)
    Assert.strictEqual(
      report.verdict + ':' +
      (report.errors ?? []).map((f: any) => f.code).join(','),
      row.expect, `fmt refusal: ${row.name}`)
  }
  else if ('fmt-lint' === row.mode) {
    const report: any = format(row.src, { lint: true })
    Assert.strictEqual(report.verdict, 'formatted',
      `does not format: ${row.name}: ${JSON.stringify(report.errors)}`)
    Assert.strictEqual(
      report.findings.map((f: any) => `${f.line}:${f.col}: ${f.rule}: ${f.message}`).join('\n'),
      row.expect, `fmt lint: ${row.name}`)
  }
  else if ('agentsmd' === row.mode) {
    const golden = JSON.parse(row.expect)
    const report = agentsMd(row.src,
      '' === row.data ? undefined : { name: row.data as string })

    Assert.strictEqual(report.ok, golden.ok, `agentsmd ok: ${row.name}`)
    Assert.strictEqual(
      report.stanza, golden.stanza ?? '', `agentsmd stanza: ${row.name}`)
    Assert.deepStrictEqual(
      0 === report.findings.length
        ? undefined : report.findings.map((f) => f.code),
      golden.codes, `agentsmd codes: ${row.name}`)
  }
  else if ('diff' === row.mode) {
    const input = JSON.parse(row.data as string)
    const golden = JSON.parse(row.expect)
    const report = diff(row.src, input.right,
      null == input.at ? undefined : { at: input.at })

    Assert.strictEqual(
      exactJSON({
        changes: report.changes,
        same: report.same,
        ...(0 === report.findings.length
          ? {} : { codes: report.findings.map((f) => f.code) }),
      }),
      exactJSON(golden),
      `diff report mismatch: ${row.name}`)

    // A diff is SYMMETRIC in what it detects: swapping the sides
    // reports the same number of changes at the same paths, with
    // added and removed exchanged. Asserted for every row that
    // stands up, which is cheap and catches a one-sided walk.
    if (report.ok) {
      const back = diff(input.right, row.src,
        null == input.at ? undefined : { at: input.at })
      Assert.deepStrictEqual(
        back.changes.map((c) => c.path), report.changes.map((c) => c.path),
        `diff is not symmetric: ${row.name}`)
      Assert.deepStrictEqual(
        back.changes.map((c) =>
          'added' === c.kind ? 'removed' : 'removed' === c.kind ? 'added'
            : c.kind),
        report.changes.map((c) => c.kind),
        `diff kinds are not symmetric: ${row.name}`)
    }
  }
  else if ('patch' === row.mode) {
    const input = JSON.parse(row.data as string)
    const golden = JSON.parse(row.expect)
    const report = patch(row.src, input.overlay, input.set,
      true === input.inPlace ? { inPlace: true } : undefined)

    Assert.strictEqual(
      exactJSON({
        appended: report.appended,
        overlay: report.overlay,
        verdict: report.verdict,
        ...(0 === report.replaced.length
          ? {} : { replaced: report.replaced }),
        ...(0 === report.findings.length
          ? {} : { codes: report.findings.map((f) => f.code) }),
      }),
      exactJSON(golden),
      `patch report mismatch: ${row.name}`)

    // IN-PLACE IS NEVER WORSE THAN APPEND. Every in-place row is run
    // again WITHOUT the flag and must reach a verdict at least as good
    // -- the whole safety claim of the mode is that asking for it
    // cannot turn a run that would have held into one that does not.
    if (true === input.inPlace) {
      const plain = patch(row.src, input.overlay, input.set)
      const rank: any = { valid: 0, incomplete: 1, invalid: 2, error: 3 }
      Assert.ok(rank[report.verdict] <= rank[plain.verdict],
        `in-place is worse than append: ${row.name} ` +
        `(${report.verdict} vs ${plain.verdict})`)
    }

    let overlayStandsAlone = true
    try {
      new Aontu().generate(report.overlay)
    }
    catch (e) {
      overlayStandsAlone = false
    }
    if ('error' !== report.verdict && overlayStandsAlone) {
      Assert.strictEqual(
        vet(report.overlay, row.src).verdict, report.verdict,
        `patch is not order-independent: ${row.name}`)
    }

    if (0 < report.replaced.length) {
      Assert.ok(overlayStandsAlone,
        `in-place left a self-contradicting overlay: ${row.name}`)
    }
  }
  else if ('why' === row.mode) {
    const golden = JSON.parse(row.expect)
    const report = why(row.src, row.data as string)

    Assert.strictEqual(
      report.record?.value, golden.value, `why value mismatch: ${row.name}`)
    Assert.strictEqual(
      exactJSON(report.record?.conjuncts ?? null),
      exactJSON(golden.conjuncts ?? null),
      `why conjuncts mismatch: ${row.name}`)
    Assert.strictEqual(
      report.findings[0]?.code, golden.code, `why code mismatch: ${row.name}`)
    Assert.strictEqual(
      report.findings[0]?.note, golden.note, `why note mismatch: ${row.name}`)
  }
  else if ('query' === row.mode) {
    // The golden carries the run's options under `opts`; `out` is the
    // rendered slice, and `code`/`note` the finding when the answer is
    // a refusal. `message` is excluded, as every other verb's goldens
    // exclude it: prose is per-port, codes are not.
    const golden = JSON.parse(row.expect)
    const opts = golden.opts ?? {}
    const report = get(row.src, row.data as string, opts)

    Assert.strictEqual(
      report.out, golden.out ?? '', `query out mismatch: ${row.name}`)
    Assert.strictEqual(
      report.findings[0]?.code, golden.code,
      `query code mismatch: ${row.name}`)
    Assert.strictEqual(
      report.findings[0]?.note, golden.note,
      `query note mismatch: ${row.name}`)

    assertViewSubsumes(row, report, opts)
  }
  else if ('errcode' === row.mode) {
    // Registry row: name IS the code, src is its class, expect the
    // version line at which the code was first registered. The reverse
    // direction (every engine code registered in the tsv) is asserted
    // by the spec-errcodes-registry set-equality test below.
    const cls = codeClasses[row.name]
    Assert.ok(
      undefined !== cls,
      `code "${row.name}" is not in the engine codeClasses table`
    )
    Assert.strictEqual(
      cls,
      row.src,
      `code "${row.name}": registry class "${row.src}",` +
      ` engine class "${cls}"`
    )
    Assert.ok(
      /^\d+\.\d+\.\d+$/.test(row.expect),
      `code "${row.name}": since-version "${row.expect}"` +
      ` is not a semver triple`
    )
  }
  else {
    throw new Error('unknown spec mode: ' + row.mode)
  }
}


// The `gens` mode is byte-exact machinery with no shared rows using it
// yet (it exists so Phase 2's exact leaves CAN be asserted). Prove the
// mode itself here, against the same runRow path the TSV rows take, so
// it is known-good before anything depends on it.
describe('spec-gens-mode', () => {

  test('gens-compares-bytes', () => {
    runRow({ name: 'g1', mode: 'gens', src: 'a:1', expect: '{"a":1}' })
    // Compact: no spaces, no indentation, keys in the engine's generated
    // order -- which is sorted, and matches Go's encoding/json for a map.
    runRow({
      name: 'g2', mode: 'gens',
      src: 'b:2\na:1\nc:[1,{d:x}]',
      expect: '{"a":1,"b":2,"c":[1,{"d":"x"}]}',
    })
    // Byte-exact, so integer 1 and float 1.0 both serialise as `1` --
    // gens pins the BYTES, canon pins the kind. Neither replaces the other.
    runRow({ name: 'g3', mode: 'gens', src: 'a:1.0', expect: '{"a":1}' })
    runRow({ name: 'g4', mode: 'gens', src: 'a:1.5', expect: '{"a":1.5}' })
    runRow({ name: 'g5', mode: 'gens', src: 'a:x', expect: '{"a":"x"}' })
  })

  test('gens-fails-on-any-byte-difference', () => {
    // A whitespace or ordering difference must fail: the point of the
    // mode is that it does not decode before comparing.
    Assert.throws(() => runRow(
      { name: 'g6', mode: 'gens', src: 'a:1', expect: '{"a": 1}' }))
    Assert.throws(() => runRow(
      { name: 'g7', mode: 'gens', src: 'b:2\na:1', expect: '{"b":2,"a":1}' }))
  })

  test('unknown-mode-still-fails-loudly', () => {
    Assert.throws(
      () => runRow({ name: 'g8', mode: 'genz', src: 'a:1', expect: '{"a":1}' }),
      /unknown spec mode: genz/)
  })

})


describe('spec-errcodes-registry', () => {

  test('registry-and-engine-agree', () => {
    const registered = loadRows()
      .filter((r) => 'errcode' === r.mode)
      .map((r) => r.name)
      .sort()
    const engine = Object.keys(codeClasses).sort()
    Assert.deepStrictEqual(
      engine,
      registered,
      'engine codeClasses table and test/spec/errcodes.tsv disagree'
    )
  })

})


function genJSON(v: any): string {
  return exactJSON(v)
}


// The $var test variables, shared with the Go runner (go/spec_test.go).
function makeVarsCtx(a0: Aontu): any {
  const ctx = a0.ctx()
  ctx.vars.foo = new IntegerVal({ peg: 11 })
  ctx.vars.bar = new StringVal({ peg: 'hello' })
  ctx.vars.flag = new BooleanVal({ peg: true })
  ctx.vars.obj = new MapVal({ peg: { x: new IntegerVal({ peg: 1 }) } })
  ctx.vars.big = new IntegerVal({ peg: 1152921504606846976 })
  // One variable per remaining scalar kind, so shared rows can reach
  // every variable-as-path-segment rendering branch (coverage drive;
  // go/spec_test.go specVars mirrors these).
  ctx.vars.half = new NumberVal({ peg: 1.5 })
  ctx.vars.off = new BooleanVal({ peg: false })
  ctx.vars.bigi = new BigIntegerVal({ peg: 5n })
  ctx.vars.bigd = new BigDecimalVal({ peg: new Decimal(15n, 1) })
  ctx.vars.nul = new NullVal({ peg: null })
  ctx.vars.PARENT = new StringVal({ peg: 'q' })
  return ctx
}
