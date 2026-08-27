/* Copyright (c) 2021-2025 Richard Rodger, MIT License */


import type { Val, FST, AontuOptions } from './type'

import { DEFAULT_OPTS } from './type'


import { MapVal } from './val/MapVal'
import { ListVal } from './val/ListVal'
import { NilVal } from './val/NilVal'


import {
  descErr
} from './err'



type AontuContextConfig = {
  cc?: number
  err?: any[] // Omit<NilVal[], "push">
  explain?: any[] | boolean | null

  // The provenance recorder (G7 phase 3), or absent for an
  // uninstrumented run. Shared by reference down every descend, as the
  // error list is, so one run has one record.
  prov?: any
  fs?: any
  path?: string[]
  root?: Val
  seen?: Record<string, number>
  seenI?: number
  src?: string
  srcpath?: string
  vars?: Record<string, Val>
  vc?: number
  collect?: boolean
  opts?: AontuOptions
  deps?: Record<string, any>
}


class AontuContext {
  root?: Val   // Starting Val, root of paths.
  path: string[]  // Path to current Val.
  vc: number  // Val counter to create unique val ids.
  cc: number = -1

  // THE STAGING RULE (G8 phase 0,
  // docs/capability-review/g8-generation.md). A value whose answer
  // depends on WHERE IT IS -- `key()` today, the generation
  // combinators next -- must not answer while anything is still
  // moving it: resolved early it reports the position it was WRITTEN
  // at rather than the one it ends up at. Such a value RESIDUATES
  // while this is false, and fires exactly once on the pass where it
  // is true.
  //
  // The pass loop (ts/src/unify.ts) sets it on the first pass whose
  // input tree is IDENTICAL to the previous pass's: everything that
  // was going to move has moved, and what is left is the staged
  // values themselves, which is precisely the moment they may answer.
  // It replaces a `ctx.cc < 3` pass count in KeyFuncVal -- a magic
  // number, right for the documents it was tuned on and silently
  // wrong for anything that took a fourth pass to place a value. The
  // comment it replaces said as much: "this delay makes keys in
  // spreads and refs work, but it is a hack - find a better way".
  settle: boolean = false
  vars: Record<string, Val> = {}
  src?: string
  fs?: FST

  seenI: number
  seen: Record<string, number>

  collect: boolean

  // THE COMPLETENESS PROBE (the review's finding C). vet detects
  // residue by GENERATING the anchored meet and keeping the
  // incomplete-class failures. Generation honours the OUTPUT marks --
  // `type()` and `hide()` say "do not emit this" -- so a `--at` anchor
  // sitting under a mark generated nothing at all, reported nothing,
  // and vetted VALID for data missing a required field, while the same
  // anchor without the mark answered incomplete (use-cases/BUGS.md
  // §14). A mark is a decision about OUTPUT; it is not a statement
  // about what the data must satisfy, and `--at` names the truth to
  // validate against explicitly. Under this flag the generation walk
  // descends through marked values; nothing else changes, and no
  // output is produced from a probe run -- only its findings are read.
  probe: boolean = false

  // The provenance recorder (G7 phase 3), or undefined for an
  // uninstrumented run. Inherited by every descended and cloned
  // context through the prototype chain, so one run has one record.
  prov?: any

  // errlist: Omit<NilVal[], "push">  // Nil error log of current unify.
  err: any[]
  explain: any[] | null

  // TODO: separate options and context!!!
  srcpath?: string

  deps: Record<string, any>
  opts: AontuOptions

  _pathstr: string | undefined
  _pathidx: number | undefined
  _pathmap: Map<string, number>
  // Trie keyed by (parentIdx, key) -> { idx, path }. Serves two
  // jobs: (1) assign O(1) pathidx without rebuilding
  // `path.join('\x00')` for cycle-detection; (2) cache the
  // materialised path array so the same (parent, key) visited
  // across fixpoint passes reuses one array instead of re-concat.
  _pathTrie: Map<number, Map<string, { idx: number, path: string[] }>>
  _pathidxNext: { n: number }

  // Current `unite` recursion depth, checked against the depth budget
  // (ts/src/unify.ts). Held in a shared mutable box, like _pathidxNext,
  // because clone() uses Object.create: the box is inherited by
  // reference, so a nested clone's increments are visible to the frame
  // that will decrement them. The Go port keeps the same counter
  // directly on its Ctx pointer (go/unify.go, maxUniteDepth).
  _depth: { n: number }

  // The evaluation budgets (G5 trust profile, docs/trust.md): integer
  // counts of engine events, never wall-clock. Always present, defaults
  // from the shared spec-visible constants (test/spec/budget.tsv), so
  // the hot-path reads in unify.ts are plain property loads. Inherited
  // by clone() through the prototype chain. `revisits` is NOT profile
  // surface (the Go port has no revisit counter to configure — see
  // TrustBudget in type.ts); it is carried here so unify.ts reads one
  // budget object, at its fixed spec constant.
  budget: { passes: number, revisits: number, depth: number }

  // The include manifest sink (G5, docs/trust.md): every include the
  // resolver reads is recorded here as { path, capability }, and
  // Aontu.parse() sorts and dedups it onto the result's `deps`.
  manifest: { path: string, capability: string }[]

  // Trial mode: set by DisjunctVal.unify while each member is tried
  // against the peer. When true, makeNilErr returns the shared
  // TRIAL_NIL sentinel instead of allocating a fresh NilVal, and
  // pushes TRIAL_NIL to ctx.err only once per trial (the caller's
  // `trialErr.length > 0` check still signals failure). See err.ts.
  _trialMode?: boolean

  // Per-parent descend cache: (key) -> already-descended child ctx.
  // ~48% of descends in foo-sdk repeat the same (parent, key) pair
  // (e.g. a MapVal.unify visits the same peer keys across fixpoint
  // passes). The child's prototype chain, path, and pathidx are
  // identical every time, and no code writes to a descended ctx
  // between visits — nothing mutates per-child state — so the
  // cached child is safe to reuse.
  _childCache?: Map<string, AontuContext>


  constructor(cfg: AontuContextConfig) {
    this.root = cfg.root
    this.path = [...(cfg.path ?? [])]
    this.src = cfg.src

    this.collect = cfg.collect ?? null != cfg.err
    this.prov = cfg.prov

    this.err = cfg.err ?? []
    this.explain = Array.isArray(cfg.explain) ? cfg.explain : null

    this.fs = cfg.fs ?? null

    // Multiple unify passes will keep incrementing Val counter.
    this.vc = null == cfg.vc ? 1_000_000_000 : cfg.vc

    this.cc = null == cfg.cc ? this.cc : cfg.cc

    this.vars = cfg.vars ?? this.vars
    this.seenI = cfg.seenI ?? 0
    this.seen = cfg.seen ?? {}

    this.srcpath = cfg.srcpath ?? undefined

    this.deps = cfg.deps ?? {}

    this._pathmap = new Map()
    this._pathTrie = new Map()
    this._pathidxNext = { n: 1 }  // 0 reserved for the root path
    this._depth = { n: 0 }
    this._pathidx = 0

    this.manifest = []

    this.opts = DEFAULT_OPTS()
    this.addopts(cfg.opts)

    // Budget defaults are the shared spec-visible constants
    // (test/spec/budget.tsv pins the boundaries in both ports); the
    // trust profile may lower or raise them, deterministically.
    const budget = (this.opts as any).trust?.budget ?? {}
    this.budget = {
      passes: budget.passes ?? 9,
      revisits: 999,
      depth: budget.depth ?? 1000,
    }
  }


  clone(cfg: {
    root?: Val,
    path?: string[],
    err?: any[],
    collect?: boolean,
    explain?: any[] | boolean | null
  }): AontuContext {
    const ctx = Object.create(this)
    ctx.path = cfg.path ?? this.path
    ctx.root = cfg.root ?? this.root
    ctx.var = Object.create(this.vars)

    ctx.collect = null != cfg.collect ? !!cfg.collect : ctx.collect
    ctx.err = cfg.err ?? ctx.err
    ctx.explain = Array.isArray(cfg.explain) ? cfg.explain : ctx.explain

    ctx._pathstr = undefined
    // Path didn't move unless cfg.path was supplied, so pathidx stays
    // valid in the common case. For cfg.path-override (4 calls per
    // run, fixpoint advances) fall back to the join-based lookup.
    if (cfg.path !== undefined) {
      ctx._pathidx = undefined
    }

    return ctx
  }

  descend(key: string): AontuContext {
    // C3: reuse the child ctx from a previous descend with the same
    // (parent, key). Saves one Object.create + several property
    // writes per hit; ~48% hit rate on foo-sdk.
    //
    // NB: must use hasOwnProperty here — plain `this._childCache`
    // would walk the prototype chain and read the *parent's* cache
    // (ctxs are created via Object.create(parent)), so keys would
    // cross-contaminate between sibling branches.
    let childCache: Map<string, AontuContext> | undefined
    if (Object.prototype.hasOwnProperty.call(this, '_childCache')) {
      childCache = this._childCache
      const cached = childCache!.get(key)
      if (cached !== undefined) return cached
    }
    else {
      childCache = new Map()
      this._childCache = childCache
    }

    const ctx = Object.create(this)
    ctx._pathstr = undefined

    // Trie doubles as both pathidx assignment and path-array cache.
    // (parent_pathidx, key) uniquely identifies a descended path,
    // and is visited many times across fixpoint passes. Caching the
    // materialised array lets descend share references instead of
    // allocating a fresh concat every time.
    const parentIdx = this._pathidx!
    let childMap = this._pathTrie.get(parentIdx)
    if (childMap === undefined) {
      childMap = new Map()
      this._pathTrie.set(parentIdx, childMap)
    }
    let entry = childMap.get(key)
    if (entry === undefined) {
      entry = { idx: this._pathidxNext.n++, path: this.path.concat(key) }
      childMap.set(key, entry)
    }
    ctx._pathidx = entry.idx
    ctx.path = entry.path

    childCache!.set(key, ctx)
    return ctx
  }


  addopts(opts?: AontuOptions) {
    if (null != opts) {
      Object.assign(this.opts, opts)
    }

    this.collect = this.opts.collect ?? (null != this.opts.err || this.collect)
    this.err = this.opts.err ?? this.err
    this.deps = this.opts.deps ?? this.deps
    this.fs = this.opts.fs ?? this.fs
    this.explain = this.opts.explain ?? this.explain

    this.src = ('string' === typeof this.opts.src ? this.opts.src : undefined) ?? this.src

    // TODO: rename srcpath to file
    this.srcpath = this.opts.path ?? this.srcpath
  }


  adderr(err: NilVal) {
    if (null != err && err.isNil) {
      if (null == err.primary) {
        err.primary = err
      }

      if (!this.err.includes(err)) {
        this.err.push(err)
      }
      // NOTE: error message formatting is deferred to errmsg() / NilVal.gen.
      // Many NilVals are transient (disjunct member trials, etc.) and never
      // surface to the user — eager descErr was a major hot path.
    }
  }


  errmsg() {
    // return this.errlist
    return this.err
      .map((err: any) => (err && (null == err.msg || '' === err.msg)
        ? (descErr(err, this), err.msg)
        : err?.msg))
      .filter(msg => null != msg)
      .join('\n------\n')
  }


  find(path: string[]): Val | undefined {
    let node: Val | undefined = this.root
    let pI = 0
    for (; pI < path.length; pI++) {
      let part = path[pI]

      if (node instanceof MapVal) {
        node = node.peg[part]
      }
      else if (node instanceof ListVal) {
        node = node.peg[part]
      }
      else {
        break;
      }
    }

    if (pI < path.length) {
      node = undefined
    }

    return node
  }


  get pathidx(): number {
    if (undefined === this._pathidx) {
      const key = this.path.join('\x00')
      let idx = this._pathmap.get(key)
      if (undefined === idx) {
        idx = this._pathmap.size
        this._pathmap.set(key, idx)
      }
      this._pathidx = idx
    }
    return this._pathidx
  }


  get pathstr() {
    return this._pathstr ??
      (this._pathstr = this.path.map(p => p.replaceAll('.', '\\.')).join('.'))
  }
} /* node:coverage ignore next 8 */



export {
  AontuContext,
  AontuContextConfig
}
