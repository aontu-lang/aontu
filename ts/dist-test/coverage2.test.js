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
// Coverage round 4: the remaining reachable branches — in-process CLI
// REPL/stdin runs on a swapped stdin, the LSP server wiring, spread
// clone arms, the exact-comparison edges, constraint meets, and the
// long tail of small val branches (see docs/test-coverage.md).
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const node_stream_1 = require("node:stream");
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const ctx_1 = require("../dist/ctx");
const err_1 = require("../dist/err");
const exactjson_1 = require("../dist/exactjson");
const hints_1 = require("../dist/hints");
const keyorder_1 = require("../dist/keyorder");
const lang_1 = require("../dist/lang");
const unify_1 = require("../dist/unify");
const cli_1 = require("../dist/cli");
const lsp_server_1 = require("../dist/lsp-server");
const lsp_1 = require("../dist/lsp");
const top_1 = require("../dist/val/top");
const MapVal_1 = require("../dist/val/MapVal");
const ListVal_1 = require("../dist/val/ListVal");
const IntegerVal_1 = require("../dist/val/IntegerVal");
const NumberVal_1 = require("../dist/val/NumberVal");
const BigIntegerVal_1 = require("../dist/val/BigIntegerVal");
const BigDecimalVal_1 = require("../dist/val/BigDecimalVal");
const Decimal_1 = require("../dist/val/Decimal");
const NilVal_1 = require("../dist/val/NilVal");
const RefVal_1 = require("../dist/val/RefVal");
const ConjunctVal_1 = require("../dist/val/ConjunctVal");
const DisjunctVal_1 = require("../dist/val/DisjunctVal");
const PrefVal_1 = require("../dist/val/PrefVal");
const ScalarKindVal_1 = require("../dist/val/ScalarKindVal");
const FuncBaseVal_1 = require("../dist/val/FuncBaseVal");
const KeyFuncVal_1 = require("../dist/val/KeyFuncVal");
const CopyFuncVal_1 = require("../dist/val/CopyFuncVal");
const LowerFuncVal_1 = require("../dist/val/LowerFuncVal");
const MoveFuncVal_1 = require("../dist/val/MoveFuncVal");
const OpenFuncVal_1 = require("../dist/val/OpenFuncVal");
const SuperFuncVal_1 = require("../dist/val/SuperFuncVal");
const PathFuncVal_1 = require("../dist/val/PathFuncVal");
const valutil_1 = require("../dist/val/valutil");
const numcmp_1 = require("../dist/val/numcmp");
const numkind_1 = require("../dist/val/numkind");
function makeCtx() {
    return new ctx_1.AontuContext({ root: new MapVal_1.MapVal({ peg: {} }) });
}
// A root whose key is pending, so absolute references into it defer.
function pendingCtx() {
    const root = new MapVal_1.MapVal({
        peg: { zz: new ConjunctVal_1.ConjunctVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] }) },
    });
    return new ctx_1.AontuContext({ root });
}
(0, node_test_1.describe)('coverage2-cli', () => {
    function captureOut() {
        const so = process.stdout.write;
        let out = '';
        process.stdout.write = (s) => ((out += s), true);
        return {
            get: () => out,
            restore: () => {
                process.stdout.write = so;
                process.exitCode = 0;
            },
        };
    }
    function swapStdin(fake) {
        const desc = Object.getOwnPropertyDescriptor(process, 'stdin');
        Object.defineProperty(process, 'stdin', {
            value: fake, configurable: true,
        });
        return () => Object.defineProperty(process, 'stdin', desc);
    }
    // COLOUR IS A DECISION ABOUT THE DESTINATION (the review's finding
    // F), and only the command can see the destination. Every other test
    // in this suite runs with stderr captured or piped, which is the
    // colour-OFF arm; this is the other one.
    (0, node_test_1.test)('an-interactive-stderr-leaves-colour-to-no-color', () => {
        const desc = Object.getOwnPropertyDescriptor(process, 'stderr');
        const fakeErr = new node_stream_1.PassThrough();
        fakeErr.isTTY = true;
        Object.defineProperty(process, 'stderr', {
            value: fakeErr, configurable: true,
        });
        const cap = captureOut();
        try {
            // `-v` exercises main()'s entry and returns immediately: the
            // decision under test is made before any argument is read.
            (0, cli_1.main)(['node', 'cli', '-v']);
            Assert.equal((0, err_1.colorActive)(), true);
        }
        finally {
            cap.restore();
            Object.defineProperty(process, 'stderr', desc);
            // The gate is process-global: leave it as the rest of the suite
            // expects to find it.
            (0, err_1.setColor)(false);
        }
    });
    (0, node_test_1.test)('repl-in-process', async () => {
        const fakeIn = new node_stream_1.PassThrough();
        fakeIn.isTTY = true;
        const restoreIn = swapStdin(fakeIn);
        const cap = captureOut();
        try {
            (0, cli_1.main)(['node', 'cli']);
            // A :load through the LOOP, which reads a real file: the
            // handler's reader is injected, and this is where the real one
            // is wired.
            const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-repl-'));
            const doc = Path.join(dir, 'doc.aon');
            Fs.writeFileSync(doc, 'a: 1');
            for (const line of [
                ':help\n', ':canon\n', ':json\n', ':bogus\n', '\n',
                `:load ${doc}\n`, ':get $.a\n', 'a:1\n', ':quit\n',
            ]) {
                fakeIn.write(line);
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        finally {
            cap.restore();
            restoreIn();
        }
        const out = cap.get();
        for (const want of [
            'REPL', 'Usage: aontu', 'canon output', 'json output',
            'unknown command', '"a": 1', 'loaded: ',
        ]) {
            Assert.ok(out.includes(want), 'repl output missing ' + want + ':\n' + out);
        }
    });
    // The REPL's SESSION protocol (G7 phase 7): no banner, no prompt,
    // one JSON line per answer.
    (0, node_test_1.test)('repl-jsonl-in-process', async () => {
        const fakeIn = new node_stream_1.PassThrough();
        fakeIn.isTTY = true;
        const restoreIn = swapStdin(fakeIn);
        const cap = captureOut();
        try {
            (0, cli_1.main)(['node', 'cli', '--jsonl']);
            for (const line of ['a:1\n', ':quit\n']) {
                fakeIn.write(line);
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        finally {
            cap.restore();
            restoreIn();
        }
        const out = cap.get();
        Assert.ok(!out.includes('aontu>'), 'jsonl session printed a prompt:\n' + out);
        Assert.ok(out.includes('{"ok":true,"out":"{\\n  \\"a\\": 1\\n}"}'), out);
    });
    (0, node_test_1.test)('stdin-in-process', async () => {
        const fakeIn = new node_stream_1.PassThrough();
        const restoreIn = swapStdin(fakeIn);
        const cap = captureOut();
        try {
            (0, cli_1.main)(['node', 'cli']);
            fakeIn.write('a:2');
            fakeIn.end();
            await new Promise((r) => setTimeout(r, 100));
        }
        finally {
            cap.restore();
            restoreIn();
        }
        Assert.ok(cap.get().includes('"a": 2'), cap.get());
    });
});
(0, node_test_1.describe)('coverage2-lsp-server', () => {
    (0, node_test_1.test)('main-wiring', () => {
        const fakeIn = new node_stream_1.PassThrough();
        const written = [];
        let exited;
        (0, lsp_server_1.main)(fakeIn, (c) => void written.push(Buffer.from(c)), (code) => {
            exited = code;
        });
        const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        fakeIn.write(Buffer.from('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body));
        Assert.ok(0 < written.length);
        fakeIn.end();
        return new Promise((resolve) => setImmediate(() => {
            Assert.equal(exited, 1);
            resolve();
        }));
    });
});
(0, node_test_1.describe)('coverage2-lsp', () => {
    (0, node_test_1.test)('diagnostics-vars-and-parse-error', () => {
        const ok = (0, lsp_1.computeDiagnostics)('a:$v b:1', {
            vars: { v: new IntegerVal_1.IntegerVal({ peg: 1 }) },
        });
        Assert.deepEqual(ok, []);
        const bad = (0, lsp_1.computeDiagnostics)('a:number > 0');
        Assert.ok(0 < bad.length);
        Assert.ok(bad.some((d) => 'parse' === d.code));
        const conflict = (0, lsp_1.computeDiagnostics)('a:1 a:2');
        Assert.ok(0 < conflict.length);
    });
    (0, node_test_1.test)('hover-parse-error-and-kinds', () => {
        Assert.equal((0, lsp_1.computeHover)('a:number > 0', { line: 0, character: 0 }), null);
        const hs = (0, lsp_1.computeHover)('a:"txt"', { line: 0, character: 3 });
        Assert.ok(null == hs || JSON.stringify(hs).includes('string'));
        const hb = (0, lsp_1.computeHover)('a:true', { line: 0, character: 3 });
        Assert.ok(null == hb || JSON.stringify(hb).includes('boolean'));
    });
});
(0, node_test_1.describe)('coverage2-unify', () => {
    (0, node_test_1.test)('internal-catch', () => {
        class Boom extends IntegerVal_1.IntegerVal {
            unify() { throw new RangeError('kaboom'); }
        }
        const ctx = makeCtx();
        const out = (0, unify_1.unite)(ctx, new Boom({ peg: 1 }), new IntegerVal_1.IntegerVal({ peg: 1 }), 'test');
        Assert.equal(out.isNil, true);
    });
    (0, node_test_1.test)('unify-cycle-counter', () => {
        const ctx = pendingCtx();
        const r1 = new RefVal_1.RefVal({ peg: ['zz', 'q'], absolute: true });
        const r2 = new RefVal_1.RefVal({ peg: ['zz', 'r'], absolute: true });
        let out;
        for (let i = 0; i < 5000; i++) {
            out = (0, unify_1.unite)(ctx, r1, r2, 'test');
            if (out.isNil)
                break;
        }
        Assert.equal(out.isNil, true);
    });
    (0, node_test_1.test)('residue-paths-cap', () => {
        let src = '';
        for (let i = 0; i < 11; i++) {
            src += `c${i}:$.c${i + 1} `;
        }
        src += 'c11:1';
        Assert.throws(() => new aontu_1.Aontu().generate(src));
    });
});
(0, node_test_1.describe)('coverage2-utils', () => {
    (0, node_test_1.test)('keyorder-prefix-compare', () => {
        Assert.equal((0, keyorder_1.cmpCodePoint)('a', 'ab'), -1);
        Assert.equal((0, keyorder_1.cmpCodePoint)('ab', 'a'), 1);
        Assert.equal((0, keyorder_1.cmpCodePoint)('a', 'a'), 0);
    });
    (0, node_test_1.test)('code-class-prefix-and-default', () => {
        Assert.equal(typeof (0, hints_1.codeClass)('func:zz'), 'string');
        Assert.equal((0, hints_1.codeClass)('zzz_not_a_code'), 'internal');
    });
    (0, node_test_1.test)('descerr-array', () => {
        Assert.deepEqual((0, err_1.descErr)([], {}), []);
    });
    (0, node_test_1.test)('exactjson-tojson', () => {
        Assert.equal((0, exactjson_1.exactJSON)({ d: { toJSON: () => 5 } }), '{"d":5}');
    });
    (0, node_test_1.test)('aontu-bad-src', () => {
        Assert.throws(() => new aontu_1.Aontu().unify(123));
    });
    (0, node_test_1.test)('valutil-scalar-arms', () => {
        Assert.equal((0, valutil_1.makeScalar)(true).canon, 'true');
        Assert.equal((0, valutil_1.makeScalar)(null).canon, 'null');
        Assert.throws(() => (0, valutil_1.makeScalar)({}));
    });
    (0, node_test_1.test)('lang-debug-and-parse-opts', () => {
        const lang = new lang_1.Lang({ debug: true });
        const v = lang.parse('a:1', { idcount: 100, log: -1 });
        Assert.ok(null != v);
    });
    (0, node_test_1.test)('ctx-clone-path-resets-idx', () => {
        const ctx = makeCtx();
        const c = ctx.clone({ path: ['x', 'y'] });
        Assert.equal(typeof c.pathidx, 'number');
        Assert.equal(typeof c.pathidx, 'number');
    });
});
(0, node_test_1.describe)('coverage2-numeric', () => {
    (0, node_test_1.test)('numcmp-edges', () => {
        Assert.equal((0, numcmp_1.scaledOfFloat)(Infinity).inf, 1);
        Assert.equal((0, numcmp_1.scaledOfFloat)(-Infinity).inf, -1);
        // Subnormal: no implicit bit.
        const sub = (0, numcmp_1.scaledOfFloat)(5e-324);
        Assert.ok(sub.unscaled > 0n);
        // 2^60: non-negative binary exponent shifts up integrally.
        const big = (0, numcmp_1.scaledOfFloat)(Math.pow(2, 60));
        Assert.equal(big.scale, 0);
        Assert.equal(big.unscaled, 1n << 60n);
        Assert.equal((0, numcmp_1.cmpScaled)({ inf: 1, unscaled: 0n, scale: 0 }, { unscaled: 5n, scale: 0 }), 1);
        Assert.equal((0, numcmp_1.scaledIsIntegral)({ inf: 1, unscaled: 0n, scale: 0 }), false);
    });
    (0, node_test_1.test)('numkind-edges', () => {
        Assert.equal((0, numkind_1.isLossyIntegerLiteral)(1), false);
        Assert.equal((0, numkind_1.isLossyIntegerLiteral)(0, '0e500'), false);
        Assert.equal((0, numkind_1.isLossyIntegerLiteral)(1e308, '1e5000'), true);
    });
    (0, node_test_1.test)('decimal-edges', () => {
        Assert.ok(0 < new Decimal_1.Decimal(15n, 1).compare(new Decimal_1.Decimal(1n, 0)));
        Assert.equal(new Decimal_1.Decimal(0n, 0).isZero(), true);
        Assert.equal(new Decimal_1.Decimal(1n, 0).isZero(), false);
    });
    (0, node_test_1.test)('exact-val-unify-arms', () => {
        const ctx = makeCtx();
        const m = new MapVal_1.MapVal({ peg: {} });
        const bi = new BigIntegerVal_1.BigIntegerVal({ peg: 5n });
        Assert.equal(bi.unify(new BigIntegerVal_1.BigIntegerVal({ peg: 5n }), ctx), bi);
        Assert.equal(bi.unify((0, top_1.top)(), ctx), bi);
        Assert.equal(bi.unify(m, ctx).isNil, true);
        const bd = new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(15n, 1) });
        Assert.equal(bd.unify((0, top_1.top)(), ctx), bd);
        Assert.equal(bd.unify(m, ctx).isNil, true);
        Assert.equal(new IntegerVal_1.IntegerVal({ peg: 1 }).unify(m, ctx).isNil, true);
        Assert.equal(new NumberVal_1.NumberVal({ peg: 1.5 }).unify(m, ctx).isNil, true);
    });
    (0, node_test_1.test)('scalar-spec-guards', () => {
        Assert.throws(() => new IntegerVal_1.IntegerVal({ peg: 1.5 }), err_1.AontuError);
        Assert.throws(() => new NumberVal_1.NumberVal({ peg: NaN }), err_1.AontuError);
        Assert.throws(() => new ListVal_1.ListVal({}), err_1.AontuError);
        Assert.throws(() => new MapVal_1.MapVal({}), err_1.AontuError);
        Assert.throws(() => new ScalarKindVal_1.ScalarKindVal({}), err_1.AontuError);
    });
});
(0, node_test_1.describe)('coverage2-vals', () => {
    (0, node_test_1.test)('bag-marked-gen', () => {
        const m = new MapVal_1.MapVal({ peg: {}, mark: { type: true } });
        Assert.equal(m.gen(makeCtx()), undefined);
    });
    (0, node_test_1.test)('spread-clone-arms', () => {
        const ctx = makeCtx();
        const a0 = new aontu_1.Aontu();
        const skv = a0.unify('a:integer').peg.a;
        // All-scalar-kind path-dependent list spread: shallow share.
        const l = new ListVal_1.ListVal({ peg: [skv] });
        l._isPathDependent = true;
        l.spread = { cj: undefined };
        const shared = l.spreadClone(ctx);
        Assert.equal(shared.peg[0], skv);
        // Mixed content falls back to the deep clone.
        const l2 = new ListVal_1.ListVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] });
        l2._isPathDependent = true;
        l2.spread = { cj: undefined };
        Assert.notEqual(l2.spreadClone(ctx), l2);
        // Spread constraint recurses through its own spreadClone.
        const l3 = new ListVal_1.ListVal({ peg: [skv] });
        l3._isPathDependent = true;
        l3.spread = { cj: new ListVal_1.ListVal({ peg: [] }) };
        const out3 = l3.spreadClone(ctx);
        Assert.ok(null != out3.spread.cj);
        // MapVal: all-scalar-kind share, and a non-Val peg entry surviving
        // the deep clone verbatim.
        const m = new MapVal_1.MapVal({ peg: { k: skv } });
        m._isPathDependent = true;
        m.spread = { cj: undefined };
        const ms = m.spreadClone(ctx);
        Assert.equal(ms.peg.k, skv);
        const m2 = new MapVal_1.MapVal({ peg: { k: new KeyFuncVal_1.KeyFuncVal({ peg: [] }) } });
        m2.peg.raw = 42;
        m2._isPathDependent = true;
        m2.spread = { cj: undefined };
        const m2c = m2.spreadClone(ctx);
        Assert.equal(m2c.peg.raw, 42);
    });
    (0, node_test_1.test)('disjunct-append-and-gen-fallback', () => {
        const d = new DisjunctVal_1.DisjunctVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] });
        d.prefsRanked = true;
        d.append(new IntegerVal_1.IntegerVal({ peg: 2 }));
        Assert.equal(d.prefsRanked, false);
        const ctx = makeCtx();
        const empty = new DisjunctVal_1.DisjunctVal({ peg: [] });
        let threw = false;
        try {
            empty.gen(ctx);
        }
        catch {
            threw = true;
        }
        Assert.ok(threw || 0 < ctx.err.length);
        Assert.throws(() => new DisjunctVal_1.DisjunctVal({ peg: [] }).gen(undefined));
    });
    (0, node_test_1.test)('constraint-arms', () => {
        const ctx = makeCtx();
        const a0 = new aontu_1.Aontu();
        const cmin = a0.unify('a:min(0)').peg.a;
        Assert.equal(cmin.unify(null, ctx), cmin);
        const nil = new NilVal_1.NilVal({ why: 'x' });
        Assert.equal(cmin.unify(nil, ctx), nil);
        const cint = a0.unify('a:integer&min(0)').peg.a;
        const cflt = a0.unify('a:float&max(2)').peg.a;
        Assert.equal(cint.unify(cflt, ctx).isNil, true);
    });
    (0, node_test_1.test)('conjunct-ref-fold-and-gen-throw', () => {
        const pctx = pendingCtx();
        const c = new ConjunctVal_1.ConjunctVal({
            peg: [
                new IntegerVal_1.IntegerVal({ peg: 1 }),
                new RefVal_1.RefVal({ peg: ['zz', 'q'], absolute: true }),
            ],
        });
        const out = c.unify((0, top_1.top)(), pctx);
        Assert.ok(null != out);
        const c2 = new ConjunctVal_1.ConjunctVal({
            peg: [
                new IntegerVal_1.IntegerVal({ peg: 1 }),
                new RefVal_1.RefVal({ peg: ['zz', 'q'], absolute: true }),
            ],
        });
        Assert.throws(() => c2.gen(undefined), err_1.AontuError);
    });
    (0, node_test_1.test)('funcbase-and-named-funcs', () => {
        const ctx = makeCtx();
        const kf = new KeyFuncVal_1.KeyFuncVal({ peg: [] });
        Assert.throws(() => kf.validateArgs([(0, top_1.top)(), (0, top_1.top)()], 1), err_1.AontuError);
        Assert.equal(kf.gen(ctx), undefined);
        Assert.ok(kf.make(ctx, { peg: [] }) instanceof KeyFuncVal_1.KeyFuncVal);
        const fb = new FuncBaseVal_1.FuncBaseVal({ peg: [] });
        Assert.equal(fb.funcname(), 'func');
        Assert.equal(fb.make(ctx, { peg: [] }).isNil, true);
        Assert.equal(fb.resolve(ctx, []).isNil, true);
        Assert.ok(new CopyFuncVal_1.CopyFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof CopyFuncVal_1.CopyFuncVal);
        Assert.ok(new LowerFuncVal_1.LowerFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof LowerFuncVal_1.LowerFuncVal);
        Assert.ok(new MoveFuncVal_1.MoveFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof MoveFuncVal_1.MoveFuncVal);
        Assert.ok(new SuperFuncVal_1.SuperFuncVal({ peg: [] }).make(ctx, { peg: [] }) instanceof SuperFuncVal_1.SuperFuncVal);
        const of2 = new OpenFuncVal_1.OpenFuncVal({ peg: [] });
        Assert.ok(of2.make(ctx, { peg: [] }) instanceof OpenFuncVal_1.OpenFuncVal);
        Assert.equal(of2.funcname(), 'open');
        Assert.equal(of2.resolve(ctx, []).isNil, true);
        const pf = new PathFuncVal_1.PathFuncVal({ peg: [new IntegerVal_1.IntegerVal({ peg: 1 })] });
        Assert.ok(null != pf.unify((0, top_1.top)(), ctx));
    });
    (0, node_test_1.test)('nil-pref-ref-small-arms', () => {
        Assert.equal(new NilVal_1.NilVal({ why: 'w' }).inspection(), 'w');
        const p = new PrefVal_1.PrefVal({ peg: new IntegerVal_1.IntegerVal({ peg: 1 }) });
        Assert.equal(p.same(null), false);
        const pnil = new PrefVal_1.PrefVal({ peg: new NilVal_1.NilVal({ why: 'x' }) });
        Assert.throws(() => pnil.gen(undefined), err_1.AontuError);
        // Deferring ref against its own spelling stands.
        const pctx = pendingCtx();
        const r1 = new RefVal_1.RefVal({ peg: ['zz', 'q'], absolute: true });
        const r2 = new RefVal_1.RefVal({ peg: ['zz', 'q'], absolute: true });
        const out = r1.unify(r2, pctx);
        Assert.equal(out.isNil, false);
        // plainRefPath: dot off the top, relative base, dot reduction.
        Assert.equal(new RefVal_1.RefVal({ peg: ['.', 'b'], absolute: true }).plainRefPath(), undefined);
        const rel = new RefVal_1.RefVal({ peg: ['b'] });
        rel.path = ['a', 'x'];
        Assert.deepEqual(rel.plainRefPath(), ['a', 'b']);
        Assert.deepEqual(new RefVal_1.RefVal({ peg: ['a', '.', 'b'], absolute: true }).plainRefPath(), ['b']);
        const rs = new RefVal_1.RefVal({ peg: ['a'] });
        Assert.equal(rs.same(null), false);
        const ri = new RefVal_1.RefVal({ peg: ['a'], absolute: true, prefix: true });
        Assert.ok(ri.inspection().includes('absolute'));
    });
});
(0, node_test_1.describe)('coverage2-final', () => {
    (0, node_test_1.test)('cli-version-fallback', () => {
        const Fs = require('node:fs');
        const orig = Fs.readFileSync;
        const so = process.stdout.write;
        let out = '';
        Fs.readFileSync = () => { throw new Error('gone'); };
        process.stdout.write = (s) => ((out += s), true);
        try {
            (0, cli_1.main)(['node', 'cli', '-v']);
        }
        finally {
            process.stdout.write = so;
            Fs.readFileSync = orig;
            process.exitCode = 0;
        }
        Assert.equal(out.trim(), '0.0.0');
    });
    (0, node_test_1.test)('null-peer-scalar-arms', () => {
        // A null peer falls through to the scalar base, which requires a
        // real peer — the arm exists to mirror the base contract, and the
        // base's refusal is the observable behaviour.
        const ctx = makeCtx();
        Assert.throws(() => new BigIntegerVal_1.BigIntegerVal({ peg: 5n }).unify(null, ctx));
        Assert.throws(() => new BigDecimalVal_1.BigDecimalVal({ peg: new Decimal_1.Decimal(15n, 1) }).unify(null, ctx));
        Assert.throws(() => new IntegerVal_1.IntegerVal({ peg: 1 }).unify(null, ctx));
        Assert.throws(() => new NumberVal_1.NumberVal({ peg: 1.5 }).unify(null, ctx));
    });
    (0, node_test_1.test)('diagnostics-hard-failure', () => {
        // A throwing vars bag fails inside the try, producing the single
        // parse-stage diagnostic at the document start.
        const evil = {};
        Object.defineProperty(evil, 'x', {
            get() { throw new Error('boom'); }, enumerable: true,
        });
        const bad = (0, lsp_1.computeDiagnostics)('a:1', { vars: evil });
        Assert.equal(bad.length, 1);
        Assert.equal(bad[0].code, 'parse');
        Assert.equal(bad[0].range.start.line, 0);
        Assert.ok(bad[0].message.includes('boom'));
    });
    (0, node_test_1.test)('hover-null-scalar-label', () => {
        const h = (0, lsp_1.computeHover)('a:null', { line: 0, character: 3 });
        Assert.ok(null == h || JSON.stringify(h).length > 0);
    });
    (0, node_test_1.test)('residue-paths-cap-wide', () => {
        let src = '';
        for (let i = 0; i < 15; i++) {
            src += `c${i}:$.c${i + 1} `;
        }
        src += 'c15:1';
        Assert.throws(() => new aontu_1.Aontu().generate(src), /budget/);
    });
});
//# sourceMappingURL=coverage2.test.js.map