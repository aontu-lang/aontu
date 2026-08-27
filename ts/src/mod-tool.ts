/* Copyright (c) 2025 Richard Rodger, MIT License */

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

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
  copyFileSync,
} from 'node:fs'
import { join as pathJoin, dirname as pathDirname } from 'node:path'

import { parseModuleRef, moduleDir, lockJson } from './mod'
import { subsume } from './subsume'
import type { ModuleRef } from './mod'


// One entry of the lockfile, and of a tidy report.
export type ModLock = {
  // The module path and major, as an import spells it.
  mod: string
  // The selected version.
  v: string
  // The canon-hash of the module as it is in the local store.
  canon: string
  // The registry digest, carried over from a previous lockfile. Empty
  // when nothing has ever fetched this module: the OCI pin is the
  // registry's word, and only a fetch can hear it.
  oci: string
}

export type ModTidyReport = {
  verdict: 'ok' | 'missing' | 'error'
  // The resolved closure, sorted by module.
  lock: ModLock[]
  // Modules named by a dependency but present in no local store, sorted.
  missing: string[]
  // Modules present in a store but which DO NOT EVALUATE standalone,
  // sorted. A pin is what a module MEANS, so there is nothing to pin
  // here and the lockfile is left alone.
  unevaluable: string[]
}

export type ModVerifyReport = {
  // `ok` the lockfile covers what the project declares and every
  // locked module still means what it pins; `mismatch` at least one
  // does not; `unlocked` the lockfile does not cover the project's own
  // dependencies; `missing` at least one locked module is not in any
  // store. In that order of precedence, most specific first.
  verdict: 'ok' | 'mismatch' | 'unlocked' | 'missing'
  // The locked modules that verified, sorted.
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
  // The modules materialised into `aon_vendor/`, sorted.
  vendored: string[]
  // Locked modules present in no store, sorted.
  missing: string[]
}


// What the tooling needs from the engine, injected for the reason
// ts/src/mod.ts's ModuleEval is: evaluating a module is what the
// evaluator does, and the tooling is a caller of it rather than a
// second implementation.
export type ModToolEval = (src: string, path: string) =>
  {
    gen: any, hash: string, canon: string,
    // DID IT STAND UP ON ITS OWN? A module that does not evaluate has
    // no meaning to pin, and `canonHash` of the nil it collapses to is
    // the SAME string for every such module -- so a lockfile written
    // from one carries no information while looking exactly like one
    // that does (use-cases/BUGS.md §31). `aontu hash` already refuses
    // that file; `tidy` refuses it too, and this is what tells it.
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


// Numeric-dotted version order: `1.10.0` is above `1.9.0`, which
// STRING order gets wrong, and that is the whole reason this is not a
// `<` on the text. A part that is not a number compares as text, after
// every number — a pre-release tag is below no version and above none.
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


// The directory a module is in, in the local stores: the project's
// vendor tree first, then the cache under the hash the lockfile pins.
function storeDir(
  root: string, ref: ModuleRef, hash: string, options: ModToolOptions,
): string | undefined {
  const stores = [moduleDir(pathJoin(root, 'aon_vendor'), ref)]
  if (null != options.cache && '' !== hash) {
    stores.push(pathJoin(options.cache, hash))
  }
  return stores.find((d) => existsSync(pathJoin(d, 'mod.aon')))
}


// The lockfile's entries, as written.
function readLock(root: string): Record<string, ModLock> {
  const file = pathJoin(root, 'mod-lock.aon')
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


// The lockfile TEXT: canonical Aontu, one line, keys sorted. Built as
// source and canonicalised by the engine rather than printed by hand,
// so "canonical form" means what the language means by it and cannot
// drift from it.
export function lockText(entries: ModLock[], options: ModToolOptions): string {
  const parts = entries.map((e) =>
    JSON.stringify(e.mod) + ':{' +
    '"canon":' + JSON.stringify(e.canon) + ',' +
    '"oci":' + JSON.stringify(e.oci) + ',' +
    '"v":' + JSON.stringify(e.v) + '}')
  // Canonicalised by the ENGINE rather than printed by hand, so
  // "canonical form" means what the language means by it and cannot
  // drift from it. For a map of scalars that canon is also JSON, which
  // is what lets the resolver read a pin back without an evaluator
  // (ts/src/mod.ts lockHash).
  return options.eval('{"lock":{' + parts.join(',') + '}}', 'mod-lock.aon').canon
}


// `aontu mod tidy`: resolve the closure by MVS and rewrite the lockfile.
export function modTidy(root: string, options: ModToolOptions): ModTidyReport {
  const previous = readLock(root)
  const selected: Record<string, string> = {}
  const missing: string[] = []

  // The closure, breadth-first from the project's own declarations. A
  // module already selected at a version at least as high contributes
  // nothing new, which is what makes this terminate without a cycle
  // check: the selected version only ever rises.
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

      const ref = parseModuleRef(mod)
      if (undefined === ref) {
        // A dependency key that is not a module path names nothing this
        // resolver can find, which is the same answer as a module that
        // is not there.
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
    const ref = parseModuleRef(mod) as ModuleRef
    const dir = storeDir(root, ref, previous[mod]?.canon ?? '', options) as string
    const main = pathJoin(dir, mainOf(dir, options))
    // RECOMPUTED, never carried over: the pin is what the module in
    // this store MEANS, and a tidy that copied the old hash forward
    // would pin what it used to mean.
    const got = existsSync(main) ?
      options.eval(readFileSync(main, 'utf8'), main) : undefined
    // A NIL PIN IS WORSE THAN NO PIN. A module that does not stand up
    // hashes to canonHash(nil) -- the same string for every broken
    // module -- so writing it would put a plausible, uninformative
    // pin in the lockfile and silently void the "breaks on any
    // semantic change in the closure" contract (BUGS.md §31).
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
    writeFileSync(pathJoin(root, 'mod-lock.aon'),
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
export function modVerify(root: string, options: ModToolOptions):
  ModVerifyReport {
  const locked = readLock(root)
  const verified: string[] = []
  const mismatched: { mod: string, want: string, got: string }[] = []
  const missing: string[] = []

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
  const declared = declaredDeps(pathJoin(root, 'mod.aon'), options)
  const unlocked = Object.keys(declared)
    .filter((mod) => null == locked[mod]).sort()

  for (const mod of Object.keys(locked).sort()) {
    const ref = parseModuleRef(mod)
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

    // A module that no longer stands up is not a match: it has no
    // meaning to compare, and reporting `got: <hash of nil>` would
    // print the same string for every broken module. The empty `got`
    // says the store holds something that does not evaluate.
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


// `aontu mod vendor`: materialise the locked closure into `aon_vendor/`.
export function modVendor(root: string, options: ModToolOptions):
  ModVendorReport {
  const locked = readLock(root)
  const vendored: string[] = []
  const missing: string[] = []

  for (const mod of Object.keys(locked).sort()) {
    const ref = parseModuleRef(mod)
    if (undefined === ref) {
      missing.push(mod)
      continue
    }

    const from = storeDir(root, ref, locked[mod].canon, options)
    if (undefined === from) {
      missing.push(mod)
      continue
    }

    const to = moduleDir(pathJoin(root, 'aon_vendor'), ref)
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
export const MODULE_CONFIG_MEDIA_TYPE = 'application/vnd.aontu.module.v1+json'

// The canon-hash annotation. OCI asks a custom key to be the reverse
// DNS of a domain its author controls, and the project's own home is
// the only domain it has -- inventing an `aontu.dev` would be a claim
// it cannot back. The two facts OCI already has keys for use those.
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
  // The layer's contents: every file of the source tree, relative,
  // forward-slashed and sorted, so two implementations on two platforms
  // describe the same layer.
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


// The leading numeric component of a version, which is the major an
// import spells. Empty when the version does not start with one: a
// version whose major cannot be read cannot be published under a
// module path, because the path is where the major lives.
function majorOf(version: string): string {
  const m = /^(\d+)/.exec(version)
  return null == m ? '' : m[1]
}


// Every file of a module's source tree, relative and forward-slashed.
// `aon_vendor/` is excluded: a published module carries its own
// sources, not a copy of everyone else's -- a consumer resolves the
// closure itself, and a nested vendor tree would publish the world.
function layerFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    if ('aon_vendor' === name) {
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
  const canon = options.eval(newSrc, main).hash

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

  // A MAJOR BUMP IS WHERE BREAKING IS ALLOWED. The major lives in the
  // module path, so a consumer of `@1` never sees `@2` unless it asks:
  // checking compatibility across majors would forbid the one change
  // the version scheme exists to express.
  if (majorOf(prior.version) !== major) {
    return report
  }

  // Backward compatibility: the NEW version is the general side, so
  // every instance the old one admitted must still be admitted.
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
