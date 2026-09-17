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
const node_child_process_1 = require("node:child_process");
const aontu_1 = require("../dist/aontu");
const lsp_1 = require("../dist/lsp");
const cli_1 = require("../dist/cli");
const srcpath_1 = require("./srcpath");
const fileURI = (p) => {
    const s = (0, srcpath_1.srcPath)(p);
    return 'file://' + (s.startsWith('/') ? s : '/' + s);
};
function world() {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trust-'));
    const root = Path.join(dir, 'root');
    Fs.mkdirSync(Path.join(root, 'sub'), { recursive: true });
    Fs.writeFileSync(Path.join(root, 'in.aon'), 'f: 11');
    Fs.writeFileSync(Path.join(root, 'nest.aon'), '@"./in.aon"\ng: 22');
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
    (0, node_test_1.test)('a-bundled-model-is-not-shadowed-by-mem', () => {
        const a = new aontu_1.Aontu({
            trust: { include: { mem: { 'aontu:system': 'system: {HIJACKED: 1}' } } },
        });
        const out = a.generate('@"aontu:system"\np: $.aontu.System.Port & {}');
        Assert.deepEqual(out, { p: { direction: 'in' }, aontu: { System: {} } });
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
    // An EMPTY root is not a root: resolving it would confine the caller
    // below the process directory, which nothing named.
    (0, node_test_1.test)('an-empty-root-denies-every-include', () => {
        const w = world();
        const src = `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`;
        Assert.deepEqual(new aontu_1.Aontu({ trust: { include: { root: w.root } } }).generate(src), { a: { f: 11 } });
        Assert.equal(firstCode(() => new aontu_1.Aontu({ trust: { include: { root: '' } } }).generate(src)), 'include_denied');
        Assert.throws(() => new aontu_1.Aontu({ trust: { include: { root: '' } } }).generate(src), /capability: none/);
    });
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
    (0, node_test_1.test)('workspace-root-confines-hover', () => {
        const w = world();
        const hovers = (h, text) => {
            h.handle({
                jsonrpc: '2.0',
                method: 'textDocument/didOpen',
                params: { textDocument: { uri: 'file:///d.aon', text } },
            });
            let all = '';
            for (let c = 0; c < text.length; c++) {
                const outs = h.handle({
                    jsonrpc: '2.0', id: 2, method: 'textDocument/hover',
                    params: {
                        textDocument: { uri: 'file:///d.aon' },
                        position: { line: 0, character: c },
                    },
                });
                all += JSON.stringify(outs[0].result ?? null);
            }
            return all;
        };
        const confined = init({ rootUri: fileURI(w.root) });
        // In-root: the include resolves, so the value is hoverable.
        Assert.match(hovers(confined, `a:@"${(0, srcpath_1.srcPath)(w.root)}/in.aon"`), /11/);
        // Out-of-root: nowhere on the line does the outside value appear.
        Assert.doesNotMatch(hovers(confined, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`), /outside/);
        // The unconfined session is the control: it DOES resolve the same
        // escape, which is what makes the assertion above about the
        // capability rather than about hover failing everywhere.
        Assert.match(hovers(init({}), `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`), /outside/);
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
    const CLI_BIN = Path.join(__dirname, '..', 'bin', 'aontu.js');
    // Out of process: a server verb would exit the suite.
    function shell(args, cwd) {
        try {
            const out = (0, node_child_process_1.execFileSync)(process.execPath, [CLI_BIN, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd });
            return { out, err: '', code: 0 };
        }
        catch (e) {
            return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status ?? 1 };
        }
    }
    // Read from the source, so an unclassified new verb fails below.
    function knownVerbs() {
        const src = Fs.readFileSync(Path.join(__dirname, '..', 'src', 'cli.ts'), 'utf8');
        const list = src.match(/const KNOWN_VERBS = \[([^\]]*)\]/);
        Assert.ok(null != list, 'no KNOWN_VERBS in cli.ts');
        const verbs = Array.from(list[1].matchAll(/'([a-z]+)'/g), (m) => m[1]);
        Assert.ok(20 < verbs.length, 'no verbs read from the CLI');
        return verbs;
    }
    const SUBCOMMAND_FIRST = { model: ['get'] };
    let refusers;
    function refusingVerbs(verbs) {
        refusers ??= verbs.filter((verb) => !shell([verb, ...(SUBCOMMAND_FIRST[verb] ?? []), '--trust', 'bogus'])
            .err.includes('--trust needs'));
        return refusers;
    }
    // Verbs that take the flags and whose answer neither can change:
    // `why` and `remove` evaluate no document, and `add`, `get` and
    // `publish` refuse before a module is read. Measured, not assumed.
    const NOTHING_TO_CONFINE = ['add', 'get', 'publish', 'remove', 'why'];
    function partition(verbs, exercised) {
        Assert.deepStrictEqual([...refusingVerbs(verbs), ...NOTHING_TO_CONFINE, ...exercised].sort(), [...verbs].sort(), 'every verb is a refuser, has nothing to confine, or is exercised');
    }
    // The help's exception clause, held to the parser: a verb that takes
    // the flag reports the bad VALUE, and `lsp` refuses without naming
    // the option, which is how a name-keyed probe scored it as taking.
    // Each verb runs in its own process: a server verb would exit this.
    (0, node_test_1.test)('the-help-names-every-verb-that-refuses-the-capability', () => {
        const verbs = knownVerbs();
        const src = Fs.readFileSync(Path.join(__dirname, '..', 'src', 'cli.ts'), 'utf8');
        const entry = (src.split('  --trust <t>     ')[1] ?? '')
            .split('\n  --include-root')[0];
        Assert.ok(entry.includes('Every verb takes it'), 'the --trust entry moved: the gate reads it by that clause');
        const named = verbs.filter((verb) => new RegExp('\\b' + verb + '\\b').test(entry));
        Assert.deepStrictEqual(named.sort(), refusingVerbs(verbs).sort(), 'the --trust entry must name exactly the verbs that refuse it');
    });
    // An empty argument names no directory, as `--trust root:` does not.
    (0, node_test_1.test)('include-root-refuses-an-empty-directory', () => {
        const bare = cli(['--include-root', '', 'x.aon']);
        Assert.equal(bare.code, 2);
        Assert.match(bare.err, /--include-root needs a directory/);
        let code = 0;
        const verb = capture(() => {
            code = (0, cli_1.runVet)(['--include-root', '', 'a.aon', 'b.aon']);
        });
        Assert.equal(code, 2);
        Assert.match(verb.err, /--include-root needs a directory/);
    });
    // The flags ride anywhere in a tail, model's subcommand included.
    (0, node_test_1.test)('model-takes-the-capability-before-its-subcommand', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        const before = cli(['model', '--trust', 'none', 'get', '$.a', entry]);
        const after = cli(['model', 'get', '--trust', 'none', '$.a', entry]);
        Assert.equal(before.code, after.code);
        Assert.equal(before.err, after.err);
        Assert.match(before.err, /include_denied/);
        // A flag's VALUE is not the subcommand: `get` is the extension list.
        const list = cli(['model', '--text-ext', 'get', '$.a', entry]);
        Assert.equal(list.code, 2);
        Assert.match(list.err, /model needs get, why or set/);
    });
    (0, node_test_1.test)('trust-none-denies', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, 'a:@"./in.aon"');
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
        Fs.writeFileSync(entry, 'a:@"./in.aon"');
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
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon" b:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon" c:@"./in.aon"`);
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
    (0, node_test_1.test)('every-verb-honours-the-capability', () => {
        const w = world();
        const entry = Path.join(w.root, 'leak.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        const data = Path.join(w.root, 'data.json');
        Fs.writeFileSync(data, '{}');
        const overlay = Path.join(w.root, 'overlay.aon');
        Fs.writeFileSync(overlay, '');
        const seen = new Set();
        const denied = (args) => {
            seen.add(args[0]);
            const open = cli(args);
            const verb = 'model' === args[0] ? 2 : 1;
            const shut = cli([...args.slice(0, verb), '--trust', 'none', ...args.slice(verb)]);
            Assert.notEqual(JSON.stringify([open.code, open.out, open.err]), JSON.stringify([shut.code, shut.out, shut.err]), 'the verb ignored --trust: ' + args.join(' '));
            if (!/verdict: error/.test(shut.out + shut.err)) {
                Assert.match(shut.out + shut.err, /include denied|include_denied/);
            }
        };
        denied(['vet', entry, data]);
        denied(['model', 'get', '$.a.secret', entry]);
        denied(['model', 'why', '$.a.secret', entry]);
        denied(['subsume', entry, entry]);
        denied(['breaking', '--against', entry, entry]);
        denied(['relations', entry]);
        denied(['trim', '--check', entry]);
        denied(['reaches', '$.a', '$.a', entry]);
        denied(['jsonschema', entry]);
        denied(['view', 'tree', entry]);
        denied(['view', 'doc', entry]);
        denied(['hash', entry]);
        denied(['agentsmd', entry]);
        denied(['model', 'set', '$.z=1', '--entry', entry, '--overlay', overlay]);
        // Out of process: `render` answers on a promise, and a capture
        // reading `process.exitCode` early would pass wrongly.
        const deniedOut = (args) => {
            seen.add(args[0]);
            const open = shell(args);
            const shut = shell([...args, '--trust', 'none']);
            Assert.notEqual(JSON.stringify([open.code, open.out, open.err]), JSON.stringify([shut.code, shut.out, shut.err]), 'the verb ignored --trust: ' + args.join(' '));
            if (!/verdict: error/.test(shut.out + shut.err)) {
                Assert.match(shut.out + shut.err, /include denied|include_denied/);
            }
        };
        const gen = Path.join(w.root, 'gen.aon');
        Fs.writeFileSync(gen, `@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"\n` +
            'out: file({ name: "o.txt" }, ["x"])\n');
        // `fmt` and `template` evaluate the profile, not what they rewrite.
        const profile = Path.join(w.root, 'prof.aon');
        Fs.writeFileSync(profile, `@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"\naontu: { Lang: {} }\n`);
        const generator = Path.join(w.root, 'gen.ts');
        Fs.writeFileSync(generator, '//- x: 1\nhello\n');
        deniedOut(['trace', entry]);
        deniedOut(['render', gen, Path.join(w.dir, 'out')]);
        deniedOut(['allow', '--role', 'dev', entry, '$.a']);
        deniedOut(['fmt', entry, '--profile', profile]);
        deniedOut(['template', generator, '--profile', profile]);
        // A MODULE's document, not the manifest: an include in `pkg.aon`
        // is not resolved. A fresh project each run: these write a lockfile.
        const pkgProject = () => {
            const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-trust-pkg-'));
            const store = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service');
            Fs.mkdirSync(store, { recursive: true });
            Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\n' +
                'dep: {"corp.example/schemas/service": {v: "1.0.0"}}\n');
            Fs.writeFileSync(Path.join(store, 'pkg.aon'), 'pkg: {path: "corp.example/schemas/service", main: "service.aon"}\n');
            Fs.writeFileSync(Path.join(store, 'service.aon'), `@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"\nname: string\n`);
            return dir;
        };
        for (const args of [['sync'], ['pkg', 'tidy']]) {
            seen.add(args[0]);
            const open = shell([...args, pkgProject()]);
            const shut = shell([...args, pkgProject(), '--trust', 'none']);
            Assert.match(open.out, /verdict: ok/, args.join(' '));
            Assert.match(shut.out, /verdict: error/, args.join(' '));
            Assert.match(shut.out, /does not evaluate on its own/, args.join(' '));
        }
        partition(knownVerbs(), seen);
    });
    (0, node_test_1.test)('every-verb-honours-the-text-extensions', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-textext-'));
        Fs.writeFileSync(Path.join(dir, 'doc.md'), '# hi\n');
        const entry = Path.join(dir, 'main.aon');
        Fs.writeFileSync(entry, 'doc: @"./doc.md"\n');
        const schema = Path.join(dir, 'schema.aon');
        Fs.writeFileSync(schema, 'doc: string\n');
        const overlay = Path.join(dir, 'overlay.aon');
        const REFUSED = /include_extension|include not readable/;
        const seen = new Set();
        const both = (args) => {
            seen.add(args[0]);
            const bare = cli(args);
            const wide = cli([...args, '--text-ext', 'md']);
            Assert.match(bare.out + bare.err, REFUSED, 'the verb read the include with no flag: ' + args.join(' '));
            Assert.doesNotMatch(wide.out + wide.err, REFUSED, 'the verb dropped --text-ext: ' + args.join(' '));
            return wide;
        };
        both(['vet', schema, entry]);
        both(['model', 'get', '$.doc', entry]);
        both(['model', 'why', '$.doc', entry]);
        both(['relations', entry]);
        both(['trim', '--check', entry]);
        both(['reaches', '$.doc', '$.doc', entry]);
        both(['jsonschema', entry]);
        both(['hash', entry]);
        both(['view', 'tree', entry]);
        both(['view', 'doc', entry]);
        both(['view', 'layer', entry]);
        both(['agentsmd', entry]);
        both(['model', 'set', '$.z=1', '--entry', entry, '--overlay', overlay]);
        for (const args of [
            ['subsume', schema, entry],
            ['breaking', '--against', entry, entry],
        ]) {
            seen.add(args[0]);
            Assert.match(cli(args).out, /verdict: error/, 'read the include with no flag: ' + args.join(' '));
            Assert.doesNotMatch(cli([...args, '--text-ext', 'md']).out, /verdict: error/, 'dropped --text-ext: ' + args.join(' '));
        }
        // THE STANZA'S SHAPE IS A SECOND EVALUATION and it takes the same
        // options: it listed the keys and then reported an empty shape,
        // because the read it came from refused the include the read above
        // it had honoured.
        Assert.match(cli(['agentsmd', entry, '--text-ext', 'md']).out, /- Shape: `\{"doc":string\}`/);
        // `set` WRITES, so a dropped flag here is not a wrong answer but a
        // wrong file -- or, as it was, no file where the other port wrote
        // one.
        Assert.equal(Fs.readFileSync(overlay, 'utf8'), '"z": 1\n');
        const wide = (args) => {
            seen.add(args[0]);
            const bare = shell(args);
            const flagged = shell([...args, '--text-ext', 'md']);
            Assert.match(bare.out + bare.err, REFUSED, 'the verb read the include with no flag: ' + args.join(' '));
            Assert.doesNotMatch(flagged.out + flagged.err, REFUSED, 'the verb dropped --text-ext: ' + args.join(' '));
        };
        const gen = Path.join(dir, 'gen.aon');
        Fs.writeFileSync(gen, 'doc: @"./doc.md"\nout: file({ name: "o.txt" }, ["x"])\n');
        const profile = Path.join(dir, 'prof.aon');
        Fs.writeFileSync(profile, 'doc: @"./doc.md"\naontu: { Lang: {} }\n');
        const generator = Path.join(dir, 'gen.ts');
        Fs.writeFileSync(generator, '//- x: 1\nhello\n');
        wide(['trace', entry]);
        wide(['render', gen, Path.join(dir, 'out')]);
        wide(['fmt', entry, '--profile', profile]);
        wide(['template', generator, '--profile', profile]);
        // `allow` answers a verdict rather than the refusal text.
        seen.add('allow');
        Assert.match(shell(['allow', '--role', 'dev', entry, '$.doc']).out, /verdict: error/);
        Assert.match(shell(['allow', '--role', 'dev', entry, '$.doc', '--text-ext', 'md']).out, /verdict: refused/);
        // The readable extension has to be one inside the closure.
        const pkgProject = () => {
            const at = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-textext-pkg-'));
            const store = Path.join(at, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service');
            Fs.mkdirSync(store, { recursive: true });
            Fs.writeFileSync(Path.join(at, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\n' +
                'dep: {"corp.example/schemas/service": {v: "1.0.0"}}\n');
            Fs.writeFileSync(Path.join(store, 'pkg.aon'), 'pkg: {path: "corp.example/schemas/service", main: "service.aon"}\n');
            Fs.writeFileSync(Path.join(store, 'doc.md'), '# hi\n');
            Fs.writeFileSync(Path.join(store, 'service.aon'), 'doc: @"./doc.md"\nname: string\n');
            return at;
        };
        for (const args of [['sync'], ['pkg', 'tidy']]) {
            seen.add(args[0]);
            Assert.match(shell([...args, pkgProject()]).out, /does not evaluate on its own/, args.join(' '));
            Assert.match(shell([...args, pkgProject(), '--text-ext', 'md']).out, /verdict: ok/, args.join(' '));
        }
        partition(knownVerbs(), seen);
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    // --include-root confines a verb to a directory, the CLI's own
    // root: spelling, and a bare `root` means the document's directory.
    (0, node_test_1.test)('verbs-take-include-root', () => {
        const w = world();
        const entry = Path.join(w.root, 'leak.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        const inside = Path.join(w.root, 'fine.aon');
        Fs.writeFileSync(inside, 'a:@"./in.aon"');
        const confined = cli(['model', 'get', '$.a.secret', '--include-root', w.root, entry]);
        Assert.match(confined.out + confined.err, /include denied/);
        Assert.equal(cli(['model', 'get', '$.a.f', '--include-root', w.root, inside]).code, 0);
        // A bare `root` confines to the document's own directory.
        Assert.equal(cli(['model', 'get', '$.a.f', '--trust', 'root', inside]).code, 0);
        const bare = cli(['model', 'get', '$.a.secret', '--trust', 'root', entry]);
        Assert.match(bare.out + bare.err, /include denied/);
        // A bad spelling is the usage class, from a verb as from the bare
        // command.
        Assert.equal(cli(['model', 'get', '$.a', '--trust', 'bogus', inside]).code, 2);
        Assert.equal(cli(['model', 'get', '$.a', inside, '--include-root']).code, 2);
    });
    // The REPL took --trust and DROPPED it: the --jsonl session mode,
    // built to be driven by a harness, evaluated unconfined however it
    // was invoked.
    (0, node_test_1.test)('repl-honours-the-capability', () => {
        const w = world();
        const entry = Path.join(w.root, 'leak.aon');
        Fs.writeFileSync(entry, `a:@"${(0, srcpath_1.srcPath)(w.dir)}/secret.aon"`);
        const read = (f) => Fs.readFileSync(f, 'utf8');
        const open = (0, cli_1.replCommand)({ mode: 'json', jsonl: true }, ':load ' + entry, read);
        Assert.match(open.out, /outside/);
        const shut = (0, cli_1.replCommand)({ mode: 'json', jsonl: true, trust: { kind: 'none', textExt: [] } }, ':load ' + entry, read);
        Assert.match(shut.out, /include denied/);
        Assert.doesNotMatch(shut.out, /outside/);
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
    (0, node_test_1.test)('every-verb-refuses-a-bad-spelling', () => {
        const w = world();
        const entry = Path.join(w.root, 'main.aon');
        Fs.writeFileSync(entry, 'a:@"./in.aon"');
        const data = Path.join(w.root, 'data.json');
        Fs.writeFileSync(data, '{}');
        const overlay = Path.join(w.root, 'overlay.aon');
        Fs.writeFileSync(overlay, '');
        // The runners are called DIRECTLY rather than through main: `vet`
        // finishes on a microtask (its --watch mode makes the runner
        // promise-returning), and a synchronous capture would read
        // process.exitCode before that lands. Each runner's own return is
        // the exit code, which is what this asserts.
        const bad = '--trust';
        const runs = [
            ['vet', () => (0, cli_1.runVet)([bad, 'everything', entry, data])],
            ['get', () => (0, cli_1.runGet)([bad, 'everything', '$.a.f', entry])],
            ['why', () => (0, cli_1.runWhy)([bad, 'everything', '$.a.f', entry])],
            ['subsume', () => (0, cli_1.runSubsume)([bad, 'everything', entry, entry])],
            ['breaking',
                () => (0, cli_1.runBreaking)([bad, 'everything', '--against', entry, entry])],
            ['relations', () => (0, cli_1.runRelations)([bad, 'everything', entry])],
            ['trim', () => (0, cli_1.runTrim)([bad, 'everything', '--check', entry])],
            ['hash', () => (0, cli_1.runHash)([bad, 'everything', entry])],
            ['agentsmd', () => (0, cli_1.runAgentsMd)([bad, 'everything', entry])],
            ['set', () => (0, cli_1.runSet)([bad, 'everything', '$.z=1', '--entry', entry, '--overlay', overlay])],
            ['pkg', () => (0, cli_1.runPkg)([bad, 'everything', 'tidy', w.root], {})],
        ];
        for (const [name, run] of runs) {
            const r = capture(() => Assert.equal(run(), 2, name));
            Assert.match(r.err, /--trust needs/, name);
        }
        // EVERY verb, from the CLI's own list: a flag-taker exits 2 and a
        // refuser does not. No arguments, since the flags are stripped
        // before a verb parses its tail.
        const verbs = knownVerbs();
        const refuses = refusingVerbs(verbs);
        for (const verb of verbs) {
            const r = shell([verb, ...(SUBCOMMAND_FIRST[verb] ?? []), bad]);
            if (refuses.includes(verb)) {
                Assert.doesNotMatch(r.err, /--trust needs/, verb);
                continue;
            }
            Assert.equal(r.code, 2, verb);
            Assert.match(r.err, /--trust needs/, verb);
        }
    });
    // A session state carrying source but NO file name is a shape the
    // exported handler's own type allows (a library caller evaluating
    // held text that came from somewhere other than `:load`), and its
    // bare `root` spelling has to root somewhere: the working directory,
    // as the bare command does for stdin.
    (0, node_test_1.test)('nameless-repl-state-roots-at-the-working-directory', () => {
        const held = { mode: 'json', jsonl: false, src: 'a: 1' };
        Assert.match((0, cli_1.replCommand)(held, ':get $.a', () => '').out, /1/);
        Assert.match((0, cli_1.replCommand)({ ...held, trust: { kind: 'root', textExt: [] } }, ':get $.a', () => '').out, /1/);
        Assert.match((0, cli_1.replCommand)({ ...held, trust: { kind: 'root', textExt: [] } }, ':why $.a', () => '').out, /1/);
    });
});
//# sourceMappingURL=trust.test.js.map