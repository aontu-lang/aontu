"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODULE_REFUSAL_CODES = exports.MODULE_MAX_DEPTH = exports.MODULE_MAX_ELEMS = exports.MODULE_MAX_PATH = void 0;
exports.parseModuleRef = parseModuleRef;
exports.validateModulePath = validateModulePath;
exports.moduleDir = moduleDir;
exports.projectRoots = projectRoots;
exports.lockJson = lockJson;
exports.modCacheDir = modCacheDir;
exports.modCacheDirFor = modCacheDirFor;
exports.lockHash = lockHash;
exports.resolveModule = resolveModule;
// MODULE IDENTITY AND LOCAL RESOLUTION (G6 phase 2,
// docs/capability-review/g6-distribution.md).
//
// An import is still just `@"…"`; the string's SHAPE routes it, so the
// grammar is untouched and every existing include keeps its exact
// behaviour:
//
//   service: @"corp.example/schemas/service@1"
//   frozen:  @"corp.example/schemas/service@1#aon1-4vJemVYtWFR2mQeN…"
//   local:   @"./fragment.aon"        <- unchanged, not a module
//
// EVALUATION NEVER TOUCHES THE NETWORK. Resolution reads local stores
// only: `aontu_meta/vendor/` beside the project's `mod.aon`, then a
// content-addressed user cache keyed by canon-hash. Fetching is a
// separate, explicit tool step, and a module that is in neither store
// is an evaluation error that says so.
//
// TWO PINS, TWO ROLES. The lockfile's `oci` digest certifies that these
// are the bytes the registry served; the `canon` hash certifies that
// this is the MEANING that was reviewed. Only the second can be checked
// locally without the registry, and it is the one this file checks: the
// module is unified standalone and its canon-hash compared with the
// pin. An inline `#aon1-…` fragment is the same check without a
// lockfile — the degenerate mode for single-file and agent-sandbox use.
const node_path_1 = require("node:path");
// A module path is DOMAIN-SHAPED — the first segment carries a dot,
// which is what tells it apart from `./local.aon`, `pkg-name` and every
// other spelling already in use — and carries the major version in the
// path, CUE/Go-style, so two majors are two modules.
//
// The pattern is deliberately narrow: anything it does not match falls
// through to the existing resolver chain unchanged, so no document that
// worked before this phase can be routed somewhere new by it.
const MODULE_RE = /^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[A-Za-z0-9._-]+)*)@(\d+)(?:#(aon1-[A-Za-z0-9_-]+))?$/;
function parseModuleRef(spec) {
    const m = MODULE_RE.exec(spec);
    if (null == m) {
        return undefined;
    }
    return {
        path: m[1],
        major: +m[2],
        ...(null == m[3] ? {} : { hash: m[3] }),
    };
}
// SHAPE IS NOT VALIDITY, and the gap between them was a hole. MODULE_RE
// answers "does this string route to the module resolver" -- a
// ROUTING predicate, and it must stay one, because anything it rejects
// falls through to the file leg and a stricter pattern would silently
// re-route documents that work today. But its element class
// `[A-Za-z0-9._-]` admits `..`, and `moduleDir` joins elements with
// pathJoin, which CLEANS `..` rather than refusing it:
//
//   moduleDir('/store/aontu_meta/vendor', 'corp.example/../../etc/passwd@1')
//     -> /store/etc/passwd@1
//
// `mod vendor` then copied a tree THERE, outside the project entirely,
// and reported `verdict: ok`. So validity is a separate question asked
// separately, after the shape matched, and asked at every site that
// turns a module path into a directory.
//
// The rules are Go's (golang.org/x/mod/module.CheckPath), for the
// reason Go has them: a module path becomes a real directory on every
// platform the toolchain runs on, so it must be a legal one everywhere.
exports.MODULE_MAX_PATH = 512;
exports.MODULE_MAX_ELEMS = 32;
// Windows refuses these as file names whatever the extension, so a
// module path containing one cannot be materialised there at all. The
// check is on the element up to its first dot, which is where Windows
// stops looking too.
const RESERVED_ELEMS = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);
// Why a module path may not be used as a directory, or undefined when
// it may. The reason is user-facing: it goes in the refusal, because a
// path refused without saying which rule it broke is a puzzle.
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
        // This one rule kills `.` and `..` -- the traversal -- along with
        // `.hidden` and `trailing.`, exactly as Go's does. Stating it as
        // the rule rather than as "no `..`" is deliberate: a check that
        // named the two dangerous spellings would miss the next one.
        if (elem.startsWith('.') || elem.endsWith('.')) {
            return 'an element begins or ends with "."';
        }
        if (RESERVED_ELEMS.has(elem.split('.')[0].toLowerCase())) {
            return 'an element is a reserved device name';
        }
    }
    return undefined;
}
// An element as it is spelled ON DISK. Uppercase is escaped to
// `!`+lowercase, Go's rule (go.dev/ref/mod, module proxy protocol) and
// for Go's reason: `github.com/Alice/Widgets` and
// `github.com/alice/widgets` are two module identities and, on macOS
// and Windows, ONE directory -- so without this the second module
// fetched silently clobbers the first, and an unpinned import resolves
// to whichever won.
//
// The WRITTEN path stays the identity; only the directory is escaped.
function escapeElem(elem) {
    return elem.replace(/[A-Z]/g, (c) => '!' + c.toLowerCase());
}
// The directory a module's files live in, under a store root.
//
// Callers must have validated the path (validateModulePath); this
// function cannot refuse, because it answers a location rather than a
// question, and every caller has a refusal shape of its own.
function moduleDir(store, ref) {
    return (0, node_path_1.join)(store, ...ref.path.split('/').map(escapeElem)) + '@' + ref.major;
}
// EVERY project root at or above `from`, innermost first — a project
// root being a directory holding a `mod.aon`. This used to answer with
// the NEAREST one alone, and the plural is the fix, because a
// VENDORED MODULE IS A PROJECT INSIDE A PROJECT. A module in
// `aontu_meta/vendor/` carries its own `mod.aon`, which stopped the upward
// walk there, so a nested import resolved against the vendored
// module's own directory: a tree with no `aontu_meta/vendor/` of its own, and
// therefore a `module not fetched` for a dependency sitting flat
// beside it in the CONSUMER's vendor tree — the only layout `mod
// vendor` produces (use-cases/BUGS.md §31).
//
// The consumer's stores are searched after the module's own, so a
// module that vendors its dependencies nested still wins for its own
// tree, and one that does not falls through to the consumer that
// vendored it. The last element is `from` itself when nothing above it
// declares a module, which is the single-file inline-pin mode.
function projectRoots(from, fs) {
    const roots = [];
    let dir = from;
    for (;;) {
        if (fs.existsSync((0, node_path_1.join)(dir, 'mod.aon'))) {
            roots.push(dir);
        }
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir) {
            return 0 < roots.length ? roots : [from];
        }
        dir = up;
    }
}
// The lockfile's pin for one import, or undefined.
//
// `mod-lock.aon` is machine-written CANONICAL Aontu, and canonical
// Aontu whose leaves are scalars IS JSON — which is why reading it here
// needs no evaluator, and why a hand-edited lockfile that is no longer
// canonical simply does not parse. It is generated; the file says so.
// The lockfile's JSON: its canonical line, with the generated-file
// header stripped. The file is AONTU, so it may carry `#` comments —
// and the header `aontu mod tidy` writes says not to edit it, which is
// worth more than the two lines it costs to skip. Everything below the
// comments is the canonical map, and canonical Aontu whose leaves are
// scalars is JSON.
function lockJson(text) {
    return text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');
}
// The user cache: `$XDG_CACHE_HOME/aontu/mod` unless the host names
// another, else the platform's own cache location. A host with nowhere
// to put one has no cache, which is a miss rather than a failure. One
// rule, in one place: the resolver reads this cache during evaluation
// and `aontu mod` writes into it, and two spellings of "where the cache
// is" is one bug.
function modCacheDir() {
    return modCacheDirFor(process.platform, process.env);
}
// That rule with the platform and the environment PASSED IN, so the
// Windows arm can be exercised off Windows — the only way a rule about
// a platform nobody here runs gets tested at all. The Go port splits
// the same way (modCacheDirFor, go/aontu.go).
//
// THE ORDER IS EXPLICIT BEFORE IMPLICIT, and LOCALAPPDATA is LAST.
// XDG_CACHE_HOME is the override and wins everywhere, Windows included:
// a caller who names a cache directory means it. HOME comes next and is
// also honoured on Windows, where it is not standard but IS set by Git
// Bash and by most development shells — a user who has one expects
// their tools to agree about where home is.
//
// LOCALAPPDATA is the PLATFORM DEFAULT beneath both, which is the whole
// addition: Windows sets neither XDG_CACHE_HOME nor HOME by default —
// it supplies USERPROFILE and LOCALAPPDATA, and LOCALAPPDATA is what a
// cache directory means there — so a rule that knew only the first two
// left every Windows user with NO cache. Putting it ABOVE HOME was the
// first attempt and was wrong: it made an explicitly set HOME
// unreachable on Windows, which broke the existing fallback test the
// moment CI ran it. A platform default that overrides what the
// environment was told is not a default.
function modCacheDirFor(platform, env) {
    const xdg = env.XDG_CACHE_HOME;
    if ('string' === typeof xdg && '' !== xdg) {
        return (0, node_path_1.join)(xdg, 'aontu', 'mod');
    }
    const home = env.HOME;
    if ('string' === typeof home && '' !== home) {
        return (0, node_path_1.join)(home, '.cache', 'aontu', 'mod');
    }
    if ('win32' === platform) {
        const local = env.LOCALAPPDATA;
        if ('string' === typeof local && '' !== local) {
            return (0, node_path_1.join)(local, 'aontu', 'mod');
        }
    }
    return undefined;
}
function lockHash(root, ref, fs) {
    const file = (0, node_path_1.join)(root, 'aontu_meta', 'mod-lock.aon');
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
    const entry = lock?.lock?.[ref.path + '@' + ref.major];
    return 'string' === typeof entry?.canon ? entry.canon : undefined;
}
// How deep module verification may nest before it is refused. A module
// is verified by EVALUATING it, and that evaluation resolves the
// module's own imports -- so a vendor tree that leads back to itself
// (a symlink is enough) would recurse until the host's stack gave out,
// and a verdict that depends on the host's stack size is exactly what
// the determinism clause forbids (docs/trust.md, and the same argument
// unify_cycle rests on). Sixteen is far above any real vendor nesting.
exports.MODULE_MAX_DEPTH = 16;
// EVERY code `resolveModule` can refuse with. The list lives HERE,
// beside the refusals themselves, because the parse layer has to
// recognise them to turn the throw into a parse-stage nil
// (ts/src/lang.ts) -- and when that list was written out longhand
// there, adding a fourth code left it unhandled and the refusal
// surfaced as `unexpected error` instead of the message it carries.
// The Go port has no such list (recordModErr takes any code), which is
// why only this side could drift.
exports.MODULE_REFUSAL_CODES = new Set([
    'module_path', 'module_missing', 'module_integrity', 'module_depth',
]);
// A refusal that carries its code to the parse layer, exactly as a
// denied include does (makeModelResolver's `deny`): the resolver
// THROWS, so a bare-member module import cannot vanish in the merge and
// leave a plausible, silently-partial document.
function refuse(code, message) {
    const err = new Error(message);
    err.code = code;
    throw err;
}
// Resolve one module import against the local stores.
function resolveModule(ref, fromDir, fs, options) {
    // THE PATH IS CHECKED BEFORE ANYTHING IS BUILT FROM IT. This is
    // first because it is a question about the REQUEST, not about the
    // state of the machine: a path that cannot legally be a directory is
    // refused identically whether or not the module is present, and
    // whether or not the depth bound is near.
    const badpath = validateModulePath(ref.path);
    if (undefined !== badpath) {
        refuse('module_path', 'module path: ' + ref.path + '@' + ref.major + ' (' + badpath + ')');
    }
    if (exports.MODULE_MAX_DEPTH <= (options.depth ?? 0)) {
        refuse('module_depth', 'module depth: ' + ref.path + '@' + ref.major +
            ' (verification nested past ' + exports.MODULE_MAX_DEPTH + ')');
    }
    // EVERY enclosing project, innermost first (see projectRoots): a
    // vendored module is a project inside a project, and its nested
    // imports have to reach the tree the consumer vendored them into.
    const roots = projectRoots(fromDir, fs);
    // The PIN comes from the first lockfile that names this import. A
    // vendored module usually ships none, so that is the consumer's --
    // which is right: the consumer's lock is what its build is pinned to.
    const expect = ref.hash ??
        roots.map((r) => lockHash(r, ref, fs)).find((h) => null != h);
    const stores = roots.map((r) => moduleDir((0, node_path_1.join)(r, 'aontu_meta', 'vendor'), ref));
    if (null != options.cache && null != expect) {
        // Content-addressed: the cache is keyed by the hash, so a cache hit
        // is already the right MEANING before anything is read from it.
        stores.push((0, node_path_1.join)(options.cache, expect));
    }
    const dir = stores.find((d) => fs.existsSync((0, node_path_1.join)(d, 'mod.aon')));
    if (undefined === dir) {
        // The wording is the contract (docs/capability-review/
        // g6-distribution.md): it names the module AND the step that fixes
        // it, because an agent reading this error is the audience.
        refuse('module_missing', 'module not fetched: ' + ref.path + '@' + ref.major +
            ' (run: aontu mod get)');
    }
    // The module's own `mod.aon` names its entry file. Read with the
    // evaluator rather than a regexp: a module file is ordinary Aontu,
    // and the language reading its own metadata is the point.
    const main = moduleMain((0, node_path_1.join)(dir, 'mod.aon'), fs, options);
    const full = (0, node_path_1.join)(dir, main);
    if (!fs.existsSync(full)) {
        refuse('module_missing', 'module not fetched: ' + ref.path + '@' + ref.major +
            ' (run: aontu mod get)');
    }
    const src = fs.readFileSync(full, 'utf8');
    if (null != expect) {
        // VERIFICATION IS ALWAYS LOCAL. The registry's annotation is
        // advisory; what decides is the hash of the module as it is on this
        // machine, recomputed now.
        const got = options.eval(src, full).hash;
        if (got !== expect) {
            refuse('module_integrity', 'module integrity: ' + ref.path + '@' + ref.major +
                ' expected ' + expect + ' got ' + got);
        }
    }
    return { full, src };
}
// The `mod.main` a module file declares, or the default entry name.
// The module file is ORDINARY AONTU, read by the language itself — the
// toolchain dogfooding its own evaluator rather than pattern-matching
// its own syntax with a regexp.
function moduleMain(file, fs, options) {
    const gen = options.eval(fs.readFileSync(file, 'utf8'), file).gen;
    const main = gen?.mod?.main;
    return 'string' === typeof main && '' !== main ? main : DEFAULT_MAIN;
}
const DEFAULT_MAIN = 'main.aon';
//# sourceMappingURL=mod.js.map