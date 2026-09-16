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
const mod_1 = require("../dist/mod");
const srcpath_1 = require("./srcpath");
const MODULE = 'name: string\nport: *8080 | integer\n';
// A consumer with one dependency, held in the vendor tree or in the
// content-addressed cache under (canon-hash, package path).
function world(store) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'aontu-mod-'));
    const cache = Path.join(dir, 'cache');
    const hash = (0, aontu_1.canonHash)(new aontu_1.Aontu().unify(MODULE));
    const moddir = 'vendor' === store
        ? Path.join(dir, 'aontu_meta', 'vendor', 'corp.example', 'schemas', 'service')
        : (0, mod_1.cacheStoreDir)(cache, hash, 'corp.example/schemas/service');
    Fs.mkdirSync(moddir, { recursive: true });
    Fs.writeFileSync(Path.join(moddir, 'pkg.aon'), 'pkg: {path: "corp.example/schemas/service", main: "service.aon"}\n');
    Fs.writeFileSync(Path.join(moddir, 'service.aon'), MODULE);
    Fs.writeFileSync(Path.join(dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\n');
    const main = Path.join(dir, 'main.aon');
    Fs.writeFileSync(main, 'svc: @"corp.example/schemas/service#' + hash + '"\nsvc: name: "auth"\n');
    return { dir, main, hash, cache };
}
(0, node_test_1.describe)('mod', () => {
    (0, node_test_1.test)('an-empty-path-element-is-refused', () => {
        Assert.equal((0, mod_1.validateModulePath)('corp.example//x'), 'an element is empty');
        Assert.equal((0, mod_1.validateModulePath)(''), 'an element is empty');
        // And the rules the shared rows DO drive, asserted here as the
        // function contract rather than as engine behaviour.
        Assert.equal((0, mod_1.validateModulePath)('corp.example/x'), undefined);
        Assert.equal((0, mod_1.validateModulePath)('corp.example/../x'), 'an element begins or ends with "."');
        Assert.equal((0, mod_1.validateModulePath)('corp.example/nul'), 'an element is a reserved device name');
    });
    (0, node_test_1.test)('a-reference-self-describes', () => {
        // A package path, pinned or not; an alias; and nothing else routes.
        Assert.deepEqual((0, mod_1.parseModuleRef)('corp.example/schemas/service'), { path: 'corp.example/schemas/service' });
        Assert.deepEqual((0, mod_1.parseModuleRef)('corp.example/schemas/service#aon1-abc'), { path: 'corp.example/schemas/service', hash: 'aon1-abc' });
        Assert.deepEqual((0, mod_1.parseModuleRef)('alias:legacy'), { path: 'alias:legacy' });
        Assert.deepEqual((0, mod_1.parseModuleRef)('alias:legacy#aon1-abc'), { path: 'alias:legacy', hash: 'aon1-abc' });
        for (const local of ['./f.aon', '../g.json', '/abs/h.aon', 'local',
            'corp.example/x@1', 'Corp.Example/x', 'alias:', 'alias:a b']) {
            Assert.equal((0, mod_1.parseModuleRef)(local), undefined, local);
        }
    });
    (0, node_test_1.test)('the-store-directory-escapes-uppercase-and-files-an-alias', () => {
        Assert.equal((0, mod_1.moduleDir)('/s', 'corp.example/Widgets'), Path.join('/s', 'corp.example', '!widgets'));
        Assert.equal((0, mod_1.moduleDir)('/s', 'alias:legacy'), Path.join('/s', 'alias', 'legacy'));
        Assert.equal((0, mod_1.cacheStoreDir)('/c', 'aon1-x', 'corp.example/w'), Path.join('/c', 'store', 'aon1-x', 'corp.example', 'w'));
    });
    (0, node_test_1.test)('cache-is-content-addressed', () => {
        const w = world('cache');
        const a0 = new aontu_1.Aontu({ mod: { cache: w.cache } });
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
    });
    (0, node_test_1.test)('cache-is-not-consulted-under-a-root', () => {
        const w = world('cache');
        const a0 = new aontu_1.Aontu({
            mod: { cache: w.cache },
            trust: { include: { root: w.dir } },
        });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module not fetched:'));
    });
    (0, node_test_1.test)('cache-defaults-to-the-platform-location', () => {
        const w = world('cache');
        const xdg = Path.join(w.dir, 'xdg');
        Fs.mkdirSync(Path.join(xdg, 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(xdg, 'aontu', 'pkg'));
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
        // No XDG_CACHE_HOME: `~/.cache/aontu/pkg` is the platform default
        // this falls back to, and HOME is pointed at a temporary directory
        // for the same reason XDG was above.
        const w = world('cache');
        const home = Path.join(w.dir, 'home');
        Fs.mkdirSync(Path.join(home, '.cache', 'aontu'), { recursive: true });
        Fs.renameSync(w.cache, Path.join(home, '.cache', 'aontu', 'pkg'));
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
    (0, node_test_1.test)('cache-dir-rule', () => {
        const at = (...p) => Path.join(...p);
        // The explicit override wins on every platform.
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { XDG_CACHE_HOME: '/x', HOME: '/h' }), at('/x', 'aontu', 'pkg'));
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { XDG_CACHE_HOME: '/x', LOCALAPPDATA: 'C:/L' }), at('/x', 'aontu', 'pkg'));
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { LOCALAPPDATA: 'C:/L', HOME: '/h' }), at('/h', '.cache', 'aontu', 'pkg'));
        Assert.equal((0, mod_1.modCacheDirFor)('linux', { LOCALAPPDATA: 'C:/L', HOME: '/h' }), at('/h', '.cache', 'aontu', 'pkg'));
        // And LOCALAPPDATA is the platform default BENEATH both, which is
        // the whole addition: Windows sets neither of the two above by
        // default.
        Assert.equal((0, mod_1.modCacheDirFor)('win32', { LOCALAPPDATA: 'C:/L' }), at('C:/L', 'aontu', 'pkg'));
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
        const w = world('vendor');
        const a0 = new aontu_1.Aontu({ fs: Fs });
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
    });
    (0, node_test_1.test)('a-vendor-store-outside-the-root-is-denied', () => {
        const w = world('vendor');
        const sub = Path.join(w.dir, 'sub');
        Fs.mkdirSync(sub);
        const main = Path.join(sub, 'main.aon');
        Fs.copyFileSync(w.main, main);
        const a0 = new aontu_1.Aontu({ trust: { include: { root: sub } } });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(main) + '"'), (err) => String(err.message).includes('include denied:'));
    });
    (0, node_test_1.test)('verification-depth-is-bounded', () => {
        const w = world('vendor');
        const a0 = new aontu_1.Aontu({ mod: { depth: 16 } });
        Assert.throws(() => a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), (err) => String(err.message).includes('module depth:'));
    });
    (0, node_test_1.test)('an-alias-resolves-from-the-cache-by-the-package-it-names', () => {
        // The lock entry carries the alias's package, so the store lookup
        // has both halves of its key; without the lock, the package file's
        // own declaration supplies it.
        const w = world('cache');
        Fs.writeFileSync(Path.join(w.dir, 'pkg.aon'), 'pkg: {path: "corp.example/app"}\n' +
            'dep: {"alias:legacy": {pkg: "corp.example/schemas/service", v: "1.0.0"}}\n');
        Fs.writeFileSync(w.main, 'svc: @"alias:legacy#' + w.hash + '"\nsvc: name: "auth"\n');
        const a0 = new aontu_1.Aontu({ mod: { cache: w.cache } });
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
        // An alias the lockfile names resolves without a pin in the import.
        Fs.mkdirSync(Path.join(w.dir, 'aontu_meta'), { recursive: true });
        Fs.writeFileSync(Path.join(w.dir, 'aontu_meta', 'pkg-lock.aon'), '{"lock":{"alias:legacy":{"archive":"","canon":"' + w.hash +
            '","pkg":"corp.example/schemas/service","v":"1.0.0"}}}\n');
        Fs.writeFileSync(w.main, 'svc: @"alias:legacy"\nsvc: name: "auth"\n');
        Assert.deepEqual(a0.generate('x: @"' + (0, srcpath_1.srcPath)(w.main) + '"'), { x: { svc: { name: 'auth', port: 8080 } } });
    });
});
//# sourceMappingURL=mod.test.js.map