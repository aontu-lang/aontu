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
