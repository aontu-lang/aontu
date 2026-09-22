/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { format, unifiedDiff } from '../dist/aontu'
import { AONTU_SOURCES, AONTU_MODELS } from '../dist/aontumodel'


// The repository root, found from wherever the compiled test runs.
function repoRoot(): string {
  let dir = __dirname
  while (!Fs.existsSync(Path.join(dir, 'test', 'spec'))) {
    dir = Path.dirname(dir)
  }
  return dir
}

function aonFiles(dir: string, out: string[] = []): string[] {
  for (const name of Fs.readdirSync(dir).sort()) {
    const path = Path.join(dir, name)
    if (Fs.statSync(path).isDirectory()) {
      aonFiles(path, out)
    }
    else if (name.endsWith('.aontu')) {
      out.push(path)
    }
  }
  return out
}


describe('format', () => {

  test('format-reports-what-changed', () => {
    const same: any = format('a: 1\n')
    Assert.equal(same.verdict, 'formatted')
    Assert.equal(same.text, 'a: 1\n')
    Assert.equal(same.changed, false)

    const crlf: any = format('a: 1\r\n')
    Assert.equal(crlf.text, 'a: 1\n')
    Assert.equal(crlf.changed, true)
  })

  // A document that does not parse is not formatted, and the report
  // says why in the finding shape every verb uses, the file named.
  test('format-refuses-a-syntax-error', () => {
    const r: any = format('a: {b\n', { path: 'broken.aontu' })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.errors.length, 1)
    Assert.equal(r.errors[0].code, 'syntax')
    Assert.equal(r.errors[0].class, 'parse')
    Assert.equal(r.errors[0].sites[0].file, 'broken.aontu')

    // A merge-conflict marker is refused before the parse, as
    // everywhere else.
    const m: any = format('<<<<<<< HEAD\na: 1\n=======\na: 2\n>>>>>>> other\n')
    Assert.equal(m.verdict, 'error')
    Assert.equal(m.errors[0].code, 'merge_conflict')
  })

  test('format-refuses-past-the-depth-budget', () => {
    const nest = (n: number) => 'a:' + '{b:'.repeat(n) + '1' + '}'.repeat(n) + '\n'
    const ok: any = format(nest(999))
    Assert.equal(ok.verdict, 'formatted')
    Assert.equal(ok.text, 'a: ' + 'b: '.repeat(999) + '1\n')
    const deep: any = format(nest(1000))
    Assert.equal(deep.verdict, 'error')
    Assert.equal(deep.errors[0].code, 'max_depth')
    Assert.equal(deep.errors[0].class, 'budget')
  })

  test('format-refuses-its-own-defect', () => {
    const r: any = format('a: {b: 1}\n', undefined, { same: () => false })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.errors[0].code, 'format_check')
    Assert.equal(r.errors[0].class, 'internal')
    Assert.equal(r.errors[0].expected, '{"a":{"b":1}}')
    Assert.equal(r.errors[0].actual, 'a: b: 1\n')
    Assert.equal(r.errors[0].note, 'a formatter defect: please report it with the source')

    const named: any = format('a: 1\n', { path: 'doc.aontu' }, { same: () => false })
    Assert.equal(named.errors[0].note,
      'a formatter defect: please report it with the source (doc.aontu)')

    // The hook sees the parsed root and the text about to be written.
    let seen: any
    const ok: any = format('a: 1\n', undefined, {
      same: (root, after) => ((seen = [root.canon, after]), true),
    })
    Assert.equal(ok.verdict, 'formatted')
    Assert.deepEqual(seen, ['{"a":1}', 'a: 1\n'])
  })

  test('format-keeps-the-spelling-the-engine-refuses', () => {
    const seen: string[][] = []
    const keep: any = format('s: a: 1\ns: b: 2\n', undefined, {
      meet: (before, after) => (seen.push([before, after]), false),
    })
    Assert.equal(keep.verdict, 'formatted')
    Assert.equal(keep.text, 's: a: 1\ns: b: 2\n')
    Assert.equal(keep.changed, false)
    Assert.deepEqual(seen, [['s: a: 1\ns: b: 2\n', 's: { a:1 b:2 }\n']])

    const take: any = format('s: a: 1\ns: b: 2\n', undefined, { meet: () => true })
    Assert.equal(take.text, 's: { a:1 b:2 }\n')

    // A statement inside a block is checked at its indentation, and
    // only it keeps its spelling before.
    const W = 'x'.repeat(60)
    const block = 's: {\n  a: 1\n  b: [\n    ' + W + '\n    ' + W + '\n  ]\n'
    seen.length = 0
    const V = 'y'.repeat(70)
    const inner: any = format(block + '  c: { ' + V + ': 1 d: 2 }\n}\n', undefined, {
      meet: (before, after) => (seen.push([before, after]), false),
    })
    Assert.equal(inner.text, block + '  c: {\n    ' + V + ': 1\n    d: 2\n  }\n}\n')
    Assert.deepEqual(seen, [[
      '  c: {\n    ' + V + ': 1\n    d: 2\n  }\n',
      '  c: ' + V + ': 1\n  c: d: 2\n',
    ]])

    const repro = Fs.readFileSync(Path.join(repoRoot(),
      'use-cases', 'repros', 'key-func', 'spread-key-through-deep-ref.aontu'), 'utf8')
    const kept: any = format(repro)
    Assert.ok(kept.text.includes(
      'a: b: c: d: e: $.a.b.f\na: b: f: { &: { n:key() } }\na: b: f: x: {}\n'), kept.text)
  })

  test('format-lints-only-when-asked', () => {
    const src = 'a: 1\r\nHTTP_PORT: 8080\r\n'
    const plain: any = format(src)
    Assert.deepEqual(plain.findings, [])
    const linted: any = format(src, { lint: true })
    // CRLF is read as LF before the lint counts, so the positions are
    // the file's lines.
    Assert.deepEqual(linted.findings, [{
      rule: 'style/key-case', line: 2, col: 1,
      message: 'key HTTP_PORT holds an underscore; httpPort would follow the form',
    }])
    Assert.equal(linted.text, 'a: 1\nHTTP_PORT: 8080\n')
    // A document that does not format has no findings to report.
    Assert.equal('findings' in (format('a: {b', { lint: true }) as any), false)
  })

  test('unified-diff', () => {
    Assert.equal(unifiedDiff('x', 'a\n', 'a\n'), '')
    Assert.equal(unifiedDiff('x', '', ''), '')

    Assert.equal(unifiedDiff('x', 'a\n', 'b\n'),
      '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n')

    // Into an empty file, and out of one.
    Assert.equal(unifiedDiff('x', '', 'a\nb\n'),
      '--- a/x\n+++ b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n')
    Assert.equal(unifiedDiff('x', 'a\n', ''),
      '--- a/x\n+++ b/x\n@@ -1,1 +0,0 @@\n-a\n')

    // A missing final newline is a difference, and is said as diff
    // says it.
    Assert.equal(unifiedDiff('x', 'a', 'a\n'),
      '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+a\n')

    const lines = (n: number) => Array.from({ length: n }, (_, i) => 'line ' + i)
    const before = lines(20).join('\n') + '\n'
    const edited = lines(20)
    edited[2] = 'changed 2'
    edited.splice(17, 0, 'inserted')
    Assert.equal(unifiedDiff('f.aontu', before, edited.join('\n') + '\n'),
      '--- a/f.aontu\n+++ b/f.aontu\n' +
      '@@ -1,6 +1,6 @@\n line 0\n line 1\n-line 2\n+changed 2\n line 3\n line 4\n line 5\n' +
      '@@ -15,6 +15,7 @@\n line 14\n line 15\n line 16\n+inserted\n line 17\n line 18\n line 19\n')

    const a = 'x: {\n  a: 1\n}\ny: {\n  b: 2\n}\n'
    const b = 'x: {\n  a: 1\n  c: 3\n}\ny: {\n  b: 2\n}\n'
    Assert.equal(unifiedDiff('x', a, b),
      '--- a/x\n+++ b/x\n@@ -1,5 +1,6 @@\n x: {\n   a: 1\n+  c: 3\n }\n y: {\n   b: 2\n')

    // Nothing in common at all: everything out, everything in.
    Assert.equal(unifiedDiff('x', 'a\nb\n', 'c\nd\n'),
      '--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d\n')

    // A line that MOVED: the unique lines are out of order across the
    // sides, so the chain keeps one of them and the other is a deletion
    // and an insertion.
    Assert.equal(unifiedDiff('x', 'a\nb\nc\nd\n', 'a\nc\nb\nd\n'),
      '--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@\n a\n-b\n c\n+b\n d\n')
  })

  // THE CORPUS GATE (FMT.0.md §7.5): every document in the repository
  // that parses formats to a fixed point, and every one that does not
  // is refused for its syntax, or its depth, and nothing else.
  test('every-corpus-document-formats-to-a-fixed-point', () => {
    const root = repoRoot()
    const files = [
      ...aonFiles(Path.join(root, 'use-cases')),
      ...aonFiles(Path.join(root, 'test', 'spec', 'files')),
    ]
    Assert.ok(300 < files.length, `too few documents: ${files.length}`)
    const failures: string[] = []
    let formatted = 0
    for (const file of files) {
      const src = Fs.readFileSync(file, 'utf8')
      const r: any = format(src, { path: file })
      const name = Path.relative(root, file)
      if ('error' === r.verdict) {
        if ('syntax' !== r.errors[0].code && 'max_depth' !== r.errors[0].code) {
          failures.push(`${name}: refused with ${r.errors[0].code}`)
        }
        continue
      }
      formatted++
      const again: any = format(r.text, { path: file })
      if ('error' === again.verdict) {
        failures.push(`${name}: the formatted text does not format: ${again.errors[0].code}`)
      }
      else if (again.text !== r.text) {
        failures.push(`${name}: not a fixed point`)
      }
      else if (again.changed) {
        failures.push(`${name}: a fixed point that reports a change`)
      }
    }
    Assert.deepEqual(failures, [], failures.join('\n'))
    Assert.ok(300 < formatted, `too few documents formatted: ${formatted}`)
  })
})


describe('format-bundled-models', () => {
  test('aontu-models-are-fmt-clean-and-lint-clean', () => {
    for (const name of AONTU_MODELS) {
      const src = AONTU_SOURCES[name]
      const report: any = format(src, { lint: true })
      Assert.equal(report.verdict, 'formatted', name)
      Assert.equal(report.text, src, name + ' is not in the form aontu fmt writes')
      Assert.equal(report.changed, false, name)
      Assert.deepEqual(report.findings, [], name + ' has lint findings')
    }
    Assert.deepEqual(AONTU_MODELS, [
      'aontu:lang/markdown',
      'aontu:lang/text',
      'aontu:profile',
      'aontu:system',
      'aontu:view',
    ])
  })
})
