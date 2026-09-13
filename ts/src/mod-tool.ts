/* Copyright (c) 2025 Richard Rodger, MIT License */


import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
  copyFileSync,
} from 'node:fs'
import { join as pathJoin, dirname as pathDirname } from 'node:path'

import {
  parseModuleRef, validateModulePath, moduleDir, lockJson,
} from './mod'
import { subsume } from './subsume'
import type { ModuleRef } from './mod'


// One entry of the lockfile, and of a tidy report.
export type ModLock = {
  // The module path and major, as an import spells it.
  mod: string
  // The selected version.
  v: string
  canon: string
  oci: string
}

export type ModTidyReport = {
  verdict: 'ok' | 'missing' | 'error'
  // The resolved closure, sorted by module.
  lock: ModLock[]
  missing: string[]
  unevaluable: string[]
}

export type ModVerifyReport = {
  verdict: 'ok' | 'mismatch' | 'unlocked' | 'missing'
  verified: string[]
  // What the lockfile pins against what the store now means, for each
  // module that does not match, sorted by module.
  mismatched: { mod: string, want: string, got: string }[]
  // Dependencies the project declares that the lockfile does not name,
  // sorted. A tidy is what fills them in.
  unlocked: string[]
  // Locked modules present in no store, sorted.
  missing: string[]
}

export type ModVendorReport = {
  verdict: 'ok' | 'missing'
  // The modules materialised into `aontu_meta/vendor/`, sorted.
  vendored: string[]
  // Locked modules present in no store, sorted.
  missing: string[]
}


export type ModToolEval = (src: string, path: string) =>
  {
    gen: any, hash: string, canon: string,
    ok: boolean,
  }


export type ModToolOptions = {
  // The content-addressed user cache. Empty means no cache is
  // consulted, which is a store that misses rather than an error.
  cache?: string
  eval: ModToolEval
}


// The `dep` block a module file declares: import string -> version.
function declaredDeps(file: string, options: ModToolOptions):
  Record<string, string> {
  if (!existsSync(file)) {
    return {}
  }

  const gen: any = options.eval(readFileSync(file, 'utf8'), file).gen
  const dep = gen?.dep
  if (null == dep || 'object' !== typeof dep) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const key of Object.keys(dep)) {
    const v = dep[key]?.v
    if ('string' === typeof v && '' !== v) {
      out[key] = v
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
      return +x < +y ? -1 : 1
    }
    if (xn !== yn) {
      return xn ? -1 : 1
    }
    return x < y ? -1 : 1
  }
  return 0
}


function usableRef(mod: string): ModuleRef | undefined {
  const ref = parseModuleRef(mod)
  if (undefined === ref || undefined !== validateModulePath(ref.path)) {
    return undefined
  }
  return ref
}


// The directory a module is in, in the local stores: the project's
// vendor tree first, then the cache under the hash the lockfile pins.
function storeDir(
  root: string, ref: ModuleRef, hash: string, options: ModToolOptions,
): string | undefined {
  const stores = [moduleDir(pathJoin(root, 'aontu_meta', 'vendor'), ref)]
  if (null != options.cache && '' !== hash) {
    stores.push(pathJoin(options.cache, hash))
  }
  return stores.find((d) => existsSync(pathJoin(d, 'mod.aon')))
}


// The lockfile's entries, as written.
function readLock(root: string): Record<string, ModLock> {
  const file = pathJoin(root, 'aontu_meta', 'mod-lock.aon')
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

  const out: Record<string, ModLock> = {}
  for (const mod of Object.keys(lock?.lock ?? {})) {
    const e = lock.lock[mod]
    out[mod] = {
      mod,
      v: 'string' === typeof e?.v ? e.v : '',
      canon: 'string' === typeof e?.canon ? e.canon : '',
      oci: 'string' === typeof e?.oci ? e.oci : '',
    }
  }
  return out
}


export function lockText(entries: ModLock[], options: ModToolOptions): string {
  const parts = entries.map((e) =>
    JSON.stringify(e.mod) + ':{' +
    '"canon":' + JSON.stringify(e.canon) + ',' +
    '"oci":' + JSON.stringify(e.oci) + ',' +
    '"v":' + JSON.stringify(e.v) + '}')
  return options.eval('{"lock":{' + parts.join(',') + '}}', 'mod-lock.aon').canon
}


// `aontu mod tidy`: resolve the closure by MVS and rewrite the lockfile.
export function modTidy(root: string, options: ModToolOptions): ModTidyReport {
  const previous = readLock(root)
  const selected: Record<string, string> = {}
  const missing: string[] = []

  let frontier = declaredDeps(pathJoin(root, 'mod.aon'), options)
  for (; 0 < Object.keys(frontier).length;) {
    const next: Record<string, string> = {}

    for (const mod of Object.keys(frontier)) {
      const want = frontier[mod]
      const have = selected[mod]
      if (null != have && 0 <= versionCompare(have, want)) {
        continue
      }
      selected[mod] = want

      const ref = usableRef(mod)
      if (undefined === ref) {
        // A dependency key this tooling cannot act on names nothing
        // this resolver can find, which is the same answer as a module
        // that is not there (see usableRef).
        missing.push(mod)
        continue
      }

      const dir = storeDir(root, ref, previous[mod]?.canon ?? '', options)
      if (undefined === dir) {
        missing.push(mod)
        continue
      }

      const deps = declaredDeps(pathJoin(dir, 'mod.aon'), options)
      for (const key of Object.keys(deps)) {
        const bid = next[key]
        if (null == bid || 0 > versionCompare(bid, deps[key])) {
          next[key] = deps[key]
        }
      }
    }

    frontier = next
  }

  const lock: ModLock[] = []
  const unevaluable: string[] = []
  for (const mod of Object.keys(selected).sort()) {
    if (missing.includes(mod)) {
      continue
    }
    const ref = usableRef(mod) as ModuleRef
    const dir = storeDir(root, ref, previous[mod]?.canon ?? '', options) as string
    const main = pathJoin(dir, mainOf(dir, options))
    const got = existsSync(main) ?
      options.eval(readFileSync(main, 'utf8'), main) : undefined
    if (null != got && !got.ok) {
      unevaluable.push(mod)
      continue
    }
    lock.push({
      mod,
      v: selected[mod],
      canon: null == got ? '' : got.hash,
      // Carried over: the OCI digest is the registry's word about the
      // bytes it served, and nothing local can hear it.
      oci: previous[mod]?.oci ?? '',
    })
  }

  const uniqueMissing = [...new Set(missing)].sort()
  const uniqueUnevaluable = [...new Set(unevaluable)].sort()
  const held = 0 === uniqueMissing.length && 0 === uniqueUnevaluable.length
  if (held) {
    mkdirSync(pathJoin(root, 'aontu_meta'), { recursive: true })
    writeFileSync(pathJoin(root, 'aontu_meta', 'mod-lock.aon'),
      LOCK_HEADER + lockText(lock, options) + '\n')
  }

  return {
    verdict: held ? 'ok' :
      0 < uniqueUnevaluable.length ? 'error' : 'missing',
    lock,
    missing: uniqueMissing,
    unevaluable: uniqueUnevaluable,
  }
}


// The generated-file header. A lockfile is machine-written, and the
// file says so where an editor will see it.
const LOCK_HEADER =
  '# mod-lock.aon (generated by `aontu mod tidy`; do not edit)\n'


// The entry file a module declares, or the default. `dir` is always a
// STORE directory, and `storeDir` only answers one that holds a
// `mod.aon` -- so there is no missing-file arm to take here.
function mainOf(dir: string, options: ModToolOptions): string {
  const file = pathJoin(dir, 'mod.aon')
  const gen: any = options.eval(readFileSync(file, 'utf8'), file).gen
  const main = gen?.mod?.main
  return 'string' === typeof main && '' !== main ? main : 'main.aon'
}


export function modVerify(root: string, options: ModToolOptions):
  ModVerifyReport {
  const locked = readLock(root)
  const verified: string[] = []
  const mismatched: { mod: string, want: string, got: string }[] = []
  const missing: string[] = []

  const declared = declaredDeps(pathJoin(root, 'mod.aon'), options)
  const unlocked = Object.keys(declared)
    .filter((mod) => null == locked[mod]).sort()

  for (const mod of Object.keys(locked).sort()) {
    const ref = usableRef(mod)
    if (undefined === ref) {
      missing.push(mod)
      continue
    }
    const dir = storeDir(root, ref, locked[mod].canon, options)
    if (undefined === dir) {
      missing.push(mod)
      continue
    }
    const main = pathJoin(dir, mainOf(dir, options))
    if (!existsSync(main)) {
      missing.push(mod)
      continue
    }

    const got = options.eval(readFileSync(main, 'utf8'), main)
    const want = locked[mod].canon
    if (got.ok && want === got.hash) {
      verified.push(mod)
      continue
    }
    mismatched.push({ mod, want, got: got.ok ? got.hash : '' })
  }

  return {
    verdict: 0 < mismatched.length ? 'mismatch' :
      0 < unlocked.length ? 'unlocked' :
        0 < missing.length ? 'missing' : 'ok',
    verified,
    mismatched,
    unlocked,
    missing: missing.sort(),
  }
}


// `aontu mod vendor`: materialise the locked closure into `aontu_meta/vendor/`.
export function modVendor(root: string, options: ModToolOptions):
  ModVendorReport {
  const locked = readLock(root)
  const vendored: string[] = []
  const missing: string[] = []

  const vendorRoot = pathJoin(root, 'aontu_meta', 'vendor')

  for (const mod of Object.keys(locked).sort()) {
    const ref = usableRef(mod)
    if (undefined === ref) {
      missing.push(mod)
      continue
    }

    const from = storeDir(root, ref, locked[mod].canon, options)
    if (undefined === from) {
      missing.push(mod)
      continue
    }

    const to = moduleDir(vendorRoot, ref)
    if (from !== to) {
      copyTree(from, to)
    }
    vendored.push(mod)
  }

  return {
    verdict: 0 === missing.length ? 'ok' : 'missing',
    vendored,
    missing: missing.sort(),
  }
}


// A whole module directory, copied. Modules are source trees — that is
// what an OCI layer holds — so this walks rather than reading one file.
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from).sort()) {
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


// The config media type the design fixes: an Aontu module is not an
// image, and the type is what tells a registry so.
export const MODULE_CONFIG_MEDIA_TYPE = 'application/vnd.aontu.module.v1+json'

export const MODULE_ANNOTATION_CANON = 'com.github.rjrodger.aontu.canon'
export const MODULE_ANNOTATION_MAJOR = 'com.github.rjrodger.aontu.major'


export type ModManifestReport = {
  // `ok` the artifact may be minted; `breaking`, `undecided` or `error`
  // the gate refused, and no publish should follow.
  verdict: 'ok' | 'breaking' | 'undecided' | 'error'
  // The module path with its major, as an import spells it.
  mod: string
  version: string
  // The canon-hash of the module's entry file, evaluated standalone.
  canon: string
  config: string
  files: string[]
  annotations: Record<string, string>
  // What the module does not declare, sorted. A manifest cannot be
  // minted without them.
  missing: string[]
  // The gate's findings, when a prior version was named.
  findings: any[]
}


// What a module file says about ITSELF. Distinct from `declaredDeps`,
// which reads what it says about others.
type ModSelf = { path: string, version: string, main: string }

function modSelf(dir: string, options: ModToolOptions): ModSelf {
  const file = pathJoin(dir, 'mod.aon')
  if (!existsSync(file)) {
    return { path: '', version: '', main: 'main.aon' }
  }
  const gen: any = options.eval(readFileSync(file, 'utf8'), file).gen
  const mod = gen?.mod
  const str = (k: string): string =>
    'string' === typeof mod?.[k] ? mod[k] : ''
  return {
    path: str('path'),
    version: str('version'),
    main: '' === str('main') ? 'main.aon' : str('main'),
  }
}


function majorOf(version: string): string {
  const m = /^(\d+)/.exec(version)
  return null == m ? '' : m[1]
}


function layerFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    if ('aontu_meta' === name) {
      continue
    }
    const full = pathJoin(dir, name)
    const rel = '' === prefix ? name : prefix + '/' + name
    if (statSync(full).isDirectory()) {
      out.push(...layerFiles(full, rel))
    }
    else {
      out.push(rel)
    }
  }
  return out
}


// `aontu mod manifest`: the OCI artifact description a publish would
// push, and the gate that decides whether it may be.
export function modManifest(
  root: string, options: ModToolOptions, against?: string,
): ModManifestReport {
  const self = modSelf(root, options)
  const major = majorOf(self.version)

  const missing: string[] = []
  if ('' === self.path) {
    missing.push('mod.path')
  }
  if ('' === major) {
    missing.push('mod.version')
  }
  const main = pathJoin(root, self.main)
  if (!existsSync(main)) {
    missing.push(self.main)
  }

  const mod = '' === self.path || '' === major ?
    '' : self.path + '@' + major

  if (0 < missing.length) {
    return {
      verdict: 'error',
      mod,
      version: self.version,
      canon: '',
      config: MODULE_CONFIG_MEDIA_TYPE,
      files: [],
      annotations: {},
      missing: missing.sort(),
      findings: [],
    }
  }

  const newSrc = readFileSync(main, 'utf8')
  const got = options.eval(newSrc, main)

  // Nothing to pin: `tidy` refuses the same way.
  if (!got.ok) {
    return {
      verdict: 'error',
      mod,
      version: self.version,
      canon: '',
      config: MODULE_CONFIG_MEDIA_TYPE,
      files: [],
      annotations: {},
      missing: [self.main],
      findings: [],
    }
  }

  const canon = got.hash

  const report: ModManifestReport = {
    verdict: 'ok',
    mod,
    version: self.version,
    canon,
    config: MODULE_CONFIG_MEDIA_TYPE,
    files: layerFiles(root),
    annotations: {
      [MODULE_ANNOTATION_CANON]: canon,
      [MODULE_ANNOTATION_MAJOR]: major,
      'org.opencontainers.image.title': self.path,
      'org.opencontainers.image.version': self.version,
    },
    missing: [],
    findings: [],
  }

  if (null == against) {
    return report
  }

  // THE PUBLISH-TIME BREAKING GATE. The semantics of "breaking" belong
  // wholly to G3 (ts/src/subsume.ts); this is the wiring, at the one
  // place versions are minted.
  const prior = modSelf(against, options)
  const priorMain = pathJoin(against, prior.main)
  if (!existsSync(priorMain)) {
    report.verdict = 'error'
    report.missing = [prior.main]
    return report
  }

  if (majorOf(prior.version) !== major) {
    return report
  }

  const gate = subsume(newSrc, readFileSync(priorMain, 'utf8'), {
    generalUrl: main,
    specificUrl: priorMain,
    generalPath: main,
    specificPath: priorMain,
  })

  report.findings = gate.findings
  report.verdict = MANIFEST_VERDICT[gate.verdict]
  return report
}


const MANIFEST_VERDICT: Record<string, ModManifestReport['verdict']> = {
  subsumes: 'ok',
  does_not_subsume: 'breaking',
  undecided: 'undecided',
  error: 'error',
}
