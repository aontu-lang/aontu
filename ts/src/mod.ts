/* Copyright (c) 2025 Richard Rodger, MIT License */


import { join as pathJoin, dirname as pathDirname } from 'node:path'


export type ModuleRef = {
  // The package path, or the alias key `alias:<name>` when the import
  // spells one; an alias is resolved by lookup, never by shape.
  path: string
  // The inline canon-hash pin, if the import froze one.
  hash?: string
}


export type ModuleFs = {
  existsSync: (p: string) => boolean
  readFileSync: (p: string, enc: string) => string
}


// A package path is `<domain>/<path>` and carries no major (ADR-022).
const MODULE_RE =
  /^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[A-Za-z0-9._-]+)*)(?:#(aon1-[A-Za-z0-9_-]+))?$/

const ALIAS_RE = /^(alias:[A-Za-z0-9._-]+)(?:#(aon1-[A-Za-z0-9_-]+))?$/

export const ALIAS_PREFIX = 'alias:'


export function parseModuleRef(spec: string): ModuleRef | undefined {
  const m = MODULE_RE.exec(spec) ?? ALIAS_RE.exec(spec)
  if (null == m) {
    return undefined
  }
  return {
    path: m[1],
    ...(null == m[2] ? {} : { hash: m[2] }),
  }
}


export function isAlias(path: string): boolean {
  return path.startsWith(ALIAS_PREFIX)
}


export const MODULE_MAX_PATH = 512
export const MODULE_MAX_ELEMS = 32


const RESERVED_ELEMS = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])


export function validateModulePath(path: string): string | undefined {
  if (MODULE_MAX_PATH < path.length) {
    return 'longer than ' + MODULE_MAX_PATH + ' characters'
  }

  const elems = path.split('/')
  if (MODULE_MAX_ELEMS < elems.length) {
    return 'more than ' + MODULE_MAX_ELEMS + ' elements'
  }

  for (const elem of elems) {
    if ('' === elem) {
      return 'an element is empty'
    }
    if (elem.startsWith('.') || elem.endsWith('.')) {
      return 'an element begins or ends with "."'
    }
    if (RESERVED_ELEMS.has(elem.split('.')[0].toLowerCase())) {
      return 'an element is a reserved device name'
    }
  }

  return undefined
}


// The final element of a routed path, when it carries an extension the
// include table knows, was meant as a file: the commonest mistake once
// the major left the name (ADR-022 part 4), so it gets its own message.
export function localFileExt(path: string): string | undefined {
  const last = path.split('/').pop() as string
  const m = /\.([^.]+)$/.exec(last)
  return null == m ? undefined : m[1].toLowerCase()
}


export function escapeElem(elem: string): string {
  return elem.replace(/[A-Z]/g, (c) => '!' + c.toLowerCase())
}


// The directory a key lives at under a store: one directory per
// element, uppercase escaped; an alias under `alias/<name>`, which no
// package path can spell because a domain carries a dot.
export function moduleDir(store: string, path: string): string {
  const elems = isAlias(path) ?
    ['alias', path.slice(ALIAS_PREFIX.length)] : path.split('/')
  return pathJoin(store, ...elems.map(escapeElem))
}


export const PKG_FILE = 'pkg.aon'
export const LOCK_FILE = 'pkg-lock.aon'
export const META_DIR = 'aontu_meta'
export const VENDOR_DIR = 'vendor'


export function projectRoots(from: string, fs: ModuleFs): string[] {
  const roots: string[] = []
  let dir = from
  for (; ;) {
    if (fs.existsSync(pathJoin(dir, PKG_FILE))) {
      roots.push(dir)
    }
    const up = pathDirname(dir)
    if (up === dir) {
      return 0 < roots.length ? roots : [from]
    }
    dir = up
  }
}


export function lockJson(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
}


export function modCacheDir(): string | undefined {
  return modCacheDirFor(process.platform, process.env)
}


export function modCacheDirFor(
  platform: string,
  env: Record<string, string | undefined>,
): string | undefined {
  const xdg = env.XDG_CACHE_HOME
  if ('string' === typeof xdg && '' !== xdg) {
    return pathJoin(xdg, 'aontu', 'pkg')
  }
  const home = env.HOME
  if ('string' === typeof home && '' !== home) {
    return pathJoin(home, '.cache', 'aontu', 'pkg')
  }
  if ('win32' === platform) {
    const local = env.LOCALAPPDATA
    if ('string' === typeof local && '' !== local) {
      return pathJoin(local, 'aontu', 'pkg')
    }
  }
  return undefined
}


// The user cache's trees (ADR-039 part 2).
export function cacheStoreDir(cache: string, hash: string, pkg: string): string {
  return moduleDir(pathJoin(cache, 'store', hash), pkg)
}

export function cacheDownloadDir(cache: string, pkg: string): string {
  return pathJoin(moduleDir(pathJoin(cache, 'download'), pkg), '@v')
}

export function cacheSeenDir(cache: string, pkg: string): string {
  return moduleDir(pathJoin(cache, 'seen'), pkg)
}


export type LockPins = { canon?: string, pkg?: string }


export function lockEntry(root: string, key: string, fs: ModuleFs):
  LockPins | undefined {
  const file = pathJoin(root, META_DIR, LOCK_FILE)
  if (!fs.existsSync(file)) {
    return undefined
  }

  let lock: any
  try {
    lock = JSON.parse(lockJson(fs.readFileSync(file, 'utf8')))
  }
  catch {
    return undefined
  }

  const entry = lock?.lock?.[key]
  if (null == entry || 'object' !== typeof entry) {
    return undefined
  }
  return {
    ...('string' === typeof entry.canon ? { canon: entry.canon } : {}),
    ...('string' === typeof entry.pkg ? { pkg: entry.pkg } : {}),
  }
}


export type ModuleEval =
  (src: string, path: string) => { gen: any, hash: string }


export const MODULE_MAX_DEPTH = 16


export type ModuleOptions = {
  // The content-addressed user cache. Consulted only when the expected
  // hash and the package path are both known, which is what its key
  // is made of.
  cache?: string
  eval: ModuleEval
  // How many module verifications deep this evaluation already is.
  depth?: number
}


export type ModuleFound = {
  // The module's main file, as an absolute path.
  full: string
  src: string
}


export const MODULE_REFUSAL_CODES: ReadonlySet<string> = new Set([
  'module_path', 'module_missing', 'module_integrity', 'module_depth',
  'module_local', 'module_moved',
])


function refuse(code: string, message: string): never {
  const err: any = new Error(message)
  err.code = code
  throw err
}


export function refuseLocalFile(path: string): never {
  return refuse('module_local',
    'local files need a ./ prefix: ' + path + ' (write @"./' + path + '")')
}


// Resolve one module import against the local stores.
export function resolveModule(
  ref: ModuleRef,
  fromDir: string,
  fs: ModuleFs,
  options: ModuleOptions,
): ModuleFound {
  const alias = isAlias(ref.path)
  const badpath = alias ? undefined : validateModulePath(ref.path)
  if (undefined !== badpath) {
    refuse('module_path', 'module path: ' + ref.path + ' (' + badpath + ')')
  }

  if (MODULE_MAX_DEPTH <= (options.depth ?? 0)) {
    refuse('module_depth',
      'module depth: ' + ref.path +
      ' (verification nested past ' + MODULE_MAX_DEPTH + ')')
  }

  // EVERY enclosing project, innermost first (see projectRoots): a
  // vendored package is a project inside a project, and its nested
  // imports have to reach the tree the consumer vendored them into.
  const roots = projectRoots(fromDir, fs)
  const locked = roots.map((r) => lockEntry(r, ref.path, fs))
    .find((e) => null != e)
  const expect = ref.hash ?? locked?.canon
  // The store is keyed by hash AND package path; an alias names its
  // package in the lockfile, else in the package file that declares it.
  const pkg = alias ?
    (locked?.pkg ?? roots.map((r) => aliasTarget(r, ref.path, fs, options))
      .find((p) => null != p)) : ref.path

  if (alias && null == pkg) {
    refuse('module_missing',
      'alias not declared: ' + ref.path + ' (declare it under dep in ' +
      PKG_FILE + ')')
  }

  const stores: string[] =
    roots.map((r) => moduleDir(pathJoin(r, META_DIR, VENDOR_DIR), ref.path))
  if (null != options.cache && null != expect) {
    stores.push(cacheStoreDir(options.cache, expect, pkg as string))
  }

  const dir = stores.find((d) => fs.existsSync(pathJoin(d, PKG_FILE)))
  if (undefined === dir) {
    refuse('module_missing',
      'module not fetched: ' + ref.path + ' (run: aontu sync)')
  }

  // The package's own file names its entry and says whether it moved.
  // Read with the evaluator rather than a regexp: a package file is
  // ordinary Aontu, and the language reading its own metadata is the
  // point.
  const self = packageSelf(pathJoin(dir, PKG_FILE), fs, options)
  if (null != self.moved) {
    refuse('module_moved',
      'module moved: ' + ref.path + ' (now ' + self.moved +
      '; import that instead, nothing follows a move)')
  }
  const full = pathJoin(dir, self.main)

  if (!fs.existsSync(full)) {
    refuse('module_missing',
      'module not fetched: ' + ref.path + ' (run: aontu sync)')
  }

  const src = fs.readFileSync(full, 'utf8')

  if (null != expect) {
    // VERIFICATION IS ALWAYS LOCAL. The repository's manifest is a
    // claim; what decides is the hash of the module as it is on this
    // machine, recomputed now.
    const got = options.eval(src, full).hash
    if (got !== expect) {
      refuse('module_integrity',
        'module integrity: ' + ref.path +
        ' expected ' + expect + ' got ' + got)
    }
  }

  return { full, src }
}


type PackageSelf = { main: string, moved?: string }

function packageSelf(file: string, fs: ModuleFs, options: ModuleOptions):
  PackageSelf {
  const gen: any = options.eval(fs.readFileSync(file, 'utf8'), file).gen
  const main = gen?.pkg?.main
  const moved = gen?.moved
  return {
    main: 'string' === typeof main && '' !== main ? main : DEFAULT_MAIN,
    ...('string' === typeof moved && '' !== moved ? { moved } : {}),
  }
}


function aliasTarget(
  root: string, key: string, fs: ModuleFs, options: ModuleOptions,
): string | undefined {
  const file = pathJoin(root, PKG_FILE)
  if (!fs.existsSync(file)) {
    return undefined
  }
  const gen: any = options.eval(fs.readFileSync(file, 'utf8'), file).gen
  const pkg = gen?.dep?.[key]?.pkg
  return 'string' === typeof pkg && '' !== pkg ? pkg : undefined
}


const DEFAULT_MAIN = 'main.aon'
