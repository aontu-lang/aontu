// Runs the definition (spec/) over the hand-written `verdict` and `gens`
// rows of test/spec, through defterm.cjs, and compares its answers with
// each row's. See README-defcheck.md beside this file.
//
//   node ts/scripts/defcheck.cjs [--out DIR] [--files a.tsv,b.tsv] [--batch N]

const Fs = require('node:fs')
const Path = require('node:path')
const { spawn } = require('node:child_process')

const { doc, data, jsonData, lang, Unsupported, PRELUDE } = require('./defterm.cjs')

const REPO = Path.join(__dirname, '..', '..')
const SPEC = Path.join(REPO, 'test', 'spec')
const LEAN_DIR = Path.join(REPO, 'spec')

const opt = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i < 0 ? dflt : process.argv[i + 1]
}
const OUT = Path.resolve(opt('--out', Path.join(REPO, 'sketch', 'defcheck')))
const BATCH = Number(opt('--batch', 100))
const ONLY = opt('--files', null)
const TIMEOUT = Number(opt('--timeout', 900)) * 1000

// The calling program's bindings (`progVars` in spec/Oracle/Gen.lean).
const VARS = ['foo', 'bar', 'flag', 'obj', 'big', 'half', 'off', 'bigi', 'bigd', 'nul', 'PARENT', 'kint']

// The definition's own printers this runner needs; `writtenJson` is a
// copy of the oracle's, whose module (Oracle/Gen) is too large to load.
const LEAN_HEAD = `import Aontu
import Oracle.Print
${PRELUDE}
mutual
def wj : Data → String
  | .num x => x.text
  | .str s => quote s
  | .bool b => if b then "true" else "false"
  | .null => "null"
  | .map fs => "{" ++ ",".intercalate (wjm fs) ++ "}"
  | .list xs => "[" ++ ",".intercalate (wjl xs) ++ "]"
  | .addr a => quote a.text
def wjm : List (String × Data) → List String
  | [] => []
  | (k, x) :: fs => (quote k ++ ":" ++ wj x) :: wjm fs
def wjl : List Data → List String
  | [] => []
  | x :: xs => wj x :: wjl xs
end
def vname : Verdict → String
  | .valid => "valid" | .invalid => "invalid" | .incomplete => "incomplete" | .error => "error"
def srcOf (ds : Decls) (S : Val) : String :=
  quote ("\\n".intercalate (ds.map (fun d => "%" ++ d.1 ++ " = " ++ (d.2.src.getD "\\u0000")) ++
    [S.src.getD "\\u0000"]))
def progVars : List (String × Val) :=
  (([("foo", .integer 11), ("bar", .str "hello"), ("flag", .bool true), ("obj", .map [("x", .integer 1)]),
    ("big", .integer 1152921504606846976), ("half", .num (.float (.dyadic 3 (-1)))),
    ("off", .bool false), ("bigi", .num (.biginteger ⟨5⟩)), ("bigd", .num (.bigdecimal (.of 15 1))),
    ("nul", .null), ("PARENT", .str "q")] : List (String × Data)).map fun v => (v.1, v.2.term)) ++
    [("kint", .integer)]
`

const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ('n' === c ? '\n' : 't' === c ? '\t' : '\\' === c ? '\\' : m))

function rows() {
  const files = Fs.readdirSync(SPEC)
    .filter((f) => f.endsWith('.tsv') && !f.startsWith('def-') && 'signature.tsv' !== f)
    .filter((f) => null == ONLY || ONLY.split(',').includes(f))
    .sort()
  const out = []
  for (const file of files) {
    for (const line of Fs.readFileSync(Path.join(SPEC, file), 'utf8').split('\n')) {
      if ('' === line || line.startsWith('#')) continue
      const p = line.split('\t')
      if ('verdict' === p[1]) {
        out.push({ file, name: p[0], mode: p[1], src: unescape(p[2]), data: unescape(p[3]), expect: JSON.parse(unescape(p[4])) })
      }
      else if ('gens' === p[1]) {
        out.push({ file, name: p[0], mode: p[1], src: unescape(p[2]), expect: unescape(p[3]) })
      }
    }
  }
  return out
}

function convert(row) {
  if (row.src.includes('__FIXTURES__') || /@"/.test(row.src)) throw new Unsupported('a file the row loads')
  const d = doc(row.src)
  const used = [...row.src.matchAll(/\$([A-Za-z_]\w*)/g)].map((m) => m[1])
  if (d.vars && used.some((v) => !VARS.includes(v))) throw new Unsupported('a variable the definition does not bind')
  const decls = d.vars ? `(Decls.withVars ${d.decls} progVars)` : d.decls
  if ('verdict' === row.mode) {
    const o = row.expect.opts || {}
    const extra = Object.keys(o).filter((k) => !['noFill', 'partial'].includes(k))
    if (extra.length) throw new Unsupported('the option ' + extra.join(','))
    const mode = `{ fill := ${!o.noFill}, lax := ${!!o.partial} }`
    let data
    try {
      data = jsonData(row.data)
    }
    catch (e) {
      if (!(e instanceof Unsupported)) throw e
      data = dataOf(row.data)
    }
    return `(vname (vetG ${mode} D S (${data})))`
      .replace('D S', `(${decls}) (${d.term})`) + ` ++ "\\t" ++ srcOf ${d.decls} (${d.term})`
  }
  return `(match outputW (${decls}) (${d.term}) with | some j => wj j | none => "<none>") ++ "\\t" ++ srcOf ${d.decls} (${d.term})`
}

// Data written as aontu text rather than JSON, its numbers as the
// schema's reader reads them.
function dataOf(text) {
  const v = lang.parse(text)
  return null == v ? '.map []' : data(v)
}

function runLean(file) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${process.env.HOME}/lean-dl/lean-4.24.1-linux/bin:${process.env.PATH}` }
    const p = spawn('lake', ['env', 'lean', file], { cwd: LEAN_DIR, env })
    let out = ''
    p.stdout.on('data', (b) => (out += b))
    p.stderr.on('data', (b) => (out += b))
    const t = setTimeout(() => p.kill('SIGKILL'), TIMEOUT)
    p.on('close', (code) => {
      clearTimeout(t)
      resolve({ code, out })
    })
  })
}

async function main() {
  Fs.mkdirSync(Path.join(OUT, 'lean'), { recursive: true })
  const all = rows()
  const ok = []
  const skipped = []
  for (const r of all) {
    try {
      r.lean = convert(r)
      ok.push(r)
    }
    catch (e) {
      skipped.push({ ...r, why: e instanceof Unsupported ? e.message : 'converter error: ' + e.message })
    }
  }
  console.log(`rows ${all.length}, converted ${ok.length}, skipped ${skipped.length}`)
  if (process.argv.includes('--dry')) {
    const why = {}
    for (const r of skipped) why[r.why] = (why[r.why] || 0) + 1
    for (const [w, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(n, w)
    return
  }

  const batches = []
  for (let i = 0; i < ok.length; i += BATCH) batches.push(ok.slice(i, i + BATCH))
  const results = new Map()
  const started = Date.now()
  const tick = setInterval(() => console.log(`lean: ${results.size}/${ok.length} rows, ${Math.round(100 * results.size / ok.length)}%, ${Math.round((Date.now() - started) / 1000)}s`), 30000)
  for (const [bi, batch] of batches.entries()) {
    const file = Path.join(OUT, 'lean', `b${bi}.lean`)
    const lines = [LEAN_HEAD]
    for (const r of batch) {
      lines.push(`#eval IO.println (${JSON.stringify(r.name)} ++ "\\t" ++ ${r.lean})`)
    }
    Fs.writeFileSync(file, lines.join('\n') + '\n')
    const { code, out } = await runLean(file)
    Fs.writeFileSync(file.replace(/\.lean$/, '.out'), out)
    const got = new Map()
    for (const line of out.split('\n')) {
      const p = line.split('\t')
      if (3 === p.length && batch.some((r) => r.name === p[0])) got.set(p[0], { answer: p[1], src: JSON.parse(p[2]) })
    }
    for (const r of batch) {
      results.set(`${r.file}:${r.name}`, got.get(r.name) || { answer: null, why: 0 === code ? 'no answer' : `lean exit ${code}` })
    }
  }
  clearInterval(tick)
  report(all, ok, skipped, results)
}

function compare(r, res) {
  if (null == res.answer) return 'failed'
  if ('verdict' === r.mode) {
    const want = Array.isArray(r.expect.verdict) ? r.expect.verdict : [r.expect.verdict]
    return want.includes(res.answer) ? 'agree' : 'differ'
  }
  if ('<none>' === res.answer) return 'differ'
  return res.answer === r.expect ? 'agree' : 'differ'
}

function report(all, ok, skipped, results) {
  const per = {}
  const lines = ['file\tname\tmode\tstatus\tdefinition\texpected\tterm-src\twhy']
  const bump = (f, k) => {
    per[f] = per[f] || { rows: 0, agree: 0, differ: 0, failed: 0, skipped: 0 }
    per[f][k]++
  }
  for (const r of all) bump(r.file, 'rows')
  for (const r of skipped) {
    bump(r.file, 'skipped')
    lines.push([r.file, r.name, r.mode, 'skipped', '', '', '', r.why].join('\t'))
  }
  for (const r of ok) {
    const res = results.get(`${r.file}:${r.name}`)
    const status = compare(r, res)
    bump(r.file, status)
    const want = 'verdict' === r.mode ? JSON.stringify(r.expect.verdict) : r.expect
    lines.push([r.file, r.name, r.mode, status, res.answer ?? '', want, JSON.stringify(res.src ?? ''), res.why ?? ''].join('\t'))
  }
  Fs.writeFileSync(Path.join(OUT, 'results.tsv'), lines.join('\n') + '\n')
  const t = { rows: 0, agree: 0, differ: 0, failed: 0, skipped: 0 }
  const table = ['| file | rows | agree | differ | failed | skipped |', '|---|---:|---:|---:|---:|---:|']
  for (const [f, c] of Object.entries(per).sort()) {
    table.push(`| ${f} | ${c.rows} | ${c.agree} | ${c.differ} | ${c.failed} | ${c.skipped} |`)
    for (const k of Object.keys(t)) t[k] += c[k]
  }
  table.push(`| **total** | ${t.rows} | ${t.agree} | ${t.differ} | ${t.failed} | ${t.skipped} |`)
  Fs.writeFileSync(Path.join(OUT, 'agreement.md'), table.join('\n') + '\n')
  console.log(table.join('\n'))
}

main()
