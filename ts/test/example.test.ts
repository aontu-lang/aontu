/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import { expect } from './expect'
import { Unify } from '../dist/unify'
import { Lang } from '../dist/lang'
import { Aontu } from '..'

let lang = new Lang()
const N = (x: string, _ctx?: any) => new Unify(x, lang).res.canon
const A = new Aontu()
const G = (s: string) => A.generate(s)

describe('examples', function() {


  test('pref-examples', () => {
    expect(G('*1 & **2')).equal(1)
    expect(G('*1 & **a')).equal(1)
    expect(() => G('*1 & *a')).throws(/aontu/)
    expect(() => G('*1 & x')).throws(/aontu/)
    expect(() => G('*1&x')).throws(/aontu/)
    expect(() => G('*1|*2|number')).throws(/aontu/)
    expect(() => G('*1|*2|number & 3')).throws(/aontu/)
    expect(G('*1|number & 2')).equal(1)
    expect(G('*1|(number & 2)')).equal(1)
    expect(G('*1|2')).equal(1)
    expect(G('(*1|number) & 2')).equal(2)
    expect(G('*1 & 2')).equal(2)
    expect(G('*1|number & number')).equal(1)
    expect(G('*1|number')).equal(1)
    expect(G('*1')).equal(1)
    expect(G('*1|string & 2')).equal(1)
    expect(G('*1|nil')).equal(1)
    expect(() => G('(*1|string) & 2')).throws(/aontu/)
    expect(G('(*1&2)|(string&2)')).equal(2)
    expect(G('(*1&2)|nil')).equal(2)
    expect(G('*1&2|nil')).equal(2)
    expect(() => G('*2 & *3')).throws(/aontu/)
    expect(G('*2 & **3')).equal(2)
    expect(G('*2|number')).equal(2)
  })


  test('path-examples', () => {
    expect(() => G('a:*1|number,b:*2|number,c:$.a&$.b')).throws(/aontu/)
    expect(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/)
    expect(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/)
    expect(() => G('a:x:number b:$.a')).throws(/aontu/)
    expect(G('a:x:1 b:$.a')).equal({ a: { x: 1 }, b: { x: 1 } })
    expect(N('a:x:number b:$.a b:x:1 c:$.a c:x:2'))
      .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":2}}')

    expect(N('a:type(x:number) b:$.a b:x:1 c:$.a c:x:2'))
      .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":2}}')

    expect(G('a:type({}) a:x:number b:x:$.a.x b:x:1 c:$.a c:x:2'))
      .equal({ b: { x: 1 }, c: { x: 2 } })
    expect(G('a:type(x:number) b:x:$.a.x b:x:1 c:$.a c:x:2'))
      .equal({ b: { x: 1 }, c: { x: 2 } })

    expect(N('a:x:number b:$.a b:x:1 c:$.a'))
      .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":number}}')

    expect(() => G('a:type({}) a:x:number b:$.a b:x:1 c:$.a')).throws(/aontu/)

    expect(G('x:type({}) x:y:1 a:$.x')).equal({ a: { y: 1 } })
    expect(N('a:*1|number,b:*2|number,c:$.a&$.b'))
      .equal('{"a":*1|number,"b":*2|number,"c":*2|*1|number}')

    expect(N('a:x:number b:$.a b:x:1 c:$.a c:x:y'))
      .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":nil}}')
    expect(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/)
    expect(N('a:x:number b:$.a')).equal('{"a":{"x":number},"b":{"x":number}}')

  })


  test('model-examples', () => {
    expect(G('x:type({}) x:{y:number} a:copy($.x) a:{y:1}')).equal({ a: { y: 1 } })
    expect(() => G('x:type({}) x:{y:number} a:copy($.x) a:{}')).throws(/no_gen/)
    expect(G('x:type({}) x:{y?:number} a:copy($.x) a:{}')).equal({ a: {} })
    expect(G('x:type({}) x:{y?:number,z:2} a:copy($.x) a:{}')).equal({ a: { z: 2 } })
    expect(G('x:type({}) x:{y?:number,z:2} a:copy($.x) a:{y:11}')).equal({ a: { y: 11, z: 2 } })
    expect(G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11}')).equal({ a: { y: 11, z: 3 } })
    expect(G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11,z:4}'))
      .equal({ a: { y: 11, z: 4 } })
    expect(() => G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11,z:Z}')).throws(/aontu/)
  })


  test('optionals-examples', () => {
    expect(G('{x?:number,y:Y}')).equal({ y: 'Y' })
    expect(G('{x?:any,y:Y}')).equal({ y: 'Y' })
    expect(() => G('{x:number,y:Y}')).throw(/no_gen/)
    expect(() => G('{x:any,y:Y}')).throw(/no_gen/)

    expect(G('m:{x?:number,y:Y} n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } })
    expect(G('m:{x?:any,y:Y}  n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } })
    expect(() => G('m:{x:number,y:Y} n:$.m')).throw(/no_gen/)
    expect(() => G('m:{x:any,y:Y} n:$.m')).throw(/no_gen/)

    expect(G('m:type({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } })
    expect(G('m:type({x?:any,y:Y}) n:$.m')).equal({ n: { y: 'Y' } })
    expect(() => G('m:type({x:number,y:Y}) n:$.m')).throw(/no_gen/)
    expect(() => G('m:type({x:any,y:Y}) n:$.m')).throw(/no_gen/)

    expect(G('m:hide({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } })
    expect(G('m:hide({x?:any,y:Y}) n:$.m')).equal({ n: { y: 'Y' } })
    expect(() => G('m:hide({x:number,y:Y}) n:$.m')).throw(/no_gen/)
    expect(() => G('m:hide({x:any,y:Y}) n:$.m')).throw(/no_gen/)

    expect(G('m:type({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } })
    expect(G('m:type({x?:any,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } })
    expect(() => G('m:type({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/)
    expect(() => G('m:type({x:any,y:Y}) n:copy($.m)')).throw(/no_gen/)

    expect(G('m:hide({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } })
    expect(G('m:hide({x?:any,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } })
    expect(() => G('m:hide({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/)
    expect(() => G('m:hide({x:any,y:Y}) n:copy($.m)')).throw(/no_gen/)

    expect(G('m:{x?:number,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } })
    expect(G('m:{x?:any,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } })
    expect(() => G('m:{x:number,y:Y} n:move($.m)')).throw(/no_gen/)
    expect(() => G('m:{x:any,y:Y} n:move($.m)')).throw(/no_gen/)

    expect(G('m:close({x?:number,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } })
    expect(G('m:close({x?:any,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } })
    expect(() => G('m:close({x:number,y:Y}) n:move($.m)')).throw(/required/)
    expect(() => G('m:close({x:any,y:Y}) n:move($.m)')).throw(/required/)

  })


  test('optionals-dive-examples', () => {
    expect(G('x?:number,y:Y')).equal({ y: 'Y' })
    expect(G('x?:any,y:Y')).equal({ y: 'Y' })

    expect(G('x:a?:number x:a:1')).equal({ x: { a: 1 } })
    expect(G('x:a?:number')).equal({ x: {} })
    expect(G('x:{a?:number} x:{a:1}')).equal({ x: { a: 1 } })
    expect(G('x:{a?:number}')).equal({ x: {} })

    expect(G('{x:{a?:{b?:number}} x:{a:{b:1}}')).equal({ x: { a: { b: 1 } } })
    expect(G('{x:{a?:{b?:number}} x:{a:{c:2}}')).equal({ x: { a: { c: 2 } } })
    expect(G('{x:{a?:{b?:number}} x:{a:{}}')).equal({ x: {} })
    expect(G('{x:{a?:{b?:number}} x:{c:2}}')).equal({ x: { c: 2 } })
    expect(G('{x:{a?:{b?:number}} x:{}}')).equal({ x: {} })

    expect(G('x:a?:b?:number x:a:b:1')).equal({ x: { a: { b: 1 } } })
    expect(G('x:a?:b?:number x:a:{c:2}')).equal({ x: { a: { c: 2 } } })
    expect(G('x:a?:b?:number x:a:{}')).equal({ x: {} })
    expect(G('x:a?:b?:number x:{c:2}')).equal({ x: { c: 2 } })
    expect(G('x:a?:b?:number x:{}')).equal({ x: {} })

    expect(G('x?:string|number')).equal({})
    expect(G('{x?:string|number}')).equal({})
    expect(G('x:&:y?:string|number x:a:{}')).equal({ x: { a: {} } })
  })


  test('close-examples', () => {
    expect(G('x:close({a:1})')).equal({ x: { a: 1 } })
    expect(() => G('x:close({a:1}) x:{b:2}')).throws(/closed/)

    expect(G('x:open(close({a:1})) x:{b:2}')).equal({ x: { a: 1, b: 2 } })
    expect(() => G('x:close(open({a:1})) x:{b:2}')).throws(/closed/)

    expect(G('x:close({a:number,b?:boolean}), x:{a:1,b:true}')).equal({ x: { a: 1, b: true } })
    expect(G('x:close({a:number,b?:boolean}), x:{a:1}')).equal({ x: { a: 1 } })
    expect(G('x:close({a:number,b?:boolean,c:string}), x:{a:1,c:C}'))
      .equal({ x: { a: 1, c: 'C' } })

    expect(G('x:close({a:1,b:{c:2}}) x:{a:1,b:{d:3}}')).equal({ x: { a: 1, b: { c: 2, d: 3 } } })
  })


  test('move-examples', () => {
    expect(G('x:&:{y:1,k:key()} x:a:z:2 x:c:move($.x.a)'))
      .equal({ x: { c: { z: 2, y: 1, k: 'c' } } })
  })


  test('spread-required-examples', () => {
    expect(() => G('x:&:{m:string} x:a:{}')).throw(/required/)
    expect(() => G('x:&:y:&:{m:string} x:a:y:b:{}')).throw(/required/)
  })


})
