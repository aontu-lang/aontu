/* Copyright (c) 2025 Richard Rodger, MIT License */


import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
  lstatSync, copyFileSync, unlinkSync, rmSync,
} from 'node:fs'
import { join as pathJoin, dirname as pathDirname } from 'node:path'

import {
  parseModuleRef, validateModulePath, moduleDir, lockJson, isAlias,
  cacheStoreDir, cacheDownloadDir, localFileExt, PKG_FILE, LOCK_FILE, META_DIR, VENDOR_DIR,
} from './mod'
import { zipCanonical, sha256Hex, cmpBytes } from './pkg-zip'
import { subsume } from './subsume'
import { compatOutcome } from './compat'
import { includeFormat } from './lang'
import type { ZipEntry } from './pkg-zip'

export const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

// params.archive: what a consumer refuses to unpack, and so what a
// publisher refuses to mint. A record, so a test can lower them.
export const ARCHIVE_LIMITS = {
  bytes: 16777216, unpacked: 67108864, files: 4096, fileBytes: 8388608,
}


// One entry of the lockfile, and of a tidy report. `key` is the lock
// key: a package path, or `alias:<name>` with `pkg` naming the package.
export type LockEntry = {
  key: string
  v: string
  canon: string
  // The canonical archive's digest: computable from any tree.
  archive: string
  // The signed manifest's digest, present only for a package acquired
  // from a repository.
  manifest?: string
  pkg?: string
}

export type PkgTidyReport = {
  verdict: 'ok' | 'missing' | 'error'
  // The resolved closure, sorted by key.
  lock: LockEntry[]
  missing: string[]
  unevaluable: string[]
  // Files the allowlist refuses, as `<key>: <file>`, sorted.
  forbidden: string[]
}

export type PkgMismatch = {
  key: string
  pin: 'archive' | 'manifest' | 'canon'
  want: string
  got: string
}

export type PkgVerifyReport = {
  verdict: 'ok' | 'mismatch' | 'unlocked' | 'missing'
  verified: string[]
  // What the lockfile pins against what the store now holds or means,
  // bytes before meaning, sorted by key.
  mismatched: PkgMismatch[]
  // Dependencies the project declares that the lockfile does not name,
  // sorted. A tidy is what fills them in.
  unlocked: string[]
  // Locked packages present in no store, sorted.
  missing: string[]
}

export type PkgVendorReport = {
  verdict: 'ok' | 'missing'
  vendored: string[]
  missing: string[]
}

export type PkgRefreezeReport = {
  verdict: 'ok' | 'missing' | 'error'
  repinned: { key: string, from: string, to: string }[]
  unchanged: string[]
  missing: string[]
  unevaluable: string[]
}

export type PkgTreeNode = { key: string, v: string, deps: string[] }

export type PkgTreeReport = {
  verdict: 'ok' | 'missing'
  root: string
  nodes: PkgTreeNode[]
  missing: string[]
}


export type PkgToolEval = (src: string, path: string) =>
  {
    gen: any, hash: string, canon: string,
    ok: boolean,
  }


export type PkgToolOptions = {
  // The content-addressed user cache. Empty means no cache is
  // consulted, which is a store that misses rather than an error.
  cache?: string
  eval: PkgToolEval
}


export type Dependency = { v: string, pkg?: string }


// The `dep` block a package file declares: key -> minimum version, and
// for an alias the package it names.
export function declaredDeps(file: string, options: PkgToolOptions):
  Record<string, Dependency> {
  if (!existsSync(file)) {
    return {}
  }

  const gen: any = options.eval(readFileSync(file, 'utf8'), file).gen
  const dep = gen?.dep
  if (null == dep || 'object' !== typeof dep) {
    return {}
  }

  const out: Record<string, Dependency> = {}
  for (const key of Object.keys(dep)) {
    const v = dep[key]?.v
    if ('string' === typeof v && '' !== v) {
      const pkg = dep[key]?.pkg
      out[key] = { v, ...('string' === typeof pkg && '' !== pkg ? { pkg } : {}) }
    }
  }
  return out
}


export function versionCompare(a: string, b: string): number {
  const ap = a.split('.')
  const bp = b.split('.')
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    // A part the shorter version does not have is ZERO, so `1.2` and
    // `1.2.0` are the same version -- which is what everyone means by
    // them, and what a lockfile rewritten from either must agree on.
    const x = ap[i] ?? '0'
    const y = bp[i] ?? '0'
    if (x === y) {
      continue
    }
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const xs = x.replace(/^0+(?=\d)/, '')
      const ys = y.replace(/^0+(?=\d)/, '')
      if (xs === ys) {
        continue
      }
      return xs.length !== ys.length ? (xs.length < ys.length ? -1 : 1) : (xs < ys ? -1 : 1)
    }
    if (xn !== yn) {
      return xn ? -1 : 1
    }
    return x < y ? -1 : 1
  }
  return 0
}


// A last element with an extension the include table knows is a
// local file to the resolver, whatever declares it, so it names no
// package.
export function usableKey(key: string): boolean {
  const ref = parseModuleRef(key)
  if (undefined === ref || ref.path !== key) {
    return false
  }
  if (isAlias(key)) {
    return true
  }
  const ext = localFileExt(key)
  return undefined === validateModulePath(key) &&
    (undefined === ext || undefined === includeFormat(ext))
}


// The directory a package is in, in the local stores: the project's
// vendor tree first, then the cache under the hash the lockfile pins,
// then the cache under the hash the repository's manifest for that
// version pins, which the consumer's own pin need not equal.
export function storeDir(
  root: string, key: string, canon: string, pkg: string,
  options: PkgToolOptions, v?: string,
): string | undefined {
  const stores = [moduleDir(pathJoin(root, META_DIR, VENDOR_DIR), key)]
  if (null != options.cache && '' !== pkg) {
    if ('' !== canon) {
      stores.push(cacheStoreDir(options.cache, canon, pkg))
    }
    const served = null == v ? undefined : downloadedCanon(options.cache, pkg, v)
    if (undefined !== served && served !== canon) {
      stores.push(cacheStoreDir(options.cache, served, pkg))
    }
  }
  return stores.find((d) => existsSync(pathJoin(d, PKG_FILE)))
}

// The canon the repository's manifest pins for a version this client
// downloaded, or undefined where none was.
export function downloadedCanon(cache: string, pkg: string, v: string): string | undefined {
  const file = pathJoin(cacheDownloadDir(cache, pkg), v + '.manifest')
  if (!existsSync(file)) {
    return undefined
  }
  let doc: any
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  }
  catch {
    return undefined
  }
  const canon = doc?.modules?.[0]?.canon
  return 'string' === typeof canon ? canon : undefined
}


export function readLock(root: string): Record<string, LockEntry> {
  const file = pathJoin(root, META_DIR, LOCK_FILE)
  if (!existsSync(file)) {
    return {}
  }

  let lock: any
  try {
    lock = JSON.parse(lockJson(readFileSync(file, 'utf8')))
  }
  catch {
    return {}
  }

  const out: Record<string, LockEntry> = {}
  for (const key of Object.keys(lock?.lock ?? {})) {
    const e = lock.lock[key]
    const str = (k: string): string => 'string' === typeof e?.[k] ? e[k] : ''
    out[key] = {
      key,
      v: str('v'),
      canon: str('canon'),
      archive: str('archive'),
      ...('' === str('manifest') ? {} : { manifest: str('manifest') }),
      ...('' === str('pkg') ? {} : { pkg: str('pkg') }),
    }
  }
  return out
}


export function lockText(entries: LockEntry[], options: PkgToolOptions): string {
  const parts = entries.map((e) =>
    JSON.stringify(e.key) + ':{' +
    '"archive":' + JSON.stringify(e.archive) + ',' +
    '"canon":' + JSON.stringify(e.canon) + ',' +
    (null == e.manifest ? '' : '"manifest":' + JSON.stringify(e.manifest) + ',') +
    (null == e.pkg ? '' : '"pkg":' + JSON.stringify(e.pkg) + ',') +
    '"v":' + JSON.stringify(e.v) + '}')
  return options.eval('{"lock":{' + parts.join(',') + '}}', LOCK_FILE).canon
}


// The generated-file header. A lockfile is machine-written, and the
// file says so where an editor will see it.
export const LOCK_HEADER =
  '# pkg-lock.aon (generated by `aontu sync`; do not edit)\n'


export function writeLock(root: string, entries: LockEntry[],
  options: PkgToolOptions): void {
  mkdirSync(pathJoin(root, META_DIR), { recursive: true })
  writeFileSync(pathJoin(root, META_DIR, LOCK_FILE),
    LOCK_HEADER + lockText(entries, options) + '\n')
}


// What a package file says about ITSELF. Distinct from `declaredDeps`,
// which reads what it says about others.
export type PackageSelf = {
  path: string
  version: string
  main: string
  publish: 'public' | 'private'
  moved?: string
  retract: string[]
}

export function packageSelf(dir: string, options: PkgToolOptions): PackageSelf {
  const file = pathJoin(dir, PKG_FILE)
  const self: PackageSelf = {
    path: '', version: '', main: 'main.aon', publish: 'private', retract: [],
  }
  if (!existsSync(file)) {
    return self
  }
  const gen: any = options.eval(readFileSync(file, 'utf8'), file).gen
  const pkg = gen?.pkg
  const str = (v: any): string => 'string' === typeof v ? v : ''
  self.path = str(pkg?.path)
  self.version = str(pkg?.version)
  self.main = '' === str(pkg?.main) ? 'main.aon' : str(pkg?.main)
  self.publish = 'public' === gen?.publish ? 'public' : 'private'
  if ('' !== str(gen?.moved)) {
    self.moved = str(gen.moved)
  }
  if (Array.isArray(gen?.retract)) {
    self.retract = gen.retract.filter((v: any) => 'string' === typeof v)
  }
  return self
}


// What a package may contain (REPOSITORY.0.md §9.4): an enumerated
// allowlist, refused by default. The data half is ADR-012's table.
export const ARCHIVE_SOURCE_EXT = ['aon', 'aontu']
export const ARCHIVE_DATA_EXT = [
  'json', 'jsonld', 'jsonc', 'json5', 'jsonic', 'jsc', 'toml', 'yaml', 'yml',
  'ini',
]
export const ARCHIVE_TEXT_EXT = ['md', 'txt']
export const ARCHIVE_NAMED = ['LICENSE', 'NOTICE']

const ADMITTED_EXT = new Set([
  ...ARCHIVE_SOURCE_EXT, ...ARCHIVE_DATA_EXT, ...ARCHIVE_TEXT_EXT])


export function archiveAdmits(rel: string): boolean {
  const elems = rel.split('/')
  if (elems.some((e) => e.startsWith('.'))) {
    return false
  }
  const name = elems[elems.length - 1]
  if (ARCHIVE_NAMED.includes(name)) {
    return true
  }
  const m = /^[^.].*\.([^.]+)$/.exec(name)
  return null != m && ADMITTED_EXT.has(m[1].toLowerCase())
}


export type ArchiveFile = { path: string, digest: string, size: number }

export type Archive = {
  zip: Uint8Array
  digest: string
  size: number
  files: ArchiveFile[]
  // Entries the allowlist refuses, sorted: a symlink, an executable, a
  // dotfile directory, or a name outside the table.
  forbidden: string[]
}


function walkTree(dir: string, prefix: string, out: ZipEntry[],
  forbidden: string[]): void {
  for (const name of readdirSync(dir).sort(cmpBytes)) {
    if ('' === prefix && META_DIR === name) {
      continue
    }
    const full = pathJoin(dir, name)
    const rel = '' === prefix ? name : prefix + '/' + name
    const st = lstatSync(full)
    if (st.isSymbolicLink()) {
      forbidden.push(rel)
      continue
    }
    if (st.isDirectory()) {
      if (name.startsWith('.')) {
        forbidden.push(rel + '/')
        continue
      }
      walkTree(full, rel, out, forbidden)
      continue
    }
    if (!st.isFile() || 0 !== (st.mode & 0o111) || !archiveAdmits(rel)) {
      forbidden.push(rel)
      continue
    }
    out.push({ path: rel, data: new Uint8Array(readFileSync(full)) })
  }
}


// The canonical archive of a tree, and every file's own digest.
export function archiveOf(dir: string): Archive {
  const entries: ZipEntry[] = []
  const forbidden: string[] = []
  walkTree(dir, '', entries, forbidden)
  const zip = zipCanonical(entries)
  return {
    zip,
    digest: sha256Hex(zip),
    size: zip.length,
    files: entries.map((e) => ({
      path: e.path, digest: sha256Hex(e.data), size: e.data.length,
    })),
    forbidden: forbidden.sort(cmpBytes),
  }
}


// The pin a locked tree carries beside it, when it was acquired from a
// repository: the served manifest, verbatim.
export function storedManifest(dir: string):
  { digest: string, files: ArchiveFile[] } | undefined {
  const file = pathJoin(dir, META_DIR, 'manifest.aon')
  if (!existsSync(file)) {
    return undefined
  }
  const bytes = new Uint8Array(readFileSync(file))
  let doc: any
  try {
    doc = JSON.parse(lockJson(new TextDecoder().decode(bytes)))
  }
  catch {
    return { digest: sha256Hex(bytes), files: [] }
  }
  const files = Array.isArray(doc?.archive?.files) ? doc.archive.files : []
  return { digest: sha256Hex(bytes), files }
}


function mainOf(dir: string, options: PkgToolOptions): string {
  return packageSelf(dir, options).main
}


// The lock entry a store tree yields for a key: its version as
// selected, its canon-hash, its archive digest, and the manifest digest
// where a manifest is kept beside it.
function pinTree(
  key: string, dir: string, v: string, pkg: string | undefined,
  options: PkgToolOptions,
): { entry?: LockEntry, unevaluable?: true, forbidden: string[] } {
  const main = pathJoin(dir, mainOf(dir, options))
  const got = existsSync(main) ?
    options.eval(readFileSync(main, 'utf8'), main) : undefined
  if (null != got && !got.ok) {
    return { unevaluable: true, forbidden: [] }
  }
  const archive = archiveOf(dir)
  const manifest = storedManifest(dir)
  return {
    entry: {
      key,
      v,
      canon: null == got ? '' : got.hash,
      archive: archive.digest,
      ...(null == manifest ? {} : { manifest: manifest.digest }),
      ...(null == pkg ? {} : { pkg }),
    },
    forbidden: archive.forbidden.map((f) => key + ': ' + f),
  }
}


// `aontu pkg tidy`: resolve the closure by MVS and rewrite the lockfile.
export function pkgTidy(root: string, options: PkgToolOptions): PkgTidyReport {
  const report = pkgResolve(root, options)
  if ('ok' === report.verdict) {
    writeLock(root, report.lock, options)
  }
  return report
}


// The resolution alone, for a caller that decides whether to write.
export function pkgResolve(root: string, options: PkgToolOptions): PkgTidyReport {
  const previous = readLock(root)
  const selected: Record<string, Dependency> = {}
  const missing: string[] = []

  let frontier = declaredDeps(pathJoin(root, PKG_FILE), options)
  for (; 0 < Object.keys(frontier).length;) {
    const next: Record<string, Dependency> = {}

    for (const key of Object.keys(frontier)) {
      const want = frontier[key]
      const have = selected[key]
      if (null != have && 0 <= versionCompare(have.v, want.v)) {
        continue
      }
      selected[key] = { ...have, ...want }

      if (!usableKey(key)) {
        // A key this tooling cannot act on names nothing any store
        // can hold: the same answer as an absent package.
        missing.push(key)
        continue
      }

      const dir = storeDir(root, key, previous[key]?.canon ?? '',
        targetOf(key, selected[key], previous[key]), options, selected[key].v)
      if (undefined === dir) {
        missing.push(key)
        continue
      }

      const deps = declaredDeps(pathJoin(dir, PKG_FILE), options)
      for (const dk of Object.keys(deps)) {
        const bid = next[dk]
        if (null == bid || 0 > versionCompare(bid.v, deps[dk].v)) {
          next[dk] = { ...bid, ...deps[dk] }
        }
      }
    }

    frontier = next
  }

  const lock: LockEntry[] = []
  const unevaluable: string[] = []
  const forbidden: string[] = []
  for (const key of Object.keys(selected).sort(cmpBytes)) {
    if (missing.includes(key)) {
      continue
    }
    const pkg = targetOf(key, selected[key], previous[key])
    const dir = storeDir(root, key, previous[key]?.canon ?? '', pkg,
      options, selected[key].v) as string
    const pinned = pinTree(key, dir, selected[key].v,
      isAlias(key) ? pkg : undefined, options)
    forbidden.push(...pinned.forbidden)
    if (pinned.unevaluable) {
      unevaluable.push(key)
      continue
    }
    lock.push(pinned.entry as LockEntry)
  }

  const uniqueMissing = [...new Set(missing)].sort(cmpBytes)
  const uniqueUnevaluable = [...new Set(unevaluable)].sort(cmpBytes)
  const held = 0 === uniqueMissing.length && 0 === uniqueUnevaluable.length &&
    0 === forbidden.length

  return {
    verdict: held ? 'ok' :
      0 < uniqueUnevaluable.length || 0 < forbidden.length ? 'error' : 'missing',
    lock,
    missing: uniqueMissing,
    unevaluable: uniqueUnevaluable,
    forbidden: forbidden.sort(cmpBytes),
  }
}


// The package an alias key names: from the declaration, else from the
// previous lock; a package path names itself.
export function targetOf(key: string, dep?: Dependency, prev?: LockEntry): string {
  if (!isAlias(key)) {
    return key
  }
  return dep?.pkg ?? prev?.pkg ?? ''
}


export function pkgVerify(root: string, options: PkgToolOptions):
  PkgVerifyReport {
  const locked = readLock(root)
  const verified: string[] = []
  const mismatched: PkgMismatch[] = []
  const missing: string[] = []

  const declared = declaredDeps(pathJoin(root, PKG_FILE), options)
  const unlocked = Object.keys(declared)
    .filter((key) => null == locked[key]).sort(cmpBytes)

  for (const key of Object.keys(locked).sort(cmpBytes)) {
    const entry = locked[key]
    if (!usableKey(key)) {
      missing.push(key)
      continue
    }
    const dir = storeDir(root, key, entry.canon, entry.pkg ?? key, options, entry.v)
    if (undefined === dir) {
      missing.push(key)
      continue
    }
    const main = pathJoin(dir, mainOf(dir, options))
    if (!existsSync(main)) {
      missing.push(key)
      continue
    }

    // BYTES BEFORE MEANING (ADR-019): the archive digest and the
    // manifest's file list first, on fixed-size reads, then the one
    // evaluation.
    const before = mismatched.length
    const archive = archiveOf(dir)
    for (const f of archive.forbidden) {
      mismatched.push({ key, pin: 'archive', want: entry.archive, got: 'forbidden: ' + f })
    }
    if (0 === archive.forbidden.length && entry.archive !== archive.digest) {
      mismatched.push({ key, pin: 'archive', want: entry.archive, got: archive.digest })
    }
    const manifest = storedManifest(dir)
    if (null == manifest) {
      if (null != entry.manifest) {
        mismatched.push({ key, pin: 'manifest', want: entry.manifest, got: '' })
      }
    }
    else {
      if (null != entry.manifest && entry.manifest !== manifest.digest) {
        mismatched.push({ key, pin: 'manifest', want: entry.manifest, got: manifest.digest })
      }
      const listed = new Map(manifest.files.map((f) => [f.path, f.digest]))
      for (const f of archive.files) {
        if (listed.get(f.path) !== f.digest) {
          mismatched.push({ key, pin: 'manifest', want: listed.get(f.path) ?? '',
            got: f.path + ' ' + f.digest })
        }
      }
    }
    if (before !== mismatched.length) {
      continue
    }

    const got = options.eval(readFileSync(main, 'utf8'), main)
    const want = entry.canon
    if (got.ok && want === got.hash) {
      verified.push(key)
      continue
    }
    mismatched.push({ key, pin: 'canon', want, got: got.ok ? got.hash : '' })
  }

  return {
    verdict: 0 < mismatched.length ? 'mismatch' :
      0 < unlocked.length ? 'unlocked' :
        0 < missing.length ? 'missing' : 'ok',
    verified,
    mismatched,
    unlocked,
    missing: missing.sort(cmpBytes),
  }
}


// `aontu pkg vendor`: materialise the locked closure into `aontu_meta/vendor/`.
export function pkgVendor(root: string, options: PkgToolOptions):
  PkgVendorReport {
  const locked = readLock(root)
  const vendored: string[] = []
  const missing: string[] = []

  const vendorRoot = pathJoin(root, META_DIR, VENDOR_DIR)

  for (const key of Object.keys(locked).sort(cmpBytes)) {
    const entry = locked[key]
    if (!usableKey(key)) {
      missing.push(key)
      continue
    }

    const from = storeDir(root, key, entry.canon, entry.pkg ?? key, options, entry.v)
    if (undefined === from) {
      missing.push(key)
      continue
    }

    const to = moduleDir(vendorRoot, key)
    if (from !== to) {
      vendorCopy(from, to)
    }
    vendored.push(key)
  }

  return {
    verdict: 0 === missing.length ? 'ok' : 'missing',
    vendored,
    missing: missing.sort(cmpBytes),
  }
}


// A store tree into the vendor tree: the whole directory, less the
// store's own lock, so the copy resolves against the consumer's.
export function vendorCopy(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true })
  copyTree(from, to)
  const lock = pathJoin(to, META_DIR, LOCK_FILE)
  if (existsSync(lock)) {
    unlinkSync(lock)
  }
}


// A whole package directory, copied as real files: the vendor tree is
// committed, and a link into a shared store is corruption waiting for
// an edit.
export function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from).sort(cmpBytes)) {
    const src = pathJoin(from, name)
    const dst = pathJoin(to, name)
    if (statSync(src).isDirectory()) {
      copyTree(src, dst)
    }
    else {
      mkdirSync(pathDirname(dst), { recursive: true })
      copyFileSync(src, dst)
    }
  }
}


// Every consumer refuses an archive past params.archive at acquire, so
// a publisher refuses to mint one: the reasons, as the forbidden list.
export function archiveOverCaps(archive: Archive): string[] {
  const over: string[] = []
  if (ARCHIVE_LIMITS.bytes < archive.size) {
    over.push('archive: ' + archive.size + ' bytes, over the cap of ' + ARCHIVE_LIMITS.bytes)
  }
  if (ARCHIVE_LIMITS.files < archive.files.length) {
    over.push('archive: ' + archive.files.length + ' files, over the cap of ' + ARCHIVE_LIMITS.files)
  }
  let total = 0
  for (const f of archive.files) {
    total += f.size
    if (ARCHIVE_LIMITS.fileBytes < f.size) {
      over.push(f.path + ': ' + f.size + ' bytes, over the cap of ' + ARCHIVE_LIMITS.fileBytes)
    }
  }
  if (ARCHIVE_LIMITS.unpacked < total) {
    over.push('archive: unpacks to ' + total + ' bytes, over the cap of ' + ARCHIVE_LIMITS.unpacked)
  }
  return over
}


const RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
export const REL_PATH_MAX_ELEMENTS = 32

// A path inside an archive: forward slashes, the element rules, never
// absolute, never escaping, never a name one platform reserves.
export function relPathError(p: string): string | undefined {
  if ('' === p || 512 < p.length || p.startsWith('/') || p.endsWith('/')) {
    return 'an entry path is empty, absolute or a directory'
  }
  const elements = p.split('/')
  if (REL_PATH_MAX_ELEMENTS < elements.length) {
    return 'an entry path has more than ' + REL_PATH_MAX_ELEMENTS + ' elements'
  }
  for (const e of elements) {
    if ('' === e || '.' === e || '..' === e || e.startsWith('.') || e.endsWith('.')) {
      return 'an entry path element is empty or begins or ends with a dot'
    }
    if (!/^[A-Za-z0-9._-]+$/.test(e)) {
      return 'an entry path element is outside the alphabet'
    }
    if (RESERVED_NAME_RE.test(e)) {
      return 'an entry path element is a name a platform reserves'
    }
  }
  return undefined
}


// `aontu pkg refreeze`: recompute every canon pin and nothing else,
// which is what a canonical-form change in the engine needs.
export function pkgRefreeze(root: string, options: PkgToolOptions):
  PkgRefreezeReport {
  const locked = readLock(root)
  const repinned: { key: string, from: string, to: string }[] = []
  const unchanged: string[] = []
  const missing: string[] = []
  const unevaluable: string[] = []
  const lock: LockEntry[] = []

  for (const key of Object.keys(locked).sort(cmpBytes)) {
    const entry = locked[key]
    const dir = usableKey(key) ?
      storeDir(root, key, entry.canon, entry.pkg ?? key, options, entry.v) : undefined
    const main = undefined === dir ? undefined : pathJoin(dir, mainOf(dir, options))
    if (undefined === main || !existsSync(main)) {
      missing.push(key)
      lock.push(entry)
      continue
    }
    const got = options.eval(readFileSync(main, 'utf8'), main)
    if (!got.ok) {
      unevaluable.push(key)
      lock.push(entry)
      continue
    }
    if (got.hash === entry.canon) {
      unchanged.push(key)
      lock.push(entry)
      continue
    }
    repinned.push({ key, from: entry.canon, to: got.hash })
    lock.push({ ...entry, canon: got.hash })
  }

  const held = 0 === missing.length && 0 === unevaluable.length
  if (held && 0 < repinned.length) {
    writeLock(root, lock, options)
  }

  return {
    verdict: held ? 'ok' : 0 < unevaluable.length ? 'error' : 'missing',
    repinned,
    unchanged,
    missing,
    unevaluable,
  }
}


// `aontu pkg tree`: the locked closure as a graph, each node's edges
// read from its own package file in the store.
export function pkgTree(root: string, options: PkgToolOptions): PkgTreeReport {
  const locked = readLock(root)
  const self = packageSelf(root, options)
  const nodes: PkgTreeNode[] = []
  const missing: string[] = []

  nodes.push({
    key: '' === self.path ? '.' : self.path,
    v: self.version,
    deps: Object.keys(declaredDeps(pathJoin(root, PKG_FILE), options)).sort(cmpBytes),
  })

  for (const key of Object.keys(locked).sort(cmpBytes)) {
    const entry = locked[key]
    const dir = usableKey(key) ?
      storeDir(root, key, entry.canon, entry.pkg ?? key, options, entry.v) : undefined
    if (undefined === dir) {
      missing.push(key)
      nodes.push({ key, v: entry.v, deps: [] })
      continue
    }
    nodes.push({
      key, v: entry.v,
      deps: Object.keys(declaredDeps(pathJoin(dir, PKG_FILE), options)).sort(cmpBytes),
    })
  }

  return {
    verdict: 0 === missing.length ? 'ok' : 'missing',
    root: nodes[0].key,
    nodes,
    missing,
  }
}


export const MANIFEST_SCHEMA = 'aontu-package/v1'


export type ManifestModule = { path: string, main: string, canon: string }

// The signed manifest a publish sends (T.Manifest in the specification),
// less what the act of publishing supplies: the time, and the publisher
// the token names.
export type PkgManifest = {
  schema: typeof MANIFEST_SCHEMA
  package: string
  version: string
  publish: 'public' | 'private'
  archive: { format: 'zip', digest: string, size: number, files: ArchiveFile[] }
  modules: ManifestModule[]
  deps: Record<string, Dependency>
  retract?: string[]
  moved?: string
}

export type PkgManifestReport = {
  // `ok` the package may be published; `breaking`, `undecided` or
  // `error` the gate refused, and no publish should follow.
  verdict: 'ok' | 'breaking' | 'undecided' | 'error'
  manifest?: PkgManifest
  // What the package does not declare, sorted. A manifest cannot be
  // minted without them.
  missing: string[]
  forbidden: string[]
  // The gate's findings, when a prior version was named.
  findings: any[]
}


// `aontu pkg manifest`: the manifest a publish would send, and the gate
// that decides whether it may be.
export function pkgManifest(
  root: string, options: PkgToolOptions, against?: string,
): PkgManifestReport {
  const self = packageSelf(root, options)

  const missing: string[] = []
  if ('' === self.path) {
    missing.push('pkg.path')
  }
  else if (isAlias(self.path) || !usableKey(self.path)) {
    missing.push('pkg.path (' + self.path + ' is not a package path)')
  }
  if ('' === self.version) {
    missing.push('pkg.version')
  }
  else if (!VERSION_RE.test(self.version)) {
    missing.push('pkg.version (' + self.version + ' is not MAJOR.MINOR.PATCH)')
  }
  const main = pathJoin(root, self.main)
  if (!existsSync(main) || undefined !== relPathError(self.main)) {
    missing.push(self.main)
  }

  const refused = (why: string[], forbidden: string[] = []): PkgManifestReport => ({
    verdict: 'error', missing: why.sort(cmpBytes), forbidden, findings: [],
  })

  if (0 < missing.length) {
    return refused(missing)
  }

  const newSrc = readFileSync(main, 'utf8')
  const got = options.eval(newSrc, main)

  // Nothing to pin: `tidy` refuses the same way.
  if (!got.ok) {
    return refused([self.main])
  }

  const archive = archiveOf(root)
  if (0 < archive.forbidden.length) {
    return refused([], archive.forbidden)
  }
  const over = archiveOverCaps(archive)
  if (0 < over.length) {
    return refused([], over)
  }

  const report: PkgManifestReport = {
    verdict: 'ok',
    manifest: {
      schema: MANIFEST_SCHEMA,
      package: self.path,
      version: self.version,
      publish: self.publish,
      archive: {
        format: 'zip', digest: archive.digest, size: archive.size,
        files: archive.files,
      },
      modules: [{ path: self.path, main: self.main, canon: got.hash }],
      deps: declaredDeps(pathJoin(root, PKG_FILE), options),
      ...(0 === self.retract.length ? {} : { retract: self.retract }),
      ...(null == self.moved ? {} : { moved: self.moved }),
    },
    missing: [],
    forbidden: [],
    findings: [],
  }

  if (null == against) {
    return report
  }

  // THE PUBLISH-TIME COMPATIBILITY GATE: G3's subsumption
  // (ts/src/subsume.ts), wired at the one place versions are minted,
  // with no major to bump past it (ADR-022).
  const prior = packageSelf(against, options)
  const priorMain = pathJoin(against, prior.main)
  if (!existsSync(priorMain)) {
    report.verdict = 'error'
    report.missing = [prior.main]
    return report
  }

  const priorSrc = readFileSync(priorMain, 'utf8')
  const urls = {
    generalUrl: main,
    specificUrl: priorMain,
    generalPath: main,
    specificPath: priorMain,
  }
  const gate = subsume(newSrc, priorSrc, urls)

  report.findings = gate.findings
  report.verdict = MANIFEST_VERDICT[gate.verdict]
  if ('error' === gate.verdict) {
    return report
  }

  // Admission alone is not compatibility: what the prior version
  // generated, the next must generate, and the same (ts/src/compat.ts).
  const outcome = compatOutcome(newSrc, priorSrc, urls)
  report.findings = report.findings.concat(outcome.findings)
  if ('breaking' === outcome.verdict) {
    report.verdict = 'breaking'
  }
  return report
}


const MANIFEST_VERDICT: Record<string, PkgManifestReport['verdict']> = {
  subsumes: 'ok',
  does_not_subsume: 'breaking',
  undecided: 'undecided',
  error: 'error',
}


// The manifest as the bytes a publish signs and a repository serves:
// canonical aontu, one line, keys sorted, which for scalar leaves is
// JSON.
export function manifestText(m: PkgManifest, options: PkgToolOptions,
  extra?: Record<string, any>): string {
  const src = JSON.stringify({ ...m, ...(extra ?? {}) })
  return options.eval(src, 'manifest.aon').canon
}
