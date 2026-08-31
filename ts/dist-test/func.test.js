"use strict";
/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const expect_1 = require("./expect");
const __1 = require("..");
const unify_1 = require("../dist/unify");
const lang_1 = require("../dist/lang");
let lang = new lang_1.Lang();
// const G = (x: string, ctx?: any) => new Unify(x, lang)
//   .res.gen(ctx || new AontuContext({ root: new MapVal({ peg: {} }) }))
const A = new __1.Aontu();
const G = (x) => A.generate(x);
(0, node_test_1.describe)('func', function () {
    (0, node_test_1.test)('lower-numbers', () => {
        (0, expect_1.expect)(G('lower(1.1)')).equal(1);
        (0, expect_1.expect)(G('lower(1.9)')).equal(1);
        (0, expect_1.expect)(G('lower(2.0)')).equal(2);
        (0, expect_1.expect)(G('lower(-1.1)')).equal(-2);
        (0, expect_1.expect)(G('lower(-1.9)')).equal(-2);
    });
    (0, node_test_1.test)('lower-numbers-expr', () => {
        (0, expect_1.expect)(G('lower(1.1)+2')).equal(3);
        (0, expect_1.expect)(G('2+lower(1.9)')).equal(3);
        (0, expect_1.expect)(G('(lower(1.5))')).equal(1);
        (0, expect_1.expect)(G('lower(2.7)+1')).equal(3);
        (0, expect_1.expect)(G('1+lower(2.7)')).equal(3);
        (0, expect_1.expect)(G('1+lower(2.7)+1')).equal(4);
        (0, expect_1.expect)(G('(lower(2.7)+1)')).equal(3);
        (0, expect_1.expect)(G('(1+lower(2.7))')).equal(3);
        (0, expect_1.expect)(G('(1+lower(2.7)+1)')).equal(4);
        (0, expect_1.expect)(G('lower(1.1)+lower(2.9)')).equal(3);
        (0, expect_1.expect)(G('lower(1.1)+lower(2.9)+lower(3.5)')).equal(6);
    });
    (0, node_test_1.test)('lower-numbers-deep', () => {
        (0, expect_1.expect)(G('x:lower(1.1)')).equal({ x: 1 });
        (0, expect_1.expect)(G('x:{y:lower(2.9)}')).equal({ x: { y: 2 } });
        (0, expect_1.expect)(G('[lower(1.1)]')).equal([1]);
        (0, expect_1.expect)(G('[x,lower(2.9)]')).equal(['x', 2]);
        (0, expect_1.expect)(G('x:{y:[lower(3.9)]}')).equal({ x: { y: [3] } });
        (0, expect_1.expect)(G('x:y:lower(1.1)+lower(2.1)')).equal({ x: { y: 3 } });
        (0, expect_1.expect)(G('x:y:lower(1.1),z:lower(2.1)')).equal({ x: { y: 1 }, z: 2 });
    });
    (0, node_test_1.test)('lower-numbers-path', () => {
        (0, expect_1.expect)(G('x:1.5 y:lower($.x)')).equal({ x: 1.5, y: 1 });
        (0, expect_1.expect)(G('x:3.9 y:{z:lower($.x)}')).equal({ x: 3.9, y: { z: 3 } });
        (0, expect_1.expect)(G('a:2.7 y:lower($.a)')).equal({ a: 2.7, y: 2 });
        (0, expect_1.expect)(G('x:{a:2.7} y:$.x.a')).equal({ x: { a: 2.7 }, y: 2.7 });
        (0, expect_1.expect)(G('x:3 y:($.x)')).equal({ x: 3, y: 3 });
        (0, expect_1.expect)(G('x:{a:5} y:(x.a)')).equal({ x: { a: 5 }, y: 5 });
        (0, expect_1.expect)(G('z:x:{a:61} z:y:(.x.a)')).equal({ z: { x: { a: 61 }, y: 61 } });
        (0, expect_1.expect)(G('z:x:{a:62} z:y:.x.a')).equal({ z: { x: { a: 62 }, y: 62 } });
        (0, expect_1.expect)(G('z:x:{a:63} z:y:(x.a)')).equal({ z: { x: { a: 63 }, y: 63 } });
        // path() CAPTURES (docs/design/PATHS.0.md): the value is the
        // address spelling, not the value found there.
        (0, expect_1.expect)(G('z:x:{a:64} z:y:path(x.a)')).equal({ z: { x: { a: 64 }, y: '.x.a' } });
        (0, expect_1.expect)(G('z:x:{a:65} z:y:path($.z.x.a)')).equal({ z: { x: { a: 65 }, y: '$.z.x.a' } });
        (0, expect_1.expect)(G('x:{a:4} y:(.x.a)')).equal({ x: { a: 4 }, y: 4 });
        (0, expect_1.expect)(G('x:{a:3} y:($.x.a)')).equal({ x: { a: 3 }, y: 3 });
        (0, expect_1.expect)(G('x:{a:2.7} y:lower($.x.a)')).equal({ x: { a: 2.7 }, y: 2 });
        (0, expect_1.expect)(G('x:(1)')).equal({ x: 1 });
        (0, expect_1.expect)(G('x:(+2)')).equal({ x: 2 });
        (0, expect_1.expect)(G('x:(3+4)')).equal({ x: 7 });
        (0, expect_1.expect)(G('x:(+3+4)')).equal({ x: 7 });
        (0, expect_1.expect)(G('x:(5+6+7)')).equal({ x: 18 });
        (0, expect_1.expect)(G('x:(+5+6+7)')).equal({ x: 18 });
        (0, expect_1.expect)(G('x:y:z:100.9,a:b:c:lower($.x.y.z)'))
            .equal({ x: { y: { z: 100.9 } }, a: { b: { c: 100 } } });
    });
    (0, node_test_1.test)('lower-numbers-spread', () => {
        (0, expect_1.expect)(G('a:{&:x:lower(1.1)} a:{b:{y:1}}')).equal({ a: { b: { x: 1, y: 1 } } });
        (0, expect_1.expect)(G('a:{&:x:lower(2.9)} a:{b:{y:1},c:{y:2}}'))
            .equal({ a: { b: { x: 2, y: 1 }, c: { x: 2, y: 2 } } });
        (0, expect_1.expect)(G('a:{&:z:lower(3.5)} a:{b:{y:1}}')).equal({ a: { b: { z: 3, y: 1 } } });
    });
    (0, node_test_1.test)('lower-numbers-pref', () => {
        (0, expect_1.expect)(G('x:*lower(1.1)')).equal({ x: 1 });
        // `lower` answers a FLOAT (`lower(2.2)` is `2.0`), so a float peer
        // overrides the preference and an integer one conflicts with it —
        // the numeric leaves are disjoint kinds, and the preference gate is
        // the preferred value's own kind (ts/src/val/PrefVal.ts).
        (0, expect_1.expect)(G('x:*lower(2.2),x:lower(4.4)')).equal({ x: 4 });
        (0, expect_1.expect)(G('x:*lower(2.2),x:3.5')).equal({ x: 3.5 });
        (0, expect_1.expect)(() => G('x:*lower(2.2),x:3')).throws(/Cannot unify/);
    });
    (0, node_test_1.test)('upper-numbers', () => {
        (0, expect_1.expect)(G('upper(1.1)')).equal(2);
        (0, expect_1.expect)(G('upper(1.9)')).equal(2);
        (0, expect_1.expect)(G('upper(2.0)')).equal(2);
        (0, expect_1.expect)(G('upper(-1.1)')).equal(-1);
        (0, expect_1.expect)(G('upper(-1.9)')).equal(-1);
    });
    (0, node_test_1.test)('upper-numbers-expr', () => {
        (0, expect_1.expect)(G('upper(1.1)+2')).equal(4);
        (0, expect_1.expect)(G('2+upper(1.9)')).equal(4);
        (0, expect_1.expect)(G('(upper(1.5))')).equal(2);
        (0, expect_1.expect)(G('(upper(2.1)+1)')).equal(4);
        (0, expect_1.expect)(G('upper(1.1)+upper(2.1)')).equal(5);
    });
    (0, node_test_1.test)('upper-numbers-deep', () => {
        (0, expect_1.expect)(G('x:upper(1.1)')).equal({ x: 2 });
        (0, expect_1.expect)(G('x:{y:upper(2.1)}')).equal({ x: { y: 3 } });
        (0, expect_1.expect)(G('[upper(1.1)]')).equal([2]);
        (0, expect_1.expect)(G('[x,upper(2.1)]')).equal(['x', 3]);
        (0, expect_1.expect)(G('x:{y:[upper(3.1)]}')).equal({ x: { y: [4] } });
    });
    (0, node_test_1.test)('upper-numbers-path', () => {
        (0, expect_1.expect)(G('x:1.5 y:upper($.x)')).equal({ x: 1.5, y: 2 });
        (0, expect_1.expect)(G('x:{a:2.3} y:upper($.x.a)')).equal({ x: { a: 2.3 }, y: 3 });
        (0, expect_1.expect)(G('x:3.1 y:{z:upper($.x)}')).equal({ x: 3.1, y: { z: 4 } });
        (0, expect_1.expect)(G('[3.1 upper($.0)]')).equal([3.1, 4]);
        (0, expect_1.expect)(G('[3.1 4.1 upper($.1)]')).equal([3.1, 4.1, 5]);
        (0, expect_1.expect)(G('[3.1 [4.1, 5.1] upper($.1.1)]')).equal([3.1, [4.1, 5.1], 6]);
        (0, expect_1.expect)(G('x:y:1.5 x:z:upper($.x.y)')).equal({ x: { y: 1.5, z: 2 } });
        (0, expect_1.expect)(() => G('x:y:a:1.1 x:z:upper($.x.y)')).throws(/invalid/);
    });
    (0, node_test_1.test)('upper-numbers-spread', () => {
        (0, expect_1.expect)(G('a:{&:x:upper(1.1)} a:{b:{y:1}}')).equal({ a: { b: { x: 2, y: 1 } } });
        (0, expect_1.expect)(G('a:{&:x:upper(2.1)} a:{b:{y:1},c:{y:2}}'))
            .equal({ a: { b: { x: 3, y: 1 }, c: { x: 3, y: 2 } } });
        (0, expect_1.expect)(G('a:{&:z:upper(3.5)} a:{b:{y:1}}')).equal({ a: { b: { z: 4, y: 1 } } });
    });
    (0, node_test_1.test)('upper-basic', () => {
        (0, expect_1.expect)(G('upper(a)')).equal('A');
        (0, expect_1.expect)(G('upper(abc)')).equal('ABC');
        (0, expect_1.expect)(G('upper(ABC)')).equal('ABC');
        (0, expect_1.expect)(G('upper(AbC)')).equal('ABC');
    });
    (0, node_test_1.test)('upper-expr', () => {
        (0, expect_1.expect)(G('upper(a)+b')).equal('Ab');
        (0, expect_1.expect)(G('c+upper(d)')).equal('cD');
        (0, expect_1.expect)(G('(upper(e))')).equal('E');
        (0, expect_1.expect)(G('(upper(fg)+h)')).equal('FGh');
        (0, expect_1.expect)(G('upper(i)+upper(j)')).equal('IJ');
    });
    (0, node_test_1.test)('upper-deep', () => {
        (0, expect_1.expect)(G('x:upper(a)')).equal({ x: 'A' });
        (0, expect_1.expect)(G('x:{y:upper(b)}')).equal({ x: { y: 'B' } });
        (0, expect_1.expect)(G('[upper(c)]')).equal(['C']);
        (0, expect_1.expect)(G('[x,upper(d)]')).equal(['x', 'D']);
        (0, expect_1.expect)(G('x:{y:[upper(e)]}')).equal({ x: { y: ['E'] } });
    });
    (0, node_test_1.test)('upper-path', () => {
        (0, expect_1.expect)(G('x:foo y:upper($.x)')).equal({ x: 'foo', y: 'FOO' });
        (0, expect_1.expect)(G('x:{a:bar} y:upper($.x.a)')).equal({ x: { a: 'bar' }, y: 'BAR' });
        (0, expect_1.expect)(G('x:baz y:{z:upper($.x)}')).equal({ x: 'baz', y: { z: 'BAZ' } });
    });
    (0, node_test_1.test)('upper-spread', () => {
        (0, expect_1.expect)(G('a:{&:x:upper(foo)} a:{b:{y:1}}')).equal({ a: { b: { x: 'FOO', y: 1 } } });
        (0, expect_1.expect)(G('a:{&:x:upper(bar)} a:{b:{y:1},c:{y:2}}')).equal({ a: { b: { x: 'BAR', y: 1 }, c: { x: 'BAR', y: 2 } } });
        (0, expect_1.expect)(G('a:{&:z:upper(qux)} a:{b:{y:1}}')).equal({ a: { b: { z: 'QUX', y: 1 } } });
    });
    (0, node_test_1.test)('upper-pref', () => {
        (0, expect_1.expect)(G('x:*upper(foo)')).equal({ x: 'FOO' });
    });
    (0, node_test_1.test)('lower-basic', () => {
        (0, expect_1.expect)(G('lower(A)')).equal('a');
        (0, expect_1.expect)(G('lower(ABC)')).equal('abc');
        (0, expect_1.expect)(G('lower(abc)')).equal('abc');
        (0, expect_1.expect)(G('lower(AbC)')).equal('abc');
    });
    (0, node_test_1.test)('lower-expr', () => {
        (0, expect_1.expect)(G('lower(A)+B')).equal('aB');
        (0, expect_1.expect)(G('C+lower(D)')).equal('Cd');
        (0, expect_1.expect)(G('(lower(E))')).equal('e');
        (0, expect_1.expect)(G('(lower(FG)+H)')).equal('fgH');
        (0, expect_1.expect)(G('lower(I)+lower(J)')).equal('ij');
    });
    (0, node_test_1.test)('lower-deep', () => {
        (0, expect_1.expect)(G('x:lower(A)')).equal({ x: 'a' });
        (0, expect_1.expect)(G('x:{y:lower(B)}')).equal({ x: { y: 'b' } });
        (0, expect_1.expect)(G('[lower(C)]')).equal(['c']);
        (0, expect_1.expect)(G('[x,lower(D)]')).equal(['x', 'd']);
        (0, expect_1.expect)(G('x:{y:[lower(E)]}')).equal({ x: { y: ['e'] } });
    });
    (0, node_test_1.test)('lower-path', () => {
        (0, expect_1.expect)(G('x:FOO y:lower($.x)')).equal({ x: 'FOO', y: 'foo' });
        (0, expect_1.expect)(G('x:{a:BAR} y:lower($.x.a)')).equal({ x: { a: 'BAR' }, y: 'bar' });
        (0, expect_1.expect)(G('x:BAZ y:{z:lower($.x)}')).equal({ x: 'BAZ', y: { z: 'baz' } });
    });
    (0, node_test_1.test)('lower-spread', () => {
        (0, expect_1.expect)(G('a:{&:x:lower(FOO)} a:{b:{y:1}}')).equal({ a: { b: { x: 'foo', y: 1 } } });
        (0, expect_1.expect)(G('a:{&:x:lower(BAR)} a:{b:{y:1},c:{y:2}}')).equal({ a: { b: { x: 'bar', y: 1 }, c: { x: 'bar', y: 2 } } });
        (0, expect_1.expect)(G('a:{&:z:lower(QUX)} a:{b:{y:1}}')).equal({ a: { b: { z: 'qux', y: 1 } } });
    });
    (0, node_test_1.test)('lower-pref', () => {
        (0, expect_1.expect)(G('x:*lower(FOO)')).equal({ x: 'foo' });
    });
    (0, node_test_1.test)('copy-basic', () => {
        (0, expect_1.expect)(G('copy(1)')).equal(1);
        (0, expect_1.expect)(G('copy(a)')).equal('a');
        (0, expect_1.expect)(G('copy(true)')).equal(true);
        (0, expect_1.expect)(G('copy({x:1})')).equal({ x: 1 });
        (0, expect_1.expect)(G('copy([1,2])')).equal([1, 2]);
    });
    (0, node_test_1.test)('copy-expr', () => {
        (0, expect_1.expect)(G('copy(1)+2')).equal(3);
        (0, expect_1.expect)(G('2+copy(3)')).equal(5);
        (0, expect_1.expect)(G('(copy(4))')).equal(4);
        (0, expect_1.expect)(G('(copy(5)+1)')).equal(6);
        (0, expect_1.expect)(G('copy(a)+copy(b)')).equal('ab');
    });
    (0, node_test_1.test)('copy-deep', () => {
        (0, expect_1.expect)(G('x:copy(1)')).equal({ x: 1 });
        (0, expect_1.expect)(G('x:{y:copy(2)}')).equal({ x: { y: 2 } });
        (0, expect_1.expect)(G('[copy(3)]')).equal([3]);
        (0, expect_1.expect)(G('[x,copy(4)]')).equal(['x', 4]);
        (0, expect_1.expect)(G('x:{y:[copy(5)]}')).equal({ x: { y: [5] } });
    });
    (0, node_test_1.test)('copy-path', () => {
        (0, expect_1.expect)(G('x:1 y:copy($.x)')).equal({ x: 1, y: 1 });
        (0, expect_1.expect)(G('x:{a:2} y:copy($.x.a)')).equal({ x: { a: 2 }, y: 2 });
        (0, expect_1.expect)(G('x:3 y:{z:copy($.x)}')).equal({ x: 3, y: { z: 3 } });
        (0, expect_1.expect)(G('x:{a:1,b:2} y:copy($.x)')).equal({ x: { a: 1, b: 2 }, y: { a: 1, b: 2 } });
        (0, expect_1.expect)(G('x:[1,2,3] y:copy($.x)')).equal({ x: [1, 2, 3], y: [1, 2, 3] });
    });
    (0, node_test_1.test)('copy-spread', () => {
        (0, expect_1.expect)(G('a:{&:x:copy(1)} a:{b:{y:2}}')).equal({ a: { b: { x: 1, y: 2 } } });
        (0, expect_1.expect)(G('a:{&:x:copy(3)} a:{b:{y:1},c:{y:2}}'))
            .equal({ a: { b: { x: 3, y: 1 }, c: { x: 3, y: 2 } } });
        (0, expect_1.expect)(G('a:{&:z:copy(5)} a:{b:{y:1}}')).equal({ a: { b: { z: 5, y: 1 } } });
    });
    (0, node_test_1.test)('copy-type', () => {
        (0, expect_1.expect)(G('x:type({}) x:y:1 a:copy($.x)')).equal({ a: { y: 1 } });
        (0, expect_1.expect)(G('x:type({}) x:y:1 a:pref(copy($.x)) a:y:2')).equal({ a: { y: 2 } });
        // ADR-011 R1: a default its own type will not admit refuses as the
        // emptied disjunction `*x` stands for, whatever the leaf.
        (0, expect_1.expect)(() => G('x:type({}) x:y:1 a:pref(copy($.x)) a:y:Y')).throws(/empty/);
    });
    (0, node_test_1.test)('copy-hide', () => {
        (0, expect_1.expect)(G('x:hide({}) x:y:1 a:copy($.x)')).equal({ a: { y: 1 } });
    });
    (0, node_test_1.test)('key-basic', () => {
        (0, expect_1.expect)(G('a:b:c:key()')).equal({ a: { b: { c: 'b' } } });
        (0, expect_1.expect)(G('a:b:key()')).equal({ a: { b: 'a' } });
        (0, expect_1.expect)(G('a:key()')).equal({ a: '' });
        (0, expect_1.expect)(G('key()')).equal('');
        (0, expect_1.expect)(G('key() & string')).equal('');
        // `&` binds tighter than `|`, so the unparenthesised spelling is
        // `(key() & *a) | string` -- at the root key() is '', so that is
        // `"" | string`: two alternatives still admitted, which ADR-007
        // refuses as incomplete rather than folding them into one. The
        // parenthesised form is the composition this line is about.
        (0, expect_1.expect)(G('key() & (*a|string)')).equal('');
        (0, expect_1.expect)(() => G('key() & *a|string')).throw(/disjunct_no_gen/);
        (0, expect_1.expect)(() => G('key() & number')).throw(/scalar/);
        (0, expect_1.expect)(G('a:b:c:key(0)')).equal({ a: { b: { c: 'c' } } });
        (0, expect_1.expect)(G('a:b:c:key(1)')).equal({ a: { b: { c: 'b' } } });
        (0, expect_1.expect)(G('a:b:c:key(2)')).equal({ a: { b: { c: 'a' } } });
        (0, expect_1.expect)(G('a:b:c:key(3)')).equal({ a: { b: { c: '' } } });
        (0, expect_1.expect)(G('a:b:c:key(4)')).equal({ a: { b: { c: '' } } });
        (0, expect_1.expect)(G('a:b:c:key(-1)')).equal({ a: { b: { c: '' } } });
        (0, expect_1.expect)(G('a:b:c:key(-2)')).equal({ a: { b: { c: '' } } });
    });
    (0, node_test_1.test)('key-unify', () => {
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        (0, expect_1.expect)(G('key()&""')).equal('');
        (0, expect_1.expect)(G('a:key()&""')).equal({ a: '' });
        (0, expect_1.expect)(() => G('key()&"x"')).throw(/scalar/);
        (0, expect_1.expect)(() => G('a:key()&"x"')).throw(/scalar/);
        (0, expect_1.expect)(G('x:a:key()&"x"')).equal({ x: { a: 'x' } });
        (0, expect_1.expect)(G('x:a:key()&key()')).equal({ x: { a: 'x' } });
        (0, expect_1.expect)(G('x:a:key()|key()')).equal({ x: { a: 'x' } });
    });
    (0, node_test_1.test)('key-expr', () => {
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        (0, expect_1.expect)(G('key()+B')).equal('B');
        (0, expect_1.expect)(G('C+key()')).equal('C');
        (0, expect_1.expect)(G('D+key()+E')).equal('DE');
        (0, expect_1.expect)(G('(key())')).equal('');
        (0, expect_1.expect)(G('(J+key())')).equal('J');
        (0, expect_1.expect)(G('(key()+H)')).equal('H');
        (0, expect_1.expect)(G('(J+key()+H)')).equal('JH');
        (0, expect_1.expect)(G('key()')).equal('');
        (0, expect_1.expect)(G('(key())')).equal('');
        (0, expect_1.expect)(G('key()+key()')).equal('');
        (0, expect_1.expect)(G('(key()+key())')).equal('');
        (0, expect_1.expect)(G('key()+key()+key()')).equal('');
        (0, expect_1.expect)(G('(key()+key()+key())')).equal('');
        (0, expect_1.expect)(G('((key()))')).equal('');
        (0, expect_1.expect)(G('(key()+key())')).equal('');
        (0, expect_1.expect)(G('((key()+key()))')).equal('');
        (0, expect_1.expect)(G('(key()+key()+key())')).equal('');
        (0, expect_1.expect)(G('((key()+key()+key()))')).equal('');
        (0, expect_1.expect)(G('AA+(key())')).equal('AA');
        (0, expect_1.expect)(G('(key())+BB')).equal('BB');
        (0, expect_1.expect)(G('AA+(key())+BB')).equal('AABB');
        (0, expect_1.expect)(G('a:key()+B')).equal({ a: 'B' });
        (0, expect_1.expect)(G('a:C+key()')).equal({ a: 'C' });
        (0, expect_1.expect)(G('a:(key())')).equal({ a: '' });
        (0, expect_1.expect)(G('a:(J+key())')).equal({ a: 'J' });
        (0, expect_1.expect)(G('a:(key()+H)')).equal({ a: 'H' });
        (0, expect_1.expect)(G('a:(J+key()+H)')).equal({ a: 'JH' });
        (0, expect_1.expect)(G('a:key()+key()')).equal({ a: '' });
        (0, expect_1.expect)(G('a:(key()+key())')).equal({ a: '' });
        (0, expect_1.expect)(G('a:b:key()')).equal({ a: { b: 'a' } });
        (0, expect_1.expect)(G('a:b:key()+B')).equal({ a: { b: 'aB' } });
        (0, expect_1.expect)(G('a:b:C+key()')).equal({ a: { b: 'Ca' } });
        (0, expect_1.expect)(G('a:b:(key())')).equal({ a: { b: 'a' } });
        (0, expect_1.expect)(G('a:b:(J+key())')).equal({ a: { b: 'Ja' } });
        (0, expect_1.expect)(G('a:b:(key()+H)')).equal({ a: { b: 'aH' } });
        (0, expect_1.expect)(G('a:b:(J+key()+H)')).equal({ a: { b: 'JaH' } });
        (0, expect_1.expect)(G('a:b:key()+key()')).equal({ a: { b: 'aa' } });
        (0, expect_1.expect)(G('a:b:(key()+key())')).equal({ a: { b: 'aa' } });
    });
    /*
    test('key-deep', () => {
      expect(G('x:key(A)')).equal({ x: 'a' })
      expect(G('x:{y:key(B)}')).equal({ x: { y: 'b' } })
      expect(G('[key(C)]')).equal(['c'])
      expect(G('[x,key(D)]')).equal(['x', 'd'])
      expect(G('x:{y:[key(E)]}')).equal({ x: { y: ['e'] } })
    })
  
    test('key-path', () => {
      expect(G('x:FOO y:key($.x)')).equal({ x: 'FOO', y: 'foo' })
      expect(G('x:{a:BAR} y:key($.x.a)')).equal({ x: { a: 'BAR' }, y: 'bar' })
      expect(G('x:BAZ y:{z:key($.x)}')).equal({ x: 'BAZ', y: { z: 'baz' } })
    })
  
    test('key-pref', () => {
      expect(G('x:FOO y:key($.x)')).equal({ x: 'FOO', y: 'foo' })
      expect(G('x:{a:BAR} y:key($.x.a)')).equal({ x: { a: 'BAR' }, y: 'bar' })
      expect(G('x:BAZ y:{z:key($.x)}')).equal({ x: 'BAZ', y: { z: 'baz' } })
    })
    
    test('key-spread', () => {
      expect(G('a:{&:x:key(FOO)} a:{b:{y:1}}')).equal({ a: { b: { x: 'foo', y: 1 } } })
      expect(G('a:{&:x:key(BAR)} a:{b:{y:1},c:{y:2}}')).equal({ a: { b: { x: 'bar', y: 1 }, c: { x: 'bar', y: 2 } } })
      expect(G('a:{&:z:key(QUX)} a:{b:{y:1}}')).equal({ a: { b: { z: 'qux', y: 1 } } })
    })
    */
    (0, node_test_1.test)('pref-basic', () => {
        (0, expect_1.expect)(G('pref(1)')).equal(1);
        (0, expect_1.expect)(G('pref(abc)')).equal('abc');
        (0, expect_1.expect)(G('pref(true)')).equal(true);
        (0, expect_1.expect)(G('pref({x:1})')).equal({ x: 1 });
        (0, expect_1.expect)(G('pref([1,2])')).equal([1, 2]);
    });
    (0, node_test_1.test)('pref-canon', () => {
        // Test canonical representation shows preference wrapping
        const N = (x) => new unify_1.Unify(x, lang)
            .res.canon;
        (0, expect_1.expect)(N('pref(1)')).equal('*1');
        (0, expect_1.expect)(N('pref(foo)')).equal('*"foo"');
        (0, expect_1.expect)(N('pref({x:1})')).equal('{"x":*1}');
        (0, expect_1.expect)(N('pref([1,2])')).equal('[*1,*2]');
        (0, expect_1.expect)(N('pref({x:{y:1}})')).equal('{"x":{"y":*1}}');
    });
    (0, node_test_1.test)('pref-wrapping', () => {
        // Test that pref() wraps values in PrefVal
        (0, expect_1.expect)(G('pref(1) & number')).equal(1);
        (0, expect_1.expect)(G('pref(foo) & string')).equal('foo');
        (0, expect_1.expect)(G('number & pref(2)')).equal(2);
        (0, expect_1.expect)(G('string & pref(bar)')).equal('bar');
    });
    (0, node_test_1.test)('pref-deep-structure', () => {
        (0, expect_1.expect)(G('pref({x:{y:1}})')).equal({ x: { y: 1 } });
        (0, expect_1.expect)(G('pref([{a:1},{b:2}])')).equal([{ a: 1 }, { b: 2 }]);
        (0, expect_1.expect)(G('pref({x:[1,{y:2}]})')).equal({ x: [1, { y: 2 }] });
    });
    (0, node_test_1.test)('pref-double-wrap', () => {
        const N = (x) => new unify_1.Unify(x, lang)
            .res.canon;
        // Test double-wrapping behavior in canon
        (0, expect_1.expect)(N('pref(pref(1))')).equal('**1');
        (0, expect_1.expect)(N('pref(pref({x:1}))')).equal('{"x":**1}');
        (0, expect_1.expect)(N('pref(pref([1,2]))')).equal('[**1,**2]');
        // Test double-wrapping behavior in generation
        (0, expect_1.expect)(G('pref(pref(1))')).equal(1);
        (0, expect_1.expect)(G('pref(pref({x:1}))')).equal({ x: 1 });
        (0, expect_1.expect)(G('pref(pref([1,2]))')).equal([1, 2]);
    });
    (0, node_test_1.test)('pref-unification', () => {
        // Test preference behavior in unification
        (0, expect_1.expect)(G('pref(1) & 1')).equal(1);
        (0, expect_1.expect)(G('pref(foo) & foo')).equal('foo');
        (0, expect_1.expect)(G('pref({x:1}) & {x:1}')).equal({ x: 1 });
        (0, expect_1.expect)(G('pref({x:1}) & {x:number}')).equal({ x: 1 });
    });
    (0, node_test_1.test)('pref-expr', () => {
        (0, expect_1.expect)(G('pref(1)+2')).equal(3);
        (0, expect_1.expect)(G('2+pref(3)')).equal(5);
        (0, expect_1.expect)(G('(pref(4))')).equal(4);
        (0, expect_1.expect)(G('(pref(5)+1)')).equal(6);
        (0, expect_1.expect)(G('pref(a)+pref(b)')).equal('ab');
    });
    (0, node_test_1.test)('pref-path', () => {
        (0, expect_1.expect)(G('x:1 y:pref($.x)')).equal({ x: 1, y: 1 });
        (0, expect_1.expect)(G('x:{a:2} y:pref($.x.a)')).equal({ x: { a: 2 }, y: 2 });
        (0, expect_1.expect)(G('x:3 y:{z:pref($.x)}')).equal({ x: 3, y: { z: 3 } });
        (0, expect_1.expect)(G('x:{a:1,b:2} y:pref($.x)')).equal({ x: { a: 1, b: 2 }, y: { a: 1, b: 2 } });
    });
    (0, node_test_1.test)('close-basic', () => {
        (0, expect_1.expect)(G('close({x:1})')).equal({ x: 1 });
        (0, expect_1.expect)(G('close([1,2])')).equal([1, 2]);
        (0, expect_1.expect)(G('close(42)')).equal(42);
        (0, expect_1.expect)(G('close(hello)')).equal('hello');
        (0, expect_1.expect)(G('close(true)')).equal(true);
    });
    (0, node_test_1.test)('close-functionality', () => {
        // Test that close() prevents additional properties from being unified
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        (0, expect_1.expect)(() => G('close({x:1}) & {y:2}')).throw(/closed/);
        (0, expect_1.expect)(() => G('close([1,2]) & [3,4,5]')).throw(/closed/);
        (0, expect_1.expect)(G('close({x:1}) & {x:1}')).equal({ x: 1 });
        (0, expect_1.expect)(G('close({x:1}) & {x:number}')).equal({ x: 1 });
    });
    /*
      test('close-expr', () => {
        expect(G('close({x:1}).x')).equal(1)
        expect(G('close([1,2])[0]')).equal(1)
      })
    */
    (0, node_test_1.test)('close-path', () => {
        (0, expect_1.expect)(G('x:{a:1} y:close($.x)')).equal({ x: { a: 1 }, y: { a: 1 } });
        (0, expect_1.expect)(G('x:[1,2] y:close($.x)')).equal({ x: [1, 2], y: [1, 2] });
    });
    (0, node_test_1.test)('open-basic', () => {
        (0, expect_1.expect)(G('open({x:1})')).equal({ x: 1 });
        (0, expect_1.expect)(G('open([1,2])')).equal([1, 2]);
        (0, expect_1.expect)(G('open(42)')).equal(42);
        (0, expect_1.expect)(G('open(hello)')).equal('hello');
        (0, expect_1.expect)(G('open(true)')).equal(true);
    });
    /*
    test('open-functionality', () => {
      // Test that open() allows additional properties to be unified
      const a0 = new Aontu()
      const G = a0.generate.bind(a0)
  
      expect(G('open({x:1}) & {y:2}')).equal({ x: 1, y: 2 })
      expect(G('open([1,2]) & [3,4,5]')).equal([3, 4, 5])
      expect(G('open({x:1}) & {x:number}')).equal({ x: 1 })
    })
    */
    (0, node_test_1.test)('open-close-interaction', () => {
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        // Test opening a previously closed object
        (0, expect_1.expect)(G('open(close({x:1})) & {y:2}')).equal({ x: 1, y: 2 });
        // expect(G('close(open({x:1})) & {y:2}')).throw(/closed/)
    });
    /*
      test('type-basic', () => {
        expect(G('type(1)')).equal(1)
        expect(G('type(hello)')).equal('hello')
        expect(G('type(true)')).equal(true)
        expect(G('type({x:1})')).equal({ x: 1 })
        expect(G('type([1,2])')).equal([1, 2])
      })
    */
    (0, node_test_1.test)('type-functionality', () => {
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        // type() should mark values as type constraints
        (0, expect_1.expect)(G('type(1) & number')).equal(1);
        (0, expect_1.expect)(G('type(hello) & string')).equal('hello');
        (0, expect_1.expect)(G('type(true) & boolean')).equal(true);
        (0, expect_1.expect)(G('number & type(42)')).equal(42);
        (0, expect_1.expect)(G('string & type(world)')).equal('world');
    });
    (0, node_test_1.test)('type-canon', () => {
        const N = (x, _ctx) => new unify_1.Unify(x, lang)
            .res.canon;
        (0, expect_1.expect)(N('type(1)')).equal('1'); // TODO: perhaps 1/type ?
        (0, expect_1.expect)(N('type(foo)')).equal('"foo"');
        (0, expect_1.expect)(N('type({x:1})')).equal('{"x":1}');
        (0, expect_1.expect)(N('type([1,2])')).equal('[1,2]');
    });
    (0, node_test_1.test)('super-basic', () => {
        // super() with NO argument is refused at parse: super takes exactly
        // one, and arity is checked for every built-in (issue #51). It used
        // to be a silent no-op returning the func's own superior, which is
        // TOP -- so the call generated `undefined` and said nothing about
        // the missing argument.
        (0, expect_1.expect)(() => G('super()')).throws(/aontu\/func_arity/);
        // super(1) is the KIND `integer`, which is a type value and so does
        // not generate on its own -- meet it with a member to see it.
        (0, expect_1.expect)(G('a:super(1)&2')).equal({ a: 2 });
    });
    (0, node_test_1.test)('super-functionality', () => {
        // super() climbs the lattice from its ARGUMENT, so it needs one --
        // see super-basic for the no-argument case, which is now refused.
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        (0, expect_1.expect)(G('a:super(1.5)&2.5')).equal({ a: 2.5 });
        (0, expect_1.expect)(G('a:super(a)&"z"')).equal({ a: 'z' });
        (0, expect_1.expect)(G('a:super(true)&false')).equal({ a: false });
    });
    (0, node_test_1.test)('hide-functionality', () => {
        const a0 = new __1.Aontu();
        const G = a0.generate.bind(a0);
        // hide() should mark values as hidden from generation
        (0, expect_1.expect)(G('hide(1) & number')).equal(1);
        (0, expect_1.expect)(G('hide(hello) & string')).equal('hello');
        (0, expect_1.expect)(G('hide(true) & boolean')).equal(true);
        (0, expect_1.expect)(G('number & hide(42)')).equal(42);
        (0, expect_1.expect)(G('string & hide(world)')).equal('world');
    });
    (0, node_test_1.test)('hide-canon', () => {
        // Test canonical representation shows hide wrapping
        const N = (x, _ctx) => new unify_1.Unify(x, lang)
            .res.canon;
        (0, expect_1.expect)(N('hide(1)')).equal('1');
        (0, expect_1.expect)(N('hide(foo)')).equal('"foo"');
        (0, expect_1.expect)(N('hide({x:1})')).equal('{"x":1}');
        (0, expect_1.expect)(N('hide([1,2])')).equal('[1,2]');
    });
    (0, node_test_1.test)('hide-top', () => {
        (0, expect_1.expect)(G('a:hide(top) b:1')).equal({ b: 1 });
    });
    (0, node_test_1.test)('path-canon', () => {
        const N = (x) => new unify_1.Unify(x, lang).res.canon;
        // A string argument is ADDRESS TEXT (docs/design/PATHS.0.md):
        // capture reads it by the address grammar, so an anchorless
        // spelling refuses (path_address) instead of resolving a sibling.
        (0, expect_1.expect)(N('path("foo")')).equal('nil');
        (0, expect_1.expect)(N('path("foo.bar")')).equal('nil');
        (0, expect_1.expect)(N('path(".foo")')).equal('path(.foo)');
        (0, expect_1.expect)(N('path("$.a.b")')).equal('path($.a.b)');
        (0, expect_1.expect)(N('path("foo-bar")')).equal('nil');
        (0, expect_1.expect)(N('path()')).equal('path()');
        (0, expect_1.expect)(N('path("")')).equal('nil');
    });
    (0, node_test_1.test)('path-number', () => {
        const N = (x) => new unify_1.Unify(x, lang).res.canon;
        // A lone float is a NUMBER argument, refused as invalid-arg; a
        // multi-dot numeric term parses as a reference and captures as a
        // relative address of numeric segments -- a list index is
        // addressable, so the segments are legitimate.
        (0, expect_1.expect)(N('path(0.2)')).equal('nil');
        (0, expect_1.expect)(N('path(1.2)')).equal('nil');
        (0, expect_1.expect)(N('path(1.2.3)')).equal('path(.1.2.3)');
        (0, expect_1.expect)(N('path(1.2.3.4)')).equal('path(.1.2.3.4)');
        (0, expect_1.expect)(N('path(0.1.2)')).equal('path(.0.1.2)');
        (0, expect_1.expect)(N('path(0.1.2.3)')).equal('path(.0.1.2.3)');
        (0, expect_1.expect)(N('path(0.1.2.3.4)')).equal('path(.0.1.2.3.4)');
        (0, expect_1.expect)(N('path(1.0)')).equal('nil');
        (0, expect_1.expect)(N('path(10.20)')).equal('nil');
        (0, expect_1.expect)(N('path(3.14)')).equal('nil');
        (0, expect_1.expect)(N('path(.1)')).equal('path(.1)');
    });
});
//# sourceMappingURL=func.test.js.map