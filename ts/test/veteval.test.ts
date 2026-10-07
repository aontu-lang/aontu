/* Copyright (c) 2025 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu, exactJSON } from '../dist/aontu'
import { vet, throughResidue } from '../dist/vet'


const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec')


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


type VetRow = {
  file: string, name: string, schema: string, data: string, opts: any
}


function loadVetRows(): VetRow[] {
  const rows: VetRow[] = []
  for (const file of Fs.readdirSync(SPEC_DIR).filter(
    (f) => f.endsWith('.tsv')).sort()) {
    const text = Fs.readFileSync(Path.join(SPEC_DIR, file), 'utf8')
    for (const line of text.split('\n').map((l) => l.replace(/\r$/, ''))) {
      if ('' === line || line.startsWith('#')) {
        continue
      }
      const parts = line.split('\t')
      if ('vet' !== parts[1] || parts.length < 5) {
        continue
      }
      const expect = JSON.parse(unescape(parts[4]))
      const opts = expect.opts ?? {}
      if (null != opts.at || true === opts.closed ||
        true === opts.partial || null != opts.maxErrors) {
        continue
      }
      // A row whose source names the shared fixtures loads files; the
      // one-document form would have to resolve them from a different
      // base, which is a difference in the TEST rather than in the
      // engines.
      const schema = unescape(parts[2])
      const data = unescape(parts[3])
      if (schema.includes('__FIXTURES__') || data.includes('__FIXTURES__')) {
        continue
      }
      rows.push({ file, name: parts[0], schema, data, opts })
    }
  }
  return rows
}


// What the one document generates, or undefined where it does not
// stand up. `collect` so a failure is recorded rather than thrown, which
// is the same mode vet's own passes use.
function evalValue(src: string, opts: any, noFill?: boolean):
  string | undefined {
  const aontu = new Aontu(opts)
  const ctx: any = aontu.ctx({ collect: true })
  ctx.noFill = true === noFill
  let out: any
  try {
    out = aontu.generate(src, undefined, ctx)
  }
  catch {
    return undefined
  }
  return 0 === ctx.err.length && undefined !== out ?
    exactJSON(sortKeys(out)) : undefined
}


// What the one document generates less each optional member the data's
// own value lacks, which the admission trial removes before comparing.
function unfilled(src: string, opts: any, alone: string): string | undefined {
  const ctx: any = new Aontu(opts).ctx({ collect: true })
  ctx.noFill = true
  const gen = new Aontu(opts)
  const gctx: any = gen.ctx()
  gctx.noFill = true
  let met: any
  let out: any
  try {
    met = new Aontu(opts).unify(src, undefined, ctx)
    out = gen.generate(src, undefined, gctx)
  }
  catch {
    return undefined
  }
  const prune = (g: any, held: any, d: any): any => {
    const u = throughResidue(held)
    if (true === u?.isMap && null != d && 'object' === typeof d &&
      !Array.isArray(d)) {
      for (const k of Object.keys(g)) {
        if (Object.prototype.hasOwnProperty.call(d, k)) {
          g[k] = prune(g[k], u.peg[k], d[k])
        }
        else if (u.optionalKeys.includes(k)) {
          delete g[k]
        }
      }
    }
    else if (true === u?.isList && Array.isArray(d)) {
      g = g.map((x: any, i: number) =>
        i < d.length ? prune(x, u.peg[i], d[i]) : x)
    }
    return g
  }
  return exactJSON(sortKeys(prune(out, met, JSON.parse(alone))))
}


function sortKeys(v: any): any {
  return Array.isArray(v) ? v.map(sortKeys) :
    null != v && Object === v.constructor ?
      Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) :
      v
}


// A document that USES a name it does not DECLARE has no single-document
// spelling: concatenation would hand it the other document's declaration,
// and a name does not cross between documents. Checking the union would
// then be checking a different question from the one the row asks.
const ALIAS_USE_RE = /(?<!["\w])%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*/g

function declaredNames(src: string): Set<string> {
  const declared = new Set<string>()
  for (const line of src.split('\n')) {
    const m = /^\s*(%[A-Za-z_][A-Za-z0-9_-]*)\s*=/.exec(line)
    if (null != m) {
      declared.add(m[1])
    }
  }
  return declared
}


function borrowsAName(src: string): boolean {
  const declared = declaredNames(src)
  for (const use of src.match(ALIAS_USE_RE) ?? []) {
    if (!declared.has(use)) {
      return true
    }
  }
  return false
}


// A NAME DECLARED IN BOTH has no single-document spelling either:
// concatenation REdeclares it, which asks a different question.
function sharesADeclaration(schema: string, data: string): boolean {
  const both = declaredNames(schema)
  for (const name of declaredNames(data)) {
    if (both.has(name)) {
      return true
    }
  }
  return false
}


// Under exactNumbers evaluation reads the schema by value too, so a
// schema whose literals read differently has no one-document spelling.
function readsAlike(schema: string): boolean {
  const canon = (exactNumbers: boolean) => {
    try {
      return (new Aontu({ exactNumbers }).parse(schema) as any)?.canon
    }
    catch {
      return undefined
    }
  }
  return canon(false) === canon(true)
}


function union(schema: string, data: string, exactNumbers: boolean):
  { one: string, alone: string } | undefined {
  if (borrowsAName(schema) || borrowsAName(data) ||
    sharesADeclaration(schema, data) ||
    (exactNumbers && !readsAlike(schema))) {
    return undefined
  }
  if (statementForm(schema) && statementForm(data)) {
    return { one: schema + '\n' + data + '\n', alone: data }
  }
  if (schema.includes('$.') || data.includes('$.')) {
    return undefined
  }
  return { one: wrap(schema) + '\n' + wrap(data) + '\n', alone: wrap(data) }
}


// Written as key statements at the root, rather than as one literal.
function statementForm(src: string): boolean {
  const t = src.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    return false
  }
  const aontu = new Aontu()
  const ctx: any = aontu.ctx({ collect: true })
  try {
    return true === (aontu.unify(src, undefined, ctx) as any)?.isMap
  }
  catch {
    return false
  }
}


function wrap(src: string): string {
  const t = src.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    return 'veteval: ' + t
  }
  return statementForm(src)
    ? 'veteval: {\n' + src + '\n}'
    : 'veteval: (' + t + ')'
}


describe('vet-equals-eval', () => {

  const rows = loadVetRows()

  test('the-corpus-is-not-empty', () => {
    // A filter that quietly matched nothing would make every assertion
    // below vacuous, and a vacuous differential check is worse than
    // none: it reads as coverage.
    Assert.ok(20 < rows.length, 'vet rows found: ' + rows.length)
  })

  test('vet-and-eval-agree-on-accept-reject', () => {
    const disagree: string[] = []
    let skipped = 0

    for (const row of rows) {
      const report = vet(row.schema, row.data,
        { ...row.opts, schemaUrl: 'schema', dataUrl: 'data' } as any)
      const vetAccepts = 'valid' === report.verdict

      const exact = true === row.opts.exactNumbers
      const both = union(row.schema, row.data, exact)
      if (null == both) {
        skipped++
        continue
      }
      // Under --no-fill the one document generates the data's own value,
      // less the optional members the data does not carry.
      const opts = { exactNumbers: exact, trust: row.opts.trust }
      const got = evalValue(both.one, opts, row.opts.noFill)
      const alone = evalValue(both.alone, opts, row.opts.noFill)
      const evalOk = undefined !== got && (true !== row.opts.noFill ||
        (undefined !== alone && unfilled(both.one, opts, alone) === alone))

      if (vetAccepts !== evalOk) {
        disagree.push(
          `${row.file}:${row.name}` +
          ` vet=${report.verdict}` +
          ` eval=${evalOk ? 'generates' : 'refuses'}` +
          ` | schema: ${JSON.stringify(row.schema)}` +
          ` | data: ${JSON.stringify(row.data)}`)
      }
    }

    Assert.deepEqual(disagree, [],
      'vet and eval disagree on ' + disagree.length + ' row(s):\n' +
      disagree.join('\n'))

    // A skip list that quietly grew to swallow the corpus would leave
    // this green over nothing, so the proportion is bounded too.
    Assert.ok(skipped * 4 < rows.length,
      'too many rows have no single-document spelling: ' +
      skipped + ' of ' + rows.length)
  })

})
