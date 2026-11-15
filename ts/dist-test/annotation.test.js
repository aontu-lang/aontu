"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const aontu_1 = require("../dist/aontu");
(0, node_test_1.describe)('annotation', () => {
    (0, node_test_1.test)('gen-preference-generates-without-a-context', () => {
        const root = new aontu_1.Aontu().unify('v: *1.255 & gen({significant: 2})');
        Assert.strictEqual(root.peg.v.gen(), 1.3);
    });
    (0, node_test_1.test)('gen-float-overflow-is-collected', () => {
        const aontu = new aontu_1.Aontu();
        const ctx = aontu.ctx({ collect: true });
        const out = aontu.generate('v: 1.7976931348623157e308 & gen({significant: 1})', undefined, ctx);
        Assert.strictEqual(out, undefined);
        Assert.strictEqual(ctx.err[0].why, 'float_overflow');
    });
    (0, node_test_1.test)('gen-float-overflow-throws-without-a-context', () => {
        const root = new aontu_1.Aontu().unify('v: 1.7976931348623157e308 & gen({significant: 1})');
        Assert.throws(() => root.peg.v.gen(), /float_overflow/);
    });
    (0, node_test_1.test)('gen-map-generates-without-a-context', () => {
        const root = new aontu_1.Aontu().unify('o: {zebraOne: 1, alphaTwo: {} & gen({empty: "omit"})} & gen({keys: "snake"})');
        const out = root.peg.o.gen();
        Assert.deepStrictEqual(Object.keys(out), ['zebra_one']);
    });
    (0, node_test_1.test)('gen-written-keys-are-in-their-order', () => {
        const out = new aontu_1.Aontu().generate('o: {b_one: 1, aTwo: 2, "10": 3, "9": 4} & gen({keys: "camel"})');
        Assert.deepStrictEqual(Object.entries(out.o), [['9', 4], ['10', 3], ['aTwo', 2], ['bOne', 1]]);
        Assert.strictEqual(JSON.stringify(out.o), '{"9":4,"10":3,"aTwo":2,"bOne":1}');
    });
    (0, node_test_1.test)('gen-key-clash-throws-without-a-context', () => {
        const root = new aontu_1.Aontu().unify('o: {a_b: 1, aB: 2} & gen({keys: "snake"})');
        Assert.throws(() => root.peg.o.gen(), /gen_key_clash/);
    });
    (0, node_test_1.test)('gen-key-clash-is-collected', () => {
        const aontu = new aontu_1.Aontu();
        const ctx = aontu.ctx({ collect: true });
        const out = aontu.generate('o: {a_b: 1, aB: 2} & gen({keys: "snake"})', undefined, ctx);
        Assert.strictEqual(out, undefined);
        Assert.strictEqual(ctx.err[0].why, 'gen_key_clash');
        const { written, a, b } = ctx.err[0].details;
        Assert.deepStrictEqual([written, a, b], ['a_b', 'aB', 'a_b']);
    });
    (0, node_test_1.test)('gen-address-resolves-from-its-own-path-without-a-context', () => {
        const root = new aontu_1.Aontu().unify('a: {x: path(..b) & gen({form: "absolute"})}');
        Assert.strictEqual(root.peg.a.peg.x.gen(), '$.b');
    });
    (0, node_test_1.test)('gen-plain-generation-reads-the-value', () => {
        const src = 'v: 3.14159 & gen({places: 2, as: "string"}), ' +
            'o: {orderId: "" & gen({empty: "omit"})} & gen({keys: "snake"}), ' +
            'p: {x: path(..b) & gen({form: "key"})}, n: null & gen({empty: "omit"})';
        const aontu = new aontu_1.Aontu();
        const ctx = aontu.ctx({});
        ctx.plain = true;
        Assert.deepStrictEqual(aontu.generate(src, undefined, ctx), { n: null, o: { orderId: '' }, p: { x: '..b' }, v: 3.14159 });
        Assert.deepStrictEqual(aontu.generate(src), { o: {}, p: { x: 'b' }, v: '3.14' });
    });
    (0, node_test_1.test)('gen-omitted-root-generates-nothing', () => {
        Assert.strictEqual(new aontu_1.Aontu().generate('{} & gen({empty: "omit"})'), undefined);
        Assert.strictEqual(new aontu_1.Aontu().generate('[] & gen({empty: "omit"})'), undefined);
        Assert.deepStrictEqual(new aontu_1.Aontu().generate('{a: 1} & gen({empty: "omit"})'), { a: 1 });
    });
    // More distinct records than one process keeps the reading of.
    (0, node_test_1.test)('gen-option-readings-are-bounded', () => {
        const src = Array.from({ length: 300 }, (_, i) => `k${i}: 1.2345678 & gen({significant: ${i + 1}})`).join('\n');
        const out = new aontu_1.Aontu().generate(src);
        Assert.strictEqual(out.k0, 1);
        Assert.strictEqual(out.k2, 1.23);
        Assert.strictEqual(out.k299, 1.2345678);
        Assert.strictEqual(new aontu_1.Aontu().generate(src).k1, 1.2);
    });
});
//# sourceMappingURL=annotation.test.js.map