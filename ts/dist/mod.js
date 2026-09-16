"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODULE_REFUSAL_CODES = exports.MODULE_MAX_DEPTH = exports.VENDOR_DIR = exports.META_DIR = exports.LOCK_FILE = exports.PKG_FILE = exports.MODULE_MAX_ELEMS = exports.MODULE_MAX_PATH = exports.ALIAS_PREFIX = void 0;
exports.parseModuleRef = parseModuleRef;
exports.isAlias = isAlias;
exports.validateModulePath = validateModulePath;
exports.localFileExt = localFileExt;
exports.escapeElem = escapeElem;
exports.moduleDir = moduleDir;
exports.projectRoots = projectRoots;
exports.lockJson = lockJson;
exports.modCacheDir = modCacheDir;
exports.modCacheDirFor = modCacheDirFor;
exports.cacheStoreDir = cacheStoreDir;
exports.cacheDownloadDir = cacheDownloadDir;
exports.cacheSeenDir = cacheSeenDir;
exports.lockEntry = lockEntry;
exports.refuseLocalFile = refuseLocalFile;
exports.resolveModule = resolveModule;
const node_path_1 = require("node:path");
// A package path is `<domain>/<path>` and carries no major (ADR-022).
const MODULE_RE = /^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[A-Za-z0-9._-]+)*)(?:#(aon1-[A-Za-z0-9_-]+))?$/;
const ALIAS_RE = /^(alias:[A-Za-z0-9._-]+)(?:#(aon1-[A-Za-z0-9_-]+))?$/;
exports.ALIAS_PREFIX = 'alias:';
function parseModuleRef(spec) {
    const m = MODULE_RE.exec(spec) ?? ALIAS_RE.exec(spec);
    if (null == m) {
        return undefined;
    }
    return {
        path: m[1],
        ...(null == m[2] ? {} : { hash: m[2] }),
    };
}
function isAlias(path) {
    return path.startsWith(exports.ALIAS_PREFIX);
}
exports.MODULE_MAX_PATH = 512;
exports.MODULE_MAX_ELEMS = 32;
const RESERVED_ELEMS = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);
function validateModulePath(path) {
    if (exports.MODULE_MAX_PATH < path.length) {
        return 'longer than ' + exports.MODULE_MAX_PATH + ' characters';
    }
    const elems = path.split('/');
    if (exports.MODULE_MAX_ELEMS < elems.length) {
        return 'more than ' + exports.MODULE_MAX_ELEMS + ' elements';
    }
    for (const elem of elems) {
        if ('' === elem) {
            return 'an element is empty';
        }
        if (elem.startsWith('.') || elem.endsWith('.')) {
            return 'an element begins or ends with "."';
        }
        if (RESERVED_ELEMS.has(elem.split('.')[0].toLowerCase())) {
            return 'an element is a reserved device name';
        }
    }
    return undefined;
}
// The final element of a routed path, when it carries an extension the
// include table knows, was meant as a file: the commonest mistake once
// the major left the name (ADR-022 part 4), so it gets its own message.
function localFileExt(path) {
    const last = path.split('/').pop();
    const m = /\.([^.]+)$/.exec(last);
    return null == m ? undefined : m[1].toLowerCase();
}
function escapeElem(elem) {
    return elem.replace(/[A-Z]/g, (c) => '!' + c.toLowerCase());
}
// The directory a key lives at under a store: one directory per
// element, uppercase escaped; an alias under `alias/<name>`, which no
// package path can spell because a domain carries a dot.
function moduleDir(store, path) {
    const elems = isAlias(path) ?
        ['alias', path.slice(exports.ALIAS_PREFIX.length)] : path.split('/');
    return (0, node_path_1.join)(store, ...elems.map(escapeElem));
}
exports.PKG_FILE = 'pkg.aon';
exports.LOCK_FILE = 'pkg-lock.aon';
exports.META_DIR = 'aontu_meta';
exports.VENDOR_DIR = 'vendor';
function projectRoots(from, fs) {
    const roots = [];
    let dir = from;
    for (;;) {
        if (fs.existsSync((0, node_path_1.join)(dir, exports.PKG_FILE))) {
            roots.push(dir);
        }
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir) {
            return 0 < roots.length ? roots : [from];
        }
        dir = up;
    }
}
function lockJson(text) {
    return text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');
}
function modCacheDir() {
    return modCacheDirFor(process.platform, process.env);
}
function modCacheDirFor(platform, env) {
    const xdg = env.XDG_CACHE_HOME;
    if ('string' === typeof xdg && '' !== xdg) {
        return (0, node_path_1.join)(xdg, 'aontu', 'pkg');
    }
    const home = env.HOME;
    if ('string' === typeof home && '' !== home) {
        return (0, node_path_1.join)(home, '.cache', 'aontu', 'pkg');
    }
    if ('win32' === platform) {
        const local = env.LOCALAPPDATA;
        if ('string' === typeof local && '' !== local) {
            return (0, node_path_1.join)(local, 'aontu', 'pkg');
        }
    }
    return undefined;
}
// The user cache's trees (ADR-039 part 2).
function cacheStoreDir(cache, hash, pkg) {
    return moduleDir((0, node_path_1.join)(cache, 'store', hash), pkg);
}
function cacheDownloadDir(cache, pkg) {
    return (0, node_path_1.join)(moduleDir((0, node_path_1.join)(cache, 'download'), pkg), '@v');
}
function cacheSeenDir(cache, pkg) {
    return moduleDir((0, node_path_1.join)(cache, 'seen'), pkg);
}
function lockEntry(root, key, fs) {
    const file = (0, node_path_1.join)(root, exports.META_DIR, exports.LOCK_FILE);
    if (!fs.existsSync(file)) {
        return undefined;
    }
    let lock;
    try {
        lock = JSON.parse(lockJson(fs.readFileSync(file, 'utf8')));
    }
    catch {
        return undefined;
    }
    const entry = lock?.lock?.[key];
    if (null == entry || 'object' !== typeof entry) {
        return undefined;
    }
    return {
        ...('string' === typeof entry.canon ? { canon: entry.canon } : {}),
        ...('string' === typeof entry.pkg ? { pkg: entry.pkg } : {}),
    };
}
exports.MODULE_MAX_DEPTH = 16;
exports.MODULE_REFUSAL_CODES = new Set([
    'module_path', 'module_missing', 'module_integrity', 'module_depth',
    'module_local', 'module_moved',
]);
function refuse(code, message) {
    const err = new Error(message);
    err.code = code;
    throw err;
}
function refuseLocalFile(path) {
    return refuse('module_local', 'local files need a ./ prefix: ' + path + ' (write @"./' + path + '")');
}
// Resolve one module import against the local stores.
function resolveModule(ref, fromDir, fs, options) {
    const alias = isAlias(ref.path);
    const badpath = alias ? undefined : validateModulePath(ref.path);
    if (undefined !== badpath) {
        refuse('module_path', 'module path: ' + ref.path + ' (' + badpath + ')');
    }
    if (exports.MODULE_MAX_DEPTH <= (options.depth ?? 0)) {
        refuse('module_depth', 'module depth: ' + ref.path +
            ' (verification nested past ' + exports.MODULE_MAX_DEPTH + ')');
    }
    // EVERY enclosing project, innermost first (see projectRoots): a
    // vendored package is a project inside a project, and its nested
    // imports have to reach the tree the consumer vendored them into.
    const roots = projectRoots(fromDir, fs);
    const locked = roots.map((r) => lockEntry(r, ref.path, fs))
        .find((e) => null != e);
    const expect = ref.hash ?? locked?.canon;
    // The store is keyed by hash AND package path; an alias names its
    // package in the lockfile, else in the package file that declares it.
    const pkg = alias ?
        (locked?.pkg ?? roots.map((r) => aliasTarget(r, ref.path, fs, options))
            .find((p) => null != p)) : ref.path;
    if (alias && null == pkg) {
        refuse('module_missing', 'alias not declared: ' + ref.path + ' (declare it under dep in ' +
            exports.PKG_FILE + ')');
    }
    const stores = roots.map((r) => moduleDir((0, node_path_1.join)(r, exports.META_DIR, exports.VENDOR_DIR), ref.path));
    if (null != options.cache && null != expect) {
        stores.push(cacheStoreDir(options.cache, expect, pkg));
    }
    const dir = stores.find((d) => fs.existsSync((0, node_path_1.join)(d, exports.PKG_FILE)));
    if (undefined === dir) {
        refuse('module_missing', 'module not fetched: ' + ref.path + ' (run: aontu sync)');
    }
    // The package's own file names its entry and says whether it moved.
    // Read with the evaluator rather than a regexp: a package file is
    // ordinary Aontu, and the language reading its own metadata is the
    // point.
    const self = packageSelf((0, node_path_1.join)(dir, exports.PKG_FILE), fs, options);
    if (null != self.moved) {
        refuse('module_moved', 'module moved: ' + ref.path + ' (now ' + self.moved +
            '; import that instead, nothing follows a move)');
    }
    const full = (0, node_path_1.join)(dir, self.main);
    if (!fs.existsSync(full)) {
        refuse('module_missing', 'module not fetched: ' + ref.path + ' (run: aontu sync)');
    }
    const src = fs.readFileSync(full, 'utf8');
    if (null != expect) {
        // VERIFICATION IS ALWAYS LOCAL. The repository's manifest is a
        // claim; what decides is the hash of the module as it is on this
        // machine, recomputed now.
        const got = options.eval(src, full).hash;
        if (got !== expect) {
            refuse('module_integrity', 'module integrity: ' + ref.path +
                ' expected ' + expect + ' got ' + got);
        }
    }
    return { full, src };
}
function packageSelf(file, fs, options) {
    const gen = options.eval(fs.readFileSync(file, 'utf8'), file).gen;
    const main = gen?.pkg?.main;
    const moved = gen?.moved;
    return {
        main: 'string' === typeof main && '' !== main ? main : DEFAULT_MAIN,
        ...('string' === typeof moved && '' !== moved ? { moved } : {}),
    };
}
function aliasTarget(root, key, fs, options) {
    const file = (0, node_path_1.join)(root, exports.PKG_FILE);
    if (!fs.existsSync(file)) {
        return undefined;
    }
    const gen = options.eval(fs.readFileSync(file, 'utf8'), file).gen;
    const pkg = gen?.dep?.[key]?.pkg;
    return 'string' === typeof pkg && '' !== pkg ? pkg : undefined;
}
const DEFAULT_MAIN = 'main.aon';
//# sourceMappingURL=mod.js.map