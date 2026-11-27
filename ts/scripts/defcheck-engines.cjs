// The second half of defcheck.cjs: each row the definition answers
// differently, run through both engines, and sorted. See
// README-defcheck.md beside this file.
//
//   node ts/scripts/defcheck-engines.cjs [--out DIR]

const Fs = require('node:fs')
const Path = require('node:path')
const { execFileSync } = require('node:child_process')

const REPO = Path.join(__dirname, '..', '..')
const { Aontu, vet, exactJSON } = require(Path.join(REPO, 'ts', 'dist', 'aontu.js'))
const { IntegerVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'IntegerVal.js'))
const { StringVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'StringVal.js'))
const { BooleanVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'BooleanVal.js'))
const { MapVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'MapVal.js'))
const { NumberVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'NumberVal.js'))
const { NullVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'NullVal.js'))
const { BigIntegerVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'BigIntegerVal.js'))
const { BigDecimalVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'BigDecimalVal.js'))
const { Integer, ScalarKindVal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'ScalarKindVal.js'))
const { Decimal } = require(Path.join(REPO, 'ts', 'dist', 'val', 'Decimal.js'))

const opt = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i < 0 ? dflt : process.argv[i + 1]
}
const OUT = Path.resolve(opt('--out', Path.join(REPO, 'sketch', 'defcheck')))
const SPEC = Path.join(REPO, 'test', 'spec')

const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ('n' === c ? '\n' : 't' === c ? '\t' : '\\' === c ? '\\' : m))

// The bindings of `makeVarsCtx` in ts/test/spec.test.ts.
function varsCtx(a) {
  const ctx = a.ctx()
  ctx.vars.foo = new IntegerVal({ peg: 11 })
  ctx.vars.bar = new StringVal({ peg: 'hello' })
  ctx.vars.flag = new BooleanVal({ peg: true })
  ctx.vars.obj = new MapVal({ peg: { x: new IntegerVal({ peg: 1 }) } })
  ctx.vars.big = new IntegerVal({ peg: 1152921504606846976 })
  ctx.vars.half = new NumberVal({ peg: 1.5 })
  ctx.vars.off = new BooleanVal({ peg: false })
  ctx.vars.bigi = new BigIntegerVal({ peg: 5n })
  ctx.vars.bigd = new BigDecimalVal({ peg: new Decimal(15n, 1) })
  ctx.vars.nul = new NullVal({ peg: null })
  ctx.vars.PARENT = new StringVal({ peg: 'q' })
  ctx.vars.kint = new ScalarKindVal({ peg: Integer })
  return ctx
}

// What the definition leaves to its opaque `host` (spec/Aontu/Admits.lean):
// which strings a pattern, a format or a grammar reads, and how a
// string changes case.
const HOST = /\b(re|format|parse|abnf|rep|split|upper|lower)\(|\bcase:/

function ts(mode, src, data, opts) {
  try {
    if ('verdict' === mode) return vet(src, data, opts).verdict
    const a = new Aontu()
    return exactJSON(a.generate(src, undefined, varsCtx(a)))
  }
  catch (e) {
    return 'throws: ' + String(e.message).split('\n')[0].slice(0, 80)
  }
}

function source(file, name) {
  for (const line of Fs.readFileSync(Path.join(SPEC, file), 'utf8').split('\n')) {
    const p = line.split('\t')
    if (p[0] === name) return p
  }
  return null
}

// Which of the rows the Go port passes, from its own suite.
function goPasses(rows) {
  const pass = new Set()
  if (0 === rows.length) return pass
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let i = 0; i < rows.length; i += 80) {
    const chunk = rows.slice(i, i + 80)
    const re = '^TestSpec$/^(' + chunk.map((r) => esc(`${r.file}:${r.name}`)).join('|') + ')$'
    let out = ''
    try {
      out = execFileSync('go', ['test', '-run', re, '-count=1', '-v', '.'],
        { cwd: Path.join(REPO, 'go'), encoding: 'utf8', maxBuffer: 1 << 28 })
    }
    catch (e) {
      out = String(e.stdout)
    }
    for (const m of out.matchAll(/--- PASS: TestSpec\/(\S+)/g)) pass.add(m[1])
    console.log(`go: ${Math.min(i + 80, rows.length)}/${rows.length} rows`)
  }
  return pass
}

function main() {
  const lines = Fs.readFileSync(Path.join(OUT, 'results.tsv'), 'utf8').trim().split('\n').slice(1)
  const rows = lines.map((l) => {
    const [file, name, mode, status, def, want, termSrc, why] = l.split('\t')
    return { file, name, mode, status, def, want, termSrc: termSrc ? JSON.parse(termSrc) : '', why }
  }).filter((r) => 'differ' === r.status)
  const go = goPasses(rows)
  const out = ['file\tname\tmode\tclass\tdefinition\trow\tts\tts-of-term\tgo-passes-row\tsrc']
  for (const [i, r] of rows.entries()) {
    const p = source(r.file, r.name)
    const src = unescape(p[2])
    const data = 'verdict' === r.mode ? unescape(p[3]) : undefined
    const expect = 'verdict' === r.mode ? JSON.parse(unescape(p[4])) : null
    const opts = expect ? expect.opts : undefined
    const want = 'verdict' === r.mode ? [].concat(expect.verdict) : [unescape(p[3])]
    const tsAns = ts(r.mode, src, data, opts)
    const tsTerm = r.termSrc.includes('\u0000') ? 'no text' : ts(r.mode, r.termSrc, data, opts)
    const goOk = go.has(`${r.file}:${r.name}`)
    let cls
    if (tsTerm !== tsAns) cls = 'reading'
    else if (HOST.test(src)) cls = 'host'
    else if (want.includes(tsAns) && goOk) cls = 'definition'
    else if (tsAns === r.def) cls = 'row'
    else cls = 'engines'
    out.push([r.file, r.name, r.mode, cls, r.def, want.join('|'), tsAns, tsTerm, goOk, JSON.stringify(src)].join('\t'))
    if (0 === (i + 1) % 100) console.log(`ts: ${i + 1}/${rows.length} rows`)
  }
  Fs.writeFileSync(Path.join(OUT, 'worklist.tsv'), out.join('\n') + '\n')
  const n = {}
  for (const l of out.slice(1)) n[l.split('\t')[3]] = (n[l.split('\t')[3]] || 0) + 1
  console.log(n)
}

main()
