/* Copyright (c) 2025 Richard Rodger, MIT License */

// The patch API around the shared rows (G7 phase 5, and `--in-place`).
// The report itself is pinned by test/spec/patch.tsv; what is left here
// is what a spec row cannot reach — the options, which carry FILE PATHS,
// and the guards that only fire when the engine's idea of a file and the
// file itself disagree. The Go twin is go/patch_test.go.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import {
  patch, offsetAt, parseAssignment, overlayLine, spanValue,
} from '../dist/patch'


describe('patch', () => {

  // With entryPath and overlayPath given, a finding names those files
  // rather than vet's generic schema/data labels: with two documents
  // that both belong to the caller, "which file" is the whole question.
  test('labels-findings-with-their-files', () => {
    const r = patch('port: 3', '', ['$.port=5'],
      { entryPath: 'sys.aon', overlayPath: 'ov.aon' })
    Assert.strictEqual(r.verdict, 'invalid')
    Assert.ok(0 < r.findings.length)
    const files = r.findings[0].sites.map((s: any) => s.file).join(',')
    Assert.ok(files.includes('sys.aon'), files)
    Assert.ok(files.includes('ov.aon'), files)
  })


  // OFFSET ARITHMETIC, at its edges. Every one of these is a position
  // that does not exist, and the answer to a position that does not
  // exist is -1 — never an offset that happens to be in range.
  test('offsetat-refuses-positions-that-do-not-exist', () => {
    const src = 'ab\ncd\n'
    Assert.strictEqual(offsetAt(src, 1, 1), 0)
    Assert.strictEqual(offsetAt(src, 2, 1), 3)
    Assert.strictEqual(offsetAt(src, 2, 2), 4)
    // One PAST the last character is a position (a splice may end
    // there); two past it is not.
    Assert.strictEqual(offsetAt(src, 3, 1), 6)

    Assert.strictEqual(offsetAt(src, 0, 1), -1, 'row 0')
    Assert.strictEqual(offsetAt(src, 1, 0), -1, 'col 0')
    Assert.strictEqual(offsetAt(src, -1, -1), -1, 'the unsited site')
    Assert.strictEqual(offsetAt(src, 9, 1), -1, 'row past the end')
    Assert.strictEqual(offsetAt('ab', 1, 99), -1, 'col past the end')
  })


  // THE FOREIGN-FILE REFUSAL. An included file's literal is editable,
  // but not by `--overlay <this file>`: the write would land in a
  // document the caller did not name. Needs a real path on disk, which
  // is why it is here and not in the shared rows.
  test('refuses-a-literal-in-an-included-file', () => {
    const Fs = require('node:fs')
    const Os = require('node:os')
    const Path = require('node:path')
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-patch-'))
    const incFile = Path.join(dir, 'inc.aon')
    const ovFile = Path.join(dir, 'ov.aon')
    Fs.writeFileSync(incFile, 'shared: 42\n')
    const overlay = '@"inc.aon"\n'
    Fs.writeFileSync(ovFile, overlay)

    const r = patch('shared: integer', overlay, ['$.shared=7'],
      { inPlace: true, overlayPath: ovFile })

    Assert.deepStrictEqual(r.replaced, [], 'nothing rewritten')
    const codes = r.findings.map((f: any) => f.code)
    Assert.ok(codes.includes('patch_not_editable'), codes.join(','))
    const note = r.findings[0].message
    Assert.ok(note.includes('inc.aon'), note)
    Assert.ok(note.includes('not the overlay'), note)
    // AND THE FILE ON DISK IS UNTOUCHED, which is the point.
    Assert.strictEqual(Fs.readFileSync(incFile, 'utf8'), 'shared: 42\n')
  })


  // THE SPAN VERIFICATION, reached the way it is meant to be: an
  // included literal with NO overlayPath, so the foreign-file guard
  // above cannot fire and the verification is the only thing between
  // the include's coordinates and this file's text.
  test('refuses-a-span-the-overlay-does-not-hold', () => {
    const Fs = require('node:fs')
    const Os = require('node:os')
    const Path = require('node:path')
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-patch-'))
    Fs.writeFileSync(Path.join(dir, 'inc.aon'),
      '# a comment that pushes the literal well down the file\nshared: 42\n')
    const overlay = '@"' + Path.join(dir, 'inc.aon').replace(/\\/g, '/') + '"\n'

    const r = patch('shared: integer', overlay, ['$.shared=7'],
      { inPlace: true })

    Assert.deepStrictEqual(r.replaced, [], 'nothing rewritten')
    Assert.ok(r.findings.map((f: any) => f.code).includes('patch_span_mismatch'),
      r.findings.map((f: any) => f.code).join(','))
  })


  // TWO ASSIGNMENTS AT ONE PATH. The second is the one the author wrote
  // last, so it wins — and the first is DROPPED rather than layered,
  // because splicing the same span twice would write one value inside
  // the other.
  test('last-assignment-at-a-path-wins', () => {
    const r = patch('a: integer', 'a: 1\n', ['$.a=2', '$.a=3'],
      { inPlace: true })
    Assert.strictEqual(r.replaced.length, 1)
    Assert.strictEqual(r.replaced[0].to, '3')
    Assert.strictEqual(r.overlay, 'a: 3\n')
    Assert.strictEqual(r.verdict, 'valid')
  })


  // A malformed assignment is refused before anything is written, and
  // the report says which one. `replaced` is empty rather than absent:
  // an emitter that dropped the field would make the two ports differ.
  test('malformed-assignment-refuses-the-whole-run', () => {
    const r = patch('a: integer', 'a: 1\n', ['$.a=2', 'nonsense'],
      { inPlace: true })
    Assert.strictEqual(r.verdict, 'error')
    Assert.deepStrictEqual(r.replaced, [])
    Assert.deepStrictEqual(r.appended, [])
    Assert.strictEqual(r.overlay, 'a: 1\n', 'the overlay is untouched')
    Assert.strictEqual(r.findings[0].code, 'patch_assignment')
  })


  // WHAT DOES THIS TEXT MEAN ON ITS OWN? The check that makes a splice
  // safe, and the one `role === 'literal'` looks like it makes: a
  // COMPOUND value's site names only its opening token, so `min` must
  // not read as `min(1)`. The Go twin is
  // TestSpanValueSeparatesValuesFromConstraints.
  test('spanvalue-separates-values-from-constraints', () => {
    // A value, and its spelling need not be its canon.
    Assert.deepStrictEqual(spanValue('1'), { canon: '1', concrete: true })
    Assert.deepStrictEqual(spanValue('0x1F'), { canon: '31', concrete: true })
    Assert.deepStrictEqual(spanValue('"s"'), { canon: '"s"', concrete: true })

    // A CONSTRAINT stands alone but is not a pin: appending narrows it,
    // and replacing it would discard what it says.
    Assert.deepStrictEqual(spanValue('integer'),
      { canon: 'integer', concrete: false })
    Assert.deepStrictEqual(spanValue('above(0)'),
      { canon: 'above(0)', concrete: false })
    Assert.deepStrictEqual(spanValue('1|2'), { canon: '1|2', concrete: false })

    // `min` alone is a bare WORD, which is a string — not the call its
    // site was pointing into. The caller compares this canon against
    // the contribution's, so `"min"` against `min(1)` refuses.
    Assert.deepStrictEqual(spanValue('min'), { canon: '"min"', concrete: true })

    // AND THE TEXT THAT DOES NOT STAND ALONE AT ALL: the `$` a
    // reference's site names, and fragments the parser refuses.
    Assert.strictEqual(spanValue('$'), undefined, 'a lone $')
    Assert.strictEqual(spanValue(')'), undefined, 'a lone close')
    Assert.strictEqual(spanValue('"unclosed'), undefined, 'an open string')
    Assert.strictEqual(spanValue('&'), undefined, 'a lone meet')
    Assert.strictEqual(spanValue('@'), undefined, 'a lone include')
  })


  test('assignment-and-line-shapes', () => {
    Assert.strictEqual(parseAssignment('nope'), undefined)
    Assert.strictEqual(parseAssignment('=5'), undefined)
    Assert.strictEqual(parseAssignment('$.a='), undefined)
    Assert.deepStrictEqual(parseAssignment('$.a=5'), { path: '$.a', value: '5' })
    // The value may itself hold `=`: the split is at the FIRST one.
    Assert.deepStrictEqual(parseAssignment('$.a="x=y"'),
      { path: '$.a', value: '"x=y"' })
    Assert.strictEqual(overlayLine('$.a.b', '1'), '"a": "b": 1')
  })
})
