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
const cli_1 = require("../dist/cli");
const pkg_1 = require("../dist/pkg");
const pkg_zip_1 = require("../dist/pkg-zip");
const mod_1 = require("../dist/mod");
const compat_1 = require("../dist/compat");
// The lockfile lives under aontu_meta/, which a test that writes one by
// hand has to create first, as `sync` does.
function writeLock(dir, text) {
    Fs.mkdirSync(Path.join(dir, 'aontu_meta'), { recursive: true });
    Fs.writeFileSync(Path.join(dir, 'aontu_meta', 'pkg-lock.aon'), text);
}
const LOCK = (dir) => Fs.readFileSync(Path.join(dir, 'aontu_meta', 'pkg-lock.aon'), 'utf8');
const MODULE = 'name: string\nport: *8080 | integer\n';
const NIL_PIN = 'aon1-XaOkx_EXlEJ1tMhinEkWQDYl1aSmVzoB7LA_Dp0u2-Y';
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
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkg-'));
    Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\ndep: {' + dep + '}\n');
    extra?.(dir);
    return dir;
}
function vendor(dir, path, files) {
    const p = Path.join(dir, 'aontu_meta', 'vendor', ...path.split('/'));
    Fs.mkdirSync(p, { recursive: true });
    for (const name of Object.keys(files)) {
        Fs.mkdirSync(Path.dirname(Path.join(p, name)), { recursive: true });
        Fs.writeFileSync(Path.join(p, name), files[name]);
    }
}
const SERVICE = {
    'pkg.aon': 'pkg: {path: "corp.example/schemas/service", main: "service.aon"}\n',
    'service.aon': MODULE,
};
// The cache the tooling reads, pointed at a directory the test owns.
function withCache(dir, fn) {
    const xdg = Path.join(dir, 'xdg');
    const cache = Path.join(xdg, 'aontu', 'pkg');
    Fs.mkdirSync(cache, { recursive: true });
    const prev = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = xdg;
    try {
        return fn(cache);
    }
    finally {
        if (undefined === prev) {
            delete process.env.XDG_CACHE_HOME;
        }
        else {
            process.env.XDG_CACHE_HOME = prev;
        }
    }
}
(0, node_test_1.describe)('pkg-zip', () => {
    (0, node_test_1.test)('the-canonical-archive-is-one-digest-per-tree', () => {
        const a = (0, pkg_zip_1.zipCanonical)([
            { path: 'b.aon', data: new TextEncoder().encode('b: 2\n') },
            { path: 'a.aon', data: new TextEncoder().encode('a: 1\n') },
        ]);
        const b = (0, pkg_zip_1.zipCanonical)([
            { path: 'a.aon', data: new TextEncoder().encode('a: 1\n') },
            { path: 'b.aon', data: new TextEncoder().encode('b: 2\n') },
        ]);
        Assert.equal((0, pkg_zip_1.sha256Hex)(a), (0, pkg_zip_1.sha256Hex)(b));
        Assert.match((0, pkg_zip_1.sha256Hex)(a), /^sha256:[0-9a-f]{64}$/);
        const back = (0, pkg_zip_1.unzipCanonical)(a);
        Assert.deepEqual(back.map((e) => e.path), ['a.aon', 'b.aon']);
        Assert.equal(new TextDecoder().decode(back[1].data), 'b: 2\n');
        // The empty archive is a real archive.
        Assert.deepEqual((0, pkg_zip_1.unzipCanonical)((0, pkg_zip_1.zipCanonical)([])), []);
        Assert.deepEqual([(0, pkg_zip_1.cmpBytes)('a', 'b'), (0, pkg_zip_1.cmpBytes)('b', 'a'), (0, pkg_zip_1.cmpBytes)('a', 'a')], [-1, 1, 0]);
        // Ported from the Go suite: entries out of order, a data run that
        // overruns the directory, and bytes between the last entry and the
        // directory.
        const enc = (t) => new TextEncoder().encode(t);
        const good = Buffer.from((0, pkg_zip_1.zipCanonical)([
            { path: 'a.aon', data: enc('a: 1\n') }, { path: 'b.aon', data: enc('b: 2\n') }
        ]));
        const refuses = (zip, why) => Assert.throws(() => (0, pkg_zip_1.unzipCanonical)(zip), new RegExp(why));
        const cd = good.length - 22 - 2 * (46 + 5);
        const swapped = Buffer.from(good);
        swapped[cd + 46] = 0x62;
        swapped[cd + 46 + 46 + 5] = 0x61;
        swapped[30] = 0x62;
        swapped[70] = 0x61;
        refuses(swapped, 'entries out of order at a.aon');
        const one = Buffer.from((0, pkg_zip_1.zipCanonical)([{ path: 'a.aon', data: enc('a: 1\n') }]));
        const overrun = Buffer.from(one);
        for (const at of [18, 22, 40 + 20, 40 + 24]) {
            overrun[at] = 100;
        }
        refuses(overrun, 'data of a.aon');
        const padded = Buffer.concat([one.subarray(0, 40), Buffer.from([0, 0, 0]), one.subarray(40)]);
        padded[padded.length - 22 + 16] = 43;
        refuses(padded, 'trailing bytes');
    });
    (0, node_test_1.test)('the-reader-refuses-what-the-writer-would-not-write', () => {
        const good = (0, pkg_zip_1.zipCanonical)([
            { path: 'a.aon', data: new TextEncoder().encode('a: 1\n') },
            { path: 'b.aon', data: new TextEncoder().encode('b: 2\n') },
        ]);
        const refuses = (bytes, why) => Assert.throws(() => (0, pkg_zip_1.unzipCanonical)(bytes), why);
        refuses(new Uint8Array(3), /no end record/);
        refuses(good.subarray(0, good.length - 1), /no end record/);
        const flip = (at, v) => {
            const c = good.slice();
            c[at] = v;
            return c;
        };
        // A comment length, a disk number, a count that disagrees.
        refuses(flip(good.length - 2, 1), /end record/);
        refuses(flip(good.length - 22 + 4, 1), /end record/);
        refuses(flip(good.length - 22 + 8, 9), /end record/);
        // The central directory: a compression method, a timestamp, a
        // second copy of the name in another order, a checksum.
        const cd = good.length - 22 - 2 * (46 + 5);
        refuses(flip(cd + 10, 8), /entry 0/);
        refuses(flip(cd + 12, 1), /entry 0/);
        refuses(flip(cd, 1), /central directory/);
        // Swap the names so the order is wrong in both places.
        const swapped = good.slice();
        swapped[cd + 46] = 'b'.charCodeAt(0);
        swapped[cd + 46 + 46 + 5] = 'a'.charCodeAt(0);
        refuses(swapped, /entries out of order|local header/);
        // A local header that disagrees with the directory.
        refuses(flip(4, 20), /local header/);
        refuses(flip(0, 1), /local header/);
        // The data itself, corrupted under an intact directory.
        refuses(flip(30 + 5, 0x7a), /checksum/);
        // A name the central directory spells differently.
        refuses(flip(30, 'z'.charCodeAt(0)), /local header/);
    });
});
(0, node_test_1.describe)('pkg-archive', () => {
    (0, node_test_1.test)('the-allowlist-is-enumerated-and-refuses-by-default', () => {
        for (const ok of ['a.aon', 'x/y/b.aontu', 'c.json', 'd.yaml', 'e.yml',
            'f.toml', 'g.ini', 'h.md', 'i.txt', 'LICENSE', 'sub/NOTICE', 'J.JSON']) {
            Assert.equal((0, pkg_1.archiveAdmits)(ok), true, ok);
        }
        for (const bad of ['a.sh', 'b.js', 'Makefile', '.gitignore', 'c',
            'd.aon.bak', '.claude/settings.json', 'e.png']) {
            Assert.equal((0, pkg_1.archiveAdmits)(bad), false, bad);
        }
    });
    (0, node_test_1.test)('archive-of-a-tree-skips-aontu-meta-and-names-the-forbidden', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-arch-'));
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/x"}\n');
        Fs.writeFileSync(Path.join(dir, 'main.aon'), 'a: 1\n');
        Fs.mkdirSync(Path.join(dir, 'aontu_meta', 'vendor'), { recursive: true });
        Fs.writeFileSync(Path.join(dir, 'aontu_meta', 'manifest.aon'), '{}');
        Fs.mkdirSync(Path.join(dir, 'sub', '.hidden'), { recursive: true });
        Fs.writeFileSync(Path.join(dir, 'sub', '.hidden', 'x.aon'), 'x: 1\n');
        Fs.writeFileSync(Path.join(dir, 'sub', 'run.sh'), 'echo\n');
        Fs.writeFileSync(Path.join(dir, 'sub', 'ok.aon'), 'ok: 1\n');
        Fs.writeFileSync(Path.join(dir, 'exec.aon'), 'e: 1\n', { mode: 0o755 });
        Fs.symlinkSync(Path.join(dir, 'main.aon'), Path.join(dir, 'link.aon'));
        // Windows has no execute bit, so the executable is an ordinary file there.
        const windows = 'win32' === process.platform;
        const a = (0, pkg_1.archiveOf)(dir);
        Assert.deepEqual(a.files.map((f) => f.path), windows ? ['exec.aon', 'main.aon', 'pkg.aon', 'sub/ok.aon'] : ['main.aon', 'pkg.aon', 'sub/ok.aon']);
        Assert.deepEqual(a.forbidden, windows ? ['link.aon', 'sub/.hidden/', 'sub/run.sh'] : ['exec.aon', 'link.aon', 'sub/.hidden/', 'sub/run.sh']);
        Assert.equal(a.size, a.zip.length);
        const main = a.files.find((f) => 'main.aon' === f.path);
        Assert.equal(main?.size, 5);
        Assert.equal(main?.digest, (0, pkg_zip_1.sha256Hex)(new TextEncoder().encode('a: 1\n')));
    });
});
(0, node_test_1.describe)('pkg-tool', () => {
    (0, node_test_1.test)('a-nested-import-reaches-the-consumers-vendor-tree', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"},' +
            ' "corp.example/schemas/common": {v: "1.0.0"}', (d) => {
            vendor(d, 'corp.example/schemas/service', {
                'pkg.aon': 'pkg: {path: "corp.example/schemas/service",' +
                    ' version: "1.4.2", main: "service.aon"}\n' +
                    'dep: {"corp.example/schemas/common": {v: "1.0.0"}}\n',
                'service.aon': '@"corp.example/schemas/common"\n' +
                    'spec: {name: string, port: *8080 | integer}\n',
            });
            vendor(d, 'corp.example/schemas/common', {
                'pkg.aon': 'pkg: {path: "corp.example/schemas/common",' +
                    ' version: "1.0.0", main: "common.aon"}\n',
                'common.aon': 'naming: {id: string}\n',
            });
        });
        Fs.writeFileSync(Path.join(dir, 'main.aon'), 'lib: hide(@"corp.example/schemas/service")\n' +
            'svc: $.lib.spec & {name: "checkout"}\n');
        const t = cli(['pkg', 'tidy', dir]);
        Assert.equal(t.code, 0, t.err + t.out);
        // NOT the hash of nil, which is what a module that does not
        // evaluate pins -- and the same string for every one of them.
        Assert.equal(t.out.includes(NIL_PIN), false, t.out);
        const r = cli([Path.join(dir, 'main.aon')]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(JSON.parse(r.out).svc.port, 8080);
    });
    (0, node_test_1.test)('tidy-refuses-to-pin-a-module-that-does-not-evaluate', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', {
            'pkg.aon': SERVICE['pkg.aon'],
            // Contradicts itself: no meaning, so nothing to pin.
            'service.aon': 'a: 1\na: 2\n',
        }));
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 4, r.out);
        Assert.ok(r.out.includes('verdict: error'), r.out);
        Assert.ok(r.out.includes('does not evaluate on its own'), r.out);
        // AND THE LOCKFILE IS LEFT ALONE. A refusal that wrote a lockfile
        // would be the defect with a louder message.
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'pkg-lock.aon')), false);
    });
    (0, node_test_1.test)('tidy-refuses-a-tree-the-allowlist-does-not-admit', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', {
            ...SERVICE, 'hook.sh': 'echo\n',
        }));
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 4, r.out);
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'error');
        Assert.deepEqual(report.forbidden, ['corp.example/schemas/service: hook.sh']);
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'pkg-lock.aon')), false);
        Assert.ok(cli(['pkg', 'tidy', dir]).out.includes('hook.sh: not admitted in a package'));
    });
    (0, node_test_1.test)('manifest-refuses-to-mint-a-pin-for-a-module-that-does-not-evaluate', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkg-'));
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app", version: "1.0.0"}\n');
        // Contradicts itself: no meaning, so nothing to pin.
        Fs.writeFileSync(Path.join(dir, 'main.aon'), 'a: 1\na: 2\n');
        const r = cli(['pkg', 'manifest', '--format', 'json', dir]);
        Assert.equal(r.code, 4, r.out);
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'error');
        Assert.equal(report.manifest, undefined);
    });
    (0, node_test_1.test)('the-pkg-verbs-take-the-trust-options', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkg-'));
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app", version: "1.0.0"}\n');
        Fs.writeFileSync(Path.join(Path.dirname(dir), 'pkgtool-outside.aon'), 'secret: "leaked"\n');
        Fs.writeFileSync(Path.join(dir, 'main.aon'), 'x: @"../pkgtool-outside.aon"\n');
        // Unconfined the include is read, so a pin is minted.
        const open = JSON.parse(cli(['pkg', 'manifest', '--format', 'json', dir]).out);
        Assert.equal(open.verdict, 'ok');
        Assert.match(open.manifest.modules[0].canon, /^aon1-/);
        // Confined it is denied, and a denied module has no meaning to pin.
        for (const flag of [['--trust', 'none'], ['--include-root', dir]]) {
            const shut = cli(['pkg', 'manifest', '--format', 'json', ...flag, dir]);
            Assert.equal(shut.code, 4, shut.out);
            Assert.equal(JSON.parse(shut.out).verdict, 'error');
        }
        // An option that is genuinely unknown is still refused.
        Assert.equal(cli(['pkg', 'tidy', '--nonsense', dir]).code, 2);
    });
    (0, node_test_1.test)('vendor-refuses-an-escaping-path', () => {
        const escaping = 'corp.example/../../../outside/pwned';
        const hash = (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE));
        const dir = project('');
        let r;
        withCache(dir, (cache) => {
            // The package sits in the cache under its pin, so the ONLY thing
            // standing between the lockfile and the copy is the path gate.
            const cachedir = (0, mod_1.cacheStoreDir)(cache, hash, 'corp.example/schemas/service');
            Fs.mkdirSync(cachedir, { recursive: true });
            Fs.writeFileSync(Path.join(cachedir, 'pkg.aon'), SERVICE['pkg.aon']);
            Fs.writeFileSync(Path.join(cachedir, 'service.aon'), MODULE);
            writeLock(dir, '{"lock":{"' + escaping + '":{"archive":"","canon":"' + hash +
                '","v":"1.0.0"}}}\n');
            r = cli(['pkg', 'vendor', dir]);
        });
        // Nothing outside the project, at any of the levels `..` reaches.
        for (const up of [
            Path.join(dir, '..', '..', 'outside'),
            Path.join(dir, '..', 'outside'),
            Path.join(dir, 'outside'),
        ]) {
            Assert.equal(Fs.existsSync(up), false, 'wrote outside the project: ' + up);
        }
        // And nothing inside it either: the package is not vendored at all.
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'vendor')), false, r.out);
        Assert.equal(r.code, 1, r.out);
        Assert.ok(r.out.includes(escaping + ': not fetched'), r.out);
    });
    (0, node_test_1.test)('verify-catches-a-tampered-store-and-changes-nothing', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        const lock = LOCK(dir);
        const clean = cli(['pkg', 'verify', dir]);
        Assert.equal(clean.code, 0, clean.out);
        Assert.ok(clean.out.includes(': verified'), clean.out);
        // Tamper, and ask again. BYTES BEFORE MEANING: the archive digest
        // moves before anything is evaluated, and that is the pin reported.
        const svc = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service', 'service.aon');
        const original = Fs.readFileSync(svc, 'utf8');
        Fs.writeFileSync(svc, original.replace('8080', '9090'));
        const bad = cli(['pkg', 'verify', '--format', 'json', dir]);
        Assert.equal(bad.code, 1, bad.out);
        const report = JSON.parse(bad.out);
        Assert.equal(report.verdict, 'mismatch');
        Assert.equal(report.mismatched[0].pin, 'archive');
        Assert.match(report.mismatched[0].got, /^sha256:/);
        Assert.ok(cli(['pkg', 'verify', dir]).out.includes('pinned archive sha256:'));
        // THE LOCKFILE IS UNTOUCHED, which is the whole difference from
        // tidy: a gate that rewrote what it was checking would pass every
        // time.
        Assert.equal(LOCK(dir), lock);
        // The same bytes with a different meaning is impossible, so the
        // canon pin is reached by editing the LOCK's archive to match.
        Fs.writeFileSync(svc, 'a: 1\na: 2\n');
        const arch = (0, pkg_1.archiveOf)(Path.dirname(svc)).digest;
        writeLock(dir, lock.replace(/"archive":"sha256:[0-9a-f]+"/, '"archive":"' + arch + '"'));
        const broken = cli(['pkg', 'verify', dir]);
        Assert.equal(broken.code, 1, broken.out);
        Assert.ok(broken.out.includes('it does not evaluate'), broken.out);
        Fs.writeFileSync(svc, original.replace('8080', '9090'));
        const arch2 = (0, pkg_1.archiveOf)(Path.dirname(svc)).digest;
        writeLock(dir, lock.replace(/"archive":"sha256:[0-9a-f]+"/, '"archive":"' + arch2 + '"'));
        const moved = cli(['pkg', 'verify', dir]);
        Assert.ok(moved.out.includes('but the store means aon1-'), moved.out);
    });
    (0, node_test_1.test)('oddly-shaped-lock-entries-and-kept-manifests', () => {
        // A lock entry that is not an object pins nothing.
        const dir = project('"corp.example/service": {v: "1.0.0"}', (d) => {
            vendor(d, 'corp.example/service', {
                'pkg.aon': 'pkg: {path: "corp.example/service", version: "1.0.0", main: "main.aon"}\n',
                'main.aon': 'x: 1\n',
            });
            Fs.writeFileSync(Path.join(d, 'main.aon'), 'a: @"corp.example/service"\n');
        });
        writeLock(dir, '{"lock":{"corp.example/service":1}}\n');
        Assert.equal(cli([Path.join(dir, 'main.aon')]).code, 0);
        // An alias whose package is empty names nothing.
        const alias = project('"alias:old": {pkg: "", v: "1.0.0"}', (d) => {
            Fs.writeFileSync(Path.join(d, 'main.aon'), 'a: @"alias:old"\n');
        });
        Assert.notEqual(cli([Path.join(alias, 'main.aon')]).code, 0);
        // A lock key that is not a package path is missing to verify and tree alike.
        const odd = project('"corp.example/service": {v: "1.0.0"}');
        const pins = '{"v":"1.0.0","canon":"aon1-' + 'A'.repeat(43) + '","archive":"sha256:' + 'a'.repeat(64) + '"}';
        writeLock(odd, '{"lock":{"corp.example/service":' + pins + ',"nodomain":' + pins + '}}\n');
        Assert.match(cli(['pkg', 'verify', odd]).out, /nodomain/);
        Assert.match(cli(['pkg', 'tree', odd]).out, /nodomain/);
        Assert.match(cli(['pkg', 'refreeze', odd]).out, /nodomain/);
    });
    (0, node_test_1.test)('verify-checks-a-kept-manifest-against-the-tree', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        const tree = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service');
        const a = (0, pkg_1.archiveOf)(tree);
        const manifest = JSON.stringify({
            schema: 'aontu-package/v1', package: 'corp.example/schemas/service',
            version: '1.4.2', publish: 'public',
            archive: { format: 'zip', digest: a.digest, size: a.size, files: a.files },
            modules: [], deps: {}, published: '2026-09-15T00:00:00Z',
        });
        Fs.mkdirSync(Path.join(tree, 'aontu_meta'));
        Fs.writeFileSync(Path.join(tree, 'aontu_meta', 'manifest.aon'), manifest);
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        const entry = (0, pkg_1.readLock)(dir)['corp.example/schemas/service'];
        Assert.equal(entry.manifest, (0, pkg_zip_1.sha256Hex)(new TextEncoder().encode(manifest)));
        Assert.equal(cli(['pkg', 'verify', dir]).code, 0);
        // A manifest swapped for one listing other digests is caught by its
        // own pin; a file the manifest does not list, by the file walk.
        Fs.writeFileSync(Path.join(tree, 'aontu_meta', 'manifest.aon'), manifest + ' ');
        let r = JSON.parse(cli(['pkg', 'verify', '--format', 'json', dir]).out);
        Assert.equal(r.mismatched[0].pin, 'manifest');
        Fs.writeFileSync(Path.join(tree, 'aontu_meta', 'manifest.aon'), manifest.replace(a.files[0].digest, 'sha256:' + '0'.repeat(64)));
        const lock = LOCK(dir);
        writeLock(dir, lock.replace(entry.manifest, (0, pkg_zip_1.sha256Hex)(new TextEncoder().encode(manifest.replace(a.files[0].digest, 'sha256:' + '0'.repeat(64))))));
        r = JSON.parse(cli(['pkg', 'verify', '--format', 'json', dir]).out);
        Assert.equal(r.mismatched[0].pin, 'manifest');
        Assert.match(r.mismatched[0].got, /^pkg.aon sha256:/);
        Assert.ok(cli(['pkg', 'verify', dir]).out.includes('pinned manifest'));
        // A manifest that is not even a document still has a digest to pin.
        Fs.writeFileSync(Path.join(tree, 'aontu_meta', 'manifest.aon'), 'not json');
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        Assert.match(LOCK(dir), /"manifest":"sha256:/);
        // A kept manifest that lists no files pins nothing the tree holds.
        Fs.writeFileSync(Path.join(tree, 'aontu_meta', 'manifest.aon'), '{"archive":{}}\n');
        Assert.equal(cli(['pkg', 'verify', dir]).code, 1);
    });
    (0, node_test_1.test)('verify-refuses-a-project-the-lockfile-does-not-cover', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        const bare = cli(['pkg', 'verify', dir]);
        Assert.equal(bare.code, 1, bare.out);
        Assert.ok(bare.out.includes('verdict: unlocked'), bare.out);
        Assert.ok(bare.out.includes('corp.example/schemas/service: not in the lockfile (run: aontu sync)'), bare.out);
        // Tidy writes it, and the same question now passes.
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        Assert.equal(cli(['pkg', 'verify', dir]).code, 0);
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\ndep: {' +
            '"corp.example/schemas/service": {v: "1.4.2"}, ' +
            '"corp.example/schemas/later": {v: "1.0.0"}}\n');
        const stale = cli(['pkg', 'verify', '--format', 'json', dir]);
        Assert.equal(stale.code, 1, stale.out);
        const report = JSON.parse(stale.out);
        Assert.equal(report.verdict, 'unlocked');
        Assert.deepEqual(report.unlocked, ['corp.example/schemas/later']);
        Assert.deepEqual(report.verified, ['corp.example/schemas/service']);
    });
    (0, node_test_1.test)('verify-reports-what-no-store-holds', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkg-'));
        writeLock(dir, '# pkg-lock.aon (generated by `aontu sync`; do not edit)\n' +
            '{"lock":{"corp.example/absent":{"archive":"","canon":"aon1-x","v":"1"},' +
            '"corp.example/hollow":{"archive":"","canon":"aon1-y","v":"1"},' +
            '"not-a-module":{"archive":"","canon":"aon1-z","v":"1"}}}\n');
        // hollow is vendored as a directory with a pkg.aon naming an entry
        // file that was never written.
        vendor(dir, 'corp.example/hollow', {
            'pkg.aon': 'pkg: {path: "corp.example/hollow", main: "hollow.aon"}\n',
        });
        const r = cli(['pkg', 'verify', '--format', 'json', dir]);
        Assert.equal(r.code, 1, r.out);
        const report = JSON.parse(r.out);
        Assert.equal(report.verdict, 'missing');
        Assert.deepEqual(report.mismatched, []);
        Assert.deepEqual(report.missing, [
            'corp.example/absent', 'corp.example/hollow', 'not-a-module'
        ]);
        // And in text, where the line names the repair -- here a fetch,
        // because the package itself is what is absent.
        const text = cli(['pkg', 'verify', dir]);
        Assert.equal(text.code, 1, text.out);
        Assert.ok(text.out.includes('verdict: missing'), text.out);
        Assert.ok(text.out.includes('corp.example/absent: not fetched (run: aontu sync)'), text.out);
    });
    (0, node_test_1.test)('tidy-writes-the-lockfile-in-canonical-form', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.ok(r.out.includes('verdict: ok'));
        Assert.ok(r.out.includes('corp.example/schemas/service 1.4.2 aon1-'), r.out);
        const lock = LOCK(dir);
        // A HEADER the file's own reader skips, then ONE canonical line —
        // sorted keys, no spaces — which is also the JSON the resolver
        // reads a pin back from. The archive and the meaning are pinned, and
        // no manifest, because nothing served this tree.
        Assert.ok(lock.startsWith('# pkg-lock.aon (generated by'));
        const line = lock.split('\n')[1];
        const tree = Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service');
        Assert.equal(line, '{"lock":{"corp.example/schemas/service":{"archive":"' +
            (0, pkg_1.archiveOf)(tree).digest + '","canon":"' +
            (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)) + '","v":"1.4.2"}}}');
        Assert.deepEqual(Object.keys(JSON.parse(line).lock), ['corp.example/schemas/service']);
    });
    (0, node_test_1.test)('tidy-selects-the-maximum-of-the-minima', () => {
        const dir = project('"corp.example/s": {v: "1.2.0"}, "corp.example/geo": {v: "1.2.0"}', (d) => {
            vendor(d, 'corp.example/s', {
                'pkg.aon': 'pkg: {path: "corp.example/s"}\n' +
                    'dep: {"corp.example/geo": {v: "1.10.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/geo', {
                'pkg.aon': 'pkg: {path: "corp.example/geo"}\n',
                'main.aon': 'region: string\n',
            });
        });
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.ok(r.out.includes('corp.example/geo 1.10.0 aon1-'), r.out);
    });
    (0, node_test_1.test)('version-order-is-numeric', () => {
        Assert.equal((0, pkg_1.versionCompare)('1.10.0', '1.9.0'), 1);
        // A part the shorter version does not have is ZERO.
        Assert.equal((0, pkg_1.versionCompare)('1.2', '1.2.0'), 0);
        Assert.equal((0, pkg_1.versionCompare)('1.2.0', '1.2.0'), 0);
        // A part that is not a number sorts as text, AFTER every number: a
        // pre-release tag is below no version and above none.
        Assert.equal((0, pkg_1.versionCompare)('1.2.0', '1.2.rc'), -1);
        Assert.equal((0, pkg_1.versionCompare)('1.2.rc', '1.2.0'), 1);
        Assert.equal((0, pkg_1.versionCompare)('1.2.rc', '1.2.beta'), 1);
        // Both directions of both rules: a comparison that answered only
        // one way round would still pass a single-sided test, and MVS reads
        // it from whichever side the frontier happens to hold.
        Assert.equal((0, pkg_1.versionCompare)('1.2.0', '1.2'), 0);
        Assert.equal((0, pkg_1.versionCompare)('1.2.beta', '1.2.rc'), -1);
    });
    (0, node_test_1.test)('a-lock-key-is-a-package-path-or-an-alias', () => {
        Assert.equal((0, pkg_1.usableKey)('corp.example/s'), true);
        Assert.equal((0, pkg_1.usableKey)('alias:legacy'), true);
        Assert.equal((0, pkg_1.usableKey)('corp.example/s#aon1-x'), false);
        Assert.equal((0, pkg_1.usableKey)('corp.example/../s'), false);
        Assert.equal((0, pkg_1.usableKey)('not-a-module'), false);
    });
    (0, node_test_1.test)('tidy-with-no-package-file-locks-nothing', () => {
        // A directory that declares nothing depends on nothing. The
        // lockfile is still written, and says so: an empty closure is a
        // resolved closure.
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkg-'));
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(r.out.trim(), 'verdict: ok');
        Assert.equal(LOCK(dir).split('\n')[1], '{"lock":{}}');
    });
    (0, node_test_1.test)('tidy-cannot-see-a-key-that-is-not-a-package-path', () => {
        // A dependency key the router would not call a module names nothing
        // any store can hold, so it is reported the same way a package that
        // is simply not there is — there is no third answer to give.
        const dir = project('"not-a-module": {v: "1.0.0"}');
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('not-a-module: not fetched'), r.out);
    });
    (0, node_test_1.test)('tidy-keeps-the-highest-bid-and-ignores-a-later-lower-one', () => {
        const dir = project('"corp.example/s": {v: "1.0.0"}, "corp.example/t": {v: "1.0.0"}, ' +
            '"corp.example/geo": {v: "2.0.0"}', (d) => {
            vendor(d, 'corp.example/s', {
                'pkg.aon': 'pkg: {path: "corp.example/s"}\n' +
                    'dep: {"corp.example/geo": {v: "1.5.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/t', {
                'pkg.aon': 'pkg: {path: "corp.example/t"}\n' +
                    'dep: {"corp.example/geo": {v: "1.1.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/geo', {
                'pkg.aon': 'pkg: {path: "corp.example/geo"}\n',
                'main.aon': 'region: string\n',
            });
        });
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        const geo = JSON.parse(r.out).lock
            .find((e) => 'corp.example/geo' === e.key);
        Assert.equal(geo.v, '2.0.0');
    });
    (0, node_test_1.test)('tidy-recomputes-every-pin-from-the-store', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => {
            vendor(d, 'corp.example/schemas/service', SERVICE);
            writeLock(d, '# pkg-lock.aon (generated by `aontu sync`; do not edit)\n' +
                '{"lock":{"corp.example/schemas/service":{"archive":"sha256:stale",' +
                '"canon":"aon1-stale","manifest":"sha256:gone","v":"1.0.0"}}}\n');
        });
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        const e = JSON.parse(r.out).lock[0];
        Assert.equal(e.canon, (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)));
        Assert.match(e.archive, /^sha256:[0-9a-f]{64}$/);
        // No manifest beside the tree, so none is pinned: a stale pin is
        // not carried forward into a claim about bytes nobody served.
        Assert.equal(e.manifest, undefined);
    });
    (0, node_test_1.test)('tidy-locks-an-alias-with-the-package-it-names', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}, ' +
            '"alias:legacy": {pkg: "corp.example/schemas/service", v: "1.2.0"}', (d) => {
            vendor(d, 'corp.example/schemas/service', SERVICE);
            vendor(d, 'alias/legacy', {
                'pkg.aon': SERVICE['pkg.aon'],
                'service.aon': 'name: string\nport: *9090 | integer\n',
            });
        });
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err + r.out);
        const legacy = JSON.parse(r.out).lock.find((e) => 'alias:legacy' === e.key);
        Assert.equal(legacy.pkg, 'corp.example/schemas/service');
        Assert.equal(legacy.v, '1.2.0');
        Assert.match(LOCK(dir), /"alias:legacy":\{"archive":"sha256:[0-9a-f]+","canon":"aon1-[^"]+","pkg":"corp.example\/schemas\/service","v":"1.2.0"\}/);
        Assert.equal(cli(['pkg', 'verify', dir]).code, 0);
        // An alias that names no package is a key nothing can be found for.
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\ndep: {"alias:nowhere": {v: "1.0.0"}}\n');
        const miss = cli(['pkg', 'tidy', dir]);
        Assert.equal(miss.code, 1);
        Assert.ok(miss.out.includes('alias:nowhere: not fetched'), miss.out);
    });
    (0, node_test_1.test)('tidy-pins-nothing-for-a-module-whose-entry-is-missing', () => {
        // A package file naming an entry that is not there has no meaning to
        // hash. The empty pin is the honest answer: the package resolved,
        // and nothing about its meaning was verifiable.
        const dir = project('"corp.example/s": {v: "1.0.0"}', (d) => vendor(d, 'corp.example/s', {
            'pkg.aon': 'pkg: {path: "corp.example/s", main: "gone.aon"}\n',
        }));
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.err);
        Assert.equal(JSON.parse(r.out).lock[0].canon, '');
    });
    (0, node_test_1.test)('an-unreadable-lockfile-locks-nothing', () => {
        for (const text of [
            'this is not the canonical line\n',
            '{"other":{}}\n',
            '{"lock":{"corp.example/s":{"canon":1,"archive":2,"v":3}}}\n',
        ]) {
            const dir = project('');
            writeLock(dir, text);
            const r = cli(['pkg', 'vendor', dir]);
            Assert.equal(r.out.trim().split('\n')[0], 'verdict: ' +
                (text.startsWith('{"lock"') ? 'missing' : 'ok'), r.out);
        }
    });
    (0, node_test_1.test)('vendor-reports-a-package-path-no-store-holds', () => {
        // Distinct from the key that is not a package path at all: this one
        // routes, and there is simply nothing behind it.
        const dir = project('');
        writeLock(dir, '{"lock":{"corp.example/absent":{"archive":"","canon":"aon1-x","v":"1"}}}\n');
        const r = cli(['pkg', 'vendor', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('corp.example/absent: not fetched'), r.out);
    });
    (0, node_test_1.test)('vendor-copies-the-whole-source-tree-from-the-cache', () => {
        // A package is a TREE, not an entry file, so nested directories come
        // across too -- from the CACHE, keyed by the hash the lockfile pins
        // and the package path: that is what content-addressed means, and
        // it is why `vendor` needs a lockfile while `tidy` needs a store.
        const dir = project('');
        const hash = (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE));
        withCache(dir, (cache) => {
            const store = (0, mod_1.cacheStoreDir)(cache, hash, 'corp.example/schemas/service');
            Fs.mkdirSync(Path.join(store, 'part'), { recursive: true });
            Fs.writeFileSync(Path.join(store, 'pkg.aon'), SERVICE['pkg.aon']);
            Fs.writeFileSync(Path.join(store, 'service.aon'), MODULE);
            Fs.writeFileSync(Path.join(store, 'part', 'extra.aon'), 'extra: true\n');
            writeLock(dir, '# pkg-lock.aon (generated by `aontu sync`; do not edit)\n' +
                '{"lock":{"corp.example/schemas/service":{"archive":"","canon":"' + hash +
                '","v":"1.4.2"}}}\n');
            const r = cli(['pkg', 'vendor', dir]);
            Assert.equal(r.code, 0, r.err + r.out);
            Assert.equal(Fs.readFileSync(Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service', 'part', 'extra.aon'), 'utf8'), 'extra: true\n');
            // Already vendored: left alone rather than copied onto itself.
            Assert.equal(cli(['pkg', 'vendor', dir]).code, 0);
        });
    });
    (0, node_test_1.test)('tidy-refuses-to-lock-what-it-cannot-see', () => {
        // A lockfile naming a package nobody has is a lie, so no lockfile is
        // written at all — and the message names the step that would fix it.
        const dir = project('"corp.example/absent": {v: "1.0.0"}');
        const r = cli(['pkg', 'tidy', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('corp.example/absent: not fetched (run: aontu sync)'), r.out);
        Assert.equal(Fs.existsSync(Path.join(dir, 'aontu_meta', 'pkg-lock.aon')), false);
    });
    (0, node_test_1.test)('vendor-reports-what-no-store-has', () => {
        const dir = project('');
        writeLock(dir, '{"lock":{"nope.example/x":{"archive":"","canon":"x","v":"1"},' +
            '"not-a-module":{"archive":"","canon":"y","v":"1"}}}\n');
        const r = cli(['pkg', 'vendor', dir]);
        Assert.equal(r.code, 1);
        Assert.ok(r.out.includes('nope.example/x: not fetched'), r.out);
        Assert.ok(r.out.includes('not-a-module: not fetched'), r.out);
    });
    (0, node_test_1.test)('pkg-arguments', () => {
        Assert.equal(cli(['pkg', '--help']).code, 0);
        Assert.ok(cli(['pkg']).err.includes('pkg needs one of tidy, verify'));
        Assert.ok(cli(['pkg', 'nope']).err.includes('pkg needs one of'));
        Assert.ok(cli(['pkg', 'tidy', 'a', 'b']).err.includes('pkg needs one of'));
        Assert.ok(cli(['pkg', '--format', 'yaml', 'tidy']).err
            .includes('text or json'));
        Assert.ok(cli(['pkg', '--nope', 'tidy']).err.includes('unknown pkg option'));
        Assert.ok(cli(['pkg', 'tidy', '--to']).err.includes('--to needs a value'));
        Assert.ok(cli(['pkg', 'tidy', '--base']).err.includes('--base needs a value'));
        Assert.equal(cli(['pkg', 'tidy', '--trust', 'everything', '.']).code, 2);
    });
    (0, node_test_1.test)('tidy-json-is-the-report', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        const r = cli(['pkg', 'tidy', '--format', 'json', dir]);
        const report = JSON.parse(r.out);
        Assert.equal(report.aontu.verb, 'pkg tidy');
        Assert.equal(report.verdict, 'ok');
        Assert.equal(report.lock[0].key, 'corp.example/schemas/service');
        Assert.deepEqual(report.missing, []);
    });
    (0, node_test_1.test)('refreeze-recomputes-canon-pins-and-nothing-else', () => {
        const dir = project('"corp.example/schemas/service": {v: "1.4.2"}', (d) => vendor(d, 'corp.example/schemas/service', SERVICE));
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        const lock = LOCK(dir);
        // Nothing moved: nothing written.
        const same = cli(['pkg', 'refreeze', dir]);
        Assert.equal(same.code, 0, same.out);
        Assert.ok(same.out.includes('corp.example/schemas/service: unchanged'), same.out);
        // A stale canon (as a canonical-form change would leave) is
        // re-pinned; the archive pin is untouched even when it is wrong,
        // because that is not this verb's question.
        writeLock(dir, lock.replace(/"canon":"aon1-[^"]+"/, '"canon":"aon1-stale"')
            .replace(/"archive":"sha256:[0-9a-f]+"/, '"archive":"sha256:keep"'));
        const r = cli(['pkg', 'refreeze', '--format', 'json', dir]);
        Assert.equal(r.code, 0, r.out);
        const report = JSON.parse(r.out);
        Assert.equal(report.repinned[0].from, 'aon1-stale');
        Assert.equal(report.repinned[0].to, (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)));
        Assert.match(LOCK(dir), /"archive":"sha256:keep"/);
        Assert.ok(cli(['pkg', 'refreeze', dir]).out.includes(': unchanged'));
        // What it cannot re-pin it names, and writes nothing.
        writeLock(dir, lock.replace('}}}', '},"corp.example/gone":{"archive":"","canon":"aon1-g","v":"1"}}}'));
        const miss = cli(['pkg', 'refreeze', dir]);
        Assert.equal(miss.code, 1, miss.out);
        Assert.ok(miss.out.includes('corp.example/gone: not fetched'), miss.out);
        Fs.writeFileSync(Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service', 'service.aon'), 'a: 1\na: 2\n');
        writeLock(dir, lock);
        const bad = cli(['pkg', 'refreeze', dir]);
        Assert.equal(bad.code, 4, bad.out);
        Assert.ok(bad.out.includes('does not evaluate on its own'), bad.out);
    });
    (0, node_test_1.test)('tree-draws-the-closure-from-the-store', () => {
        const dir = project('"corp.example/s": {v: "1.0.0"}, "corp.example/geo": {v: "1.0.0"}', (d) => {
            vendor(d, 'corp.example/s', {
                'pkg.aon': 'pkg: {path: "corp.example/s"}\n' +
                    'dep: {"corp.example/geo": {v: "1.0.0"}}\n',
                'main.aon': MODULE,
            });
            vendor(d, 'corp.example/geo', {
                'pkg.aon': 'pkg: {path: "corp.example/geo"}\n',
                'main.aon': 'region: string\n',
            });
        });
        Assert.equal(cli(['pkg', 'tidy', dir]).code, 0);
        const r = cli(['pkg', 'tree', dir]);
        Assert.equal(r.code, 0, r.out);
        Assert.equal(r.out, [
            'verdict: ok',
            'corp.example/app',
            '  corp.example/geo 1.0.0',
            '  corp.example/s 1.0.0',
            '    corp.example/geo 1.0.0 (above)',
            '',
        ].join('\n'));
        const j = JSON.parse(cli(['pkg', 'tree', '--format', 'json', dir]).out);
        Assert.equal(j.root, 'corp.example/app');
        Assert.equal(j.nodes.length, 3);
        // A locked package no store holds is drawn as a leaf and named.
        writeLock(dir, LOCK(dir).replace('}}}', '},"corp.example/gone":{"archive":"","canon":"aon1-g","v":"1"}}}'));
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'dep: {"corp.example/s": {v: "1.0.0"}, "corp.example/gone": {v: "1"}}\n');
        const miss = cli(['pkg', 'tree', dir]);
        Assert.equal(miss.code, 1, miss.out);
        Assert.ok(miss.out.startsWith('verdict: missing\n.\n'), miss.out);
        Assert.ok(miss.out.includes('  corp.example/gone 1\n'), miss.out);
        Assert.ok(miss.out.includes('corp.example/gone: not fetched'), miss.out);
        // A dependency declared and never locked at all is a leaf too.
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'dep: {"corp.example/never": {v: "1"}}\n');
        Assert.ok(cli(['pkg', 'tree', dir]).out.includes('corp.example/never (not locked)'));
    });
    (0, node_test_1.test)('the-network-subcommands-take-the-pkg-options', () => {
        const r = cli(['pkg', 'outdated', '--against', 'x', '.']);
        Assert.equal(r.code, 2);
        Assert.match(r.err, /--against is a manifest option/);
        Assert.equal(cli(['pkg', 'serve', '--listen']).code, 2);
    });
    // A package in its own right: it declares its path, its version and
    // its entry, which is what a publish needs and a dependency does not.
    function publishable(version, src, extra) {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkgpub-'));
        Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/schemas/service"' +
            ('' === version ? '' : ', version: "' + version + '"') +
            ', main: "service.aon"}\n' +
            'publish: public\n');
        if ('' !== src) {
            Fs.writeFileSync(Path.join(dir, 'service.aon'), src);
        }
        extra?.(dir);
        return dir;
    }
    const manifestOf = (dir, against) => {
        const args = ['pkg', 'manifest', '--format', 'json'];
        if (null != against) {
            args.push('--against', against);
        }
        const r = cli([...args, dir]);
        return { code: r.code, report: JSON.parse(r.out) };
    };
    (0, node_test_1.test)('manifest-is-what-a-publish-would-send', () => {
        const dir = publishable('1.1.0', MODULE, (d) => {
            Fs.writeFileSync(Path.join(d, 'pkg.aon'), Fs.readFileSync(Path.join(d, 'pkg.aon'), 'utf8') +
                'dep: {"corp.example/core": {v: "1.0.0"}}\nretract: ["1.0.9"]\n');
        });
        const { code, report } = manifestOf(dir);
        Assert.equal(code, 0);
        Assert.equal(report.verdict, 'ok');
        const m = report.manifest;
        Assert.equal(m.schema, 'aontu-package/v1');
        Assert.equal(m.package, 'corp.example/schemas/service');
        Assert.equal(m.version, '1.1.0');
        Assert.equal(m.publish, 'public');
        // The canon-hash is THE pin: the same string `sync` locks and
        // `aontu hash` prints, so "has the truth changed?" is one field
        // read and a string compare.
        Assert.deepEqual(m.modules, [{
                path: 'corp.example/schemas/service', main: 'service.aon',
                canon: (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE)),
            }]);
        Assert.equal(m.archive.format, 'zip');
        Assert.equal(m.archive.digest, (0, pkg_1.archiveOf)(dir).digest);
        Assert.deepEqual(m.archive.files.map((f) => f.path), ['pkg.aon', 'service.aon']);
        Assert.deepEqual(m.deps, { 'corp.example/core': { v: '1.0.0' } });
        Assert.deepEqual(m.retract, ['1.0.9']);
        Assert.equal(m.moved, undefined);
        Assert.equal(m.published, undefined);
    });
    (0, node_test_1.test)('the-archive-is-the-source-tree-without-the-vendor-copy', () => {
        const dir = publishable('1.1.0', MODULE, (d) => {
            Fs.mkdirSync(Path.join(d, 'part'));
            Fs.writeFileSync(Path.join(d, 'part', 'extra.aon'), 'extra: true\n');
            vendor(d, 'corp.example/other', { 'pkg.aon': 'pkg: {path: "x"}\n' });
        });
        Assert.deepEqual(manifestOf(dir).report.manifest.archive.files.map((f) => f.path), ['part/extra.aon', 'pkg.aon', 'service.aon']);
        // A tree carrying what the allowlist refuses mints nothing.
        Fs.writeFileSync(Path.join(dir, 'build.sh'), 'echo\n');
        const bad = manifestOf(dir);
        Assert.equal(bad.code, 4);
        Assert.deepEqual(bad.report.forbidden, ['build.sh']);
        Assert.ok(cli(['pkg', 'manifest', dir]).out.includes('build.sh: not admitted in a package'));
    });
    (0, node_test_1.test)('a-manifest-needs-a-version-and-an-entry', () => {
        const noVersion = manifestOf(publishable('', MODULE));
        Assert.equal(noVersion.code, 4);
        Assert.equal(noVersion.report.verdict, 'error');
        Assert.deepEqual(noVersion.report.missing, ['pkg.version']);
        const noEntry = manifestOf(publishable('1.0.0', ''));
        Assert.equal(noEntry.code, 4);
        Assert.deepEqual(noEntry.report.missing, ['service.aon']);
        Assert.ok(cli(['pkg', 'manifest', publishable('', '')]).out
            .includes('pkg.version: missing'));
    });
    (0, node_test_1.test)('the-gate-refuses-a-breaking-version', () => {
        const prior = publishable('1.0.0', MODULE);
        const next = publishable('1.1.0', MODULE + 'region: *"eu" | string\n');
        const { code, report } = manifestOf(next, prior);
        Assert.equal(code, 1);
        Assert.equal(report.verdict, 'breaking');
        Assert.equal(report.findings[0].path, '$.region');
        // And a compatible change passes the same gate.
        const widened = publishable('1.2.0', MODULE + 'owner?: string\n');
        const ok = manifestOf(widened, prior);
        Assert.equal(ok.code, 0);
        Assert.equal(ok.report.verdict, 'ok');
        Assert.deepEqual(ok.report.findings, []);
    });
    (0, node_test_1.test)('the-gate-checks-outcome-as-well-as-acceptance', () => {
        // ADR-022: `port: 8080` -> `port: integer` passes subsumption and
        // turns a working consumer build into an error.
        const prior = publishable('1.0.0', 'name: string\nport: 8080\n');
        const loosened = manifestOf(publishable('1.1.0', 'name: string\nport: integer\n'), prior);
        Assert.equal(loosened.code, 1);
        Assert.equal(loosened.report.verdict, 'breaking');
        Assert.deepEqual(loosened.report.findings.map((f) => [f.code, f.path]), [['compat_undetermined', '$.port']]);
        Assert.match(loosened.report.findings[0].message, /resolved to 8080 in the prior version/);
        Assert.equal(loosened.report.findings[0].expected, 'integer');
        Assert.equal(loosened.report.findings[0].actual, '8080');
        const moved = manifestOf(publishable('1.1.0', 'name: string\nport: *9090|8080\n'), prior);
        Assert.equal(moved.report.verdict, 'breaking');
        Assert.ok(moved.report.findings.some((f) => 'compat_outcome_changed' === f.code && '$.port' === f.path &&
            /resolves to 9090 now/.test(f.message)));
        const widened = manifestOf(publishable('1.1.0', 'name: string\nport: *8080|integer\n'), prior);
        Assert.equal(widened.report.verdict, 'ok');
        Assert.deepEqual(widened.report.findings, []);
        const nested = publishable('1.0.0', 'svc: { port: 8080, tags: ["a", "b"] }\nsecret: hide(1)\n');
        const gone = manifestOf(publishable('1.1.0', 'svc: top\nsecret: hide(1)\n'), nested);
        Assert.equal(gone.report.verdict, 'breaking');
        Assert.deepEqual(gone.report.findings.map((f) => [f.code, f.path]), [['compat_undetermined', '$.svc']]);
        const element = manifestOf(publishable('1.1.0', 'svc: { port: 8080, tags: ["a", string] }\nsecret: hide(1)\n'), nested);
        Assert.deepEqual(element.report.findings.map((f) => [f.code, f.path]), [['compat_undetermined', '$.svc.tags.1']]);
        Assert.equal(element.report.findings[0].sites.length, 2);
        const dropped = manifestOf(publishable('1.1.0', 'svc: { port: 8080, tags: ["a", "b"], extra?: 1 }\n' +
            'secret: hide(1)\nother?: 2\n'), publishable('1.0.0', 'svc: { port: 8080, tags: ["a", "b"] }\nsecret: hide(1)\nother?: 2\n'));
        Assert.equal(dropped.report.verdict, 'ok');
        const lost = manifestOf(publishable('1.1.0', 'svc: { tags: ["a", "b"] }\nsecret: hide(1)\n'), nested);
        const lostKey = lost.report.findings.find((f) => 'compat_undetermined' === f.code);
        Assert.equal(lostKey.path, '$.svc.port');
        Assert.equal(lostKey.sites.length, 1);
        Assert.equal(lostKey.expected, undefined);
        Assert.deepEqual((0, compat_1.compatOutcome)('a: 1 & 2\n', 'a: 1\n'), { verdict: 'error', findings: [] });
        Assert.equal((0, compat_1.compatOutcome)('a: *1|integer\n', 'a: **1|*2|integer\n').verdict, 'breaking');
        Assert.equal((0, compat_1.compatOutcome)('s: hide({ a: 2 })\n', 's: hide({ a: 1 })\n').verdict, 'ok');
        Assert.equal((0, compat_1.compatOutcome)('svc: top\n', 'svc: { h: hide({ a: 1 }), k: integer }\n').verdict, 'ok');
        Assert.equal((0, compat_1.compatOutcome)('a: *2|integer\n', 'a: *2|**1|integer\n').verdict, 'ok');
        Assert.equal((0, compat_1.compatOutcome)('a: 1|2\n', 'a: 1|2\n').verdict, 'ok');
        Assert.equal(manifestOf(publishable('1.1.0', 'a: 1\n'), publishable('1.0.0', 'a: 1 & 2\n')).report.verdict, 'error');
    });
    (0, node_test_1.test)('there-is-no-major-to-bump-past-the-gate', () => {
        // Under ADR-022 a breaking change needs a new NAME, chosen by the
        // publisher; a version number is not a promise the toolchain can
        // check, so a bigger one buys nothing at the gate.
        const prior = publishable('1.0.0', MODULE);
        const next = publishable('2.0.0', MODULE + 'region: string\n');
        const { code, report } = manifestOf(next, prior);
        Assert.equal(code, 1);
        Assert.equal(report.verdict, 'breaking');
    });
    (0, node_test_1.test)('a-prior-version-with-no-entry-cannot-be-gated-against', () => {
        const { code, report } = manifestOf(publishable('1.1.0', MODULE), publishable('1.0.0', ''));
        Assert.equal(code, 4);
        Assert.equal(report.verdict, 'error');
        Assert.deepEqual(report.missing, ['service.aon']);
    });
    (0, node_test_1.test)('the-gate-can-be-undecided', () => {
        const { code, report } = manifestOf(publishable('1.1.0', 'a: must(min(1), "m")\n'), publishable('1.0.0', 'a: min(1)\n'));
        Assert.equal(code, 3);
        Assert.equal(report.verdict, 'undecided');
    });
    (0, node_test_1.test)('a-package-file-that-declares-nothing-mints-nothing', () => {
        // A package file is ordinary Aontu, so it can say anything. What it
        // does not say about ITSELF leaves the manifest with nothing to
        // mint, which is the same answer as saying nothing at all.
        for (const src of ['1\n', 'dep: {}\n', 'pkg: 1\n', 'pkg: {moved: 1}\nretract: [1]\n']) {
            const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkgpub-'));
            Fs.writeFileSync(Path.join(dir, 'pkg.aon'), src);
            const { code, report } = manifestOf(dir);
            Assert.equal(code, 4, src);
            Assert.deepEqual(report.missing, ['main.aon', 'pkg.path', 'pkg.version']);
        }
        // And a directory with no package file at all, which says the same
        // thing by saying nothing.
        const bare = manifestOf(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-pkgpub-')));
        Assert.equal(bare.code, 4);
        Assert.deepEqual(bare.report.missing, ['main.aon', 'pkg.path', 'pkg.version']);
    });
    (0, node_test_1.test)('manifest-text-and-arguments', () => {
        const dir = publishable('1.1.0', MODULE, (d) => {
            Fs.writeFileSync(Path.join(d, 'pkg.aon'), Fs.readFileSync(Path.join(d, 'pkg.aon'), 'utf8') +
                'dep: {"alias:old": {pkg: "corp.example/core", v: "1.0.0"}}\n' +
                'moved: "corp.example/schemas/svc"\n');
        });
        const out = cli(['pkg', 'manifest', dir]).out;
        Assert.ok(out.includes('corp.example/schemas/service 1.1.0 public'), out);
        Assert.ok(out.includes('archive: sha256:'), out);
        Assert.ok(out.includes('module: corp.example/schemas/service service.aon aon1-'), out);
        Assert.ok(out.includes('dep: alias:old 1.0.0 (corp.example/core)'), out);
        Assert.ok(out.includes('moved: corp.example/schemas/svc'), out);
        Assert.ok(out.includes('file: service.aon sha256:'), out);
        const refused = cli(['pkg', 'manifest',
            '--against', publishable('1.0.0', MODULE),
            publishable('1.1.0', MODULE + 'region: *"eu" | string\n')]);
        Assert.equal(refused.code, 1);
        Assert.ok(refused.out.includes('verdict: breaking'), refused.out);
        Assert.ok(refused.out.includes('$.region: '), refused.out);
        // `--against` gates a manifest and means nothing to the others;
        // accepting it there would say it had been honoured.
        Assert.ok(cli(['pkg', 'tidy', '--against', 'x', '.']).err
            .includes('--against is a manifest option'));
        Assert.ok(cli(['pkg', 'manifest', '--against']).err
            .includes('--against needs a value'));
    });
    (0, node_test_1.test)('versions-compare-by-exact-digits', () => {
        Assert.equal((0, pkg_1.versionCompare)('1.9007199254740992.0', '1.9007199254740993.0'), -1);
        Assert.equal((0, pkg_1.versionCompare)('1.9007199254740993.0', '1.9007199254740992.0'), 1);
        Assert.equal((0, pkg_1.versionCompare)('1.01.0', '1.1.0'), 0);
        Assert.equal((0, pkg_1.versionCompare)('1.0.0', '1.0.0-rc'), -1);
        Assert.equal((0, pkg_1.versionCompare)('1.0.10', '1.0.9'), 1);
    });
    (0, node_test_1.test)('a-key-with-a-known-extension-names-a-file-not-a-package', () => {
        Assert.equal((0, pkg_1.usableKey)('corp.example/models/config.json'), false);
        Assert.equal((0, pkg_1.usableKey)('corp.example/models/types.aon'), false);
        Assert.equal((0, pkg_1.usableKey)('corp.example/models/v1.2'), true);
        Assert.equal((0, pkg_1.usableKey)('alias:legacy'), true);
        Assert.equal((0, pkg_1.usableKey)('corp.example/models/config.json@1'), false);
    });
    (0, node_test_1.test)('entry-paths-refuse-reserved-names-and-deep-nesting', () => {
        Assert.equal((0, pkg_1.relPathError)('con.aon'), 'an entry path element is a name a platform reserves');
        Assert.equal((0, pkg_1.relPathError)('a/NUL.json'), 'an entry path element is a name a platform reserves');
        Assert.equal((0, pkg_1.relPathError)('a/lpt1'), 'an entry path element is a name a platform reserves');
        Assert.equal((0, pkg_1.relPathError)('a/con2.aon'), undefined);
        Assert.equal((0, pkg_1.relPathError)('a/'.repeat(32) + 'x.aon'), 'an entry path has more than 32 elements');
        Assert.equal((0, pkg_1.relPathError)('a/'.repeat(31) + 'x.aon'), undefined);
    });
    (0, node_test_1.test)('a-publisher-refuses-what-every-consumer-would', () => {
        const saved = { ...pkg_1.ARCHIVE_LIMITS };
        try {
            const archive = {
                zip: new Uint8Array(0), digest: 'sha256:' + '0'.repeat(64), size: 10, forbidden: [],
                files: [{ path: 'a.aon', digest: 'sha256:' + '1'.repeat(64), size: 6 },
                    { path: 'b.aon', digest: 'sha256:' + '2'.repeat(64), size: 4 }],
            };
            Assert.deepEqual((0, pkg_1.archiveOverCaps)(archive), []);
            Object.assign(pkg_1.ARCHIVE_LIMITS, { bytes: 5, files: 1, fileBytes: 5, unpacked: 8 });
            Assert.deepEqual((0, pkg_1.archiveOverCaps)(archive), [
                'archive: 10 bytes, over the cap of 5',
                'archive: 2 files, over the cap of 1',
                'a.aon: 6 bytes, over the cap of 5',
                'archive: unpacks to 10 bytes, over the cap of 8',
            ]);
            const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-caps-'));
            Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/x", version: "1.0.0", main: "main.aon"}\n');
            Fs.writeFileSync(Path.join(dir, 'main.aon'), MODULE);
            const options = { eval: (src, path) => {
                    const a0 = new aontu_1.Aontu();
                    const val = a0.unify(src, { path });
                    return { gen: val.gen(), hash: (0, aontu_1.canonHash)(val), canon: val.canon, ok: true !== val.isNil };
                } };
            const over = (0, pkg_1.pkgManifest)(dir, options);
            Assert.equal(over.verdict, 'error');
            Assert.match(over.forbidden[0], /^archive: \d+ bytes, over the cap of 5$/);
            Object.assign(pkg_1.ARCHIVE_LIMITS, saved);
            Assert.equal((0, pkg_1.pkgManifest)(dir, options).verdict, 'ok');
            // Coordinates that are not a package path and a version, and an
            // entry that leaves the tree, mint nothing.
            Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "../../escape", version: "v1", main: "../main.aon"}\n');
            const odd = (0, pkg_1.pkgManifest)(dir, options);
            Assert.equal(odd.verdict, 'error');
            Assert.deepEqual(odd.missing, ['../main.aon', 'pkg.path (../../escape is not a package path)',
                'pkg.version (v1 is not MAJOR.MINOR.PATCH)']);
            Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "alias:x", version: "1.0.0", main: "main.aon"}\n');
            Assert.deepEqual((0, pkg_1.pkgManifest)(dir, options).missing, ['pkg.path (alias:x is not a package path)']);
        }
        finally {
            Object.assign(pkg_1.ARCHIVE_LIMITS, saved);
        }
    });
    (0, node_test_1.test)('the-store-is-found-under-the-served-canon-too', () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-store-'));
        const cache = Path.join(dir, 'cache');
        const pkg = 'corp.example/x';
        const served = 'aon1-' + 'S'.repeat(43);
        Assert.equal((0, pkg_1.downloadedCanon)(cache, pkg, '1.0.0'), undefined);
        Fs.mkdirSync((0, mod_1.cacheDownloadDir)(cache, pkg), { recursive: true });
        Fs.writeFileSync(Path.join((0, mod_1.cacheDownloadDir)(cache, pkg), '1.0.0.manifest'), '{not json');
        Assert.equal((0, pkg_1.downloadedCanon)(cache, pkg, '1.0.0'), undefined);
        Fs.writeFileSync(Path.join((0, mod_1.cacheDownloadDir)(cache, pkg), '1.0.0.manifest'), '{"modules":[]}');
        Assert.equal((0, pkg_1.downloadedCanon)(cache, pkg, '1.0.0'), undefined);
        Fs.writeFileSync(Path.join((0, mod_1.cacheDownloadDir)(cache, pkg), '1.0.0.manifest'), JSON.stringify({ modules: [{ canon: served }] }));
        Assert.equal((0, pkg_1.downloadedCanon)(cache, pkg, '1.0.0'), served);
        const at = (0, mod_1.cacheStoreDir)(cache, served, pkg);
        Fs.mkdirSync(at, { recursive: true });
        Fs.writeFileSync(Path.join(at, 'pkg.aon'), 'pkg: {path: "corp.example/x"}\n');
        const options = { cache };
        // The consumer's own pin differs from the served one, and the
        // tree is still found; without the version, only the pin is tried.
        Assert.equal((0, pkg_1.storeDir)(dir, pkg, 'aon1-' + 'C'.repeat(43), pkg, options, '1.0.0'), at);
        Assert.equal((0, pkg_1.storeDir)(dir, pkg, 'aon1-' + 'C'.repeat(43), pkg, options), undefined);
        Assert.equal((0, pkg_1.storeDir)(dir, pkg, served, pkg, options, '1.0.0'), at);
        Assert.equal((0, pkg_1.storeDir)(dir, pkg, '', pkg, options, '1.0.0'), at);
        Assert.equal((0, pkg_1.storeDir)(dir, pkg, '', pkg, { cache: undefined }, '1.0.0'), undefined);
        // A vendor copy replaces the destination rather than overlaying it.
        const to = Path.join(dir, 'vendor', 'x');
        Fs.mkdirSync(to, { recursive: true });
        Fs.writeFileSync(Path.join(to, 'stale.aon'), 'stale: 1\n');
        (0, pkg_1.vendorCopy)(at, to);
        Assert.ok(Fs.existsSync(Path.join(to, 'pkg.aon')));
        Assert.ok(!Fs.existsSync(Path.join(to, 'stale.aon')));
    });
});
//# sourceMappingURL=pkg.test.js.map