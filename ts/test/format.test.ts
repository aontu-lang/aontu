/* Copyright (c) 2026 Richard Rodger, MIT License */

// THE FORMATTER'S OWN CASES (docs/design/FMT.0.md). What the two ports
// must AGREE on -- the form itself -- is pinned row by row in
// test/spec/fmt.tsv and executed by both spec runners. What is here is
// the rest: the self-check's refusal (reached through the hook, since a
// formatter that is right never takes that arm on its own), the unified
// diff, and the corpus gate -- every document under use-cases/ and
// test/spec/files/ formats to a fixed point.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { format, unifiedDiff } from '../dist/aontu'


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
    else if (name.endsWith('.aon')) {
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

    // Line endings are the checkout's business, not the document's:
    // CRLF formats to LF, and that IS a change.
    const crlf: any = format('a: 1\r\n')
    Assert.equal(crlf.text, 'a: 1\n')
    Assert.equal(crlf.changed, true)
  })

  // A document that does not parse is not formatted, and the report
  // says why in the finding shape every verb uses, the file named.
  test('format-refuses-a-syntax-error', () => {
    const r: any = format('a: {b\n', { path: 'broken.aon' })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.errors.length, 1)
    Assert.equal(r.errors[0].code, 'syntax')
    Assert.equal(r.errors[0].class, 'parse')
    Assert.equal(r.errors[0].sites[0].file, 'broken.aon')

    // A merge-conflict marker is refused before the parse, as
    // everywhere else.
    const m: any = format('<<<<<<< HEAD\na: 1\n=======\na: 2\n>>>>>>> other\n')
    Assert.equal(m.verdict, 'error')
    Assert.equal(m.errors[0].code, 'merge_conflict')
  })

  // THE DEPTH BUDGET: a document nested past the evaluation budget is
  // refused as a finding, in both ports at the same depth, rather than
  // left to whichever port's stack gives out first.
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

  // THE SELF-CHECK. The formatter re-parses what it wrote and compares
  // the two trees; a disagreement is its own defect, so it writes
  // nothing and says so, with both spellings in the finding. The check
  // is injectable because a correct formatter never fails it.
  test('format-refuses-its-own-defect', () => {
    const r: any = format('a: {b: 1}\n', undefined, { same: () => false })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.errors[0].code, 'format_check')
    Assert.equal(r.errors[0].class, 'internal')
    Assert.equal(r.errors[0].expected, '{"a":{"b":1}}')
    Assert.equal(r.errors[0].actual, 'a: b: 1\n')
    Assert.equal(r.errors[0].note, 'a formatter defect: please report it with the source')

    const named: any = format('a: 1\n', { path: 'doc.aon' }, { same: () => false })
    Assert.equal(named.errors[0].note,
      'a formatter defect: please report it with the source (doc.aon)')

    // The hook sees the parsed root and the text about to be written.
    let seen: any
    const ok: any = format('a: 1\n', undefined, {
      same: (root, after) => ((seen = [root.canon, after]), true),
    })
    Assert.equal(ok.verdict, 'formatted')
    Assert.deepEqual(seen, ['{"a":1}', 'a: 1\n'])
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

    // Two changes far apart are two hunks, three lines of context
    // each; the unique lines between them are the anchors.
    const lines = (n: number) => Array.from({ length: n }, (_, i) => 'line ' + i)
    const before = lines(20).join('\n') + '\n'
    const edited = lines(20)
    edited[2] = 'changed 2'
    edited.splice(17, 0, 'inserted')
    Assert.equal(unifiedDiff('f.aon', before, edited.join('\n') + '\n'),
      '--- a/f.aon\n+++ b/f.aon\n' +
      '@@ -1,6 +1,6 @@\n line 0\n line 1\n-line 2\n+changed 2\n line 3\n line 4\n line 5\n' +
      '@@ -15,6 +15,7 @@\n line 14\n line 15\n line 16\n+inserted\n line 17\n line 18\n line 19\n')

    // Lines that repeat on both sides -- closers, blanks -- are no
    // anchors, and the gap between anchors recurses to the plain
    // delete-and-insert.
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
