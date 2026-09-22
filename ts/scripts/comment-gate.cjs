
'use strict'

const Fs = require('node:fs')
const Path = require('node:path')

const REPO = Path.join(__dirname, '..', '..')

// The implementation languages, wherever their source lives. A Rust
// tree is covered from the day it appears; build and release tooling
// written in .cjs, .mjs or .js is not source in this sense.
const SOURCE_EXTS = ['.ts', '.go', '.rs']

// The bundled models are source too (ADR-036): aontu/ is where the
// language's own vocabularies are written, and they are held to the
// same rule. Every other .aontu in the tree is a fixture or a document.
const AON_TREE = 'aontu/'

// Written by a generator, checked byte-for-byte by its own suite.
const GENERATED = new Set([
  'ts/src/sigdecl.ts',
  'ts/src/helpdoc.ts',
  'ts/src/aontumodel.ts',
  'go/aontumodel.go',
])

// Worked-example corpora: fixtures, and the generated ones are compared
// byte for byte against what a generator writes.
const FIXTURE_TREES = new Set([
  'use-cases',
  'test/system',
])

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-test', 'covdata', 'bin', 'out', '.git',
])

const MAX_BLOCK_LINES = 5
const MAX_DENSITY = 0.12
const DENSITY_FLOOR_LINES = 8

const LICENSE_RE = /^\/\*+\s*Copyright[^\n]*\*\/$/
const DIRECTIVE_RE =
  /^(#!|\/\/\s*(go:|nolint|@ts-|eslint|prettier|c8 |istanbul|coverage:ignore|\/\s*<reference)|\/\*\s*(node:coverage|eslint|c8|istanbul|prettier))/

const NARRATIVE_RE = [
  /\b(we|our|ours|us)\b/i,
  /(^|[^\w])I[ ,]/,
  /\b(used to|no longer|previously|originally|at first|for years|since then|nowadays)\b/i,
  /\b(turned out|turns out|it emerged|was found|found that|discovered|noticed)\b/i,
  /\b(the plan|the first version|the second version|an earlier|a later version|the old|the new)\b/i,
  /\b(scar|worked example|worth knowing|worth reading|expect to lose|for the record|history)\b/i,
  /\b(this is why|that is why|which is why|the reason (this|it|we)|hence why)\b/i,
  /\b(deliberately|on purpose|by design|intentionally)\b/i,
  /\b(fixed by|fixes? #|broke|broken by|regression from|reverted|landed in|shipped in)\b/i,
  /\b(review|reviewer|issue|pull request|pr\b|ticket|commit)\b/i,
  /\b(todo|fixme|xxx|hack|note to self)\b/i,
]

const REQUIREMENT_RE = [
  /\b(requirement|requirements|business|policy|policies|acceptance|stakeholder|customer|user story|use case|sla|invariant of the business)\b/i,
  /\b(the rule is|the rules are|the contract is|by contract|specified as|as specified|per the spec|the spec says)\b/i,
  /\b(shall|is required to|are required to|is expected to|are expected to)\b/i,
]

const UNVERIFIABLE_RE = [
  { rule: 'dated-claim', re: /\b(19|20)\d\d-\d\d(-\d\d)?\b/ },
  { rule: 'issue-ref', re: /(^|[\s(])#\d+\b/ },
  { rule: 'version-claim', re: /\bv\d+\.\d+(\.\d+)?\b/ },
  {
    rule: 'count-claim',
    re: /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|\d+)\s+(?:[a-z][a-z-]*\s+){0,2}[a-z][a-z-]{2,}s\b/i,
  },
]

const PATH_RE = /\b((?:[\w.-]+\/)+[\w.-]+\.(?:ts|go|md|tsv|cjs|mjs|js|json|aontu|abnf|yml|sh))\b/g
const ADR_RE = /\bADR-(\d{3})\b/g
const SYMBOL_RE = /`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:\(\))?`/g

const CODE_SHAPED_RE =
  /^\s*(?:(?:const|let|var|func|function|type|class|interface|import|export|package|return|if|for|while|switch|case|await|throw|new|await)\b(?=[^\n]*[;{}()=[\]])|[\w$.[\]]+\s*(?::=|\+=|=[^=])|[\w$.]+\([^)]*\)\s*[;{]?\s*$|[})\]];?\s*$)/

const WORD_RE = /[A-Za-z_$][\w$]*/g


function gated(rel, name) {
  return SOURCE_EXTS.some((e) => name.endsWith(e)) ||
    (rel.startsWith(AON_TREE) && name.endsWith('.aontu'))
}


function walk(dir, out) {
  const abs = '' === dir ? REPO : Path.join(REPO, dir)
  for (const entry of Fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = '' === dir ? entry.name : `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !FIXTURE_TREES.has(rel)) walk(rel, out)
    }
    else if (gated(rel, entry.name) && !GENERATED.has(rel)) {
      out.push(rel)
    }
  }
  return out
}


function sourceFiles() {
  return walk('', []).sort()
}


// A hand-rolled lexer, because the gate has to see comments in both
// languages and neither parser is installable at gate time. Strings,
// template literals, Go raw strings and TypeScript regex literals are
// tracked only so that a `//` inside one is not read as a comment.
function lex(text, lang) {
  const comments = []
  const codeLine = new Set()
  let line = 1
  let i = 0
  let prev = ''
  const n = text.length

  const isRegexStart = () => lang === 'ts' && !/[\w$)\]]/.test(prev)

  while (i < n) {
    const c = text[i]
    const c2 = text[i + 1]

    if (c === '\n') { line++; i++; continue }

    if (c === '#' && lang === 'aontu') {
      const start = i
      while (i < n && text[i] !== '\n') i++
      comments.push({ kind: 'line', start: line, end: line, from: start, to: i, text: text.slice(start, i) })
      continue
    }

    if (c === '/' && c2 === '/' && lang !== 'aontu') {
      const start = i
      while (i < n && text[i] !== '\n') i++
      comments.push({ kind: 'line', start: line, end: line, from: start, to: i, text: text.slice(start, i) })
      continue
    }

    if (c === '/' && c2 === '*' && lang !== 'aontu') {
      const start = i
      const startLine = line
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') line++
        i++
      }
      i += 2
      comments.push({ kind: 'block', start: startLine, end: line, from: start, to: i, text: text.slice(start, i) })
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      const raw = ('go' === lang || 'aontu' === lang) && c === '`'
      codeLine.add(line)
      i++
      while (i < n) {
        if (!raw && text[i] === '\\') { i += 2; continue }
        if (text[i] === '\n') { line++; if (quote !== '`') break }
        if (text[i] === quote) { i++; break }
        i++
      }
      prev = quote
      continue
    }

    if (c === '/' && isRegexStart()) {
      let j = i + 1
      let inClass = false
      let closed = false
      while (j < n && text[j] !== '\n') {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === '[') inClass = true
        else if (text[j] === ']') inClass = false
        else if (text[j] === '/' && !inClass) { closed = true; j++; break }
        j++
      }
      if (closed) { codeLine.add(line); i = j; prev = '/'; continue }
    }

    if (!/\s/.test(c)) { codeLine.add(line); prev = c }
    i++
  }

  return { comments, codeLines: codeLine.size }
}


// Consecutive line comments at one indentation read as one comment; the
// gate measures them that way, because that is how they are written.
function blocks(scan, lines) {
  const out = []
  let open = null

  for (const c of scan.comments) {
    const before = lines[c.start - 1].slice(0, lines[c.start - 1].indexOf(c.text.split('\n')[0]))
    const inline = before.trim().length > 0

    const directive = DIRECTIVE_RE.test(c.text.trim())

    if (c.kind === 'line' && !inline && !directive && open && !open.directive
      && open.end === c.start - 1 && !open.inline) {
      open.end = c.end
      open.to = c.to
      open.text += '\n' + c.text
      continue
    }

    open = {
      kind: c.kind,
      start: c.start,
      end: c.end,
      from: c.from,
      to: c.to,
      text: c.text,
      inline,
      directive,
    }
    out.push(open)
  }

  return out
}


function blockLines(block) {
  return block.end - block.start + 1
}


function prose(block) {
  return block.text
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*+\/?)/, '').replace(/\*\/\s*$/, '').trim())
    .join('\n')
    .trim()
}


function exempt(block) {
  const first = block.text.trim()
  return LICENSE_RE.test(first) || DIRECTIVE_RE.test(first)
}


let symbolIndex = null

function codeOnly(text, lang) {
  const { comments } = lex(text, lang)
  let out = ''
  let at = 0
  for (const c of comments) { out += text.slice(at, c.from); at = c.to }
  return out + text.slice(at)
}


// Indexed from code alone: a symbol index built over comment prose too
// would confirm every name a comment invents.
function symbols() {
  if (symbolIndex) return symbolIndex
  symbolIndex = new Set()
  for (const file of sourceFiles()) {
    const text = Fs.readFileSync(Path.join(REPO, file), 'utf8')
    const code = codeOnly(text, file.endsWith('.go') ? 'go' : 'ts')
    for (const word of code.match(WORD_RE) || []) symbolIndex.add(word)
  }
  return symbolIndex
}


let adrIndex = null

function adrs() {
  if (adrIndex) return adrIndex
  adrIndex = new Set()
  const text = Fs.readFileSync(Path.join(REPO, 'ADR.md'), 'utf8')
  for (const m of text.matchAll(/^## ADR-(\d{3})\b/gm)) adrIndex.add(m[1])
  return adrIndex
}


// A path in a comment may be written from the repository root, from
// the package root, or beside the file.
function resolves(ref, file) {
  const bases = [REPO, Path.join(REPO, file.split('/')[0]),
    Path.dirname(Path.join(REPO, file))]
  return bases.some((base) =>
    Fs.existsSync(Path.join(base, ref)) || Fs.existsSync(Path.join(base, '.' + ref)))
}


function checkFile(file, opts = {}) {
  return checkText(file, Fs.readFileSync(Path.join(REPO, file), 'utf8'), opts)
}


function checkText(file, text, opts = {}) {
  const lines = text.split('\n')
  const scan = lex(text,
    file.endsWith('.go') ? 'go' : file.endsWith('.aontu') ? 'aontu' : 'ts')
  const all = blocks(scan, lines)
  const kept = all.filter((b) => !exempt(b))

  const commentLines = kept.reduce((sum, b) => sum + blockLines(b), 0)
  const findings = []

  const add = (block, rule, detail) => findings.push({
    file,
    line: block.start,
    rule,
    detail,
    excerpt: prose(block).split('\n')[0].slice(0, 72),
  })

  for (const block of kept) {
    const body = prose(block)
    const flat = body.replace(/\s+/g, ' ')

    if (blockLines(block) > MAX_BLOCK_LINES) {
      add(block, 'long-block', `${blockLines(block)} lines (max ${MAX_BLOCK_LINES})`)
    }

    for (const re of NARRATIVE_RE) {
      const m = flat.match(re)
      if (m) { add(block, 'narrative', `"${m[0]}"`); break }
    }

    for (const re of REQUIREMENT_RE) {
      const m = flat.match(re)
      if (m) { add(block, 'requirements', `"${m[0]}"`); break }
    }

    for (const { rule, re } of UNVERIFIABLE_RE) {
      const m = flat.match(re)
      if (m) add(block, rule, `"${m[0].trim()}"`)
    }

    for (const raw of body.split('\n')) {
      const line = raw.replace(/^\s*(?:\/\/+\s*)+/, '')
      if (CODE_SHAPED_RE.test(line) && line.length > 3) {
        add(block, 'commented-code', `"${line.slice(0, 48)}"`)
        break
      }
    }

    for (const m of body.matchAll(PATH_RE)) {
      if (!resolves(m[1], file)) add(block, 'stale-path', m[1])
    }

    for (const m of body.matchAll(ADR_RE)) {
      if (!adrs().has(m[1])) add(block, 'stale-adr', m[0])
    }

    if (!opts.skipSymbols) {
      for (const m of body.matchAll(SYMBOL_RE)) {
        const head = m[1].split('.')[0]
        if (!symbols().has(head)) add(block, 'stale-symbol', m[1])
      }
    }
  }

  const density = scan.codeLines === 0 ? 0 : commentLines / scan.codeLines
  if (commentLines > DENSITY_FLOOR_LINES && density > MAX_DENSITY) {
    findings.push({
      file,
      line: 1,
      rule: 'dense-file',
      detail: `${commentLines} comment lines over ${scan.codeLines} code lines`
        + ` = ${(density * 100).toFixed(1)}% (max ${(MAX_DENSITY * 100).toFixed(0)}%)`,
      excerpt: '',
    })
  }

  return {
    file,
    codeLines: scan.codeLines,
    commentLines,
    blocks: kept.length,
    longest: kept.reduce((m, b) => Math.max(m, blockLines(b)), 0),
    words: kept.reduce((sum, b) => sum + (prose(b).match(/\S+/g) || []).length, 0),
    findings,
  }
}


function checkAll(files = sourceFiles(), opts = {}) {
  return files.map((f) => checkFile(f, opts))
}


function totals(reports) {
  const t = {
    files: reports.length,
    codeLines: 0,
    commentLines: 0,
    commentWords: 0,
    blocks: 0,
    longest: 0,
    findings: 0,
    byRule: {},
    filesWithFindings: 0,
  }
  for (const r of reports) {
    t.codeLines += r.codeLines
    t.commentLines += r.commentLines
    t.commentWords += r.words
    t.blocks += r.blocks
    t.longest = Math.max(t.longest, r.longest)
    t.findings += r.findings.length
    if (r.findings.length > 0) t.filesWithFindings++
    for (const f of r.findings) t.byRule[f.rule] = (t.byRule[f.rule] || 0) + 1
  }
  t.density = t.codeLines === 0 ? 0 : t.commentLines / t.codeLines
  return t
}


module.exports = {
  sourceFiles, checkFile, checkText, checkAll, totals, lex, blocks, prose,
  MAX_BLOCK_LINES, MAX_DENSITY,
}


if (require.main === module) {
  const args = process.argv.slice(2)
  const only = args.filter((a) => !a.startsWith('--'))
  const files = only.length > 0 ? only : sourceFiles()
  const opts = { skipSymbols: args.includes('--no-symbols') }
  const reports = checkAll(files, opts)
  const t = totals(reports)

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ totals: t, reports }, null, 2) + '\n')
    process.exit(0)
  }

  if (args.includes('--measure')) {
    process.stdout.write(
      `files ${t.files}  code ${t.codeLines}  comment ${t.commentLines}`
      + `  words ${t.commentWords}  blocks ${t.blocks}`
      + `  density ${(t.density * 100).toFixed(1)}%  longest ${t.longest}\n`)
    for (const [rule, count] of Object.entries(t.byRule).sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${rule}: ${count}\n`)
    }
    process.exit(0)
  }

  const limit = Number((args.find((a) => a.startsWith('--limit=')) || '--limit=40').slice(8))
  let shown = 0
  for (const r of reports) {
    for (const f of r.findings) {
      if (shown++ < limit) {
        process.stdout.write(`${f.file}:${f.line}: ${f.rule}: ${f.detail}\n`)
        if (f.excerpt) process.stdout.write(`    ${f.excerpt}\n`)
      }
    }
  }
  if (t.findings > limit) process.stdout.write(`... ${t.findings - limit} more\n`)
  process.stdout.write(t.findings === 0
    ? `comment gate: clean (${t.commentLines} comment lines, ${(t.density * 100).toFixed(1)}%)\n`
    : `comment gate: ${t.findings} finding(s) in ${t.filesWithFindings} file(s) — ADR-032\n`)
  process.exit(t.findings === 0 ? 0 : 1)
}
