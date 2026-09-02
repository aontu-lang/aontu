/* Copyright (c) 2026 Richard Rodger, MIT License */

// The views beyond what the shared rows can reach from an inline
// source: files and includes (the layers panel's document names, the
// ladder's file order, the poset's labels), and a verdict matrix the
// subsumption checker cannot be made to produce. What the two ports
// must AGREE on -- every figure, byte for byte, and every refusal --
// is test/spec/view.tsv; the Go twin of this file is go/view_test.go.

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { view, viewSet } from '../dist/view'
import type { ViewCompare, ViewPosetDoc } from '../dist/view'
import { Provenance } from '../dist/provenance'


const write = (dir: string, name: string, src: string): string => {
  const file = Path.join(dir, name)
  Fs.mkdirSync(Path.dirname(file), { recursive: true })
  Fs.writeFileSync(file, src)
  return file
}


// A RECORDER THAT NAMES A PATH THE DOCUMENT DOES NOT HAVE
// (use-cases/BUGS.md 70, the Go recorder's template ghost), and a
// record nothing contributed to. This port's recorder writes neither,
// so a recorder that does is handed in through the seam.
class Ghostly extends Provenance {
  record(path: string[], a: any, b: any, out: any): void {
    super.record(path, a, b, out)
    const rec: any = this.paths.get(path.join('.'))
    if (0 < rec.conjuncts.length && !this.paths.has('a.ghost')) {
      this.paths.set('a.ghost', {
        conjuncts: [rec.conjuncts[0]], made: new Set(), seen: new Set(),
      } as any)
      this.paths.set('a.empty', {
        conjuncts: [], made: new Set(), seen: new Set(),
      } as any)
    }
  }
}


describe('view', () => {

  // A MULTI-FILE DOCUMENT: the layers panel names the files an include
  // wrote into relative to the entry, and the ladder's rungs sort by
  // file and then by column.
  test('view-over-included-files', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-view-'))
    write(dir, 'lib/base.aon', 'a: {x: **1 & integer, y: 2}\n')
    const entry = write(dir, 'entry.aon',
      '@"./lib/base.aon"\na: {x: *2 & integer, z: 3}\n')
    const src = Fs.readFileSync(entry, 'utf8')
    const trust = { include: 'root', root: dir } as any

    const layers = view(src, { kind: 'layers', path: entry, trust })
    Assert.equal(layers.verdict, 'rendered')
    Assert.match(layers.text as string,
      /^# layers {2}file=entry\.aon {2}documents=2/)
    // The included file is named relative to the entry, in the host's
    // own separator.
    Assert.ok((layers.text as string).includes(Path.join('lib', 'base.aon')),
      layers.text as string)
    Assert.equal(
      view(src, { kind: 'layers', path: entry, trust, maxRows: 1 })
        .errors?.[0].code,
      'view_rows_exceeded')

    // The rank-1 rung first; then the rank-0 rungs by file -- the FULL
    // path, so `<dir>/entry.aon` before `<dir>/lib/base.aon` -- and,
    // within entry.aon's one row, by column.
    const ladder = view(src, { kind: 'ladder', at: '$.a.x', path: entry, trust })
    Assert.equal(ladder.verdict, 'rendered')
    Assert.ok((ladder.text as string).includes(
      'c0["**1<br/>pref | base.aon:1:8"]\n' +
      '  c1["*2<br/>pref | entry.aon:2:8"]\n' +
      '  c2["integer<br/>literal | entry.aon:2:13"]\n' +
      '  c3["integer<br/>literal | base.aon:1:14"]'), ladder.text as string)

    // The poset labels a document by its file, and a further document
    // by its own path.
    const other = write(dir, 'wide.aon',
      'a: {x: integer, y: integer, z: integer}\n')
    const poset = view(src, {
      kind: 'poset', path: entry, trust, profile: 'values',
      docs: [{ src: Fs.readFileSync(other, 'utf8'), path: other }],
    })
    Assert.equal(poset.verdict, 'rendered', poset.text as string)
    Assert.match(poset.text as string,
      /n0\["entry"\]\n {2}n1\["wide"\]\n {2}n0 --> n1$/)
  })


  // No options at all draws the tree; and a document read from nowhere
  // that includes a file by its absolute path names that file as it is.
  test('view-with-no-options-and-an-absolute-include', () => {
    Assert.deepEqual(view('a: 1'),
      { verdict: 'rendered', kind: 'tree', text: '', loss: [] })
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-view-abs-'))
    const lib = write(dir, 'lib.aon', 'b: 2\n')
    // Spelled with forward slashes: a backslash in a string literal is
    // an escape, and a Windows path is full of them.
    const spelled = lib.split(Path.sep).join('/')
    const r = view(`@"${spelled}"\na: 1\n`, {
      kind: 'layers', trust: { include: 'root', root: dir } as any,
    })
    Assert.equal(r.verdict, 'rendered', JSON.stringify(r.errors))
    Assert.match(r.text as string, /^# layers {2}file=- {2}documents=2/)
    Assert.ok((r.text as string).includes('lib.aon'), r.text as string)
  })


  // THE PROVENANCE RECORD CAN NAME A PATH THE DOCUMENT DOES NOT HAVE
  // (use-cases/BUGS.md 70, the Go recorder's template ghost), and a
  // record nothing contributed to. Neither is a row of the panel. This
  // port's recorder writes neither, so a recorder that does is handed
  // in through the seam.
  test('view-layers-skips-paths-the-document-lacks', () => {
    const r = view('a: {b: 1}', { kind: 'layers' }, { provenance: () => new Ghostly() })
    Assert.equal(r.verdict, 'rendered', JSON.stringify(r.errors))
    Assert.doesNotMatch(r.text as string, /ghost|empty/)

    // The same seam through a VIEW DOCUMENT: its one evaluation is the
    // instrumented one, so a layers figure it declares reads this
    // recorder rather than a second run's.
    const set = viewSet('a: {b: 1}\nviews: {l: {kind: layers, out: "l.txt"}}',
      { views: '$.views' }, { provenance: () => new Ghostly() })
    Assert.equal(set.verdict, 'rendered', JSON.stringify(set.errors))
    Assert.doesNotMatch(set.views[0].text as string, /ghost|empty/)
  })


  // A document that does not PARSE has no figure either: the parse
  // failure lands on the collecting context, and is the answer.
  test('view-refuses-a-document-that-does-not-parse', () => {
    const r = view('a: ]', { kind: 'matrix' })
    Assert.equal(r.verdict, 'error')
    Assert.equal(r.errors?.[0].code, 'syntax')
    Assert.deepEqual(r.loss, [])
  })


  // THE VIEW DOCUMENT'S TWO CALLER ERRORS, which the CLI cannot make:
  // it always passes a path. What the declarations MEAN is
  // test/spec/views.tsv.
  test('view-set-needs-the-path-of-its-declarations', () => {
    for (const opts of [undefined, { views: '' }]) {
      const r = viewSet('a: 1', opts)
      Assert.equal(r.verdict, 'error')
      Assert.deepEqual(r.views, [])
      Assert.equal(r.errors?.[0].code, 'view_document_shape')
    }
  })


  // A VERDICT MATRIX THE CHECKER CANNOT BE MADE TO PRODUCE: a chain
  // the closure implies but the checker measured as does_not_subsume
  // is reported as order_intransitive rather than absorbed, and a
  // class label with a line terminator is refused.
  test('view-poset-injected-verdicts', () => {
    const compare: ViewCompare = (g: ViewPosetDoc, s: ViewPosetDoc) => {
      const pair = g.label + s.label
      return 'ab' === pair || 'bc' === pair
        ? { verdict: 'subsumes', code: '' }
        : { verdict: 'does_not_subsume', code: 'compat_narrowed' }
    }
    const docs = [{ src: 'b', name: 'b' }, { src: 'c', name: 'c' }]
    const r = view('a', { kind: 'poset', docs, path: 'a.aon' }, { compare })
    Assert.equal(r.verdict, 'lossy')
    Assert.match(r.text as string, /n1 --> n0\n {2}n2 --> n1$/)
    Assert.deepEqual(r.loss,
      [{ code: 'order_intransitive', count: 1, detail: ['c < a'] }])

    const bad = view('a', {
      kind: 'poset', docs: [{ src: 'b', name: 'b\nc' }], path: 'a.aon',
    }, { compare })
    Assert.equal(bad.verdict, 'error')
    Assert.equal(bad.errors?.[0].code, 'view_line_break')
  })
})
