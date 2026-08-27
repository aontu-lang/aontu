"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODULE_ANNOTATION_MAJOR = exports.MODULE_ANNOTATION_CANON = exports.MODULE_CONFIG_MEDIA_TYPE = void 0;
exports.versionCompare = versionCompare;
exports.lockText = lockText;
exports.modTidy = modTidy;
exports.modVerify = modVerify;
exports.modVendor = modVendor;
exports.modManifest = modManifest;
// MODULE TOOLING (G6 phase 3, docs/capability-review/g6-distribution.md):
// the LOCAL half — `aontu mod tidy`, `verify`, `vendor` and
// `manifest`.
//
// Evaluation never touches the network, and neither does this: `tidy`
// resolves versions and rewrites the lockfile from what is already in
// the local stores, `verify` asks whether the stores still MEAN what
// the lockfile pins and changes nothing, and `vendor` materialises the
// locked closure into the project. Fetching and publishing are the
// network half, and are not in this build (see the register).
//
// MINIMUM VERSION SELECTION, not a solver: each module declares the
// MINIMUM version of each dependency it needs, and the selected version
// is the maximum of those minima over the closure. Deterministic, and
// deterministic without backtracking — the lockfile CONFIRMS the
// resolution rather than determining it, which is why a tidy run can be
// re-run to the same bytes.
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const mod_1 = require("./mod");
const subsume_1 = require("./subsume");
// The `dep` block a module file declares: import string -> version.
function declaredDeps(file, options) {
    if (!(0, node_fs_1.existsSync)(file)) {
        return {};
    }
    const gen = options.eval((0, node_fs_1.readFileSync)(file, 'utf8'), file).gen;
    const dep = gen?.dep;
    if (null == dep || 'object' !== typeof dep) {
        return {};
    }
    const out = {};
    for (const key of Object.keys(dep)) {
        const v = dep[key]?.v;
        if ('string' === typeof v && '' !== v) {
            out[key] = v;
        }
    }
    return out;
}
// Numeric-dotted version order: `1.10.0` is above `1.9.0`, which
// STRING order gets wrong, and that is the whole reason this is not a
// `<` on the text. A part that is not a number compares as text, after
// every number — a pre-release tag is below no version and above none.
function versionCompare(a, b) {
    const ap = a.split('.');
    const bp = b.split('.');
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        // A part the shorter version does not have is ZERO, so `1.2` and
        // `1.2.0` are the same version -- which is what everyone means by
        // them, and what a lockfile rewritten from either must agree on.
        const x = ap[i] ?? '0';
        const y = bp[i] ?? '0';
        if (x === y) {
            continue;
        }
        const xn = /^\d+$/.test(x);
        const yn = /^\d+$/.test(y);
        if (xn && yn) {
            return +x < +y ? -1 : 1;
        }
        if (xn !== yn) {
            return xn ? -1 : 1;
        }
        return x < y ? -1 : 1;
    }
    return 0;
}
// The directory a module is in, in the local stores: the project's
// vendor tree first, then the cache under the hash the lockfile pins.
function storeDir(root, ref, hash, options) {
    const stores = [(0, mod_1.moduleDir)((0, node_path_1.join)(root, 'aon_vendor'), ref)];
    if (null != options.cache && '' !== hash) {
        stores.push((0, node_path_1.join)(options.cache, hash));
    }
    return stores.find((d) => (0, node_fs_1.existsSync)((0, node_path_1.join)(d, 'mod.aon')));
}
// The lockfile's entries, as written.
function readLock(root) {
    const file = (0, node_path_1.join)(root, 'mod-lock.aon');
    if (!(0, node_fs_1.existsSync)(file)) {
        return {};
    }
    let lock;
    try {
        lock = JSON.parse((0, mod_1.lockJson)((0, node_fs_1.readFileSync)(file, 'utf8')));
    }
    catch {
        return {};
    }
    const out = {};
    for (const mod of Object.keys(lock?.lock ?? {})) {
        const e = lock.lock[mod];
        out[mod] = {
            mod,
            v: 'string' === typeof e?.v ? e.v : '',
            canon: 'string' === typeof e?.canon ? e.canon : '',
            oci: 'string' === typeof e?.oci ? e.oci : '',
        };
    }
    return out;
}
// The lockfile TEXT: canonical Aontu, one line, keys sorted. Built as
// source and canonicalised by the engine rather than printed by hand,
// so "canonical form" means what the language means by it and cannot
// drift from it.
function lockText(entries, options) {
    const parts = entries.map((e) => JSON.stringify(e.mod) + ':{' +
        '"canon":' + JSON.stringify(e.canon) + ',' +
        '"oci":' + JSON.stringify(e.oci) + ',' +
        '"v":' + JSON.stringify(e.v) + '}');
    // Canonicalised by the ENGINE rather than printed by hand, so
    // "canonical form" means what the language means by it and cannot
    // drift from it. For a map of scalars that canon is also JSON, which
    // is what lets the resolver read a pin back without an evaluator
    // (ts/src/mod.ts lockHash).
    return options.eval('{"lock":{' + parts.join(',') + '}}', 'mod-lock.aon').canon;
}
// `aontu mod tidy`: resolve the closure by MVS and rewrite the lockfile.
function modTidy(root, options) {
    const previous = readLock(root);
    const selected = {};
    const missing = [];
    // The closure, breadth-first from the project's own declarations. A
    // module already selected at a version at least as high contributes
    // nothing new, which is what makes this terminate without a cycle
    // check: the selected version only ever rises.
    let frontier = declaredDeps((0, node_path_1.join)(root, 'mod.aon'), options);
    for (; 0 < Object.keys(frontier).length;) {
        const next = {};
        for (const mod of Object.keys(frontier)) {
            const want = frontier[mod];
            const have = selected[mod];
            if (null != have && 0 <= versionCompare(have, want)) {
                continue;
            }
            selected[mod] = want;
            const ref = (0, mod_1.parseModuleRef)(mod);
            if (undefined === ref) {
                // A dependency key that is not a module path names nothing this
                // resolver can find, which is the same answer as a module that
                // is not there.
                missing.push(mod);
                continue;
            }
            const dir = storeDir(root, ref, previous[mod]?.canon ?? '', options);
            if (undefined === dir) {
                missing.push(mod);
                continue;
            }
            const deps = declaredDeps((0, node_path_1.join)(dir, 'mod.aon'), options);
            for (const key of Object.keys(deps)) {
                const bid = next[key];
                if (null == bid || 0 > versionCompare(bid, deps[key])) {
                    next[key] = deps[key];
                }
            }
        }
        frontier = next;
    }
    const lock = [];
    const unevaluable = [];
    for (const mod of Object.keys(selected).sort()) {
        if (missing.includes(mod)) {
            continue;
        }
        const ref = (0, mod_1.parseModuleRef)(mod);
        const dir = storeDir(root, ref, previous[mod]?.canon ?? '', options);
        const main = (0, node_path_1.join)(dir, mainOf(dir, options));
        // RECOMPUTED, never carried over: the pin is what the module in
        // this store MEANS, and a tidy that copied the old hash forward
        // would pin what it used to mean.
        const got = (0, node_fs_1.existsSync)(main) ?
            options.eval((0, node_fs_1.readFileSync)(main, 'utf8'), main) : undefined;
        // A NIL PIN IS WORSE THAN NO PIN. A module that does not stand up
        // hashes to canonHash(nil) -- the same string for every broken
        // module -- so writing it would put a plausible, uninformative
        // pin in the lockfile and silently void the "breaks on any
        // semantic change in the closure" contract (BUGS.md §31).
        if (null != got && !got.ok) {
            unevaluable.push(mod);
            continue;
        }
        lock.push({
            mod,
            v: selected[mod],
            canon: null == got ? '' : got.hash,
            // Carried over: the OCI digest is the registry's word about the
            // bytes it served, and nothing local can hear it.
            oci: previous[mod]?.oci ?? '',
        });
    }
    const uniqueMissing = [...new Set(missing)].sort();
    const uniqueUnevaluable = [...new Set(unevaluable)].sort();
    const held = 0 === uniqueMissing.length && 0 === uniqueUnevaluable.length;
    if (held) {
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(root, 'mod-lock.aon'), LOCK_HEADER + lockText(lock, options) + '\n');
    }
    return {
        verdict: held ? 'ok' :
            0 < uniqueUnevaluable.length ? 'error' : 'missing',
        lock,
        missing: uniqueMissing,
        unevaluable: uniqueUnevaluable,
    };
}
// The generated-file header. A lockfile is machine-written, and the
// file says so where an editor will see it.
const LOCK_HEADER = '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n';
// The entry file a module declares, or the default. `dir` is always a
// STORE directory, and `storeDir` only answers one that holds a
// `mod.aon` -- so there is no missing-file arm to take here.
function mainOf(dir, options) {
    const file = (0, node_path_1.join)(dir, 'mod.aon');
    const gen = options.eval((0, node_fs_1.readFileSync)(file, 'utf8'), file).gen;
    const main = gen?.mod?.main;
    return 'string' === typeof main && '' !== main ? main : 'main.aon';
}
// `aontu mod verify`: does every locked module still MEAN what the
// lockfile pins? Recompute and compare, and CHANGE NOTHING.
//
// The verb exists because `tidy` cannot answer this question. Tidy
// recomputes and REWRITES by design -- a pin is what a module means
// now -- so tampering with a vendored module and running tidy makes
// the lockfile agree with the tampering, `verdict: ok`, and the next
// evaluation passes. That is correct for the job tidy does and useless
// as a gate, which left a CI job that tidies before evaluating with no
// integrity protection at all (use-cases/BUGS.md §32). Verification is
// a question; answering it must not be an edit.
function modVerify(root, options) {
    const locked = readLock(root);
    const verified = [];
    const mismatched = [];
    const missing = [];
    // NOTHING TO CHECK IS NOT A PASS. A project with no lockfile at all
    // -- or one whose lockfile predates a dependency someone added --
    // would otherwise verify clean, because the loop below walks what is
    // LOCKED and there is nothing locked to walk. That is the same shape
    // as the defect this verb exists to close: absence reading as
    // agreement. Every dependency the project itself declares must be in
    // the lockfile before the pins mean anything, and the repair is a
    // tidy rather than a fetch. Transitive dependencies need no separate
    // check: a locked module's own imports are resolved when its pin is
    // recomputed, so one that is unreachable makes its DEPENDANT fail to
    // evaluate and lands in `mismatched` below.
    const declared = declaredDeps((0, node_path_1.join)(root, 'mod.aon'), options);
    const unlocked = Object.keys(declared)
        .filter((mod) => null == locked[mod]).sort();
    for (const mod of Object.keys(locked).sort()) {
        const ref = (0, mod_1.parseModuleRef)(mod);
        if (undefined === ref) {
            missing.push(mod);
            continue;
        }
        const dir = storeDir(root, ref, locked[mod].canon, options);
        if (undefined === dir) {
            missing.push(mod);
            continue;
        }
        const main = (0, node_path_1.join)(dir, mainOf(dir, options));
        if (!(0, node_fs_1.existsSync)(main)) {
            missing.push(mod);
            continue;
        }
        // A module that no longer stands up is not a match: it has no
        // meaning to compare, and reporting `got: <hash of nil>` would
        // print the same string for every broken module. The empty `got`
        // says the store holds something that does not evaluate.
        const got = options.eval((0, node_fs_1.readFileSync)(main, 'utf8'), main);
        const want = locked[mod].canon;
        if (got.ok && want === got.hash) {
            verified.push(mod);
            continue;
        }
        mismatched.push({ mod, want, got: got.ok ? got.hash : '' });
    }
    return {
        verdict: 0 < mismatched.length ? 'mismatch' :
            0 < unlocked.length ? 'unlocked' :
                0 < missing.length ? 'missing' : 'ok',
        verified,
        mismatched,
        unlocked,
        missing: missing.sort(),
    };
}
// `aontu mod vendor`: materialise the locked closure into `aon_vendor/`.
function modVendor(root, options) {
    const locked = readLock(root);
    const vendored = [];
    const missing = [];
    for (const mod of Object.keys(locked).sort()) {
        const ref = (0, mod_1.parseModuleRef)(mod);
        if (undefined === ref) {
            missing.push(mod);
            continue;
        }
        const from = storeDir(root, ref, locked[mod].canon, options);
        if (undefined === from) {
            missing.push(mod);
            continue;
        }
        const to = (0, mod_1.moduleDir)((0, node_path_1.join)(root, 'aon_vendor'), ref);
        if (from !== to) {
            copyTree(from, to);
        }
        vendored.push(mod);
    }
    return {
        verdict: 0 === missing.length ? 'ok' : 'missing',
        vendored,
        missing: missing.sort(),
    };
}
// A whole module directory, copied. Modules are source trees — that is
// what an OCI layer holds — so this walks rather than reading one file.
function copyTree(from, to) {
    (0, node_fs_1.mkdirSync)(to, { recursive: true });
    for (const name of (0, node_fs_1.readdirSync)(from).sort()) {
        const src = (0, node_path_1.join)(from, name);
        const dst = (0, node_path_1.join)(to, name);
        if ((0, node_fs_1.statSync)(src).isDirectory()) {
            copyTree(src, dst);
        }
        else {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dst), { recursive: true });
            (0, node_fs_1.copyFileSync)(src, dst);
        }
    }
}
// THE PUBLISH BOUNDARY (G6 phase 4,
// docs/capability-review/g6-distribution.md). A module is an OCI
// artifact, and what a publish PUSHES is a manifest: a config media
// type, one layer holding the module's source tree, and annotations
// carrying the module path, its version and its canon-hash.
//
// The push needs a registry, which this build does not have. Everything
// the push would ASSERT is local, and that is what `aontu mod manifest`
// answers: the exact artifact description, computed the way the
// registry would be told it, plus the gate that decides whether it may
// be minted at all.
//
// WHY THE ANNOTATION MATTERS MORE THAN THE BYTES. "Has the truth
// changed?" is one annotation read and a string compare -- no download,
// no parse -- because the canon-hash pins MEANING rather than text. A
// consumer holding `aon1-oQs6…` can ask a registry index whether the
// module still hashes to it, and a reformat, a comment or a file split
// will not move it.
// The config media type the design fixes: an Aontu module is not an
// image, and the type is what tells a registry so.
exports.MODULE_CONFIG_MEDIA_TYPE = 'application/vnd.aontu.module.v1+json';
// The canon-hash annotation. OCI asks a custom key to be the reverse
// DNS of a domain its author controls, and the project's own home is
// the only domain it has -- inventing an `aontu.dev` would be a claim
// it cannot back. The two facts OCI already has keys for use those.
exports.MODULE_ANNOTATION_CANON = 'com.github.rjrodger.aontu.canon';
exports.MODULE_ANNOTATION_MAJOR = 'com.github.rjrodger.aontu.major';
function modSelf(dir, options) {
    const file = (0, node_path_1.join)(dir, 'mod.aon');
    if (!(0, node_fs_1.existsSync)(file)) {
        return { path: '', version: '', main: 'main.aon' };
    }
    const gen = options.eval((0, node_fs_1.readFileSync)(file, 'utf8'), file).gen;
    const mod = gen?.mod;
    const str = (k) => 'string' === typeof mod?.[k] ? mod[k] : '';
    return {
        path: str('path'),
        version: str('version'),
        main: '' === str('main') ? 'main.aon' : str('main'),
    };
}
// The leading numeric component of a version, which is the major an
// import spells. Empty when the version does not start with one: a
// version whose major cannot be read cannot be published under a
// module path, because the path is where the major lives.
function majorOf(version) {
    const m = /^(\d+)/.exec(version);
    return null == m ? '' : m[1];
}
// Every file of a module's source tree, relative and forward-slashed.
// `aon_vendor/` is excluded: a published module carries its own
// sources, not a copy of everyone else's -- a consumer resolves the
// closure itself, and a nested vendor tree would publish the world.
function layerFiles(dir, prefix = '') {
    const out = [];
    for (const name of (0, node_fs_1.readdirSync)(dir).sort()) {
        if ('aon_vendor' === name) {
            continue;
        }
        const full = (0, node_path_1.join)(dir, name);
        const rel = '' === prefix ? name : prefix + '/' + name;
        if ((0, node_fs_1.statSync)(full).isDirectory()) {
            out.push(...layerFiles(full, rel));
        }
        else {
            out.push(rel);
        }
    }
    return out;
}
// `aontu mod manifest`: the OCI artifact description a publish would
// push, and the gate that decides whether it may be.
function modManifest(root, options, against) {
    const self = modSelf(root, options);
    const major = majorOf(self.version);
    const missing = [];
    if ('' === self.path) {
        missing.push('mod.path');
    }
    if ('' === major) {
        missing.push('mod.version');
    }
    const main = (0, node_path_1.join)(root, self.main);
    if (!(0, node_fs_1.existsSync)(main)) {
        missing.push(self.main);
    }
    const mod = '' === self.path || '' === major ?
        '' : self.path + '@' + major;
    if (0 < missing.length) {
        return {
            verdict: 'error',
            mod,
            version: self.version,
            canon: '',
            config: exports.MODULE_CONFIG_MEDIA_TYPE,
            files: [],
            annotations: {},
            missing: missing.sort(),
            findings: [],
        };
    }
    const newSrc = (0, node_fs_1.readFileSync)(main, 'utf8');
    const canon = options.eval(newSrc, main).hash;
    const report = {
        verdict: 'ok',
        mod,
        version: self.version,
        canon,
        config: exports.MODULE_CONFIG_MEDIA_TYPE,
        files: layerFiles(root),
        annotations: {
            [exports.MODULE_ANNOTATION_CANON]: canon,
            [exports.MODULE_ANNOTATION_MAJOR]: major,
            'org.opencontainers.image.title': self.path,
            'org.opencontainers.image.version': self.version,
        },
        missing: [],
        findings: [],
    };
    if (null == against) {
        return report;
    }
    // THE PUBLISH-TIME BREAKING GATE. The semantics of "breaking" belong
    // wholly to G3 (ts/src/subsume.ts); this is the wiring, at the one
    // place versions are minted.
    const prior = modSelf(against, options);
    const priorMain = (0, node_path_1.join)(against, prior.main);
    if (!(0, node_fs_1.existsSync)(priorMain)) {
        report.verdict = 'error';
        report.missing = [prior.main];
        return report;
    }
    // A MAJOR BUMP IS WHERE BREAKING IS ALLOWED. The major lives in the
    // module path, so a consumer of `@1` never sees `@2` unless it asks:
    // checking compatibility across majors would forbid the one change
    // the version scheme exists to express.
    if (majorOf(prior.version) !== major) {
        return report;
    }
    // Backward compatibility: the NEW version is the general side, so
    // every instance the old one admitted must still be admitted.
    const gate = (0, subsume_1.subsume)(newSrc, (0, node_fs_1.readFileSync)(priorMain, 'utf8'), {
        generalUrl: main,
        specificUrl: priorMain,
        generalPath: main,
        specificPath: priorMain,
    });
    report.findings = gate.findings;
    report.verdict = MANIFEST_VERDICT[gate.verdict];
    return report;
}
const MANIFEST_VERDICT = {
    subsumes: 'ok',
    does_not_subsume: 'breaking',
    undecided: 'undecided',
    error: 'error',
};
//# sourceMappingURL=mod-tool.js.map