"use strict";
/* Copyright (c) 2020-2025 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const __1 = require("..");
const type_1 = require("../dist/type");
const lang_1 = require("../dist/lang");
const unify_1 = require("../dist/unify");
const ctx_1 = require("../dist/ctx");
const expect_1 = require("./expect");
const unify_2 = require("../dist/unify");
const ConjunctVal_1 = require("../dist/val/ConjunctVal");
const DisjunctVal_1 = require("../dist/val/DisjunctVal");
const ListVal_1 = require("../dist/val/ListVal");
const MapVal_1 = require("../dist/val/MapVal");
const NilVal_1 = require("../dist/val/NilVal");
const PrefVal_1 = require("../dist/val/PrefVal");
const RefVal_1 = require("../dist/val/RefVal");
const VarVal_1 = require("../dist/val/VarVal");
const NumberVal_1 = require("../dist/val/NumberVal");
const StringVal_1 = require("../dist/val/StringVal");
const BooleanVal_1 = require("../dist/val/BooleanVal");
const IntegerVal_1 = require("../dist/val/IntegerVal");
const NullVal_1 = require("../dist/val/NullVal");
const ScalarKindVal_1 = require("../dist/val/ScalarKindVal");
const top_1 = require("../dist/val/top");
const TOP = (0, top_1.top)();
const lang = new lang_1.Lang();
const PL = lang.parse.bind(lang);
const P = (x, ctx) => PL(x, ctx);
const PA = (x, ctx) => x.map(s => PL(s, ctx));
// const D = (x: any) => console.dir(x, { depth: null })
const UC = (s, r) => (r = P(s)).unify(TOP, makeCtx(r))?.canon;
const GC = (x, ctx) => new unify_1.Unify(x, undefined, ctx).res.gen(ctx);
const N = (x, _ctx) => new unify_1.Unify(x, lang).res.canon;
const A = new __1.Aontu();
const G = (s, _ctx) => A.generate(s);
const makeSK_String = () => new ScalarKindVal_1.ScalarKindVal({ peg: String });
const makeSK_Number = () => new ScalarKindVal_1.ScalarKindVal({ peg: Number });
const makeSK_Integer = () => new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.Integer });
const makeSK_Float = () => new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.Float });
const makeSK_Boolean = () => new ScalarKindVal_1.ScalarKindVal({ peg: Boolean });
const makeBooleanVal = (v) => new BooleanVal_1.BooleanVal({ peg: v });
const makeNumberVal = (v, c) => new NumberVal_1.NumberVal({ peg: v }, c);
const makeIntegerVal = (v, c) => new IntegerVal_1.IntegerVal({ peg: v }, c);
(0, node_test_1.describe)('val-basic', function () {
    (0, node_test_1.beforeEach)(() => {
        global.console = require('console');
    });
    (0, node_test_1.it)('canon', () => {
        (0, expect_1.expect)(P('1').canon).equal('1');
        (0, expect_1.expect)(P('"a"').canon).equal('"a"');
        (0, expect_1.expect)(P('b').canon).equal('"b"');
        (0, expect_1.expect)(P('true').canon).equal('true');
        (0, expect_1.expect)(P('top').canon).equal('top');
        (0, expect_1.expect)(P('nil').canon).match(/^nil/);
        (0, expect_1.expect)(P('a:1').canon).equal('{"a":1}');
        (0, expect_1.expect)(P('a:1,b:nil').canon).match(/^\{"a":1,"b":nil/);
        (0, expect_1.expect)(P('a:1,b:c:2').canon).equal('{"a":1,"b":{"c":2}}');
    });
    (0, node_test_1.it)('gen', () => {
        let ctx = makeCtx();
        // expect(P('1').gen(ctx)).equal(1)
        // expect(P('"a"').gen(ctx)).equal('a')
        // expect(P('b').gen(ctx)).equal('b')
        // expect(P('true').gen(ctx)).equal(true)
        // expect(P('top').gen(ctx)).equal(undefined)
        // expect(P('a:1').gen(ctx)).equal({ a: 1 })
        // expect(P('a:1,b:c:2').gen(ctx)).equal({ a: 1, b: { c: 2 } })
        // expect(() => P('nil').gen(ctx)).throw(/literal_nil/)
        // expect(() => A.generate('a:1,b:nil')).throw(/literal_nil/)
        (0, expect_1.expect)(() => P('a:1,b:nil').gen(ctx)).throw(/literal_nil/);
    });
    (0, node_test_1.it)('scalar-kind', () => {
        (0, expect_1.expect)(makeSK_String().same(makeSK_String())).equal(true);
        (0, expect_1.expect)(makeSK_Number().same(makeSK_Number())).equal(true);
        (0, expect_1.expect)(makeSK_Boolean().same(makeSK_Boolean())).equal(true);
        (0, expect_1.expect)(makeSK_Integer().same(makeSK_Integer())).equal(true);
        (0, expect_1.expect)(makeSK_String().same(makeSK_Number())).equal(false);
        (0, expect_1.expect)(makeSK_String().same(makeSK_Boolean())).equal(false);
        (0, expect_1.expect)(makeSK_String().same(makeSK_Integer())).equal(false);
        (0, expect_1.expect)(makeSK_Number().same(makeSK_Boolean())).equal(false);
        (0, expect_1.expect)(makeSK_Number().same(makeSK_Integer())).equal(false);
        (0, expect_1.expect)(makeSK_Integer().same(makeSK_Boolean())).equal(false);
        // `float` is a distinct marker from `number` and from `integer`.
        (0, expect_1.expect)(makeSK_Float().same(makeSK_Float())).equal(true);
        (0, expect_1.expect)(makeSK_Float().same(makeSK_Number())).equal(false);
        (0, expect_1.expect)(makeSK_Float().same(makeSK_Integer())).equal(false);
    });
    // The number tower: `number` is a pure supertype over the disjoint
    // leaves `integer` and `float`. See docs/design/number-tower.md D1.
    (0, node_test_1.it)('scalar-kind-lattice', () => {
        let ctx = makeCtx();
        let tu = (a, b) => (0, unify_2.unite)(ctx, a, b, 'kind-lattice-test');
        // Canon is the keyword.
        (0, expect_1.expect)(makeSK_Number().canon).equal('number');
        (0, expect_1.expect)(makeSK_Integer().canon).equal('integer');
        (0, expect_1.expect)(makeSK_Float().canon).equal('float');
        // A concrete binary64 value is FLOAT kind, not number kind.
        (0, expect_1.expect)(makeNumberVal(1.5).kind).equal(ScalarKindVal_1.Float);
        (0, expect_1.expect)(makeIntegerVal(1).kind).equal(ScalarKindVal_1.Integer);
        // super() ladder: value -> leaf -> number -> top.
        (0, expect_1.expect)(makeNumberVal(1.5).superior().canon).equal('float');
        (0, expect_1.expect)(makeIntegerVal(1).superior().canon).equal('integer');
        (0, expect_1.expect)(makeSK_Float().superior().canon).equal('number');
        (0, expect_1.expect)(makeSK_Integer().superior().canon).equal('number');
        (0, expect_1.expect)(makeSK_Number().superior().isTop).equal(true);
        // A kind admits a concrete value of any kind at or below it.
        (0, expect_1.expect)(tu(makeSK_Float(), makeNumberVal(1.5)).canon).equal('1.5');
        (0, expect_1.expect)(tu(makeSK_Number(), makeNumberVal(1.5)).canon).equal('1.5');
        (0, expect_1.expect)(tu(makeSK_Number(), makeIntegerVal(1)).canon).equal('1');
        (0, expect_1.expect)(tu(makeSK_Float(), makeIntegerVal(1)).isNil).exist();
        (0, expect_1.expect)(tu(makeSK_Integer(), makeNumberVal(1.5)).isNil).exist();
        // Kind meets: number is the supertype, the leaves are disjoint.
        (0, expect_1.expect)(tu(makeSK_Number(), makeSK_Float()).canon).equal('float');
        (0, expect_1.expect)(tu(makeSK_Float(), makeSK_Number()).canon).equal('float');
        (0, expect_1.expect)(tu(makeSK_Number(), makeSK_Integer()).canon).equal('integer');
        (0, expect_1.expect)(tu(makeSK_Number(), makeSK_Number()).canon).equal('number');
        (0, expect_1.expect)(tu(makeSK_Float(), makeSK_Float()).canon).equal('float');
        (0, expect_1.expect)(tu(makeSK_Float(), makeSK_Integer()).isNil).exist();
        (0, expect_1.expect)(tu(makeSK_Integer(), makeSK_Float()).isNil).exist();
        (0, expect_1.expect)(tu(makeSK_Number(), makeSK_String()).isNil).exist();
    });
    (0, node_test_1.it)('boolean', () => {
        let tu = (ctx, a, b) => (0, unify_2.unite)(ctx, a, b, 'boolean-test');
        let ctx = makeCtx();
        let bt = new BooleanVal_1.BooleanVal({ peg: true }, ctx);
        let bf = new BooleanVal_1.BooleanVal({ peg: false }, ctx);
        (0, expect_1.expect)(tu(ctx, bt, bt)).equal(bt);
        (0, expect_1.expect)(tu(ctx, bf, bf)).equal(bf);
        (0, expect_1.expect)(tu(ctx, bt, bf).isNil).exist();
        (0, expect_1.expect)(tu(ctx, bf, bt).isNil).exist();
        (0, expect_1.expect)(tu(ctx, bt, TOP)).equal(bt);
        (0, expect_1.expect)(tu(ctx, bf, TOP)).equal(bf);
        (0, expect_1.expect)(tu(ctx, TOP, bt)).equal(bt);
        (0, expect_1.expect)(tu(ctx, TOP, bf)).equal(bf);
        let b0 = new NilVal_1.NilVal('test');
        (0, expect_1.expect)(tu(ctx, bt, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, bf, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, bt)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, bf)).equal(b0);
        let bs = makeSK_Boolean();
        (0, expect_1.expect)(tu(ctx, bt, bs)).equal(bt);
        (0, expect_1.expect)(tu(ctx, bs, bt)).equal(bt);
        let n0 = makeNumberVal(1);
        (0, expect_1.expect)(tu(ctx, bt, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, bf, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, bt).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, bf).isNil).exist();
        (0, expect_1.expect)(bt.same(bt)).equal(true);
        (0, expect_1.expect)(bf.same(bf)).equal(true);
        (0, expect_1.expect)(bt.same(bf)).equal(false);
        (0, expect_1.expect)(makeBooleanVal(true).same(makeBooleanVal(true))).equal(true);
        (0, expect_1.expect)(makeBooleanVal(false).same(makeBooleanVal(false))).equal(true);
        (0, expect_1.expect)(makeBooleanVal(true).same(makeBooleanVal(false))).equal(false);
    });
    (0, node_test_1.it)('string', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'string-test');
        let ctx = makeCtx();
        let s0 = new StringVal_1.StringVal({ peg: 's0' });
        let s1 = new StringVal_1.StringVal({ peg: 's1' });
        (0, expect_1.expect)(tu(ctx, s0, s0)).equal(s0);
        (0, expect_1.expect)(tu(ctx, s1, s1)).equal(s1);
        (0, expect_1.expect)(tu(ctx, s0, s1).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s1, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, TOP)).equal(s0);
        (0, expect_1.expect)(tu(ctx, s1, TOP)).equal(s1);
        (0, expect_1.expect)(tu(ctx, TOP, s0)).equal(s0);
        (0, expect_1.expect)(tu(ctx, TOP, s1)).equal(s1);
        let b0 = new NilVal_1.NilVal('test');
        (0, expect_1.expect)(tu(ctx, s0, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, s1, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, s0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, s1)).equal(b0);
        let t0 = makeSK_String();
        (0, expect_1.expect)(tu(ctx, s0, t0)).equal(s0);
        (0, expect_1.expect)(tu(ctx, t0, s0)).equal(s0);
        let n0 = makeNumberVal(1);
        (0, expect_1.expect)(tu(ctx, s0, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s1, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, s1).isNil).exist();
        (0, expect_1.expect)(s0.same(s0)).equal(true);
        (0, expect_1.expect)(new StringVal_1.StringVal({ peg: 'a' }).same(new StringVal_1.StringVal({ peg: 'a' }))).equal(true);
        (0, expect_1.expect)(new StringVal_1.StringVal({ peg: 'a' }).same(new StringVal_1.StringVal({ peg: 'b' }))).equal(false);
    });
    (0, node_test_1.it)('number', () => {
        let tu = (ctx, a, b) => (0, unify_2.unite)(ctx, a, b, 'number-test');
        let ctx = makeCtx();
        let n0 = makeNumberVal(0, ctx);
        let n1 = makeNumberVal(1.1, ctx);
        let n2 = makeNumberVal(-2, ctx);
        (0, expect_1.expect)(tu(ctx, n0, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, n0, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, n1, n1)).equal(n1);
        (0, expect_1.expect)(tu(ctx, n2, n2)).equal(n2);
        (0, expect_1.expect)(tu(ctx, n0, n1).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n1, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, n2).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n2, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n1, n2).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n2, n1).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, TOP)).equal(n0);
        (0, expect_1.expect)(tu(ctx, n1, TOP)).equal(n1);
        (0, expect_1.expect)(tu(ctx, n2, TOP)).equal(n2);
        (0, expect_1.expect)(tu(ctx, TOP, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, TOP, n1)).equal(n1);
        (0, expect_1.expect)(tu(ctx, TOP, n2)).equal(n2);
        let b0 = new NilVal_1.NilVal('test');
        (0, expect_1.expect)(tu(ctx, n0, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, n1, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, n2, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, n0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, n1)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, n2)).equal(b0);
        let t0 = makeSK_Number();
        (0, expect_1.expect)(tu(ctx, n0, t0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, t0, n0)).equal(n0);
        let s0 = new StringVal_1.StringVal({ peg: 's0' });
        (0, expect_1.expect)(tu(ctx, n0, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n1, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n2, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, n1).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, n2).isNil).exist();
        (0, expect_1.expect)(n0.same(n0)).equal(true);
        (0, expect_1.expect)(n1.same(n1)).equal(true);
        (0, expect_1.expect)(n2.same(n2)).equal(true);
        (0, expect_1.expect)(makeNumberVal(11).same(makeNumberVal(11))).equal(true);
        (0, expect_1.expect)(makeNumberVal(11).same(makeNumberVal(22))).equal(false);
    });
    (0, node_test_1.it)('number-unify', () => {
        let ctx = makeCtx();
        let n0 = makeIntegerVal(11);
        n0.mark$ = 'n0';
        let n1 = makeIntegerVal(11);
        n1.mark$ = 'n1';
        (0, expect_1.expect)(n0.unify(n1, ctx).mark$).equal('n0');
        (0, expect_1.expect)(n1.unify(n0, ctx).mark$).equal('n1');
        let tn0 = makeSK_Number();
        let ti0 = makeSK_Integer();
        (0, expect_1.expect)(n0.unify(tn0, ctx).mark$).equal('n0');
        (0, expect_1.expect)(tn0.unify(n0, ctx).mark$).equal('n0');
        (0, expect_1.expect)(n0.unify(ti0, ctx).mark$).equal('n0');
        (0, expect_1.expect)(ti0.unify(n0, ctx).mark$).equal('n0');
        let x0 = makeNumberVal(11);
        x0.mark$ = 'x0';
        let x1 = makeNumberVal(11);
        x1.mark$ = 'x1';
        (0, expect_1.expect)(x0.unify(x1, ctx).mark$).equal('x0');
        (0, expect_1.expect)(x1.unify(x0, ctx).mark$).equal('x1');
        (0, expect_1.expect)(x0.unify(tn0, ctx).mark$).equal('x0');
        (0, expect_1.expect)(tn0.unify(x0, ctx).mark$).equal('x0');
        // Integer Kind can't unify with Number Scalar
        (0, expect_1.expect)(x0.unify(ti0, ctx).isNil).equal(true);
        (0, expect_1.expect)(ti0.unify(x0, ctx).isNil).equal(true);
        // Integer and Number are distinct kinds: 11 (integer) & 11.0
        // (number) no longer cross-unify (CUE-faithful number model; see
        // AGENTS.md "Known TS/Go divergences").
        (0, expect_1.expect)(x0.unify(n0, ctx).isNil).equal(true);
        (0, expect_1.expect)(n0.unify(x0, ctx).isNil).equal(true);
        let x2 = makeNumberVal(2.2);
        x2.mark$ = 'x2';
        (0, expect_1.expect)(x2.unify(tn0, ctx).mark$).equal('x2');
        (0, expect_1.expect)(tn0.unify(x2, ctx).mark$).equal('x2');
        (0, expect_1.expect)(x2.unify(ti0, ctx).isNil).equal(true);
        (0, expect_1.expect)(ti0.unify(x2, ctx).isNil).equal(true);
        (0, expect_1.expect)(x2.unify(n0, ctx).isNil).equal(true);
        (0, expect_1.expect)(n0.unify(x2, ctx).isNil).equal(true);
    });
    (0, node_test_1.it)('number-parse', () => {
        // expect(P('0').canon).equal('0')
        // expect(P('1').canon).equal('1')
        // expect(P('2.2').canon).equal('2.2')
        // expect(P('-3').canon).equal('-3')
        // expect(P('+4').canon).equal('4')
        // const ctx = makeCtx()
        // expect(G('0', ctx)).equal(0)
        // expect(G('1', ctx)).equal(1)
        // expect(G('2.2', ctx)).equal(2.2)
        // expect(G('-3', ctx)).equal(-3)
        // expect(G('+4', ctx)).equal(4)
        const lang = new lang_1.Lang({
            // debug: true,
            // trace: true,
            // TODO: make this work
            idcount: 0
        });
        const i11 = lang.parse('(11)');
        (0, expect_1.expect)(i11).include({
            dc: -1,
            isInteger: true,
            isScalar: true,
            isVal: true,
            isTop: false,
            path: [],
            peg: 11,
            kind: ScalarKindVal_1.Integer,
        });
        // uh is lazily initialized (undefined until first push)
        (0, expect_1.expect)(i11.uh).equal(undefined);
        // err uses shared EMPTY_ERR singleton
        (0, expect_1.expect)(i11.err.length).equal(0);
        (0, expect_1.expect)(i11.site).include({
            col: 1,
            row: 1,
            url: undefined,
        });
    });
    (0, node_test_1.it)('integer', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'integer-test');
        let ctx = makeCtx();
        let n0 = makeIntegerVal(0);
        let n1 = makeIntegerVal(1);
        (0, expect_1.expect)(tu(ctx, n0, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, n1, n1)).equal(n1);
        (0, expect_1.expect)(tu(ctx, n0, n1).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n1, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, TOP)).equal(n0);
        (0, expect_1.expect)(tu(ctx, n1, TOP)).equal(n1);
        (0, expect_1.expect)(tu(ctx, TOP, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, TOP, n1)).equal(n1);
        let b0 = new NilVal_1.NilVal('test');
        (0, expect_1.expect)(tu(ctx, n0, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, n1, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, n0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, n1)).equal(b0);
        let s0 = new StringVal_1.StringVal({ peg: 's0' });
        (0, expect_1.expect)(tu(ctx, n0, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n1, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, n1).isNil).exist();
        let t0 = makeSK_Integer();
        (0, expect_1.expect)(tu(ctx, n0, t0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, t0, n0)).equal(n0);
        let t1 = makeSK_Number();
        (0, expect_1.expect)(tu(ctx, n0, t1)).equal(n0);
        (0, expect_1.expect)(tu(ctx, t1, n0)).equal(n0);
        (0, expect_1.expect)(tu(ctx, t0, t1)).equal(t0);
        (0, expect_1.expect)(tu(ctx, t1, t0)).equal(t0);
        let x0 = makeNumberVal(0);
        // Integer 0 and Number 0 are distinct kinds and do not unify.
        (0, expect_1.expect)(tu(ctx, n0, x0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, x0, n0).isNil).exist();
        (0, expect_1.expect)(n0.same(n0)).equal(true);
        (0, expect_1.expect)(makeIntegerVal(11).same(makeIntegerVal(11))).equal(true);
        (0, expect_1.expect)(makeIntegerVal(11).same(makeIntegerVal(22))).equal(false);
    });
    (0, node_test_1.it)('null', () => {
        let tu = (ctx, a, b) => (0, unify_2.unite)(ctx, a, b, 'null-test');
        let ctx = makeCtx();
        let nv = new NullVal_1.NullVal({}, ctx);
        let bv = new BooleanVal_1.BooleanVal({ peg: true }, ctx);
        let mv = new NumberVal_1.NumberVal({ peg: 2.2 }, ctx);
        let iv = new IntegerVal_1.IntegerVal({ peg: 2 }, ctx);
        let sv = new StringVal_1.StringVal({ peg: 'a' }, ctx);
        (0, expect_1.expect)(tu(ctx, nv, nv)).equal(nv);
        (0, expect_1.expect)(tu(ctx, nv, bv).isNil).exist();
        (0, expect_1.expect)(tu(ctx, nv, mv).isNil).exist();
        (0, expect_1.expect)(tu(ctx, nv, iv).isNil).exist();
        (0, expect_1.expect)(tu(ctx, nv, sv).isNil).exist();
    });
    (0, node_test_1.it)('map', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'integer-test');
        let ctx = makeCtx();
        let m0 = new MapVal_1.MapVal({ peg: {} });
        (0, expect_1.expect)(m0.canon).equal('{}');
        // TODO: update
        (0, expect_1.expect)(tu(ctx, m0, m0).canon).equal('{}');
        (0, expect_1.expect)(tu(ctx, m0, TOP).canon).equal('{}');
        (0, expect_1.expect)(tu(ctx, TOP, m0).canon).equal('{}');
        let b0 = new NilVal_1.NilVal('test');
        (0, expect_1.expect)(tu(ctx, m0, b0)).equal(b0);
        (0, expect_1.expect)(tu(ctx, b0, m0)).equal(b0);
        let s0 = new StringVal_1.StringVal({ peg: 's0' });
        (0, expect_1.expect)(tu(ctx, m0, s0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, s0, m0).isNil).exist();
        let n0 = makeNumberVal(0);
        (0, expect_1.expect)(tu(ctx, m0, n0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, n0, m0).isNil).exist();
        let t0 = makeSK_String();
        (0, expect_1.expect)(tu(ctx, m0, t0).isNil).exist();
        (0, expect_1.expect)(tu(ctx, t0, m0).isNil).exist();
        // NOTE: makeNumberVal builds a NUMBER-kind 1, and number-kind canon
        // round-trips its kind, so it renders as `1.0` (an unsuffixed `1`
        // would reparse as an integer). An integer-kind 1 still canons as
        // `1` — see test/spec/number-model.tsv.
        let m1 = new MapVal_1.MapVal({ peg: { a: makeNumberVal(1) } });
        // print(m1, 'm1')
        (0, expect_1.expect)(m1.canon).equal('{"a":1.0}');
        let m1u = m1.unify(TOP, ctx);
        // print(m1u, 'm1u')
        (0, expect_1.expect)(m1u.canon).equal('{"a":1.0}');
        let u01 = m0.unify(m1, ctx);
        // print(u01, 'u01')
        (0, expect_1.expect)(u01.canon).equal('{"a":1.0}');
        (0, expect_1.expect)(m1u.canon).equal('{"a":1.0}');
        (0, expect_1.expect)(m0.canon).equal('{}');
        (0, expect_1.expect)(m1.canon).equal('{"a":1.0}');
        let u02 = m1.unify(m0, ctx);
        // print(u02, 'u02')
        (0, expect_1.expect)(u02.canon).equal('{"a":1.0}');
        (0, expect_1.expect)(m0.canon).equal('{}');
        (0, expect_1.expect)(m1.canon).equal('{"a":1.0}');
    });
    (0, node_test_1.it)('map', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'integer-test');
        let ctx = makeCtx();
        let l0 = new ListVal_1.ListVal({ peg: [] });
        (0, expect_1.expect)(l0.canon).equal('[]');
        (0, expect_1.expect)(tu(ctx, l0, l0).canon).equal('[]');
    });
    (0, node_test_1.it)('map-spread', () => {
        let ctx = makeCtx();
        let m0 = new MapVal_1.MapVal({
            peg: {
                [type_1.SPREAD]: { o: '&', v: P('{x:1}') },
                a: P('{ y: 1 }'),
                b: P('{ y: 2 }'),
            }
        });
        (0, expect_1.expect)(m0.canon).equal('{&:{"x":1},"a":{"y":1},"b":{"y":2}}');
        let u0 = m0.unify(TOP, ctx);
        (0, expect_1.expect)(u0.canon).equal('{&:{"x":1},"a":{"x":1,"y":1},"b":{"x":1,"y":2}}');
    });
    (0, node_test_1.it)('list-spread', () => {
        let ctx = makeCtx();
        let vals = [
            P('{ y: 1 }'),
            P('{ y: 2 }'),
        ];
        vals[type_1.SPREAD] = { o: '&', v: P('{x:1}') };
        let l0 = new ListVal_1.ListVal({ peg: vals });
        // console.log(l0)
        (0, expect_1.expect)(l0.canon).equal('[&:{"x":1},{"y":1},{"y":2}]');
        let u0 = l0.unify(TOP, ctx);
        (0, expect_1.expect)(u0.canon).equal('[&:{"x":1},{"x":1,"y":1},{"x":1,"y":2}]');
    });
    (0, node_test_1.it)('var', () => {
        // TODO: make Aontu.generate support this
        let q0 = new VarVal_1.VarVal({ peg: 'a' });
        (0, expect_1.expect)(q0.canon).equal('$a');
        let ctx = makeCtx();
        ctx.vars.foo = makeNumberVal(11);
        let s = 'a:$foo';
        let v0 = P(s, ctx);
        (0, expect_1.expect)(v0.canon).equal('{"a":$"foo"}');
        let g0 = GC(s, ctx);
        (0, expect_1.expect)(g0).equal({ a: 11 });
    });
    (0, node_test_1.it)('conjunct', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'integer-test');
        let ctx = makeCtx(new MapVal_1.MapVal({ peg: { x: makeIntegerVal(1) } }));
        let d0 = new ConjunctVal_1.ConjunctVal({ peg: PA(['1']) });
        let d1 = new ConjunctVal_1.ConjunctVal({ peg: PA(['1', '1']) });
        let d2 = new ConjunctVal_1.ConjunctVal({ peg: PA(['1', '2']) });
        let d3 = new ConjunctVal_1.ConjunctVal({ peg: PA(['1', 'number']) });
        let d4 = new ConjunctVal_1.ConjunctVal({ peg: PA(['1', 'number', 'integer']) });
        let d5 = new ConjunctVal_1.ConjunctVal({ peg: PA(['{a:1}']) });
        let d6 = new ConjunctVal_1.ConjunctVal({ peg: PA(['{a:1}', '{b:2}']) });
        // let d100 = new ConjunctVal([makeIntegerVal(1), new RefVal({peg:'/x')])
        let d100 = new ConjunctVal_1.ConjunctVal({
            peg: [
                makeIntegerVal(1),
                new RefVal_1.RefVal({ peg: ['x'], absolute: true })
            ]
        });
        (0, expect_1.expect)(d0.canon).equal('1');
        (0, expect_1.expect)(d1.canon).equal('1&1');
        (0, expect_1.expect)(d2.canon).equal('1&2');
        (0, expect_1.expect)(d3.canon).equal('1&number');
        (0, expect_1.expect)(d4.canon).equal('1&number&integer');
        (0, expect_1.expect)(d5.canon).equal('{"a":1}');
        (0, expect_1.expect)(d6.canon).equal('{"a":1}&{"b":2}');
        (0, expect_1.expect)(tu(ctx, d0, P('1')).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, P('1', d0), TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, d0, P('2')).canon)
            .equal('nil');
        (0, expect_1.expect)(tu(ctx, P('2'), d0).canon)
            .equal('nil');
        (0, expect_1.expect)(tu(ctx, d0, TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, TOP, d0).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, d1, TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, TOP, d1).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, d2, TOP).canon)
            .equal('nil');
        (0, expect_1.expect)(tu(ctx, TOP, d2).canon)
            .equal('nil');
        (0, expect_1.expect)(tu(ctx, d3, TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, TOP, d3).canon).equal('1');
        // TODO: term order is swapped by ConjunctVal impl - should be preserved
        (0, expect_1.expect)(tu(ctx, d100, TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, TOP, d100).canon).equal('1');
        // TODO: same for DisjunctVal
        (0, expect_1.expect)(tu(ctx, new ConjunctVal_1.ConjunctVal({ peg: [] }), TOP).canon).equal('top');
        (0, expect_1.expect)(A.parse('1 & .a')?.canon).equal('1&.a');
        (0, expect_1.expect)(A.unify('1 & .a')?.canon).equal('.a&1'); // canonical sorting
        (0, expect_1.expect)(() => A.generate('1 & .a')).throws(/conjunct/);
        (0, expect_1.expect)(A.parse('.a & 1')?.canon).equal('.a&1');
        (0, expect_1.expect)(A.unify('.a & 1')?.canon).equal('.a&1');
        (0, expect_1.expect)(() => A.generate('.a & 1')).throws(/conjunct/);
        (0, expect_1.expect)(A.parse('1 & 1 & .a')?.canon).equal('(1&1)&.a');
        (0, expect_1.expect)(A.parse('1 & 2')?.canon).equal('1&2');
        (0, expect_1.expect)(A.parse('1 & 1 & 2')?.canon).equal('(1&1)&2');
        (0, expect_1.expect)(A.parse('1 & 1 & .a & 2')?.canon).equal('((1&1)&.a)&2');
        (0, expect_1.expect)(A.parse('1 & 1 & .a & .b')?.canon).equal('((1&1)&.a)&.b');
        (0, expect_1.expect)(A.parse('1 & 1 & .a & 1 & .b & 1')?.canon).equal('((((1&1)&.a)&1)&.b)&1');
        (0, expect_1.expect)(A.parse('1 & 2 | 3')?.canon).equal('(1&2)|3');
        (0, expect_1.expect)(A.parse('1 | 2 & 3')?.canon).equal('1|(2&3)');
    });
    (0, node_test_1.it)('disjunct', () => {
        let ou = unify_2.unite;
        let tu = (ctx, a, b) => ou(ctx, a, b, 'integer-test');
        let ctx = makeCtx();
        let d1 = new DisjunctVal_1.DisjunctVal({ peg: [P('1'), P('2')] });
        (0, expect_1.expect)(tu(ctx, d1, P('2')).canon).equal('2');
        (0, expect_1.expect)(tu(ctx, P('1|number'), TOP).canon).equal('1|number');
        (0, expect_1.expect)(tu(ctx, P('1|top'), TOP).canon).equal('1|top');
        (0, expect_1.expect)(tu(ctx, P('1|number|top'), TOP).canon).equal('1|number|top');
        (0, expect_1.expect)(tu(ctx, P('1|number'), TOP).gen(ctx)).equal(1);
        (0, expect_1.expect)(tu(ctx, P('1|number|top'), TOP).gen(ctx)).equal(1);
        (0, expect_1.expect)(tu(ctx, P('number|1').unify(P('top'), ctx), TOP).canon).equal('number|1');
        (0, expect_1.expect)(tu(ctx, P('1|number|1').unify(P('top'), ctx), TOP).canon).equal('1|number');
        (0, expect_1.expect)(tu(ctx, P('number|string').unify(P('top'), ctx), TOP).canon)
            .equal('number|string');
        (0, expect_1.expect)(tu(ctx, P('number|string').unify(P('1'), ctx), TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, P('number|1').unify(P('1'), ctx), TOP).canon).equal('1');
        (0, expect_1.expect)(tu(ctx, P('number|1').unify(P('number|1'), ctx), TOP).canon).equal('number|1');
        (0, expect_1.expect)(tu(ctx, P('1|number').unify(P('1|number'), ctx), TOP).canon).equal('1|number');
        (0, expect_1.expect)(tu(ctx, P('number|1').unify(P('1|number'), ctx), TOP).canon).equal('1|number');
        (0, expect_1.expect)(tu(ctx, P('number|1').unify(P('number|string'), ctx), TOP).canon)
            .equal('number|1');
        (0, expect_1.expect)(tu(ctx, P('number|string').unify(P('boolean|number'), ctx), TOP).canon)
            .equal('number');
        (0, expect_1.expect)(tu(ctx, P('number|*1').unify(P('number|*1'), ctx), TOP).canon)
            .equal('number|*1');
        let u0 = tu(ctx, P('number|*1'), P('number'));
        (0, expect_1.expect)(u0.canon).equal('number|*1');
        (0, expect_1.expect)(u0.gen(ctx)).equal(1);
        let u1 = tu(ctx, P('number|*1'), P('number|string'));
        (0, expect_1.expect)(u1.canon).equal('number|*1');
        (0, expect_1.expect)(u1.gen(ctx)).equal(1);
        let u2 = tu(ctx, P('number|*1'), P('2'));
        (0, expect_1.expect)(u2.canon).equal('2');
        (0, expect_1.expect)(u2.gen(ctx)).equal(2);
    });
    (0, node_test_1.it)('ref-conjunct', () => {
        return;
        /*
            let m0 = P(`
        a: 1
        b: /a
        c: 1 & /a
        d: 1
        e: /d & /a
        f: /b
        `, { xlog: -1 })
      
            let g = []
            g = []; console.log(m0.gen(ctx))
      
            let c0 = new AontuContext({ root: m0 })
            let u0 = m0.unify(TOP, c0)
      
            g = []; console.log(u0.gen(ctx))
      
            let c0a = new AontuContext({ root: u0 })
            let u0a = u0.unify(TOP, c0a)
      
            g = []; console.log(u0a.gen(ctx))
        */
        let m1 = P(`
  u: { x: 1, y: number}
  q: a: .u
  w: b: .q.a & {y:2, z: 3}
  `);
        let u1a = m1.unify(TOP, new ctx_1.AontuContext({ root: m1 }));
        u1a.unify(TOP, new ctx_1.AontuContext({ root: u1a }));
    });
    (0, node_test_1.it)('unify', () => {
        let m0 = P(`
  a: 1
  b: .a
  c: .x
  `, { xlog: -1 });
        (0, expect_1.expect)(m0.canon).equal('{"a":1,"b":.a,"c":.x}');
        let c0 = new ctx_1.AontuContext({
            root: m0
        });
        let m0u = m0.unify(TOP, c0);
        (0, expect_1.expect)(m0u.canon).equal('{"a":1,"b":1,"c":nil}');
        let m1 = P(`
  a: .b.c
  b: c: 1
  `, { xlog: -1 });
        let c1 = new ctx_1.AontuContext({
            root: m1
        });
        let m1u = m1.unify(TOP, c1);
        (0, expect_1.expect)(m1u.canon).equal('{"a":1,"b":{"c":1}}');
        let m2 = P(`
a: {x:1}
b: { &: $.a }
b: c0: {n:0}
b: c1: {n:1}
b: c2: {n:2}
`);
        (0, expect_1.expect)(m2.canon)
            .equal('{"a":{"x":1},"b":{&:$.a}&{"c0":{"n":0}}&{"c1":{"n":1}}&{"c2":{"n":2}}}');
        (0, expect_1.expect)(m2.peg.b.constructor.name).equal('ConjunctVal');
        (0, expect_1.expect)(m2.peg.b.peg.length).equal(4);
        let c2 = new ctx_1.AontuContext({
            root: m2
        });
        let m2u = m2.unify(TOP, c2);
        (0, expect_1.expect)(m2u.canon)
            // .equal('{"a":{"x":1},"b":{&:{"x":1},"c0":{"n":0,"x":1},"c1":{"n":1,"x":1},"c2":{"n":2,"x":1}}}')
            .equal('{"a":{"x":1},"b":{&:$.a,"c0":{"n":0,"x":1},"c1":{"n":1,"x":1},"c2":{"n":2,"x":1}}}');
    });
    (0, node_test_1.it)('repeat-spread', () => {
        let ctx = makeCtx();
        (0, expect_1.expect)(G('p:a:b:&:n:1 p:a:b:c:{}', ctx)).equal({
            p: { a: { b: { c: { n: 1 } } } }
        });
        (0, expect_1.expect)(G('p:a:&:&:n:1 p:a:b:c:{}', ctx)).equal({
            p: { a: { b: { c: { n: 1 } } } }
        });
        (0, expect_1.expect)(G('p:a:b:&:n:.$KEY p:a:b:c:{}', ctx)).equal({
            p: { a: { b: { c: { n: 'c' } } } }
        });
        (0, expect_1.expect)(G('p:a:&:&:n:.$KEY p:a:b:c:{}', ctx)).equal({
            p: { a: { b: { c: { n: 'c' } } } }
        });
    });
    (0, node_test_1.it)('operator-plus', () => {
        let ctx = makeCtx();
        (0, expect_1.expect)(G('a:1+2', ctx)).equal({ a: 3 });
        (0, expect_1.expect)(G('a:"b"+"c"', ctx)).equal({ a: 'bc' });
        (0, expect_1.expect)(G('a:"1"+2', ctx)).equal({ a: '12' });
        (0, expect_1.expect)(G('a:1,b:$.a+3', ctx)).equal({ a: 1, b: 4 });
        (0, expect_1.expect)(G('a:"A",b:B+$.a', ctx)).equal({ a: 'A', b: 'BA' });
        (0, expect_1.expect)(P('a:1+2', ctx).canon).equal('{"a":1+2}');
        (0, expect_1.expect)(P('a:"b"+"c"', ctx).canon).equal('{"a":"b"+"c"}');
    });
    (0, node_test_1.it)('null-val', () => {
        let ctx = makeCtx();
        (0, expect_1.expect)(G('a:null', ctx)).equal({ a: null });
        (0, expect_1.expect)(G('[null]', ctx)).equal([null]);
        (0, expect_1.expect)(G('null', ctx)).equal(null);
        (0, expect_1.expect)(P('a:null', ctx).canon).equal('{"a":null}');
        (0, expect_1.expect)(P('[null]', ctx).canon).equal('[null]');
        (0, expect_1.expect)(P('null', ctx).canon).equal('null');
    });
    (0, node_test_1.it)('pref', () => {
        let ctx = makeCtx();
        let s0 = new StringVal_1.StringVal({ peg: 'p0' });
        (0, expect_1.expect)(s0.canon).equal('"p0"');
        let p0 = new PrefVal_1.PrefVal({ peg: s0 });
        (0, expect_1.expect)(p0.canon).equal('*"p0"');
        (0, expect_1.expect)(p0.gen(ctx)).equal('p0');
        let pu0 = p0.unify(TOP, ctx);
        (0, expect_1.expect)(pu0).include({
            dc: -1,
        });
        (0, expect_1.expect)(pu0.site).include({
            row: -1,
            col: -1,
            url: '',
        });
        (0, expect_1.expect)(pu0).include({
        // FIX: use jest toMatchObject
        // peg: {
        //   dc: -1,
        //   row: -1,
        //   col: -1,
        //   url: '',
        //   peg: 'p0',
        //   path: [],
        //   kind: String,
        // },
        // path: [],
        // pref: {
        //   dc: -1,
        //   row: -1,
        //   col: -1,
        //   url: '',
        //   peg: 'p0',
        //   path: [],
        //   kind: String,
        // }
        });
        p0.peg = makeSK_String();
        (0, expect_1.expect)(p0.canon).equal('*string');
        (0, expect_1.expect)(() => p0.gen(ctx)).throw(/no_gen/);
        // p0.pref = new Nil([], 'test:pref')
        // expect(p0.canon).equal('string')
        // expect(p0.gen([])).equal(undefined)
        // p0.peg = new Nil([], 'test:val')
        // expect(p0.canon).equal('nil')
        // expect(p0.gen([])).equal(undefined)
        let p1 = new PrefVal_1.PrefVal({ peg: new StringVal_1.StringVal({ peg: 'p1' }) });
        let p2 = new PrefVal_1.PrefVal({ peg: makeSK_String() });
        let up12 = p1.unify(p2, ctx);
        (0, expect_1.expect)(up12.canon).equal('*"p1"');
        let up21 = p2.unify(p1, ctx);
        (0, expect_1.expect)(up21.canon).equal('*"p1"');
        let up2s0 = p2.unify(new StringVal_1.StringVal({ peg: 's0' }), ctx);
        (0, expect_1.expect)(up2s0.canon).equal('"s0"');
        // NOTE: once made concrete a prefval is fixed
        (0, expect_1.expect)(up2s0.unify(new StringVal_1.StringVal({ peg: 's1' }), ctx).canon)
            .equal('nil');
        // let u0 = P('1|number').unify(TOP, ctx)
        // let u1 = P('*1|number').unify(TOP, ctx)
        (0, expect_1.expect)(UC('a:1')).equal('{"a":1}');
        (0, expect_1.expect)(UC('a:1,b:.a')).equal('{"a":1,"b":1}');
        (0, expect_1.expect)(UC('a:*1|number,b:2,c:.a&.b')).equal('{"a":*1|number,"b":2,"c":2}');
        (0, expect_1.expect)(UC('a:*1|number,b:top,c:.a&.b'))
            .equal('{"a":*1|number,"b":top,"c":*1|number}');
        (0, expect_1.expect)(UC('a:*1|number,a:*2|number'))
            // .equal('{"a":*2|*1|number}')
            .equal('{"a":*2|*1|number}');
        (0, expect_1.expect)(UC('a:*1|number,b:*2|number,c:.a&.b'))
            .equal('{"a":*1|number,"b":*2|number,"c":*2|*1|number}');
        let d0 = P('1|number').unify(TOP, ctx);
        (0, expect_1.expect)(d0.canon).equal('1|number');
        (0, expect_1.expect)(d0.gen(ctx)).equal(1);
        // expect(d0.gen(ctx)).equal(undefined)
        (0, expect_1.expect)(G('number|*1')).equal(1);
        (0, expect_1.expect)(G('string|*1')).equal(1);
        (0, expect_1.expect)(N('*1 & x', ctx)).equal('nil');
        (0, expect_1.expect)(() => G('*1 & x', ctx)).throws(/aontu/);
        (0, expect_1.expect)(G('a:*1,a:2')).equal({ a: 2 });
        (0, expect_1.expect)(N('a:*1,a:x', ctx)).equal('{"a":nil}');
        (0, expect_1.expect)(() => G('a:*1,a:x', ctx)).throws(/aontu/);
        (0, expect_1.expect)(G('a: *1 & 2')).equal({ a: 2 });
        (0, expect_1.expect)(G('true|*true')).equal(true);
        (0, expect_1.expect)(G('*true|true')).equal(true);
        (0, expect_1.expect)(G('*true|*true')).equal(true);
        (0, expect_1.expect)(G('*true|*true|*true')).equal(true);
        (0, expect_1.expect)(G('true&*true')).equal(true);
        (0, expect_1.expect)(G('*true&true')).equal(true);
        (0, expect_1.expect)(G('*true&*true')).equal(true);
        (0, expect_1.expect)(G('{a:2}&{a:number|*1}')).equal({ a: 2 });
        (0, expect_1.expect)(G('{&:number}&{a:2}&{a:number|*1}')).equal({ a: 2 });
        (0, expect_1.expect)(G('{a:{&:{c:number|*1}}} & {a:{b:{c:2}}}')).equal({ a: { b: { c: 2 } } });
        (0, expect_1.expect)(G('{a:{&:{c:number|*1,d:boolean}}} & {a:{b:{c:2,d:true}}}'))
            .equal({ a: { b: { c: 2, d: true } } });
        (0, expect_1.expect)(G('x: {a:{&:{c:number|*1,d:boolean}}} & {a:{b:{c:2,d:true}}}'))
            .equal({ x: { a: { b: { c: 2, d: true } } } });
        (0, expect_1.expect)(G('x: {a:{&:{c:number|*1}&{d:boolean}}} & {a:{b:{c:2,d:true}}}'))
            .equal({ x: { a: { b: { c: 2, d: true } } } });
        (0, expect_1.expect)(G('y: "Y", x: {a:{&:{c:number|*1,d:boolean}}} & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true } } } });
        (0, expect_1.expect)(G('y: "Y", x: {a:{&:{c:number|*1,d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Y' } } } });
        (0, expect_1.expect)(G('y: *"Y"|string, x: {a:{&:{c:number|*1,d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Y' } } } });
        (0, expect_1.expect)(G('y: *"Y"|string, x: {a:{&:{c:number|*1,d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true,e:"Q"}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Q' } } } });
        (0, expect_1.expect)(G('y: "Y", x: {a:{&:{c:number|*1}&{d:boolean}}} & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true } } } });
        (0, expect_1.expect)(G('y: "Y", x: {a:{&:{c:number|*1}&{d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Y' } } } });
        (0, expect_1.expect)(G('y: *"Y"|string, x: {a:{&:{c:number|*1}&{d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Y' } } } });
        (0, expect_1.expect)(G('y: *"Y"|string, x: {a:{&:{c:number|*1}&{d:boolean,e:$.y}}}' +
            ' & {a:{b:{c:2,d:true,e:"Q"}}}'))
            .equal({ y: 'Y', x: { a: { b: { c: 2, d: true, e: 'Q' } } } });
        (0, expect_1.expect)(G(`
  a: *true | boolean
  b: $.a
  c: $.a & false
  d: { x: $.a }
  d: { x: false }
  e: { x: $.a }
  f: { &: *true | boolean }
  f: { y: false }
  g: .f
  h: { &: $.a }
  h: { z: false }
  `)).equal({
            a: true,
            b: true,
            c: false,
            d: { x: false },
            e: { x: true },
            f: { y: false },
            g: { y: false },
            h: { z: false }
        });
        (0, expect_1.expect)(G(`
  x: y: { m: n: *false | boolean }
  a: b: { &: $.x.y }
  a: b: { c: {} }
  a: b: d: {}
  a: b: e: m: n: true
  `)).equal({
            x: { y: { m: { n: false } } },
            a: {
                b: {
                    c: { m: { n: false } },
                    d: { m: { n: false } },
                    e: { m: { n: true } }
                }
            },
        });
    });
});
function makeCtx(r) {
    return new ctx_1.AontuContext({ root: r || new MapVal_1.MapVal({ peg: {} }) });
}
//# sourceMappingURL=val-basic.test.js.map