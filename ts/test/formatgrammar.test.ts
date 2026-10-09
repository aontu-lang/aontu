/* Copyright (c) 2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import * as Assert from 'node:assert'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { FORMAT_GRAMMARS, FORMAT_LIBRARY } from '../dist/formatgrammars'
import { readGrammar, recognise, formatOf, FORMAT_STEP_MAX } from '../dist/formatgrammar'
import { Aontu } from '../dist/aontu'


const DIR = Path.join(__dirname, '..', '..', 'grammar', 'format')


describe('formatgrammar', () => {

  test('the staged copies are the committed grammars', () => {
    const read = (at: string) => Fs.readFileSync(at, 'utf8').replaceAll('\r\n', '\n')
    const want = new Map<string, string[]>()
    let lib: string[] = []
    for (const e of Fs.readdirSync(DIR, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      if (e.isFile()) {
        want.set(e.name.slice(0, -5), [read(Path.join(DIR, e.name))])
        continue
      }
      const main = e.name + '.abnf'
      const names = Fs.readdirSync(Path.join(DIR, e.name)).sort((a, b) =>
        a === main ? -1 : b === main ? 1 : a < b ? -1 : 1)
      const texts = names.map((n) => read(Path.join(DIR, e.name, n)))
      if ('lib' === e.name) {
        lib = texts
      }
      else {
        want.set(e.name, texts)
      }
    }
    Assert.deepEqual([...FORMAT_GRAMMARS.keys()], [...want.keys()])
    for (const [name, texts] of want) {
      Assert.deepEqual(FORMAT_GRAMMARS.get(name), texts, name + ' is stale: run `make formats`')
    }
    Assert.equal(FORMAT_LIBRARY, lib.join('\n'), 'lib/ is stale: run `make formats`')
  })

  test('every committed grammar passes the determinism check', () => {
    for (const [name, texts] of FORMAT_GRAMMARS) {
      for (const text of texts) {
        const [g, code, why] = readGrammar(text, true)
        Assert.ok(undefined !== g, name + ': ' + code + ' ' + why)
      }
      Assert.equal(formatOf(name)[0]?.gs?.length, texts.length)
    }
  })

  test('a grammar is read once', () => {
    Assert.equal(readGrammar('v = "a"'), readGrammar('v = "a"'))
  })

  test('the step bound refuses a string too long for it', () => {
    const [g] = readGrammar('v = *"a"')
    Assert.equal(recognise(g as any, 'a'.repeat(FORMAT_STEP_MAX)), undefined)
    Assert.equal(recognise(g as any, 'a'.repeat(1000)), -1)
  })

  test('a string past the step bound is refused, never admitted', () => {
    const a = new Aontu({})
    const src = 'a: format("v = *\\"a\\"") & "' + 'a'.repeat(FORMAT_STEP_MAX) + '"'
    Assert.throws(() => a.generate(src, undefined, a.ctx()),
      (e: any) => 'parse_failed' === e.errs()[0].why &&
        String(e.errs()[0].msg).includes('format v: the step bound of 1000000 is reached'))
  })

})
