"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
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
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const ctx_1 = require("../dist/ctx");
const err_1 = require("../dist/err");
const lang_1 = require("../dist/lang");
const site_1 = require("../dist/site");
const CloseFuncVal_1 = require("../dist/val/CloseFuncVal");
const CopyFuncVal_1 = require("../dist/val/CopyFuncVal");
const HideFuncVal_1 = require("../dist/val/HideFuncVal");
const MoveFuncVal_1 = require("../dist/val/MoveFuncVal");
const PrefFuncVal_1 = require("../dist/val/PrefFuncVal");
const TypeFuncVal_1 = require("../dist/val/TypeFuncVal");
const unify_1 = require("../dist/unify");
const cli_1 = require("../dist/cli");
const lsp_server_1 = require("../dist/lsp-server");
const lsp_1 = require("../dist/lsp");
const subsume_1 = require("../dist/subsume");
const DeprecateFuncVal_1 = require("../dist/val/DeprecateFuncVal");
const utility_1 = require("../dist/utility");
const hcanon_1 = require("../dist/hcanon");
const query_1 = require("../dist/query");
const provenance_1 = require("../dist/provenance");
const ReferFuncVal_1 = require("../dist/val/ReferFuncVal");
const PathVal_1 = require("../dist/val/PathVal");
const graph_1 = require("../dist/graph");
const trim_1 = require("../dist/trim");
const Val_1 = require("../dist/val/Val");
const top_1 = require("../dist/val/top");
const MapVal_1 = require("../dist/val/MapVal");
const RecurseVal_1 = require("../dist/val/RecurseVal");
const GraphAtomVal_1 = require("../dist/val/GraphAtomVal");
const ListVal_1 = require("../dist/val/ListVal");
const IntegerVal_1 = require("../dist/val/IntegerVal");
const NilVal_1 = require("../dist/val/NilVal");
const NumberVal_1 = require("../dist/val/NumberVal");
const StringVal_1 = require("../dist/val/StringVal");
const ScalarVal_1 = require("../dist/val/ScalarVal");
const KeyFuncVal_1 = require("../dist/val/KeyFuncVal");
const PlaceVal_1 = require("../dist/val/PlaceVal");
const RefVal_1 = require("../dist/val/RefVal");
const VarVal_1 = require("../dist/val/VarVal");
const ConjunctVal_1 = require("../dist/val/ConjunctVal");
const DisjunctVal_1 = require("../dist/val/DisjunctVal");
const PrefVal_1 = require("../dist/val/PrefVal");
const MatchFuncVal_1 = require("../dist/val/MatchFuncVal");
const ExpectVal_1 = require("../dist/val/ExpectVal");
const ScalarKindVal_1 = require("../dist/val/ScalarKindVal");
const FeatureVal_1 = require("../dist/val/FeatureVal");
const FuncBaseVal_1 = require("../dist/val/FuncBaseVal");
const PathFuncVal_1 = require("../dist/val/PathFuncVal");
const ContainerKindVal_1 = require("../dist/val/ContainerKindVal");
const UpperFuncVal_1 = require("../dist/val/UpperFuncVal");
const LowerFuncVal_1 = require("../dist/val/LowerFuncVal");
const BooleanVal_1 = require("../dist/val/BooleanVal");
const ConstraintVal_1 = require("../dist/val/ConstraintVal");
const Decimal_1 = require("../dist/val/Decimal");
const BigIntegerVal_1 = require("../dist/val/BigIntegerVal");
const BigDecimalVal_1 = require("../dist/val/BigDecimalVal");
const numcmp_1 = require("../dist/val/numcmp");
const numkind_1 = require("../dist/val/numkind");
const utility_2 = require("../dist/utility");
const A = () => new aontu_1.Aontu();
const CTX = () => new ctx_1.AontuContext({ root: new MapVal_1.MapVal({ peg: {} }) });
// Capture process output around an in-process CLI run.
function capture(fn) {
    const so = process.stdout.write;
    const se = process.stderr.write;
    let out = '';
    let err = '';
    process.stdout.write = (s) => ((out += s), true);
    process.stderr.write = (s) => ((err += s), true);
    try {
        fn();
    }
    finally {
        process.stdout.write = so;
        process.stderr.write = se;
        process.exitCode = 0;
    }
    return { out, err };
}
(0, node_test_1.describe)('coverage3-public-surface', () => {
    (0, node_test_1.test)('every-re-export-resolves', () => {
        const api = require('../dist/aontu');
        for (const name of [
            'Aontu', 'AontuContext', 'AontuError', 'Lang',
            'runparse', 'util', 'formatExplain', 'exactJSON', 'Decimal',
            'VERSION',
        ]) {
            Assert.ok(null != api[name], 'missing export: ' + name);
        }
        Assert.equal('function', typeof api.default);
        Assert.match(api.VERSION, /^\d+\.\d+\.\d+/);
    });
});
(0, node_test_1.describe)('coverage3-refval', () => {
    (0, node_test_1.test)('null-peer-and-marks', () => {
        const root = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        const ctx = new ctx_1.AontuContext({ root });
        // The engine always passes a peer; the Val API allows omitting it.
        Assert.equal(new RefVal_1.RefVal({ peg: ['a'], absolute: true }).unify(undefined, ctx).canon, '1');
        // A ref carrying only a hide mark stamps it on the found value.
        const rh = new RefVal_1.RefVal({ peg: ['a'], absolute: true });
        rh.mark.hide = true;
        Assert.equal(rh.find(ctx).canon, '1');
    });
    (0, node_test_1.test)('cycle-proof-walk-arms', () => {
        // A proven cycle that descends through a list index.
        const ra = new RefVal_1.RefVal({ peg: ['b', '0'], absolute: true });
        const rb = new RefVal_1.RefVal({ peg: ['a'], absolute: true });
        const root = new MapVal_1.MapVal({
            peg: { a: ra, b: new ListVal_1.ListVal({ peg: [rb] }) },
        });
        Assert.equal(ra.detectRefCycle(new ctx_1.AontuContext({ root })), true);
        // A chase that meets a non-container mid-path proves nothing.
        const rc = new RefVal_1.RefVal({ peg: ['b', 'x'], absolute: true });
        const root2 = new MapVal_1.MapVal({
            peg: { a: rc, b: new StringVal_1.StringVal({ peg: 's' }) },
        });
        Assert.equal(rc.detectRefCycle(new ctx_1.AontuContext({ root: root2 })), false);
    });
    (0, node_test_1.test)('same-and-inspection', () => {
        const r = new RefVal_1.RefVal({ peg: ['a'], absolute: true });
        Assert.equal(r.same(undefined), false);
        Assert.equal(r.same(r), true);
        Assert.match(new RefVal_1.RefVal({ peg: ['a'], absolute: true, prefix: true }).inspect(), /absolute,prefix/);
        Assert.doesNotMatch(new RefVal_1.RefVal({ peg: ['a'] }).inspect(), /absolute|prefix/);
    });
});
(0, node_test_1.describe)('coverage3-val-base', () => {
    (0, node_test_1.test)('clone-with-explicit-undefined-mark', () => {
        const iv = new IntegerVal_1.IntegerVal({ peg: 1 });
        iv.mark.type = true;
        const out = iv.clone(CTX(), { mark: undefined });
        Assert.equal(out.mark.type, true);
        Assert.equal(out.canon, '1');
    });
    (0, node_test_1.test)('base-unify-is-identity', () => {
        class PlainVal extends FeatureVal_1.FeatureVal {
            get canon() { return ''; }
        }
        const pv = new PlainVal({ peg: 1 });
        Assert.equal(pv.unify((0, top_1.top)(), CTX()), pv);
    });
    (0, node_test_1.test)('inspect-rendering-arms', () => {
        const iv = new IntegerVal_1.IntegerVal({ peg: 1 });
        Assert.doesNotMatch(iv.inspect(), /type|hide/);
        iv.mark.type = true;
        iv.mark.hide = true;
        Assert.match(iv.inspect(), /hide,type/);
        // peg undefined, and a null-prototype peg (what jsonic hands a MapVal)
        Assert.match((0, top_1.top)().inspect(), /\/>$/);
        Assert.match(new MapVal_1.MapVal({ peg: Object.create(null) }).inspect(), /\/>$/);
        Assert.match(new IntegerVal_1.IntegerVal({ peg: 1 }).inspect(), /1>$/);
        // array peg: Val entries render through inspect, raw entries verbatim
        const lv = new ListVal_1.ListVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 }), 5] });
        const s = lv.inspect();
        Assert.match(s, /Integer/);
        Assert.match(s, /5/);
    });
});
(0, node_test_1.describe)('coverage3-constraint', () => {
    (0, node_test_1.test)('mixed-domain-exclusion-admits', () => {
        const ctx = CTX();
        const cv = new ConstraintVal_1.ConstraintVal({
            peg: [],
            state: { domain: 'number', neqs: [new StringVal_1.StringVal({ peg: 'a' })] },
        }, ctx);
        // A string exclusion cannot match a numeric peer, so the peer stands.
        Assert.equal(cv.unify(new IntegerVal_1.IntegerVal({ peg: 1 }), ctx).canon, '1');
    });
    (0, node_test_1.test)('constraint-without-args', () => {
        const ctx = CTX();
        const cv = new ConstraintVal_1.MinConstraintVal({}, ctx);
        Assert.equal(cv.invalid, 'arg');
        Assert.equal(cv.unify(new IntegerVal_1.IntegerVal({ peg: 1 }), ctx).isNil, true);
    });
    (0, node_test_1.test)('domain-adopted-from-peer', () => {
        const ctx = CTX();
        const c0 = new ConstraintVal_1.ConstraintVal({ peg: [], state: { neqs: [] } }, ctx);
        const c1 = new ConstraintVal_1.ConstraintVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })], atom: 'min' }, ctx);
        Assert.equal(c0.unify(c1, ctx).canon, 'min(1)');
    });
});
(0, node_test_1.describe)('coverage3-bags', () => {
    (0, node_test_1.test)('null-peer-arms', () => {
        const ctx = CTX();
        Assert.equal(new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } })
            .unify(undefined, ctx).canon, '{"a":1}');
        Assert.equal(new ListVal_1.ListVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] }, ctx)
            .unify(undefined, ctx).canon, '[1]');
        Assert.equal(new ConjunctVal_1.ConjunctVal({
            peg: [new IntegerVal_1.IntegerVal({ peg: 1 }), new IntegerVal_1.IntegerVal({ peg: 1 })],
        }, ctx).unify(undefined, ctx).canon, '1');
        Assert.equal(new DisjunctVal_1.DisjunctVal({
            peg: [new IntegerVal_1.IntegerVal({ peg: 1 }), new IntegerVal_1.IntegerVal({ peg: 2 })],
        }, ctx).unify(undefined, ctx).canon, '1|2');
        Assert.equal(new PrefVal_1.PrefVal({ peg: new IntegerVal_1.IntegerVal({ peg: 1 }) }, ctx)
            .unify(undefined, ctx).canon, '*1');
    });
    (0, node_test_1.test)('nil-spread-drives-every-key', () => {
        const ctx = CTX();
        const lv = new ListVal_1.ListVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] }, ctx);
        lv.spread.cj = new NilVal_1.NilVal({ why: 'test-nil-spread' });
        Assert.equal(lv.unify((0, top_1.top)(), ctx).peg[0].isNil, true);
    });
    (0, node_test_1.test)('raw-peg-canon-and-clone', () => {
        const ctx = CTX();
        Assert.equal(new MapVal_1.MapVal({ peg: { a: 5 } }).canon, '{"a":5}');
        Assert.equal(new MapVal_1.MapVal({ peg: { a: undefined } }).canon, '{"a":undefined}');
        Assert.deepEqual(new ListVal_1.ListVal({ peg: [1, 'x'] }, ctx).clone(ctx).peg, [1, 'x']);
    });
    (0, node_test_1.test)('optional-list-element-canon', () => {
        const lv = new ListVal_1.ListVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] }, CTX());
        lv.optionalKeys.push('0');
        Assert.equal(lv.canon, '[1]');
    });
    (0, node_test_1.test)('func-no-arg-guards-via-api', () => {
        const ctx = CTX();
        const cases = [
            ['close', new CloseFuncVal_1.CloseFuncVal({ peg: [] }), 'no_first_arg'],
            ['copy', new CopyFuncVal_1.CopyFuncVal({ peg: [] }), 'invalid-arg'],
            ['hide', new HideFuncVal_1.HideFuncVal({ peg: [] }), 'arg'],
            ['move', new MoveFuncVal_1.MoveFuncVal({ peg: [] }), 'arg'],
            ['pref', new PrefFuncVal_1.PrefFuncVal({ peg: [] }), 'arg'],
            ['type', new TypeFuncVal_1.TypeFuncVal({ peg: [] }), 'arg'],
        ];
        for (const [name, fv, why] of cases) {
            const out = fv.resolve(ctx, []);
            Assert.equal(out.isNil, true, name + ': expected a nil');
            Assert.equal(out.why, why, name + ': why');
        }
        const pf = new PathFuncVal_1.PathFuncVal({ peg: [] });
        const prepared = pf.prepare(ctx, []);
        Assert.equal(prepared.length, 0);
        Assert.equal(pf.resolve(ctx, prepared).isPathKind, true);
    });
    (0, node_test_1.test)('map-inspection-spread', () => {
        const mv = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        mv.spread.cj = new IntegerVal_1.IntegerVal({ peg: 2 });
        Assert.match(mv.inspection(), /&:<Integer/);
        Assert.match(mv.inspect(), /&:<Integer/);
        Assert.equal(new MapVal_1.MapVal({ peg: {} }).inspection(), '');
    });
    (0, node_test_1.test)('conjunct-empty-spec-and-ref-fold', () => {
        const ctx = CTX();
        Assert.deepEqual(new ConjunctVal_1.ConjunctVal({}, ctx).peg, []);
        // A pref followed by an unresolvable ref keeps both terms in canon.
        const cj = new ConjunctVal_1.ConjunctVal({
            peg: [
                new PrefVal_1.PrefVal({ peg: new IntegerVal_1.IntegerVal({ peg: 1 }) }, ctx),
                new RefVal_1.RefVal({ peg: [new VarVal_1.VarVal({ peg: 'zz' }), 'q'], absolute: true }, ctx),
            ],
        }, ctx);
        Assert.equal(cj.unify((0, top_1.top)(), ctx).canon, '*1&$.$zz.q');
    });
    (0, node_test_1.test)('expect-explain-and-inspection', () => {
        const explain = [];
        const ctx = new ctx_1.AontuContext({ root: new MapVal_1.MapVal({ peg: {} }), explain });
        const e = new ExpectVal_1.ExpectVal({ peg: new IntegerVal_1.IntegerVal({ peg: 1 }) }, ctx);
        Assert.equal(e.unify(new IntegerVal_1.IntegerVal({ peg: 1 }), ctx).canon, '1');
        Assert.ok(0 < explain.length);
        const e2 = new ExpectVal_1.ExpectVal({ peg: new IntegerVal_1.IntegerVal({ peg: 2 }) });
        e2.parent = new MapVal_1.MapVal({ peg: {} });
        e2.key = 'a';
        Assert.ok(e2.inspection(0).includes('parent='));
        const e3 = new ExpectVal_1.ExpectVal({ peg: new ScalarKindVal_1.ScalarKindVal({ peg: ScalarKindVal_1.Integer }) }, ctx);
        const out3 = e3.unify(new ScalarKindVal_1.ScalarKindVal({ peg: Number }), ctx);
        Assert.ok(out3.isExpect && out3 !== e3 && undefined !== out3.peer);
        Assert.equal(e3.peer, undefined);
        Assert.ok(out3.inspection(0).includes('peer='));
    });
});
(0, node_test_1.describe)('coverage3-scalars', () => {
    (0, node_test_1.test)('nil-spec-arms', () => {
        const e1 = new Error('x');
        const n = new NilVal_1.NilVal({ why: 'w', err: [e1] });
        Assert.equal(n.err.length, 1);
        // A why-less nil classifies and generates as its gen-time code.
        const n2 = new NilVal_1.NilVal({});
        Assert.equal(n2.class, new NilVal_1.NilVal({ why: 'nil_gen' }).class);
        const ctx = new ctx_1.AontuContext({ root: new MapVal_1.MapVal({ peg: {} }), err: [] });
        Assert.equal(n2.gen(ctx), undefined);
        Assert.equal(n2.why, 'nil_gen');
    });
    (0, node_test_1.test)('scalar-against-top', () => {
        const ctx = CTX();
        const leaves = [
            new NumberVal_1.NumberVal({ peg: 1.5 }),
            new IntegerVal_1.IntegerVal({ peg: 1 }),
            new StringVal_1.StringVal({ peg: 's' }),
            new BigIntegerVal_1.BigIntegerVal({ peg: 5n }),
            new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(15n, 1) }),
        ];
        for (const leaf of leaves) {
            Assert.equal(leaf.unify((0, top_1.top)(), ctx), leaf, leaf.canon);
        }
    });
    (0, node_test_1.test)('scalar-rendering-edges', () => {
        Assert.equal(new ScalarVal_1.ScalarVal({ peg: undefined }).canon, 'undefined');
        Assert.equal(Object.is(new NumberVal_1.NumberVal({ peg: -0 }).gen(undefined), 0), true);
    });
    (0, node_test_1.test)('decimal-compare-and-budget', () => {
        Assert.equal((0, Decimal_1.decimalOverBudget)(new Decimal_1.Decimal(-12345n, 2)), false);
        const a = new Decimal_1.Decimal(11n, 2);
        const b = new Decimal_1.Decimal(1n, 1);
        Assert.equal(a.compare(b), 1);
        Assert.equal(b.compare(a), -1);
        Assert.equal(a.compare(a), 0);
    });
    (0, node_test_1.test)('numcmp-arms', () => {
        const pi = (0, numcmp_1.scaledOfFloat)(Infinity);
        const ni = (0, numcmp_1.scaledOfFloat)(-Infinity);
        Assert.equal((0, numcmp_1.cmpScaled)(ni, pi), -1);
        Assert.equal((0, numcmp_1.cmpScaled)(pi, ni), 1);
        Assert.equal((0, numcmp_1.cmpScaled)(pi, pi), 0);
        // Code-point compare: surrogate pairs, then the prefix rule.
        Assert.equal((0, numcmp_1.cmpCodePoints)('\u{1F600}a', '\u{1F600}b'), -1);
        Assert.equal((0, numcmp_1.cmpCodePoints)('\u{1F600}b', '\u{1F600}a'), 1);
        Assert.equal((0, numcmp_1.cmpCodePoints)('ab', 'abc'), -1);
        Assert.equal((0, numcmp_1.cmpCodePoints)('abc', 'ab'), 1);
        // A negative non-integral floor rounds down, not toward zero.
        Assert.equal((0, numcmp_1.scaledFloor)((0, numcmp_1.scaledOfFloat)(-1.5)), -2n);
        Assert.equal((0, numcmp_1.scaledFloor)((0, numcmp_1.scaledOfFloat)(1.5)), 1n);
    });
    (0, node_test_1.test)('lossy-zero-coefficient', () => {
        // Zero at any exponent is zero, and zero is exact.
        Assert.equal((0, numkind_1.isLossyIntegerLiteral)(1e300, '0e500'), false);
    });
});
(0, node_test_1.describe)('coverage3-funcs', () => {
    (0, node_test_1.test)('feature-gen-collects', () => {
        const ctx = new ctx_1.AontuContext({ collect: true });
        Assert.equal(new FuncBaseVal_1.FuncBaseVal({ peg: [] }).gen(ctx), undefined);
        Assert.equal(ctx.err.length, 1);
        Assert.equal(ctx.err[0].why, 'no_gen');
    });
    (0, node_test_1.test)('validate-args-plural', () => {
        const f = new FuncBaseVal_1.FuncBaseVal({ peg: [] });
        Assert.throws(() => f.validateArgs([(0, top_1.top)(), (0, top_1.top)(), (0, top_1.top)()], 2), /needs at least 2 arguments/);
        Assert.throws(() => f.validateArgs([(0, top_1.top)(), (0, top_1.top)()], 1), /needs at least 1 argument\./);
    });
    (0, node_test_1.test)('path-func-argument-shapes', () => {
        const ctx = CTX();
        // No argument at all is the path KIND (docs/design/PATHS.0.md).
        Assert.equal(new PathFuncVal_1.PathFuncVal({ peg: [] }, ctx).resolve(ctx, []).isPathKind, true);
        const pfs = new PathFuncVal_1.PathFuncVal({ peg: [new StringVal_1.StringVal({ peg: '.a' })] }, ctx);
        const sout = pfs.prepare(ctx, [new StringVal_1.StringVal({ peg: '.a' })]);
        Assert.equal(sout[0].isPath, true);
        Assert.equal(sout[0].peg, '.a');
        const pfr = new PathFuncVal_1.PathFuncVal({ peg: [new StringVal_1.StringVal({ peg: 'a' })] }, ctx);
        const relout = pfr.prepare(ctx, [new StringVal_1.StringVal({ peg: 'a' })]);
        Assert.equal(relout[0].isPath, true);
        Assert.equal(relout[0].peg, '.a');
        const pfb = new PathFuncVal_1.PathFuncVal({ peg: [new StringVal_1.StringVal({ peg: 'a..b' })] }, ctx);
        const bout = pfb.prepare(ctx, [new StringVal_1.StringVal({ peg: 'a..b' })]);
        Assert.equal(bout[0].isNil, true);
        Assert.equal(bout[0].why, 'path_address');
        // …while a container argument passes through prepare (a computed
        // argument is the driving loop's to evaluate, ADR-016) and is
        // refused at resolve, where a driven non-string always is.
        const pfm = new PathFuncVal_1.PathFuncVal({ peg: [new MapVal_1.MapVal({ peg: {} })] }, ctx);
        const marg = new MapVal_1.MapVal({ peg: {} });
        const mout = pfm.prepare(ctx, [marg]);
        Assert.equal(mout[0], marg);
        const rout = pfm.resolve(ctx, mout);
        Assert.equal(rout.isNil, true);
        Assert.equal(rout.why, 'invalid-arg');
    });
    (0, node_test_1.test)('case-func-fallback-arm', () => {
        const ctx = new ctx_1.AontuContext({});
        const barg = new BooleanVal_1.BooleanVal({ peg: true });
        const lout = new LowerFuncVal_1.LowerFuncVal({ peg: [barg] }, ctx).resolve(ctx, [barg]);
        Assert.equal(lout.isNil, true);
        Assert.equal(lout.why, 'invalid-arg');
        const uout = new UpperFuncVal_1.UpperFuncVal({ peg: [barg] }, ctx).resolve(ctx, [barg]);
        Assert.equal(uout.isNil, true);
        Assert.equal(uout.why, 'invalid-arg');
    });
    (0, node_test_1.test)('case-func-superior-is-top', () => {
        Assert.equal(new UpperFuncVal_1.UpperFuncVal({ peg: [] }).superior().isTop, true);
        Assert.equal(new LowerFuncVal_1.LowerFuncVal({ peg: [] }).superior().isTop, true);
    });
    (0, node_test_1.test)('container-kind-api-only-arms', () => {
        const ctx = CTX();
        const mk = new ContainerKindVal_1.MapKindVal({}, ctx);
        Assert.equal(mk.unify(new ContainerKindVal_1.MapKindVal({}, ctx), ctx), mk);
        const lk = new ContainerKindVal_1.ListKindVal({}, ctx);
        Assert.equal(lk.unify(new ContainerKindVal_1.ListKindVal({}, ctx), ctx), lk);
        Assert.equal(mk.same(lk), false);
        Assert.equal(mk.same(new ContainerKindVal_1.MapKindVal({}, ctx)), true);
        Assert.equal(lk.same(mk), false);
        Assert.equal(lk.same(new ContainerKindVal_1.ListKindVal({}, ctx)), true);
        // The func shells: resolved on first unify, so make() and
        // funcname() never run from source.
        const mf = new ContainerKindVal_1.MapFuncVal({ peg: [] }, ctx);
        Assert.equal(mf.funcname(), 'map');
        Assert.equal(mf.make(ctx, { peg: [] }).isMapFunc, true);
        const lf = new ContainerKindVal_1.ListFuncVal({ peg: [] }, ctx);
        Assert.equal(lf.funcname(), 'list');
        Assert.equal(lf.make(ctx, { peg: [] }).isListFunc, true);
    });
    (0, node_test_1.test)('path-func-api-only-arms', () => {
        const ctx = CTX();
        const pf = new PathFuncVal_1.PathFuncVal({ peg: [] }, ctx);
        pf.prepared = 1;
        const made = pf.make(ctx, { peg: [] });
        Assert.equal(made.isPathFunc, true);
        Assert.equal(made.prepared, 1);
        const again = made.prepare(ctx, ['sentinel']);
        Assert.deepEqual(again, ['sentinel']);
        const empty = new PathFuncVal_1.PathFuncVal({ peg: [] }, ctx);
        const out = empty.prepare(ctx, [new RefVal_1.RefVal({ peg: [], prefix: true }, ctx)]);
        Assert.equal(out[0].isNil, true);
        Assert.equal(out[0].why, 'path_address');
    });
    (0, node_test_1.test)('func-names-render-in-canon', () => {
        // A parsed-but-unresolved func canonises through funcname().
        Assert.equal(A().parse('a: super(1)').canon, '{"a":super(1)}');
    });
});
(0, node_test_1.describe)('coverage3-explain', () => {
    // The explain trace threads through every Val family's unify; these
    // three carry `te`-guarded arms the other suites do not reach.
    (0, node_test_1.test)('exact-leaf-explain-arms', () => {
        const a0 = A();
        const ctx = a0.ctx();
        ctx.explain = [];
        const v = a0.unify('a:1.5&number b:0d1230&biginteger c:0d1.5&bigdecimal', undefined, ctx);
        Assert.equal(v.canon, '{"a":1.5,"b":0d1230,"c":0d1.5}');
        Assert.ok(0 < ctx.explain.length);
    });
    (0, node_test_1.test)('debug-mode-cycle-key', () => {
        // debug builds the human-readable seen key instead of the path index.
        const v = A().unify('a:1 b:$.a c:{d:*2|3}', { debug: true });
        Assert.equal(v.canon, '{"a":1,"b":1,"c":{"d":*2|3}}');
    });
});
(0, node_test_1.describe)('coverage3-context-and-errors', () => {
    (0, node_test_1.test)('context-options', () => {
        const ctx = new ctx_1.AontuContext({ explain: [], vc: 7, cc: 3 });
        Assert.deepEqual(ctx.explain, []);
        Assert.equal(ctx.vc, 7);
        Assert.equal(ctx.cc, 3);
        const d = new ctx_1.AontuContext({});
        Assert.equal(d.explain, null);
    });
    (0, node_test_1.test)('bad-source-refused', () => {
        Assert.throws(() => A().parse(123), (err) => err instanceof err_1.AontuError);
    });
    (0, node_test_1.test)('desc-err-over-a-list', () => {
        const ctx = new ctx_1.AontuContext({ src: 'a:1' });
        const n0 = (0, err_1.makeNilErr)(ctx, 'w0', new IntegerVal_1.IntegerVal({ peg: 1 }));
        const n1 = (0, err_1.makeNilErr)(ctx, 'w1', new IntegerVal_1.IntegerVal({ peg: 2 }));
        Assert.equal((0, err_1.descErr)([n0, n1], ctx).length, 2);
        Assert.match(n0.msg, /Cannot/);
        Assert.match(n1.msg, /Cannot/);
    });
    (0, node_test_1.test)('missing-source-file-frames', () => {
        const v = new IntegerVal_1.IntegerVal({ peg: 1 });
        v.site.url = '/no/such/aontu/file.aon';
        const n0 = (0, err_1.makeNilErr)(undefined, 'nosrc', v);
        (0, err_1.descErr)(n0, {});
        Assert.match(n0.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aon \(NO-FS\)/);
        const n1 = (0, err_1.makeNilErr)(undefined, 'nosrcfs', v);
        (0, err_1.descErr)(n1, { fs: Fs });
        Assert.match(n1.msg, /SOURCE-NOT-FOUND: \/no\/such\/aontu\/file\.aon/);
        Assert.doesNotMatch(n1.msg, /NO-FS/);
    });
    (0, node_test_1.test)('aontu-error-errs', () => {
        Assert.deepEqual(new err_1.AontuError('m0').errs(), []);
        const n = (0, err_1.makeNilErr)(undefined, 'why');
        Assert.equal(new err_1.AontuError('m1', [n]).errs()[0], n);
    });
    (0, node_test_1.test)('site-constructor', () => {
        Assert.equal(new site_1.Site().row, -1);
        Assert.equal(new site_1.Site().col, -1);
        Assert.equal(new site_1.Site().url, '');
        const s = new site_1.Site({ row: 2, col: 3, url: 'u' });
        Assert.equal(s.row, 2);
        Assert.equal(s.col, 3);
        Assert.equal(s.url, 'u');
        // Site is also re-exported from lang (the parser's own site type).
        Assert.equal(new lang_1.Site({ row: 4, col: 5, url: 'v' }).row, 4);
    });
    (0, node_test_1.test)('residue-path-fallback', () => {
        // A never-settling child at the root reports the budget with a bare
        // `$` path (no vpath to name).
        class Never extends Val_1.Val {
            constructor() {
                super(...arguments);
                this.n = 0;
            }
            unify(_peer, _ctx) { this.dc = this.dc + 1; this.n++; return this; }
            get canon() { return 'n' + this.n; }
            gen() { return null; }
            superior() { return (0, top_1.top)(); }
        }
        for (const path of [[], undefined]) {
            const child = new Never({ peg: 1 });
            child.path = path;
            const root = new MapVal_1.MapVal({ peg: { a: child } });
            const ctx = new ctx_1.AontuContext({ root, err: [] });
            new unify_1.Unify(root, new lang_1.Lang(), ctx, '');
            Assert.equal(ctx.err[0].why, 'budget_passes');
            Assert.equal(ctx.err[0].details.paths, '$');
        }
    });
});
(0, node_test_1.describe)('coverage3-explain-close', () => {
    (0, node_test_1.test)('close-without-a-result', () => {
        // A frame can close with no result (an abandoned trial) as well as
        // with one; only the latter records the outcome slot.
        const t = (0, utility_2.explainOpen)({ cc: 1, path: ['a'] }, undefined, 'Probe', new IntegerVal_1.IntegerVal({ peg: 1 }));
        const before = t.slice();
        (0, utility_2.explainClose)(t);
        Assert.deepEqual(t, before);
        (0, utility_2.explainClose)(t, new IntegerVal_1.IntegerVal({ peg: 2 }));
        Assert.ok(t.some((e) => 'string' === typeof e && /^-> \d+=2$/.test(e)));
        (0, utility_2.explainClose)(t, new RefVal_1.RefVal({ peg: ['zz'], absolute: true }));
        Assert.ok(t.some((e) => 'string' === typeof e && /^-> \d+!=/.test(e)));
        // A missing frame is a no-op (explain disabled).
        (0, utility_2.explainClose)(null);
    });
});
(0, node_test_1.describe)('coverage3-lang', () => {
    (0, node_test_1.test)('site-and-addsite', () => {
        const lang = new lang_1.Lang();
        Assert.equal(lang.jsonic('a:1').canon, '{"a":1}');
        // A duplicate key merges into a conjunct built without a site.
        const v = lang.parse('a:{x:1} a:{y:2}');
        Assert.equal(v.canon, '{"a":{"x":1}&{"y":2}}');
        Assert.equal(v.peg.a.site.row, -1);
    });
    (0, node_test_1.test)('optional-keys-of-every-token-kind', () => {
        const lang = new lang_1.Lang();
        Assert.equal(lang.parse('1?:2').canon, '{"1"?:2}');
        Assert.equal(lang.parse('a:{0x10?:2}').canon, '{"a":{"0x10"?:2}}');
        Assert.equal(lang.parse('a?:1').canon, '{"a"?:1}');
        Assert.equal(lang.parse('"k"?:1').canon, '{"k"?:1}');
    });
    (0, node_test_1.test)('resolver-mem-pkg-and-missing', () => {
        // `resolver` is read twice by the constructor: once as the resolver
        // CONFIG (mem/pkg), once as the resolver FUNCTION.
        let n = 0;
        const lang = new lang_1.Lang({
            get resolver() {
                return 0 === n++ ? { mem: { 'm0.aon': 'a:1' }, pkg: {} } : undefined;
            },
        });
        Assert.equal(lang.parse('x:@"m0.aon"').canon, '{"x":{"a":1}}');
        const pkg = new lang_1.Lang().parse('p:@"@tabnas/jsonic/package.json"');
        Assert.equal(pkg.peg.p.peg.name.peg, '@tabnas/jsonic');
        const none = new lang_1.Lang().parse('a:@');
        Assert.equal(none.canon, 'nil');
        Assert.match(none.err[0].msg, /source not found/);
        Assert.throws(() => new lang_1.Lang().parse('a:@1'));
        const host = new lang_1.Lang({
            resolver: () => ({
                found: true, path: 'x.csv', full: '/nowhere/x.csv',
                kind: 'csv', src: 'a:1', search: [],
            }),
        });
        const refused = host.parse('v:@"./x.csv"');
        Assert.equal(refused.canon, 'nil');
        Assert.equal(refused.err[0].why, 'include_extension');
        Assert.match(refused.err[0].msg, /extension: \.csv/);
        const hostText = new lang_1.Lang({
            resolver: () => ({
                found: true, path: 'x.txt', full: '/nowhere/x.txt',
                kind: 'txt', src: 'a:1', search: [],
            }),
        });
        Assert.equal(hostText.parse('v:@"./x.txt"').canon, '{"v":"a:1"}');
        const hostMd = (ext, textExt) => new lang_1.Lang({
            textExt,
            resolver: () => ({
                found: true, path: 'x.' + ext, full: '/nowhere/x.' + ext,
                kind: ext, src: 'a:1', search: [],
            }),
        }).parse('v:@"x.' + ext + '"');
        Assert.equal(hostMd('md', ['md']).canon, '{"v":"a:1"}');
        const widenedJs = hostMd('js', ['js']);
        Assert.equal(widenedJs.canon, 'nil');
        Assert.match(widenedJs.err[0].msg, /extension: \.js/);
        // ... and a host resolution with no `full` at all: a resolver that
        // answers from something other than a filesystem need not have
        // chosen a path, so the WRITTEN one names the extension.
        const bare = new lang_1.Lang({
            resolver: () => ({ found: true, path: 'x.dat', kind: 'dat', src: 'a:1', search: [] }),
        });
        const barerefused = bare.parse('v:@"x.dat"');
        Assert.equal(barerefused.canon, 'nil');
        Assert.match(barerefused.err[0].msg, /extension: \.dat/);
    });
    (0, node_test_1.test)('raw-value-conversion', () => {
        const lang = new lang_1.Lang();
        // Forward slashes even on Windows: the path is embedded in aontu
        // SOURCE below, where a backslash is a string escape.
        const fixture = (name) => Path.join(__dirname, '..', 'test', name).split(Path.sep).join('/');
        const raw = fixture('raw.json');
        const rawfn = fixture('raw-fn.js');
        Assert.equal(lang.parse('1,,2').canon, '[1,nil,2]');
        // A JSON include is Aontu source (ADR-012), and every JSON kind is
        // a kind the grammar already has.
        Assert.equal(lang.parse('1, @"' + raw + '"').canon, '[1,{"a":1,"b":"s","c":true,"d":[1,2],"e":null,"f":1.5}]');
        const js = lang.parse('1, @"' + rawfn + '"');
        Assert.equal(js.canon, 'nil');
        Assert.equal(js.err[0].why, 'include_extension');
        Assert.match(js.err[0].msg, /extension: \.js/);
        Assert.equal(lang.parse('k2.b K:1').canon, '[.k2.b,{"K":1}]');
    });
});
(0, node_test_1.describe)('coverage3-lsp', () => {
    (0, node_test_1.test)('shared-spread-template-walks', () => {
        // The same template Val is reachable twice (peg + spread.cj), so both
        // walks take their already-seen arm.
        Assert.deepEqual((0, lsp_1.computeDiagnostics)('a:{&:{x:1},b:{}}'), []);
        const h = (0, lsp_1.computeHover)('a:{&:{x:1},b:{}}', { line: 0, character: 8 });
        Assert.ok(h);
        Assert.match(h.contents.value, /\*integer\*/);
    });
    (0, node_test_1.test)('siteless-nil-through-vars', () => {
        class SitelessNil extends NilVal_1.NilVal {
            get site() { return undefined; }
            set site(_s) { }
        }
        const nil = new SitelessNil({ why: 'test_nil', msg: 'no-site' });
        const ds = (0, lsp_1.computeDiagnostics)('a:$v', { vars: { v: nil } });
        const hit = ds.filter((d) => 'test_nil' === d.code);
        Assert.equal(hit.length, 1);
        Assert.deepEqual(hit[0].range.start, { line: 0, character: 0 });
    });
    (0, node_test_1.test)('conflict-message-with-both-operands', () => {
        const ds = (0, lsp_1.computeDiagnostics)('a:{b:1&"s"} c:$.a');
        const plain = ds.filter((d) => d.message.startsWith('Cannot '));
        Assert.equal(plain.length, 1);
        Assert.equal(plain[0].message.split('\n')[0], 'Cannot unify value: "s" with value: 1');
    });
    (0, node_test_1.test)('parse-error-positions', () => {
        // A throw carrying 1-based line/col places the diagnostic there.
        const ds = (0, lsp_1.computeDiagnostics)('a:1', {
            vars: {
                get v() {
                    const err = new Error('boom-at-3-5');
                    err.line = 3;
                    err.col = 5;
                    throw err;
                },
            },
        });
        Assert.equal(ds.length, 1);
        Assert.deepEqual(ds[0].range.start, { line: 2, character: 4 });
        // A non-Error throw stringifies at the document start.
        const ds2 = (0, lsp_1.computeDiagnostics)('a:1', {
            vars: { get v() { throw 'boom-str'; } },
        });
        Assert.equal(ds2[0].message, 'boom-str');
        Assert.deepEqual(ds2[0].range.start, { line: 0, character: 0 });
    });
    (0, node_test_1.test)('hover-refuses-bad-input', () => {
        Assert.equal((0, lsp_1.computeHover)({ isVal: true }, { line: 0, character: 0 }), null);
        class ThrowCanon extends IntegerVal_1.IntegerVal {
            get canon() { throw new Error('canon-boom'); }
        }
        const v = new ThrowCanon({ peg: 1 });
        v.site = { row: 1, col: 1, url: '' };
        Assert.equal((0, lsp_1.computeHover)(v, { line: 0, character: 0 }), null);
    });
    (0, node_test_1.test)('hover-kind-labels', () => {
        const label = (src, ch) => {
            const h = (0, lsp_1.computeHover)(src, { line: 0, character: ch });
            Assert.ok(h, 'no hover for ' + src);
            return h.contents.value;
        };
        // The unguarded self-reference is a RESIDUAL now (RECURSION.0.md):
        // hover shows the symbolic fixpoint, not an error.
        Assert.match(label('a:$.a', 2), /\*recurse\*/);
        Assert.match(label('a:$.nope', 2), /\*error\*/);
        Assert.match(label('a:$.b b:$.c c:$.d d:$.e e:$.f f:$.g g:$.h h:$.i i:$.j j:$.k k:$.l l:1', 2), /\*reference\*/);
        Assert.match(label('n:1.5', 2), /\*float\*/);
        Assert.match(label('x:null', 2), /\*scalar\*/);
        Assert.match(label('x:null|top', 2), /\*disjunct\*/);
        Assert.match(label('x:top|top', 2), /\*top\*/);
    });
    (0, node_test_1.test)('publish-for-unopened-document', () => {
        // A uri that changes between the store and the publish leaves the
        // publish with no document text.
        const uris = ['file:///a.aontu', 'file:///a.aontu', 'file:///b.aontu'];
        let n = 0;
        const outs = new lsp_1.LspHandler().handle({
            method: 'textDocument/didOpen',
            params: {
                textDocument: {
                    get uri() { return uris[n++]; },
                    text: 'a:1 a:2',
                },
            },
        });
        Assert.equal(outs.length, 1);
        Assert.equal(outs[0].params.uri, 'file:///b.aontu');
        Assert.deepEqual(outs[0].params.diagnostics, []);
    });
});
(0, node_test_1.describe)('coverage3-process', () => {
    (0, node_test_1.test)('eval-source-error-shapes', () => {
        const thrower = (err) => ({
            unify() { throw err; },
            generate() { throw err; },
        });
        const aerr = (0, cli_1.evalSource)(thrower(new err_1.AontuError('real-aontu')), 'a:1', 'json');
        Assert.deepEqual(aerr, { findings: [], ok: false, text: 'real-aontu' });
        const foreign = (0, cli_1.evalSource)(thrower({ aontu: true, message: 'foreign-aontu' }), 'a:1', 'json');
        Assert.deepEqual(foreign, { findings: [], ok: false, text: 'foreign-aontu' });
        const bare = (0, cli_1.evalSource)(thrower('just-a-string'), 'a:1', 'canon');
        Assert.deepEqual(bare, { findings: [], ok: false, text: 'just-a-string' });
        // AND THE COLLECTING SHAPE: the nils an engine failure carries are
        // what the finding is built from, which is what `--format json`
        // reports.
        const real = (0, cli_1.evalSource)(new aontu_1.Aontu(), 'a: 1 & 2', 'json');
        Assert.equal(real.ok, false);
        Assert.deepEqual(real.findings.map((f) => [f.code, f.class, f.path]), [['scalar_value', 'conflict', '$']]);
    });
    (0, node_test_1.test)('cli-version-without-a-version-field', () => {
        const fs = require('node:fs');
        const orig = fs.readFileSync;
        let r;
        try {
            fs.readFileSync = (fp, en) => (String(fp).endsWith('package.json') ? '{}' : orig(fp, en));
            r = capture(() => (0, cli_1.main)(['node', 'cli', '--version']));
        }
        finally {
            fs.readFileSync = orig;
        }
        Assert.equal(r.out.trim(), '0.0.0');
    });
    (0, node_test_1.test)('include-opts-carries-both-and-omits-neither', () => {
        const { includeOpts } = require('../dist/utility');
        Assert.deepEqual(includeOpts({}), {});
        Assert.deepEqual(includeOpts({ textExt: [] }), {});
        Assert.deepEqual(includeOpts({ textExt: ['md'] }), { textExt: ['md'] });
        Assert.deepEqual(includeOpts({ trust: { include: 'none' } }), { trust: { include: 'none' } });
        Assert.deepEqual(includeOpts({ trust: { include: 'none' }, textExt: ['md'] }), { trust: { include: 'none' }, textExt: ['md'] });
    });
    (0, node_test_1.test)('cli-text-ext-flag', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-txt-'));
        Fs.writeFileSync(Path.join(dir, 'doc.md'), '# hi\n');
        Fs.writeFileSync(Path.join(dir, 'rows.csv'), 'a,b\n1,2\n');
        const file = Path.join(dir, 'main.aon');
        Fs.writeFileSync(file, 'doc: @"./doc.md"\n');
        // The widening reads it ...
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', '--text-ext', 'md', '-c', file])).out, /\{"doc":"# hi\\n"\}/);
        // ... the dotted spelling is the same flag ...
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', '--text-ext', '.md', '-c', file])).out, /\{"doc":"# hi\\n"\}/);
        // ... a verb honours it too, which is the whole reason it rides
        // with the capability rather than beside it ...
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', 'model', 'get', '$.doc', '--text-ext', 'md', file])).out, /# hi/);
        // ... and every way of spelling it wrong is a usage error rather
        // than a flag that quietly does nothing.
        for (const bad of ['', '.', 'md,', 'a b', 'md,,sql']) {
            Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', '--text-ext', bad, file])).err, /--text-ext needs extensions/, `accepted: ${JSON.stringify(bad)}`);
            Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', 'model', 'get', '$.doc', '--text-ext', bad, file])).err, /--text-ext needs extensions/, `verb accepted: ${JSON.stringify(bad)}`);
        }
        // A trailing flag with no value at all, on both roads.
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', file, '--text-ext'])).err, /--text-ext needs extensions/);
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', 'model', 'get', '$.doc', file, '--text-ext'])).err, /--text-ext needs extensions/);
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    (0, node_test_1.test)('cli-file-error-path', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-'));
        const file = Path.join(dir, 'bad.aontu');
        Fs.writeFileSync(file, 'a:1 a:2');
        const r = capture(() => (0, cli_1.main)(['node', 'cli', file]));
        Assert.equal(r.out, '');
        Assert.match(r.err, /Cannot unify value/);
    });
    (0, node_test_1.test)('cli-bare-format-json', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-cov3-json-'));
        const good = Path.join(dir, 'good.aontu');
        Fs.writeFileSync(good, 'a:1 b:$.a');
        const ok = capture(() => (0, cli_1.main)(['node', 'cli', '--format', 'json', good]));
        Assert.equal(JSON.parse(ok.out).ok, true);
        Assert.equal(ok.err, '');
        const bad = Path.join(dir, 'bad.aontu');
        Fs.writeFileSync(bad, 'a:1 a:2');
        const failed = capture(() => (0, cli_1.main)(['node', 'cli', '--format', 'json', bad]));
        const report = JSON.parse(failed.out);
        Assert.equal(report.ok, false);
        Assert.equal(report.findings[0].code, 'scalar_value');
        Assert.equal(report.findings[0].class, 'conflict');
        Assert.match(capture(() => (0, cli_1.main)(['node', 'cli', '--format', 'yaml', good])).err, /--format needs text or json/);
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    (0, node_test_1.test)('lsp-server-default-streams', () => {
        // main() with no arguments uses the real stdout/exit defaults.
        const stdin = { on: () => stdin };
        const written = [];
        let exited;
        const so = process.stdout.write;
        const pe = process.exit;
        try {
            ;
            process.stdout.write = (c) => (written.push(Buffer.from(c)), true);
            process.exit = (code) => { exited = code; };
            const codec = (0, lsp_server_1.main)(stdin);
            const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' });
            codec.push(Buffer.concat([
                Buffer.from('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n', 'ascii'),
                Buffer.from(body, 'utf8'),
            ]));
            codec.end();
        }
        finally {
            process.stdout.write = so;
            process.exit = pe;
        }
        Assert.match(Buffer.concat(written).toString('utf8'), /Content-Length/);
        Assert.equal(exited, 0);
    });
});
(0, node_test_1.describe)('coverage3-deprecate', () => {
    (0, node_test_1.test)('deprecate-func-internals', () => {
        const ctx = new ctx_1.AontuContext({ root: (0, top_1.top)() });
        const d = new DeprecateFuncVal_1.DeprecateFuncVal({ peg: [] });
        const made = d.make(ctx, { peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] });
        Assert.equal(made.isDeprecateFunc, true);
        const argless = d.resolve(ctx, []);
        Assert.equal(argless.isNil, true);
        Assert.equal(argless.why, 'arg');
        const nil = new NilVal_1.NilVal({ why: 'test' });
        Assert.equal(d.resolve(ctx, [nil]), nil);
    });
    // The shared walk behind vet's warnings and the LSP tags: the
    // non-Val guard is for a bag's raw peg entries, which degenerate
    // parses can leave behind — pinned directly, with one.
    (0, node_test_1.test)('collect-deprecations-walk', () => {
        const m = new MapVal_1.MapVal({ peg: {} });
        const dep = new IntegerVal_1.IntegerVal({ peg: 1 });
        dep.deprecation = { msg: 'm' };
        const plain = new IntegerVal_1.IntegerVal({ peg: 2 });
        const inner = new ListVal_1.ListVal({ peg: [dep] });
        m.peg.a = inner;
        m.peg.b = plain;
        m.peg.raw = 42;
        const found = (0, utility_1.collectDeprecations)(m);
        Assert.equal(found.length, 1);
        Assert.deepEqual(found[0].path, ['a', '0']);
    });
});
(0, node_test_1.describe)('coverage3-subsume', () => {
    (0, node_test_1.test)('subsume-no-rule-fold', () => {
        const state = {
            profile: 'values', findings: [],
            generalUrl: 'general', specificUrl: 'specific',
        };
        const r = (0, subsume_1.subsumeNode)(state, [], new NilVal_1.NilVal({ why: 'test' }), new NilVal_1.NilVal({ why: 'test' }));
        Assert.equal(r, 'undecided');
        Assert.equal(state.findings.length, 1);
        Assert.equal(state.findings[0].code, 'sub_unresolved');
    });
});
(0, node_test_1.describe)('coverage3-trim', () => {
    // The trim internals no source reaches (G3 phase 6): the candidate
    // walk's raw-entry guard, and deleteAt's honest answers for paths a
    // candidate enumeration from an identical parse can never produce.
    (0, node_test_1.test)('trim-internals', () => {
        const raw = new MapVal_1.MapVal({ peg: {} });
        raw.peg.k = 7;
        const paths = [];
        (0, trim_1.candidates)(raw, [], paths);
        Assert.deepEqual(paths, [['k']]);
        const root = new MapVal_1.MapVal({ peg: {} });
        const inner = new MapVal_1.MapVal({ peg: {} });
        inner.optionalKeys = ['x', 'y'];
        inner.peg.x = new IntegerVal_1.IntegerVal({ peg: 1 });
        root.peg.a = inner;
        root.peg.s = new IntegerVal_1.IntegerVal({ peg: 2 });
        // A mid-path segment that is not a bag proves nothing to delete:
        // the walk stops inside the loop, before the final-key check.
        Assert.equal((0, trim_1.deleteAt)(root, ['s', 'deep', 'deeper']), false);
        // And when the FINAL parent is not a bag, the last check answers.
        Assert.equal((0, trim_1.deleteAt)(root, ['s', 'deep']), false);
        // A missing key likewise.
        Assert.equal((0, trim_1.deleteAt)(root, ['a', 'zz']), false);
        // A real optional entry deletes, and its optional mark goes too.
        Assert.equal((0, trim_1.deleteAt)(root, ['a', 'x']), true);
        Assert.deepEqual(inner.optionalKeys, ['y']);
        // evalCanon answers undefined for a probe whose deletion cannot
        // land (the caller's "load-bearing" fold).
        Assert.equal((0, trim_1.evalCanon)('a:1', {}, ['zz', 'deep']), undefined);
    });
});
(0, node_test_1.describe)('coverage3-hcanon', () => {
    (0, node_test_1.test)('hcanon-internals', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const raw = new MapVal_1.MapVal({ peg: {} }, ctx);
        raw.peg.k = 7;
        Assert.equal((0, hcanon_1.hcanon)(raw), '{"k":7}');
        const nested = new ConjunctVal_1.ConjunctVal({
            peg: [
                new DisjunctVal_1.DisjunctVal({
                    peg: [new IntegerVal_1.IntegerVal({ peg: 1 }), new IntegerVal_1.IntegerVal({ peg: 2 })],
                }, ctx),
                new IntegerVal_1.IntegerVal({ peg: 3 }),
            ],
        }, ctx);
        Assert.equal((0, hcanon_1.hcanon)(nested), '(1|2)&3');
        // A junction member with ONE term needs no parens: `1&3`, which is
        // what the same text reparses to.
        const single = new ConjunctVal_1.ConjunctVal({
            peg: [
                new DisjunctVal_1.DisjunctVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] }, ctx),
                new IntegerVal_1.IntegerVal({ peg: 3 }),
            ],
        }, ctx);
        Assert.equal((0, hcanon_1.hcanon)(single), '1&3');
        // And the hash is the hash form's digest, whatever the tree.
        Assert.match((0, hcanon_1.canonHash)(single), /^aon1-[A-Za-z0-9_-]{43}$/);
    });
});
(0, node_test_1.describe)('coverage3-query', () => {
    (0, node_test_1.test)('query-nested-junction-keeps-its-parens', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const root = new MapVal_1.MapVal({ peg: {} }, ctx);
        root.peg.j = new ConjunctVal_1.ConjunctVal({
            peg: [
                new DisjunctVal_1.DisjunctVal({
                    peg: [new IntegerVal_1.IntegerVal({ peg: 1 }), new IntegerVal_1.IntegerVal({ peg: 2 })],
                }, ctx),
                new IntegerVal_1.IntegerVal({ peg: 3 }),
            ],
        }, ctx);
        // Reached through the exported walk rather than the verb, which
        // would unify the tree and flatten it back.
        Assert.equal((0, query_1.projectFor)(root, 'canon', Infinity), '{"j":(1|2)&3}');
        Assert.equal((0, query_1.projectFor)(root, 'types', Infinity), '{"j":(integer|integer)&integer}');
    });
});
(0, node_test_1.describe)('coverage3-provenance', () => {
    (0, node_test_1.test)('provenance-orders-same-site-contributions-by-canon', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const zed = new StringVal_1.StringVal({ peg: 'z' }, ctx);
        const alf = new StringVal_1.StringVal({ peg: 'a' }, ctx);
        for (const v of [zed, alf]) {
            v.site.url = 'one.aon';
        }
        const prov = new provenance_1.Provenance();
        prov.writtenFrom(new MapVal_1.MapVal({ peg: { z: zed, a: alf } }, ctx));
        prov.record(['k'], zed, alf, new StringVal_1.StringVal({ peg: 'z' }, ctx));
        Assert.deepEqual(prov.at(['k']).map((c) => c.canon), ['"a"', '"z"']);
        // A path nothing met has no record at all.
        Assert.deepEqual(prov.at(['nowhere']), []);
    });
    (0, node_test_1.test)('mark-spread-visits-a-shared-child-once', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const shared = new StringVal_1.StringVal({ peg: 'x' }, ctx);
        const tree = new MapVal_1.MapVal({ peg: { a: shared, b: shared } }, ctx);
        (0, provenance_1.markSpread)(tree);
        Assert.equal(shared._fromSpread, true);
        Assert.equal(tree._fromSpread, true);
        // A SECOND application re-walks and re-marks: the fixpoint replaces
        // a template's children between the two, and the replacements are
        // what the first walk could not have seen.
        const replaced = new StringVal_1.StringVal({ peg: 'y' }, ctx);
        tree.peg.a = replaced;
        (0, provenance_1.markSpread)(tree);
        Assert.equal(replaced._fromSpread, true);
    });
    (0, node_test_1.test)('one-written-token-is-one-contribution', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const at = (v) => {
            v.site.row = 1;
            v.site.col = 4;
            v.site.url = 'one.aon';
            v.site.src = 'x';
            return v;
        };
        const lit = at(new StringVal_1.StringVal({ peg: 'x' }, ctx));
        const narrowed = at(new StringVal_1.StringVal({ peg: 'x' }, ctx));
        const prov = new provenance_1.Provenance();
        prov.writtenFrom(new MapVal_1.MapVal({ peg: { a: lit, b: narrowed } }, ctx));
        narrowed._fromSpread = true;
        prov.record(['k'], lit, narrowed, undefined);
        const got = prov.at(['k']);
        Assert.equal(got.length, 1, JSON.stringify(got));
        // The role that says HOW it got here wins over "written there".
        Assert.equal(got[0].role, 'spread');
        // An UNSITED contribution cannot be told apart from another, so
        // they are kept as they come rather than collapsed.
        const p = new StringVal_1.StringVal({ peg: 'p' }, ctx);
        const q = new StringVal_1.StringVal({ peg: 'q' }, ctx);
        const prov2 = new provenance_1.Provenance();
        prov2.writtenFrom(new MapVal_1.MapVal({ peg: { p, q } }, ctx));
        prov2.record(['u'], p, q, undefined);
        Assert.equal(prov2.at(['u']).length, 2);
    });
});
(0, node_test_1.describe)('coverage3-address', () => {
    (0, node_test_1.test)('address-spellings', () => {
        // Absolute, from the root.
        Assert.deepEqual((0, PathVal_1.parseAddress)('$.a.b'), { absolute: true, up: 0, parts: ['a', 'b'] });
        // A list index is a segment like any other.
        Assert.deepEqual((0, PathVal_1.parseAddress)('$.a.0'), { absolute: true, up: 0, parts: ['a', '0'] });
        // Relative: the sibling scope, then one step up per further dot.
        Assert.deepEqual((0, PathVal_1.parseAddress)('.b'), { absolute: false, up: 0, parts: ['b'] });
        Assert.deepEqual((0, PathVal_1.parseAddress)('..b.c'), { absolute: false, up: 1, parts: ['b', 'c'] });
        for (const bad of ['$', '', 'a.b', 'services.auth', '$.', '$.a.',
            '$..a', '.', '..', '$.a b', '$.a:b', '$.a/b',
            // ... and the same refusals on the RELATIVE arm, which validates
            // its segments separately.
            '.a b', '.a/b', '..a.', '.a..b']) {
            Assert.strictEqual((0, PathVal_1.parseAddress)(bad), undefined, bad);
        }
    });
    (0, node_test_1.test)('address-path-resolution', () => {
        // An absolute address ignores where it is written.
        Assert.deepEqual((0, ReferFuncVal_1.addressPath)((0, PathVal_1.parseAddress)('$.a.b'), ['x', 'y', 'dep']), ['a', 'b']);
        // A relative one drops the link's OWN key and reads the sibling
        // scope: a link at $.x.y.dep spelling `.other` means $.x.y.other.
        Assert.deepEqual((0, ReferFuncVal_1.addressPath)((0, PathVal_1.parseAddress)('.other'), ['x', 'y', 'dep']), ['x', 'y', 'other']);
        // Each further dot is one step further up.
        Assert.deepEqual((0, ReferFuncVal_1.addressPath)((0, PathVal_1.parseAddress)('..other'), ['x', 'y', 'dep']), ['x', 'other']);
        // Numeric segments (a list position) render as strings.
        Assert.deepEqual((0, ReferFuncVal_1.addressPath)((0, PathVal_1.parseAddress)('.other'), ['x', 0, 'dep']), ['x', '0', 'other']);
        // A CLIMB OFF THE TOP is not a pending address — no later pass can
        // grow a tree upwards — so it answers undefined and settle refuses.
        Assert.strictEqual((0, ReferFuncVal_1.addressPath)((0, PathVal_1.parseAddress)('...z'), ['a', 'dep']), undefined);
    });
});
(0, node_test_1.describe)('coverage3-residual-shapes', () => {
    (0, node_test_1.test)('rel-func-shape', () => {
        // The clone hook and name of the rel() function itself: specs
        // resolve rel() before any clone or unresolved canon needs them,
        // so the hooks are pinned here the way id-func-shape pins id's.
        const ctx = new aontu_1.Aontu().ctx({});
        const fn = new ReferFuncVal_1.RelFuncVal({ peg: [] }, ctx);
        Assert.strictEqual(fn.funcname(), 'rel');
        Assert.strictEqual(fn.isRelFunc, true);
        const made = fn.make(ctx, { peg: fn.peg });
        Assert.strictEqual(made.isRelFunc, true);
        // Resolving with no argument answers the settled residual with
        // the open type.
        const out = fn.resolve(ctx, []);
        Assert.strictEqual(out.isRel, true);
        Assert.strictEqual(out.tval.isTop, true);
        Assert.strictEqual(out.canon, 'rel()');
    });
    (0, node_test_1.test)('constraint-hands-drive-to-rel-and-atom', () => {
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const con = new aontu_1.Aontu().unify('c: re("^j")').peg.c;
        Assert.strictEqual(con.isConstraint, true);
        const atom = new GraphAtomVal_1.GraphAtomVal({ akind: 'acyclic' }, ctx);
        const viaAtom = con.unify(atom, ctx);
        Assert.strictEqual(viaAtom.isGraphAtom, true);
        Assert.strictEqual(viaAtom.held.isConstraint, true);
        const rel = new aontu_1.Aontu().unify('r: rel()').peg.r;
        Assert.strictEqual(rel.isRel, true);
        const viaRel = con.unify(rel, ctx);
        Assert.strictEqual(viaRel.isRel, true);
    });
    (0, node_test_1.test)('graph-atom-shape', () => {
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        // Bare atom: DONE at birth, self-drive answers itself.
        const bare = new GraphAtomVal_1.GraphAtomVal({ akind: 'acyclic' }, ctx);
        Assert.strictEqual(bare.done, true);
        Assert.strictEqual(bare.unify(null, ctx), bare);
        // A held that is already done: the self-drive records DONE in
        // place and answers the atom.
        const held = new GraphAtomVal_1.GraphAtomVal({
            akind: 'inverse', invname: 'q', held: new IntegerVal_1.IntegerVal({ peg: 1 }, ctx),
        }, ctx);
        held.dc = 0;
        Assert.strictEqual(held.unify(null, ctx), held);
        Assert.strictEqual(held.done, true);
        const broken = new GraphAtomVal_1.GraphAtomVal({
            akind: 'acyclic', held: new ConjunctVal_1.ConjunctVal({
                peg: [new IntegerVal_1.IntegerVal({ peg: 1 }, ctx), new IntegerVal_1.IntegerVal({ peg: 2 }, ctx)],
            }, ctx),
        }, ctx);
        Assert.strictEqual(broken.done, false);
        Assert.strictEqual(broken.unify(null, ctx).isNil, true);
        // The clone hook carries the declaration and the held.
        const c = held.clone(ctx);
        Assert.strictEqual(c.akind, 'inverse');
        Assert.strictEqual(c.invname, 'q');
        Assert.strictEqual(c.held, held.held);
        Assert.strictEqual(c.done, true);
        // Dedup with one side unheld: the held side's value survives.
        const dup = new GraphAtomVal_1.GraphAtomVal({ akind: 'inverse', invname: 'q' }, ctx);
        const merged = held.unify(dup, ctx);
        Assert.strictEqual(merged.isGraphAtom, true);
        Assert.strictEqual(merged.held.peg, 1);
        // Absorbing a first value: the atom carries it.
        const carry = bare.unify(new IntegerVal_1.IntegerVal({ peg: 7 }, ctx), ctx);
        Assert.strictEqual(carry.isGraphAtom, true);
        Assert.strictEqual(carry.held.peg, 7);
        // The funcval make/name hooks, as rel-func-shape pins rel's.
        const afn = new GraphAtomVal_1.AcyclicFuncVal({ peg: [] }, ctx);
        Assert.strictEqual(afn.funcname(), 'acyclic');
        Assert.strictEqual(afn.make(ctx, { peg: [] }).isVal, true);
        const ifn = new GraphAtomVal_1.InverseFuncVal({ peg: [] }, ctx);
        Assert.strictEqual(ifn.funcname(), 'inverse');
        Assert.strictEqual(ifn.make(ctx, { peg: [] }).isVal, true);
    });
    (0, node_test_1.test)('recurse-budget-backstop', () => {
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const rec = new RecurseVal_1.RecurseVal({ target: ['n'], xc: 1000 }, ctx);
        const out = rec.unify(new MapVal_1.MapVal({ peg: {} }, ctx), ctx);
        Assert.strictEqual(out.isNil, true);
        Assert.strictEqual(out.why, 'recursion_budget');
        Assert.strictEqual(out.details.target, '$.n');
    });
    (0, node_test_1.test)('recurse-residual-shape', () => {
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const mk = (t) => new RecurseVal_1.RecurseVal({ target: t }, ctx);
        // Self-drive: nothing to advance.
        const r = mk(['n']);
        Assert.strictEqual(r.unify(null, ctx), r);
        // The same fixpoint twice is one fixpoint.
        Assert.strictEqual(r.unify(mk(['n']), ctx), r);
        // Mutual recursion meeting: both held, in a conjunct.
        Assert.strictEqual(r.unify(mk(['m']), ctx).isConjunct, true);
        // Concrete structure whose definition has not assembled (the
        // root holds no `n`): the peer is held beside the residual.
        Assert.strictEqual(r.unify(new MapVal_1.MapVal({ peg: {} }, ctx), ctx).isConjunct, true);
        // Anything else -- here a graph atom -- waits beside the
        // residual the same way.
        const atom = new GraphAtomVal_1.GraphAtomVal({ akind: 'acyclic' }, ctx);
        Assert.strictEqual(r.unify(atom, ctx).isConjunct, true);
        // bumpRecurse: the guard arms (nothing, a non-val), the conjunct
        // arm, and the spread tail.
        (0, RecurseVal_1.bumpRecurse)(null, 3);
        (0, RecurseVal_1.bumpRecurse)({ some: 'object' }, 3);
        const cj = new ConjunctVal_1.ConjunctVal({ peg: [mk(['n'])] }, ctx);
        (0, RecurseVal_1.bumpRecurse)(cj, 5);
        Assert.strictEqual(cj.peg[0].xc, 5);
        const spreadMap = new MapVal_1.MapVal({ peg: {} }, ctx);
        spreadMap.spread.cj = mk(['n']);
        (0, RecurseVal_1.bumpRecurse)(spreadMap, 4);
        Assert.strictEqual(spreadMap.spread.cj.xc, 4);
        const ref = new RefVal_1.RefVal({ peg: ['n'], absolute: true }, ctx);
        (0, RecurseVal_1.bumpRecurse)(ref, 7);
        Assert.strictEqual(ref.rxc, 7);
        // Monotone, like the residual arm beside it.
        (0, RecurseVal_1.bumpRecurse)(ref, 3);
        Assert.strictEqual(ref.rxc, 7);
        // containsRecurseOf: the depth guard, and a raw reference of a
        // DIFFERENT length is not the target.
        Assert.strictEqual((0, RecurseVal_1.containsRecurseOf)(mk(['n']), ['n'], 9), false);
        Assert.strictEqual((0, RecurseVal_1.containsRecurseOf)(mk(['n']), ['n'], 0), true);
        Assert.strictEqual((0, RecurseVal_1.containsRecurseOf)(mk(['n', 'm']), ['n'], 0), false);
    });
});
(0, node_test_1.describe)('coverage3-apply-flows', () => {
    (0, node_test_1.test)('apply-flows-skips-a-record-that-stops-resolving', () => {
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({ collect: true });
        const target = new MapVal_1.MapVal({ peg: {} }, ctx);
        const root = new MapVal_1.MapVal({ peg: { a: target } }, ctx);
        ctx.referflows = new Map([
            ['a', new MapVal_1.MapVal({ peg: { k: new IntegerVal_1.IntegerVal({ peg: 1 }, ctx) } }, ctx)],
            ['gone', new MapVal_1.MapVal({ peg: {} }, ctx)],
            ['a\x00k\x00deeper', new MapVal_1.MapVal({ peg: {} }, ctx)],
            ['nosuch\x00x', new MapVal_1.MapVal({ peg: {} }, ctx)],
        ]);
        const out = (0, unify_1.applyFlows)(ctx, root);
        Assert.strictEqual(out, root);
        // The resolvable record landed ...
        Assert.strictEqual(out.peg.a.peg.k.peg, 1);
        // ... and the unresolvable ones added nothing.
        Assert.strictEqual(out.peg.gone, undefined);
        Assert.strictEqual(out.peg.nosuch, undefined);
    });
    (0, node_test_1.test)('apply-flows-is-a-no-op-without-records', () => {
        // The common case: a document with no links pays one property load
        // per pass and the walk never runs.
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({ collect: true });
        const root = new MapVal_1.MapVal({ peg: {} }, ctx);
        Assert.strictEqual((0, unify_1.applyFlows)(ctx, root), root);
        ctx.referflows = new Map();
        Assert.strictEqual((0, unify_1.applyFlows)(ctx, root), root);
    });
});
(0, node_test_1.describe)('coverage3-refer', () => {
    (0, node_test_1.test)('find-at-walks-into-non-bags', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const m = new MapVal_1.MapVal({ peg: { p: new IntegerVal_1.IntegerVal({ peg: 1 }, ctx) } }, ctx);
        const root = new MapVal_1.MapVal({ peg: { x: m } }, ctx);
        // Walking THROUGH a scalar, and walking into a key that is not
        // there: both are "not (yet) resolvable", not a crash.
        Assert.strictEqual((0, ReferFuncVal_1.findAt)(root, ['x', 'p', 'q']), undefined);
        Assert.strictEqual((0, ReferFuncVal_1.findAt)(root, ['x', 'nope']), undefined);
        // No tree to walk, and the empty path (`$`, refused as an address
        // because it has no parent to be written back into).
        Assert.strictEqual((0, ReferFuncVal_1.findAt)(undefined, ['x']), undefined);
        Assert.strictEqual((0, ReferFuncVal_1.findAt)(root, []), undefined);
        const found = (0, ReferFuncVal_1.findAt)(root, ['x', 'p']);
        Assert.strictEqual(found.parent, m);
        Assert.strictEqual(found.key, 'p');
    });
    (0, node_test_1.test)('refer-peers-the-dispatcher-never-hands-it', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const r = new ReferFuncVal_1.ReferVal({}, ctx);
        // A NIL peer is absorbing, as everywhere else: the residual answers
        // the existing failure rather than minting a second one.
        const nil = new NilVal_1.NilVal({ why: 'test-nil' }, ctx);
        Assert.strictEqual(r.unify(nil, ctx), nil);
        // And an absent peer is the self-drive `unite` substitutes TOP for.
        Assert.strictEqual(r.unify(undefined, ctx), r);
    });
    (0, node_test_1.test)('refer-second-path-peer-refines-by-prefix', () => {
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const r = new ReferFuncVal_1.ReferVal({}, ctx);
        r.addr = (0, PathVal_1.parseAddress)('$.q');
        r.addrsrc = '$.q';
        const refined = r.unify(new PathVal_1.PathVal({ peg: '$.q.r' }, ctx), ctx);
        Assert.strictEqual(refined.addrsrc, '$.q.r');
        // The prefix rule is symmetric in which side is pending.
        const kept = refined.unify(new PathVal_1.PathVal({ peg: '$.q' }, ctx), ctx);
        Assert.strictEqual(kept.addrsrc, '$.q.r');
        const nil = r.unify(new PathVal_1.PathVal({ peg: '$.z' }, ctx), ctx);
        Assert.strictEqual(true, nil.isNil);
    });
    (0, node_test_1.test)('refer-holds-a-second-constraint-by-meet', () => {
        // Same cross-pass channel as the second-path arm: constraints in
        // one conjunct merge with each other before the residual folds,
        // so held's meet arm is only reached by a late-delivered peer.
        const ctx = new aontu_1.Aontu().ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const r = new ReferFuncVal_1.ReferVal({}, ctx);
        const r1 = r.unify(new ScalarKindVal_1.ScalarKindVal({ peg: String }, ctx), ctx);
        Assert.strictEqual(true, null != r1.held);
        const r2 = r1.unify(new ScalarKindVal_1.ScalarKindVal({ peg: String }, ctx), ctx);
        Assert.strictEqual(true, null != r2.held);
        Assert.strictEqual(true, true !== r2.held.isNil);
    });
    (0, node_test_1.test)('refer-flow-refusal-is-the-nil', () => {
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({ collect: true });
        const m = new MapVal_1.MapVal({ peg: { k: new IntegerVal_1.IntegerVal({ peg: 1 }, ctx) } }, ctx);
        ctx.root = new MapVal_1.MapVal({ peg: { x: m } }, ctx);
        const r = new ReferFuncVal_1.ReferVal({}, ctx);
        r.tval = new IntegerVal_1.IntegerVal({ peg: 1 }, ctx);
        r.addr = (0, PathVal_1.parseAddress)('$.x');
        r.addrsrc = '$.x';
        Assert.strictEqual(r.settle(ctx, r).isNil, true);
    });
    (0, node_test_1.test)('refer-climb-off-the-top-refuses', () => {
        // A relative address with more parent steps than the link has
        // ancestors. No later pass can grow the tree upwards, so this
        // refuses at once rather than residuating to the last pass.
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({ collect: true });
        ctx.root = new MapVal_1.MapVal({ peg: {} }, ctx);
        const r = new ReferFuncVal_1.ReferVal({}, ctx);
        r.addr = (0, PathVal_1.parseAddress)('...z');
        r.addrsrc = '...z';
        r.path = ['a', 'dep'];
        Assert.strictEqual(r.settle(ctx, r).isNil, true);
    });
});
(0, node_test_1.describe)('coverage3-graph', () => {
    (0, node_test_1.test)('graph-of-survives-a-cycle', () => {
        const ctx = new aontu_1.Aontu().ctx({});
        const root = new MapVal_1.MapVal({ peg: {} }, ctx);
        root.peg.self = root;
        const g = (0, graph_1.graphOf)(root);
        // The ancestor guard stops the descent the moment the cycle closes
        // back onto a node already on the path.
        Assert.deepEqual(g.edges, []);
    });
    (0, node_test_1.test)('graph-of-answers-a-non-val-slot', () => {
        // A bag slot can hold a raw value or nothing at all in a hand-built
        // tree; the walk answers it rather than descending into it.
        const ctx = new aontu_1.Aontu().ctx({});
        const root = new MapVal_1.MapVal({ peg: { raw: 5, gap: undefined } }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, []);
    });
    (0, node_test_1.test)('graph-cut-derives-the-source-node', () => {
        // The cut, at every shape a link can sit in. Built by hand because
        // the AT-THE-ROOT case has no enclosing key for a document to give
        // it.
        const ctx = new aontu_1.Aontu().ctx({});
        const link = (addr, relkey) => {
            const v = new StringVal_1.StringVal({ peg: addr }, ctx);
            v.link = addr;
            if (undefined !== relkey) {
                v.relkey = relkey;
            }
            return v;
        };
        // A link under a key: the key is the relation, its parent the node.
        let root = new MapVal_1.MapVal({ peg: {} }, ctx);
        root.peg.web = new MapVal_1.MapVal({ peg: { dependsOn: link('$.db') } }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, [{ from: '$.web', key: 'dependsOn', to: '$.db', at: '$.web.dependsOn' }]);
        // A link inside a LIST: the index is a position within the
        // relation, not a relation of its own.
        root = new MapVal_1.MapVal({ peg: {} }, ctx);
        root.peg.web = new MapVal_1.MapVal({ peg: { dependsOn: new ListVal_1.ListVal({ peg: [link('$.db')] }, ctx) } }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, [{
                from: '$.web', key: 'dependsOn', to: '$.db',
                at: '$.web.dependsOn.0'
            }]);
        // A DECLARED predicate cuts at the key the rel() sat on, wherever
        // it is on the way down — which is what makes a MAP-valued
        // relation report the relation rather than the inner label.
        root = new MapVal_1.MapVal({ peg: {} }, ctx);
        root.peg.web = new MapVal_1.MapVal({
            peg: {
                dependsOn: new MapVal_1.MapVal({ peg: { primary: link('$.db', 'dependsOn') } }, ctx)
            }
        }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, [{
                from: '$.web', key: 'dependsOn', to: '$.db',
                at: '$.web.dependsOn.primary'
            }]);
        // A link AT THE TOP of the document has no node above it: the
        // source is the root itself.
        root = new MapVal_1.MapVal({ peg: { dep: link('$.db') } }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, [{ from: '$', key: 'dep', to: '$.db', at: '$.dep' }]);
        // A declared predicate that is not on the path falls back to the
        // inference — a shape no rel() produces, since the predicate IS a
        // segment of the link's own path.
        root = new MapVal_1.MapVal({ peg: { dep: link('$.db', 'nowhere') } }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(root).edges, [{ from: '$', key: 'nowhere', to: '$.db', at: '$.dep' }]);
        // A link at the root of a LIST document: nothing but indices above
        // it, so the source is the root and the relation is unlabelled.
        const lroot = new ListVal_1.ListVal({ peg: [link('$.db')] }, ctx);
        Assert.deepEqual((0, graph_1.graphOf)(lroot).edges, [{ from: '$', key: '', to: '$.db', at: '$.0' }]);
    });
});
(0, node_test_1.describe)('coverage3-staging', () => {
    (0, node_test_1.test)('a-hole-has-nothing-above-it', () => {
        const place = new PlaceVal_1.PlaceVal({});
        Assert.strictEqual(place.superior(), place);
    });
    (0, node_test_1.test)('residuation-answers-a-nil-peer', () => {
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({});
        const key = new KeyFuncVal_1.KeyFuncVal({ peg: [] }, ctx);
        const nil = new NilVal_1.NilVal({ why: 'test-nil-peer' }, ctx);
        // ctx.settle is false, so this is the residuation path.
        Assert.strictEqual(key.unify(nil, ctx), nil);
    });
    (0, node_test_1.test)('nil-absorbs-a-unify', () => {
        const a0 = new aontu_1.Aontu();
        const ctx = a0.ctx({});
        const nil = new NilVal_1.NilVal({ why: 'test-absorb' }, ctx);
        Assert.strictEqual(nil.unify((0, top_1.top)(), ctx), nil);
    });
    (0, node_test_1.test)('defaulted-scrutinee-multi-pref-min-rank', () => {
        const rank2 = new PrefVal_1.PrefVal({
            peg: new PrefVal_1.PrefVal({ peg: new IntegerVal_1.IntegerVal({ peg: 1 }) }),
        });
        const rank1 = new PrefVal_1.PrefVal({ peg: new IntegerVal_1.IntegerVal({ peg: 2 }) });
        const d1 = new DisjunctVal_1.DisjunctVal({ peg: [rank2, rank1] });
        Assert.strictEqual((0, MatchFuncVal_1.effectiveScrutinee)(d1).peg, 2);
        const d2 = new DisjunctVal_1.DisjunctVal({ peg: [rank1, rank2] });
        Assert.strictEqual((0, MatchFuncVal_1.effectiveScrutinee)(d2).peg, 2);
    });
    (0, node_test_1.test)('bag-same-is-structural', () => {
        const one = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        const two = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        Assert.equal(one.same(one), true, 'identity');
        Assert.equal(one.same(two), true, 'same shape');
        Assert.equal(one.same(new IntegerVal_1.IntegerVal({ peg: 1 })), false, 'not a bag');
        Assert.equal(one.same(undefined), false, 'no peer');
        const closed = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        closed.closed = true;
        Assert.equal(one.same(closed), false, 'closedness');
        const marked = new MapVal_1.MapVal({ peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }) } });
        marked.mark.type = true;
        Assert.equal(one.same(marked), false, 'marks');
        const wider = new MapVal_1.MapVal({
            peg: { a: new IntegerVal_1.IntegerVal({ peg: 1 }), b: new IntegerVal_1.IntegerVal({ peg: 2 }) },
        });
        Assert.equal(one.same(wider), false, 'key count');
    });
    (0, node_test_1.test)('disjunct-single-member-generates', () => {
        const d = new DisjunctVal_1.DisjunctVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 7 })] });
        Assert.equal(d.gen(CTX()), 7);
    });
});
//# sourceMappingURL=coverage3.test.js.map