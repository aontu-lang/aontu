/* Copyright (c) 2026 Richard Rodger, MIT License */

import { describe, test } from 'node:test'
import * as Assert from 'node:assert'

import { Aontu } from '../dist/aontu'


describe('annotation', () => {

  test('gen-preference-generates-without-a-context', () => {
    const root: any = new Aontu().unify('v: *1.255 & gen({significant: 2})')
    Assert.strictEqual(root.peg.v.gen(), 1.3)
  })


  test('gen-float-overflow-is-collected', () => {
    const aontu = new Aontu()
    const ctx = aontu.ctx({ collect: true })
    const out = aontu.generate(
      'v: 1.7976931348623157e308 & gen({significant: 1})', undefined, ctx)
    Assert.strictEqual(out, undefined)
    Assert.strictEqual(ctx.err[0].why, 'float_overflow')
  })


  test('gen-float-overflow-throws-without-a-context', () => {
    const root: any = new Aontu().unify(
      'v: 1.7976931348623157e308 & gen({significant: 1})')
    Assert.throws(() => root.peg.v.gen(), /float_overflow/)
  })


  test('gen-map-generates-without-a-context', () => {
    const root: any = new Aontu().unify(
      'o: {zebraOne: 1, alphaTwo: {} & gen({empty: "omit"})} & gen({keys: "snake"})')
    const out = root.peg.o.gen()
    Assert.deepStrictEqual(Object.keys(out), ['zebra_one'])
  })


  test('gen-written-keys-are-in-their-order', () => {
    const out = new Aontu().generate(
      'o: {b_one: 1, aTwo: 2, "10": 3, "9": 4} & gen({keys: "camel"})')
    Assert.deepStrictEqual(Object.entries(out.o),
      [['9', 4], ['10', 3], ['aTwo', 2], ['bOne', 1]])
    Assert.strictEqual(JSON.stringify(out.o), '{"9":4,"10":3,"aTwo":2,"bOne":1}')
  })


  test('gen-key-clash-throws-without-a-context', () => {
    const root: any = new Aontu().unify('o: {a_b: 1, aB: 2} & gen({keys: "snake"})')
    Assert.throws(() => root.peg.o.gen(), /gen_key_clash/)
  })


  test('gen-key-clash-is-collected', () => {
    const aontu = new Aontu()
    const ctx = aontu.ctx({ collect: true })
    const out = aontu.generate('o: {a_b: 1, aB: 2} & gen({keys: "snake"})', undefined, ctx)
    Assert.strictEqual(out, undefined)
    Assert.strictEqual(ctx.err[0].why, 'gen_key_clash')
    const { written, a, b } = ctx.err[0].details
    Assert.deepStrictEqual([written, a, b], ['a_b', 'aB', 'a_b'])
  })


  test('gen-address-resolves-from-its-own-path-without-a-context', () => {
    const root: any = new Aontu().unify('a: {x: path(..b) & gen({form: "absolute"})}')
    Assert.strictEqual(root.peg.a.peg.x.gen(), '$.b')
  })


  test('gen-plain-generation-reads-the-value', () => {
    const src = 'v: 3.14159 & gen({places: 2, as: "string"}), ' +
      'o: {orderId: "" & gen({empty: "omit"})} & gen({keys: "snake"}), ' +
      'p: {x: path(..b) & gen({form: "key"})}, n: null & gen({empty: "omit"})'
    const aontu = new Aontu()
    const ctx: any = aontu.ctx({})
    ctx.plain = true
    Assert.deepStrictEqual(aontu.generate(src, undefined, ctx),
      { n: null, o: { orderId: '' }, p: { x: '..b' }, v: 3.14159 })
    Assert.deepStrictEqual(aontu.generate(src),
      { o: {}, p: { x: 'b' }, v: '3.14' })
  })


  test('gen-omitted-root-generates-nothing', () => {
    Assert.strictEqual(new Aontu().generate('{} & gen({empty: "omit"})'), undefined)
    Assert.strictEqual(new Aontu().generate('[] & gen({empty: "omit"})'), undefined)
    Assert.deepStrictEqual(new Aontu().generate('{a: 1} & gen({empty: "omit"})'), { a: 1 })
  })


  test('gen-custom-generates-without-a-context', () => {
    const root: any = new Aontu().unify('v: "a" & gen({custom: upper(_)})')
    Assert.strictEqual(root.peg.v.gen(), 'A')
  })


  test('gen-custom-refusal-is-collected', () => {
    const aontu = new Aontu()
    const ctx = aontu.ctx({ collect: true })
    const out = aontu.generate('v: "a" & gen({custom: $.nope + _})', undefined, ctx)
    Assert.strictEqual(out, undefined)
    Assert.strictEqual(ctx.err[0].why, 'gen_custom')
    const { custom, given, cause } = ctx.err[0].details
    Assert.deepStrictEqual([custom, given, cause], ['$.nope+_', '"a"', 'no_path'])
  })


  test('gen-custom-is-not-read-by-a-plain-generation', () => {
    const aontu = new Aontu()
    const ctx: any = aontu.ctx({})
    ctx.plain = true
    Assert.deepStrictEqual(
      aontu.generate('v: "a" & gen({custom: $.nope + _})', undefined, ctx), { v: 'a' })
  })


  // An output a second place could share is made again for that place.
  test('gen-custom-outputs-are-not-shared', () => {
    const out = new Aontu().generate(
      'l: [&: string & gen({custom: {id: _}})], l: ["a", "a"]')
    Assert.deepStrictEqual(out.l, [{ id: 'a' }, { id: 'a' }])
    Assert.notStrictEqual(out.l[0], out.l[1])
  })


  // More distinct inputs than one process keeps the output of.
  test('gen-custom-outputs-are-bounded', () => {
    const src = Array.from({ length: 300 }, (_, i) =>
      `k${i}: "v${i}" & gen({custom: upper(_)})`).join('\n')
    const out = new Aontu().generate(src)
    Assert.strictEqual(out.k0, 'V0')
    Assert.strictEqual(out.k299, 'V299')
    Assert.strictEqual(new Aontu().generate(src).k1, 'V1')
  })


  // More distinct records than one process keeps the reading of.
  test('gen-option-readings-are-bounded', () => {
    const src = Array.from({ length: 300 }, (_, i) =>
      `k${i}: 1.2345678 & gen({significant: ${i + 1}})`).join('\n')
    const out = new Aontu().generate(src)
    Assert.strictEqual(out.k0, 1)
    Assert.strictEqual(out.k2, 1.23)
    Assert.strictEqual(out.k299, 1.2345678)
    Assert.strictEqual(new Aontu().generate(src).k1, 1.2)
  })

})
