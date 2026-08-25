"use strict";
/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const ctx_1 = require("../dist/ctx");
const aontu_1 = require("../dist/aontu");
const expect_1 = require("./expect");
const MapVal_1 = require("../dist/val/MapVal");
const PrefVal_1 = require("../dist/val/PrefVal");
const NumberVal_1 = require("../dist/val/NumberVal");
const StringVal_1 = require("../dist/val/StringVal");
const BooleanVal_1 = require("../dist/val/BooleanVal");
const NullVal_1 = require("../dist/val/NullVal");
(0, node_test_1.describe)('val-pref', function () {
    (0, node_test_1.test)('construct', () => {
        // A NUMBER-kind 1 canons as `1.0`: number-kind canon round-trips its
        // kind, so it always carries a fraction or an exponent (an
        // unsuffixed `1` would reparse as an integer).
        let r0 = new PrefVal_1.PrefVal({ peg: new NumberVal_1.NumberVal({ peg: 1 }) });
        (0, expect_1.expect)(r0.canon).equal('*1.0');
        (0, expect_1.expect)(r0.rank).equal(0);
        let r1 = new PrefVal_1.PrefVal({ peg: new StringVal_1.StringVal({ peg: 'a' }) });
        (0, expect_1.expect)(r1.canon).equal('*"a"');
        (0, expect_1.expect)(r1.rank).equal(0);
        let r2 = new PrefVal_1.PrefVal({
            peg: new PrefVal_1.PrefVal({ peg: new BooleanVal_1.BooleanVal({ peg: false }) })
        });
        (0, expect_1.expect)(r2.canon).equal('**false');
        (0, expect_1.expect)(r2.rank).equal(1);
        let r3 = new PrefVal_1.PrefVal({
            peg: new PrefVal_1.PrefVal({
                peg: new PrefVal_1.PrefVal({ peg: new NullVal_1.NullVal({ peg: null }) })
            })
        });
        (0, expect_1.expect)(r3.canon).equal('***null');
        (0, expect_1.expect)(r3.rank).equal(2);
    });
    (0, node_test_1.test)('conjunct', () => {
        let a0 = new aontu_1.Aontu();
        let G = a0.generate.bind(a0);
        (0, expect_1.expect)(G('*1&2')).equal(2);
        (0, expect_1.expect)(G('(*1)&3')).equal(3);
        (0, expect_1.expect)(G('*1&(4)')).equal(4);
        (0, expect_1.expect)(G('(*1&5)')).equal(5);
        (0, expect_1.expect)(G('((*1)&6)')).equal(6);
        (0, expect_1.expect)(G('((*1)&(7))')).equal(7);
        (0, expect_1.expect)(G('(((*1)&(8)))')).equal(8);
        (0, expect_1.expect)(G('12&*1')).equal(12);
        (0, expect_1.expect)(G('13&(*1)')).equal(13);
        (0, expect_1.expect)(G('(14)&*1')).equal(14);
        (0, expect_1.expect)(G('(15&*1)')).equal(15);
        (0, expect_1.expect)(G('(16&(*1))')).equal(16);
        (0, expect_1.expect)(G('((17)&(*1))')).equal(17);
        (0, expect_1.expect)(G('(((18)&(*1)))')).equal(18);
        (0, expect_1.expect)(() => G('21 & *1 & *2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('*1 & 22 & *2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('*1 & *2 & 23')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('24 & **1 & **2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('**1 & 25 & **2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('**1 & **2 & 26')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('(21) & *1 & *2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('(21 & *1) & *2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('(21 & *1 & *2)')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('21 & (*1 & *2)')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('21 & *1 & (*2)')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('((21) & *1 & *2)')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('((21 & *1) & *2)')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('((21 & *1 & *2))')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('(21 & (*1 & *2))')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('(21 & *1 & (*2))')).throws(/Cannot unify/);
        (0, expect_1.expect)(G('31 & *1 & **2')).equal(31);
        (0, expect_1.expect)(G('*1 & 32 & **2')).equal(32);
        (0, expect_1.expect)(G('*1 & **2 & 33')).equal(33);
        (0, expect_1.expect)(G('34&*1&**2&***3')).equal(34);
    });
    (0, node_test_1.test)('func', () => {
        let a0 = new aontu_1.Aontu();
        let G = a0.generate.bind(a0);
        // `lower` answers a FLOAT (`lower(1.1)` is `1.0`), so a float peer
        // overrides and an integer one conflicts: the numeric leaves are
        // disjoint kinds and the gate is the preferred value's own kind.
        (0, expect_1.expect)(G('*lower(1.1)&2.5')).equal(2.5);
        (0, expect_1.expect)(() => G('*lower(1.1)&2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('*lower(1.1)&a')).throws(/Cannot unify/);
    });
    (0, node_test_1.test)('numeric-leaf-override', () => {
        let a0 = new aontu_1.Aontu();
        let G = a0.generate.bind(a0);
        // A preference is a DEFAULT, and a concrete peer OF THE SAME KIND
        // overrides it. That is the whole point: plain `1 & 2` is a
        // conflict, and `*1 & 2` is 2.
        (0, expect_1.expect)(G('x:*1 & 2')).equal({ x: 2 });
        (0, expect_1.expect)(G('x:*1.5 & 2.5')).equal({ x: 2.5 });
        // ACROSS the numeric leaves it is a conflict, since the tower made
        // `integer` and `float` disjoint. This used to override in both
        // directions, because the gate widened to the `number` family --
        // and that is what let `*8080 | integer` accept 3.5, silently
        // widening the documented default idiom (status report §6). One
        // rule in two directions: refusing `*8080 & 3.5` means refusing
        // `*1.0 & 2` as well.
        (0, expect_1.expect)(() => G('x:*1.0 & 2')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('x:*1 & 2.0')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('x:*1 & 2.5')).throws(/Cannot unify/);
        // A peer of another kind is still a conflict, not an override.
        (0, expect_1.expect)(() => G('x:*1 & a')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('x:*1.5 & true')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('x:*a & 1')).throws(/Cannot unify/);
        // A peer that only restates a kind the preferred value already
        // satisfies leaves the preference standing.
        (0, expect_1.expect)(G('x:*1 & integer')).equal({ x: 1 });
        (0, expect_1.expect)(G('x:*1 & number')).equal({ x: 1 });
        (0, expect_1.expect)(G('x:*1.5 & float')).equal({ x: 1.5 });
        (0, expect_1.expect)(G('x:*1.5 & number')).equal({ x: 1.5 });
        // A kind peer from the OTHER leaf is a conflict, where it used to
        // answer the kind and discard a default it could never admit.
        (0, expect_1.expect)(() => G('x:*1 & float')).throws(/Cannot unify/);
        (0, expect_1.expect)(() => G('x:*1.5 & integer')).throws(/Cannot unify/);
        // A preference whose peg is ITSELF a kind constrains nothing, so any
        // peer wins (pinned by test/spec/var.tsv:var-pref-kind-narrow).
        (0, expect_1.expect)(G('x:*integer & a')).equal({ x: 'a' });
        (0, expect_1.expect)(G('x:*float & 1')).equal({ x: 1 });
    });
    /*
      test('parse', () => {
        let p0 = P('.a')
        expect(p0.canon).equal('.a')
        expect(p0).include({
          peg: ['a'],
          pprefix: true,
          absolute: false
        })
    
        // D(P('..a'))
        let p1 = P('..a')
        expect(p1.canon).equal('..a')
        expect(p1).include({
          peg: ['.', 'a'],
          pprefix: true,
          absolute: false
        })
    
        let p2 = P('...a')
        expect(p2.canon).equal('...a')
        expect(p2).include({
          peg: ['.', '.', 'a'],
          pprefix: true,
          absolute: false
        })
    
        let p3 = P('....a')
        expect(p3.canon).equal('....a')
        expect(p3).include({
          peg: ['.', '.', '.', 'a'],
          pprefix: true,
          absolute: false
        })
    
    
        // D(P('.a.b'))
    
        let p4 = P('.a.b')
        expect(p4.canon).equal('.a.b')
        expect(p4).include({
          peg: ['a', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p5 = P('..a.b')
        expect(p5.canon).equal('..a.b')
        expect(p5).include({
          peg: ['.', 'a', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p6 = P('...a.b')
        expect(p6.canon).equal('...a.b')
        expect(p6).include({
          peg: ['.', '.', 'a', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p7 = P('....a.b')
        expect(p7.canon).equal('....a.b')
        expect(p7).include({
          peg: ['.', '.', '.', 'a', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p8 = P('.a..b')
        expect(p8.canon).equal('.a..b')
        expect(p8).include({
          peg: ['a', '.', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p9 = P('.a...b')
        expect(p9.canon).equal('.a...b')
        expect(p9).include({
          peg: ['a', '.', '.', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p10 = P('.a....b')
        expect(p10.canon).equal('.a....b')
        expect(p10).include({
          peg: ['a', '.', '.', '.', 'b'],
          pprefix: true,
          absolute: false
        })
    
        let p11 = P('.a.b.c')
        expect(p11.canon).equal('.a.b.c')
        expect(p11).include({
          peg: ['a', 'b', 'c'],
          pprefix: true,
          absolute: false
        })
    
    
        // D(P('.a.b..c'))
    
        let p12 = P('.a.b..c')
        expect(p12.canon).equal('.a.b..c')
        expect(p12).include({
          peg: ['a', 'b', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p13 = P('.a..b..c')
        expect(p13.canon).equal('.a..b..c')
        expect(p13).include({
          peg: ['a', '.', 'b', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p14 = P('.a..b...c')
        expect(p14.canon).equal('.a..b...c')
        expect(p14).include({
          peg: ['a', '.', 'b', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p15 = P('.a...b...c')
        expect(p15.canon).equal('.a...b...c')
        expect(p15).include({
          peg: ['a', '.', '.', 'b', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p16 = P('.a...b....c')
        expect(p16.canon).equal('.a...b....c')
        expect(p16).include({
          peg: ['a', '.', '.', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p17 = P('.a....b....c')
        expect(p17.canon).equal('.a....b....c')
        expect(p17).include({
          peg: ['a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p18 = P('..a....b....c')
        expect(p18.canon).equal('..a....b....c')
        expect(p18).include({
          peg: ['.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p19 = P('...a....b....c')
        expect(p19.canon).equal('...a....b....c')
        expect(p19).include({
          peg: ['.', '.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p20 = P('....a....b....c')
        expect(p20.canon).equal('....a....b....c')
        expect(p20).include({
          peg: ['.', '.', '.', 'a', '.', '.', '.', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p21 = P('.a.b..c')
        expect(p21.canon).equal('.a.b..c')
        expect(p21).include({
          peg: ['a', 'b', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p22 = P('.a.b...c')
        expect(p22.canon).equal('.a.b...c')
        expect(p22).include({
          peg: ['a', 'b', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p23 = P('.a.b....c')
        expect(p23.canon).equal('.a.b....c')
        expect(p23).include({
          peg: ['a', 'b', '.', '.', '.', 'c'],
          pprefix: true,
          absolute: false
        })
    
        let p24 = P('.a.b.c.d')
        expect(p24.canon).equal('.a.b.c.d')
        expect(p24).include({
          peg: ['a', 'b', 'c', 'd'],
          pprefix: true,
          absolute: false
        })
    
        let p25 = P('.a.b.c..d')
        expect(p25.canon).equal('.a.b.c..d')
        expect(p25).include({
          peg: ['a', 'b', 'c', '.', 'd'],
          pprefix: true,
          absolute: false
        })
    
        let p26 = P('.a..b.c..d')
        expect(p26.canon).equal('.a..b.c..d')
        expect(p26).include({
          peg: ['a', '.', 'b', 'c', '.', 'd'],
          pprefix: true,
          absolute: false
        })
    
        let p27 = P('.a..b..c..d')
        expect(p27.canon).equal('.a..b..c..d')
        expect(p27).include({
          peg: ['a', '.', 'b', '.', 'c', '.', 'd'],
          pprefix: true,
          absolute: false
        })
    
      })
    
    
      test('clone', () => {
    
        let c0 = makeCtx(null, ['x'])
    
        let r0 = new PrefVal({ peg: ['a'], absolute: true }, c0)
        // console.log(r0)
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
        // NOTE: built as VarVal[PrefVal]
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
    
    
      test('key', () => {
        // let s0 = 'a:b:1,c:$.a.b$KEY'
        // let v0 = P(s0)
        // console.log('AAA', v0)
        // expect(v0.canon).equal('{"a":{"b":1},"c":$.a.b$KEY}')
        // expect(G(s0)).equal({ a: { b: 1 }, c: 'a' })
    
    
        // let s1 = 'a:.$KEY'
        // expect(G(s1)).equal({ a: '' })
    
        let s2 = 'a:b:.$KEY'
        expect(G(s2)).equal({ a: { b: 'a' } })
    
        let s3 = 'a:b:c:.$KEY'
        expect(G(s3)).equal({ a: { b: { c: 'b' } } })
    
        let s4 = `
    a: { n: .$KEY, x:1 }
    b: { c: $.a }
    `
        expect(G(s4)).equal({
          a: {
            n: 'a',
            x: 1,
          },
          b: {
            c: {
              n: 'a', // NOTE: correct as `a` tree is a normal tree
              x: 1,
            },
          },
        })
    
        let s5 = `
    a: { &: { n: .$KEY } }
    `
        expect(G(s5)).equal({ a: {} })
    
        let s6 = `
    a: { &: { n: .$KEY } }
    a: { b0: {} }
    `
        expect(G(s6)).equal({ a: { b0: { n: 'b0' } } })
    
    
        let s10 = `
    b: { &: {n:.$KEY} }
    b: { c0: { k:0, m:.$KEY }}
    b: { c1: { k:1 }}
    `
        expect(G(s10))
          .equal({
            b: {
              c0: { n: 'c0', k: 0, m: 'c0' },
              c1: { n: 'c1', k: 1 }
            }
          })
    
        // let v1 = P(s1)
        // console.log('AAA', v0)
        // expect(v0.canon).equal('{"a":{"b":1},"c":$.a.b$KEY}')
        // expect(G(s1)).equal({})
    
      })
    
    
    
      test('pref', () => {
        let ctx = makeCtx()
    
        let d0 = new PrefVal({ peg: ['a'] })
        let d1 = new PrefVal({ peg: ['c'], absolute: true })
        let d2 = new PrefVal({ peg: ['a', 'b'] })
        let d3 = new PrefVal({ peg: ['c', 'd', 'e'], absolute: true })
    
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
    
        expect(d0.unify(TOP, ctx).canon).equal('.a.x')
        expect(TOP.unify(d0, ctx).canon).equal('.a.x')
        expect(d1.unify(TOP, ctx).canon).equal('$.c.x')
        expect(TOP.unify(d1, ctx).canon).equal('$.c.x')
      })
    
    
      test('unify', () => {
        let r1 = new PrefVal({ peg: ['a'] })
        let r2 = new PrefVal({ peg: ['a'] })
    
        let ctx = makeCtx()
        let u12 = r1.unify(r2, ctx)
        // console.log(u12, r1.id, r2.id)
    
        expect(r1).equal(u12)
    
    
        let s0 = `a:$.x,a:$.x,x:1`
        expect(G(s0)).equal({ a: 1, x: 1 })
    
        let s1 = `x:1,a:$.x,a:$.x`
        expect(G(s1)).equal({ a: 1, x: 1 })
    
        let s2 = `a:$.x,a:$.x`
        expect(UC(s2)).equal('{"a":$.x}')
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
        expect(G('.$KEY')).equal('')
        expect(G('k:.$KEY')).equal({ k: '' })
        expect(G('a:k:.$KEY')).equal({ a: { k: 'a' } })
        expect(G('a:b:k:.$KEY')).equal({ a: { b: { k: 'b' } } })
    
        expect(G('k:.$KEY k:string')).equal({ k: '' })
        expect(G('a:k:.$KEY a:k:a')).equal({ a: { k: 'a' } })
        expect(G('a:k:string a:k:.$KEY a:k:a')).equal({ a: { k: 'a' } })
    
        expect(G('&:k:.$KEY')).equal({})
        expect(G('&:k:.$KEY a:{}')).equal({ a: { k: 'a' } })
        expect(G('&:k:.$KEY a:{} b:{}')).equal({ a: { k: 'a' }, b: { k: 'b' } })
    
        expect(G('&:k:a &:p:2 a:{x:11}')).equal({ a: { k: 'a', p: 2, x: 11 } })
    
        // expect(G('&:k:.$KEY &:p:2 a:{x:11}')).equal({ a: { k: 'a', p: 2, x: 11 } })
        expect(G('&:k:key() &:p:2 a:{x:11}')).equal({ a: { k: 'a', p: 2, x: 11 } })
    
        // expect(G('&:k:.$KEY &:p:2 a:{x:11} b:{x:22}'))
        //   .equal({ a: { k: 'a', p: 2, x: 11 }, b: { k: 'b', p: 2, x: 22 } })
    
        expect(G('&:k:key() &:p:2 a:{x:11} b:{x:22}'))
          .equal({ a: { k: 'a', p: 2, x: 11 }, b: { k: 'b', p: 2, x: 22 } })
    
        expect(G('a:&:n:.$KEY a:b:{}'))
          .equal({ a: { b: { n: 'b' } } })
        expect(G('a:&:b:&:n:.$KEY a:x:b:y:{}'))
          .equal({ a: { x: { b: { y: { n: 'y' } } } } })
    
        expect(G('&:n:.$KEY a:{}'))
          .equal({ a: { n: 'a' } })
        expect(G('&:a:&:n:.$KEY x:{a:{y:{}}}'))
          .equal({ x: { a: { y: { n: 'y' } } } })
    
        expect(G('a:&:k:.$KEY a:b:{}')).equal({ a: { b: { k: 'b' } } })
        expect(G('a:&:k:.$KEY a:b:{c:1} x:&:k:.$KEY x:y:{d:2}'))
          .equal({ a: { b: { k: 'b', c: 1 } }, x: { y: { k: 'y', d: 2 } } })
    
        expect(G('a:&:k:.$KEY a:b:{c:1} x:$.a x:y:{d:2}')).equal({
          a: { b: { c: 1, k: 'b' } },
          x: { b: { c: 1, k: 'b' }, y: { d: 2, k: 'y' } }
        })
    
        expect(G(`
    q: &: { n: .$KEY, m: &: { k: .$KEY } }
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
    
        expect(G(`
    a: b: c: d: e: $.a.b.f
    
    a: b: f: &: {
       n: .$KEY
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
              c: {
                d: { e: { x: { k: 'K', s: 'S', n: 'x', p: true } } }
              },
              f: { x: { k: 'K', s: 'S', n: 'x', p: true } }
            }
          }
        })
        })
        */
});
function makeCtx(r, p) {
    return new ctx_1.AontuContext({
        root: r || new MapVal_1.MapVal({ peg: {} }),
        // path: p
    });
}
//# sourceMappingURL=val-pref.test.js.map