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
// MODULES (G6 phase 2, docs/capability-review/g6-distribution.md). The
// shared contract rows are test/spec/mod.tsv (both runners,
// root-confined to the fixtures directory, which is also why they never
// reach the user cache); what is per-port — the cache location, the
// host-injected filesystem, the verification depth bound — is here,
// with go/mod_test.go as the twin.
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const cli_1 = require("../dist/cli");
const mod_tool_1 = require("../dist/mod-tool");
const mod_1 = require("../dist/mod");
const srcpath_1 = require("./srcpath");
// The lockfile lives under aontu_meta/, which a test that writes one by
// hand has to create first, as `mod tidy` does.
function writeLock(dir, text) {
    Fs.mkdirSync(Path.join(dir, 'aontu_meta'), { recursive: true });
    Fs.writeFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), text);
}
const MODULE = 'name: string\nport: *8080 | integer\n';
// The canon-hash of `nil`, which is what EVERY module that fails to
// evaluate would pin if the lockfile were written from one -- the same
// string for all of them, so a pin that carries no information while
// looking exactly like one that does (use-cases/BUGS.md §31).
const NIL_PIN = 'aon1-XaOkx_EXlEJ1tMhinEkWQDYl1aSmVzoB7LA_Dp0u2-Y';
// A project whose main.aon imports one module, and the module itself,
// placed wherever the caller says. Answers the paths and the module's
// canon-hash — which is what a pin IS, so a test that wants to pin
// something has to compute it the same way `aontu hash` does.
function world(store) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'));
    const cache = Path.join(dir, 'cache');
    const hash = (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE));
    const moddir = 'vendor' === store
        ? Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service@1')
        : Path.join(cache, hash);
    Fs.mkdirSync(moddir, { recursive: true });
    Fs.writeFileSync(Path.join(moddir, 'mod.aon'), 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n');
    Fs.writeFileSync(Path.join(moddir, 'service.aon'), MODULE);
    Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: {path: "corp.example/app"}\n');
    const main = Path.join(dir, 'main.aon');
    Fs.writeFileSync(main, 'svc: @"corp.example/schemas/service@1#' + hash + '"\nsvc: name: "auth"\n');
    return { dir, main, hash, cache };
}
(0, node_test_1.describe)('mod', () => {
    // THE EMPTY-ELEMENT ARM, which no document can reach: MODULE_RE's
    // element class is `[A-Za-z0-9._-]+`, one character minimum, so a
    // routed path never carries an empty element and the shared rows
    // cannot drive this branch. The rule is still the right one to state
    // -- the next caller of validateModulePath may not come through the
    // regex -- so it is pinned here instead (ADR-002 rule 2b).
    (0, node_test_1.test)('an-empty-path-element-is-refused', () => {
        Assert.equal((0, mod_1.validateModulePath)('corp.example//x'), 'an element is empty');
        Assert.equal((0, mod_1.validateModulePath)(''), 'an element is empty');
        // And the rules the shared rows DO drive, asserted here as the
        // function contract rather than as engine behaviour.
        Assert.equal((0, mod_1.validateModulePath)('corp.example/x'), undefined);
        Assert.equal((0, mod_1.validateModulePath)('corp.example/../x'), 'an element begins or ends with "."');
        Assert.equal((0, mod_1.validateModulePath)('corp.example/nul'), 'an element is a reserved device name');
    });
    (0, node_test_1.test)('cache-is-content-addressed', () => {
        // No vendor copy at all: the module is in the user cache, under its
        // OWN HASH. That is what content-addressed means — a cache hit is
        // already the right meaning before anything is read from it, which
        // is also why the cache is consulted only when a pin is known.
        const w = world('cache');
        const a0 = new aontu_1.Aontu({ mod: { cache: w.cache } });
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
    });
    (0, node_test_1.test)('cache-is-not-consulted-under-a-root', () => {
        // A confined evaluation sees the project's own aontu_meta/vendor/ and
        // nothing else: the cache lives outside any root, so a rooted
        // profile that would have to reach it reports the module missing
        // instead. (docs/trust.md: confinement is about what may be READ.)
        const w = world('cache');
        const a0 = new aontu_1.Aontu({
            mod: { cache: w.cache },
            trust: { include: { root: w.dir } },
        });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module not fetched:'));
    });
    (0, node_test_1.test)('cache-defaults-to-the-platform-location', () => {
        // With no host-named cache the platform's own is used. Pointed at a
        // temporary directory through XDG_CACHE_HOME so the test never
        // reads the developer's real cache — the point is the LOOKUP, not
        // where a particular machine keeps it.
        const w = world('cache');
        const xdg = Path.join(w.dir, 'xdg');
        Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'));
        const saved = process.env.XDG_CACHE_HOME;
        process.env.XDG_CACHE_HOME = xdg;
        try {
            Assert.deepEqual(new aontu_1.Aontu().generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
        }
        finally {
            if (undefined === saved) {
                delete process.env.XDG_CACHE_HOME;
            }
            else {
                process.env.XDG_CACHE_HOME = saved;
            }
        }
    });
    (0, node_test_1.test)('cache-falls-back-to-the-home-directory', () => {
        // No XDG_CACHE_HOME: `~/.cache/aontu/mod` is the platform default
        // this falls back to, and HOME is pointed at a temporary directory
        // for the same reason XDG was above.
        const w = world('cache');
        const home = Path.join(w.dir, 'home');
        Fs.mkdirSync(Path.join(home, '.cache', 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(home, '.cache', 'aontu', 'mod'));
        const savedXdg = process.env.XDG_CACHE_HOME;
        const savedHome = process.env.HOME;
        delete process.env.XDG_CACHE_HOME;
        process.env.HOME = home;
        try {
            Assert.deepEqual(new aontu_1.Aontu().generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
        }
        finally {
            if (undefined !== savedXdg) {
                process.env.XDG_CACHE_HOME = savedXdg;
            }
            if (undefined === savedHome) {
                delete process.env.HOME;
            }
            else {
                process.env.HOME = savedHome;
            }
        }
    });
    // THE PLATFORM RULE, WITH THE PLATFORM PASSED IN. A Windows arm
    // cannot be reached from a suite that never runs on Windows, so it is
    // exercised here rather than trusted — which is the whole reason
    // modCacheDir splits into modCacheDirFor. Twin: TestModCacheDirRule
    // in go/mod_test.go.
    (0, node_test_1.test)('cache-dir-rule', () => {
        const at = (...p) => Path.join(...p);
        // The explicit override wins on every platform.
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { XDG_CACHE_HOME: '/x', HOME: '/h' }), at('/x', 'aontu', 'mod'));
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { XDG_CACHE_HOME: '/x', LOCALAPPDATA: 'C:/L' }), at('/x', 'aontu', 'mod'));
        // HOME is next, and is honoured ON WINDOWS TOO. This is the case
        // CI caught: LOCALAPPDATA above HOME made an explicitly set HOME
        // unreachable there, and the platform default silently won over
        // what the environment was told.
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { LOCALAPPDATA: 'C:/L', HOME: '/h' }), at('/h', '.cache', 'aontu', 'mod'));
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { LOCALAPPDATA: 'C:/L', HOME: '/h' }), at('/h', '.cache', 'aontu', 'mod'));
        // And LOCALAPPDATA is the platform default BENEATH both, which is
        // the whole addition: Windows sets neither of the two above by
        // default.
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { LOCALAPPDATA: 'C:/L' }), at('C:/L', 'aontu', 'mod'));
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { LOCALAPPDATA: 'C:/L' }), undefined);
        // An empty variable is not a location, and nowhere to put one is a
        // MISS rather than a failure.
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { LOCALAPPDATA: '', HOME: '' }), undefined);
        Assert.equal((0, mod_1.modCacheDirFor)('win32', {}), undefined);
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { XDG_CACHE_HOME: '' }), undefined);
    });
    (0, node_test_1.test)('no-home-means-no-cache', () => {
        // A host with no home directory has no cache, and that is a MISS
        // rather than a failure: the module is simply not in any store this
        // evaluation can read, which is what the message says.
        const w = world('cache');
        const savedXdg = process.env.XDG_CACHE_HOME;
        const savedHome = process.env.HOME;
        delete process.env.XDG_CACHE_HOME;
        delete process.env.HOME;
        try {
            Assert.throws(() => new aontu_1.Aontu().generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module not fetched:'));
        }
        finally {
            if (undefined !== savedXdg) {
                process.env.XDG_CACHE_HOME = savedXdg;
            }
            if (undefined !== savedHome) {
                process.env.HOME = savedHome;
            }
        }
    });
    (0, node_test_1.test)('host-filesystem-reports-a-missing-module', () => {
        // The same channel, missing: a store the host's filesystem does not
        // have is a module that is not fetched, not a crash on the stat.
        const w = world('vendor');
        Fs.rmSync(Path.join(w.dir, 'aontu_meta', 'vendor'), { recursive: true });
        const a0 = new aontu_1.Aontu({ fs: Fs });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module not fetched:'));
    });
    (0, node_test_1.test)('host-filesystem-is-the-one-modules-are-read-from', () => {
        // An injected `fs` is the filesystem the host gave this evaluation,
        // and a module store read through any other one would escape it.
        // Injecting the real fs proves the channel: the module leg reads
        // through the host's handle rather than importing its own.
        const w = world('vendor');
        const a0 = new aontu_1.Aontu({ fs: Fs });
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
    });
    (0, node_test_1.test)('a-vendor-store-outside-the-root-is-denied', () => {
        // Confinement is about what may be READ (docs/trust.md), and a
        // project root found by walking UP can sit above the confinement
        // root — so the vendor store it names is outside, and reading it
        // would be the escape the root exists to refuse.
        const w = world('vendor');
        const sub = Path.join(w.dir, 'sub');
        Fs.mkdirSync(sub);
        const main = Path.join(sub, 'main.aon');
        Fs.copyFileSync(w.main, main);
        const a0 = new aontu_1.Aontu({ trust: { include: { root: sub } } });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(main) + '"'), (err) => String(err.message).includes('include denied:'));
    });
    (0, node_test_1.test)('verification-depth-is-bounded', () => {
        // A pinned module is verified by EVALUATING it, and that evaluation
        // resolves the module's own imports — so a vendor tree that led
        // back to itself would recurse until the host's stack gave out. The
        // bound makes it a stated refusal instead, exactly as unify_cycle
        // does, because a verdict that depends on the machine is what
        // docs/trust.md forbids. Entered at the bound directly: building a
        // sixteen-deep vendor tree would prove the same thing and nothing
        // more.
        const w = world('vendor');
        const a0 = new aontu_1.Aontu({ mod: { depth: 16 } });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module depth:'));
    });
});
// THE MODULE TOOLING (G6 phase 3, ts/src/mod-tool.ts). Both
// subcommands are LOCAL, and both are file operations, so they are
// proved here rather than in the shared suite — which has no mode for
// "run a command in a directory". The two ports were diffed over the
// same sixteen invocations (text and JSON, every usage error, the
// lockfile bytes and the vendor tree): identical but for the version
// field, G2 phase 3's standing carve-out.
(0, node_test_1.describe)('mod-tool', () => {
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
    // A project with one vendored dependency, and whatever else the
    // caller asked for.
    function project(dep, extra) {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'));
        Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: {path: "corp.example/app"}\ndep: {' + dep + '}\n');
        extra?.(dir);
        return dir;
    }
    function vendor(dir, path, files) {
        const p = Path.join(dir, 'aontu_meta', 'vendor', ...path.split('/'));
        Fs.mkdirSync(p, { recursive: true });
        for (const name of Object.keys(files)) {
            Fs.writeFileSync(Path.join(p, name), files[name]);
        }
    }
    // A VENDORED MODULE IS A PROJECT INSIDE A PROJECT (the review's
    // finding H, use-cases/BUGS.md §31). `mod vendor` produces a FLAT
    // tree, so a module's own dependency sits beside it in the
    // consumer's `aontu_meta/vendor/` -- but the module carries its own
    // `mod.aon`, which used to stop the upward walk there, and the
    // nested import answered `module not fetched` for a module sitting
    // one directory away. The Go twin is
    // TestModTransitiveVendorResolves.
    (0, node_test_1.test)('a-nested-import-reaches-the-consumers-vendor-tree', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"},' +
            ' "corp.example/schemas/common@1": {v: "1.0.0"}', (d) => {
            vendor(d, 'corp.example/schemas/service@1', {
                'mod.aon': 'mod: {path: "corp.example/schemas/service",' +
                    ' version: "1.4.2", main: "service.aon"}\n' +
                    'dep: {"corp.example/schemas/common@1": {v: "1.0.0"}}\n',
                'service.aon': '@"corp.example/schemas/common@1"\n' +
                    'spec: {name: string, port: *8080 | integer}\n',
            });
            vendor(d, 'corp.example/schemas/common@1', {
                'mod.aon': 'mod: {path: "corp.example/schemas/common",' +
                    ' version: "1.0.0", main: "common.aon"}\n',
                'common.aon': 'naming: {id: string}\n',
            });
        });
        Fs.writeFileSync(Path.join(dir, 'main.aon'), 'lib: hide(@"corp.example/schemas/service@1")\n' +
            'svc: $.lib.spec & {name: "checkout"}\n');
        const t = cli(['mod', 'tidy', dir]);
        Assert.equal(t.code, 0, t.err + t.out);
        // NOT the hash of nil, which is what a module that does not
        // evaluate pins -- and the same string for every one of them.
        Assert.equal(t.out.includes(NIL_PIN), false, t.out);
        const r = cli([Path.join(dir, 'main.aon')]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(JSON.parse(r.out).svc.port, 8080);
    });
    // A NIL PIN IS WORSE THAN NO PIN: every module that fails to
    // evaluate hashes to the same string, so a lockfile written from one
    // looks exactly like a real pin and carries nothing (§31). `aontu
    // hash` already refuses such a file; tidy refuses it too. The Go twin
    // is TestModTidyRefusesAnUnevaluableModule.
    (0, node_test_1.test)('tidy-refuses-to-pin-a-module-that-does-not-evaluate', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service@1', {
            'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
            // Contradicts itself: no meaning, so nothing to pin.
            'service.aon': 'a: 1\na: 2\n',
        }));
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 4, r.out);
        Assert.ok(r.out.includes('verdict: error'), r.out);
        Assert.ok(r.out.includes('does not evaluate on its own'), r.out);
        // AND THE LOCKFILE IS LEFT ALONE. A refusal that wrote a lockfile
        // would be the defect with a louder message.
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon')), false);
    });
    // THE REGRESSION TEST FOR THE DEFECT THE PATH GATE EXISTS TO CLOSE:
    // `vendor` copied a module tree OUTSIDE the project entirely and
    // reported `verdict: ok`, exit 0.
    //
    // The path routes -- it is domain-shaped and carries a major -- and
    // then `..` elements walked the store path up out of `aontu_meta/vendor/`,
    // because pathJoin CLEANS `..` rather than refusing it. The lockfile
    // is the delivery vehicle: a hostile repository ships one, and
    // vendoring it writes wherever the path points.
    //
    // Asserted on the FILESYSTEM, not on the message. A report that says
    // the right thing while the write still happened is the failure this
    // test exists to catch. The Go twin is
    // TestModVendorRefusesAnEscapingPath.
    (0, node_test_1.test)('vendor-refuses-an-escaping-path', () => {
        const escaping = 'corp.example/../../../outside/pwned@1';
        const hash = (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE));
        const dir = project('');
        // The module sits in the cache under its pin, so the ONLY thing
        // standing between the lockfile and the copy is the path gate.
        const xdg = Path.join(dir, 'xdg');
        const cachedir = Path.join(xdg, 'aontu', 'mod', hash);
        Fs.mkdirSync(cachedir, { recursive: true });
        Fs.writeFileSync(Path.join(cachedir, 'mod.aon'), 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n');
        Fs.writeFileSync(Path.join(cachedir, 'service.aon'), MODULE);
        writeLock(dir, '{"lock":{"' + escaping + '":{"canon":"' + hash +
            '","oci":"","v":"1.0.0"}}}\n');
        const prev = process.env.XDG_CACHE_HOME;
        process.env.XDG_CACHE_HOME = xdg;
        let r;
        try {
            r = cli(['mod', 'vendor', dir]);
        }
        finally {
            if (undefined === prev) {
                delete process.env.XDG_CACHE_HOME;
            }
            else {
                process.env.XDG_CACHE_HOME = prev;
            }
        }
        // Nothing outside the project, at any of the levels `..` reaches.
        for (const up of [
            Path.join(dir, '..', '..', 'outside'),
            Path.join(dir, '..', 'outside'),
            Path.join(dir, 'outside'),
        ]) {
            Assert.equal(Fs.existsSync(up), false, 'wrote outside the project: ' + up);
        }
        // And nothing inside it either: the module is not vendored at all.
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'vendor')), false, r.out);
        Assert.equal(r.code, 1, r.out);
        Assert.ok(r.out.includes(escaping + ': not fetched'), r.out);
    });
    // VERIFICATION IS A QUESTION; ANSWERING IT MUST NOT BE AN EDIT
    // (§32). Tidy recomputes and rewrites by design, so a CI job that
    // tidies before evaluating has no integrity protection at all: the
    // lockfile simply agrees with whatever the store now holds. The Go
    // twin is TestModVerify.
    (0, node_test_1.test)('verify-catches-a-tampered-store-and-changes-nothing', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service@1', {
            'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
            'service.aon': MODULE,
        }));
        Assert.equal(cli(['mod', 'tidy', dir]).code, 0);
        const lock = Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8');
        const clean = cli(['mod', 'verify', dir]);
        Assert.equal(clean.code, 0, clean.out);
        Assert.ok(clean.out.includes(': verified'), clean.out);
        // Tamper, and ask again.
        const svc = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service@1', 'service.aon');
        Fs.writeFileSync(svc, Fs.readFileSync(svc, 'utf8').replace('8080', '9090'));
        const bad = cli(['mod', 'verify', dir]);
        Assert.equal(bad.code, 1, bad.out);
        Assert.ok(bad.out.includes('verdict: mismatch'), bad.out);
        Assert.ok(bad.out.includes('but the store means'), bad.out);
        // THE LOCKFILE IS UNTOUCHED, which is the whole difference from
        // tidy: a gate that rewrote what it was checking would pass every
        // time.
        Assert.equal(Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8'), lock);
        // A module that no longer stands up at all says so, rather than
        // reporting the hash of nil as though it were a meaning.
        Fs.writeFileSync(svc, 'a: 1\na: 2\n');
        const broken = cli(['mod', 'verify', dir]);
        Assert.equal(broken.code, 1, broken.out);
        Assert.ok(broken.out.includes('it does not evaluate'), broken.out);
    });
    // NOTHING TO CHECK IS NOT A PASS. The gate walks what is LOCKED, so
    // a project whose lockfile was never committed -- or whose lockfile
    // predates a dependency someone added -- would verify clean over an
    // empty set: absence reading as agreement, which is the shape of the
    // defect this verb exists to close. The repair is a tidy, not a
    // fetch, and the verdict says which. The Go twin is
    // TestModVerifyRefusesAnUncoveredProject.
    (0, node_test_1.test)('verify-refuses-a-project-the-lockfile-does-not-cover', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service@1', {
            'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
            'service.aon': MODULE,
        }));
        const bare = cli(['mod', 'verify', dir]);
        Assert.equal(bare.code, 1, bare.out);
        Assert.ok(bare.out.includes('verdict: unlocked'), bare.out);
        Assert.ok(bare.out.includes('corp.example/schemas/service@1: not in the lockfile (run: aontu mod tidy)'), bare.out);
        // Tidy writes it, and the same question now passes.
        Assert.equal(cli(['mod', 'tidy', dir]).code, 0);
        Assert.equal(cli(['mod', 'verify', dir]).code, 0);
        // A dependency added to mod.aon after the lockfile was written is
        // the same hole one edit later: the pins that ARE there still
        // verify, and the lockfile no longer covers the project.
        Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: {path: "corp.example/app"}\ndep: {' +
            '"corp.example/schemas/service@1": {v: "1.4.2"}, ' +
            '"corp.example/schemas/later@1": {v: "1.0.0"}}\n');
        const stale = cli(['mod', 'verify', '--format', 'json', dir]);
        Assert.equal(stale.code, 1, stale.out);
        const report = JSON.parse(stale.out);
        Assert.equal(report.verdict, 'unlocked');
        Assert.deepEqual(report.unlocked, ['corp.example/schemas/later@1']);
        Assert.deepEqual(report.verified, ['corp.example/schemas/service@1']);
    });
    // A pin cannot be compared against a store that has nothing to
    // compare, and there are three ways to have nothing: a key that does
    // not route as a module path, one that routes to a module no store
    // holds, and one whose store directory exists but whose entry file
    // does not. All three are `missing` -- the repair is a fetch, not an
    // edit to the lockfile -- and none of them is a mismatch, which would
    // claim the store means something else. The Go twin is
    // TestModVerifyReportsWhatNoStoreHolds.
    (0, node_test_1.test)('verify-reports-what-no-store-holds', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'));
        writeLock(dir, '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
            '{"lock":{"corp.example/absent@1":{"canon":"aon1-x","oci":"","v":"1"},' +
            '"corp.example/hollow@1":{"canon":"aon1-y","oci":"","v":"1"},' +
            '"not-a-module":{"canon":"aon1-z","oci":"","v":"1"}}}\n');
        // hollow@1 is vendored as a directory with a mod.aon naming an
        // entry file that was never written.
        vendor(dir, 'corp.example/hollow@1', {
            'mod.aon': 'mod: {path: "corp.example/hollow", main: "hollow.aon"}\n',
        });
        const r = cli(['mod', 'verify', '--format', 'json', dir]);
        Assert.equal(r.code, 1, r.out);
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'missing');
        Assert.deepEqual(report.mismatched, []);
        Assert.deepEqual(report.missing, [
            'corp.example/absent@1', 'corp.example/hollow@1', 'not-a-module'
        ]);
        // And in text, where the line names the repair -- here a fetch,
        // because the module itself is what is absent.
        const text = cli(['mod', 'verify', dir]);
        Assert.equal(text.code, 1, text.out);
        Assert.ok(text.out.includes('verdict: missing'), text.out);
        Assert.ok(text.out.includes('corp.example/absent@1: not fetched (run: aontu mod get)'), text.out);
    });
    (0, node_test_1.test)('tidy-writes-the-lockfile-in-canonical-form', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service@1', {
            'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
            'service.aon': MODULE,
        }));
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.ok(r.out.includes('verdict: ok'));
        const lock = Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8');
        // A HEADER the file's own reader skips, then ONE canonical line —
        // sorted keys, no spaces — which is also the JSON the resolver
        // reads a pin back from.
        Assert.ok(lock.startsWith('# mod-lock.aon (generated by'));
        const line = lock.split('\n')[1];
        Assert.equal(line, '{"lock":{"corp.example/schemas/service@1":{"canon":"' +
            (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)) + '","oci":"","v":"1.4.2"}}}');
        Assert.deepEqual(Object.keys(JSON.parse(line).lock), ['corp.example/schemas/service@1']);
    });
    (0, node_test_1.test)('tidy-selects-the-maximum-of-the-minima', () => {
        // MINIMUM VERSION SELECTION: the project asks for 1.2.0 of geo and
        // the module it depends on asks for 1.10.0, so 1.10.0 is selected —
        // and 1.10.0 is above 1.2.0 by NUMBER, which string order gets
        // wrong. That is the whole reason versionCompare exists.
        const dir = project('"corp.example/s@1": {v: "1.2.0"}, "corp.example/geo@1": {v: "1.2.0"}', (d) => {
            vendor(d, 'corp.example/s@1', {
                'mod.aon': 'mod: {path: "corp.example/s"}\n' +
                    'dep: {"corp.example/geo@1": {v: "1.10.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/geo@1', {
                'mod.aon': 'mod: {path: "corp.example/geo"}\n',
                'main.aon': 'region: string\n',
            });
        });
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.ok(r.out.includes('corp.example/geo@1 1.10.0 aon1-'), r.out);
    });
    (0, node_test_1.test)('version-order-is-numeric', () => {
        Assert.equal((0, mod_tool_1.versionCompare)('1.10.0', '1.9.0'), 1);
        // A part the shorter version does not have is ZERO.
        Assert.equal((0, mod_tool_1.versionCompare)('1.2', '1.2.0'), 0);
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.0', '1.2.0'), 0);
        // A part that is not a number sorts as text, AFTER every number: a
        // pre-release tag is below no version and above none.
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.0', '1.2.rc'), -1);
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.rc', '1.2.0'), 1);
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.rc', '1.2.beta'), 1);
        // Both directions of both rules: a comparison that answered only
        // one way round would still pass a single-sided test, and MVS reads
        // it from whichever side the frontier happens to hold.
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.0', '1.2'), 0);
        Assert.equal((0, mod_tool_1.versionCompare)('1.2.beta', '1.2.rc'), -1);
    });
    (0, node_test_1.test)('tidy-with-no-module-file-locks-nothing', () => {
        // A directory that declares nothing depends on nothing. The
        // lockfile is still written, and says so: an empty closure is a
        // resolved closure.
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modtool-'));
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(r.out.trim(), 'verdict: ok');
        Assert.equal(Fs.readFileSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon'), 'utf8').split('\n')[1], '{"lock":{}}');
    });
    (0, node_test_1.test)('tidy-cannot-see-a-key-that-is-not-a-module-path', () => {
        // A dependency key the router would not call a module names nothing
        // any store can hold, so it is reported the same way a module that
        // is simply not there is — there is no third answer to give.
        const dir = project('"not-a-module": {v: "1.0.0"}');
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('not-a-module: not fetched'), r.out);
    });
    (0, node_test_1.test)('tidy-keeps-the-highest-bid-and-ignores-a-later-lower-one', () => {
        // The two ways MVS discards a bid. WITHIN a round: `s` and `t` both
        // ask for geo, and the higher ask wins. ACROSS rounds: the project
        // itself asks for geo at 2.0.0, so the 1.x asks that arrive in the
        // next round are already below what is selected and change nothing.
        // Selected versions only rise, which is why this terminates without
        // a cycle check.
        const dir = project('"corp.example/s@1": {v: "1.0.0"}, "corp.example/t@1": {v: "1.0.0"}, ' +
            '"corp.example/geo@1": {v: "2.0.0"}', (d) => {
            vendor(d, 'corp.example/s@1', {
                'mod.aon': 'mod: {path: "corp.example/s"}\n' +
                    'dep: {"corp.example/geo@1": {v: "1.5.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/t@1', {
                'mod.aon': 'mod: {path: "corp.example/t"}\n' +
                    'dep: {"corp.example/geo@1": {v: "1.1.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/geo@1', {
                'mod.aon': 'mod: {path: "corp.example/geo"}\n',
                'main.aon': 'region: string\n',
            });
        });
        const r = cli(['mod', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        const geo = JSON.parse(r.out).lock
            .find((e) => 'corp.example/geo@1' === e.mod);
        Assert.equal(geo.v, '2.0.0');
    });
    (0, node_test_1.test)('tidy-recomputes-the-canon-pin-and-carries-the-oci-over', () => {
        // The two pins have different owners. `canon` is what the module in
        // the store MEANS, so it is recomputed — a tidy that carried the old
        // one forward would pin what the module used to mean. `oci` is the
        // registry's word about the bytes it served, which nothing local can
        // hear, so it survives untouched.
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => {
            vendor(d, 'corp.example/schemas/service@1', {
                'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
                'service.aon': MODULE,
            });
            writeLock(d, '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
                '{"lock":{"corp.example/schemas/service@1":{"canon":"aon1-stale",' +
                '"oci":"sha256:6b86","v":"1.0.0"}}}\n');
        });
        const r = cli(['mod', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        const e = JSON.parse(r.out).lock[0];
        Assert.equal(e.canon, (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)));
        Assert.equal(e.oci, 'sha256:6b86');
    });
    (0, node_test_1.test)('tidy-pins-nothing-for-a-module-whose-entry-is-missing', () => {
        // A module file naming an entry that is not there has no meaning to
        // hash. The empty pin is the honest answer: the module resolved,
        // and nothing about it was verifiable.
        const dir = project('"corp.example/s@1": {v: "1.0.0"}', (d) => vendor(d, 'corp.example/s@1', {
            'mod.aon': 'mod: {path: "corp.example/s", main: "gone.aon"}\n',
        }));
        const r = cli(['mod', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(JSON.parse(r.out).lock[0].canon, '');
    });
    (0, node_test_1.test)('an-unreadable-lockfile-locks-nothing', () => {
        // Three ways a lockfile can fail to say anything, all answered the
        // same way: it pins nothing. A lockfile is generated, so a file that
        // is not what the generator writes is not a file to guess at.
        for (const text of [
            'this is not the canonical line\n',
            '{"other":{}}\n',
            '{"lock":{"corp.example/s@1":{"canon":1,"oci":2,"v":3}}}\n',
        ]) {
            const dir = project('');
            writeLock(dir, text);
            const r = cli(['mod', 'vendor', dir]);
            Assert.equal(r.out.trim().split('\n')[0], 'verdict: ' +
                (text.startsWith('{"lock"') ? 'missing' : 'ok'), r.out);
        }
    });
    (0, node_test_1.test)('vendor-reports-a-module-path-no-store-holds', () => {
        // Distinct from the key that is not a module path at all: this one
        // routes, and there is simply nothing behind it.
        const dir = project('');
        writeLock(dir, '{"lock":{"corp.example/absent@1":{"canon":"aon1-x","oci":"","v":"1"}}}\n');
        const r = cli(['mod', 'vendor', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('corp.example/absent@1: not fetched'), r.out);
    });
    (0, node_test_1.test)('vendor-copies-the-whole-source-tree', () => {
        // A module is a TREE, not an entry file — that is what an OCI layer
        // holds — so nested directories come across too.
        const w = world('cache');
        Fs.mkdirSync(Path.join(w.cache, w.hash, 'part'), { recursive: true });
        Fs.writeFileSync(Path.join(w.cache, w.hash, 'part', 'extra.aon'), 'extra: true\n');
        writeLock(w.dir, '{"lock":{"corp.example/schemas/service@1":{"canon":"' + w.hash +
            '","oci":"","v":"1.4.2"}}}\n');
        const saved = process.env.XDG_CACHE_HOME;
        const xdg = Path.join(w.dir, 'xdg');
        Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'));
        process.env.XDG_CACHE_HOME = xdg;
        try {
            Assert.equal(cli(['mod', 'vendor', w.dir]).code, 0);
            Assert.equal(Fs.readFileSync(Path.join(w.dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service@1', 'part', 'extra.aon'), 'utf8'), 'extra: true\n');
        }
        finally {
            if (undefined === saved) {
                delete process.env.XDG_CACHE_HOME;
            }
            else {
                process.env.XDG_CACHE_HOME = saved;
            }
        }
    });
    (0, node_test_1.test)('tidy-refuses-to-lock-what-it-cannot-see', () => {
        // A lockfile naming a module nobody has is a lie, so no lockfile is
        // written at all — and the message names the step that would fix
        // it, which is the step this build does not ship.
        const dir = project('"corp.example/absent@1": {v: "1.0.0"}');
        const r = cli(['mod', 'tidy', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('corp.example/absent@1: not fetched'), r.out);
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'mod-lock.aon')), false);
    });
    (0, node_test_1.test)('vendor-materialises-the-locked-closure', () => {
        // From the CACHE, keyed by the hash the lockfile pins: that is what
        // content-addressed means, and it is why `vendor` needs a lockfile
        // while `tidy` needs a store.
        const w = world('cache');
        writeLock(w.dir, '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n' +
            '{"lock":{"corp.example/schemas/service@1":{"canon":"' + w.hash +
            '","oci":"","v":"1.4.2"}}}\n');
        const saved = process.env.XDG_CACHE_HOME;
        const xdg = Path.join(w.dir, 'xdg');
        Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'mod'));
        process.env.XDG_CACHE_HOME = xdg;
        try {
            const r = cli(['mod', 'vendor', w.dir]);
            Assert.equal(r.code, 0, r.err);
            Assert.ok(Fs.existsSync(Path.join(w.dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service@1', 'service.aon')));
        }
        finally {
            if (undefined === saved) {
                delete process.env.XDG_CACHE_HOME;
            }
            else {
                process.env.XDG_CACHE_HOME = saved;
            }
        }
    });
    (0, node_test_1.test)('vendor-reports-what-no-store-has', () => {
        const dir = project('');
        writeLock(dir, '{"lock":{"nope@1":{"canon":"x","oci":"","v":"1"},' +
            '"not-a-module":{"canon":"y","oci":"","v":"1"}}}\n');
        const r = cli(['mod', 'vendor', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('nope@1: not fetched'), r.out);
        Assert.ok(r.out.includes('not-a-module: not fetched'), r.out);
    });
    (0, node_test_1.test)('the-network-half-says-which-half-it-is', () => {
        // `get` and `publish` are named rather than left to fall out as an
        // unknown subcommand: a reader of the design will type them, and
        // deserves to be told which half is missing.
        for (const sub of ['get', 'publish']) {
            const r = cli(['mod', sub]);
            Assert.equal(r.code, 2);
            Assert.ok(r.err.includes('needs a registry client'), r.err);
        }
    });
    (0, node_test_1.test)('mod-arguments', () => {
        Assert.equal(cli(['mod', '--help']).code, 0);
        Assert.ok(cli(['mod']).err.includes('needs tidy, verify, vendor or manifest'));
        Assert.ok(cli(['mod', 'nope']).err.includes('needs tidy, verify, vendor or manifest'));
        Assert.ok(cli(['mod', 'tidy', 'a', 'b']).err
            .includes('needs tidy, verify, vendor or manifest'));
        Assert.ok(cli(['mod', '--format', 'yaml', 'tidy']).err
            .includes('text or json'));
        Assert.ok(cli(['mod', '--nope', 'tidy']).err.includes('unknown mod option'));
    });
    (0, node_test_1.test)('tidy-json-is-the-report', () => {
        const dir = project('"corp.example/schemas/service@1": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service@1', {
            'mod.aon': 'mod: {path: "corp.example/schemas/service", main: "service.aon"}\n',
            'service.aon': MODULE,
        }));
        const r = cli(['mod', 'tidy', '--format', 'json', dir]);
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.verb, 'mod tidy');
        Assert.equal(report.verdict, 'ok');
        Assert.equal(report.lock[0].mod, 'corp.example/schemas/service@1');
        Assert.deepEqual(report.missing, []);
    });
    // THE PUBLISH BOUNDARY (G6 phase 4). What a publish would push is a
    // manifest, and everything it ASSERTS is local: the annotations, the
    // layer's contents, and the gate that decides whether the version may
    // be minted at all. The push itself needs a registry this build does
    // not have; the assertions do not.
    // A module in its own right: it declares its path, its version and
    // its entry, which is what a publish needs and a dependency does not.
    function publishable(version, src, extra) {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-'));
        Fs.writeFileSync(Path.join(dir, 'mod.aon'), 'mod: {path: "corp.example/schemas/service"' +
            ('' === version ? '' : ', version: "' + version + '"') +
            ', main: "service.aon"}\n');
        if ('' !== src) {
            Fs.writeFileSync(Path.join(dir, 'service.aon'), src);
        }
        extra?.(dir);
        return dir;
    }
    const manifestOf = (dir, against) => {
        const args = ['mod', 'manifest', '--format', 'json'];
        if (null != against) {
            args.push('--against', against);
        }
        const r = cli([...args, dir]);
        return { code: r.code, report: JSON.parse(r.out) };
    };
    (0, node_test_1.test)('manifest-is-what-a-publish-would-push', () => {
        const dir = publishable('1.1.0', MODULE);
        const { code, report } = manifestOf(dir);
        Assert.equal(code, 0);
        Assert.equal(report.verdict, 'ok');
        Assert.equal(report.mod, 'corp.example/schemas/service@1');
        Assert.equal(report.version, '1.1.0');
        Assert.equal(report.config, 'application/vnd.aontu.module.v1+json');
        // The canon-hash is THE pin: the same string `mod tidy` locks and
        // `aontu hash` prints, so "has the truth changed?" is one annotation
        // read and a string compare.
        Assert.equal(report.canon, (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)));
        Assert.deepEqual(report.annotations, {
            'com.github.rjrodger.aontu.canon': report.canon,
            'com.github.rjrodger.aontu.major': '1',
            'org.opencontainers.image.title': 'corp.example/schemas/service',
            'org.opencontainers.image.version': '1.1.0',
        });
        Assert.deepEqual(report.files, ['mod.aon', 'service.aon']);
    });
    (0, node_test_1.test)('the-layer-is-the-source-tree-without-the-vendor-copy', () => {
        // A module is a TREE, so nested directories are in the layer. A
        // published module carries its own sources and not a copy of
        // everyone else's, so `aontu_meta/vendor/` is not: a consumer resolves the
        // closure itself, and vendoring it here would publish the world.
        const dir = publishable('1.1.0', MODULE, (d) => {
            Fs.mkdirSync(Path.join(d, 'part'));
            Fs.writeFileSync(Path.join(d, 'part', 'extra.aon'), 'extra: true\n');
            vendor(d, 'corp.example/other@1', { 'mod.aon': 'mod: {path: "x"}\n' });
        });
        Assert.deepEqual(manifestOf(dir).report.files, ['mod.aon', 'part/extra.aon', 'service.aon']);
    });
    (0, node_test_1.test)('a-manifest-needs-a-version-and-an-entry', () => {
        // A version is what a publish assigns, and the major an import
        // spells lives inside it — a module that declares none has nothing
        // to publish under. An entry file that is not there has no meaning
        // to pin. Neither is a fetch away, so neither is reported as one.
        const noVersion = manifestOf(publishable('', MODULE));
        Assert.equal(noVersion.code, 4);
        Assert.equal(noVersion.report.verdict, 'error');
        Assert.deepEqual(noVersion.report.missing, ['mod.version']);
        const noEntry = manifestOf(publishable('1.0.0', ''));
        Assert.equal(noEntry.code, 4);
        Assert.deepEqual(noEntry.report.missing, ['service.aon']);
        Assert.ok(cli(['mod', 'manifest', publishable('', '')]).out
            .includes('mod.version: missing'));
    });
    (0, node_test_1.test)('the-gate-refuses-a-breaking-version', () => {
        // THE PUBLISH-TIME BREAKING GATE. The semantics belong wholly to G3
        // — this is the wiring, at the one place versions are minted — so
        // the verdict, the findings and the exit class are `aontu
        // breaking`'s, unchanged.
        const prior = publishable('1.0.0', MODULE);
        const next = publishable('1.1.0', MODULE + 'region: *"eu" | string\n');
        const { code, report } = manifestOf(next, prior);
        Assert.equal(code, 1);
        Assert.equal(report.verdict, 'breaking');
        Assert.equal(report.findings[0].path, '$.region');
        // And a compatible change passes the same gate.
        const widened = publishable('1.2.0', 'name: string\n');
        const ok = manifestOf(widened, prior);
        Assert.equal(ok.code, 0);
        Assert.equal(ok.report.verdict, 'ok');
        Assert.deepEqual(ok.report.findings, []);
    });
    (0, node_test_1.test)('a-major-bump-is-where-breaking-is-allowed', () => {
        // The major lives in the module path, so a consumer of `@1` never
        // sees `@2` unless it asks. Checking compatibility across majors
        // would forbid the one change the version scheme exists to express.
        const prior = publishable('1.0.0', MODULE);
        const next = publishable('2.0.0', MODULE + 'region: string\n');
        const { code, report } = manifestOf(next, prior);
        Assert.equal(code, 0);
        Assert.equal(report.verdict, 'ok');
        Assert.equal(report.mod, 'corp.example/schemas/service@2');
    });
    (0, node_test_1.test)('a-prior-version-with-no-entry-cannot-be-gated-against', () => {
        const { code, report } = manifestOf(publishable('1.1.0', MODULE), publishable('1.0.0', ''));
        Assert.equal(code, 4);
        Assert.equal(report.verdict, 'error');
        Assert.deepEqual(report.missing, ['service.aon']);
    });
    (0, node_test_1.test)('the-gate-can-be-undecided', () => {
        // Subsumption is THREE-valued plus error, and the gate passes all
        // four through: a question it cannot decide is not a pass, and its
        // own exit class is what tells a caller so. `must` carries a
        // message the checker cannot reason about.
        const { code, report } = manifestOf(publishable('1.1.0', 'a: must(min(1), "m")\n'), publishable('1.0.0', 'a: min(1)\n'));
        Assert.equal(code, 3);
        Assert.equal(report.verdict, 'undecided');
    });
    (0, node_test_1.test)('a-module-file-that-declares-nothing-mints-nothing', () => {
        // A module file is ordinary Aontu, so it can say anything. What it
        // does not say about ITSELF leaves the manifest with nothing to
        // mint, which is the same answer as saying nothing at all.
        for (const src of ['1\n', 'dep: {}\n', 'mod: 1\n']) {
            const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-'));
            Fs.writeFileSync(Path.join(dir, 'mod.aon'), src);
            const { code, report } = manifestOf(dir);
            Assert.equal(code, 4, src);
            Assert.deepEqual(report.missing, ['main.aon', 'mod.path', 'mod.version']);
        }
        // And a directory with no module file at all, which says the same
        // thing by saying nothing.
        const bare = manifestOf(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-modpub-')));
        Assert.equal(bare.code, 4);
        Assert.deepEqual(bare.report.missing, ['main.aon', 'mod.path', 'mod.version']);
    });
    (0, node_test_1.test)('manifest-text-and-arguments', () => {
        const out = cli(['mod', 'manifest', publishable('1.1.0', MODULE)]).out;
        Assert.ok(out.includes('corp.example/schemas/service@1 1.1.0'), out);
        Assert.ok(out.includes('config: application/vnd.aontu.module.v1+json'), out);
        Assert.ok(out.includes('layer: service.aon'), out);
        // A refused gate names what broke, in text as well as in JSON: the
        // exit code says a publish must not follow, and the body says why.
        const refused = cli(['mod', 'manifest',
            '--against', publishable('1.0.0', MODULE),
            publishable('1.1.0', MODULE + 'region: *"eu" | string\n')]);
        Assert.equal(refused.code, 1);
        Assert.ok(refused.out.includes('verdict: breaking'), refused.out);
        Assert.ok(refused.out.includes('$.region: '), refused.out);
        // `--against` gates a manifest and means nothing to the other two;
        // accepting it there would say it had been honoured.
        Assert.ok(cli(['mod', 'tidy', '--against', 'x', '.']).err
            .includes('--against is a manifest option'));
        Assert.ok(cli(['mod', 'manifest', '--against']).err
            .includes('--against needs a module directory'));
        Assert.ok(cli(['mod', 'nope']).err
            .includes('needs tidy, verify, vendor or manifest'));
    });
});
//# sourceMappingURL=mod.test.js.map