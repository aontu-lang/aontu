"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.relPathError = exports.PkgRefusal = exports.SIGNATURE_ENCODING = exports.ARCHIVE_MAX_FILE_BYTES = exports.ARCHIVE_MAX_FILES = exports.ARCHIVE_MAX_UNPACKED = exports.ARCHIVE_MAX_BYTES = exports.LIMITS = exports.CLOSURE_MAX = exports.COOLDOWN_HOURS = exports.PUBLISH_PATH = exports.DEFAULT_WRITE = exports.DEFAULT_BASE = void 0;
exports.isLoopback = isLoopback;
exports.baseAdmitted = baseAdmitted;
exports.repoConfig = repoConfig;
exports.patternMatches = patternMatches;
exports.trustEntryFor = trustEntryFor;
exports.isPrivateName = isPrivateName;
exports.pkgUrlPath = pkgUrlPath;
exports.objectPath = objectPath;
exports.timestamp = timestamp;
exports.keyIdOf = keyIdOf;
exports.keyIdFromPem = keyIdFromPem;
exports.keygen = keygen;
exports.signDigest = signDigest;
exports.smallOrderKey = smallOrderKey;
exports.verifyKeyProof = verifyKeyProof;
exports.packagePath = packagePath;
exports.manifestError = manifestError;
exports.acquire = acquire;
exports.pkgSync = pkgSync;
exports.editDeps = editDeps;
exports.parsePkgSpec = parsePkgSpec;
exports.pkgGet = pkgGet;
exports.pkgRemove = pkgRemove;
exports.pkgWhy = pkgWhy;
exports.writeLayout = writeLayout;
exports.dirHttp = dirHttp;
exports.publisherFromToken = publisherFromToken;
exports.pkgPublish = pkgPublish;
exports.pkgOutdated = pkgOutdated;
exports.objectShape = objectShape;
exports.objectMutable = objectMutable;
exports.serveObject = serveObject;
exports.startServe = startServe;
exports.servedUrl = servedUrl;
exports.splitListen = splitListen;
exports.readBounded = readBounded;
exports.defaultHttp = defaultHttp;
// THE CLIENT HALF OF THE PACKAGE REPOSITORY (aontu-lang/system, spec/):
// acquisition, sync, publication and the local registry, over one
// injected transport. Every decision is above the seam; the adapter
// below it is the platform's fetch and nothing else.
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const node_path_1 = require("node:path");
const mod_1 = require("./mod");
const pkg_1 = require("./pkg");
Object.defineProperty(exports, "relPathError", { enumerable: true, get: function () { return pkg_1.relPathError; } });
const pkg_zip_1 = require("./pkg-zip");
exports.DEFAULT_BASE = 'https://pkg.aontu.dev';
exports.DEFAULT_WRITE = 'https://publish.aontu.dev';
exports.PUBLISH_PATH = '/v1/publish';
exports.COOLDOWN_HOURS = 72;
exports.CLOSURE_MAX = 1024;
// The closure bounds, as a record so a test can lower them.
exports.LIMITS = { depth: mod_1.MODULE_MAX_DEPTH, closure: exports.CLOSURE_MAX };
exports.ARCHIVE_MAX_BYTES = pkg_1.ARCHIVE_LIMITS.bytes;
exports.ARCHIVE_MAX_UNPACKED = pkg_1.ARCHIVE_LIMITS.unpacked;
exports.ARCHIVE_MAX_FILES = pkg_1.ARCHIVE_LIMITS.files;
exports.ARCHIVE_MAX_FILE_BYTES = pkg_1.ARCHIVE_LIMITS.fileBytes;
exports.SIGNATURE_ENCODING = 'aontu-signature/v1';
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const CANON_RE = /^aon1-[A-Za-z0-9_-]{43}$/;
const KEY_ID_RE = /^ed25519:[A-Za-z0-9_-]{43}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const PATTERN_RE = /^\*$|^[a-z0-9.-]+$|^[a-z0-9.-]+\/[A-Za-z0-9._/-]+$|^[a-z0-9.-]+\/\*$|^[a-z0-9.-]+\/[A-Za-z0-9._/-]+\/\*$/;
class PkgRefusal extends Error {
    constructor(code, message, pkg) {
        super(message);
        this.code = code;
        if (null != pkg) {
            this.pkg = pkg;
        }
    }
}
exports.PkgRefusal = PkgRefusal;
function refuse(code, message, pkg) {
    throw new PkgRefusal(code, message, pkg);
}
function isLoopback(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch {
        return false;
    }
    return 'http:' === u.protocol &&
        ('127.0.0.1' === u.hostname || 'localhost' === u.hostname || '[::1]' === u.hostname);
}
// A base is https, or http on a loopback host (ADR-039 part 10).
function baseAdmitted(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch {
        return false;
    }
    return 'https:' === u.protocol || isLoopback(url);
}
// The project's trust configuration: `repo` in its package file, with
// the defaults where it is silent, and the command line over both.
function repoConfig(root, options, overrides = {}) {
    const file = (0, node_path_1.join)(root, mod_1.PKG_FILE);
    const gen = (0, node_fs_1.existsSync)(file) ?
        options.eval((0, node_fs_1.readFileSync)(file, 'utf8'), file).gen : undefined;
    const repo = gen?.repo ?? {};
    const strs = (v) => Array.isArray(v) ? v.filter((s) => 'string' === typeof s) : [];
    const trust = {
        '*': { signer: 'forge', inclusion: 'required' },
    };
    const declared = repo.trust;
    if (null != declared && 'object' === typeof declared) {
        for (const pattern of Object.keys(declared)) {
            const e = declared[pattern];
            if (!PATTERN_RE.test(pattern) || null == e || 'object' !== typeof e) {
                refuse('config_invalid', 'repo.trust: ' + pattern + ' is not a pattern');
            }
            const signer = 'string' === typeof e.signer ? e.signer : '';
            if ('forge' !== signer && !KEY_ID_RE.test(signer)) {
                refuse('config_invalid', 'repo.trust: ' + pattern + ' names no signer (forge, or ed25519:<key>)');
            }
            trust[pattern] = {
                signer, inclusion: 'none' === e.inclusion ? 'none' : 'required',
            };
        }
    }
    const priv = strs(repo.private);
    for (const p of priv) {
        if (!PATTERN_RE.test(p)) {
            refuse('config_invalid', 'repo.private: ' + p + ' is not a pattern');
        }
    }
    // A package the project itself marks private is on the list by that
    // fact alone (spec private.prefix_list.derived).
    const self = (0, pkg_1.packageSelf)(root, options);
    if ('' !== self.path && 'private' === self.publish && !priv.includes(self.path)) {
        priv.push(self.path);
    }
    const base = overrides.base ?? (0 < strs(repo.base).length ? strs(repo.base) : [exports.DEFAULT_BASE]);
    const write = overrides.write ?? ('string' === typeof repo.write ? repo.write : exports.DEFAULT_WRITE);
    for (const b of [...base, write, ...strs(repo.private_base)]) {
        if (!baseAdmitted(b)) {
            refuse('base_not_https', 'repository base is not https: ' + b);
        }
    }
    return { base, write, private: priv, privateBase: strs(repo.private_base), trust };
}
// A pattern is a path, a path with `/*` beneath it, or `*` alone.
function patternMatches(pattern, pkg) {
    if ('*' === pattern) {
        return true;
    }
    if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        return pkg === prefix || pkg.startsWith(prefix + '/');
    }
    return pattern === pkg;
}
// The most specific entry: an exact path, then the longest prefix,
// then the default.
function trustEntryFor(config, pkg) {
    let best = '*';
    for (const pattern of Object.keys(config.trust)) {
        if (!patternMatches(pattern, pkg)) {
            continue;
        }
        if (pattern === pkg || (best !== pkg && pattern.length > best.length)) {
            best = pattern;
        }
    }
    return config.trust[best];
}
function isPrivateName(config, pkg) {
    return config.private.some((p) => patternMatches(p, pkg));
}
// The read-path layout (spec layout.objects).
function pkgUrlPath(pkg) {
    return pkg.split('/').map(mod_1.escapeElem).join('/');
}
function objectPath(kind, pkg, version) {
    const p = '/pkg/' + pkgUrlPath(pkg);
    switch (kind) {
        case 'list': return p + '/@v/list';
        case 'latest': return p + '/@latest';
        case 'archive': return p + '/@v/' + version + '.zip';
        case 'manifest': return p + '/@v/' + version + '.manifest';
        case 'signature': return p + '/@v/' + version + '.sig';
        case 'sigstore': return p + '/@v/' + version + '.sigstore.json';
        case 'advisory': return '/advisory/' + pkgUrlPath(pkg) + '.aontu';
        default: return '/tombstone/' + pkgUrlPath(pkg) + '/@v/' + version + '.aontu';
    }
}
function timestamp(d) {
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
const utf8 = (s) => new Uint8Array(Buffer.from(s, 'utf8'));
const text = (b) => Buffer.from(b).toString('utf8');
function parseDoc(b) {
    try {
        return JSON.parse((0, mod_1.lockJson)(text(b)));
    }
    catch {
        return undefined;
    }
}
// One canonical line, the form every stored object takes.
function canonLine(obj, options, name) {
    return utf8(options.eval(JSON.stringify(obj), name).canon + '\n');
}
// THE KEY PROVIDER (ADR-024 part 4): an Ed25519 key signs the manifest's
// digest, domain-separated by the encoding name.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
function signedBytes(over) {
    return Buffer.from(exports.SIGNATURE_ENCODING + '\n' + over + '\n', 'utf8');
}
function keyIdOf(publicKeyDer) {
    const raw = Buffer.from(publicKeyDer).subarray(publicKeyDer.length - 32);
    return 'ed25519:' + raw.toString('base64url');
}
// The signing key is an Ed25519 private key and nothing else: another
// kind signs, and every consumer refuses the proof, so it is refused
// here first.
function signingKey(pem) {
    let priv;
    try {
        priv = (0, node_crypto_1.createPrivateKey)(pem);
    }
    catch {
        refuse('key_invalid', 'the key file is not a PEM private key', '');
    }
    if ('ed25519' !== priv.asymmetricKeyType) {
        refuse('key_invalid', 'the key is ' + priv.asymmetricKeyType + ', not ed25519', '');
    }
    return priv;
}
function keyIdFromPem(pem) {
    const der = (0, node_crypto_1.createPublicKey)(signingKey(pem)).export({ format: 'der', type: 'spki' });
    return keyIdOf(new Uint8Array(der));
}
// `aontu pkg keygen`: a new signing key, written once. The answer is
// the signer id a consumer names, or the reason nothing was written.
function keygen(file) {
    if ((0, node_fs_1.existsSync)(file)) {
        return { refused: file + ' exists; a key is written once' };
    }
    const pem = (0, node_crypto_1.generateKeyPairSync)('ed25519').privateKey
        .export({ format: 'pem', type: 'pkcs8' });
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(file), { recursive: true });
    (0, node_fs_1.writeFileSync)(file, pem, { mode: 0o600 });
    return { signer: keyIdFromPem(pem) };
}
function signDigest(pem, over) {
    const priv = signingKey(pem);
    const sig = (0, node_crypto_1.sign)(null, signedBytes(over), priv);
    return {
        kind: 'key',
        encoding: exports.SIGNATURE_ENCODING,
        over,
        signer: keyIdFromPem(pem),
        signature: Buffer.from(sig).toString('base64url'),
    };
}
// The small-order points of the curve, by y with the sign bit cleared:
// a signature under one verifies for any message. The last entry is p,
// and every encoding at or above it is not canonical.
const SMALL_ORDER_Y = new Set([
    '0000000000000000000000000000000000000000000000000000000000000000',
    '0100000000000000000000000000000000000000000000000000000000000000',
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
]);
function smallOrderKey(raw) {
    const y = Buffer.from(raw);
    y[31] &= 0x7f;
    const hex = y.toString('hex');
    return SMALL_ORDER_Y.has(hex) || (hex.endsWith('ff'.repeat(30) + '7f') && 0xed <= y[0]);
}
// Base64url that decodes and re-encodes to itself: Buffer drops
// trailing bits silently, so a signature has one spelling here.
function canonicalBase64url(text, length) {
    const bytes = Buffer.from(text, 'base64url');
    return length === bytes.length && bytes.toString('base64url') === text ? bytes : undefined;
}
function verifyKeyProof(proof, over, signer) {
    if (null == proof || 'key' !== proof.kind || exports.SIGNATURE_ENCODING !== proof.encoding ||
        'string' !== typeof proof.signature || !KEY_ID_RE.test(proof.signer ?? '')) {
        return 'the proof is not an aontu-signature/v1 key proof';
    }
    if (proof.over !== over) {
        return 'the proof signs ' + proof.over + ', not this manifest';
    }
    if (proof.signer !== signer) {
        return 'signed by ' + proof.signer + '; the trust entry accepts ' + signer;
    }
    const raw = canonicalBase64url(proof.signer.slice('ed25519:'.length), 32);
    const sig = SIG_RE.test(proof.signature) ? canonicalBase64url(proof.signature, 64) : undefined;
    if (undefined === raw || undefined === sig) {
        return 'the proof carries a malformed key or signature';
    }
    if (smallOrderKey(raw)) {
        return 'the signer is a key of small order';
    }
    const key = (0, node_crypto_1.createPublicKey)({
        key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki',
    });
    return (0, node_crypto_1.verify)(null, signedBytes(over), key, sig) ?
        undefined : 'the signature does not verify';
}
// A package path: domain-shaped, the element rules, never an alias.
function packagePath(s) {
    return 'string' === typeof s && !(0, mod_1.isAlias)(s) && (0, pkg_1.usableKey)(s);
}
// T.Manifest, checked field by field: a served object is input.
function manifestError(m) {
    if (null == m || 'object' !== typeof m || pkg_1.MANIFEST_SCHEMA !== m.schema) {
        return 'schema is not ' + pkg_1.MANIFEST_SCHEMA;
    }
    if (!packagePath(m.package)) {
        return 'package is not a package path';
    }
    if ('string' !== typeof m.version || !pkg_1.VERSION_RE.test(m.version)) {
        return 'version is not MAJOR.MINOR.PATCH';
    }
    if ('public' !== m.publish && 'private' !== m.publish) {
        return 'publish is not public or private';
    }
    const a = m.archive;
    if (null == a || 'zip' !== a.format || !DIGEST_RE.test(a.digest ?? '') ||
        !Number.isInteger(a.size) || !Array.isArray(a.files) || 0 === a.files.length) {
        return 'archive is not a zip with a digest, a size and files';
    }
    for (const f of a.files) {
        if ('string' !== typeof f?.path || !DIGEST_RE.test(f.digest ?? '') ||
            !Number.isInteger(f.size) || undefined !== (0, pkg_1.relPathError)(f.path)) {
            return 'archive.files names a file without a path, a digest and a size';
        }
    }
    if (!Array.isArray(m.modules) || 1 !== m.modules.length ||
        m.modules[0]?.path !== m.package || 'string' !== typeof m.modules[0]?.main ||
        !CANON_RE.test(m.modules[0]?.canon ?? '')) {
        return 'modules is not the one module at the package path with an entry and a canon-hash';
    }
    if (undefined !== (0, pkg_1.relPathError)(m.modules[0].main) ||
        !a.files.some((f) => f.path === m.modules[0].main)) {
        return 'modules names an entry the archive does not hold';
    }
    if (null == m.deps || 'object' !== typeof m.deps || Array.isArray(m.deps)) {
        return 'deps is not a map';
    }
    for (const k of Object.keys(m.deps)) {
        const d = m.deps[k];
        if ('string' !== typeof d?.v || !pkg_1.VERSION_RE.test(d.v) ||
            (null != d.pkg && !packagePath(d.pkg))) {
            return 'deps.' + k + ' is not a minimum version';
        }
    }
    if ('string' !== typeof m.published) {
        return 'published is not a timestamp';
    }
    if (null != m.moved && !packagePath(m.moved)) {
        return 'moved is not a package path';
    }
    if (null != m.retract && (!Array.isArray(m.retract) ||
        m.retract.some((v) => 'string' !== typeof v || !pkg_1.VERSION_RE.test(v)))) {
        return 'retract is not a list of versions';
    }
    return undefined;
}
async function getObject(ctx, bases, path) {
    let last = { status: 0, body: new Uint8Array(), base: '' };
    for (const base of bases) {
        const r = await ctx.http.get(base.replace(/\/$/, '') + path);
        if (200 === r.status) {
            return { ...r, base };
        }
        last = { ...r, base };
    }
    return last;
}
function basesFor(ctx, pkg) {
    if (!isPrivateName(ctx.config, pkg)) {
        return ctx.config.base;
    }
    if (0 === ctx.config.privateBase.length) {
        refuse('private_name_public_path', pkg + ' is on the private list and repo.private_base names no repository', pkg);
    }
    return ctx.config.privateBase;
}
async function fetchList(ctx, bases, pkg) {
    const r = await getObject(ctx, bases, objectPath('list', pkg));
    if (200 !== r.status) {
        refuse('fetch_failed', 'no version list for ' + pkg +
            (0 === r.status ? ' (no repository answered)' : ' (' + r.status + ' from ' + r.base + ')'), pkg);
    }
    const doc = parseDoc(r.body);
    if (doc?.package !== pkg || !Array.isArray(doc?.versions)) {
        refuse('response_mismatch', 'the version list served does not name ' + pkg, pkg);
    }
    const versions = [];
    for (const e of doc.versions) {
        if ('string' !== typeof e?.version || !pkg_1.VERSION_RE.test(e.version) ||
            'string' !== typeof e?.seen) {
            refuse('response_mismatch', 'the version list for ' + pkg + ' is malformed', pkg);
        }
        versions.push({ version: e.version, seen: e.seen });
    }
    versions.sort((a, b) => (0, pkg_1.versionCompare)(a.version, b.version));
    // Every version the list offers is a version this client has seen:
    // its absence later is a rollback whichever version was taken.
    if ('' !== ctx.cache) {
        const subject = trustEntryFor(ctx.config, pkg).signer;
        for (const e of versions) {
            recordSeen(ctx, pkg, e.version, subject);
        }
    }
    return versions;
}
async function fetchAdvisory(ctx, bases, pkg) {
    const r = await getObject(ctx, bases, objectPath('advisory', pkg));
    const out = {};
    if (200 !== r.status) {
        return out;
    }
    const doc = parseDoc(r.body);
    for (const e of Array.isArray(doc?.retracted) ? doc.retracted : []) {
        if ('string' === typeof e?.version && 'string' === typeof e?.by) {
            out[e.version] = e.by;
        }
    }
    return out;
}
// The versions this client has seen for a package, from its own
// records: a version absent from the list now is a rollback.
function seenVersions(ctx, pkg) {
    const dir = (0, mod_1.cacheSeenDir)(ctx.cache, pkg);
    if (!(0, node_fs_1.existsSync)(dir)) {
        return [];
    }
    return (0, node_fs_1.readdirSync)(dir).filter((f) => f.endsWith('.aontu'))
        .map((f) => f.slice(0, -'.aontu'.length)).sort(pkg_zip_1.cmpBytes);
}
function recordSeen(ctx, pkg, version, subject) {
    const dir = (0, mod_1.cacheSeenDir)(ctx.cache, pkg);
    const file = (0, node_path_1.join)(dir, version + '.aontu');
    if ((0, node_fs_1.existsSync)(file)) {
        return;
    }
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    (0, node_fs_1.writeFileSync)(file, canonLine({ package: pkg, version, seen: timestamp(ctx.now()), subject }, ctx.options, 'seen.aontu'));
}
// Selection (spec acquire step 6): the newest version outside the
// cooldown, timed from the repository's first-seen time (ADR-039 part
// 9), not retracted. A version named explicitly is taken as it is.
function selectVersion(ctx, pkg, list, advisory, asked, fallback) {
    if (undefined !== asked) {
        return asked;
    }
    const priv = isPrivateName(ctx.config, pkg);
    const now = ctx.now().getTime();
    let held;
    for (let i = list.length - 1; 0 <= i; i--) {
        const e = list[i];
        if (null != advisory[e.version]) {
            continue;
        }
        const seen = Date.parse(e.seen);
        const until = seen + exports.COOLDOWN_HOURS * 3600 * 1000;
        if (!priv && (Number.isNaN(seen) || now < until)) {
            held = held ?? e;
            continue;
        }
        if (null != held) {
            ctx.events.push({
                code: 'cooldown_pending',
                message: pkg + ' ' + held.version + ' is inside the cooldown until ' +
                    timestamp(new Date(Date.parse(held.seen) + exports.COOLDOWN_HOURS * 3600 * 1000)) +
                    '; ' + e.version + ' was selected',
            });
        }
        return e.version;
    }
    const why = null == held ? pkg + ' has no selectable version' :
        pkg + ' ' + held.version + ' is inside the cooldown until ' +
            timestamp(new Date(Date.parse(held.seen) + exports.COOLDOWN_HOURS * 3600 * 1000)) +
            ' and no earlier version is selectable';
    if (undefined !== fallback) {
        ctx.events.push({ code: 'cooldown_pending', message: why });
        return fallback;
    }
    refuse(null == held ? 'fetch_failed' : 'cooldown_pending', why, pkg);
}
async function fetchManifest(ctx, bases, pkg, version) {
    const cached = (0, node_path_1.join)((0, mod_1.cacheDownloadDir)(ctx.cache, pkg), version + '.manifest');
    let bytes;
    if ((0, node_fs_1.existsSync)(cached)) {
        bytes = new Uint8Array((0, node_fs_1.readFileSync)(cached));
    }
    else {
        const r = await getObject(ctx, bases, objectPath('manifest', pkg, version));
        if (200 !== r.status) {
            const t = await getObject(ctx, bases, objectPath('tombstone', pkg, version));
            if (200 === t.status) {
                const doc = parseDoc(t.body);
                refuse('tombstoned', pkg + ' ' + version + ' was withdrawn by the repository' +
                    ('string' === typeof doc?.reason ? ' (' + doc.reason + ')' : ''), pkg);
            }
            refuse('fetch_failed', 'no manifest for ' + pkg + ' ' + version, pkg);
        }
        bytes = r.body;
    }
    const manifest = parseDoc(bytes);
    const bad = manifestError(manifest);
    if (undefined !== bad) {
        refuse('manifest_invalid', 'the manifest for ' + pkg + ' ' + version + ': ' + bad, pkg);
    }
    if (manifest.package !== pkg || manifest.version !== version) {
        refuse('response_mismatch', 'the manifest served names ' + manifest.package + ' ' +
            manifest.version + ', not ' + pkg + ' ' + version, pkg);
    }
    return { bytes, manifest };
}
async function fetchProof(ctx, bases, pkg, version, entry, manifestDigest) {
    if ('forge' === entry.signer) {
        refuse('proof_signer_untrusted', 'the trust entry for ' + pkg +
            ' names the forge signer, and this build verifies key proofs only;' +
            ' name a key under repo.trust', pkg);
    }
    const cached = (0, node_path_1.join)((0, mod_1.cacheDownloadDir)(ctx.cache, pkg), version + '.sig');
    let bytes;
    if ((0, node_fs_1.existsSync)(cached)) {
        bytes = new Uint8Array((0, node_fs_1.readFileSync)(cached));
    }
    else {
        const r = await getObject(ctx, bases, objectPath('signature', pkg, version));
        if (200 !== r.status) {
            refuse('proof_missing', 'no proof is served for ' + pkg + ' ' + version, pkg);
        }
        bytes = r.body;
    }
    const bad = verifyKeyProof(parseDoc(bytes), manifestDigest, entry.signer);
    if (undefined !== bad) {
        refuse(bad.startsWith('signed by') ? 'proof_signer_untrusted' : 'proof_invalid', 'the proof for ' + pkg + ' ' + version + ': ' + bad, pkg);
    }
    if ('required' === entry.inclusion) {
        refuse('inclusion_missing', 'the trust entry for ' + pkg +
            ' requires log inclusion, which a key proof does not carry in this build;' +
            ' set inclusion: none for a key signer', pkg);
    }
    return bytes;
}
async function fetchArchive(ctx, bases, pkg, version, manifest) {
    const cached = (0, node_path_1.join)((0, mod_1.cacheDownloadDir)(ctx.cache, pkg), version + '.zip');
    let bytes;
    if ((0, node_fs_1.existsSync)(cached)) {
        bytes = new Uint8Array((0, node_fs_1.readFileSync)(cached));
    }
    else {
        const r = await getObject(ctx, bases, objectPath('archive', pkg, version));
        if (200 !== r.status) {
            refuse('fetch_failed', 'no archive for ' + pkg + ' ' + version, pkg);
        }
        bytes = r.body;
    }
    if (pkg_1.ARCHIVE_LIMITS.bytes < bytes.length) {
        refuse('archive_too_large', 'the archive for ' + pkg + ' ' + version +
            ' is over the compressed cap', pkg);
    }
    const digest = (0, pkg_zip_1.sha256Hex)(bytes);
    if (digest !== manifest.archive.digest) {
        refuse('archive_digest_mismatch', 'the archive for ' + pkg + ' ' + version +
            ' is ' + digest + ', not ' + manifest.archive.digest, pkg);
    }
    return bytes;
}
// Unpack (spec acquire step 11): the entry rules the write path applies,
// applied again here, because only this protects against a hostile
// mirror; then every file against the manifest.
function unpack(pkg, version, zip, manifest) {
    let entries;
    try {
        entries = (0, pkg_zip_1.unzipCanonical)(zip);
    }
    catch (e) {
        refuse('archive_not_canonical', 'the archive for ' + pkg + ' ' + version + ': ' +
            e.message, pkg);
    }
    if (pkg_1.ARCHIVE_LIMITS.files < entries.length) {
        refuse('archive_too_many_files', 'the archive for ' + pkg + ' ' + version +
            ' is over the file-count cap', pkg);
    }
    let total = 0;
    const listed = new Map(manifest.archive.files.map((f) => [f.path, f]));
    for (const e of entries) {
        const bad = (0, pkg_1.relPathError)(e.path);
        if (undefined !== bad) {
            refuse('archive_path_invalid', 'the archive for ' + pkg + ' ' + version + ': ' +
                bad + ' (' + e.path + ')', pkg);
        }
        if (!(0, pkg_1.archiveAdmits)(e.path)) {
            refuse('archive_entry_forbidden', 'the archive for ' + pkg + ' ' + version +
                ' carries ' + e.path + ', which the allowlist does not admit', pkg);
        }
        total += e.data.length;
        if (pkg_1.ARCHIVE_LIMITS.fileBytes < e.data.length || pkg_1.ARCHIVE_LIMITS.unpacked < total) {
            refuse('archive_bomb', 'the archive for ' + pkg + ' ' + version +
                ' unpacks past the size cap', pkg);
        }
        const f = listed.get(e.path);
        if (undefined === f || f.digest !== (0, pkg_zip_1.sha256Hex)(e.data) || f.size !== e.data.length) {
            refuse('file_manifest_mismatch', 'the archive for ' + pkg + ' ' + version +
                ' holds ' + e.path + ', which the manifest does not list as served', pkg);
        }
        listed.delete(e.path);
    }
    if (0 < listed.size) {
        refuse('file_manifest_mismatch', 'the archive for ' + pkg + ' ' + version +
            ' lacks ' + [...listed.keys()].sort(pkg_zip_1.cmpBytes)[0] + ', which the manifest lists', pkg);
    }
    return entries;
}
function writeTree(dir, entries) {
    for (const e of entries) {
        const full = (0, node_path_1.join)(dir, ...e.path.split('/'));
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(full), { recursive: true });
        (0, node_fs_1.writeFileSync)(full, e.data);
    }
}
// ACQUIRE (spec ops.acquire): one package, its deps first, the pins
// checked in order -- proof, bytes, meaning -- then recorded, cached
// and returned for the lock.
async function acquire(ctx, pkg, asked, depth) {
    if (exports.LIMITS.depth <= depth) {
        refuse('module_depth', 'the closure under ' + pkg + ' nests past ' + exports.LIMITS.depth, pkg);
    }
    if (exports.LIMITS.closure <= ctx.count) {
        refuse('closure_too_large', 'the closure exceeds ' + exports.LIMITS.closure + ' packages', pkg);
    }
    const bases = basesFor(ctx, pkg);
    const entry = trustEntryFor(ctx.config, pkg);
    const list = await fetchList(ctx, bases, pkg);
    // A version seen before and gone from the list is a rollback, unless
    // the repository says why: a tombstone stands where it was.
    for (const v of seenVersions(ctx, pkg)) {
        if (!list.some((e) => e.version === v) &&
            200 !== (await getObject(ctx, bases, objectPath('tombstone', pkg, v))).status) {
            refuse('list_rollback', pkg + ' ' + v + ' was seen before and is absent from the list', pkg);
        }
    }
    const advisory = await fetchAdvisory(ctx, bases, pkg);
    const version = selectVersion(ctx, pkg, list, advisory, asked);
    const newest = list[list.length - 1]?.version;
    if (undefined !== asked && !list.some((e) => e.version === asked)) {
        const t = await getObject(ctx, bases, objectPath('tombstone', pkg, asked));
        if (200 === t.status) {
            const doc = parseDoc(t.body);
            refuse('tombstoned', pkg + ' ' + asked + ' was withdrawn by the repository' +
                ('string' === typeof doc?.reason ? ' (' + doc.reason + ')' : ''), pkg);
        }
        refuse('fetch_failed', pkg + ' ' + asked + ' is not in the version list', pkg);
    }
    const id = pkg + '@' + version;
    const had = ctx.acquired[id];
    if (undefined !== had) {
        return had;
    }
    ctx.count++;
    // The newest version speaks for the name: a move declared there
    // refuses every version, and nothing follows it.
    if (undefined !== newest && newest !== version) {
        const top = await fetchManifest(ctx, bases, pkg, newest);
        if (null != top.manifest.moved) {
            refuse('module_moved', pkg + ' moved to ' + top.manifest.moved +
                '; import that instead, nothing follows a move', pkg);
        }
    }
    const { bytes: manifestBytes, manifest } = await fetchManifest(ctx, bases, pkg, version);
    if (null != manifest.moved) {
        refuse('module_moved', pkg + ' moved to ' + manifest.moved +
            '; import that instead, nothing follows a move', pkg);
    }
    const manifestDigest = (0, pkg_zip_1.sha256Hex)(manifestBytes);
    const proofBytes = await fetchProof(ctx, bases, pkg, version, entry, manifestDigest);
    const zip = await fetchArchive(ctx, bases, pkg, version, manifest);
    const entries = unpack(pkg, version, zip, manifest);
    // Deps first, at the minima the manifest declares: the module is
    // evaluated in its publisher's context, which is what its canon pins.
    const deps = manifest.deps;
    const pins = [];
    for (const key of Object.keys(deps).sort(pkg_zip_1.cmpBytes)) {
        const target = deps[key].pkg ?? key;
        if ((0, mod_1.isAlias)(key) && null == deps[key].pkg) {
            refuse('manifest_invalid', 'the manifest for ' + pkg + ' ' + version +
                ' declares ' + key + ' without the package it names', pkg);
        }
        const dep = await acquire(ctx, target, deps[key].v, depth + 1);
        pins.push({
            key, v: dep.version, canon: dep.canon, archive: dep.archive,
            manifest: dep.manifestDigest, ...((0, mod_1.isAlias)(key) ? { pkg: target } : {}),
        });
        for (const e of dep.closure) {
            if (!pins.some((p) => p.key === e.key)) {
                pins.push(e);
            }
        }
    }
    pins.sort((a, b) => (0, pkg_zip_1.cmpBytes)(a.key, b.key));
    const tmp = (0, node_path_1.join)(ctx.cache, 'tmp', (0, node_crypto_1.randomBytes)(8).toString('hex'));
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(tmp, mod_1.META_DIR), { recursive: true });
    writeTree(tmp, entries);
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(tmp, mod_1.META_DIR, 'manifest.aontu'), manifestBytes);
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(tmp, mod_1.META_DIR, 'proof.aontu'), proofBytes);
    const self = (0, pkg_1.packageSelf)(tmp, ctx.options);
    const mod = manifest.modules[0];
    if (self.path !== pkg || self.version !== version || self.main !== mod.main) {
        (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
        refuse('manifest_invalid', 'the package file inside ' + pkg + ' ' + version +
            ' disagrees with the manifest', pkg);
    }
    // The store tree keeps its own lock: the closure it was verified
    // against, so it verifies again from the cache alone. The vendored
    // copy loses it, and resolves against the consumer's lock instead.
    if (0 < pins.length) {
        (0, pkg_1.writeLock)(tmp, pins, ctx.options);
    }
    // The entry is in the archive: the manifest named it among the files
    // and every listed file was unpacked.
    const main = (0, node_path_1.join)(tmp, mod.main);
    const got = ctx.options.eval((0, node_fs_1.readFileSync)(main, 'utf8'), main);
    if (!got.ok || got.hash !== mod.canon) {
        (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
        refuse('module_integrity', pkg + ' ' + version + ' means ' +
            (!got.ok ? 'nothing (it does not evaluate)' : got.hash) +
            ', and the manifest pins ' + mod.canon, pkg);
    }
    const dir = (0, mod_1.cacheStoreDir)(ctx.cache, got.hash, pkg);
    (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dir), { recursive: true });
    (0, node_fs_1.renameSync)(tmp, dir);
    const down = (0, mod_1.cacheDownloadDir)(ctx.cache, pkg);
    (0, node_fs_1.mkdirSync)(down, { recursive: true });
    for (const [name, data] of [
        [version + '.zip', zip], [version + '.manifest', manifestBytes],
        [version + '.sig', proofBytes]
    ]) {
        if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(down, name))) {
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(down, name), data);
        }
    }
    recordSeen(ctx, pkg, version, entry.signer);
    const out = {
        pkg, version, canon: got.hash, archive: (0, pkg_zip_1.sha256Hex)(zip), manifestDigest,
        deps, dir, closure: pins,
    };
    ctx.acquired[id] = out;
    ctx.fetched.push(pkg + ' ' + version);
    return out;
}
function emptySync() {
    return {
        verdict: 'ok', fetched: [], lock: [], vendored: [], missing: [], unevaluable: [],
        forbidden: [], mismatched: [], unlocked: [], changes: [], events: [],
    };
}
function refused(report, e) {
    if (!(e instanceof PkgRefusal)) {
        throw e;
    }
    report.verdict = 'refused';
    report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) };
    return report;
}
function makeCtx(root, options, http, args) {
    return {
        options, http, config: repoConfig(root, options, args),
        cache: options.cache,
        now: args.now ?? (() => new Date()),
        events: [], fetched: [], acquired: {}, count: 0,
    };
}
// Where the project already holds a package at a version: its vendor
// tree, when the tree's own file agrees, else the cache, when the
// download tree has that version's manifest.
function heldAt(root, key, pkg, version, ctx) {
    const vendored = (0, mod_1.moduleDir)((0, node_path_1.join)(root, mod_1.META_DIR, mod_1.VENDOR_DIR), key);
    if ((0, node_fs_1.existsSync)((0, node_path_1.join)(vendored, mod_1.PKG_FILE))) {
        const self = (0, pkg_1.packageSelf)(vendored, ctx.options);
        if (('' === self.version || self.version === version) &&
            ('' === self.path || self.path === pkg)) {
            return vendored;
        }
    }
    const manifestFile = (0, node_path_1.join)((0, mod_1.cacheDownloadDir)(ctx.cache, pkg), version + '.manifest');
    if ((0, node_fs_1.existsSync)(manifestFile)) {
        const m = parseDoc(new Uint8Array((0, node_fs_1.readFileSync)(manifestFile)));
        const canon = m?.modules?.[0]?.canon;
        if ('string' === typeof canon) {
            const dir = (0, mod_1.cacheStoreDir)(ctx.cache, canon, pkg);
            if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, mod_1.PKG_FILE))) {
                return dir;
            }
        }
    }
    return undefined;
}
// SYNC (spec ops.sync): resolve by MVS, fetch what is missing, vendor,
// lock, verify. Idempotent, and `--frozen` refuses to change the lock.
async function pkgSync(root, options, http, args = {}) {
    const report = emptySync();
    let ctx;
    try {
        ctx = makeCtx(root, options, http, args);
    }
    catch (e) {
        return refused(report, e);
    }
    const previous = (0, pkg_1.readLock)(root);
    const selected = {};
    const dirs = {};
    const missing = [];
    const pending = new Set();
    const bid = (deps) => {
        for (const key of Object.keys(deps)) {
            const have = selected[key];
            if (null == have || 0 > (0, pkg_1.versionCompare)(have.v, deps[key].v)) {
                selected[key] = { ...have, ...deps[key] };
                pending.add(key);
            }
        }
    };
    const target = (key) => (0, pkg_1.targetOf)(key, selected[key], previous[key]);
    // Held packages are read before anything is fetched, so a held
    // dependant's bid raises a version before that version is requested.
    try {
        bid((0, pkg_1.declaredDeps)((0, node_path_1.join)(root, mod_1.PKG_FILE), options));
        for (; 0 < pending.size;) {
            const keys = [...pending].sort(pkg_zip_1.cmpBytes);
            let key = keys.find((k) => !(0, pkg_1.usableKey)(k) || '' === target(k));
            if (undefined !== key) {
                missing.push(key);
                pending.delete(key);
                continue;
            }
            let dir;
            for (const k of keys) {
                dir = heldAt(root, k, target(k), selected[k].v, ctx);
                if (undefined !== dir) {
                    key = k;
                    break;
                }
            }
            if (undefined === key) {
                key = keys.find((k) => true !== args.frozen || previous[k]?.v === selected[k].v);
                if (undefined === key) {
                    for (const k of keys) {
                        report.changes.push(k + ': ' + (previous[k]?.v ?? 'unlocked') + ' -> ' + selected[k].v);
                    }
                    report.verdict = 'frozen';
                    return report;
                }
                dir = (await acquire(ctx, target(key), selected[key].v, 0)).dir;
            }
            pending.delete(key);
            dirs[key] = dir;
            bid((0, pkg_1.declaredDeps)((0, node_path_1.join)(dir, mod_1.PKG_FILE), options));
        }
    }
    catch (e) {
        report.events = ctx.events;
        report.fetched = ctx.fetched.sort(pkg_zip_1.cmpBytes);
        return refused(report, e);
    }
    report.events = ctx.events;
    report.fetched = ctx.fetched.sort(pkg_zip_1.cmpBytes);
    // Materialise: the closure into the vendor tree, and nothing else
    // left there.
    const vendorRoot = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.VENDOR_DIR);
    for (const key of Object.keys(dirs).sort(pkg_zip_1.cmpBytes)) {
        const to = (0, mod_1.moduleDir)(vendorRoot, key);
        if (dirs[key] !== to) {
            (0, node_fs_1.rmSync)(to, { recursive: true, force: true });
            (0, pkg_1.vendorCopy)(dirs[key], to);
        }
        report.vendored.push(key);
    }
    // Pruning waits for the lock to be writable: a frozen sync that
    // refuses leaves the locked build whole.
    const prune = () => {
        for (const key of Object.keys(previous)) {
            if (null == selected[key] && (0, pkg_1.usableKey)(key)) {
                (0, node_fs_1.rmSync)((0, mod_1.moduleDir)(vendorRoot, key), { recursive: true, force: true });
                pruneEmpty((0, node_path_1.dirname)((0, mod_1.moduleDir)(vendorRoot, key)), vendorRoot);
            }
        }
    };
    const resolved = (0, pkg_1.pkgResolve)(root, options);
    report.lock = resolved.lock;
    report.missing = [...new Set([...missing, ...resolved.missing])].sort(pkg_zip_1.cmpBytes);
    report.unevaluable = resolved.unevaluable;
    report.forbidden = resolved.forbidden;
    if ('ok' !== resolved.verdict || 0 < report.missing.length) {
        report.verdict = 0 < report.unevaluable.length || 0 < report.forbidden.length ?
            'error' : 'missing';
        return report;
    }
    const lockFile = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.LOCK_FILE);
    const before = (0, node_fs_1.existsSync)(lockFile) ? (0, node_fs_1.readFileSync)(lockFile, 'utf8') : '';
    const after = (0, pkg_1.lockText)(resolved.lock, options);
    if (true === args.frozen && before.split('\n')[before.startsWith('#') ? 1 : 0] !== after) {
        for (const e of resolved.lock) {
            const p = previous[e.key];
            if (null == p || p.canon !== e.canon || p.archive !== e.archive ||
                p.v !== e.v || p.manifest !== e.manifest) {
                report.changes.push(e.key + ': ' + (null == p ? 'unlocked' : 'repinned'));
            }
        }
        for (const key of Object.keys(previous)) {
            if (!resolved.lock.some((e) => e.key === key)) {
                report.changes.push(key + ': dropped');
            }
        }
        report.verdict = 'frozen';
        return report;
    }
    prune();
    (0, pkg_1.writeLock)(root, resolved.lock, options);
    const verify = (0, pkg_1.pkgVerify)(root, options);
    report.mismatched = verify.mismatched;
    report.unlocked = verify.unlocked;
    report.verdict = verify.verdict;
    return report;
}
function pruneEmpty(dir, stop) {
    for (; dir.startsWith(stop) && (0, node_fs_1.existsSync)(dir) && 0 === (0, node_fs_1.readdirSync)(dir).length; dir = (0, node_path_1.dirname)(dir)) {
        (0, node_fs_1.rmSync)(dir, { recursive: true });
    }
}
function editDeps(root, edit, options) {
    const file = (0, node_path_1.join)(root, mod_1.PKG_FILE);
    const before = (0, node_fs_1.existsSync)(file) ? (0, node_fs_1.readFileSync)(file, 'utf8') : '';
    let after;
    if ('add' === edit.op) {
        after = before + ('' === before || before.endsWith('\n') ? '' : '\n') +
            'dep: ' + JSON.stringify(edit.key) + ': { v: ' + JSON.stringify(edit.v) + ' }\n';
    }
    else {
        const lines = before.split('\n');
        const at = lines.findIndex((l) => l.includes(JSON.stringify(edit.key)));
        if (0 > at) {
            return edit.key + ' is not on one line of ' + mod_1.PKG_FILE + '; edit it by hand';
        }
        const line = lines[at];
        if ((line.match(/\{/g) ?? []).length !== (line.match(/\}/g) ?? []).length) {
            return edit.key + ' spans several lines of ' + mod_1.PKG_FILE + '; edit it by hand';
        }
        if ('raise' === edit.op) {
            const re = /\bv\s*:\s*"[^"]*"/;
            if (!re.test(line)) {
                return edit.key + ' declares its version on another line of ' + mod_1.PKG_FILE +
                    '; edit it by hand';
            }
            lines[at] = line.replace(re, 'v: ' + JSON.stringify(edit.v));
        }
        else {
            lines.splice(at, 1);
        }
        after = lines.join('\n');
    }
    (0, node_fs_1.writeFileSync)(file, after);
    const deps = (0, pkg_1.declaredDeps)(file, options);
    const held = options.eval(after, file).ok &&
        ('remove' === edit.op ? null == deps[edit.key] : deps[edit.key]?.v === edit.v);
    if (!held) {
        (0, node_fs_1.writeFileSync)(file, before);
        return 'the edit to ' + mod_1.PKG_FILE + ' did not take; edit it by hand';
    }
    return undefined;
}
// A `<pkg>[@<version>]` argument.
function parsePkgSpec(spec) {
    const at = spec.indexOf('@');
    const pkg = 0 > at ? spec : spec.slice(0, at);
    const version = 0 > at ? undefined : spec.slice(at + 1);
    if (!packagePath(pkg)) {
        return 'not a package path: ' + spec;
    }
    if (undefined !== version && !pkg_1.VERSION_RE.test(version)) {
        return 'not a version: ' + version + ' (MAJOR.MINOR.PATCH)';
    }
    return { pkg, ...(undefined === version ? {} : { version }) };
}
// `aontu add` and `aontu get`: a dependency declared or raised, then a
// sync. `add` refuses what is already declared and names `get`.
async function pkgGet(root, options, http, spec, args) {
    const parsed = parsePkgSpec(spec);
    if ('string' === typeof parsed) {
        return parsed;
    }
    const { pkg } = parsed;
    const declared = (0, pkg_1.declaredDeps)((0, node_path_1.join)(root, mod_1.PKG_FILE), options);
    const have = declared[pkg];
    if ('add' === args.mode && null != have) {
        return pkg + ' is already a dependency at ' + have.v + ' (aontu get raises it)';
    }
    let version = parsed.version;
    let ctx;
    try {
        ctx = makeCtx(root, options, http, args);
        if (undefined === version) {
            const bases = basesFor(ctx, pkg);
            const list = await fetchList(ctx, bases, pkg);
            version = selectVersion(ctx, pkg, list, await fetchAdvisory(ctx, bases, pkg), undefined);
        }
    }
    catch (e) {
        const report = { ...refused(emptySync(), e), change: 'none' };
        report.events = ctx?.events ?? [];
        return report;
    }
    let change;
    const before = snapshot(root);
    if (null == have) {
        const bad = editDeps(root, { op: 'add', key: pkg, v: version }, options);
        if (undefined !== bad) {
            return bad;
        }
        change = 'added ' + pkg + ' ' + version;
    }
    else if (0 <= (0, pkg_1.versionCompare)(have.v, version)) {
        change = pkg + ' is at ' + have.v + ' already';
    }
    else {
        const bad = editDeps(root, { op: 'raise', key: pkg, v: version }, options);
        if (undefined !== bad) {
            return bad;
        }
        change = 'raised ' + pkg + ' ' + have.v + ' -> ' + version;
    }
    const sync = await pkgSync(root, options, http, { ...args, frozen: false });
    sync.events = [...ctx.events, ...sync.events];
    return { ...sync, change: settled(root, before, sync, change) };
}
function snapshot(root) {
    const snap = { pkgFile: (0, node_fs_1.readFileSync)((0, node_path_1.join)(root, mod_1.PKG_FILE), 'utf8') };
    const lockFile = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.LOCK_FILE);
    if ((0, node_fs_1.existsSync)(lockFile)) {
        snap.lock = (0, node_fs_1.readFileSync)(lockFile, 'utf8');
    }
    const vendorRoot = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.VENDOR_DIR);
    if ((0, node_fs_1.existsSync)(vendorRoot)) {
        snap.vendor = (0, node_path_1.join)(root, mod_1.META_DIR, 'tmp', (0, node_crypto_1.randomBytes)(8).toString('hex'));
        (0, pkg_1.copyTree)(vendorRoot, snap.vendor);
    }
    return snap;
}
// A change the sync could not carry is taken back, lock and vendor
// tree included: neither verb leaves the project half-changed.
function settled(root, before, sync, change) {
    const tmp = (0, node_path_1.join)(root, mod_1.META_DIR, 'tmp');
    if ('ok' === sync.verdict) {
        (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
        return change;
    }
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(root, mod_1.PKG_FILE), before.pkgFile);
    const lockFile = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.LOCK_FILE);
    if (undefined === before.lock) {
        (0, node_fs_1.rmSync)(lockFile, { force: true });
    }
    else {
        (0, node_fs_1.writeFileSync)(lockFile, before.lock);
    }
    const vendorRoot = (0, node_path_1.join)(root, mod_1.META_DIR, mod_1.VENDOR_DIR);
    (0, node_fs_1.rmSync)(vendorRoot, { recursive: true, force: true });
    if (undefined !== before.vendor) {
        (0, node_fs_1.renameSync)(before.vendor, vendorRoot);
    }
    (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
    return 'none (' + change + ' was taken back)';
}
// `aontu remove`: the pair of `add`.
async function pkgRemove(root, options, http, pkg, args) {
    const declared = (0, pkg_1.declaredDeps)((0, node_path_1.join)(root, mod_1.PKG_FILE), options);
    if (null == declared[pkg]) {
        return pkg + ' is not a dependency of this project';
    }
    const before = snapshot(root);
    const bad = editDeps(root, { op: 'remove', key: pkg }, options);
    if (undefined !== bad) {
        return bad;
    }
    const sync = await pkgSync(root, options, http, { ...args, frozen: false });
    return { ...sync, change: settled(root, before, sync, 'removed ' + pkg) };
}
// `aontu why`: every chain of dependencies from the project to a
// package, read from the lock and the package files in the store.
function pkgWhy(root, options, pkg) {
    const locked = (0, pkg_1.readLock)(root);
    const self = (0, pkg_1.packageSelf)(root, options);
    const rootKey = '' === self.path ? '.' : self.path;
    const edges = {
        [rootKey]: Object.keys((0, pkg_1.declaredDeps)((0, node_path_1.join)(root, mod_1.PKG_FILE), options)).sort(pkg_zip_1.cmpBytes),
    };
    for (const key of Object.keys(locked)) {
        const entry = locked[key];
        const dir = (0, pkg_1.usableKey)(key) ?
            storeDirOf(root, key, entry, options) : undefined;
        edges[key] = undefined === dir ? [] :
            Object.keys((0, pkg_1.declaredDeps)((0, node_path_1.join)(dir, mod_1.PKG_FILE), options)).sort(pkg_zip_1.cmpBytes);
    }
    const paths = [];
    const walk = (key, trail) => {
        if (key === pkg || ((0, mod_1.isAlias)(key) && locked[key]?.pkg === pkg)) {
            paths.push([...trail, key]);
            return;
        }
        if (trail.includes(key)) {
            return;
        }
        for (const dep of edges[key] ?? []) {
            walk(dep, [...trail, key]);
        }
    };
    walk(rootKey, []);
    return { verdict: 0 < paths.length ? 'ok' : 'missing', pkg, paths };
}
function storeDirOf(root, key, entry, options) {
    const stores = [(0, mod_1.moduleDir)((0, node_path_1.join)(root, mod_1.META_DIR, mod_1.VENDOR_DIR), key)];
    if (null != options.cache && '' !== entry.canon) {
        stores.push((0, mod_1.cacheStoreDir)(options.cache, entry.canon, entry.pkg ?? key));
    }
    return stores.find((d) => (0, node_fs_1.existsSync)((0, node_path_1.join)(d, mod_1.PKG_FILE)));
}
function writeLayout(dir, w, options, now) {
    const pkg = w.manifest.package;
    const version = w.manifest.version;
    if (!packagePath(pkg) || !pkg_1.VERSION_RE.test(version)) {
        refuse('manifest_invalid', 'the manifest names ' + pkg + ' ' + version +
            ', not a package path at a version', pkg);
    }
    const at = (0, node_path_1.join)(dir, 'pkg', ...pkgUrlPath(pkg).split('/'), '@v');
    (0, node_fs_1.mkdirSync)(at, { recursive: true });
    const existing = (0, node_fs_1.readdirSync)(at)
        .filter((f) => f.endsWith('.manifest')).map((f) => f.slice(0, -'.manifest'.length));
    if (existing.includes(version)) {
        refuse('version_exists', pkg + ' ' + version + ' was published before and is never reusable', pkg);
    }
    const manifests = existing.map((v) => parseDoc(new Uint8Array((0, node_fs_1.readFileSync)((0, node_path_1.join)(at, v + '.manifest')))));
    for (const m of manifests) {
        if (null != m?.moved) {
            refuse('path_moved', pkg + ' is frozen by a moved declaration (now ' + m.moved + ')', pkg);
        }
    }
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(at, version + '.zip'), w.archive);
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(at, version + '.manifest'), w.manifestBytes);
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(at, version + '.sig'), w.proofBytes);
    const listFile = (0, node_path_1.join)(at, 'list');
    const old = (0, node_fs_1.existsSync)(listFile) ? parseDoc(new Uint8Array((0, node_fs_1.readFileSync)(listFile))) : undefined;
    const versions = Array.isArray(old?.versions) ? old.versions : [];
    versions.push({ version, seen: timestamp(now) });
    versions.sort((a, b) => (0, pkg_1.versionCompare)(a.version, b.version));
    (0, node_fs_1.writeFileSync)(listFile, canonLine({ package: pkg, versions }, options, 'list'));
    const top = versions[versions.length - 1];
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)((0, node_path_1.dirname)(at), '@latest'), canonLine({ package: pkg, version: top.version, seen: top.seen }, options, 'latest'));
    const retracted = [];
    for (const m of [...manifests, w.manifest]) {
        for (const v of m?.retract ?? []) {
            retracted.push({ version: v, by: m.version });
        }
    }
    retracted.sort((a, b) => (0, pkg_1.versionCompare)(a.version, b.version));
    const advisory = (0, node_path_1.join)(dir, 'advisory', ...pkgUrlPath(pkg).split('/'));
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(advisory + '.aontu'), { recursive: true });
    (0, node_fs_1.writeFileSync)(advisory + '.aontu', canonLine({ package: pkg, retracted }, options, 'advisory'));
}
// A directory as a repository: the layout above, read by path.
function dirHttp(dir) {
    return {
        get: async (url) => {
            const p = new URL(url).pathname;
            const file = (0, node_path_1.join)(dir, ...p.split('/').filter((e) => '' !== e));
            if (p.split('/').includes('..') || !(0, node_fs_1.existsSync)(file) || !(0, node_fs_1.statSync)(file).isFile()) {
                return { status: 404, body: new Uint8Array() };
            }
            return { status: 200, body: new Uint8Array((0, node_fs_1.readFileSync)(file)) };
        },
        post: async () => ({ status: 405, body: utf8('a directory takes no publish') }),
    };
}
// What a forge token says about its bearer, read for the manifest's
// publisher block. The write path verifies it; the client copies it.
function publisherFromToken(token) {
    const parts = token.trim().split('.');
    if (3 !== parts.length) {
        return undefined;
    }
    let claims;
    try {
        claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }
    catch {
        return undefined;
    }
    const iss = claims?.iss ?? '';
    if ('https://token.actions.githubusercontent.com' === iss) {
        return {
            host: 'github.com',
            namespace: claims.repository,
            subject: {
                host: 'github.com', owner_id: String(claims.repository_owner_id),
                repository_id: String(claims.repository_id),
            },
            trigger: 'release' === claims.event_name ? 'release' : 'push',
            runner: 'self-hosted' === claims.runner_environment ? 'self_hosted' : 'hosted',
            ...(null == claims.workflow_ref ? {} : { workflow: claims.workflow_ref }),
        };
    }
    if ('https://gitlab.com' === iss) {
        return {
            host: 'gitlab.com',
            namespace: claims.project_path,
            subject: {
                host: 'gitlab.com', owner_id: String(claims.namespace_id),
                repository_id: String(claims.project_id),
            },
            trigger: 'push',
            runner: 'self-hosted' === claims.runner_environment ? 'self_hosted' : 'hosted',
            ...(null == claims.ci_config_ref_uri ? {} : { workflow: claims.ci_config_ref_uri }),
        };
    }
    return undefined;
}
// PUBLISH (spec ops.publish, the client's side): the manifest and its
// gate, then the signed objects sent, or written into a directory. A
// dry run without `--yes`.
async function pkgPublish(root, options, http, args) {
    const now = args.now ?? (() => new Date());
    const local = (0, pkg_1.pkgManifest)(root, options, args.against);
    const report = {
        verdict: 'dry-run', missing: local.missing, forbidden: local.forbidden,
        findings: local.findings,
        ...(null == args.against ? {} : { against: args.against }),
    };
    if ('ok' !== local.verdict) {
        report.verdict = local.verdict;
        return report;
    }
    const m = local.manifest;
    report.manifest = m;
    let config;
    try {
        config = repoConfig(root, options, args);
    }
    catch (e) {
        return refusedPublish(report, e);
    }
    const target = args.to ?? config.write;
    report[null == args.to ? 'write' : 'to'] = target;
    // The repository's own predecessor, when one can be read: the highest
    // existing version is what compatibility is decided against.
    const reader = null == args.to ? http : dirHttp(args.to);
    const ctx = {
        options, http: reader, config: { ...config, private: [] },
        cache: options.cache ?? '', now, events: [], fetched: [], acquired: {}, count: 0,
    };
    const bases = null == args.to ? config.base : ['http://127.0.0.1'];
    try {
        const listed = await reader.get(bases[0].replace(/\/$/, '') + objectPath('list', m.package));
        if (200 === listed.status && null == args.against) {
            const list = await fetchList(ctx, bases, m.package);
            if (list.some((e) => e.version === m.version)) {
                refuse('version_exists', m.package + ' ' + m.version +
                    ' was published before and is never reusable', m.package);
            }
            const newest = list[list.length - 1];
            if (undefined !== newest) {
                const prior = await fetchManifest(ctx, bases, m.package, newest.version);
                if (null != prior.manifest.moved) {
                    refuse('path_moved', m.package + ' is frozen by a moved declaration (now ' +
                        prior.manifest.moved + ')', m.package);
                }
                const zip = await fetchArchive(ctx, bases, m.package, newest.version, prior.manifest);
                const entries = unpack(m.package, newest.version, zip, prior.manifest);
                // Under the project's own meta directory, so the predecessor's
                // imports resolve against the vendor tree the publisher synced.
                const tmp = (0, node_path_1.join)(root, mod_1.META_DIR, 'tmp', (0, node_crypto_1.randomBytes)(8).toString('hex'));
                (0, node_fs_1.mkdirSync)(tmp, { recursive: true });
                writeTree(tmp, entries);
                const gate = (0, pkg_1.pkgManifest)(root, options, tmp);
                (0, node_fs_1.rmSync)((0, node_path_1.join)(root, mod_1.META_DIR, 'tmp'), { recursive: true, force: true });
                report.against = m.package + ' ' + newest.version;
                report.findings = gate.findings;
                if ('ok' !== gate.verdict) {
                    report.verdict = gate.verdict;
                    return report;
                }
            }
        }
    }
    catch (e) {
        return refusedPublish(report, e);
    }
    if (null == args.to && 'public' !== m.publish && !isLoopback(target)) {
        return refusedPublish(report, new PkgRefusal('not_public', m.package + ' does not declare publish: public; nothing is uploaded', m.package));
    }
    const full = { ...m, published: timestamp(now()) };
    if (null != args.token) {
        const publisher = publisherFromToken((0, node_fs_1.readFileSync)(args.token, 'utf8'));
        if (undefined !== publisher) {
            full.publisher = publisher;
        }
    }
    const manifestBytes = utf8((0, pkg_1.manifestText)(full, options) + '\n');
    report.digest = (0, pkg_zip_1.sha256Hex)(manifestBytes);
    if (null != args.key) {
        try {
            report.signer = keyIdFromPem((0, node_fs_1.readFileSync)(args.key, 'utf8'));
        }
        catch (e) {
            return refusedPublish(report, e);
        }
    }
    if (true !== args.yes) {
        return report;
    }
    const proof = signDigest((0, node_fs_1.readFileSync)(args.key, 'utf8'), report.digest);
    const proofBytes = canonLine(proof, options, 'proof.aontu');
    const archive = (0, pkg_1.archiveOf)(root);
    try {
        if (null != args.to) {
            writeLayout(args.to, { manifest: full, manifestBytes, proofBytes, archive: archive.zip }, options, now());
        }
        else {
            const r = await http.post(target.replace(/\/$/, '') + exports.PUBLISH_PATH, { manifest: manifestBytes, proof: proofBytes, archive: archive.zip }, null == args.token ? '' : (0, node_fs_1.readFileSync)(args.token, 'utf8').trim());
            if (200 !== r.status && 201 !== r.status) {
                const doc = parseDoc(r.body);
                refuse('string' === typeof doc?.code ? doc.code : 'fetch_failed', 'string' === typeof doc?.message ? doc.message :
                    'the write path answered ' + r.status, m.package);
            }
        }
    }
    catch (e) {
        return refusedPublish(report, e);
    }
    report.verdict = 'sent';
    return report;
}
function refusedPublish(report, e) {
    if (!(e instanceof PkgRefusal)) {
        throw e;
    }
    report.verdict = 'refused';
    report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) };
    return report;
}
// `aontu pkg outdated`: for every locked package, the newest selectable
// version, and what a resolution taking it would move with it.
async function pkgOutdated(root, options, http, args = {}) {
    const report = { verdict: 'current', locked: [], events: [] };
    let ctx;
    try {
        ctx = makeCtx(root, options, http, args);
    }
    catch (e) {
        return refusedOutdated(report, e);
    }
    const locked = (0, pkg_1.readLock)(root);
    try {
        for (const key of Object.keys(locked).sort(pkg_zip_1.cmpBytes)) {
            const entry = locked[key];
            const pkg = entry.pkg ?? key;
            if (!(0, pkg_1.usableKey)(key) || '' === pkg) {
                continue;
            }
            const bases = basesFor(ctx, pkg);
            const list = await fetchList(ctx, bases, pkg);
            const advisory = await fetchAdvisory(ctx, bases, pkg);
            const newest = selectVersion(ctx, pkg, list, advisory, undefined, entry.v);
            const out = { key, v: entry.v, newest, moves: [] };
            if (null != advisory[entry.v]) {
                out.retracted = advisory[entry.v];
            }
            if (0 < (0, pkg_1.versionCompare)(newest, entry.v)) {
                out.moves = await movesWith(ctx, locked, key, pkg, newest);
                report.verdict = 'outdated';
            }
            else if (null != out.retracted) {
                report.verdict = 'outdated';
            }
            report.locked.push(out);
        }
    }
    catch (e) {
        report.events = ctx.events;
        return refusedOutdated(report, e);
    }
    report.events = ctx.events;
    return report;
}
// What a resolution taking `newest` for one key would move with it:
// minimum version selection over the repository's manifests, from the
// upgraded declaration down to the closure, against the lock.
async function movesWith(ctx, locked, key, pkg, newest) {
    const selected = {};
    const targets = {};
    for (const k of Object.keys(locked)) {
        selected[k] = locked[k].v;
        if (null != locked[k].pkg) {
            targets[k] = locked[k].pkg;
        }
    }
    selected[key] = newest;
    targets[key] = pkg;
    let frontier = [key];
    for (let depth = 0; 0 < frontier.length; depth++) {
        if (exports.LIMITS.depth <= depth) {
            refuse('module_depth', 'the closure under ' + pkg + ' nests past ' + exports.LIMITS.depth, pkg);
        }
        if (exports.LIMITS.closure < Object.keys(selected).length) {
            refuse('closure_too_large', 'the closure exceeds ' + exports.LIMITS.closure + ' packages', pkg);
        }
        const next = [];
        for (const k of frontier) {
            const target = targets[k] ?? k;
            if (!(0, pkg_1.usableKey)(k) || ((0, mod_1.isAlias)(k) && null == targets[k])) {
                continue;
            }
            const top = await fetchManifest(ctx, basesFor(ctx, target), target, selected[k]);
            const deps = top.manifest.deps;
            for (const dk of Object.keys(deps).sort(pkg_zip_1.cmpBytes)) {
                if (null != deps[dk].pkg) {
                    targets[dk] = deps[dk].pkg;
                }
                if (null == selected[dk] || 0 > (0, pkg_1.versionCompare)(selected[dk], deps[dk].v)) {
                    selected[dk] = deps[dk].v;
                    next.push(dk);
                }
            }
        }
        frontier = next;
    }
    return Object.keys(selected).sort(pkg_zip_1.cmpBytes)
        .filter((k) => k !== key && selected[k] !== locked[k]?.v)
        .map((k) => k + ' ' + (null == locked[k] ? 'unlocked' : locked[k].v) + ' -> ' + selected[k]);
}
function refusedOutdated(report, e) {
    if (!(e instanceof PkgRefusal)) {
        throw e;
    }
    report.verdict = 'refused';
    report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) };
    return report;
}
// THE LOCAL REGISTRY AND PROXY (`aontu pkg serve`): the directory
// layout served verbatim; with upstreams, fetched on a miss and kept.
const OBJECT_RE = /^\/(pkg\/[A-Za-z0-9!._/-]+\/@v\/(list|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(zip|manifest|sig|sigstore\.json))|pkg\/[A-Za-z0-9!._/-]+\/@latest|advisory\/[A-Za-z0-9!._/-]+\.aontu|tombstone\/(feed\.aontu|[A-Za-z0-9!._/-]+\/@v\/(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.aontu))$/;
function objectShape(p) {
    return OBJECT_RE.test(p) && !p.split('/').some((e) => '' === e && p.indexOf('//') >= 0) &&
        !p.split('/').some((e) => '.' === e || '..' === e);
}
function objectMutable(p) {
    return p.endsWith('/list') || p.endsWith('/@latest') || p.startsWith('/advisory/') ||
        p.startsWith('/tombstone/');
}
function contentType(p) {
    return p.endsWith('.zip') ? 'application/zip' :
        p.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8';
}
// One request: the shape gate, the directory, then the upstreams.
async function serveObject(opts, p) {
    if (!objectShape(p)) {
        return { status: 404, body: utf8('not an object path\n') };
    }
    const file = (0, node_path_1.join)(opts.dir, ...p.split('/').filter((e) => '' !== e));
    const have = (0, node_fs_1.existsSync)(file) && (0, node_fs_1.statSync)(file).isFile();
    const mutable = objectMutable(p);
    if (have && !mutable) {
        return { status: 200, body: new Uint8Array((0, node_fs_1.readFileSync)(file)) };
    }
    for (const up of opts.upstream) {
        const r = await opts.http.get(up.replace(/\/$/, '') + p);
        if (200 === r.status) {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(file), { recursive: true });
            (0, node_fs_1.writeFileSync)(file, r.body);
            return { status: 200, body: r.body };
        }
    }
    if (have) {
        return { status: 200, body: new Uint8Array((0, node_fs_1.readFileSync)(file)), stale: 0 < opts.upstream.length };
    }
    return { status: 404, body: utf8('no such object\n') };
}
function startServe(opts) {
    const handler = (req, res) => {
        if ('GET' !== req.method && 'HEAD' !== req.method) {
            res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('the read path is GET\n');
            return;
        }
        const p = new URL(req.url, 'http://localhost').pathname;
        serveObject(opts, p).then((r) => {
            const headers = {
                'content-type': 200 === r.status ? contentType(p) : 'text/plain; charset=utf-8',
                'cache-control': objectMutable(p) ? 'max-age=60' : 'max-age=31536000, immutable',
            };
            if (true === r.stale) {
                headers['x-aontu-stale'] = 'no upstream answered; served from the cache';
            }
            res.writeHead(r.status, headers);
            res.end('HEAD' === req.method ? undefined : Buffer.from(r.body));
        });
    };
    const server = (0, node_http_1.createServer)(handler);
    const [host, port] = splitListen(opts.listen);
    return new Promise((resolveServed, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            const addr = server.address();
            resolveServed({
                url: servedUrl(addr.address, addr.port),
                server,
                close: () => new Promise((done) => server.close(() => done())),
            });
        });
    });
}
// An IPv6 address is bracketed in a URL.
function servedUrl(address, port) {
    return 'http://' + (address.includes(':') ? '[' + address + ']' : address) + ':' + port;
}
function splitListen(listen) {
    const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(listen);
    if (null != bracketed) {
        const port = Number(bracketed[2]);
        return [bracketed[1], undefined !== bracketed[2] && Number.isInteger(port) ? port : 8017];
    }
    const at = listen.lastIndexOf(':');
    if (0 > at) {
        return [listen, 8017];
    }
    const port = Number(listen.slice(at + 1));
    return [listen.slice(0, at), Number.isInteger(port) ? port : 8017];
}
// A body read no further than the archive cap: what comes back past
// it is over the cap by construction, and every reader refuses it.
async function readBounded(r, max) {
    const chunks = [];
    let total = 0;
    const reader = r.body?.getReader();
    for (; undefined !== reader && total <= max;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        total += value.length;
    }
    if (undefined !== reader && total > max) {
        await reader.cancel();
    }
    return new Uint8Array(Buffer.concat(chunks));
}
// THE ADAPTER: the platform's fetch, and the multipart a publish sends.
function defaultHttp() {
    return {
        get: async (url) => {
            try {
                const r = await fetch(url, { redirect: 'manual' });
                return { status: r.status, body: await readBounded(r, pkg_1.ARCHIVE_LIMITS.bytes) };
            }
            catch {
                return { status: 0, body: new Uint8Array() };
            }
        },
        post: async (url, parts, token) => {
            const form = new FormData();
            form.set('manifest', new Blob([Buffer.from(parts.manifest)], { type: 'text/plain' }), 'manifest.aontu');
            form.set('proof', new Blob([Buffer.from(parts.proof)], { type: 'text/plain' }), 'proof.aontu');
            form.set('archive', new Blob([Buffer.from(parts.archive)], { type: 'application/zip' }), 'archive.zip');
            try {
                const r = await fetch(url, {
                    method: 'POST', body: form,
                    headers: '' === token ? {} : { authorization: 'Bearer ' + token },
                });
                return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) };
            }
            catch {
                return { status: 0, body: new Uint8Array() };
            }
        },
    };
}
//# sourceMappingURL=pkg-net.js.map