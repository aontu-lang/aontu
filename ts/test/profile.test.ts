/* Copyright (c) 2026 Richard Rodger, MIT License */


import { test, describe } from 'node:test'
import Assert from 'node:assert'

import { loadProfile } from '../dist/profile'


describe('load-profile', () => {

  // The options are optional: `loadProfile(src)` alone reads the
  // document under the defaults, which is how an embedder calls it.
  test('load-profile-takes-no-options-and-fills-the-defaults', () => {
    const loaded = loadProfile('aontu: Lang: lang: "text"')
    Assert.strictEqual(loaded.errors, undefined)
    Assert.strictEqual(loaded.profile.lang, 'text')
    Assert.deepStrictEqual(loaded.profile.indent, { unit: ' ', width: 2 })
    Assert.strictEqual(loaded.profile.template, undefined)
  })

  test('a-profile-that-does-not-stand-up-is-refused', () => {
    for (const [src, code, path] of [
      ['a: ]', 'syntax', '$'],
      ['nil', 'literal_nil', '$'],
      ['aontu: Lang: lang: 1', 'constraint', '$.aontu.Lang.lang'],
      ['x: 1', 'mapval_required', '$.aontu.Lang.lang'],
    ]) {
      const refused = loadProfile(src)
      Assert.strictEqual(refused.profile, undefined, src)
      Assert.strictEqual(refused.errors?.[0].code, code, src)
      Assert.strictEqual(refused.errors?.[0].path, path, src)
    }
  })

  // THE LOWERING HALF IS NOT HERE (ADR-038). `lowering`, `str`,
  // `ident`, `types` and `banner` were the renderer's, and the
  // vocabulary is closed, so each is an unknown key now.
  test('the-lowering-keys-are-unknown', () => {
    for (const key of ['lowering: "go"', 'str: { quote: "\'" }',
      'ident: { chars: "ascii-word" }', 'types: { prim: {} }', 'banner: "x"']) {
      const refused = loadProfile('aontu: Lang: { lang: "go", ' + key + ' }')
      Assert.strictEqual(refused.profile, undefined, key)
      Assert.strictEqual(refused.errors?.[0].code, 'closed', key)
    }
  })

  test('the-template-block-is-what-survives', () => {
    const loaded = loadProfile(
      'aontu: Lang: { lang: "ocaml", template: ' +
      '{ marker: "(*-", close: "*)", ext: ["ml", "mli"] } }')
    Assert.strictEqual(loaded.errors, undefined)
    Assert.deepStrictEqual(loaded.profile.template,
      { marker: '(*-', close: '*)', ext: ['ml', 'mli'] })
  })
})
