/* Copyright (c) 2025 Richard Rodger, MIT License */


// THE CLIENT HALF OF THE PACKAGE REPOSITORY (aontu-lang/system, spec/):
// acquisition, sync, publication and the local registry, over one
// injected transport. Every decision is above the seam; the adapter
// below it is the platform's fetch and nothing else.

import {
  createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify,
  randomBytes, generateKeyPairSync,
} from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync,
  renameSync, statSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import { join as pathJoin, dirname as pathDirname } from 'node:path'

import {
  isAlias, moduleDir, escapeElem, cacheStoreDir,
  cacheDownloadDir, cacheSeenDir, PKG_FILE, LOCK_FILE, META_DIR, VENDOR_DIR,
  lockJson, MODULE_MAX_DEPTH,
} from './mod'
import {
  declaredDeps, versionCompare, usableKey, readLock, lockText, packageSelf,
  archiveOf, archiveAdmits, pkgManifest, manifestText, pkgVerify, pkgResolve,
  vendorCopy, copyTree, writeLock, targetOf, relPathError, MANIFEST_SCHEMA, VERSION_RE, ARCHIVE_LIMITS,
} from './pkg'
import type {
  PkgToolOptions, LockEntry, Dependency, PkgManifest, PkgManifestReport,
  PkgMismatch, ArchiveFile,
} from './pkg'
import { unzipCanonical, sha256Hex, cmpBytes } from './pkg-zip'


export type HttpResponse = { status: number, body: Uint8Array }

export type PublishParts = {
  manifest: Uint8Array
  proof: Uint8Array
  archive: Uint8Array
}

// The seam. `get` reads one object; `post` sends one publish.
export type PkgHttp = {
  get: (url: string) => Promise<HttpResponse>
  post: (url: string, parts: PublishParts, token: string) => Promise<HttpResponse>
}


export const DEFAULT_BASE = 'https://pkg.aontu.dev'
export const DEFAULT_WRITE = 'https://publish.aontu.dev'
export const PUBLISH_PATH = '/v1/publish'

export const COOLDOWN_HOURS = 72
export const CLOSURE_MAX = 1024

// The closure bounds, as a record so a test can lower them.
export const LIMITS = { depth: MODULE_MAX_DEPTH, closure: CLOSURE_MAX }
export const ARCHIVE_MAX_BYTES = ARCHIVE_LIMITS.bytes
export const ARCHIVE_MAX_UNPACKED = ARCHIVE_LIMITS.unpacked
export const ARCHIVE_MAX_FILES = ARCHIVE_LIMITS.files
export const ARCHIVE_MAX_FILE_BYTES = ARCHIVE_LIMITS.fileBytes

export const SIGNATURE_ENCODING = 'aontu-signature/v1'

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const CANON_RE = /^aon1-[A-Za-z0-9_-]{43}$/
const KEY_ID_RE = /^ed25519:[A-Za-z0-9_-]{43}$/
const SIG_RE = /^[A-Za-z0-9_-]{86}$/
const PATTERN_RE =
  /^\*$|^[a-z0-9.-]+$|^[a-z0-9.-]+\/[A-Za-z0-9._/-]+$|^[a-z0-9.-]+\/\*$|^[a-z0-9.-]+\/[A-Za-z0-9._/-]+\/\*$/


export type TrustEntry = { signer: string, inclusion: 'required' | 'none' }

export type RepoConfig = {
  base: string[]
  write: string
  private: string[]
  privateBase: string[]
  trust: Record<string, TrustEntry>
}

export type PkgEvent = { code: string, message: string }

export type PkgRefusalReport = { code: string, message: string, pkg?: string }


export class PkgRefusal extends Error {
  code: string
  pkg?: string
  constructor(code: string, message: string, pkg?: string) {
    super(message)
    this.code = code
    if (null != pkg) {
      this.pkg = pkg
    }
  }
}

function refuse(code: string, message: string, pkg?: string): never {
  throw new PkgRefusal(code, message, pkg)
}


export function isLoopback(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  }
  catch {
    return false
  }
  return 'http:' === u.protocol &&
    ('127.0.0.1' === u.hostname || 'localhost' === u.hostname || '[::1]' === u.hostname)
}

// A base is https, or http on a loopback host (ADR-039 part 10).
export function baseAdmitted(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  }
  catch {
    return false
  }
  return 'https:' === u.protocol || isLoopback(url)
}


export type RepoOverrides = { base?: string[], write?: string }

// The project's trust configuration: `repo` in its package file, with
// the defaults where it is silent, and the command line over both.
export function repoConfig(root: string, options: PkgToolOptions,
  overrides: RepoOverrides = {}): RepoConfig {
  const file = pathJoin(root, PKG_FILE)
  const gen: any = existsSync(file) ?
    options.eval(readFileSync(file, 'utf8'), file).gen : undefined
  const repo: any = gen?.repo ?? {}
  const strs = (v: any): string[] =>
    Array.isArray(v) ? v.filter((s: any) => 'string' === typeof s) : []

  const trust: Record<string, TrustEntry> = {
    '*': { signer: 'forge', inclusion: 'required' },
  }
  const declared = repo.trust
  if (null != declared && 'object' === typeof declared) {
    for (const pattern of Object.keys(declared)) {
      const e = declared[pattern]
      if (!PATTERN_RE.test(pattern) || null == e || 'object' !== typeof e) {
        refuse('config_invalid', 'repo.trust: ' + pattern + ' is not a pattern')
      }
      const signer = 'string' === typeof e.signer ? e.signer : ''
      if ('forge' !== signer && !KEY_ID_RE.test(signer)) {
        refuse('config_invalid',
          'repo.trust: ' + pattern + ' names no signer (forge, or ed25519:<key>)')
      }
      trust[pattern] = {
        signer, inclusion: 'none' === e.inclusion ? 'none' : 'required',
      }
    }
  }

  const priv = strs(repo.private)
  for (const p of priv) {
    if (!PATTERN_RE.test(p)) {
      refuse('config_invalid', 'repo.private: ' + p + ' is not a pattern')
    }
  }
  // A package the project itself marks private is on the list by that
  // fact alone (spec private.prefix_list.derived).
  const self = packageSelf(root, options)
  if ('' !== self.path && 'private' === self.publish && !priv.includes(self.path)) {
    priv.push(self.path)
  }

  const base = overrides.base ?? (0 < strs(repo.base).length ? strs(repo.base) : [DEFAULT_BASE])
  const write = overrides.write ?? ('string' === typeof repo.write ? repo.write : DEFAULT_WRITE)
  for (const b of [...base, write, ...strs(repo.private_base)]) {
    if (!baseAdmitted(b)) {
      refuse('base_not_https', 'repository base is not https: ' + b)
    }
  }

  return { base, write, private: priv, privateBase: strs(repo.private_base), trust }
}


// A pattern is a path, a path with `/*` beneath it, or `*` alone.
export function patternMatches(pattern: string, pkg: string): boolean {
  if ('*' === pattern) {
    return true
  }
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return pkg === prefix || pkg.startsWith(prefix + '/')
  }
  return pattern === pkg
}

// The most specific entry: an exact path, then the longest prefix,
// then the default.
export function trustEntryFor(config: RepoConfig, pkg: string): TrustEntry {
  let best = '*'
  for (const pattern of Object.keys(config.trust)) {
    if (!patternMatches(pattern, pkg)) {
      continue
    }
    if (pattern === pkg || (best !== pkg && pattern.length > best.length)) {
      best = pattern
    }
  }
  return config.trust[best]
}

export function isPrivateName(config: RepoConfig, pkg: string): boolean {
  return config.private.some((p) => patternMatches(p, pkg))
}


// The read-path layout (spec layout.objects).
export function pkgUrlPath(pkg: string): string {
  return pkg.split('/').map(escapeElem).join('/')
}

export function objectPath(kind: string, pkg: string, version?: string): string {
  const p = '/pkg/' + pkgUrlPath(pkg)
  switch (kind) {
    case 'list': return p + '/@v/list'
    case 'latest': return p + '/@latest'
    case 'archive': return p + '/@v/' + version + '.zip'
    case 'manifest': return p + '/@v/' + version + '.manifest'
    case 'signature': return p + '/@v/' + version + '.sig'
    case 'sigstore': return p + '/@v/' + version + '.sigstore.json'
    case 'advisory': return '/advisory/' + pkgUrlPath(pkg) + '.aon'
    default: return '/tombstone/' + pkgUrlPath(pkg) + '/@v/' + version + '.aon'
  }
}


export function timestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}


const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'))
const text = (b: Uint8Array): string => Buffer.from(b).toString('utf8')

function parseDoc(b: Uint8Array): any {
  try {
    return JSON.parse(lockJson(text(b)))
  }
  catch {
    return undefined
  }
}

// One canonical line, the form every stored object takes.
function canonLine(obj: any, options: PkgToolOptions, name: string): Uint8Array {
  return utf8(options.eval(JSON.stringify(obj), name).canon + '\n')
}


// THE KEY PROVIDER (ADR-024 part 4): an Ed25519 key signs the manifest's
// digest, domain-separated by the encoding name.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function signedBytes(over: string): Buffer {
  return Buffer.from(SIGNATURE_ENCODING + '\n' + over + '\n', 'utf8')
}

export function keyIdOf(publicKeyDer: Uint8Array): string {
  const raw = Buffer.from(publicKeyDer).subarray(publicKeyDer.length - 32)
  return 'ed25519:' + raw.toString('base64url')
}

// The signing key is an Ed25519 private key and nothing else: another
// kind signs, and every consumer refuses the proof, so it is refused
// here first.
function signingKey(pem: string): KeyObject {
  let priv: KeyObject
  try {
    priv = createPrivateKey(pem)
  }
  catch {
    refuse('key_invalid', 'the key file is not a PEM private key', '')
  }
  if ('ed25519' !== priv.asymmetricKeyType) {
    refuse('key_invalid', 'the key is ' + priv.asymmetricKeyType + ', not ed25519', '')
  }
  return priv
}

export function keyIdFromPem(pem: string): string {
  const der = createPublicKey(signingKey(pem)).export({ format: 'der', type: 'spki' })
  return keyIdOf(new Uint8Array(der))
}

// `aontu pkg keygen`: a new signing key, written once. The answer is
// the signer id a consumer names, or the reason nothing was written.
export function keygen(file: string): { signer?: string, refused?: string } {
  if (existsSync(file)) {
    return { refused: file + ' exists; a key is written once' }
  }
  const pem = generateKeyPairSync('ed25519').privateKey
    .export({ format: 'pem', type: 'pkcs8' }) as string
  mkdirSync(pathDirname(file), { recursive: true })
  writeFileSync(file, pem, { mode: 0o600 })
  return { signer: keyIdFromPem(pem) }
}

export type KeyProof = {
  kind: 'key'
  encoding: typeof SIGNATURE_ENCODING
  over: string
  signer: string
  signature: string
}

export function signDigest(pem: string, over: string): KeyProof {
  const priv = signingKey(pem)
  const sig = cryptoSign(null, signedBytes(over), priv)
  return {
    kind: 'key',
    encoding: SIGNATURE_ENCODING,
    over,
    signer: keyIdFromPem(pem),
    signature: Buffer.from(sig).toString('base64url'),
  }
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
])

export function smallOrderKey(raw: Uint8Array): boolean {
  const y = Buffer.from(raw)
  y[31] &= 0x7f
  const hex = y.toString('hex')
  return SMALL_ORDER_Y.has(hex) || (hex.endsWith('ff'.repeat(30) + '7f') && 0xed <= y[0])
}

// Base64url that decodes and re-encodes to itself: Buffer drops
// trailing bits silently, so a signature has one spelling here.
function canonicalBase64url(text: string, length: number): Buffer | undefined {
  const bytes = Buffer.from(text, 'base64url')
  return length === bytes.length && bytes.toString('base64url') === text ? bytes : undefined
}

export function verifyKeyProof(proof: any, over: string, signer: string): string | undefined {
  if (null == proof || 'key' !== proof.kind || SIGNATURE_ENCODING !== proof.encoding ||
    'string' !== typeof proof.signature || !KEY_ID_RE.test(proof.signer ?? '')) {
    return 'the proof is not an aontu-signature/v1 key proof'
  }
  if (proof.over !== over) {
    return 'the proof signs ' + proof.over + ', not this manifest'
  }
  if (proof.signer !== signer) {
    return 'signed by ' + proof.signer + '; the trust entry accepts ' + signer
  }
  const raw = canonicalBase64url(proof.signer.slice('ed25519:'.length), 32)
  const sig = SIG_RE.test(proof.signature) ? canonicalBase64url(proof.signature, 64) : undefined
  if (undefined === raw || undefined === sig) {
    return 'the proof carries a malformed key or signature'
  }
  if (smallOrderKey(raw)) {
    return 'the signer is a key of small order'
  }
  const key = createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki',
  })
  return cryptoVerify(null, signedBytes(over), key, sig) ?
    undefined : 'the signature does not verify'
}


// A package path: domain-shaped, the element rules, never an alias.
export function packagePath(s: any): boolean {
  return 'string' === typeof s && !isAlias(s) && usableKey(s)
}


// T.Manifest, checked field by field: a served object is input.
export function manifestError(m: any): string | undefined {
  if (null == m || 'object' !== typeof m || MANIFEST_SCHEMA !== m.schema) {
    return 'schema is not ' + MANIFEST_SCHEMA
  }
  if (!packagePath(m.package)) {
    return 'package is not a package path'
  }
  if ('string' !== typeof m.version || !VERSION_RE.test(m.version)) {
    return 'version is not MAJOR.MINOR.PATCH'
  }
  if ('public' !== m.publish && 'private' !== m.publish) {
    return 'publish is not public or private'
  }
  const a = m.archive
  if (null == a || 'zip' !== a.format || !DIGEST_RE.test(a.digest ?? '') ||
    !Number.isInteger(a.size) || !Array.isArray(a.files) || 0 === a.files.length) {
    return 'archive is not a zip with a digest, a size and files'
  }
  for (const f of a.files) {
    if ('string' !== typeof f?.path || !DIGEST_RE.test(f.digest ?? '') ||
      !Number.isInteger(f.size) || undefined !== relPathError(f.path)) {
      return 'archive.files names a file without a path, a digest and a size'
    }
  }
  if (!Array.isArray(m.modules) || 1 !== m.modules.length ||
    m.modules[0]?.path !== m.package || 'string' !== typeof m.modules[0]?.main ||
    !CANON_RE.test(m.modules[0]?.canon ?? '')) {
    return 'modules is not the one module at the package path with an entry and a canon-hash'
  }
  if (undefined !== relPathError(m.modules[0].main) ||
    !a.files.some((f: any) => f.path === m.modules[0].main)) {
    return 'modules names an entry the archive does not hold'
  }
  if (null == m.deps || 'object' !== typeof m.deps || Array.isArray(m.deps)) {
    return 'deps is not a map'
  }
  for (const k of Object.keys(m.deps)) {
    const d = m.deps[k]
    if ('string' !== typeof d?.v || !VERSION_RE.test(d.v) ||
      (null != d.pkg && !packagePath(d.pkg))) {
      return 'deps.' + k + ' is not a minimum version'
    }
  }
  if ('string' !== typeof m.published) {
    return 'published is not a timestamp'
  }
  if (null != m.moved && !packagePath(m.moved)) {
    return 'moved is not a package path'
  }
  if (null != m.retract && (!Array.isArray(m.retract) ||
    m.retract.some((v: any) => 'string' !== typeof v || !VERSION_RE.test(v)))) {
    return 'retract is not a list of versions'
  }
  return undefined
}


// A path inside an archive: forward slashes, the element rules, never
// absolute and never escaping.
export { relPathError }


type Acquired = {
  pkg: string
  version: string
  canon: string
  archive: string
  manifestDigest: string
  deps: Record<string, Dependency>
  dir: string
  // The lock entries of the whole closure beneath it: what the module
  // was evaluated against, so a dependant evaluates against the same.
  closure: LockEntry[]
}

type AcquireCtx = {
  options: PkgToolOptions
  http: PkgHttp
  config: RepoConfig
  cache: string
  now: () => Date
  events: PkgEvent[]
  fetched: string[]
  acquired: Record<string, Acquired>
  count: number
}

type VersionEntry = { version: string, seen: string }


async function getObject(ctx: AcquireCtx, bases: string[], path: string):
  Promise<HttpResponse & { base: string }> {
  let last: HttpResponse & { base: string } = { status: 0, body: new Uint8Array(), base: '' }
  for (const base of bases) {
    const r = await ctx.http.get(base.replace(/\/$/, '') + path)
    if (200 === r.status) {
      return { ...r, base }
    }
    last = { ...r, base }
  }
  return last
}


function basesFor(ctx: AcquireCtx, pkg: string): string[] {
  if (!isPrivateName(ctx.config, pkg)) {
    return ctx.config.base
  }
  if (0 === ctx.config.privateBase.length) {
    refuse('private_name_public_path',
      pkg + ' is on the private list and repo.private_base names no repository', pkg)
  }
  return ctx.config.privateBase
}


async function fetchList(ctx: AcquireCtx, bases: string[], pkg: string):
  Promise<VersionEntry[]> {
  const r = await getObject(ctx, bases, objectPath('list', pkg))
  if (200 !== r.status) {
    refuse('fetch_failed', 'no version list for ' + pkg +
      (0 === r.status ? ' (no repository answered)' : ' (' + r.status + ' from ' + r.base + ')'),
    pkg)
  }
  const doc = parseDoc(r.body)
  if (doc?.package !== pkg || !Array.isArray(doc?.versions)) {
    refuse('response_mismatch', 'the version list served does not name ' + pkg, pkg)
  }
  const versions: VersionEntry[] = []
  for (const e of doc.versions) {
    if ('string' !== typeof e?.version || !VERSION_RE.test(e.version) ||
      'string' !== typeof e?.seen) {
      refuse('response_mismatch', 'the version list for ' + pkg + ' is malformed', pkg)
    }
    versions.push({ version: e.version, seen: e.seen })
  }
  versions.sort((a, b) => versionCompare(a.version, b.version))
  // Every version the list offers is a version this client has seen:
  // its absence later is a rollback whichever version was taken.
  if ('' !== ctx.cache) {
    const subject = trustEntryFor(ctx.config, pkg).signer
    for (const e of versions) {
      recordSeen(ctx, pkg, e.version, subject)
    }
  }
  return versions
}


async function fetchAdvisory(ctx: AcquireCtx, bases: string[], pkg: string):
  Promise<Record<string, string>> {
  const r = await getObject(ctx, bases, objectPath('advisory', pkg))
  const out: Record<string, string> = {}
  if (200 !== r.status) {
    return out
  }
  const doc = parseDoc(r.body)
  for (const e of Array.isArray(doc?.retracted) ? doc.retracted : []) {
    if ('string' === typeof e?.version && 'string' === typeof e?.by) {
      out[e.version] = e.by
    }
  }
  return out
}


// The versions this client has seen for a package, from its own
// records: a version absent from the list now is a rollback.
function seenVersions(ctx: AcquireCtx, pkg: string): string[] {
  const dir = cacheSeenDir(ctx.cache, pkg)
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir).filter((f) => f.endsWith('.aon'))
    .map((f) => f.slice(0, -'.aon'.length)).sort(cmpBytes)
}

function recordSeen(ctx: AcquireCtx, pkg: string, version: string, subject: string): void {
  const dir = cacheSeenDir(ctx.cache, pkg)
  const file = pathJoin(dir, version + '.aon')
  if (existsSync(file)) {
    return
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, canonLine(
    { package: pkg, version, seen: timestamp(ctx.now()), subject }, ctx.options, 'seen.aon'))
}


// Selection (spec acquire step 6): the newest version outside the
// cooldown, timed from the repository's first-seen time (ADR-039 part
// 9), not retracted. A version named explicitly is taken as it is.
function selectVersion(ctx: AcquireCtx, pkg: string, list: VersionEntry[],
  advisory: Record<string, string>, asked: string | undefined,
  fallback?: string): string {
  if (undefined !== asked) {
    return asked
  }
  const priv = isPrivateName(ctx.config, pkg)
  const now = ctx.now().getTime()
  let held: VersionEntry | undefined
  for (let i = list.length - 1; 0 <= i; i--) {
    const e = list[i]
    if (null != advisory[e.version]) {
      continue
    }
    const seen = Date.parse(e.seen)
    const until = seen + COOLDOWN_HOURS * 3600 * 1000
    if (!priv && (Number.isNaN(seen) || now < until)) {
      held = held ?? e
      continue
    }
    if (null != held) {
      ctx.events.push({
        code: 'cooldown_pending',
        message: pkg + ' ' + held.version + ' is inside the cooldown until ' +
          timestamp(new Date(Date.parse(held.seen) + COOLDOWN_HOURS * 3600 * 1000)) +
          '; ' + e.version + ' was selected',
      })
    }
    return e.version
  }
  const why = null == held ? pkg + ' has no selectable version' :
    pkg + ' ' + held.version + ' is inside the cooldown until ' +
    timestamp(new Date(Date.parse(held.seen) + COOLDOWN_HOURS * 3600 * 1000)) +
    ' and no earlier version is selectable'
  if (undefined !== fallback) {
    ctx.events.push({ code: 'cooldown_pending', message: why })
    return fallback
  }
  refuse(null == held ? 'fetch_failed' : 'cooldown_pending', why, pkg)
}


async function fetchManifest(ctx: AcquireCtx, bases: string[], pkg: string,
  version: string): Promise<{ bytes: Uint8Array, manifest: any }> {
  const cached = pathJoin(cacheDownloadDir(ctx.cache, pkg), version + '.manifest')
  let bytes: Uint8Array
  if (existsSync(cached)) {
    bytes = new Uint8Array(readFileSync(cached))
  }
  else {
    const r = await getObject(ctx, bases, objectPath('manifest', pkg, version))
    if (200 !== r.status) {
      const t = await getObject(ctx, bases, objectPath('tombstone', pkg, version))
      if (200 === t.status) {
        const doc = parseDoc(t.body)
        refuse('tombstoned', pkg + ' ' + version + ' was withdrawn by the repository' +
          ('string' === typeof doc?.reason ? ' (' + doc.reason + ')' : ''), pkg)
      }
      refuse('fetch_failed', 'no manifest for ' + pkg + ' ' + version, pkg)
    }
    bytes = r.body
  }
  const manifest = parseDoc(bytes)
  const bad = manifestError(manifest)
  if (undefined !== bad) {
    refuse('manifest_invalid', 'the manifest for ' + pkg + ' ' + version + ': ' + bad, pkg)
  }
  if (manifest.package !== pkg || manifest.version !== version) {
    refuse('response_mismatch', 'the manifest served names ' + manifest.package + ' ' +
      manifest.version + ', not ' + pkg + ' ' + version, pkg)
  }
  return { bytes, manifest }
}


async function fetchProof(ctx: AcquireCtx, bases: string[], pkg: string,
  version: string, entry: TrustEntry, manifestDigest: string): Promise<Uint8Array> {
  if ('forge' === entry.signer) {
    refuse('proof_signer_untrusted', 'the trust entry for ' + pkg +
      ' names the forge signer, and this build verifies key proofs only;' +
      ' name a key under repo.trust', pkg)
  }
  const cached = pathJoin(cacheDownloadDir(ctx.cache, pkg), version + '.sig')
  let bytes: Uint8Array
  if (existsSync(cached)) {
    bytes = new Uint8Array(readFileSync(cached))
  }
  else {
    const r = await getObject(ctx, bases, objectPath('signature', pkg, version))
    if (200 !== r.status) {
      refuse('proof_missing', 'no proof is served for ' + pkg + ' ' + version, pkg)
    }
    bytes = r.body
  }
  const bad = verifyKeyProof(parseDoc(bytes), manifestDigest, entry.signer)
  if (undefined !== bad) {
    refuse(bad.startsWith('signed by') ? 'proof_signer_untrusted' : 'proof_invalid',
      'the proof for ' + pkg + ' ' + version + ': ' + bad, pkg)
  }
  if ('required' === entry.inclusion) {
    refuse('inclusion_missing', 'the trust entry for ' + pkg +
      ' requires log inclusion, which a key proof does not carry in this build;' +
      ' set inclusion: none for a key signer', pkg)
  }
  return bytes
}


async function fetchArchive(ctx: AcquireCtx, bases: string[], pkg: string,
  version: string, manifest: any): Promise<Uint8Array> {
  const cached = pathJoin(cacheDownloadDir(ctx.cache, pkg), version + '.zip')
  let bytes: Uint8Array
  if (existsSync(cached)) {
    bytes = new Uint8Array(readFileSync(cached))
  }
  else {
    const r = await getObject(ctx, bases, objectPath('archive', pkg, version))
    if (200 !== r.status) {
      refuse('fetch_failed', 'no archive for ' + pkg + ' ' + version, pkg)
    }
    bytes = r.body
  }
  if (ARCHIVE_LIMITS.bytes < bytes.length) {
    refuse('archive_too_large', 'the archive for ' + pkg + ' ' + version +
      ' is over the compressed cap', pkg)
  }
  const digest = sha256Hex(bytes)
  if (digest !== manifest.archive.digest) {
    refuse('archive_digest_mismatch', 'the archive for ' + pkg + ' ' + version +
      ' is ' + digest + ', not ' + manifest.archive.digest, pkg)
  }
  return bytes
}


// Unpack (spec acquire step 11): the entry rules the write path applies,
// applied again here, because only this protects against a hostile
// mirror; then every file against the manifest.
function unpack(pkg: string, version: string, zip: Uint8Array, manifest: any):
  { path: string, data: Uint8Array }[] {
  let entries: { path: string, data: Uint8Array }[]
  try {
    entries = unzipCanonical(zip)
  }
  catch (e: any) {
    refuse('archive_not_canonical', 'the archive for ' + pkg + ' ' + version + ': ' +
      e.message, pkg)
  }
  if (ARCHIVE_LIMITS.files < entries.length) {
    refuse('archive_too_many_files', 'the archive for ' + pkg + ' ' + version +
      ' is over the file-count cap', pkg)
  }
  let total = 0
  const listed = new Map<string, ArchiveFile>(
    manifest.archive.files.map((f: ArchiveFile) => [f.path, f]))
  for (const e of entries) {
    const bad = relPathError(e.path)
    if (undefined !== bad) {
      refuse('archive_path_invalid', 'the archive for ' + pkg + ' ' + version + ': ' +
        bad + ' (' + e.path + ')', pkg)
    }
    if (!archiveAdmits(e.path)) {
      refuse('archive_entry_forbidden', 'the archive for ' + pkg + ' ' + version +
        ' carries ' + e.path + ', which the allowlist does not admit', pkg)
    }
    total += e.data.length
    if (ARCHIVE_LIMITS.fileBytes < e.data.length || ARCHIVE_LIMITS.unpacked < total) {
      refuse('archive_bomb', 'the archive for ' + pkg + ' ' + version +
        ' unpacks past the size cap', pkg)
    }
    const f = listed.get(e.path)
    if (undefined === f || f.digest !== sha256Hex(e.data) || f.size !== e.data.length) {
      refuse('file_manifest_mismatch', 'the archive for ' + pkg + ' ' + version +
        ' holds ' + e.path + ', which the manifest does not list as served', pkg)
    }
    listed.delete(e.path)
  }
  if (0 < listed.size) {
    refuse('file_manifest_mismatch', 'the archive for ' + pkg + ' ' + version +
      ' lacks ' + [...listed.keys()].sort(cmpBytes)[0] + ', which the manifest lists', pkg)
  }
  return entries
}


function writeTree(dir: string, entries: { path: string, data: Uint8Array }[]): void {
  for (const e of entries) {
    const full = pathJoin(dir, ...e.path.split('/'))
    mkdirSync(pathDirname(full), { recursive: true })
    writeFileSync(full, e.data)
  }
}


// ACQUIRE (spec ops.acquire): one package, its deps first, the pins
// checked in order -- proof, bytes, meaning -- then recorded, cached
// and returned for the lock.
export async function acquire(ctx: AcquireCtx, pkg: string, asked: string | undefined,
  depth: number): Promise<Acquired> {
  if (LIMITS.depth <= depth) {
    refuse('module_depth', 'the closure under ' + pkg + ' nests past ' + LIMITS.depth, pkg)
  }
  if (LIMITS.closure <= ctx.count) {
    refuse('closure_too_large', 'the closure exceeds ' + LIMITS.closure + ' packages', pkg)
  }
  const bases = basesFor(ctx, pkg)
  const entry = trustEntryFor(ctx.config, pkg)

  const list = await fetchList(ctx, bases, pkg)
  // A version seen before and gone from the list is a rollback, unless
  // the repository says why: a tombstone stands where it was.
  for (const v of seenVersions(ctx, pkg)) {
    if (!list.some((e) => e.version === v) &&
      200 !== (await getObject(ctx, bases, objectPath('tombstone', pkg, v))).status) {
      refuse('list_rollback', pkg + ' ' + v + ' was seen before and is absent from the list', pkg)
    }
  }
  const advisory = await fetchAdvisory(ctx, bases, pkg)
  const version = selectVersion(ctx, pkg, list, advisory, asked)
  const newest = list[list.length - 1]?.version
  if (undefined !== asked && !list.some((e) => e.version === asked)) {
    const t = await getObject(ctx, bases, objectPath('tombstone', pkg, asked))
    if (200 === t.status) {
      const doc = parseDoc(t.body)
      refuse('tombstoned', pkg + ' ' + asked + ' was withdrawn by the repository' +
        ('string' === typeof doc?.reason ? ' (' + doc.reason + ')' : ''), pkg)
    }
    refuse('fetch_failed', pkg + ' ' + asked + ' is not in the version list', pkg)
  }

  const id = pkg + '@' + version
  const had = ctx.acquired[id]
  if (undefined !== had) {
    return had
  }
  ctx.count++

  // The newest version speaks for the name: a move declared there
  // refuses every version, and nothing follows it.
  if (undefined !== newest && newest !== version) {
    const top = await fetchManifest(ctx, bases, pkg, newest)
    if (null != top.manifest.moved) {
      refuse('module_moved', pkg + ' moved to ' + top.manifest.moved +
        '; import that instead, nothing follows a move', pkg)
    }
  }
  const { bytes: manifestBytes, manifest } = await fetchManifest(ctx, bases, pkg, version)
  if (null != manifest.moved) {
    refuse('module_moved', pkg + ' moved to ' + manifest.moved +
      '; import that instead, nothing follows a move', pkg)
  }
  const manifestDigest = sha256Hex(manifestBytes)
  const proofBytes = await fetchProof(ctx, bases, pkg, version, entry, manifestDigest)
  const zip = await fetchArchive(ctx, bases, pkg, version, manifest)
  const entries = unpack(pkg, version, zip, manifest)

  // Deps first, at the minima the manifest declares: the module is
  // evaluated in its publisher's context, which is what its canon pins.
  const deps: Record<string, Dependency> = manifest.deps
  const pins: LockEntry[] = []
  for (const key of Object.keys(deps).sort(cmpBytes)) {
    const target = deps[key].pkg ?? key
    if (isAlias(key) && null == deps[key].pkg) {
      refuse('manifest_invalid', 'the manifest for ' + pkg + ' ' + version +
        ' declares ' + key + ' without the package it names', pkg)
    }
    const dep = await acquire(ctx, target, deps[key].v, depth + 1)
    pins.push({
      key, v: dep.version, canon: dep.canon, archive: dep.archive,
      manifest: dep.manifestDigest, ...(isAlias(key) ? { pkg: target } : {}),
    })
    for (const e of dep.closure) {
      if (!pins.some((p) => p.key === e.key)) {
        pins.push(e)
      }
    }
  }
  pins.sort((a, b) => cmpBytes(a.key, b.key))

  const tmp = pathJoin(ctx.cache, 'tmp', randomBytes(8).toString('hex'))
  mkdirSync(pathJoin(tmp, META_DIR), { recursive: true })
  writeTree(tmp, entries)
  writeFileSync(pathJoin(tmp, META_DIR, 'manifest.aon'), manifestBytes)
  writeFileSync(pathJoin(tmp, META_DIR, 'proof.aon'), proofBytes)
  const self = packageSelf(tmp, ctx.options)
  const mod = manifest.modules[0]
  if (self.path !== pkg || self.version !== version || self.main !== mod.main) {
    rmSync(tmp, { recursive: true, force: true })
    refuse('manifest_invalid', 'the package file inside ' + pkg + ' ' + version +
      ' disagrees with the manifest', pkg)
  }
  // The store tree keeps its own lock: the closure it was verified
  // against, so it verifies again from the cache alone. The vendored
  // copy loses it, and resolves against the consumer's lock instead.
  if (0 < pins.length) {
    writeLock(tmp, pins, ctx.options)
  }
  // The entry is in the archive: the manifest named it among the files
  // and every listed file was unpacked.
  const main = pathJoin(tmp, mod.main)
  const got = ctx.options.eval(readFileSync(main, 'utf8'), main)
  if (!got.ok || got.hash !== mod.canon) {
    rmSync(tmp, { recursive: true, force: true })
    refuse('module_integrity', pkg + ' ' + version + ' means ' +
      (!got.ok ? 'nothing (it does not evaluate)' : got.hash) +
      ', and the manifest pins ' + mod.canon, pkg)
  }

  const dir = cacheStoreDir(ctx.cache, got.hash, pkg)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(pathDirname(dir), { recursive: true })
  renameSync(tmp, dir)

  const down = cacheDownloadDir(ctx.cache, pkg)
  mkdirSync(down, { recursive: true })
  for (const [name, data] of [
    [version + '.zip', zip], [version + '.manifest', manifestBytes],
    [version + '.sig', proofBytes]] as [string, Uint8Array][]) {
    if (!existsSync(pathJoin(down, name))) {
      writeFileSync(pathJoin(down, name), data)
    }
  }
  recordSeen(ctx, pkg, version, entry.signer)

  const out: Acquired = {
    pkg, version, canon: got.hash, archive: sha256Hex(zip), manifestDigest,
    deps, dir, closure: pins,
  }
  ctx.acquired[id] = out
  ctx.fetched.push(pkg + ' ' + version)
  return out
}


export type PkgSyncReport = {
  verdict: 'ok' | 'frozen' | 'refused' | 'missing' | 'error' | 'mismatch' | 'unlocked'
  fetched: string[]
  lock: LockEntry[]
  vendored: string[]
  missing: string[]
  unevaluable: string[]
  forbidden: string[]
  mismatched: PkgMismatch[]
  unlocked: string[]
  changes: string[]
  events: PkgEvent[]
  refusal?: PkgRefusalReport
}

export type SyncArgs = RepoOverrides & {
  frozen?: boolean
  now?: () => Date
}


function emptySync(): PkgSyncReport {
  return {
    verdict: 'ok', fetched: [], lock: [], vendored: [], missing: [], unevaluable: [],
    forbidden: [], mismatched: [], unlocked: [], changes: [], events: [],
  }
}

function refused(report: PkgSyncReport, e: unknown): PkgSyncReport {
  if (!(e instanceof PkgRefusal)) {
    throw e
  }
  report.verdict = 'refused'
  report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) }
  return report
}


function makeCtx(root: string, options: PkgToolOptions, http: PkgHttp,
  args: SyncArgs): AcquireCtx {
  return {
    options, http, config: repoConfig(root, options, args),
    cache: options.cache as string,
    now: args.now ?? (() => new Date()),
    events: [], fetched: [], acquired: {}, count: 0,
  }
}


// Where the project already holds a package at a version: its vendor
// tree, when the tree's own file agrees, else the cache, when the
// download tree has that version's manifest.
function heldAt(root: string, key: string, pkg: string, version: string,
  ctx: AcquireCtx): string | undefined {
  const vendored = moduleDir(pathJoin(root, META_DIR, VENDOR_DIR), key)
  if (existsSync(pathJoin(vendored, PKG_FILE))) {
    const self = packageSelf(vendored, ctx.options)
    if (('' === self.version || self.version === version) &&
      ('' === self.path || self.path === pkg)) {
      return vendored
    }
  }
  const manifestFile = pathJoin(cacheDownloadDir(ctx.cache, pkg), version + '.manifest')
  if (existsSync(manifestFile)) {
    const m = parseDoc(new Uint8Array(readFileSync(manifestFile)))
    const canon = m?.modules?.[0]?.canon
    if ('string' === typeof canon) {
      const dir = cacheStoreDir(ctx.cache, canon, pkg)
      if (existsSync(pathJoin(dir, PKG_FILE))) {
        return dir
      }
    }
  }
  return undefined
}


// SYNC (spec ops.sync): resolve by MVS, fetch what is missing, vendor,
// lock, verify. Idempotent, and `--frozen` refuses to change the lock.
export async function pkgSync(root: string, options: PkgToolOptions, http: PkgHttp,
  args: SyncArgs = {}): Promise<PkgSyncReport> {
  const report = emptySync()
  let ctx: AcquireCtx
  try {
    ctx = makeCtx(root, options, http, args)
  }
  catch (e) {
    return refused(report, e)
  }

  const previous = readLock(root)
  const selected: Record<string, Dependency> = {}
  const dirs: Record<string, string> = {}
  const missing: string[] = []
  const pending = new Set<string>()
  const bid = (deps: Record<string, Dependency>) => {
    for (const key of Object.keys(deps)) {
      const have = selected[key]
      if (null == have || 0 > versionCompare(have.v, deps[key].v)) {
        selected[key] = { ...have, ...deps[key] }
        pending.add(key)
      }
    }
  }
  const target = (key: string) => targetOf(key, selected[key], previous[key])

  // Held packages are read before anything is fetched, so a held
  // dependant's bid raises a version before that version is requested.
  try {
    bid(declaredDeps(pathJoin(root, PKG_FILE), options))
    for (; 0 < pending.size;) {
      const keys = [...pending].sort(cmpBytes)
      let key = keys.find((k) => !usableKey(k) || '' === target(k))
      if (undefined !== key) {
        missing.push(key)
        pending.delete(key)
        continue
      }
      let dir: string | undefined
      for (const k of keys) {
        dir = heldAt(root, k, target(k), selected[k].v, ctx)
        if (undefined !== dir) {
          key = k
          break
        }
      }
      if (undefined === key) {
        key = keys.find((k) => true !== args.frozen || previous[k]?.v === selected[k].v)
        if (undefined === key) {
          for (const k of keys) {
            report.changes.push(k + ': ' + (previous[k]?.v ?? 'unlocked') + ' -> ' + selected[k].v)
          }
          report.verdict = 'frozen'
          return report
        }
        dir = (await acquire(ctx, target(key), selected[key].v, 0)).dir
      }
      pending.delete(key)
      dirs[key] = dir as string
      bid(declaredDeps(pathJoin(dir as string, PKG_FILE), options))
    }
  }
  catch (e) {
    report.events = ctx.events
    report.fetched = ctx.fetched.sort(cmpBytes)
    return refused(report, e)
  }

  report.events = ctx.events
  report.fetched = ctx.fetched.sort(cmpBytes)

  // Materialise: the closure into the vendor tree, and nothing else
  // left there.
  const vendorRoot = pathJoin(root, META_DIR, VENDOR_DIR)
  for (const key of Object.keys(dirs).sort(cmpBytes)) {
    const to = moduleDir(vendorRoot, key)
    if (dirs[key] !== to) {
      rmSync(to, { recursive: true, force: true })
      vendorCopy(dirs[key], to)
    }
    report.vendored.push(key)
  }
  // Pruning waits for the lock to be writable: a frozen sync that
  // refuses leaves the locked build whole.
  const prune = (): void => {
    for (const key of Object.keys(previous)) {
      if (null == selected[key] && usableKey(key)) {
        rmSync(moduleDir(vendorRoot, key), { recursive: true, force: true })
        pruneEmpty(pathDirname(moduleDir(vendorRoot, key)), vendorRoot)
      }
    }
  }

  const resolved = pkgResolve(root, options)
  report.lock = resolved.lock
  report.missing = [...new Set([...missing, ...resolved.missing])].sort(cmpBytes)
  report.unevaluable = resolved.unevaluable
  report.forbidden = resolved.forbidden
  if ('ok' !== resolved.verdict || 0 < report.missing.length) {
    report.verdict = 0 < report.unevaluable.length || 0 < report.forbidden.length ?
      'error' : 'missing'
    return report
  }

  const lockFile = pathJoin(root, META_DIR, LOCK_FILE)
  const before = existsSync(lockFile) ? readFileSync(lockFile, 'utf8') : ''
  const after = lockText(resolved.lock, options)
  if (true === args.frozen && before.split('\n')[before.startsWith('#') ? 1 : 0] !== after) {
    for (const e of resolved.lock) {
      const p = previous[e.key]
      if (null == p || p.canon !== e.canon || p.archive !== e.archive ||
        p.v !== e.v || p.manifest !== e.manifest) {
        report.changes.push(e.key + ': ' + (null == p ? 'unlocked' : 'repinned'))
      }
    }
    for (const key of Object.keys(previous)) {
      if (!resolved.lock.some((e) => e.key === key)) {
        report.changes.push(key + ': dropped')
      }
    }
    report.verdict = 'frozen'
    return report
  }
  prune()
  writeLock(root, resolved.lock, options)

  const verify = pkgVerify(root, options)
  report.mismatched = verify.mismatched
  report.unlocked = verify.unlocked
  report.verdict = verify.verdict
  return report
}


function pruneEmpty(dir: string, stop: string): void {
  for (; dir.startsWith(stop) && existsSync(dir) && 0 === readdirSync(dir).length;
    dir = pathDirname(dir)) {
    rmSync(dir, { recursive: true })
  }
}


// EDITING THE PACKAGE FILE. It is authored, so the edits are the
// smallest text changes that keep it the author's: a line appended, a
// version literal rewritten where it stands, a one-line entry removed.
export type DepEdit =
  | { op: 'add', key: string, v: string }
  | { op: 'raise', key: string, v: string }
  | { op: 'remove', key: string }

export function editDeps(root: string, edit: DepEdit, options: PkgToolOptions):
  string | undefined {
  const file = pathJoin(root, PKG_FILE)
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  let after: string
  if ('add' === edit.op) {
    after = before + ('' === before || before.endsWith('\n') ? '' : '\n') +
      'dep: ' + JSON.stringify(edit.key) + ': { v: ' + JSON.stringify(edit.v) + ' }\n'
  }
  else {
    const lines = before.split('\n')
    const at = lines.findIndex((l) => l.includes(JSON.stringify(edit.key)))
    if (0 > at) {
      return edit.key + ' is not on one line of ' + PKG_FILE + '; edit it by hand'
    }
    const line = lines[at]
    if ((line.match(/\{/g) ?? []).length !== (line.match(/\}/g) ?? []).length) {
      return edit.key + ' spans several lines of ' + PKG_FILE + '; edit it by hand'
    }
    if ('raise' === edit.op) {
      const re = /\bv\s*:\s*"[^"]*"/
      if (!re.test(line)) {
        return edit.key + ' declares its version on another line of ' + PKG_FILE +
          '; edit it by hand'
      }
      lines[at] = line.replace(re, 'v: ' + JSON.stringify(edit.v))
    }
    else {
      lines.splice(at, 1)
    }
    after = lines.join('\n')
  }
  writeFileSync(file, after)
  const deps = declaredDeps(file, options)
  const held = options.eval(after, file).ok &&
    ('remove' === edit.op ? null == deps[edit.key] : deps[edit.key]?.v === edit.v)
  if (!held) {
    writeFileSync(file, before)
    return 'the edit to ' + PKG_FILE + ' did not take; edit it by hand'
  }
  return undefined
}


export type PkgChangeReport = PkgSyncReport & { change: string }

export type ChangeArgs = SyncArgs & { mode: 'add' | 'get' }

// A `<pkg>[@<version>]` argument.
export function parsePkgSpec(spec: string): { pkg: string, version?: string } | string {
  const at = spec.indexOf('@')
  const pkg = 0 > at ? spec : spec.slice(0, at)
  const version = 0 > at ? undefined : spec.slice(at + 1)
  if (!packagePath(pkg)) {
    return 'not a package path: ' + spec
  }
  if (undefined !== version && !VERSION_RE.test(version)) {
    return 'not a version: ' + version + ' (MAJOR.MINOR.PATCH)'
  }
  return { pkg, ...(undefined === version ? {} : { version }) }
}


// `aontu add` and `aontu get`: a dependency declared or raised, then a
// sync. `add` refuses what is already declared and names `get`.
export async function pkgGet(root: string, options: PkgToolOptions, http: PkgHttp,
  spec: string, args: ChangeArgs): Promise<PkgChangeReport | string> {
  const parsed = parsePkgSpec(spec)
  if ('string' === typeof parsed) {
    return parsed
  }
  const { pkg } = parsed
  const declared = declaredDeps(pathJoin(root, PKG_FILE), options)
  const have = declared[pkg]
  if ('add' === args.mode && null != have) {
    return pkg + ' is already a dependency at ' + have.v + ' (aontu get raises it)'
  }

  let version = parsed.version
  let ctx: AcquireCtx | undefined
  try {
    ctx = makeCtx(root, options, http, args)
    if (undefined === version) {
      const bases = basesFor(ctx, pkg)
      const list = await fetchList(ctx, bases, pkg)
      version = selectVersion(ctx, pkg, list, await fetchAdvisory(ctx, bases, pkg), undefined)
    }
  }
  catch (e) {
    const report: PkgChangeReport = { ...refused(emptySync(), e), change: 'none' }
    report.events = ctx?.events ?? []
    return report
  }

  let change: string
  const before = snapshot(root)
  if (null == have) {
    const bad = editDeps(root, { op: 'add', key: pkg, v: version }, options)
    if (undefined !== bad) {
      return bad
    }
    change = 'added ' + pkg + ' ' + version
  }
  else if (0 <= versionCompare(have.v, version)) {
    change = pkg + ' is at ' + have.v + ' already'
  }
  else {
    const bad = editDeps(root, { op: 'raise', key: pkg, v: version }, options)
    if (undefined !== bad) {
      return bad
    }
    change = 'raised ' + pkg + ' ' + have.v + ' -> ' + version
  }

  const sync = await pkgSync(root, options, http, { ...args, frozen: false })
  sync.events = [...ctx.events, ...sync.events]
  return { ...sync, change: settled(root, before, sync, change) }
}


// Everything a sync may change, kept aside: the package file, the
// lock, and the vendor tree, copied under the project's own tmp.
type Snapshot = { pkgFile: string, lock?: string, vendor?: string }

function snapshot(root: string): Snapshot {
  const snap: Snapshot = { pkgFile: readFileSync(pathJoin(root, PKG_FILE), 'utf8') }
  const lockFile = pathJoin(root, META_DIR, LOCK_FILE)
  if (existsSync(lockFile)) {
    snap.lock = readFileSync(lockFile, 'utf8')
  }
  const vendorRoot = pathJoin(root, META_DIR, VENDOR_DIR)
  if (existsSync(vendorRoot)) {
    snap.vendor = pathJoin(root, META_DIR, 'tmp', randomBytes(8).toString('hex'))
    copyTree(vendorRoot, snap.vendor)
  }
  return snap
}

// A change the sync could not carry is taken back, lock and vendor
// tree included: neither verb leaves the project half-changed.
function settled(root: string, before: Snapshot, sync: PkgSyncReport, change: string): string {
  const tmp = pathJoin(root, META_DIR, 'tmp')
  if ('ok' === sync.verdict) {
    rmSync(tmp, { recursive: true, force: true })
    return change
  }
  writeFileSync(pathJoin(root, PKG_FILE), before.pkgFile)
  const lockFile = pathJoin(root, META_DIR, LOCK_FILE)
  if (undefined === before.lock) {
    rmSync(lockFile, { force: true })
  }
  else {
    writeFileSync(lockFile, before.lock)
  }
  const vendorRoot = pathJoin(root, META_DIR, VENDOR_DIR)
  rmSync(vendorRoot, { recursive: true, force: true })
  if (undefined !== before.vendor) {
    renameSync(before.vendor, vendorRoot)
  }
  rmSync(tmp, { recursive: true, force: true })
  return 'none (' + change + ' was taken back)'
}


// `aontu remove`: the pair of `add`.
export async function pkgRemove(root: string, options: PkgToolOptions, http: PkgHttp,
  pkg: string, args: SyncArgs): Promise<PkgChangeReport | string> {
  const declared = declaredDeps(pathJoin(root, PKG_FILE), options)
  if (null == declared[pkg]) {
    return pkg + ' is not a dependency of this project'
  }
  const before = snapshot(root)
  const bad = editDeps(root, { op: 'remove', key: pkg }, options)
  if (undefined !== bad) {
    return bad
  }
  const sync = await pkgSync(root, options, http, { ...args, frozen: false })
  return { ...sync, change: settled(root, before, sync, 'removed ' + pkg) }
}


export type PkgWhyReport = {
  verdict: 'ok' | 'missing'
  pkg: string
  paths: string[][]
}

// `aontu why`: every chain of dependencies from the project to a
// package, read from the lock and the package files in the store.
export function pkgWhy(root: string, options: PkgToolOptions, pkg: string): PkgWhyReport {
  const locked = readLock(root)
  const self = packageSelf(root, options)
  const rootKey = '' === self.path ? '.' : self.path
  const edges: Record<string, string[]> = {
    [rootKey]: Object.keys(declaredDeps(pathJoin(root, PKG_FILE), options)).sort(cmpBytes),
  }
  for (const key of Object.keys(locked)) {
    const entry = locked[key]
    const dir = usableKey(key) ?
      storeDirOf(root, key, entry, options) : undefined
    edges[key] = undefined === dir ? [] :
      Object.keys(declaredDeps(pathJoin(dir, PKG_FILE), options)).sort(cmpBytes)
  }

  const paths: string[][] = []
  const walk = (key: string, trail: string[]): void => {
    if (key === pkg || (isAlias(key) && locked[key]?.pkg === pkg)) {
      paths.push([...trail, key])
      return
    }
    if (trail.includes(key)) {
      return
    }
    for (const dep of edges[key] ?? []) {
      walk(dep, [...trail, key])
    }
  }
  walk(rootKey, [])
  return { verdict: 0 < paths.length ? 'ok' : 'missing', pkg, paths }
}

function storeDirOf(root: string, key: string, entry: LockEntry,
  options: PkgToolOptions): string | undefined {
  const stores = [moduleDir(pathJoin(root, META_DIR, VENDOR_DIR), key)]
  if (null != options.cache && '' !== entry.canon) {
    stores.push(cacheStoreDir(options.cache, entry.canon, entry.pkg ?? key))
  }
  return stores.find((d) => existsSync(pathJoin(d, PKG_FILE)))
}


// THE READ-PATH LAYOUT, written into a directory: what `publish --to`
// leaves behind and `pkg serve` serves.
export type LayoutWrite = {
  manifest: any
  manifestBytes: Uint8Array
  proofBytes: Uint8Array
  archive: Uint8Array
}

export function writeLayout(dir: string, w: LayoutWrite, options: PkgToolOptions,
  now: Date): void {
  const pkg = w.manifest.package as string
  const version = w.manifest.version as string
  if (!packagePath(pkg) || !VERSION_RE.test(version)) {
    refuse('manifest_invalid', 'the manifest names ' + pkg + ' ' + version +
      ', not a package path at a version', pkg)
  }
  const at = pathJoin(dir, 'pkg', ...pkgUrlPath(pkg).split('/'), '@v')
  mkdirSync(at, { recursive: true })

  const existing: string[] = readdirSync(at)
    .filter((f) => f.endsWith('.manifest')).map((f) => f.slice(0, -'.manifest'.length))
  if (existing.includes(version)) {
    refuse('version_exists', pkg + ' ' + version + ' was published before and is never reusable', pkg)
  }
  const manifests: any[] = existing.map((v) =>
    parseDoc(new Uint8Array(readFileSync(pathJoin(at, v + '.manifest')))))
  for (const m of manifests) {
    if (null != m?.moved) {
      refuse('path_moved', pkg + ' is frozen by a moved declaration (now ' + m.moved + ')', pkg)
    }
  }

  writeFileSync(pathJoin(at, version + '.zip'), w.archive)
  writeFileSync(pathJoin(at, version + '.manifest'), w.manifestBytes)
  writeFileSync(pathJoin(at, version + '.sig'), w.proofBytes)

  const listFile = pathJoin(at, 'list')
  const old = existsSync(listFile) ? parseDoc(new Uint8Array(readFileSync(listFile))) : undefined
  const versions: VersionEntry[] = Array.isArray(old?.versions) ? old.versions : []
  versions.push({ version, seen: timestamp(now) })
  versions.sort((a, b) => versionCompare(a.version, b.version))
  writeFileSync(listFile, canonLine({ package: pkg, versions }, options, 'list'))
  const top = versions[versions.length - 1]
  writeFileSync(pathJoin(pathDirname(at), '@latest'),
    canonLine({ package: pkg, version: top.version, seen: top.seen }, options, 'latest'))

  const retracted: { version: string, by: string }[] = []
  for (const m of [...manifests, w.manifest]) {
    for (const v of m?.retract ?? []) {
      retracted.push({ version: v, by: m.version })
    }
  }
  retracted.sort((a, b) => versionCompare(a.version, b.version))
  const advisory = pathJoin(dir, 'advisory', ...pkgUrlPath(pkg).split('/'))
  mkdirSync(pathDirname(advisory + '.aon'), { recursive: true })
  writeFileSync(advisory + '.aon',
    canonLine({ package: pkg, retracted }, options, 'advisory'))
}


// A directory as a repository: the layout above, read by path.
export function dirHttp(dir: string): PkgHttp {
  return {
    get: async (url: string) => {
      const p = new URL(url).pathname
      const file = pathJoin(dir, ...p.split('/').filter((e) => '' !== e))
      if (p.split('/').includes('..') || !existsSync(file) || !statSync(file).isFile()) {
        return { status: 404, body: new Uint8Array() }
      }
      return { status: 200, body: new Uint8Array(readFileSync(file)) }
    },
    post: async () => ({ status: 405, body: utf8('a directory takes no publish') }),
  }
}


export type PkgPublishReport = {
  verdict: 'dry-run' | 'sent' | 'refused' | 'breaking' | 'undecided' | 'error'
  manifest?: PkgManifest
  digest?: string
  signer?: string
  against?: string
  to?: string
  write?: string
  missing: string[]
  forbidden: string[]
  findings: any[]
  refusal?: PkgRefusalReport
}

export type PublishArgs = RepoOverrides & {
  yes?: boolean
  to?: string
  key?: string
  token?: string
  against?: string
  now?: () => Date
}


// What a forge token says about its bearer, read for the manifest's
// publisher block. The write path verifies it; the client copies it.
export function publisherFromToken(token: string): any | undefined {
  const parts = token.trim().split('.')
  if (3 !== parts.length) {
    return undefined
  }
  let claims: any
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  }
  catch {
    return undefined
  }
  const iss: string = claims?.iss ?? ''
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
    }
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
    }
  }
  return undefined
}


// PUBLISH (spec ops.publish, the client's side): the manifest and its
// gate, then the signed objects sent, or written into a directory. A
// dry run without `--yes`.
export async function pkgPublish(root: string, options: PkgToolOptions, http: PkgHttp,
  args: PublishArgs): Promise<PkgPublishReport> {
  const now = args.now ?? (() => new Date())
  const local: PkgManifestReport = pkgManifest(root, options, args.against)
  const report: PkgPublishReport = {
    verdict: 'dry-run', missing: local.missing, forbidden: local.forbidden,
    findings: local.findings,
    ...(null == args.against ? {} : { against: args.against }),
  }
  if ('ok' !== local.verdict) {
    report.verdict = local.verdict
    return report
  }
  const m = local.manifest as PkgManifest
  report.manifest = m

  let config: RepoConfig
  try {
    config = repoConfig(root, options, args)
  }
  catch (e) {
    return refusedPublish(report, e)
  }
  const target = args.to ?? config.write
  report[null == args.to ? 'write' : 'to'] = target

  // The repository's own predecessor, when one can be read: the highest
  // existing version is what compatibility is decided against.
  const reader: PkgHttp = null == args.to ? http : dirHttp(args.to)
  const ctx: AcquireCtx = {
    options, http: reader, config: { ...config, private: [] },
    cache: options.cache ?? '', now, events: [], fetched: [], acquired: {}, count: 0,
  }
  const bases = null == args.to ? config.base : ['http://127.0.0.1']
  try {
    const listed = await reader.get(bases[0].replace(/\/$/, '') + objectPath('list', m.package))
    if (200 === listed.status && null == args.against) {
      const list = await fetchList(ctx, bases, m.package)
      if (list.some((e) => e.version === m.version)) {
        refuse('version_exists', m.package + ' ' + m.version +
          ' was published before and is never reusable', m.package)
      }
      const newest = list[list.length - 1]
      if (undefined !== newest) {
        const prior = await fetchManifest(ctx, bases, m.package, newest.version)
        if (null != prior.manifest.moved) {
          refuse('path_moved', m.package + ' is frozen by a moved declaration (now ' +
            prior.manifest.moved + ')', m.package)
        }
        const zip = await fetchArchive(ctx, bases, m.package, newest.version, prior.manifest)
        const entries = unpack(m.package, newest.version, zip, prior.manifest)
        // Under the project's own meta directory, so the predecessor's
        // imports resolve against the vendor tree the publisher synced.
        const tmp = pathJoin(root, META_DIR, 'tmp', randomBytes(8).toString('hex'))
        mkdirSync(tmp, { recursive: true })
        writeTree(tmp, entries)
        const gate = pkgManifest(root, options, tmp)
        rmSync(pathJoin(root, META_DIR, 'tmp'), { recursive: true, force: true })
        report.against = m.package + ' ' + newest.version
        report.findings = gate.findings
        if ('ok' !== gate.verdict) {
          report.verdict = gate.verdict
          return report
        }
      }
    }
  }
  catch (e) {
    return refusedPublish(report, e)
  }

  if (null == args.to && 'public' !== m.publish && !isLoopback(target)) {
    return refusedPublish(report, new PkgRefusal('not_public',
      m.package + ' does not declare publish: public; nothing is uploaded', m.package))
  }

  const full: any = { ...m, published: timestamp(now()) }
  if (null != args.token) {
    const publisher = publisherFromToken(readFileSync(args.token, 'utf8'))
    if (undefined !== publisher) {
      full.publisher = publisher
    }
  }
  const manifestBytes = utf8(manifestText(full, options) + '\n')
  report.digest = sha256Hex(manifestBytes)
  if (null != args.key) {
    try {
      report.signer = keyIdFromPem(readFileSync(args.key, 'utf8'))
    }
    catch (e) {
      return refusedPublish(report, e)
    }
  }
  if (true !== args.yes) {
    return report
  }

  const proof = signDigest(readFileSync(args.key as string, 'utf8'), report.digest)
  const proofBytes = canonLine(proof, options, 'proof.aon')
  const archive = archiveOf(root)
  try {
    if (null != args.to) {
      writeLayout(args.to, { manifest: full, manifestBytes, proofBytes, archive: archive.zip },
        options, now())
    }
    else {
      const r = await http.post(target.replace(/\/$/, '') + PUBLISH_PATH,
        { manifest: manifestBytes, proof: proofBytes, archive: archive.zip },
        null == args.token ? '' : readFileSync(args.token, 'utf8').trim())
      if (200 !== r.status && 201 !== r.status) {
        const doc = parseDoc(r.body)
        refuse('string' === typeof doc?.code ? doc.code : 'fetch_failed',
          'string' === typeof doc?.message ? doc.message :
            'the write path answered ' + r.status, m.package)
      }
    }
  }
  catch (e) {
    return refusedPublish(report, e)
  }
  report.verdict = 'sent'
  return report
}

function refusedPublish(report: PkgPublishReport, e: unknown): PkgPublishReport {
  if (!(e instanceof PkgRefusal)) {
    throw e
  }
  report.verdict = 'refused'
  report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) }
  return report
}


export type PkgOutdatedEntry = {
  key: string
  v: string
  newest: string
  retracted?: string
  moves: string[]
}

export type PkgOutdatedReport = {
  verdict: 'current' | 'outdated' | 'refused'
  locked: PkgOutdatedEntry[]
  events: PkgEvent[]
  refusal?: PkgRefusalReport
}


// `aontu pkg outdated`: for every locked package, the newest selectable
// version, and what a resolution taking it would move with it.
export async function pkgOutdated(root: string, options: PkgToolOptions, http: PkgHttp,
  args: SyncArgs = {}): Promise<PkgOutdatedReport> {
  const report: PkgOutdatedReport = { verdict: 'current', locked: [], events: [] }
  let ctx: AcquireCtx
  try {
    ctx = makeCtx(root, options, http, args)
  }
  catch (e) {
    return refusedOutdated(report, e)
  }
  const locked = readLock(root)
  try {
    for (const key of Object.keys(locked).sort(cmpBytes)) {
      const entry = locked[key]
      const pkg = entry.pkg ?? key
      if (!usableKey(key) || '' === pkg) {
        continue
      }
      const bases = basesFor(ctx, pkg)
      const list = await fetchList(ctx, bases, pkg)
      const advisory = await fetchAdvisory(ctx, bases, pkg)
      const newest = selectVersion(ctx, pkg, list, advisory, undefined, entry.v)
      const out: PkgOutdatedEntry = { key, v: entry.v, newest, moves: [] }
      if (null != advisory[entry.v]) {
        out.retracted = advisory[entry.v]
      }
      if (0 < versionCompare(newest, entry.v)) {
        out.moves = await movesWith(ctx, locked, key, pkg, newest)
        report.verdict = 'outdated'
      }
      else if (null != out.retracted) {
        report.verdict = 'outdated'
      }
      report.locked.push(out)
    }
  }
  catch (e) {
    report.events = ctx.events
    return refusedOutdated(report, e)
  }
  report.events = ctx.events
  return report
}

// What a resolution taking `newest` for one key would move with it:
// minimum version selection over the repository's manifests, from the
// upgraded declaration down to the closure, against the lock.
async function movesWith(ctx: AcquireCtx, locked: Record<string, LockEntry>, key: string,
  pkg: string, newest: string): Promise<string[]> {
  const selected: Record<string, string> = {}
  const targets: Record<string, string> = {}
  for (const k of Object.keys(locked)) {
    selected[k] = locked[k].v
    if (null != locked[k].pkg) {
      targets[k] = locked[k].pkg as string
    }
  }
  selected[key] = newest
  targets[key] = pkg
  let frontier = [key]
  for (let depth = 0; 0 < frontier.length; depth++) {
    if (LIMITS.depth <= depth) {
      refuse('module_depth', 'the closure under ' + pkg + ' nests past ' + LIMITS.depth, pkg)
    }
    if (LIMITS.closure < Object.keys(selected).length) {
      refuse('closure_too_large', 'the closure exceeds ' + LIMITS.closure + ' packages', pkg)
    }
    const next: string[] = []
    for (const k of frontier) {
      const target = targets[k] ?? k
      if (!usableKey(k) || (isAlias(k) && null == targets[k])) {
        continue
      }
      const top = await fetchManifest(ctx, basesFor(ctx, target), target, selected[k])
      const deps: Record<string, Dependency> = top.manifest.deps
      for (const dk of Object.keys(deps).sort(cmpBytes)) {
        if (null != deps[dk].pkg) {
          targets[dk] = deps[dk].pkg as string
        }
        if (null == selected[dk] || 0 > versionCompare(selected[dk], deps[dk].v)) {
          selected[dk] = deps[dk].v
          next.push(dk)
        }
      }
    }
    frontier = next
  }
  return Object.keys(selected).sort(cmpBytes)
    .filter((k) => k !== key && selected[k] !== locked[k]?.v)
    .map((k) => k + ' ' + (null == locked[k] ? 'unlocked' : locked[k].v) + ' -> ' + selected[k])
}

function refusedOutdated(report: PkgOutdatedReport, e: unknown): PkgOutdatedReport {
  if (!(e instanceof PkgRefusal)) {
    throw e
  }
  report.verdict = 'refused'
  report.refusal = { code: e.code, message: e.message, ...(null == e.pkg ? {} : { pkg: e.pkg }) }
  return report
}


// THE LOCAL REGISTRY AND PROXY (`aontu pkg serve`): the directory
// layout served verbatim; with upstreams, fetched on a miss and kept.
const OBJECT_RE =
  /^\/(pkg\/[A-Za-z0-9!._/-]+\/@v\/(list|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(zip|manifest|sig|sigstore\.json))|pkg\/[A-Za-z0-9!._/-]+\/@latest|advisory\/[A-Za-z0-9!._/-]+\.aon|tombstone\/(feed\.aon|[A-Za-z0-9!._/-]+\/@v\/(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.aon))$/

export function objectShape(p: string): boolean {
  return OBJECT_RE.test(p) && !p.split('/').some((e) => '' === e && p.indexOf('//') >= 0) &&
    !p.split('/').some((e) => '.' === e || '..' === e)
}

export function objectMutable(p: string): boolean {
  return p.endsWith('/list') || p.endsWith('/@latest') || p.startsWith('/advisory/') ||
    p.startsWith('/tombstone/')
}

function contentType(p: string): string {
  return p.endsWith('.zip') ? 'application/zip' :
    p.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8'
}

export type ServeOptions = {
  dir: string
  upstream: string[]
  listen: string
  http: PkgHttp
}

export type Served = { url: string, close: () => Promise<void>, server: Server }

// One request: the shape gate, the directory, then the upstreams.
export async function serveObject(opts: ServeOptions, p: string):
  Promise<{ status: number, body: Uint8Array, stale?: boolean }> {
  if (!objectShape(p)) {
    return { status: 404, body: utf8('not an object path\n') }
  }
  const file = pathJoin(opts.dir, ...p.split('/').filter((e) => '' !== e))
  const have = existsSync(file) && statSync(file).isFile()
  const mutable = objectMutable(p)
  if (have && !mutable) {
    return { status: 200, body: new Uint8Array(readFileSync(file)) }
  }
  for (const up of opts.upstream) {
    const r = await opts.http.get(up.replace(/\/$/, '') + p)
    if (200 === r.status) {
      mkdirSync(pathDirname(file), { recursive: true })
      writeFileSync(file, r.body)
      return { status: 200, body: r.body }
    }
  }
  if (have) {
    return { status: 200, body: new Uint8Array(readFileSync(file)), stale: 0 < opts.upstream.length }
  }
  return { status: 404, body: utf8('no such object\n') }
}

export function startServe(opts: ServeOptions): Promise<Served> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if ('GET' !== req.method && 'HEAD' !== req.method) {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('the read path is GET\n')
      return
    }
    const p = new URL(req.url as string, 'http://localhost').pathname
    serveObject(opts, p).then((r) => {
      const headers: Record<string, string> = {
        'content-type': 200 === r.status ? contentType(p) : 'text/plain; charset=utf-8',
        'cache-control': objectMutable(p) ? 'max-age=60' : 'max-age=31536000, immutable',
      }
      if (true === r.stale) {
        headers['x-aontu-stale'] = 'no upstream answered; served from the cache'
      }
      res.writeHead(r.status, headers)
      res.end('HEAD' === req.method ? undefined : Buffer.from(r.body))
    })
  }
  const server = createServer(handler)
  const [host, port] = splitListen(opts.listen)
  return new Promise((resolveServed, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const addr: any = server.address()
      resolveServed({
        url: servedUrl(addr.address, addr.port),
        server,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

// An IPv6 address is bracketed in a URL.
export function servedUrl(address: string, port: number): string {
  return 'http://' + (address.includes(':') ? '[' + address + ']' : address) + ':' + port
}

export function splitListen(listen: string): [string, number] {
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(listen)
  if (null != bracketed) {
    const port = Number(bracketed[2])
    return [bracketed[1], undefined !== bracketed[2] && Number.isInteger(port) ? port : 8017]
  }
  const at = listen.lastIndexOf(':')
  if (0 > at) {
    return [listen, 8017]
  }
  const port = Number(listen.slice(at + 1))
  return [listen.slice(0, at), Number.isInteger(port) ? port : 8017]
}


// A body read no further than the archive cap: what comes back past
// it is over the cap by construction, and every reader refuses it.
export async function readBounded(r: Response, max: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = r.body?.getReader()
  for (; undefined !== reader && total <= max;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    total += value.length
  }
  if (undefined !== reader && total > max) {
    await reader.cancel()
  }
  return new Uint8Array(Buffer.concat(chunks))
}

// THE ADAPTER: the platform's fetch, and the multipart a publish sends.
export function defaultHttp(): PkgHttp {
  return {
    get: async (url: string) => {
      try {
        const r = await fetch(url, { redirect: 'manual' })
        return { status: r.status, body: await readBounded(r, ARCHIVE_LIMITS.bytes) }
      }
      catch {
        return { status: 0, body: new Uint8Array() }
      }
    },
    post: async (url: string, parts: PublishParts, token: string) => {
      const form = new FormData()
      form.set('manifest', new Blob([Buffer.from(parts.manifest)], { type: 'text/plain' }), 'manifest.aon')
      form.set('proof', new Blob([Buffer.from(parts.proof)], { type: 'text/plain' }), 'proof.aon')
      form.set('archive', new Blob([Buffer.from(parts.archive)], { type: 'application/zip' }), 'archive.zip')
      try {
        const r = await fetch(url, {
          method: 'POST', body: form,
          headers: '' === token ? {} : { authorization: 'Bearer ' + token },
        })
        return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) }
      }
      catch {
        return { status: 0, body: new Uint8Array() }
      }
    },
  }
}
