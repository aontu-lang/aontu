"use strict";
/* Copyright (c) 2020-2023 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const lang_1 = require("../dist/lang");
const unify_1 = require("../dist/unify");
const ctx_1 = require("../dist/ctx");
const expect_1 = require("./expect");
const MapVal_1 = require("../dist/val/MapVal");
const top_1 = require("../dist/val/top");
const TOP = (0, top_1.top)();
const lang = new lang_1.Lang();
const PL = lang.parse.bind(lang);
const P = (x, ctx) => PL(x, ctx);
const UC = (s, r) => (r = P(s)).unify(TOP, makeCtx(r)).canon;
const G = (x, ctx) => new unify_1.Unify(x, lang).res.gen(ctx);
(0, node_test_1.describe)('val-disjunct', function () {
    (0, node_test_1.test)('basic', () => {
        let u0 = UC('a:{x:1}|{y:2},a:{z:3}');
        (0, expect_1.expect)(u0).equal('{"a":{"x":1,"z":3}|{"y":2,"z":3}}');
        let u1 = UC('a:{x:1}|{y:2},a:{z:3}|{q:4}');
        (0, expect_1.expect)(u1)
            .equal('{"a":{"x":1,"z":3}|{"y":2,"z":3}|{"q":4,"x":1}|{"q":4,"y":2}}');
        let u2a = UC('a:*1|*1|number');
        (0, expect_1.expect)(u2a).equal('{"a":*1|number}');
        let u2 = UC('a:*1|number,a:*2|number');
        (0, expect_1.expect)(u2).equal('{"a":*2|*1|number}');
        // TODO: fix syntax (*...) !!!
        // let u3 = UC('(*1|number) & (*2|number)')
        // expect(u3).equal('*2|*1|number')
        let u4 = UC('(number|*1) & (number|*2)');
        (0, expect_1.expect)(u4).equal('number|*1|*2');
        let g0 = G('{&:{x:*1|number},a:{},b:{x:2}}');
        (0, expect_1.expect)(g0).equal({ a: { x: 1 }, b: { x: 2 } });
        let g1 = G('&:{x:*1|number},a:{},b:{x:2}');
        (0, expect_1.expect)(g1).equal({ a: { x: 1 }, b: { x: 2 } });
    });
    (0, node_test_1.test)('clone', () => {
        let v0 = P('{x:1}|{y:2}|{z:3}');
        // console.log(v0.canon)
        (0, expect_1.expect)(v0.canon).equal('({"x":1}|{"y":2})|{"z":3}');
        let ctx = makeCtx(v0);
        let v0c = v0.clone(ctx);
        (0, expect_1.expect)(v0c.canon).equal('({"x":1}|{"y":2})|{"z":3}');
    });
});
function makeCtx(r) {
    return new ctx_1.AontuContext({ root: r || new MapVal_1.MapVal({ peg: {} }) });
}
//# sourceMappingURL=val-disjunct.test.js.map