"use strict";
/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const expect_1 = require("./expect");
const unify_1 = require("../dist/unify");
const lang_1 = require("../dist/lang");
const __1 = require("..");
let lang = new lang_1.Lang();
const N = (x, _ctx) => new unify_1.Unify(x, lang).res.canon;
const A = new __1.Aontu();
const G = (s) => A.generate(s);
(0, node_test_1.describe)('examples', function () {
    (0, node_test_1.test)('pref-examples', () => {
        (0, expect_1.expect)(G('*1 & **2')).equal(1);
        (0, expect_1.expect)(G('*1 & **a')).equal(1);
        (0, expect_1.expect)(() => G('*1 & *a')).throws(/aontu/);
        (0, expect_1.expect)(() => G('*1 & x')).throws(/aontu/);
        (0, expect_1.expect)(() => G('*1&x')).throws(/aontu/);
        (0, expect_1.expect)(() => G('*1|*2|number')).throws(/aontu/);
        (0, expect_1.expect)(() => G('*1|*2|number & 3')).throws(/aontu/);
        (0, expect_1.expect)(G('*1|number & 2')).equal(1);
        (0, expect_1.expect)(G('*1|(number & 2)')).equal(1);
        (0, expect_1.expect)(G('*1|2')).equal(1);
        (0, expect_1.expect)(G('(*1|number) & 2')).equal(2);
        (0, expect_1.expect)(G('*1 & 2')).equal(2);
        (0, expect_1.expect)(G('*1|number & number')).equal(1);
        (0, expect_1.expect)(G('*1|number')).equal(1);
        (0, expect_1.expect)(G('*1')).equal(1);
        (0, expect_1.expect)(G('*1|string & 2')).equal(1);
        (0, expect_1.expect)(G('*1|nil')).equal(1);
        // The admission gate (ADR-004): 2 is admitted neither by the
        // preferred value 1 nor by the string alternative, so the meet is
        // the empty disjunction (it used to answer 2 -- the fail-open
        // override of use-cases/BUGS.md §1).
        (0, expect_1.expect)(() => G('(*1|string) & 2')).throws(/aontu/);
        (0, expect_1.expect)(G('(*1&2)|(string&2)')).equal(2);
        (0, expect_1.expect)(G('(*1&2)|nil')).equal(2);
        (0, expect_1.expect)(G('*1&2|nil')).equal(2);
        (0, expect_1.expect)(() => G('*2 & *3')).throws(/aontu/);
        (0, expect_1.expect)(G('*2 & **3')).equal(2);
        (0, expect_1.expect)(G('*2|number')).equal(2);
    });
    (0, node_test_1.test)('path-examples', () => {
        (0, expect_1.expect)(() => G('a:*1|number,b:*2|number,c:$.a&$.b')).throws(/aontu/);
        (0, expect_1.expect)(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/);
        (0, expect_1.expect)(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/);
        (0, expect_1.expect)(() => G('a:x:number b:$.a')).throws(/aontu/);
        (0, expect_1.expect)(G('a:x:1 b:$.a')).equal({ a: { x: 1 }, b: { x: 1 } });
        (0, expect_1.expect)(N('a:x:number b:$.a b:x:1 c:$.a c:x:2'))
            .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":2}}');
        (0, expect_1.expect)(N('a:type(x:number) b:$.a b:x:1 c:$.a c:x:2'))
            .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":2}}');
        (0, expect_1.expect)(G('a:type({}) a:x:number b:x:$.a.x b:x:1 c:$.a c:x:2'))
            .equal({ b: { x: 1 }, c: { x: 2 } });
        (0, expect_1.expect)(G('a:type(x:number) b:x:$.a.x b:x:1 c:$.a c:x:2'))
            .equal({ b: { x: 1 }, c: { x: 2 } });
        (0, expect_1.expect)(N('a:x:number b:$.a b:x:1 c:$.a'))
            .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":number}}');
        (0, expect_1.expect)(() => G('a:type({}) a:x:number b:$.a b:x:1 c:$.a')).throws(/aontu/);
        (0, expect_1.expect)(G('x:type({}) x:y:1 a:$.x')).equal({ a: { y: 1 } });
        (0, expect_1.expect)(N('a:*1|number,b:*2|number,c:$.a&$.b'))
            .equal('{"a":*1|number,"b":*2|number,"c":*2|*1|number}');
        (0, expect_1.expect)(N('a:x:number b:$.a b:x:1 c:$.a c:x:y'))
            .equal('{"a":{"x":number},"b":{"x":1},"c":{"x":nil}}');
        (0, expect_1.expect)(() => G('a:x:number b:$.a b:x:1 c:$.a c:x:y')).throws(/aontu/);
        (0, expect_1.expect)(N('a:x:number b:$.a')).equal('{"a":{"x":number},"b":{"x":number}}');
    });
    (0, node_test_1.test)('model-examples', () => {
        (0, expect_1.expect)(G('x:type({}) x:{y:number} a:copy($.x) a:{y:1}')).equal({ a: { y: 1 } });
        (0, expect_1.expect)(() => G('x:type({}) x:{y:number} a:copy($.x) a:{}')).throws(/required/);
        (0, expect_1.expect)(G('x:type({}) x:{y?:number} a:copy($.x) a:{}')).equal({ a: {} });
        (0, expect_1.expect)(G('x:type({}) x:{y?:number,z:2} a:copy($.x) a:{}')).equal({ a: { z: 2 } });
        (0, expect_1.expect)(G('x:type({}) x:{y?:number,z:2} a:copy($.x) a:{y:11}')).equal({ a: { y: 11, z: 2 } });
        (0, expect_1.expect)(G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11}')).equal({ a: { y: 11, z: 3 } });
        (0, expect_1.expect)(G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11,z:4}'))
            .equal({ a: { y: 11, z: 4 } });
        (0, expect_1.expect)(() => G('x:type({}) x:{y?:number,z:*3} a:copy($.x) a:{y:11,z:Z}')).throws(/aontu/);
    });
    (0, node_test_1.test)('optionals-examples', () => {
        (0, expect_1.expect)(G('{x?:number,y:Y}')).equal({ y: 'Y' });
        (0, expect_1.expect)(G('{x?:top,y:Y}')).equal({ y: 'Y' });
        (0, expect_1.expect)(() => G('{x:number,y:Y}')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('{x:top,y:Y}')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:{x?:number,y:Y} n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:{x?:top,y:Y}  n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:{x:number,y:Y} n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:{x:top,y:Y} n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:type({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:type({x?:top,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:type({x:number,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:type({x:top,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:hide({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:hide({x?:top,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:hide({x:number,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:hide({x:top,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:type({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:type({x?:top,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:type({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:type({x:top,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:hide({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:hide({x?:top,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:hide({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:hide({x:top,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:{x?:number,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:{x?:top,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:{x:number,y:Y} n:move($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:{x:top,y:Y} n:move($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:close({x?:number,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:close({x?:top,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:close({x:number,y:Y}) n:move($.m)')).throw(/required/);
        (0, expect_1.expect)(() => G('m:close({x:top,y:Y}) n:move($.m)')).throw(/required/);
    });
    (0, node_test_1.test)('optionals-dive-examples', () => {
        (0, expect_1.expect)(G('x?:number,y:Y')).equal({ y: 'Y' });
        (0, expect_1.expect)(G('x?:top,y:Y')).equal({ y: 'Y' });
        (0, expect_1.expect)(G('x:a?:number x:a:1')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(G('x:a?:number')).equal({ x: {} });
        (0, expect_1.expect)(G('x:{a?:number} x:{a:1}')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(G('x:{a?:number}')).equal({ x: {} });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{b:1}}')).equal({ x: { a: { b: 1 } } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{c:2}}')).equal({ x: { a: { c: 2 } } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{}}')).equal({ x: {} });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{c:2}}')).equal({ x: { c: 2 } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{}}')).equal({ x: {} });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:b:1')).equal({ x: { a: { b: 1 } } });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:{c:2}')).equal({ x: { a: { c: 2 } } });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:{}')).equal({ x: {} });
        (0, expect_1.expect)(G('x:a?:b?:number x:{c:2}')).equal({ x: { c: 2 } });
        (0, expect_1.expect)(G('x:a?:b?:number x:{}')).equal({ x: {} });
        (0, expect_1.expect)(G('x?:string|number')).equal({});
        (0, expect_1.expect)(G('{x?:string|number}')).equal({});
        (0, expect_1.expect)(G('x:&:y?:string|number x:a:{}')).equal({ x: { a: {} } });
    });
    (0, node_test_1.test)('close-examples', () => {
        (0, expect_1.expect)(G('x:close({a:1})')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(() => G('x:close({a:1}) x:{b:2}')).throws(/closed/);
        (0, expect_1.expect)(G('x:open(close({a:1})) x:{b:2}')).equal({ x: { a: 1, b: 2 } });
        (0, expect_1.expect)(() => G('x:close(open({a:1})) x:{b:2}')).throws(/closed/);
        (0, expect_1.expect)(G('x:close({a:number,b?:boolean}), x:{a:1,b:true}')).equal({ x: { a: 1, b: true } });
        (0, expect_1.expect)(G('x:close({a:number,b?:boolean}), x:{a:1}')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(G('x:close({a:number,b?:boolean,c:string}), x:{a:1,c:C}'))
            .equal({ x: { a: 1, c: 'C' } });
        (0, expect_1.expect)(G('x:close({a:1,b:{c:2}}) x:{a:1,b:{d:3}}')).equal({ x: { a: 1, b: { c: 2, d: 3 } } });
    });
    (0, node_test_1.test)('move-examples', () => {
        (0, expect_1.expect)(G('x:&:{y:1,k:key()} x:a:z:2 x:c:move($.x.a)'))
            .equal({ x: { c: { z: 2, y: 1, k: 'c' } } });
    });
    (0, node_test_1.test)('spread-required-examples', () => {
        (0, expect_1.expect)(() => G('x:&:{m:string} x:a:{}')).throw(/required/);
        (0, expect_1.expect)(() => G('x:&:y:&:{m:string} x:a:y:b:{}')).throw(/required/);
    });
    /*
    test('all-expressions', () => {
      expect(() => G('(1|2)&3')).throws(/aontu/)
      expect(() => G('({a:1}|nil) & {a:2}')).throws(/aontu/)
      expect(() => G('({a:1}|x) & {a:2}')).throws(/aontu/)
      expect(() => G('1&2')).throws(/aontu/)
      expect(() => G('1|(number & string)')).throws(/aontu/)
      expect(() => G('1|number & string')).throws(/aontu/)
      expect(() => G('1|number & string')).throws(/aontu/)
      expect(() => G('a:*1,a:x')).throws(/aontu/)
      expect(() => G('a:*1,a:x')).throws(/aontu/)
      expect(() => G('a:*1|number,a:*2|number')).throws(/aontu/)
      expect(() => G('a:1 a:number')).throws(/aontu/)
      expect(() => G('a:1&2')).throws(/aontu/)
      expect(() => G('boolean & boolan')).throws(/aontu/)
      expect(() => G('close([a]) & [a,b]')).throws(/aontu/)
      expect(() => G('close({a:1}) & {a:1,b:2}')).throws(/aontu/)
      expect(() => G('integer & 1.1')).throws(/aontu/)
      expect(() => G('intetger & integer')).throws(/aontu/)
      expect(() => G('nil')).throws(/aontu/)
      expect(() => G('nil')).throws(/aontu/)
      expect(() => G('null')).throws(/aontu/)
      expect(() => G('x:***1|*a x:b')).throws(/aontu/)
      expect(() => G('x:**1 x:a')).throws(/aontu/)
      expect(() => G('x:**1|*a x:1')).throws(/aontu/)
      expect(() => G('x:**1|*a x:1')).throws(/aontu/)
      expect(() => G('x:**1|*a x:b')).throws(/aontu/)
      expect(() => G('x:**1|*a x:b')).throws(/aontu/)
      expect(() => G('x:*1 x:a')).throws(/aontu/)
      expect(() => G('x:*1&*2')).throws(/aontu/)
      expect(() => G('x:*1&2')).throws(/aontu/)
      expect(() => G('x:*1|*2 x:3')).throws(/aontu/)
      expect(() => G('x:*1|*2 x:3')).throws(/aontu/)
      expect(() => G('x:*1|*a x:b')).throws(/aontu/)
      expect(() => G('x:*1|*a x:b')).throws(/aontu/)
      expect(() => G('x:*1|number x:a')).throws(/aontu/)
      expect(() => G('x:*a x:1')).throws(/aontu/)
      expect(() => G('x:*a|number x:2')).throws(/aontu/)
      expect(() => G('x:*a|number x:2')).throws(/aontu/)
      expect(() => G('x:*true x:false')).throws(/aontu/)
      expect(() => G('x:*{a:*1|number} x:{a:2}')).throws(/aontu/)
      expect(() => G('x:*{a:1}|string x:{a:2}')).throws(/aontu/)
      expect(() => G('x:*{a:1}|{a:number} x:{a:A}')).throws(/aontu/)
      expect(() => G('x:*{a:1}|{a:string} x:{a:2,b:2}')).throws(/aontu/)
      expect(() => G('x:1&2')).throws(/aontu/)
      expect(() => G('x:1&2')).throws(/aontu/)
      expect(() => G('x:close({a:1}) & x:{a:1,b:2}')).throws(/aontu/)
      expect(() => G('x:{a:*1|number} x:{a:2}')).throws(/aontu/)
      expect(() => G('{a:1}&{a:2}')).throws(/aontu/)
      expect(() => G('{a:1}&{a:2}')).throws(/aontu/)
      expect(G('(*{a:1}|{a:number}) & {a:2}')).equal({ a: 2 })
      expect(G('(*{a:1}|{a:number}) & {a:2}')).equal({ a: 2 })
      expect(G('(1|2)&1')).equal(1)
      expect(G('(a)&a')).equal('a')
      expect(G('(a|a)')).equal('a')
      expect(G('(a|a)')).equal('a')
      expect(G('(a|b)&a')).equal('a')
      expect(G('(number|*1)&(number|*1)')).equal('number')
      expect(G('(number|*1)&number')).equal('number')
      expect(G('(number|*1)&number')).equal('number')
      expect(G('(number|integer)&3')).equal(3)
      expect(G('(number|string) & true')).equal(true)
      expect(G('({a:1}|{a:number}) & {a:2}')).equal({ a: 2 })
      expect(G('({a:1}|{a:number}) & {a:2}')).equal({ a: 2 })
      expect(G('({x:1}|{y:2})&{z:3}')).equal({ x: 1, z: 3 })
      expect(G('({x:1}|{y:2})&{z:3}')).equal({ x: 1, z: 3 })
      expect(G('({x:1}|{y:2})')).equal({ x: 1 })
      expect(G('***0|**1|*2')).equal(0)
      expect(G('**1|*2')).equal(1)
      expect(G('*1 & **1')).equal(1)
      expect(G('*1 & *2')).equal(1)
      expect(G('*1 & 2')).equal(2)
      expect(G('*1 & number')).equal(1)
      expect(G('*1&2')).equal(2)
      expect(G('*1&2')).equal(2)
      expect(G('*1&number')).equal(1)
      expect(G('*1&number')).equal(1)
      expect(G('*1|*1 & 2')).equal(2)
      expect(G('*1|*2|number')).equal(1)
      expect(G('*1|number & *2')).equal(2)
      expect(G('*1|number & *2|number')).equal(1)
      expect(G('*1|number & *2|number')).equal(1)
      expect(G('*1|number & *2|number')).equal(1)
      expect(G('*1|number & 2')).equal(2)
      expect(G('*1|number & number')).equal(1)
      expect(G('*1|number')).equal(1)
      expect(G('*1|string & a')).equal('a')
      expect(G('*1|string & a')).equal('a')
      expect(G('*2 & *2')).equal(2)
      expect(G('*2|**3')).equal(2)
      expect(G('*2|*2')).equal(2)
      expect(G('*2|*3')).equal(2)
      expect(G('*2|number')).equal(2)
      expect(G('*2|number')).equal(2)
      expect(G('*{a:1}|{a:number} & {a:2}')).equal({ a: 2 })
      expect(G('*{a:1}|{a:number}')).equal({ a: 1 })
      expect(G('*{x:1}|*{x:number}')).equal({ x: 1 })
      expect(G('*{x:1}|{x:number} & {x:2}')).equal({ x: 2 })
      expect(G('*{x:2}|{x:number} & {x:1}')).equal({ x: 1 })
      expect(G('*{x:2}|{x:number} & {x:2}')).equal({ x: 2 })
      expect(G('1|*2')).equal(1)
      expect(G('1|1')).equal(1)
      expect(G('1|2')).equal(1)
      expect(G('1|2')).equal(1)
      expect(G('1|2')).equal(1)
      expect(G('1|number')).equal(1)
      expect(G('[&:{x:1}]')).equal([{ x: 1 }])
      expect(G('[a] & [a,b]')).equal(['a', 'b'])
      expect(G('[x:1]')).equal(['x'])
      expect(G('[{x:1}]')).equal([{ x: 1 }])
      expect(G('a&(a&a)')).equal('a')
      expect(G('a:1 a:2')).equal({ a: 2 })
      expect(G('a:1 a:2')).equal({ a: 2 })
      expect(G('a:1 a:number')).equal({ a: 1 })
      expect(G('a:1')).equal({ a: 1 })
      expect(G('a:1')).equal({ a: 1 })
      expect(G('a:number a:2')).equal({ a: 2 })
      expect(G('a:x:1 b:copy(y:2)')).equal({ a: { x: 1 }, b: { y: 2 } })
      expect(G('a:{x:1}|{y:2},a:{z:3}')).equal({ a: { x: 1, z: 3 } })
      expect(G('a|(b&a)')).equal('a')
      expect(G('a|a')).equal('a')
      expect(G('a|a')).equal('a')
      expect(G('boolean & boolean')).equal('boolean')
      expect(G('boolean & boolean')).equal('boolean')
      expect(G('boolean & number')).equal('number')
      expect(G('boolean & true')).equal(true)
      expect(G('close(1) & 1')).equal(1)
      expect(G('close([a]) & [a]')).equal(['a'])
      expect(G('close([a])')).equal(['a'])
      expect(G('close({a:1}) & {a:1}')).equal({ a: 1 })
      expect(G('close({a:1}) & {a:1}')).equal({ a: 1 })
      expect(G('close({a:1})')).equal({ a: 1 })
      expect(G('close({a:number}) & {a:1}')).equal({ a: 1 })
      expect(G('integer & 1')).equal(1)
      expect(G('integer & integer')).equal('integer')
      expect(G('integer|number & integer')).equal('integer')
      expect(G('integer|number & number')).equal('number')
      expect(G('lower(1.1)')).equal('1.1')
      expect(G('null & null')).equal(null)
      expect(G('number & *2')).equal(2)
      expect(G('number & 1')).equal(1)
      expect(G('number & 1.1')).equal(1.1)
      expect(G('number & integer')).equal('integer')
      expect(G('number & number')).equal('number')
      expect(G('number|*2')).equal(2)
      expect(G('number|*2')).equal(2)
      expect(G('open([a,b]) & close([a])')).equal(['a'])
      expect(G('open(close({a:1})) & {a:1,b:2}')).equal({ a: 1, b: 2 })
      expect(G('string & a')).equal('a')
      expect(G('string & string')).equal('string')
      expect(G('upper(1) & 1')).equal(1)
      expect(G('x:(*1|number) x:2')).equal({ x: 2 })
      expect(G('x:(1|2) x:2')).equal({ x: 2 })
      expect(G('x:([]) x:2')).equal({ x: 2 })
      expect(G('x:(number&2) x:2')).equal({ x: 2 })
      expect(G('x:(number) x:2')).equal({ x: 2 })
      expect(G('x:(number|string) x:2')).equal({ x: 2 })
      expect(G('x:({}) x:2')).equal({ x: 2 })
      expect(G('x:**1')).equal({ x: 1 })
      expect(G('x:**1|*2')).equal({ x: 1 })
      expect(G('x:**1|*2')).equal({ x: 1 })
      expect(G('x:**1|*a')).equal({ x: 1 })
      expect(G('x:**1|number')).equal({ x: 1 })
      expect(G('x:**1|string x:a')).equal({ x: 'a' })
      expect(G('x:**1|string')).equal({ x: '' })
      expect(G('x:*1 x:2')).equal({ x: 2 })
      expect(G('x:*1 x:2')).equal({ x: 2 })
      expect(G('x:*1 x:3')).equal({ x: 3 })
      expect(G('x:*1')).equal({ x: 1 })
      expect(G('x:*1')).equal({ x: 1 })
      expect(G('x:*1|*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|*1|number')).equal({ x: 1 })
      expect(G('x:*1|*2 x:2')).equal({ x: 2 })
      expect(G('x:*1|*2 x:2')).equal({ x: 2 })
      expect(G('x:*1|*2')).equal({ x: 1 })
      expect(G('x:*1|*2')).equal({ x: 1 })
      expect(G('x:*1|*2')).equal({ x: 1 })
      expect(G('x:*1|*2|number x:2')).equal({ x: 2 })
      expect(G('x:*1|*2|number')).equal({ x: 1 })
      expect(G('x:*1|*a')).equal({ x: 1 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|number x:2')).equal({ x: 2 })
      expect(G('x:*1|string x:a')).equal({ x: 'a' })
      expect(G('x:*1|string')).equal({ x: '' })
      expect(G('x:*a x:b')).equal({ x: 'b' })
      expect(G('x:*a x:b')).equal({ x: 'b' })
      expect(G('x:*true')).equal({ x: true })
      expect(G('x:*{a:*1|number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:*1|number}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:*1} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:*1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|object x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|object x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2,b:2}')).equal({ x: { a: 2, b: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:*{a:1}|{a:number}')).equal({ x: { a: 1 } })
      expect(G('x:*{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:1|number x:2')).equal({ x: 2 })
      expect(G('x:a|b')).equal({ x: 'a' })
      expect(G('x:{a:*1|number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:{a:1}|{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('x:{a:number} x:{a:2}')).equal({ x: { a: 2 } })
      expect(G('{a:1,b?:2,c?:3}')).equal({ a: 1 })
      expect(G('{a:1,b?:2}')).equal({ a: 1 })
      expect(G('{a:1}')).equal({ a: 1 })
      expect(G('{a:1}|{a:2}')).equal({ a: 1 })
      expect(G('{a:1}|{a:2}')).equal({ a: 1 })
      expect(G('{a:{x:1,z:3}|{y:2,z:3}}')).equal({ a: { x: 1, z: 3 } })
      expect(N('(1|2)&3')).equal('nil')
      expect(N('({a:1}|nil) & {a:2}')).equal('{"a":nil}')
      expect(N('({a:1}|x) & {a:2}')).equal('{"a":nil}')
      expect(N('*1 & **2')).equal('nil')
      expect(N('*1 & **a')).equal('nil')
      expect(N('*1 & *a')).equal('nil')
      expect(N('*1 & x')).equal('nil')
      expect(N('*1&x')).equal('nil')
      expect(N('*1&x')).equal('nil')
      expect(N('*1|*2|number & 3')).equal('nil')
      expect(N('*1|number & 2')).equal('nil')
      expect(N('*1|number & 2')).equal('nil')
      expect(N('*1|number & number')).equal('nil')
      expect(N('*1|number & number')).equal('nil')
      expect(N('*1|number')).equal('nil')
      expect(N('*1|string & 2')).equal('nil')
      expect(N('*2 & *3')).equal('nil')
      expect(N('*2|number')).equal('nil')
      expect(N('1&2')).equal('nil')
      expect(N('1|(number & string)')).equal('nil')
      expect(N('1|number & string')).equal('nil')
      expect(N('1|number & string')).equal('nil')
      expect(N('a:*1,a:x')).equal('{"a":nil}')
      expect(N('a:*1,a:x')).equal('{"a":nil}')
      expect(N('a:*1|number,a:*2|number')).equal('{"a":nil}')
      expect(N('a:1 a:number')).equal('{"a":nil}')
      expect(N('a:1&2')).equal('{"a":nil}')
      expect(N('boolean & boolan')).equal('nil')
      expect(N('close([a]) & [a,b]')).equal('nil')
      expect(N('close({a:1}) & {a:1,b:2}')).equal('nil')
      expect(N('integer & 1.1')).equal('nil')
      expect(N('intetger & integer')).equal('nil')
      expect(N('x:***1|*a x:b')).equal('{"x":nil}')
      expect(N('x:**1 x:a')).equal('{"x":nil}')
      expect(N('x:**1|*a x:1')).equal('{"x":nil}')
      expect(N('x:**1|*a x:1')).equal('{"x":nil}')
      expect(N('x:**1|*a x:b')).equal('{"x":nil}')
      expect(N('x:**1|*a x:b')).equal('{"x":nil}')
      expect(N('x:*1 x:a')).equal('{"x":nil}')
      expect(N('x:*1&*2')).equal('{"x":nil}')
      expect(N('x:*1&2')).equal('{"x":nil}')
      expect(N('x:*1|*2 x:3')).equal('{"x":nil}')
      expect(N('x:*1|*2 x:3')).equal('{"x":nil}')
      expect(N('x:*1|*a x:b')).equal('{"x":nil}')
      expect(N('x:*1|*a x:b')).equal('{"x":nil}')
      expect(N('x:*1|number x:a')).equal('{"x":nil}')
      expect(N('x:*a x:1')).equal('{"x":nil}')
      expect(N('x:*a|number x:2')).equal('{"x":nil}')
      expect(N('x:*a|number x:2')).equal('{"x":nil}')
      expect(N('x:*true x:false')).equal('{"x":nil}')
      expect(N('x:*{a:*1|number} x:{a:2}')).equal('{"x":{"a":nil}}')
      expect(N('x:*{a:1}|string x:{a:2}')).equal('{"x":nil}')
      expect(N('x:*{a:1}|{a:number} x:{a:A}')).equal('{"x":{"a":nil}}')
      expect(N('x:*{a:1}|{a:string} x:{a:2,b:2}')).equal('{"x":{"a":nil}}')
      expect(N('x:1&2')).equal('{"x":nil}')
      expect(N('x:1&2')).equal('{"x":nil}')
      expect(N('x:close({a:1}) & x:{a:1,b:2}')).equal('{"x":nil}')
      expect(N('x:{a:*1|number} x:{a:2}')).equal('{"x":{"a":nil}}')
      expect(N('{a:1}&{a:2}')).equal('{"a":nil}')
      expect(N('{a:1}&{a:2}')).equal('{"a":nil}')
  
      // Final empty lines handled
    })
    */
});
//# sourceMappingURL=example.test.js.map