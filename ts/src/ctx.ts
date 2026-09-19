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

  reads?: Set<string>
  fs?: any
  errfs?: any
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

  settle: boolean = false
  vars: Record<string, Val> = {}
  src?: string
  fs?: FST
  // The error renderer's own reader; see type.ts's `errfs`.
  errfs?: FST

  seenI: number
  seen: Record<string, number>

  collect: boolean

  probe: boolean = false

  // The provenance recorder (G7 phase 3), or undefined for an
  // uninstrumented run. Inherited by every descended and cloned
  // context through the prototype chain, so one run has one record.
  prov?: any

  // The read set (RENDER.0.md P7), or undefined for an uninstrumented
  // run. Inherited exactly as `prov` is.
  reads?: Set<string>

  // errlist: Omit<NilVal[], "push">  // Nil error log of current unify.
  err: any[]
  explain: any[] | null

  srcpath?: string

  deps: Record<string, any>
  opts: AontuOptions

  _pathstr: string | undefined
  _pathidx: number | undefined
  _pathmap: Map<string, number>
  _pathTrie: Map<number, Map<string, { idx: number, path: string[] }>>
  _pathidxNext: { n: number }

  _depth: { n: number }

  _reldecls: Map<string, { acyclic?: boolean, inverses: Set<string> }>

  _fixroot: any

  budget: {
    passes: number, revisits: number, depth: number, alias: number
  }

  // The include manifest sink (G5, docs/trust.md): every include the
  // resolver reads is recorded here as { path, capability }, and
  // Aontu.parse() sorts and dedups it onto the result's `deps`.
  manifest: { path: string, capability: string }[]

  _trialMode?: boolean

  _childCache?: Map<string, AontuContext>


  constructor(cfg: AontuContextConfig) {
    this.root = cfg.root
    this.path = [...(cfg.path ?? [])]
    this.src = cfg.src

    this.collect = cfg.collect ?? null != cfg.err
    this.prov = cfg.prov
    this.reads = cfg.reads

    this.err = cfg.err ?? []
    this.explain = Array.isArray(cfg.explain) ? cfg.explain : null

    this.fs = cfg.fs ?? null
    this.errfs = cfg.errfs ?? null

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
    this._reldecls = new Map()
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
      alias: budget.alias ?? 1000000,
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
    if (cfg.path !== undefined) {
      ctx._pathidx = undefined
    }

    return ctx
  }

  descend(key: string): AontuContext {
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
    this.errfs = (this.opts as any).errfs ?? this.errfs
    this.explain = this.opts.explain ?? this.explain

    this.src = ('string' === typeof this.opts.src ? this.opts.src : undefined) ?? this.src

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
