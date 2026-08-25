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
// The trust profile (G5 phase 3, docs/trust.md): the include capability
// ('none' | { mem } | { root } | 'system'), the deterministic budgets,
// the include manifest, the CLI flags and warning window, and the LSP's
// workspace confinement. The shared contract rows are
// test/spec/include-trust.tsv (both runners, root-confined to the
// fixtures directory); what is per-port — the API shapes, the CLI, the
// LSP wiring — is here, with go/trust_test.go as the twin.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const lsp_1 = require("../dist/lsp");
const cli_1 = require("../dist/cli");
const srcpath_1 = require("./srcpath");
// The uri a real editor sends for a directory: `file://`, then the
// ABSOLUTE PATH with its own leading slash. On Windows that makes three
// slashes before the drive letter (file:///C:/Users/me/project), which
// is the shape uriToPath has to undo. These tests used to build
// `'file://' + path` — two slashes — which is not what any client sends
// and which quietly hid the drive-letter defect. Twin: fileURI in
// go/lsp/lsp_test.go.
const fileURI = (p) => {
    const s = (0, srcpath_1.srcPath)(p);
    return 'file://' + (s.startsWith('/') ? s : '/' + s);
};
// A little world to confine: root/{in.aon, nest.aon, sub/deep.aon},
// with secret.aon OUTSIDE the root and a symlink inside pointing at it.
//
// THE SYMLINK IS BEST-EFFORT. Windows refuses one without Developer
// Mode or elevation, and libuv asks for it exactly as Go does -- same
// CreateSymbolicLinkW, same unprivileged-create retry, same privilege
// required. Unguarded, that EPERM threw out of the shared fixture and
// took every test in this file with it, for a reason that is not about
// Aontu. Only symlinkEscape needs the link; the rest of the world is
// built either way. Twin: trustWorld/trustSymlink in go/trust_test.go.
function world() {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trust-'));
    const root = Path.join(dir, 'root');
    Fs.mkdirSync(Path.join(root, 'sub'), { recursive: true });
    Fs.writeFileSync(Path.join(root, 'in.aon'), 'f: 11');
    Fs.writeFileSync(Path.join(root, 'nest.aon'), '@"in.aon"\ng: 22');
    Fs.writeFileSync(Path.join(root, 'sub', 'deep.aon'), 'h: 33');
    Fs.writeFileSync(Path.join(dir, 'secret.aon'), 'secret: "outside"');
    try {
        Fs.symlinkSync(Path.join(dir, 'secret.aon'), Path.join(root, 'link.aon'));
    }
    catch {
        // Reported by symlinkEscape, as a skip on the one test that needs it.
    }
    return { dir, root };
}
// symlinkEscape reports whether world() got its symlink, so the test
// that turns on one can skip rather than fail where the platform
// refuses to make it. The Go twin is trustSymlink.
const symlinkEscape = (root) => Fs.existsSync(Path.join(root, 'link.aon'));
function firstCode(fn) {
    try {
        fn();
        return undefined;
    }
    catch (e) {
        return 'function' === typeof e?.errs ? e.errs()[0]?.why : undefined;
    }
}
(0, node_test_1.describe)('trust-include', () => {
    (0, node_test_1.test)('none-denies-every-include', () => {
        const w = world();
        const a = new aontu_1.Aontu({ trust: { include: 'none' } });
        Assert.equal(firstCode(() => a.generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`)), 'include_denied');
    });
    (0, node_test_1.test)('mem-is-the-whole-world', () => {
        const a = new aontu_1.Aontu({
            trust: { include: { mem: { '/virtual/x.aon': 'm: 33' } } },
        });
        Assert.deepEqual(a.generate('a:@"/virtual/x.aon"'), { a: { m: 33 } });
        // A miss in the declared set is NOT-FOUND, not denial: the allowed
        // mechanism ran and missed.
        const b = new aontu_1.Aontu({
            trust: { include: { mem: { '/virtual/x.aon': 'm: 33' } } },
        });
        Assert.throws(() => b.generate('a:@"/nope.aon"'), /not found/);
    });
    (0, node_test_1.test)('root-confines-below-the-root', () => {
        const w = world();
        const opts = { trust: { include: { root: w.root } } };
        Assert.deepEqual(new aontu_1.Aontu(opts).generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/sub/deep.aon"`), { a: { h: 33 } });
        Assert.equal(firstCode(() => new aontu_1.Aontu(opts).generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/../secret.aon"`)), 'include_denied');
    });
    // Confinement is realpath-then-prefix-check: a symlink INSIDE the
    // root pointing outside it is an escape, not a loophole.
    (0, node_test_1.test)('root-denies-a-symlink-escape', (t) => {
        const w = world();
        if (!symlinkEscape(w.root)) {
            return t.skip('symlink not available on this platform');
        }
        Assert.equal(firstCode(() => new aontu_1.Aontu({ trust: { include: { root: w.root } } })
            .generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/link.aon"`)), 'include_denied');
    });
    (0, node_test_1.test)('root-miss-is-not-found-not-denied', () => {
        const w = world();
        Assert.throws(() => new aontu_1.Aontu({ trust: { include: { root: w.root } } })
            .generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/nope.aon"`), /not found/);
    });
    // A root that does not exist still confines: realpath falls back to
    // the lexical form, and everything real is outside a nonexistent
    // directory.
    (0, node_test_1.test)('nonexistent-root-still-confines', () => {
        const w = world();
        Assert.equal(firstCode(() => new aontu_1.Aontu({
            trust: { include: { root: Path.join(w.dir, 'no-such-root') } },
        }).generate(`a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`)), 'include_denied');
    });
    // Package resolution is recorded in the manifest as its own
    // capability, and under the warning window a package hit warns as
    // 'pkg'. (@tabnas/jsonic/package.json resolves through the package
    // leg from the ts/ working directory the tests run in.)
    (0, node_test_1.test)('pkg-resolution-is-recorded-and-warned', () => {
        const warned = [];
        const a = new aontu_1.Aontu({
            trustWarn: (kind, path) => { warned.push(kind + ' ' + path); },
            trustWarnRoot: Os.tmpdir(),
        });
        const v = a.parse('a:@"@tabnas/jsonic/package.json"', undefined, a.ctx({}));
        Assert.equal(v.deps.length, 1);
        Assert.equal(v.deps[0].capability, 'pkg');
        Assert.match(v.deps[0].path, /@tabnas[/\\]jsonic[/\\]package\.json$/);
        Assert.equal(warned.length, 1);
        Assert.match(warned[0], /^pkg /);
    });
});
(0, node_test_1.describe)('trust-manifest', () => {
    // The include MANIFEST (docs/trust.md): the resolved closure as
    // sorted, deduplicated { path, capability } — hermeticity clause 1's
    // "file set" made observable.
    (0, node_test_1.test)('deps-lists-the-sorted-deduped-closure', () => {
        const w = world();
        const a = new aontu_1.Aontu({ trust: { include: { root: w.root } } });
        const ac = a.ctx({});
        const v = a.parse(`a:@"${(0, srcpath_1.srcPath)(w.root)}/nest.aon" b:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon" c:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`, undefined, ac);
        Assert.deepEqual(v.deps, [
            { path: Path.join(w.root, 'in.aon'), capability: 'file' },
            { path: Path.join(w.root, 'nest.aon'), capability: 'file' },
        ]);
    });
    (0, node_test_1.test)('deps-is-empty-without-includes', () => {
        const a = new aontu_1.Aontu();
        const v = a.parse('x: 1', undefined, a.ctx({}));
        Assert.deepEqual(v.deps, []);
    });
    (0, node_test_1.test)('deps-names-the-mem-capability', () => {
        const a = new aontu_1.Aontu({
            trust: { include: { mem: { '/v/x.aon': 'm: 1' } } },
        });
        const v = a.parse('a:@"/v/x.aon"', undefined, a.ctx({}));
        Assert.deepEqual(v.deps, [{ path: '/v/x.aon', capability: 'mem' }]);
    });
});
(0, node_test_1.describe)('trust-budget', () => {
    // The budgets are integer counts of engine events, deterministic by
    // construction; zero-config means the shared spec constants
    // (test/spec/budget.tsv). A chain needing more passes than the
    // budget exhausts LOUDLY — budget_passes, never silent truncation —
    // including at passes:1, where the still-refining snapshot must be
    // taken at the final pass's entry (there is no earlier pass).
    (0, node_test_1.test)('passes-budget-exhausts-loudly', () => {
        const chain = 'a1:$.a2 a2:$.a3 a3:$.a4 a4:1';
        Assert.equal(firstCode(() => new aontu_1.Aontu({ trust: { budget: { passes: 1 } } })
            .generate(chain)), 'budget_passes');
        // The same document under the default budget resolves.
        Assert.equal(new aontu_1.Aontu().generate(chain).a1, 1);
    });
    (0, node_test_1.test)('depth-budget-trips-unify-cycle', () => {
        Assert.equal(firstCode(() => new aontu_1.Aontu({ trust: { budget: { depth: 3 } } })
            .generate('a:{b:{c:{d:{e:1}}}}')), 'unify_cycle');
    });
});
(0, node_test_1.describe)('trust-lsp', () => {
    const init = (params) => {
        const h = new lsp_1.LspHandler();
        h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params });
        return h;
    };
    const diagsFor = (h, text) => {
        const outs = h.handle({
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: { textDocument: { uri: 'file:///d.aon', text } },
        });
        return outs[0].params.diagnostics;
    };
    (0, node_test_1.test)('workspace-root-confines-diagnostics', () => {
        const w = world();
        const h = init({ rootUri: fileURI(w.root) });
        // Two diagnostics, matching the syntax-failure precedent: the
        // outer parse nil and the inner denial carrying the code.
        const diags = diagsFor(h, `a:@"${(0, srcpath_1.srcPath)(w.root)}/../secret.aon"`);
        Assert.ok(diags.some((d) => 'include_denied' === d.code), JSON.stringify(diags));
        // In-root includes still resolve under the same session.
        Assert.deepEqual(diagsFor(h, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`), []);
    });
    (0, node_test_1.test)('workspace-folders-outrank-root-uri', () => {
        const w = world();
        const h = init({
            rootUri: 'file:///nowhere',
            workspaceFolders: [{ uri: fileURI(w.root) }],
        });
        Assert.deepEqual(diagsFor(h, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`), []);
    });
    (0, node_test_1.test)('root-path-fallback-confines', () => {
        const w = world();
        const h = init({ rootPath: w.root });
        Assert.ok(diagsFor(h, `a:@"${(0, srcpath_1.srcPath)(w.root)}/../secret.aon"`)
            .some((d) => 'include_denied' === d.code));
    });
    (0, node_test_1.test)('explicit-initialization-option-wins', () => {
        const w = world();
        // 'system' widens even when a workspace root exists.
        const wide = init({
            rootUri: fileURI(w.root),
            initializationOptions: { aontu: { trust: { include: 'system' } } },
        });
        Assert.deepEqual(diagsFor(wide, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`), []);
        // 'none' narrows to nothing.
        const none = init({
            initializationOptions: { aontu: { trust: { include: 'none' } } },
        });
        Assert.ok(diagsFor(none, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`)
            .some((d) => 'include_denied' === d.code));
        // { root } names its own directory.
        const rooted = init({
            initializationOptions: {
                aontu: { trust: { include: { root: w.root } } },
            },
        });
        Assert.deepEqual(diagsFor(rooted, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`), []);
        // { mem } is honoured too.
        const mem = init({
            initializationOptions: {
                aontu: { trust: { include: { mem: { '/v/x.aon': 'm: 1' } } } },
            },
        });
        Assert.deepEqual(diagsFor(mem, 'a:@"/v/x.aon"'), []);
        // An unrecognised explicit value confines to NOTHING rather than
        // silently widening.
        const unknown = init({
            initializationOptions: { aontu: { trust: { include: { bogus: 1 } } } },
        });
        Assert.ok(diagsFor(unknown, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`)
            .some((d) => 'include_denied' === d.code));
    });
    (0, node_test_1.test)('no-root-no-option-stays-unconfined', () => {
        const w = world();
        const h = init({});
        Assert.deepEqual(diagsFor(h, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`), []);
    });
    (0, node_test_1.test)('compute-diagnostics-takes-a-trust-argument', () => {
        const w = world();
        Assert.ok((0, lsp_1.computeDiagnostics)(`a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`, { trust: { include: 'none' } })
            .some((d) => 'include_denied' === d.code));
    });
});
(0, node_test_1.describe)('trust-cli', () => {
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
        }
        const code = process.exitCode ?? 0;
        process.exitCode = 0;
        return { out, err, code };
    }
    const cli = (args) => capture(() => (0, cli_1.main)(['node', 'cli', ...args]));
    (0, node_test_1.test)('trust-none-denies', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, 'a:@"in.aon"');
        const r = cli(['--trust', 'none', entry]);
        Assert.equal(r.code, 1);
        Assert.match(r.err, /include denied/);
    });
    (0, node_test_1.test)('include-root-confines', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        const r = cli(['--include-root', w.root, entry]);
        Assert.equal(r.code, 1);
        Assert.match(r.err, /include denied/);
        // The same escape under explicit system resolves, silently.
        const ok = cli(['--trust', 'system', entry]);
        Assert.equal(ok.code, 0);
        Assert.equal(ok.err, '');
    });
    (0, node_test_1.test)('trust-root-defaults-to-the-entry-directory', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, 'a:@"in.aon"');
        const r = cli(['--trust', 'root', entry]);
        Assert.equal(r.code, 0);
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        Assert.equal(cli(['--trust', 'root', entry]).code, 1);
        Assert.equal(cli(['--trust', `root:${w.dir}`, entry]).code, 0);
    });
    // The warning window of the staged default flip: the default posture
    // still resolves, but every escape names the flag a future release
    // will require — once per resolution, however many times it repeats.
    (0, node_test_1.test)('default-warns-on-escape', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon" b:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon" c:@"in.aon"`);
        const r = cli([entry]);
        Assert.equal(r.code, 0);
        Assert.equal((r.err.match(/warning: include resolved outside the entry root/g) ?? [])
            .length, 1);
        Assert.match(r.err, /--trust system/);
    });
    // A package hit under the default posture warns as 'through package
    // resolution' — the other arm of the warning text.
    (0, node_test_1.test)('default-warns-on-pkg-resolution', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, 'a:@"@tabnas/jsonic/package.json"');
        const cwd = process.cwd();
        try {
            // The package leg resolves from the working directory; the test
            // process runs in ts/, where @tabnas/jsonic is installed.
            const r = cli([entry]);
            Assert.match(r.err, /warning: include resolved through package resolution/);
        }
        finally {
            process.chdir(cwd);
        }
    });
    (0, node_test_1.test)('trust-usage-errors-exit-2', () => {
        for (const args of [
            ['--trust'],
            ['--trust', 'everything'],
            ['--trust', 'root:'],
            ['--include-root'],
        ]) {
            Assert.equal(cli(args).code, 2, args.join(' '));
        }
    });
});
//# sourceMappingURL=trust.test.js.map