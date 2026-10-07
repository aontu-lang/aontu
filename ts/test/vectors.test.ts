/* Copyright (c) 2026 Richard Rodger, MIT License */

// The vendored corpora under test/vectors/, each with a skip ledger both
// ports read: an answer that is not the corpus's own must be listed, a
// listed line that answers as the corpus says fails the run, so a fix
// deletes its own line, and a ledger may not outgrow its stated bound.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Aontu, exactJSON, importJsonSchema } from '../dist/aontu'
import { formatCheck } from '../dist/strformat'
import { vet } from '../dist/vet'


const VECTORS = Path.join(__dirname, '..', '..', 'test', 'vectors')

const VET = { at: '$.schema', noFill: true, exactNumbers: true }


type Span = { s: number, e: number, kv?: Map<string, Span>, items?: Span[] }

// Where each value sits in its file, so that a schema and an instance
// reach the readers as the corpus wrote them: the host's JSON.parse
// would round `1e400` and lose the difference between `1.0` and `1`.
function spans(t: string): Span {
  let i = 0
  const ws = () => {
    while (i < t.length && ' \t\n\r'.includes(t[i])) i++
  }
  const str = () => {
    for (i++; '"' !== t[i]; i++) {
      if ('\\' === t[i]) i++
    }
    i++
  }
  const val = (): Span => {
    ws()
    const s = i
    if ('{' === t[i] || '[' === t[i]) {
      const map = '{' === t[i++]
      const kv = new Map<string, Span>()
      const items: Span[] = []
      for (ws(); '}' !== t[i] && ']' !== t[i]; ws()) {
        if (map) {
          ws()
          const k = i
          str()
          const key = JSON.parse(t.slice(k, i))
          ws()
          i++
          kv.set(key, val())
        }
        else {
          items.push(val())
        }
        ws()
        if (',' === t[i]) i++
      }
      i++
      return map ? { s, e: i, kv } : { s, e: i, items }
    }
    if ('"' === t[i]) {
      str()
    }
    else {
      while (i < t.length && !',]} \t\n\r'.includes(t[i])) i++
    }
    return { s, e: i }
  }
  return val()
}


type Ledger = { bound: number, lines: Map<string, string[]> }

function readLedger(file: string, keys: number): Ledger {
  const lines = new Map<string, string[]>()
  let bound = -1
  for (const line of Fs.readFileSync(file, 'utf8').split('\n')) {
    const stated = /^# bound (\d+)$/.exec(line)
    if (null != stated) {
      bound = Number(stated[1])
    }
    else if ('' !== line && !line.startsWith('#')) {
      const cols = line.split('\t')
      const key = cols.slice(0, keys).join('\t')
      Assert.ok(!lines.has(key), 'listed twice: ' + key)
      lines.set(key, cols.slice(keys))
    }
  }
  Assert.ok(0 <= bound, file + ' states no bound')
  return { bound, lines }
}


function jsonFiles(dir: string, rel = ''): string[] {
  const out: string[] = []
  for (const f of Fs.readdirSync(Path.join(dir, rel)).sort()) {
    const r = '' === rel ? f : rel + '/' + f
    if (Fs.statSync(Path.join(dir, r)).isDirectory()) {
      out.push(...jsonFiles(dir, r))
    }
    else if (f.endsWith('.json')) {
      out.push(r)
    }
  }
  return out
}


// The documents the suite's tests name: the remotes of the releases
// they refer to, each under the URI the suite serves it from.
function remotes(): Record<string, string> {
  const dir = Path.join(VECTORS, 'jsonschema', 'remotes')
  const out: Record<string, string> = {}
  for (const release of ['draft2019-09', 'draft2020-12']) {
    for (const f of jsonFiles(Path.join(dir, release))) {
      out['http://localhost:1234/' + release + '/' + f] =
        Fs.readFileSync(Path.join(dir, release, f), 'utf8')
    }
  }
  return out
}


function sortKeys(v: any): any {
  return Array.isArray(v) ? v.map(sortKeys) :
    null != v && 'object' === typeof v && !(v as any).isVal &&
      (Object === v.constructor || null === Object.getPrototypeOf(v)) ?
      Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) :
      v
}


// The import and the instance as one document, generated: it must stand
// up exactly where vet admits, and under --no-fill generate the
// instance's own value less each optional member it lacks.
function evalAccepts(source: string, data: string): boolean {
  const one = source + '\ninstance: $.schema\ninstance: ' + data + '\n'
  const alone = 'instance: ' + data + '\n'
  let out: any
  let own: any
  try {
    const aontu = new Aontu({ exactNumbers: true })
    const ctx: any = aontu.ctx({ collect: true })
    out = aontu.generate(one, undefined, ctx)
    if (0 < ctx.err.length) {
      return false
    }
    own = new Aontu({ exactNumbers: true }).generate(alone)
  }
  catch {
    return false
  }
  const want = exactJSON(sortKeys(own.instance))
  if (exactJSON(sortKeys(out.instance)) === want) {
    return true
  }
  const met: any = new Aontu({ exactNumbers: true }).unify(one)
  const prune = (g: any, u: any, d: any): any => {
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
  return exactJSON(sortKeys(prune(out.instance, met.peg.instance,
    own.instance))) === want
}


// A corpus in the suite's own shape: groups of a schema and its tests.
// A listed test names, beside its key, what the import says it lost or
// why it refused, and the line must say exactly that.
function suiteProblems(root: string, ledger: Ledger,
  documents: Record<string, string> = {}): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const file of jsonFiles(root)) {
    const text = Fs.readFileSync(Path.join(root, file), 'utf8')
    const at = (s: Span, k: string) =>
      text.slice(s.kv!.get(k)!.s, s.kv!.get(k)!.e)
    // The suite's optional/format/ asks for format as an assertion.
    const formatAssertion = file.includes('optional/format/')
    for (const group of spans(text).items!) {
      const report = importJsonSchema(at(group, 'schema'),
        { documents, formatAssertion })
      const account = 'error' === report.verdict ? report.errors![0].code :
        [...new Set(report.lossy.map((l) => l.construct))].sort().join(',') ||
        '-'
      for (const t of group.kv!.get('tests')!.items!) {
        const key = [file, JSON.parse(at(group, 'description')),
          JSON.parse(at(t, 'description'))].join('\t')
        Assert.ok(!seen.has(key), 'a test named twice: ' + key)
        seen.add(key)
        let honoured = false
        if ('error' !== report.verdict) {
          const data = at(t, 'data')
          const accepts = 'valid' === vet(report.source, data, VET).verdict
          honoured = accepts === ('true' === at(t, 'valid'))
          if (accepts !== evalAccepts(report.source, data)) {
            problems.push('vet and evaluation disagree: ' + key)
          }
        }
        const listed = ledger.lines.get(key)
        if (null == listed && !honoured) {
          problems.push('answers against the suite and is not listed: ' +
            key + ' (' + account + ')')
        }
        else if (null != listed && honoured) {
          problems.push('listed, but answers as the suite says: ' + key)
        }
        else if (null != listed && listed[0] !== account) {
          problems.push('listed for ' + listed[0] + ', where the import says ' +
            account + ': ' + key)
        }
      }
    }
  }
  for (const key of ledger.lines.keys()) {
    if (!seen.has(key)) {
      problems.push('listed, but names no test: ' + key)
    }
  }
  if (ledger.bound < ledger.lines.size) {
    problems.push(ledger.lines.size + ' lines, past the bound of ' + ledger.bound)
  }
  return problems
}


// A case the suite marks for other releases only is not this dialect's
// to answer (the suite's README, "compatibility").
function for2020(compat: string | undefined): boolean {
  return undefined === compat || compat.split(',').every((c) => {
    const n = Number(c.replace(/^<?=/, ''))
    return c.startsWith('<=') ? 2020 <= n : c.startsWith('=') ? 2020 === n :
      n <= 2020
  })
}


const META = ['title', 'description', 'default', 'examples', 'readOnly',
  'writeOnly', 'format', 'contentEncoding', 'contentMediaType',
  'contentSchema']

// The values a location collects for a keyword, read off the riders the
// meet leaves there, as JSON; an unknown keyword's values ride `x`.
function collected(node: any, keyword: string): string[] {
  const json = (m: any) => exactJSON(sortKeys(m.gen(new Aontu({
    exactNumbers: true,
  }).ctx({ collect: true }))))
  const meta = node?.meta ?? {}
  const vals = 'deprecated' === keyword ?
    (null == node?.deprecation ? [] : ['true']) :
    META.includes(keyword) ? (meta[keyword] ?? []).map(json) :
      (meta.x ?? []).filter((m: any) =>
        Object.prototype.hasOwnProperty.call(m.peg, keyword))
        .map((m: any) => json(m.peg[keyword]))
  return [...new Set<string>(vals)].sort()
}


// A key still optional after the meet is one the instance does not have,
// and a container held beside a check is reached through it.
function pointerAt(node: any, pointer: string): any {
  for (const seg of '' === pointer ? [] : pointer.slice(1).split('/')) {
    const k = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    if (true === node?.isConjunct) {
      node = node.peg.find((t: any) => true === t.isMap || true === t.isList)
    }
    node = true === node?.isList ||
      (true === node?.isMap && !node.optionalKeys.includes(k)) ?
      node.peg[k] : undefined
  }
  return node
}


// The suite's annotations/ (its README): the values each assertion lists
// for a keyword at an instance location must be what the riders there
// hold once the instance meets the schema with annotations collected,
// compared as a set and not by the schema location that gave each (G12
// design, section 16).
function annotationProblems(root: string, ledger: Ledger): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const file of jsonFiles(root)) {
    const text = Fs.readFileSync(Path.join(root, file), 'utf8')
    const at = (s: Span, k: string) =>
      text.slice(s.kv!.get(k)!.s, s.kv!.get(k)!.e)
    for (const kase of spans(text).kv!.get('suite')!.items!) {
      if (!for2020(kase.kv!.has('compatibility') ?
        JSON.parse(at(kase, 'compatibility')) : undefined)) {
        continue
      }
      const report = importJsonSchema(at(kase, 'schema'))
      const account = 'error' === report.verdict ? report.errors![0].code :
        [...new Set(report.lossy.map((l) => l.construct))].sort().join(',') ||
        '-'
      kase.kv!.get('tests')!.items!.forEach((t, n) => {
        let node: any = undefined
        try {
          node = 'error' === report.verdict ? undefined :
            (new Aontu({ exactNumbers: true }).unify(report.source +
              '\ninstance: $.schema\ninstance: ' + at(t, 'instance') + '\n',
              { collect: true, annotate: true }) as any).peg.instance
        }
        catch { }
        for (const a of t.kv!.get('assertions')!.items!) {
          const location = JSON.parse(at(a, 'location'))
          const keyword = JSON.parse(at(a, 'keyword'))
          const key = [file, JSON.parse(at(kase, 'description')), n + 1,
            location, keyword].join('\t')
          Assert.ok(!seen.has(key), 'an assertion named twice: ' + key)
          seen.add(key)
          const want = [...new Set([...a.kv!.get('expected')!.kv!.values()]
            .map((e) => exactJSON(sortKeys(JSON.parse(text.slice(e.s, e.e))))))]
            .sort()
          const honoured = JSON.stringify(want) ===
            JSON.stringify(collected(pointerAt(node, location), keyword))
          const listed = ledger.lines.get(key)
          if (null == listed && !honoured) {
            problems.push('answers against the suite and is not listed: ' +
              key + ' (' + account + ')')
          }
          else if (null != listed && honoured) {
            problems.push('listed, but answers as the suite says: ' + key)
          }
          else if (null != listed && listed[0] !== account) {
            problems.push('listed for ' + listed[0] + ', where the import ' +
              'says ' + account + ': ' + key)
          }
        }
      })
    }
  }
  for (const key of ledger.lines.keys()) {
    if (!seen.has(key)) {
      problems.push('listed, but names no assertion: ' + key)
    }
  }
  if (ledger.bound < ledger.lines.size) {
    problems.push(ledger.lines.size + ' lines, past the bound of ' + ledger.bound)
  }
  return problems
}


// Each case's answer against a ledger of the answers that are not the
// corpus's own: the case's key, the corpus's answer and aontu's.
function answerProblems(ledger: Ledger, cases: [string, string, string][]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const [key, own, answer] of cases) {
    Assert.ok(!seen.has(key), 'a case named twice: ' + key)
    seen.add(key)
    const listed = ledger.lines.get(key)
    if (undefined === listed) {
      if (answer !== own) {
        problems.push('answers ' + answer + ' and is not listed: ' + key)
      }
    }
    else if (listed[0] !== answer) {
      problems.push('listed as ' + listed[0] + ', but answers ' + answer + ': ' + key)
    }
    else if (answer === own) {
      problems.push('listed, but answers as the corpus says: ' + key)
    }
  }
  for (const key of ledger.lines.keys()) {
    if (!seen.has(key)) {
      problems.push('listed, but names no case: ' + key)
    }
  }
  if (ledger.bound < ledger.lines.size) {
    problems.push(ledger.lines.size + ' lines, past the bound of ' + ledger.bound)
  }
  return problems
}


// The ranges of a Unicode data file, each with its fields.
function ucdRows(text: string): { lo: number, hi: number, cells: string[] }[] {
  const out: { lo: number, hi: number, cells: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim()
    if ('' !== line) {
      const cells = line.split(';').map((c) => c.trim())
      const [lo, hi] = cells[0].split('..').map((h) => parseInt(h, 16))
      out.push({ lo, hi: hi ?? lo, cells })
    }
  }
  return out
}


// A cell of IdnaTestV2.txt as text: blank is the default, `""` empty,
// and an escaped lone surrogate is a string no Go string can hold.
function idnaCell(cell: string, blank: string): string | undefined {
  if ('' === cell) {
    return blank
  }
  if ('""' === cell) {
    return ''
  }
  let lone = false
  const text = cell.replace(/\\u([0-9A-Fa-f]{4})/g, (_m, h) => {
    const c = parseInt(h, 16)
    lone = lone || (0xd800 <= c && c <= 0xdfff)
    return String.fromCharCode(c)
  })
  return lone ? undefined : text
}


describe('vectors', () => {

  test('json-schema-test-suite', () => {
    const dir = Path.join(VECTORS, 'jsonschema')
    const problems = suiteProblems(Path.join(dir, 'tests'),
      readLedger(Path.join(dir, 'skips.tsv'), 3), remotes())
    Assert.deepStrictEqual(problems, [])
  })

  test('json-schema-test-suite-annotations', () => {
    const dir = Path.join(VECTORS, 'jsonschema')
    const problems = annotationProblems(Path.join(dir, 'annotations', 'tests'),
      readLedger(Path.join(dir, 'annotation-skips.tsv'), 5))
    Assert.deepStrictEqual(problems, [])
  })

  test('ajv-extras', () => {
    const dir = Path.join(VECTORS, 'ajv-extras')
    const problems = suiteProblems(Path.join(dir, 'spec', 'extras'),
      readLedger(Path.join(dir, 'skips.tsv'), 3))
    Assert.deepStrictEqual(problems, [])
  })

  // Each parser case through the instance reader, as `vet` reads data,
  // and through the import's reader, as the import reads a schema.
  test('jsontestsuite', () => {
    const dir = Path.join(VECTORS, 'jsontestsuite')
    const ledger = readLedger(Path.join(dir, 'skips.tsv'), 2)
    const problems: string[] = []
    const seen = new Set<string>()
    for (const file of jsonFiles(Path.join(dir, 'test_parsing'))) {
      const bytes = Fs.readFileSync(Path.join(dir, 'test_parsing', file))
      const instance = 'valid' === vet('any', bytes.toString('utf8'),
        { exactNumbers: true }).verdict
      let text = '\uD800'
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          .decode(bytes)
      }
      catch { }
      const report = importJsonSchema(text)
      const read = !('error' === report.verdict &&
        report.errors![0].message.startsWith('the schema is not JSON'))
      const own = ({ y: 'accept', n: 'refuse' } as any)[file[0]]
      for (const [reader, accepts] of [['instance', instance], ['import', read]]) {
        const key = file + '\t' + reader
        seen.add(key)
        const answer = accepts ? 'accept' : 'refuse'
        const listed = ledger.lines.get(key)
        if (null == listed) {
          if (answer !== own) {
            problems.push('answers ' + answer + ' and is not listed: ' + key)
          }
        }
        else if (listed[0] !== answer) {
          problems.push('listed as ' + listed[0] + ', but answers ' + answer +
            ': ' + key)
        }
        else if (answer === own) {
          problems.push('listed, but answers as the corpus says: ' + key)
        }
      }
    }
    for (const key of ledger.lines.keys()) {
      if (!seen.has(key)) {
        problems.push('listed, but names no case: ' + key)
      }
    }
    if (ledger.bound < ledger.lines.size) {
      problems.push(ledger.lines.size + ' lines, past the bound of ' +
        ledger.bound)
    }
    Assert.deepStrictEqual(problems, [])
  })
  // UTS 46's conformance file through `idn-hostname`. A line whose
  // toUnicode holds a character the mapping table marks NV8 or XV8 is
  // one the file's notes give IDNA2008 to refuse, so it answers invalid;
  // every other line answers as its toAsciiN status says.
  test('idna-test-v2', () => {
    const dir = Path.join(VECTORS, 'idna')
    const strict = new Set<number>()
    for (const r of ucdRows(Fs.readFileSync(Path.join(dir, 'IdnaMappingTable.txt'), 'utf8'))) {
      if ('NV8' === r.cells[3] || 'XV8' === r.cells[3]) {
        for (let c = r.lo; c <= r.hi; c++) {
          strict.add(c)
        }
      }
    }
    const check = formatCheck('idn-hostname') as (s: string) => boolean
    const cases: [string, string, string][] = []
    for (const line of Fs.readFileSync(Path.join(dir, 'IdnaTestV2.txt'), 'utf8').split('\n')) {
      const cell = line.split('#')[0].split(';').map((c) => c.trim())
      const src = idnaCell(cell[0], '')
      if (cell.length < 5 || undefined === src) {
        continue
      }
      const uni = idnaCell(cell[1], src) as string
      const status = '' !== cell[4] ? cell[4] : '' !== cell[2] ? cell[2] : '[]'
      const own = '[]' === status &&
        ![...uni].some((ch) => strict.has(ch.codePointAt(0) as number))
      cases.push([cell[0], own ? 'valid' : 'invalid', check(src) ? 'valid' : 'invalid'])
    }
    Assert.equal(cases.length, 6387)
    Assert.deepStrictEqual(
      answerProblems(readLedger(Path.join(dir, 'skips.tsv'), 1), cases), [])
  })

  // The table both ports read holds what the vendored files say of each
  // code point: its status and mapping under UTS 46, and its IDNA2008
  // property.
  test('idna-table', () => {
    const dir = Path.join(VECTORS, 'idna')
    const hexes = (t: string) => t.split(' ').map((h) => parseInt(h, 16)).join(' ')
    const want: string[] = new Array(0x110000).fill('')
    for (const r of ucdRows(Fs.readFileSync(Path.join(dir, 'IdnaMappingTable.txt'), 'utf8'))) {
      const st = ({ valid: 'V', deviation: 'V', ignored: 'I', mapped: 'M' } as any)[r.cells[1]]
      for (let c = r.lo; c <= r.hi && undefined !== st; c++) {
        want[c] = 'M' === st ? 'M ' + hexes(r.cells[2]) : st
      }
    }
    for (const r of ucdRows(Fs.readFileSync(Path.join(dir, 'Idna2008-16.0.0.txt'), 'utf8'))) {
      const cat = ({ PVALID: 'P', CONTEXTJ: 'J', CONTEXTO: 'O' } as any)[r.cells[1]]
      for (let c = r.lo; c <= r.hi && undefined !== cat; c++) {
        want[c] += '|' + cat
      }
    }
    const got: string[] = new Array(0x110000).fill('')
    let section = ''
    for (const line of Fs.readFileSync(
      Path.join(VECTORS, '..', 'spec', 'files', 'idna.txt'), 'utf8').split('\n')) {
      const [span, ...v] = line.split(' ')
      const [lo, hi] = span.split('-').map((h) => parseInt(h, 16))
      for (let c = lo; c <= (hi ?? lo) && !line.startsWith('@'); c++) {
        got[c] = 'status' === section ? v[0] : 'mapping' === section ?
          'M ' + hexes(v.join(' ')) : 'category' === section ? got[c] + '|' + v[0] : got[c]
      }
      section = line.startsWith('@') ? span.substring(1) : section
    }
    const differ = want.flatMap((w, c) => w === got[c] ? [] : [c.toString(16)])
    Assert.deepStrictEqual(differ.slice(0, 5), [])
  })

  // isemail's corpus through `email`: a category of valid, a DNS warning
  // or RFC 5321 is a mailbox RFC 5321's grammar admits, and any other a
  // text it refuses. The file writes a control character as its symbol,
  // U+2400 on.
  test('isemail', () => {
    const dir = Path.join(VECTORS, 'isemail')
    const xml = Fs.readFileSync(Path.join(dir, 'tests.xml'), 'utf8')
    const entity = (s: string) => s.replace(/&#x([0-9A-Fa-f]+);|&(lt|gt|amp|quot|apos);/g,
      (_m, h, n) => undefined !== h ? String.fromCodePoint(parseInt(h, 16)) :
        ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as any)[n])
    const email = formatCheck('email') as (s: string) => boolean
    const cases: [string, string, string][] = []
    for (const m of xml.matchAll(/<test id="(\d+)">([\s\S]*?)<\/test>/g)) {
      const at = /<address>([\s\S]*?)<\/address>/.exec(m[2])
      const address = [...entity(null == at ? '' : at[1])].map((ch) => {
        const c = ch.codePointAt(0) as number
        return 0x2400 <= c && c <= 0x241f ? String.fromCharCode(c - 0x2400) : ch
      }).join('')
      const category = (/<category>([^<]*)<\/category>/.exec(m[2]) as RegExpExecArray)[1]
      const own = ['ISEMAIL_VALID_CATEGORY', 'ISEMAIL_DNSWARN', 'ISEMAIL_RFC5321']
        .includes(category)
      cases.push([m[1], own ? 'valid' : 'invalid', email(address) ? 'valid' : 'invalid'])
    }
    Assert.equal(cases.length, 164)
    Assert.deepStrictEqual(
      answerProblems(readLedger(Path.join(dir, 'skips.tsv'), 1), cases), [])
  })

  // uritemplate-test through `uri-template`: a template the files expand
  // is valid, and one whose expansion they give as false is not.
  test('uritemplate-test', () => {
    const dir = Path.join(VECTORS, 'uritemplate-test')
    const check = formatCheck('uri-template') as (s: string) => boolean
    const cases: [string, string, string][] = []
    for (const file of ['spec-examples.json', 'spec-examples-by-section.json',
      'extended-tests.json', 'negative-tests.json']) {
      const groups = JSON.parse(Fs.readFileSync(Path.join(dir, file), 'utf8'))
      for (const group of Object.keys(groups)) {
        for (const [template, expanded] of groups[group].testcases) {
          cases.push([file + '\t' + group + '\t' + template,
            false === expanded ? 'invalid' : 'valid',
            check(template) ? 'valid' : 'invalid'])
        }
      }
    }
    Assert.equal(cases.length, 270)
    Assert.deepStrictEqual(
      answerProblems(readLedger(Path.join(dir, 'skips.tsv'), 3), cases), [])
  })
})
