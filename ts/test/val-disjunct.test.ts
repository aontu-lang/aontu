/* Copyright (c) 2020-2023 Richard Rodger and other contributors, MIT License */


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
import { MapVal } from '../dist/val/MapVal'

import {
  top
} from '../dist/val/top'

const TOP = top()



const lang = new Lang()
const PL = lang.parse.bind(lang)
const P = (x: string, ctx?: any) => PL(x, ctx)
const UC = (s: string, r?: any) => (r = P(s)).unify(TOP, makeCtx(r)).canon
const G = (x: string, ctx?: any) => new Unify(x, lang).res.gen(ctx)




describe('val-disjunct', function() {


  test('basic', () => {
    let u0 = UC('a:{x:1}|{y:2},a:{z:3}')
    expect(u0).equal('{"a":{"x":1,"z":3}|{"y":2,"z":3}}')

    let u1 = UC('a:{x:1}|{y:2},a:{z:3}|{q:4}')
    expect(u1)
      .equal('{"a":{"x":1,"z":3}|{"y":2,"z":3}|{"q":4,"x":1}|{"q":4,"y":2}}')

    let u2a = UC('a:*1|*1|number')
    expect(u2a).equal('{"a":*1|number}')

    let u2 = UC('a:*1|number,a:*2|number')
    expect(u2).equal('{"a":*2|*1|number}')

    // TODO: fix syntax (*...) !!!
    // let u3 = UC('(*1|number) & (*2|number)')
    // expect(u3).equal('*2|*1|number')

    let u4 = UC('(number|*1) & (number|*2)')
    expect(u4).equal('number|*1|*2')


    let g0 = G('{&:{x:*1|number},a:{},b:{x:2}}')
    expect(g0).equal({ a: { x: 1 }, b: { x: 2 } })

    let g1 = G('&:{x:*1|number},a:{},b:{x:2}')
    expect(g1).equal({ a: { x: 1 }, b: { x: 2 } })
  })


  test('clone', () => {
    let v0 = P('{x:1}|{y:2}|{z:3}')
    // console.log(v0.canon)
    expect(v0.canon).equal('({"x":1}|{"y":2})|{"z":3}')

    let ctx = makeCtx(v0)
    let v0c = v0.clone(ctx)
    expect(v0c.canon).equal('({"x":1}|{"y":2})|{"z":3}')
  })

})


function makeCtx(r?: any) {
  return new AontuContext({ root: r || new MapVal({ peg: {} }) })
}
