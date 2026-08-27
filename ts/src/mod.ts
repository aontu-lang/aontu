/* Copyright (c) 2025 Richard Rodger, MIT License */

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
// only: `aon_vendor/` beside the project's `mod.aon`, then a
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

import { join as pathJoin, dirname as pathDirname } from 'node:path'


// A module import, as the string spells it.
export type ModuleRef = {
  // The module path WITHOUT the major: `corp.example/schemas/service`.
  path: string
  // The major version, from the `@N` suffix.
  major: number
  // The inline canon-hash pin, if the import froze one.
  hash?: string
}


// A file store the resolver can read. The engine passes its own `fs`
// when the host injected one, so a sandboxed evaluation stays in the
// filesystem the host gave it.
export type ModuleFs = {
  existsSync: (p: string) => boolean
  readFileSync: (p: string, enc: string) => string
}


// A module path is DOMAIN-SHAPED — the first segment carries a dot,
// which is what tells it apart from `./local.aon`, `pkg-name` and every
// other spelling already in use — and carries the major version in the
// path, CUE/Go-style, so two majors are two modules.
//
// The pattern is deliberately narrow: anything it does not match falls
// through to the existing resolver chain unchanged, so no document that
// worked before this phase can be routed somewhere new by it.
const MODULE_RE =
  /^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[A-Za-z0-9._-]+)*)@(\d+)(?:#(aon1-[A-Za-z0-9_-]+))?$/


export function parseModuleRef(spec: string): ModuleRef | undefined {
  const m = MODULE_RE.exec(spec)
  if (null == m) {
    return undefined
  }
  return {
    path: m[1],
    major: +m[2],
    ...(null == m[3] ? {} : { hash: m[3] }),
  }
}


// The directory a module's files live in, under a store root.
export function moduleDir(store: string, ref: ModuleRef): string {
  return pathJoin(store, ...ref.path.split('/')) + '@' + ref.major
}


// EVERY project root at or above `from`, innermost first — a project
// root being a directory holding a `mod.aon`. This used to answer with
// the NEAREST one alone, and the plural is the fix, because a
// VENDORED MODULE IS A PROJECT INSIDE A PROJECT. A module in
// `aon_vendor/` carries its own `mod.aon`, which stopped the upward
// walk there, so a nested import resolved against the vendored
// module's own directory: a tree with no `aon_vendor/` of its own, and
// therefore a `module not fetched` for a dependency sitting flat
// beside it in the CONSUMER's vendor tree — the only layout `mod
// vendor` produces (use-cases/BUGS.md §31).
//
// The consumer's stores are searched after the module's own, so a
// module that vendors its dependencies nested still wins for its own
// tree, and one that does not falls through to the consumer that
// vendored it. The last element is `from` itself when nothing above it
// declares a module, which is the single-file inline-pin mode.
export function projectRoots(from: string, fs: ModuleFs): string[] {
  const roots: string[] = []
  let dir = from
  for (; ;) {
    if (fs.existsSync(pathJoin(dir, 'mod.aon'))) {
      roots.push(dir)
    }
    const up = pathDirname(dir)
    if (up === dir) {
      return 0 < roots.length ? roots : [from]
    }
    dir = up
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
export function lockJson(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
}


// The user cache: `$XDG_CACHE_HOME/aontu/mod` unless the host names
// another, else the platform's own cache location. A host with nowhere
// to put one has no cache, which is a miss rather than a failure. One
// rule, in one place: the resolver reads this cache during evaluation
// and `aontu mod` writes into it, and two spellings of "where the cache
// is" is one bug.
export function modCacheDir(): string | undefined {
  return modCacheDirFor(process.platform, process.env)
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
export function modCacheDirFor(
  platform: string,
  env: Record<string, string | undefined>,
): string | undefined {
  const xdg = env.XDG_CACHE_HOME
  if ('string' === typeof xdg && '' !== xdg) {
    return pathJoin(xdg, 'aontu', 'mod')
  }
  const home = env.HOME
  if ('string' === typeof home && '' !== home) {
    return pathJoin(home, '.cache', 'aontu', 'mod')
  }
  if ('win32' === platform) {
    const local = env.LOCALAPPDATA
    if ('string' === typeof local && '' !== local) {
      return pathJoin(local, 'aontu', 'mod')
    }
  }
  return undefined
}


export function lockHash(root: string, ref: ModuleRef, fs: ModuleFs):
  string | undefined {
  const file = pathJoin(root, 'mod-lock.aon')
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

  const entry = lock?.lock?.[ref.path + '@' + ref.major]
  return 'string' === typeof entry?.canon ? entry.canon : undefined
}


// What a module resolution needs from the engine: evaluate a source
// standalone and answer both what it MEANS (the generated value, for
// reading a module file's own metadata) and what its meaning HASHES to
// (for the integrity check). Injected rather than imported, because
// this is EVALUATION — the very thing this file is called from the
// middle of — and a module resolver that imported the evaluator would
// close a cycle around the whole language.
export type ModuleEval =
  (src: string, path: string) => { gen: any, hash: string }


// How deep module verification may nest before it is refused. A module
// is verified by EVALUATING it, and that evaluation resolves the
// module's own imports -- so a vendor tree that leads back to itself
// (a symlink is enough) would recurse until the host's stack gave out,
// and a verdict that depends on the host's stack size is exactly what
// the determinism clause forbids (docs/trust.md, and the same argument
// unify_cycle rests on). Sixteen is far above any real vendor nesting.
export const MODULE_MAX_DEPTH = 16


export type ModuleOptions = {
  // The content-addressed user cache, keyed by canon-hash. Consulted
  // only when the expected hash is known, which is what "content
  // addressed" means: without a pin there is no address.
  cache?: string
  // The standalone evaluator, for reading module files and for the
  // integrity check. Always present: Aontu injects it (ts/src/aontu.ts)
  // because only the class that evaluates can answer what a module
  // MEANS, and the resolver runs inside a parse that class started.
  eval: ModuleEval
  // How many module verifications deep this evaluation already is.
  depth?: number
}


export type ModuleFound = {
  // The module's main file, as an absolute path.
  full: string
  src: string
}


// A refusal that carries its code to the parse layer, exactly as a
// denied include does (makeModelResolver's `deny`): the resolver
// THROWS, so a bare-member module import cannot vanish in the merge and
// leave a plausible, silently-partial document.
function refuse(code: string, message: string): never {
  const err: any = new Error(message)
  err.code = code
  throw err
}


// Resolve one module import against the local stores.
export function resolveModule(
  ref: ModuleRef,
  fromDir: string,
  fs: ModuleFs,
  options: ModuleOptions,
): ModuleFound {
  if (MODULE_MAX_DEPTH <= (options.depth ?? 0)) {
    refuse('module_depth',
      'module depth: ' + ref.path + '@' + ref.major +
      ' (verification nested past ' + MODULE_MAX_DEPTH + ')')
  }

  // EVERY enclosing project, innermost first (see projectRoots): a
  // vendored module is a project inside a project, and its nested
  // imports have to reach the tree the consumer vendored them into.
  const roots = projectRoots(fromDir, fs)
  // The PIN comes from the first lockfile that names this import. A
  // vendored module usually ships none, so that is the consumer's --
  // which is right: the consumer's lock is what its build is pinned to.
  const expect = ref.hash ??
    roots.map((r) => lockHash(r, ref, fs)).find((h) => null != h)

  const stores: string[] =
    roots.map((r) => moduleDir(pathJoin(r, 'aon_vendor'), ref))
  if (null != options.cache && null != expect) {
    // Content-addressed: the cache is keyed by the hash, so a cache hit
    // is already the right MEANING before anything is read from it.
    stores.push(pathJoin(options.cache, expect))
  }

  const dir = stores.find((d) => fs.existsSync(pathJoin(d, 'mod.aon')))
  if (undefined === dir) {
    // The wording is the contract (docs/capability-review/
    // g6-distribution.md): it names the module AND the step that fixes
    // it, because an agent reading this error is the audience.
    refuse('module_missing',
      'module not fetched: ' + ref.path + '@' + ref.major +
      ' (run: aontu mod get)')
  }

  // The module's own `mod.aon` names its entry file. Read with the
  // evaluator rather than a regexp: a module file is ordinary Aontu,
  // and the language reading its own metadata is the point.
  const main = moduleMain(pathJoin(dir, 'mod.aon'), fs, options)
  const full = pathJoin(dir, main)

  if (!fs.existsSync(full)) {
    refuse('module_missing',
      'module not fetched: ' + ref.path + '@' + ref.major +
      ' (run: aontu mod get)')
  }

  const src = fs.readFileSync(full, 'utf8')

  if (null != expect) {
    // VERIFICATION IS ALWAYS LOCAL. The registry's annotation is
    // advisory; what decides is the hash of the module as it is on this
    // machine, recomputed now.
    const got = options.eval(src, full).hash
    if (got !== expect) {
      refuse('module_integrity',
        'module integrity: ' + ref.path + '@' + ref.major +
        ' expected ' + expect + ' got ' + got)
    }
  }

  return { full, src }
}


// The `mod.main` a module file declares, or the default entry name.
// The module file is ORDINARY AONTU, read by the language itself — the
// toolchain dogfooding its own evaluator rather than pattern-matching
// its own syntax with a regexp.
function moduleMain(file: string, fs: ModuleFs, options: ModuleOptions): string {
  const gen: any = options.eval(fs.readFileSync(file, 'utf8'), file).gen
  const main = gen?.mod?.main
  return 'string' === typeof main && '' !== main ? main : DEFAULT_MAIN
}


const DEFAULT_MAIN = 'main.aon'
