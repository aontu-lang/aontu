/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'

import {
  Lang
} from '../dist/lang'

import {
  Unify,
} from '../dist/unify'

import {
  AontuContext,
} from '../dist/ctx'


import { expect } from './expect'
import { top } from '../dist/val/top'
import { MapVal } from '../dist/val/MapVal'
import { RefVal } from '../dist/val/RefVal'


const lang = new Lang()
const PL = lang.parse.bind(lang)
const P = (x: string, ctx?: any) => PL(x, ctx)
const UC = (s: string, r?: any) => (r = P(s)).unify(TOP, makeCtx(r)).canon
const G = (x: string, ctx?: any) => new Unify(x, lang).res.gen(ctx)

const TOP = top()


describe('val-ref', function() {

  test('construct', () => {
    let r0 = new RefVal({ peg: [], absolute: true })
    expect(r0.canon).equal('$')
    expect(r0).include({
      path: [],
      absolute: true,
      peg: []
    })


    let r1 = new RefVal({ peg: ['a'], absolute: true })
    expect(r1.canon).equal('$.a')
    expect(r1).include({
      path: [],
      absolute: true,
      peg: ['a']
    })


    let r2 = new RefVal({ peg: ['a', 'b'], absolute: true })
    expect(r2.canon).equal('$.a.b')
    expect(r2).include({
      path: [],
      absolute: true,
      peg: ['a', 'b']
    })

    let r3 = new RefVal({ peg: ['a'] })
    // console.log(r0)
    expect(r3.canon).equal('.a')
    expect(r3).include({
      path: [],
      absolute: false,
      peg: ['a']
    })

    let r4 = new RefVal({ peg: ['a', 'b'] })
    // console.log(r0)
    expect(r4.canon).equal('.a.b')
    expect(r4).include({
      path: [],
      absolute: false,
      peg: ['a', 'b']
    })

    let r5 = new RefVal({ peg: ['a', 'b', 'c'] })
    // console.log(r0)
    expect(r5.canon).equal('.a.b.c')
    expect(r5).include({
      path: [],
      absolute: false,
      peg: ['a', 'b', 'c']
    })

    let r6 = new RefVal({ peg: ['a', 'b', 'c'], absolute: true })
    // console.log(r0)
    expect(r6.canon).equal('$.a.b.c')
    expect(r6).include({
      path: [],
      absolute: true,
      peg: ['a', 'b', 'c']
    })

    let r7 = new RefVal({ peg: [] })
    expect(r7.canon).equal('')
    expect(r7).include({
      path: [],
      absolute: false,
      peg: []
    })


    let r8 = new RefVal({
      peg: [
        new RefVal({ peg: ['a'] }),
        'b'
      ]
    })
    expect(r8.canon).equal('.a.b')
    expect(r8).include({
      path: [],
      absolute: false,
      peg: ['a', 'b']
    })


    let r9 = new RefVal({
      peg: [
        'a',
        new RefVal({ peg: ['b'] }),
      ]
    })
    expect(r9.canon).equal('.a.b')
    expect(r9).include({
      path: [],
      absolute: false,
      peg: ['a', 'b']
    })


    let r10 = new RefVal({
      peg: [
        new RefVal({ peg: ['a'] }),
        new RefVal({ peg: ['b'] }),
      ]
    })
    expect(r10.canon).equal('.a.b')
    expect(r10).include({
      path: [],
      absolute: false,
      peg: ['a', 'b']
    })


    let r11 = new RefVal({
      peg: [
        new RefVal({ peg: ['a'], absolute: true }),
        'b'
      ]
    })
    expect(r11.canon).equal('$.a.b')
    expect(r11).include({
      // canon: '$.a.b',
      path: [],
      absolute: true,
      peg: ['a', 'b']
    })


    let r12 = new RefVal({
      peg: [
        'a',
        new RefVal({ peg: ['b'], absolute: true }),
      ]
    })
    expect(r12.canon).equal('$.a.b')
    expect(r12).include({
      // canon: '$.a.b',
      path: [],
      absolute: true,
      peg: ['a', 'b']
    })


    let r13 = new RefVal({
      peg: [
        new RefVal({ peg: ['a'], absolute: true }),
        new RefVal({ peg: ['b'], absolute: true }),
      ]
    })
    expect(r13.canon).equal('$.a.b')
    expect(r13).include({
      path: [],
      absolute: true,
      peg: ['a', 'b']
    })
  })


  test('parse', () => {
    let p0 = P('.a')
    expect(p0.canon).equal('.a')
    expect(p0).include({
      peg: ['a'],
      prefix: true,
      absolute: false
    })

    // D(P('..a'))
    let p1 = P('..a')
    expect(p1.canon).equal('..a')
    expect(p1).include({
      peg: ['.', 'a'],
      prefix: true,
      absolute: false
    })

    let p2 = P('...a')
    expect(p2.canon).equal('...a')
    expect(p2).include({
      peg: ['.', '.', 'a'],
      prefix: true,
      absolute: false
    })

    let p3 = P('....a')
    expect(p3.canon).equal('....a')
    expect(p3).include({
      peg: ['.', '.', '.', 'a'],
      prefix: true,
      absolute: false
    })


    // D(P('.a.b'))

    let p4 = P('.a.b')
    expect(p4.canon).equal('.a.b')
    expect(p4).include({
      peg: ['a', 'b'],
      prefix: true,
      absolute: false
    })

    let p5 = P('..a.b')
    expect(p5.canon).equal('..a.b')
    expect(p5).include({
      peg: ['.', 'a', 'b'],
      prefix: true,
      absolute: false
    })

    let p6 = P('...a.b')
    expect(p6.canon).equal('...a.b')
    expect(p6).include({
      peg: ['.', '.', 'a', 'b'],
      prefix: true,
      absolute: false
    })

    let p7 = P('....a.b')
    expect(p7.canon).equal('....a.b')
    expect(p7).include({
      peg: ['.', '.', '.', 'a', 'b'],
      prefix: true,
      absolute: false
    })

    let p8 = P('.a..b')
    expect(p8.canon).equal('.a..b')
    expect(p8).include({
      peg: ['a', '.', 'b'],
      prefix: true,
      absolute: false
    })

    let p9 = P('.a...b')
    expect(p9.canon).equal('.a...b')
    expect(p9).include({
      peg: ['a', '.', '.', 'b'],
      prefix: true,
      absolute: false
    })

    let p10 = P('.a....b')
    expect(p10.canon).equal('.a....b')
    expect(p10).include({
      peg: ['a', '.', '.', '.', 'b'],
      prefix: true,
      absolute: false
    })

    let p11 = P('.a.b.c')
    expect(p11.canon).equal('.a.b.c')
    expect(p11).include({
      peg: ['a', 'b', 'c'],
      prefix: true,
      absolute: false
    })


    // D(P('.a.b..c'))

    let p12 = P('.a.b..c')
    expect(p12.canon).equal('.a.b..c')
    expect(p12).include({
      peg: ['a', 'b', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p13 = P('.a..b..c')
    expect(p13.canon).equal('.a..b..c')
    expect(p13).include({
      peg: ['a', '.', 'b', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p14 = P('.a..b...c')
    expect(p14.canon).equal('.a..b...c')
    expect(p14).include({
      peg: ['a', '.', 'b', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p15 = P('.a...b...c')
    expect(p15.canon).equal('.a...b...c')
    expect(p15).include({
      peg: ['a', '.', '.', 'b', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p16 = P('.a...b....c')
    expect(p16.canon).equal('.a...b....c')
    expect(p16).include({
      peg: ['a', '.', '.', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p17 = P('.a....b....c')
    expect(p17.canon).equal('.a....b....c')
    expect(p17).include({
      peg: ['a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p18 = P('..a....b....c')
    expect(p18.canon).equal('..a....b....c')
    expect(p18).include({
      peg: ['.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p19 = P('...a....b....c')
    expect(p19.canon).equal('...a....b....c')
    expect(p19).include({
      peg: ['.', '.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p20 = P('....a....b....c')
    expect(p20.canon).equal('....a....b....c')
    expect(p20).include({
      peg: ['.', '.', '.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p21 = P('.a.b..c')
    expect(p21.canon).equal('.a.b..c')
    expect(p21).include({
      peg: ['a', 'b', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p22 = P('.a.b...c')
    expect(p22.canon).equal('.a.b...c')
    expect(p22).include({
      peg: ['a', 'b', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p23 = P('.a.b....c')
    expect(p23.canon).equal('.a.b....c')
    expect(p23).include({
      peg: ['a', 'b', '.', '.', '.', 'c'],
      prefix: true,
      absolute: false
    })

    let p24 = P('.a.b.c.d')
    expect(p24.canon).equal('.a.b.c.d')
    expect(p24).include({
      peg: ['a', 'b', 'c', 'd'],
      prefix: true,
      absolute: false
    })

    let p25 = P('.a.b.c..d')
    expect(p25.canon).equal('.a.b.c..d')
    expect(p25).include({
      peg: ['a', 'b', 'c', '.', 'd'],
      prefix: true,
      absolute: false
    })

    let p26 = P('.a..b.c..d')
    expect(p26.canon).equal('.a..b.c..d')
    expect(p26).include({
      peg: ['a', '.', 'b', 'c', '.', 'd'],
      prefix: true,
      absolute: false
    })

    let p27 = P('.a..b..c..d')
    expect(p27.canon).equal('.a..b..c..d')
    expect(p27).include({
      peg: ['a', '.', 'b', '.', 'c', '.', 'd'],
      prefix: true,
      absolute: false
    })

  })


  test('clone', () => {

    let c0 = makeCtx(null, ['x'])

    let r0 = new RefVal({ peg: ['a'], absolute: true }, c0)
    expect(r0.canon).equal('$.a')
    expect(r0).include({
      path: ['x'],
      absolute: true,
      peg: ['a']
    })

    let r1 = r0.clone(c0)
    expect(r1.canon).equal('$.a')
    expect(r1).include({
      path: ['x'],
      absolute: true,
      peg: ['a']
    })

    let c1 = makeCtx(null, ['y', 'z'])
    let r2 = r0.clone(c1)
    expect(r2.canon).equal('$.a')
    expect(r2).include({
      path: ['y', 'z'],
      absolute: true,
      peg: ['a']
    })

    let c2 = makeCtx(null, ['k'])
    let r3 = r2.clone(c2)
    expect(r3.canon).equal('$.a')
    expect(r3).include({
      path: ['k', 'z'],
      absolute: true,
      peg: ['a']
    })
  })


  test('absolute', () => {
    // NOTE: built as VarVal[RefVal]
    let s0 = 'a:$.x,x:1'
    let v0 = P(s0)
    expect(v0.peg.a.peg).equal(['x'])
    expect(v0.canon).equal('{"a":$.x,"x":1}')
    expect(G(s0)).equal({ a: 1, x: 1 })

    let s1 = 'a:$.x.y,x:y:1'
    let v1 = P(s1)
    // console.log(v1.peg.a)
    expect(v1.peg.a.peg).equal(['x', 'y'])
    expect(v1.canon).equal('{"a":$.x.y,"x":{"y":1}}')
    expect(G(s1)).equal({ a: 1, x: { y: 1 } })

    let s2 = 'a:$.x.y.z,x:y:z:1'
    let v2 = P(s2)
    // console.log(v0)
    expect(v2.peg.a.peg).equal(['x', 'y', 'z'])
    expect(v2.canon).equal('{"a":$.x.y.z,"x":{"y":{"z":1}}}')
    expect(G(s2)).equal({ a: 1, x: { y: { z: 1 } } })
  })


  test('relative-sibling', () => {
    let s0 = 'a:{b:.c,c:1}'
    let v0 = P(s0)
    // console.log(v0)
    expect(v0.peg.a.peg.b.peg).equal(['c'])
    expect(v0.canon).equal('{"a":{"b":.c,"c":1}}')
    expect(G(s0)).equal({ a: { b: 1, c: 1 } })

    let s1 = 'a:{b:.c.d,c:d:1}'
    let v1 = P(s1)
    // console.log(v0)
    expect(v1.peg.a.peg.b.peg).equal(['c', 'd'])
    expect(v1.canon).equal('{"a":{"b":.c.d,"c":{"d":1}}}')
    expect(G(s1)).equal({ a: { b: 1, c: { d: 1 } } })
  })


  test('relative-parent', () => {
    let s0 = 'a:b:c:1,a:d:e:..b.c'
    let v0 = P(s0)
    expect(v0.peg.a.peg[1].peg.d.peg.e.peg).equal(['.', 'b', 'c'])
    expect(v0.canon).equal('{"a":{"b":{"c":1}}&{"d":{"e":..b.c}}}')
    expect(G(s0)).equal({ a: { b: { c: 1 }, d: { e: 1 } } })

    let s1 = 'a:b:c:1,a:d:e:...a.b.c'
    let v1 = P(s1)
    expect(v1.peg.a.peg[1].peg.d.peg.e.peg).equal(['.', '.', 'a', 'b', 'c'])
    expect(v1.canon).equal('{"a":{"b":{"c":1}}&{"d":{"e":...a.b.c}}}')
    expect(G(s1)).equal({ a: { b: { c: 1 }, d: { e: 1 } } })
  })


  // TRANSLATED FROM `key()`, which is gone (ADR-009). Every reading
  // below is unchanged except s4, and that one is the whole reason the
  // removal is an improvement rather than a rename -- see its note.
  test('key', () => {
    let s2 = 'a:b:key()'
    expect(G(s2)).equal({ a: { b: 'a' } })

    let s3 = 'a:b:c:key()'
    expect(G(s3)).equal({ a: { b: { c: 'b' } } })

    // THE ONE READING THAT CHANGED. Under `key()` this answered 'a' at
    // BOTH sites, and the test carried the note "correct as `a` tree is
    // a normal tree" -- the early-bound reading, fixed at the position
    // the reference was WRITTEN. `key()` is late-bound: `$.a` copies the
    // subtree, and the copy answers for where it LANDED. Same rule that
    // makes key() work under move() and inside a spread template, now
    // reaching a plain reference too. Pinned as ref.tsv's
    // key-under-a-reference-answers-at-the-destination.
    let s4 = `
a: { n: key(), x:1 }
b: { c: $.a }
`
    expect(G(s4)).equal({
      a: {
        n: 'a',
        x: 1,
      },
      b: {
        c: {
          n: 'c',
          x: 1,
        },
      },
    })

    let s5 = `
a: { &: { n: key() } }
`
    expect(G(s5)).equal({ a: {} })

    let s6 = `
a: { &: { n: key() } }
a: { b0: {} }
`
    expect(G(s6)).equal({ a: { b0: { n: 'b0' } } })


    let s10 = `
b: { &: {n:key()} }
b: { c0: { k:0, m:key() }}
b: { c1: { k:1 }}
`
    expect(G(s10))
      .equal({
        b: {
          c0: { n: 'c0', k: 0, m: 'c0' },
          c1: { n: 'c1', k: 1 }
        }
      })
  })



  test('ref', () => {
    let ctx = makeCtx()

    let d0 = new RefVal({ peg: ['a'] })
    let d1 = new RefVal({ peg: ['c'], absolute: true })
    let d2 = new RefVal({ peg: ['a', 'b'] })
    let d3 = new RefVal({ peg: ['c', 'd', 'e'], absolute: true })

    expect(d0.canon).equal('.a')
    expect(d1.canon).equal('$.c')
    expect(d2.canon).equal('.a.b')
    expect(d3.canon).equal('$.c.d.e')

    d0.append('x')
    d1.append('x')
    d2.append('x')
    d3.append('x')

    expect(d0.canon).equal('.a.x')
    expect(d1.canon).equal('$.c.x')
    expect(d2.canon).equal('.a.b.x')
    expect(d3.canon).equal('$.c.d.e.x')

    expect(d0.unify(TOP, ctx).canon).equal('nil')
    expect(TOP.unify(d0, ctx).canon).equal('nil')

    expect(d1.unify(TOP, ctx).canon).equal('nil')
    expect(TOP.unify(d1, ctx).canon).equal('nil')
  })


  test('unify', () => {
    // let r1 = new RefVal({ peg: ['a'] })
    // let r2 = new RefVal({ peg: ['a'] })

    // let ctx = makeCtx()
    // let u12 = r1.unify(r2, ctx)
    // // console.log(u12, r1.id, r2.id)

    // expect(r1).equal(u12)


    let s0 = `a:$.x,a:$.x,x:1`
    expect(G(s0)).equal({ a: 1, x: 1 })

    let s1 = `x:1,a:$.x,a:$.x`
    expect(G(s1)).equal({ a: 1, x: 1 })

    let s2 = `a:$.x,a:$.x`
    expect(UC(s2)).equal('{"a":nil}')
  })



  test('spreadable', () => {
    let g0 = G('a:1 x:{&:{y:$.a}} x:m:q:2 x:n:q:3')
    expect(g0).equal({ a: 1, x: { m: { q: 2, y: 1 }, n: { q: 3, y: 1 } } })


    let g1 = G(`a:x:1 b:&:$.a b:c0:k:0 b:c1:k:1`)
    expect(g1).equal({ a: { x: 1 }, b: { c0: { x: 1, k: 0 }, c1: { x: 1, k: 1 } } })


    let g2 = G(`a:x:1 b:&:{y:2}&$.a b:c0:k:0 b:c1:k:1`)
    expect(g2).equal({
      a: { x: 1 },
      b: {
        c0: { x: 1, k: 0, y: 2 },
        c1: { x: 1, k: 1, y: 2 }
      }
    })


    let g3 = G(`a:x:1 b:&:{}&$.a b:c0:k:0 b:c1:k:1`)
    expect(g3).equal({
      a: { x: 1 },
      b: {
        c0: { x: 1, k: 0 },
        c1: { x: 1, k: 1 }
      }
    })

  })


  test('multi-spreadable', () => {

    expect(P('&:a').canon).equal('{&:"a"}')
    expect(P('&:a:1').canon).equal('{&:{"a":1}}')
    expect(P('&:a:b:1').canon).equal('{&:{"a":{"b":1}}}')
    expect(P('&:a:b:c:1').canon).equal('{&:{"a":{"b":{"c":1}}}}')

    expect(P('&:a&:b').canon).equal('{&:"a"&"b"}')
    expect(P('&:a:1&:b:2').canon).equal('{&:{"a":1}&{"b":2}}')
    expect(P('&:a:b:1&:c:d:2').canon).equal('{&:{"a":{"b":1}}&{"c":{"d":2}}}')
    expect(P('&:a:b:c:1&:d:e:f:3').canon)
      .equal('{&:{"a":{"b":{"c":1}}}&{"d":{"e":{"f":3}}}}')

    expect(P('&:a&:b&:c').canon).equal('{&:"a"&"b"&"c"}')
    expect(P('&:a:1&:b:2&:c:3').canon)
      .equal('{&:{"a":1}&{"b":2}&{"c":3}}')
    expect(P('&:a:b:1&:c:d:2&:e:f:3').canon)
      .equal('{&:{"a":{"b":1}}&{"c":{"d":2}}&{"e":{"f":3}}}')
    expect(P('&:a:b:c:1&:d:e:f:3&:g:h:i:3').canon)
      .equal('{&:{"a":{"b":{"c":1}}}&' +
        '{"d":{"e":{"f":3}}}&{"g":{"h":{"i":3}}}}')

    expect(G('x:&:k:string x:a:k:a x:b:k:b'))
      .equal({ x: { a: { k: 'a' }, b: { k: 'b' } } })
    expect(G('x:&:k:1 x:a:k:1 x:b:k:1'))
      .equal({ x: { a: { k: 1 }, b: { k: 1 } } })
    expect(G('x:&:k:1 x:&:p:2 x:a:{k:1,p:2} x:b:{k:1,p:2}'))
      .equal({ x: { a: { k: 1, p: 2 }, b: { k: 1, p: 2 } } })

    expect(G('&:k:string a:k:a b:k:b'))
      .equal({ a: { k: 'a' }, b: { k: 'b' } })
    expect(G('&:k:1 a:k:1 b:k:1'))
      .equal({ a: { k: 1 }, b: { k: 1 } })
    expect(G('&:k:1 &:p:2 a:{k:1,p:2} b:{k:1,p:2}'))
      .equal({ a: { k: 1, p: 2 }, b: { k: 1, p: 2 } })
  })


  test('multi-spreadable-key', () => {
    const c0 = makeCtx()

    expect(G('key()')).equal('')
    expect(G('k:key()')).equal({ k: '' })
    expect(G('a:k:key()')).equal({ a: { k: 'a' } })
    expect(G('a:b:k:key()')).equal({ a: { b: { k: 'b' } } })

    expect(G('k:key() k:string')).equal({ k: '' })
    expect(G('a:k:key() a:k:a')).equal({ a: { k: 'a' } })
    expect(G('a:k:string a:k:key() a:k:a')).equal({ a: { k: 'a' } })

    expect(G('&:k:key()')).equal({})
    expect(G('&:k:key() a:{}')).equal({ a: { k: 'a' } })
    expect(G('&:k:key() a:{} b:{}')).equal({ a: { k: 'a' }, b: { k: 'b' } })


    expect(G('q:&:k:a q:&:p:2 q:a:{x:11}')).equal({ q: { a: { k: 'a', p: 2, x: 11 } } })
    expect(G('&:k:a &:p:2 a:{x:11}')).equal({ a: { k: 'a', p: 2, x: 11 } })

    expect(G('q:&:k:key() q:&:p:2 q:a:{x:11}', c0)).equal({ q: { a: { k: 'a', p: 2, x: 11 } } })
    expect(G('&:k:key() &:p:2 a:{x:11}', c0)).equal({ a: { k: 'a', p: 2, x: 11 } })

    // expect(G('&:k:key() &:p:2 a:{x:11} b:{x:22}'))
    //   .equal({ a: { k: 'a', p: 2, x: 11 }, b: { k: 'b', p: 2, x: 22 } })

    expect(G('&:k:key() &:p:2 a:{x:11} b:{x:22}'))
      .equal({ a: { k: 'a', p: 2, x: 11 }, b: { k: 'b', p: 2, x: 22 } })

    expect(G('a:&:n:key() a:b:{}'))
      .equal({ a: { b: { n: 'b' } } })
    expect(G('a:&:b:&:n:key() a:x:b:y:{}'))
      .equal({ a: { x: { b: { y: { n: 'y' } } } } })

    expect(G('&:n:key() a:{}'))
      .equal({ a: { n: 'a' } })
    expect(G('&:a:&:n:key() x:{a:{y:{}}}'))
      .equal({ x: { a: { y: { n: 'y' } } } })

    expect(G('a:&:k:key() a:b:{}')).equal({ a: { b: { k: 'b' } } })
    expect(G('a:&:k:key() a:b:{c:1} x:&:k:key() x:y:{d:2}'))
      .equal({ a: { b: { k: 'b', c: 1 } }, x: { y: { k: 'y', d: 2 } } })

    expect(G('a:&:k:key() a:b:{c:1} x:$.a x:y:{d:2}')).equal({
      a: { b: { c: 1, k: 'b' } },
      x: { b: { c: 1, k: 'b' }, y: { d: 2, k: 'y' } }
    })

    expect(G(`
q: &: { n: key(), m: &: { k: key() } }
a: q: $.q
a: q: v: { m: { w:{}, y:{} } }
`)).equal({
      q: {},
      a: {
        q: {
          v: { m: { w: { k: 'w' }, y: { k: 'y' } }, n: 'v' }
        }
      }
    })

    // Pref folding through a spread, read through a reference to a
    // SIBLING subtree. Back at the FOUR levels it was written with:
    // this was shallowed to three while §50 stood, because at four the
    // spread re-applied inside the already-resolved field and
    // TypeScript raised scalar_value at a doubled path
    // ($.a.b.f.x.n.n) where Go answered. Fixed 2026-08-30 by giving a
    // spread template a stable identity across clones, so the bag
    // loops' apply-once mark survives the reference's clone; the depth
    // ladder is pinned in test/spec/gen-key.tsv
    // (key-spread-through-ref-2..5).
    expect(G(`
a: b: c: d: e: $.a.b.f

a: b: f: &: {
   n: key()
   p: *true | boolean
}

a: b: f: {
  x: {
    k: *K | string
    s: S
  }
}
`)).equal({
      a: {
        b: {
          c: { d: { e: { x: { k: 'K', s: 'S', n: 'x', p: true } } } },
          f: { x: { k: 'K', s: 'S', n: 'x', p: true } }
        }
      }
    })
  })
})


function makeCtx(r?: any, p?: string[]) {
  return new AontuContext({
    root: r || new MapVal({ peg: {} }),
    path: p
  })
}
