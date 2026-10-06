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
        (0, expect_1.expect)(() => G('x:type({}) x:{y:number} a:copy($.x) a:{}')).throws(/no_gen/);
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
        (0, expect_1.expect)(G('{x?:any,y:Y}')).equal({ y: 'Y' });
        (0, expect_1.expect)(() => G('{x:number,y:Y}')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('{x:any,y:Y}')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:{x?:number,y:Y} n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:{x?:any,y:Y}  n:$.m')).equal({ m: { y: 'Y' }, n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:{x:number,y:Y} n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:{x:any,y:Y} n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:type({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:type({x?:any,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:type({x:number,y:Y}) n:$.m')).throw(/required/);
        (0, expect_1.expect)(() => G('m:type({x:any,y:Y}) n:$.m')).throw(/required/);
        (0, expect_1.expect)(G('m:hide({x?:number,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:hide({x?:any,y:Y}) n:$.m')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:hide({x:number,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:hide({x:any,y:Y}) n:$.m')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:type({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:type({x?:any,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:type({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:type({x:any,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:hide({x?:number,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:hide({x?:any,y:Y}) n:copy($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:hide({x:number,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:hide({x:any,y:Y}) n:copy($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:{x?:number,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:{x?:any,y:Y} n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:{x:number,y:Y} n:move($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(() => G('m:{x:any,y:Y} n:move($.m)')).throw(/no_gen/);
        (0, expect_1.expect)(G('m:close({x?:number,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(G('m:close({x?:any,y:Y}) n:move($.m)')).equal({ n: { y: 'Y' } });
        (0, expect_1.expect)(() => G('m:close({x:number,y:Y}) n:move($.m)')).throw(/required/);
        (0, expect_1.expect)(() => G('m:close({x:any,y:Y}) n:move($.m)')).throw(/required/);
    });
    (0, node_test_1.test)('optionals-dive-examples', () => {
        (0, expect_1.expect)(G('x?:number,y:Y')).equal({ y: 'Y' });
        (0, expect_1.expect)(G('x?:any,y:Y')).equal({ y: 'Y' });
        (0, expect_1.expect)(G('x:a?:number x:a:1')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(G('x:a?:number')).equal({ x: {} });
        (0, expect_1.expect)(G('x:{a?:number} x:{a:1}')).equal({ x: { a: 1 } });
        (0, expect_1.expect)(G('x:{a?:number}')).equal({ x: {} });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{b:1}}')).equal({ x: { a: { b: 1 } } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{c:2}}')).equal({ x: { a: { c: 2 } } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{a:{}}')).equal({ x: { a: {} } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{c:2}}')).equal({ x: { c: 2 } });
        (0, expect_1.expect)(G('{x:{a?:{b?:number}} x:{}}')).equal({ x: {} });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:b:1')).equal({ x: { a: { b: 1 } } });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:{c:2}')).equal({ x: { a: { c: 2 } } });
        (0, expect_1.expect)(G('x:a?:b?:number x:a:{}')).equal({ x: { a: {} } });
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
        (0, expect_1.expect)(() => G('x:close({a:1,b:{c:2}}) x:{a:1,b:{d:3}}')).throws(/closed/);
        (0, expect_1.expect)(G('x:close({a:1,b:open({c:2})}) x:{a:1,b:{d:3}}')).equal({ x: { a: 1, b: { c: 2, d: 3 } } });
    });
    (0, node_test_1.test)('move-examples', () => {
        (0, expect_1.expect)(G('x:&:{y:1,k:key()} x:a:z:2 x:c:move($.x.a)'))
            .equal({ x: { c: { z: 2, y: 1, k: 'c' } } });
    });
    (0, node_test_1.test)('spread-required-examples', () => {
        (0, expect_1.expect)(() => G('x:&:{m:string} x:a:{}')).throw(/required/);
        (0, expect_1.expect)(() => G('x:&:y:&:{m:string} x:a:y:b:{}')).throw(/required/);
    });
});
//# sourceMappingURL=example.test.js.map