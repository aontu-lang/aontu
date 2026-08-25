/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */



import { describe, it } from 'node:test'

import type {
  Val,
} from '../dist/type'

import {
  Lang
} from '../dist/lang'

import {
  Unify,
} from '../dist/unify'

import {
  AontuContext,
} from '../dist/ctx'


import {
  top
} from '../dist/val/top'

const TOP = top()

import { expect } from './expect'
import { MapVal } from '../dist/val/MapVal'
import { srcPath } from './srcpath'

let lang = new Lang()
let P: (s: string, o?: any) => Val = lang.parse.bind(lang)



describe('lang', function() {


  it('happy', () => {
    expect(P('1').canon).equal('1')
    expect(P('a:1').canon).equal('{"a":1}')
    expect(P('{a:{b:x}}').canon).equal('{"a":{"b":"x"}}')

    expect(P('a:11|22,b:33', { xlog: -1 }).canon).equal('{"a":11|22,"b":33}')
    expect(P('a:11|22|33,b:44', { xlog: -1 }).canon).equal('{"a":(11|22)|33,"b":44}')


    expect(P('a:{b:11}|{c:22},b:33', { xlog: -1 }).canon)
      .equal('{"a":{"b":11}|{"c":22},"b":33}')

    expect(P('a:11&22,b:33', { xlog: -1 }).canon).equal('{"a":11&22,"b":33}')
    expect(P('a:11&22&33,b:44', { xlog: -1 }).canon).equal('{"a":(11&22)&33,"b":44}')

    expect(P('a:{b:11}&{c:22},b:33', { xlog: -1 }).canon)
      .equal('{"a":{"b":11}&{"c":22},"b":33}')

    expect(P('a:11&22|33,b:44', { xlog: -1 }).canon).equal('{"a":(11&22)|33,"b":44}')

    expect(P('a:(11|22)&33,b:44', { xlog: -1 }).canon).equal('{"a":(11|22)&33,"b":44}')
  })


  it('parens', () => {
    expect(P('(1)').canon).equal('1')
    expect(P('(1+2)').canon).equal('1+2')
    expect(P('1&2').canon).equal('1&2')
    expect(P('(1&2)').canon).equal('1&2')
    expect(P('(1&2)&3').canon).equal('(1&2)&3')
    expect(P('1&(2&3)').canon).equal('1&(2&3)')
    expect(P('1&(2&3)&4').canon).equal('(1&(2&3))&4')
    expect(P('1&((2&3)&4)').canon).equal('1&((2&3)&4)')
    expect(P('1&2|3').canon).equal('(1&2)|3')
    expect(P('1|2&3').canon).equal('1|(2&3)')
    expect(P('1&(2|3)').canon).equal('1&(2|3)')
    expect(P('(1|2)&3').canon).equal('(1|2)&3')
  })


  it('merge', () => {
    let ctx = makeCtx()

    let v0 = P('a:{x:1},a:{y:2}')
    expect(v0.canon).equal('{"a":{"x":1}&{"y":2}}')

    let u0 = v0.unify(TOP, ctx)
    expect(u0.canon).equal('{"a":{"x":1,"y":2}}')
    expect(u0.gen(ctx)).equal({ a: { x: 1, y: 2 } })


    let v1 = P('a:b:{x:1},a:b:{y:2}')
    expect(v1.canon).equal('{"a":{"b":{"x":1}}&{"b":{"y":2}}}')

    let u1 = v1.unify(TOP, ctx)
    expect(u1.canon).equal('{"a":{"b":{"x":1,"y":2}}}')
    expect(u1.gen(ctx)).equal({ a: { b: { x: 1, y: 2 } } })


    let v2 = P('a:b:c:{x:1},a:b:c:{y:2}')
    expect(v2.canon).equal('{"a":{"b":{"c":{"x":1}}}&{"b":{"c":{"y":2}}}}')

    let u2 = v2.unify(TOP, ctx)
    expect(u2.canon).equal('{"a":{"b":{"c":{"x":1,"y":2}}}}')
    expect(u2.gen(ctx)).equal({ a: { b: { c: { x: 1, y: 2 } } } })


    let v0m = P('a:{x:1},a:{y:2},a:{z:3}')
    expect(v0m.canon).equal('{"a":{"x":1}&{"y":2}&{"z":3}}')

    let u0m = v0m.unify(TOP, ctx)
    expect(u0m.canon).equal('{"a":{"x":1,"y":2,"z":3}}')
    expect(u0m.gen(ctx)).equal({ a: { x: 1, y: 2, z: 3 } })


    let v1m = P('a:b:{x:1},a:b:{y:2},a:b:{z:3}')
    expect(v1m.canon).equal('{"a":{"b":{"x":1}}&{"b":{"y":2}}&{"b":{"z":3}}}')

    let u1m = v1m.unify(TOP, ctx)
    expect(u1m.canon).equal('{"a":{"b":{"x":1,"y":2,"z":3}}}')
    expect(u1m.gen(ctx)).equal({ a: { b: { x: 1, y: 2, z: 3 } } })


    let v2m = P('a:b:c:{x:1},a:b:c:{y:2},a:b:c:{z:3}')
    expect(v2m.canon).equal(
      '{"a":' +
      '{"b":{"c":{"x":1}}}&' +
      '{"b":{"c":{"y":2}}}&' +
      '{"b":{"c":{"z":3}}}}')

    let u2m = v2m.unify(TOP, ctx)
    expect(u2m.canon).equal('{"a":{"b":{"c":{"x":1,"y":2,"z":3}}}}')
    expect(u2m.gen(ctx)).equal({ a: { b: { c: { x: 1, y: 2, z: 3 } } } })


  })


  it('ref', () => {
    let v0 = P('a:.x')
    expect(v0.peg.a.peg).equal(['x'])

    let v1 = P('a:.x.y', { xlog: -1 })
    expect(v1.peg.a.peg).equal(['x', 'y'])
  })


  it('file', () => {
    let ctx = makeCtx()

    if (undefined !== global.window) {
      return
    }

    global.console = require('console')

    let g0 = new Lang({
      // resolver: makeFileResolver((spec: any) => {
      //   return 'string' === typeof spec ? spec : spec?.peg
      // })
      // debug: true,
      // trace: true,
    })

    let t00x = g0.parse('x:@"' + srcPath(__dirname) + '/../test/t00.aon"')
    expect(t00x.canon).equal('{"x":{"a":1}}')

    let t00xA = g0.parse('A:11,x:@"' + srcPath(__dirname) + '/../test/t00.aon"')
    expect(t00xA.canon).equal('{"A":11,"x":{"a":1}}')
    let t00xB = g0.parse('x:@"' + srcPath(__dirname) + '/../test/t00.aon",B:22')
    expect(t00xB.canon).equal('{"B":22,"x":{"a":1}}')
    let t00xAB = g0.parse('A:11,x:@"' + srcPath(__dirname) + '/../test/t00.aon",B:22')
    expect(t00xAB.canon).equal('{"A":11,"B":22,"x":{"a":1}}')

    let t00xAs = g0.parse('A:11 x:@"' + srcPath(__dirname) + '/../test/t00.aon"')
    expect(t00xAs.canon).equal('{"A":11,"x":{"a":1}}')
    let t00xBs = g0.parse('x:@"' + srcPath(__dirname) + '/../test/t00.aon" B:22')
    expect(t00xBs.canon).equal('{"B":22,"x":{"a":1}}')
    let t00xABs = g0.parse('A:11 x:@"' + srcPath(__dirname) + '/../test/t00.aon" B:22')
    expect(t00xABs.canon).equal('{"A":11,"B":22,"x":{"a":1}}')


    let t00v = g0.parse('@"' + srcPath(__dirname) + '/../test/t00.aon"')
    expect(t00v.canon).equal('{}&{"a":1}')
    let t00 = new Unify(t00v)
    expect(t00.res.canon).equal('{"a":1}')
    expect(t00.res.gen(ctx)).equal({ a: 1 })

    let t00vX = g0.parse(' X:11 @"' + srcPath(__dirname) + '/../test/t00.aon"')
    expect(t00vX.canon).equal('{"X":11}&{"a":1}')
    let t00X = new Unify(t00vX)
    expect(t00X.res.canon).equal('{"X":11,"a":1}')
    expect(t00X.res.gen(ctx)).equal({ X: 11, a: 1 })

    let t00vY = g0.parse('@"' + srcPath(__dirname) + '/../test/t00.aon" Y:22 ')
    expect(t00vY.canon).equal('{"Y":22}&{"a":1}')
    let t00Y = new Unify(t00vY)
    expect(t00Y.res.canon).equal('{"Y":22,"a":1}')
    expect(t00Y.res.gen(ctx)).equal({ Y: 22, a: 1 })


    let t00dv = g0.parse('D:{@"' + srcPath(__dirname) + '/../test/t00.aon"}')
    expect(t00dv.canon).equal('{"D":{}&{"a":1}}')
    let t00d = new Unify(t00dv)
    expect(t00d.res.canon).equal('{"D":{"a":1}}')
    expect(t00d.res.gen(ctx)).equal({ D: { a: 1 } })


    let t01v = g0.parse('@"' + srcPath(__dirname) + '/../test/t01.aontu"')
    expect(t01v.canon).equal('{}&{"a":1,"b":{"d":2},"c":3}')

    let t02v = g0.parse('@"' + srcPath(__dirname) + '/../test/t02.aon"')
    expect(t02v.canon).equal('{}&({"x":1}&{"y":2})')


    let t00m = g0.parse(`
    @"` + srcPath(__dirname) + `/../test/t00.aon"
    `)
    expect(t00m.canon).equal('{}&{"a":1}')

    let t01m = g0.parse(`
    @"` + srcPath(__dirname) + `/../test/t00.aon"
    @"` + srcPath(__dirname) + `/../test/t04.aon"
    `)
    expect(t01m.canon).equal('{}&{"a":1}&{"b":2}')

    let t02m = g0.parse(`
    x: 11
    @"` + srcPath(__dirname) + `/../test/t00.aon"
    y: 22
    @"` + srcPath(__dirname) + `/../test/t04.aon"
    z: 33
    `)
    expect(t02m.canon).equal('{"x":11,"y":22,"z":33}&{"a":1}&{"b":2}')


    let t03m = g0.parse(`
    x:y:{}
    @"` + srcPath(__dirname) + `/../test/t00.aon"
    `)
    expect(t03m.canon).equal('{"x":{"y":{}}}&{"a":1}')
  })


  it('conjunct', () => {
    expect(P('1&number').canon).equal('1&number')
    expect(P('number&1').canon).equal('number&1')

    // FIX
    // expect(() => P('*1&number')).throws()
    // expect(() => P('number&*1')).throws()

    expect(P('{a:1}&{b:2}').canon).equal('{"a":1}&{"b":2}')
    expect(P('{a:{c:1}}&{b:{d:2}}').canon).equal('{"a":{"c":1}}&{"b":{"d":2}}')

    // FIX
    // expect(() => P('*1')).throws()
  })


  it('disjunct', () => {
    // FIX
    // expect(() => P('*1')).throws()

    let v0 = P('1|number')
    expect(v0.canon).equal('1|number')

    let v1 = P('*1|number', { xlog: -1 })
    expect(v1.canon).equal('*1|number')

    let v2 = P('integer|*2', { xlog: -1 })
    expect(v2.canon).equal('integer|*2')
  })


  it('precedence', () => {
    let v0 = P('a:b:1&2')
    expect(v0.canon).equal('{"a":{"b":1&2}}')
  })


  it('spreads', () => {
    let ctx = makeCtx()

    let v0 = P('a:{&:{x:1,y:integer},b:{y:1},c:{y:2}}')
    expect(v0.canon).equal('{"a":{&:{"x":1,"y":integer},"b":{"y":1},"c":{"y":2}}}')

    let u0 = v0.unify(TOP, ctx)
    expect(u0.canon)
      .equal('{"a":{&:{"x":1,"y":integer},"b":{"x":1,"y":1},"c":{"x":1,"y":2}}}')

    let v1 = P('k:{x:1,y:integer},a:{&:$.k,b:{y:1},c:{y:2}}')
    expect(v1.canon)
      .equal('{"a":{&:$.k,"b":{"y":1},"c":{"y":2}},"k":{"x":1,"y":integer}}')

    let c1 = makeCtx({ root: v1 })
    let u1a = v1.unify(TOP, c1)

    expect(u1a.canon).
      equal('{"a":{&:$.k,"b":{"x":1,"y":1},"c":{"x":1,"y":2}},' +
        '"k":{"x":1,"y":integer}}')


    let v2 = P('a:{&:number},a:{x:1},a:{y:2}')
    expect(v2.canon).equal('{"a":{&:number}&{"x":1}&{"y":2}}')
    let u2 = v2.unify(TOP, ctx)
    expect(u2.canon).equal('{"a":{&:number,"x":1,"y":2}}')

    let v3 = P('a:{&:number,z:3},a:{x:1},a:{y:2}')
    expect(v3.canon).equal('{"a":{&:number,"z":3}&{"x":1}&{"y":2}}')
    let u3 = v3.unify(TOP, ctx)
    expect(u3.canon).equal('{"a":{&:number,"x":1,"y":2,"z":3}}')

    let v4 = P('b:{a:{&:number,z:3},a:{x:1},a:{y:2}}')
    expect(v4.canon).equal('{"b":{"a":{&:number,"z":3}&{"x":1}&{"y":2}}}')
    let u4 = v4.unify(TOP, ctx)
    expect(u4.canon).equal('{"b":{"a":{&:number,"x":1,"y":2,"z":3}}}')

    // Must commute!

    let v5a = P('{&:{x:1}}&{a:{y:1}}')
    let u5a = v5a.unify(TOP, ctx)
    expect(u5a.canon).equal('{&:{"x":1},"a":{"x":1,"y":1}}')

    let v5b = P('{a:{y:1}}&{&:{x:1}}')
    let u5b = v5b.unify(TOP, ctx)
    expect(u5b.canon).equal('{&:{"x":1},"a":{"x":1,"y":1}}')


    let v6 = P('b:{a:{&:{K:0},z:{Z:3}},a:{x:{X:1}},a:{y:{Y:2}}}')
    expect(v6.canon)
      .equal('{"b":{"a":{&:{"K":0},"z":{"Z":3}}&{"x":{"X":1}}&{"y":{"Y":2}}}}')
    let u6 = v6.unify(TOP, ctx)
    expect(u6.canon)
      .equal('{"b":{"a":{&:{"K":0},' +
        '"x":{"K":0,"X":1},"y":{"K":0,"Y":2},"z":{"K":0,"Z":3}}}}')

  })


  it('pair-spreads', () => {
    let s1 = `a:b:c:1 z:2`
    expect(P(s1).canon).equal('{"a":{"b":{"c":1}},"z":2}')

    let s1_1 = `a:&:b:1 z:2`
    expect(P(s1_1).canon).equal('{"a":{&:{"b":1}},"z":2}')

    let s1_2 = `a:&:{b:1} z:2`
    expect(P(s1_2).canon).equal('{"a":{&:{"b":1}},"z":2}')

    let s1_3 = `a:{&:{b:1}} z:2`
    expect(P(s1_3).canon).equal('{"a":{&:{"b":1}},"z":2}')

    let s1_4 = `{a:{&:{b:1}} z:2}`
    expect(P(s1_4).canon).equal('{"a":{&:{"b":1}},"z":2}')

    let s2 = `a:&:b:&:1 z:2`
    expect(P(s2).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}')

    let s2_1 = `a:&:b:{&:1} z:2`
    expect(P(s2_1).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}')

    let s2_2 = `a:&:{b:{&:1}} z:2`
    expect(P(s2_2).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}')

    let s2_3 = `a:{&:{b:{&:1}}} z:2`
    expect(P(s2_3).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}')

    let s2_4 = `{a:{&:{b:{&:1}}} z:2}`
    expect(P(s2_4).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}')

    let s3 = `a:&:b:&:c:1 z:2`
    expect(P(s3).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}')

    let s4 = `a:&:b:&:{c:1} z:2`
    expect(P(s4).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}')

    let s5 = `a:&:{b:&:c:1} z:2`
    expect(P(s5).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}')

    let s6 = `a:&:{b:&:{c:1}} z:2`
    expect(P(s6).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}')
  })


  it('source', () => {
    P(`
  a: {
  b: {
    c: 1
    d: 2 & 3 
  }
  }
  `)

  })


  it('edge-top-spreads', () => {
    let ctx = makeCtx()

    let v0 = P('a:b &:string')
    expect(v0.canon).equal('{&:string,"a":"b"}')
    expect(v0.gen(ctx)).equal({ a: 'b' })

    let v1 = P(' &:string a:b &:string')
    expect(v1.canon).equal('{&:string&string,"a":"b"}')
    expect(v1.gen(ctx)).equal({ a: 'b' })

    let v2 = P(' &:string &:string a:b &:string')
    expect(v2.canon).equal('{&:string&string&string,"a":"b"}')
    expect(v2.gen(ctx)).equal({ a: 'b' })

    let v3 = P('&:string &:string a:b &:string &:string')
    expect(v3.canon).equal('{&:string&string&string&string,"a":"b"}')
    expect(v3.gen(ctx)).equal({ a: 'b' })

    let v4 = P('a:&:string')
    expect(v4.canon).equal('{"a":{&:string}}')
    expect(v4.gen(ctx)).equal({ a: {} })

    let v5 = P('a:b:c a:d:e')
    expect(v5.canon).equal('{"a":{"b":"c"}&{"d":"e"}}')
    expect(v5.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c', d: 'e' } })

    let v6 = P('a:b:c a:&:string')
    expect(v6.canon).equal('{"a":{"b":"c"}&{&:string}}')
    expect(v6.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c' } })

    let v7 = P('a:&:c a:&:string')
    expect(v7.canon).equal('{"a":{&:"c"}&{&:string}}')
    expect(v7.unify(TOP, makeCtx()).gen(ctx)).equal({ a: {} })

    let v8 = P('a:&:c a:&:string a:b:c')
    expect(v8.canon).equal('{"a":{&:"c"}&{&:string}&{"b":"c"}}')
    expect(v8.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c' } })

    let v9 = P('&:c &:string')
    expect(v9.canon).equal('{&:"c"&string}')
    expect(v9.unify(TOP, makeCtx()).gen(ctx)).equal({})

    let v10 = P('&:b &:string a:b')
    expect(v10.canon).equal('{&:"b"&string,"a":"b"}')
    expect(v10.unify(TOP, makeCtx()).gen(ctx)).equal({ a: 'b' })
  })


  // PARSE-level canon of nested junctions: a junction child that is
  // itself a junction with more than one term is parenthesised
  // (JunctionVal.canon), so the text reparses to the same structure.
  // No spec mode observes parse-level canon (the shared suite is
  // unify-level), so this table is pinned by per-port twins: the Go
  // twin with the SAME rows is TestParseCanonNestedJunctions in
  // go/aontu_test.go. Closes the issue #30 divergence.
  it('parse-canon-nested-junctions', () => {
    const rows: [string, string][] = [
      ['a:(1|2)&3', '{"a":(1|2)&3}'],
      ['a:1|2&3', '{"a":1|(2&3)}'],
      ['a:1&2|3', '{"a":(1&2)|3}'],
      ['a:(1&2)|3', '{"a":(1&2)|3}'],
      ['a:1|2|3', '{"a":(1|2)|3}'],
      ['a:1&2&3', '{"a":(1&2)&3}'],
      ['a:(1|2)&(3|4)', '{"a":(1|2)&(3|4)}'],
      ['a:1&(2|3)&4', '{"a":(1&(2|3))&4}'],
    ]
    for (const [src, canon] of rows) {
      expect(P(src).canon).equal(canon)
    }
  })

})


function makeCtx(opts?: any) {
  return new AontuContext(opts || { root: new MapVal({ peg: {} }) })
}
