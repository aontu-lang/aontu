"use strict";
/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const lang_1 = require("../dist/lang");
const unify_1 = require("../dist/unify");
const ctx_1 = require("../dist/ctx");
const top_1 = require("../dist/val/top");
const TOP = (0, top_1.top)();
const expect_1 = require("./expect");
const MapVal_1 = require("../dist/val/MapVal");
const srcpath_1 = require("./srcpath");
let lang = new lang_1.Lang();
let P = lang.parse.bind(lang);
(0, node_test_1.describe)('lang', function () {
    (0, node_test_1.it)('happy', () => {
        (0, expect_1.expect)(P('1').canon).equal('1');
        (0, expect_1.expect)(P('a:1').canon).equal('{"a":1}');
        (0, expect_1.expect)(P('{a:{b:x}}').canon).equal('{"a":{"b":"x"}}');
        (0, expect_1.expect)(P('a:11|22,b:33', { xlog: -1 }).canon).equal('{"a":11|22,"b":33}');
        (0, expect_1.expect)(P('a:11|22|33,b:44', { xlog: -1 }).canon).equal('{"a":(11|22)|33,"b":44}');
        (0, expect_1.expect)(P('a:{b:11}|{c:22},b:33', { xlog: -1 }).canon)
            .equal('{"a":{"b":11}|{"c":22},"b":33}');
        (0, expect_1.expect)(P('a:11&22,b:33', { xlog: -1 }).canon).equal('{"a":11&22,"b":33}');
        (0, expect_1.expect)(P('a:11&22&33,b:44', { xlog: -1 }).canon).equal('{"a":(11&22)&33,"b":44}');
        (0, expect_1.expect)(P('a:{b:11}&{c:22},b:33', { xlog: -1 }).canon)
            .equal('{"a":{"b":11}&{"c":22},"b":33}');
        (0, expect_1.expect)(P('a:11&22|33,b:44', { xlog: -1 }).canon).equal('{"a":(11&22)|33,"b":44}');
        (0, expect_1.expect)(P('a:(11|22)&33,b:44', { xlog: -1 }).canon).equal('{"a":(11|22)&33,"b":44}');
    });
    (0, node_test_1.it)('parens', () => {
        (0, expect_1.expect)(P('(1)').canon).equal('1');
        (0, expect_1.expect)(P('(1+2)').canon).equal('1+2');
        (0, expect_1.expect)(P('1&2').canon).equal('1&2');
        (0, expect_1.expect)(P('(1&2)').canon).equal('1&2');
        (0, expect_1.expect)(P('(1&2)&3').canon).equal('(1&2)&3');
        (0, expect_1.expect)(P('1&(2&3)').canon).equal('1&(2&3)');
        (0, expect_1.expect)(P('1&(2&3)&4').canon).equal('(1&(2&3))&4');
        (0, expect_1.expect)(P('1&((2&3)&4)').canon).equal('1&((2&3)&4)');
        (0, expect_1.expect)(P('1&2|3').canon).equal('(1&2)|3');
        (0, expect_1.expect)(P('1|2&3').canon).equal('1|(2&3)');
        (0, expect_1.expect)(P('1&(2|3)').canon).equal('1&(2|3)');
        (0, expect_1.expect)(P('(1|2)&3').canon).equal('(1|2)&3');
    });
    (0, node_test_1.it)('merge', () => {
        let ctx = makeCtx();
        let v0 = P('a:{x:1},a:{y:2}');
        (0, expect_1.expect)(v0.canon).equal('{"a":{"x":1}&{"y":2}}');
        let u0 = v0.unify(TOP, ctx);
        (0, expect_1.expect)(u0.canon).equal('{"a":{"x":1,"y":2}}');
        (0, expect_1.expect)(u0.gen(ctx)).equal({ a: { x: 1, y: 2 } });
        let v1 = P('a:b:{x:1},a:b:{y:2}');
        (0, expect_1.expect)(v1.canon).equal('{"a":{"b":{"x":1}}&{"b":{"y":2}}}');
        let u1 = v1.unify(TOP, ctx);
        (0, expect_1.expect)(u1.canon).equal('{"a":{"b":{"x":1,"y":2}}}');
        (0, expect_1.expect)(u1.gen(ctx)).equal({ a: { b: { x: 1, y: 2 } } });
        let v2 = P('a:b:c:{x:1},a:b:c:{y:2}');
        (0, expect_1.expect)(v2.canon).equal('{"a":{"b":{"c":{"x":1}}}&{"b":{"c":{"y":2}}}}');
        let u2 = v2.unify(TOP, ctx);
        (0, expect_1.expect)(u2.canon).equal('{"a":{"b":{"c":{"x":1,"y":2}}}}');
        (0, expect_1.expect)(u2.gen(ctx)).equal({ a: { b: { c: { x: 1, y: 2 } } } });
        let v0m = P('a:{x:1},a:{y:2},a:{z:3}');
        (0, expect_1.expect)(v0m.canon).equal('{"a":{"x":1}&{"y":2}&{"z":3}}');
        let u0m = v0m.unify(TOP, ctx);
        (0, expect_1.expect)(u0m.canon).equal('{"a":{"x":1,"y":2,"z":3}}');
        (0, expect_1.expect)(u0m.gen(ctx)).equal({ a: { x: 1, y: 2, z: 3 } });
        let v1m = P('a:b:{x:1},a:b:{y:2},a:b:{z:3}');
        (0, expect_1.expect)(v1m.canon).equal('{"a":{"b":{"x":1}}&{"b":{"y":2}}&{"b":{"z":3}}}');
        let u1m = v1m.unify(TOP, ctx);
        (0, expect_1.expect)(u1m.canon).equal('{"a":{"b":{"x":1,"y":2,"z":3}}}');
        (0, expect_1.expect)(u1m.gen(ctx)).equal({ a: { b: { x: 1, y: 2, z: 3 } } });
        let v2m = P('a:b:c:{x:1},a:b:c:{y:2},a:b:c:{z:3}');
        (0, expect_1.expect)(v2m.canon).equal('{"a":' +
            '{"b":{"c":{"x":1}}}&' +
            '{"b":{"c":{"y":2}}}&' +
            '{"b":{"c":{"z":3}}}}');
        let u2m = v2m.unify(TOP, ctx);
        (0, expect_1.expect)(u2m.canon).equal('{"a":{"b":{"c":{"x":1,"y":2,"z":3}}}}');
        (0, expect_1.expect)(u2m.gen(ctx)).equal({ a: { b: { c: { x: 1, y: 2, z: 3 } } } });
    });
    (0, node_test_1.it)('ref', () => {
        let v0 = P('a:.x');
        (0, expect_1.expect)(v0.peg.a.peg).equal(['x']);
        let v1 = P('a:.x.y', { xlog: -1 });
        (0, expect_1.expect)(v1.peg.a.peg).equal(['x', 'y']);
    });
    (0, node_test_1.it)('file', () => {
        let ctx = makeCtx();
        if (undefined !== global.window) {
            return;
        }
        global.console = require('console');
        let g0 = new lang_1.Lang({
        // resolver: makeFileResolver((spec: any) => {
        //   return 'string' === typeof spec ? spec : spec?.peg
        // })
        // debug: true,
        // trace: true,
        });
        let t00x = g0.parse('x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"');
        (0, expect_1.expect)(t00x.canon).equal('{"x":{"a":1}}');
        let t00xA = g0.parse('A:11,x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"');
        (0, expect_1.expect)(t00xA.canon).equal('{"A":11,"x":{"a":1}}');
        let t00xB = g0.parse('x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon",B:22');
        (0, expect_1.expect)(t00xB.canon).equal('{"B":22,"x":{"a":1}}');
        let t00xAB = g0.parse('A:11,x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon",B:22');
        (0, expect_1.expect)(t00xAB.canon).equal('{"A":11,"B":22,"x":{"a":1}}');
        let t00xAs = g0.parse('A:11 x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"');
        (0, expect_1.expect)(t00xAs.canon).equal('{"A":11,"x":{"a":1}}');
        let t00xBs = g0.parse('x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon" B:22');
        (0, expect_1.expect)(t00xBs.canon).equal('{"B":22,"x":{"a":1}}');
        let t00xABs = g0.parse('A:11 x:@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon" B:22');
        (0, expect_1.expect)(t00xABs.canon).equal('{"A":11,"B":22,"x":{"a":1}}');
        let t00v = g0.parse('@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"');
        (0, expect_1.expect)(t00v.canon).equal('{}&{"a":1}');
        let t00 = new unify_1.Unify(t00v);
        (0, expect_1.expect)(t00.res.canon).equal('{"a":1}');
        (0, expect_1.expect)(t00.res.gen(ctx)).equal({ a: 1 });
        let t00vX = g0.parse(' X:11 @"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"');
        (0, expect_1.expect)(t00vX.canon).equal('{"X":11}&{"a":1}');
        let t00X = new unify_1.Unify(t00vX);
        (0, expect_1.expect)(t00X.res.canon).equal('{"X":11,"a":1}');
        (0, expect_1.expect)(t00X.res.gen(ctx)).equal({ X: 11, a: 1 });
        let t00vY = g0.parse('@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon" Y:22 ');
        (0, expect_1.expect)(t00vY.canon).equal('{"Y":22}&{"a":1}');
        let t00Y = new unify_1.Unify(t00vY);
        (0, expect_1.expect)(t00Y.res.canon).equal('{"Y":22,"a":1}');
        (0, expect_1.expect)(t00Y.res.gen(ctx)).equal({ Y: 22, a: 1 });
        let t00dv = g0.parse('D:{@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t00.aon"}');
        (0, expect_1.expect)(t00dv.canon).equal('{"D":{}&{"a":1}}');
        let t00d = new unify_1.Unify(t00dv);
        (0, expect_1.expect)(t00d.res.canon).equal('{"D":{"a":1}}');
        (0, expect_1.expect)(t00d.res.gen(ctx)).equal({ D: { a: 1 } });
        let t01v = g0.parse('@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t01.aontu"');
        (0, expect_1.expect)(t01v.canon).equal('{}&{"a":1,"b":{"d":2},"c":3}');
        let t02v = g0.parse('@"' + (0, srcpath_1.srcPath)(__dirname) + '/../test/t02.aon"');
        (0, expect_1.expect)(t02v.canon).equal('{}&({"x":1}&{"y":2})');
        let t00m = g0.parse(`
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t00.aon"
    `);
        (0, expect_1.expect)(t00m.canon).equal('{}&{"a":1}');
        let t01m = g0.parse(`
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t00.aon"
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t04.aon"
    `);
        (0, expect_1.expect)(t01m.canon).equal('{}&{"a":1}&{"b":2}');
        let t02m = g0.parse(`
    x: 11
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t00.aon"
    y: 22
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t04.aon"
    z: 33
    `);
        (0, expect_1.expect)(t02m.canon).equal('{"x":11,"y":22,"z":33}&{"a":1}&{"b":2}');
        let t03m = g0.parse(`
    x:y:{}
    @"` + (0, srcpath_1.srcPath)(__dirname) + `/../test/t00.aon"
    `);
        (0, expect_1.expect)(t03m.canon).equal('{"x":{"y":{}}}&{"a":1}');
    });
    (0, node_test_1.it)('conjunct', () => {
        (0, expect_1.expect)(P('1&number').canon).equal('1&number');
        (0, expect_1.expect)(P('number&1').canon).equal('number&1');
        // FIX
        // expect(() => P('*1&number')).throws()
        // expect(() => P('number&*1')).throws()
        (0, expect_1.expect)(P('{a:1}&{b:2}').canon).equal('{"a":1}&{"b":2}');
        (0, expect_1.expect)(P('{a:{c:1}}&{b:{d:2}}').canon).equal('{"a":{"c":1}}&{"b":{"d":2}}');
        // FIX
        // expect(() => P('*1')).throws()
    });
    (0, node_test_1.it)('disjunct', () => {
        // FIX
        // expect(() => P('*1')).throws()
        let v0 = P('1|number');
        (0, expect_1.expect)(v0.canon).equal('1|number');
        let v1 = P('*1|number', { xlog: -1 });
        (0, expect_1.expect)(v1.canon).equal('*1|number');
        let v2 = P('integer|*2', { xlog: -1 });
        (0, expect_1.expect)(v2.canon).equal('integer|*2');
    });
    (0, node_test_1.it)('precedence', () => {
        let v0 = P('a:b:1&2');
        (0, expect_1.expect)(v0.canon).equal('{"a":{"b":1&2}}');
    });
    (0, node_test_1.it)('spreads', () => {
        let ctx = makeCtx();
        let v0 = P('a:{&:{x:1,y:integer},b:{y:1},c:{y:2}}');
        (0, expect_1.expect)(v0.canon).equal('{"a":{&:{"x":1,"y":integer},"b":{"y":1},"c":{"y":2}}}');
        let u0 = v0.unify(TOP, ctx);
        (0, expect_1.expect)(u0.canon)
            .equal('{"a":{&:{"x":1,"y":integer},"b":{"x":1,"y":1},"c":{"x":1,"y":2}}}');
        let v1 = P('k:{x:1,y:integer},a:{&:$.k,b:{y:1},c:{y:2}}');
        (0, expect_1.expect)(v1.canon)
            .equal('{"a":{&:$.k,"b":{"y":1},"c":{"y":2}},"k":{"x":1,"y":integer}}');
        let c1 = makeCtx({ root: v1 });
        let u1a = v1.unify(TOP, c1);
        (0, expect_1.expect)(u1a.canon).
            equal('{"a":{&:$.k,"b":{"x":1,"y":1},"c":{"x":1,"y":2}},' +
            '"k":{"x":1,"y":integer}}');
        let v2 = P('a:{&:number},a:{x:1},a:{y:2}');
        (0, expect_1.expect)(v2.canon).equal('{"a":{&:number}&{"x":1}&{"y":2}}');
        let u2 = v2.unify(TOP, ctx);
        (0, expect_1.expect)(u2.canon).equal('{"a":{&:number,"x":1,"y":2}}');
        let v3 = P('a:{&:number,z:3},a:{x:1},a:{y:2}');
        (0, expect_1.expect)(v3.canon).equal('{"a":{&:number,"z":3}&{"x":1}&{"y":2}}');
        let u3 = v3.unify(TOP, ctx);
        (0, expect_1.expect)(u3.canon).equal('{"a":{&:number,"x":1,"y":2,"z":3}}');
        let v4 = P('b:{a:{&:number,z:3},a:{x:1},a:{y:2}}');
        (0, expect_1.expect)(v4.canon).equal('{"b":{"a":{&:number,"z":3}&{"x":1}&{"y":2}}}');
        let u4 = v4.unify(TOP, ctx);
        (0, expect_1.expect)(u4.canon).equal('{"b":{"a":{&:number,"x":1,"y":2,"z":3}}}');
        // Must commute!
        let v5a = P('{&:{x:1}}&{a:{y:1}}');
        let u5a = v5a.unify(TOP, ctx);
        (0, expect_1.expect)(u5a.canon).equal('{&:{"x":1},"a":{"x":1,"y":1}}');
        let v5b = P('{a:{y:1}}&{&:{x:1}}');
        let u5b = v5b.unify(TOP, ctx);
        (0, expect_1.expect)(u5b.canon).equal('{&:{"x":1},"a":{"x":1,"y":1}}');
        let v6 = P('b:{a:{&:{K:0},z:{Z:3}},a:{x:{X:1}},a:{y:{Y:2}}}');
        (0, expect_1.expect)(v6.canon)
            .equal('{"b":{"a":{&:{"K":0},"z":{"Z":3}}&{"x":{"X":1}}&{"y":{"Y":2}}}}');
        let u6 = v6.unify(TOP, ctx);
        (0, expect_1.expect)(u6.canon)
            .equal('{"b":{"a":{&:{"K":0},' +
            '"x":{"K":0,"X":1},"y":{"K":0,"Y":2},"z":{"K":0,"Z":3}}}}');
    });
    (0, node_test_1.it)('pair-spreads', () => {
        let s1 = `a:b:c:1 z:2`;
        (0, expect_1.expect)(P(s1).canon).equal('{"a":{"b":{"c":1}},"z":2}');
        let s1_1 = `a:&:b:1 z:2`;
        (0, expect_1.expect)(P(s1_1).canon).equal('{"a":{&:{"b":1}},"z":2}');
        let s1_2 = `a:&:{b:1} z:2`;
        (0, expect_1.expect)(P(s1_2).canon).equal('{"a":{&:{"b":1}},"z":2}');
        let s1_3 = `a:{&:{b:1}} z:2`;
        (0, expect_1.expect)(P(s1_3).canon).equal('{"a":{&:{"b":1}},"z":2}');
        let s1_4 = `{a:{&:{b:1}} z:2}`;
        (0, expect_1.expect)(P(s1_4).canon).equal('{"a":{&:{"b":1}},"z":2}');
        let s2 = `a:&:b:&:1 z:2`;
        (0, expect_1.expect)(P(s2).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}');
        let s2_1 = `a:&:b:{&:1} z:2`;
        (0, expect_1.expect)(P(s2_1).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}');
        let s2_2 = `a:&:{b:{&:1}} z:2`;
        (0, expect_1.expect)(P(s2_2).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}');
        let s2_3 = `a:{&:{b:{&:1}}} z:2`;
        (0, expect_1.expect)(P(s2_3).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}');
        let s2_4 = `{a:{&:{b:{&:1}}} z:2}`;
        (0, expect_1.expect)(P(s2_4).canon).equal('{"a":{&:{"b":{&:1}}},"z":2}');
        let s3 = `a:&:b:&:c:1 z:2`;
        (0, expect_1.expect)(P(s3).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}');
        let s4 = `a:&:b:&:{c:1} z:2`;
        (0, expect_1.expect)(P(s4).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}');
        let s5 = `a:&:{b:&:c:1} z:2`;
        (0, expect_1.expect)(P(s5).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}');
        let s6 = `a:&:{b:&:{c:1}} z:2`;
        (0, expect_1.expect)(P(s6).canon).equal('{"a":{&:{"b":{&:{"c":1}}}},"z":2}');
    });
    (0, node_test_1.it)('source', () => {
        P(`
  a: {
  b: {
    c: 1
    d: 2 & 3 
  }
  }
  `);
    });
    (0, node_test_1.it)('edge-top-spreads', () => {
        let ctx = makeCtx();
        let v0 = P('a:b &:string');
        (0, expect_1.expect)(v0.canon).equal('{&:string,"a":"b"}');
        (0, expect_1.expect)(v0.gen(ctx)).equal({ a: 'b' });
        let v1 = P(' &:string a:b &:string');
        (0, expect_1.expect)(v1.canon).equal('{&:string&string,"a":"b"}');
        (0, expect_1.expect)(v1.gen(ctx)).equal({ a: 'b' });
        let v2 = P(' &:string &:string a:b &:string');
        (0, expect_1.expect)(v2.canon).equal('{&:string&string&string,"a":"b"}');
        (0, expect_1.expect)(v2.gen(ctx)).equal({ a: 'b' });
        let v3 = P('&:string &:string a:b &:string &:string');
        (0, expect_1.expect)(v3.canon).equal('{&:string&string&string&string,"a":"b"}');
        (0, expect_1.expect)(v3.gen(ctx)).equal({ a: 'b' });
        let v4 = P('a:&:string');
        (0, expect_1.expect)(v4.canon).equal('{"a":{&:string}}');
        (0, expect_1.expect)(v4.gen(ctx)).equal({ a: {} });
        let v5 = P('a:b:c a:d:e');
        (0, expect_1.expect)(v5.canon).equal('{"a":{"b":"c"}&{"d":"e"}}');
        (0, expect_1.expect)(v5.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c', d: 'e' } });
        let v6 = P('a:b:c a:&:string');
        (0, expect_1.expect)(v6.canon).equal('{"a":{"b":"c"}&{&:string}}');
        (0, expect_1.expect)(v6.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c' } });
        let v7 = P('a:&:c a:&:string');
        (0, expect_1.expect)(v7.canon).equal('{"a":{&:"c"}&{&:string}}');
        (0, expect_1.expect)(v7.unify(TOP, makeCtx()).gen(ctx)).equal({ a: {} });
        let v8 = P('a:&:c a:&:string a:b:c');
        (0, expect_1.expect)(v8.canon).equal('{"a":{&:"c"}&{&:string}&{"b":"c"}}');
        (0, expect_1.expect)(v8.unify(TOP, makeCtx()).gen(ctx)).equal({ a: { b: 'c' } });
        let v9 = P('&:c &:string');
        (0, expect_1.expect)(v9.canon).equal('{&:"c"&string}');
        (0, expect_1.expect)(v9.unify(TOP, makeCtx()).gen(ctx)).equal({});
        let v10 = P('&:b &:string a:b');
        (0, expect_1.expect)(v10.canon).equal('{&:"b"&string,"a":"b"}');
        (0, expect_1.expect)(v10.unify(TOP, makeCtx()).gen(ctx)).equal({ a: 'b' });
    });
    // PARSE-level canon of nested junctions: a junction child that is
    // itself a junction with more than one term is parenthesised
    // (JunctionVal.canon), so the text reparses to the same structure.
    // No spec mode observes parse-level canon (the shared suite is
    // unify-level), so this table is pinned by per-port twins: the Go
    // twin with the SAME rows is TestParseCanonNestedJunctions in
    // go/aontu_test.go. Closes the issue #30 divergence.
    (0, node_test_1.it)('parse-canon-nested-junctions', () => {
        const rows = [
            ['a:(1|2)&3', '{"a":(1|2)&3}'],
            ['a:1|2&3', '{"a":1|(2&3)}'],
            ['a:1&2|3', '{"a":(1&2)|3}'],
            ['a:(1&2)|3', '{"a":(1&2)|3}'],
            ['a:1|2|3', '{"a":(1|2)|3}'],
            ['a:1&2&3', '{"a":(1&2)&3}'],
            ['a:(1|2)&(3|4)', '{"a":(1|2)&(3|4)}'],
            ['a:1&(2|3)&4', '{"a":(1&(2|3))&4}'],
        ];
        for (const [src, canon] of rows) {
            (0, expect_1.expect)(P(src).canon).equal(canon);
        }
    });
});
function makeCtx(opts) {
    return new ctx_1.AontuContext(opts || { root: new MapVal_1.MapVal({ peg: {} }) });
}
//# sourceMappingURL=lang.test.js.map