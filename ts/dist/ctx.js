"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AontuContext = void 0;
const type_1 = require("./type");
const MapVal_1 = require("./val/MapVal");
const ListVal_1 = require("./val/ListVal");
const err_1 = require("./err");
class AontuContext {
    constructor(cfg) {
        this.cc = -1;
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
        this.settle = false;
        this.vars = {};
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
        this.probe = false;
        this.root = cfg.root;
        this.path = [...(cfg.path ?? [])];
        this.src = cfg.src;
        this.collect = cfg.collect ?? null != cfg.err;
        this.prov = cfg.prov;
        this.err = cfg.err ?? [];
        this.explain = Array.isArray(cfg.explain) ? cfg.explain : null;
        this.fs = cfg.fs ?? null;
        // Multiple unify passes will keep incrementing Val counter.
        this.vc = null == cfg.vc ? 1_000_000_000 : cfg.vc;
        this.cc = null == cfg.cc ? this.cc : cfg.cc;
        this.vars = cfg.vars ?? this.vars;
        this.seenI = cfg.seenI ?? 0;
        this.seen = cfg.seen ?? {};
        this.srcpath = cfg.srcpath ?? undefined;
        this.deps = cfg.deps ?? {};
        this._pathmap = new Map();
        this._pathTrie = new Map();
        this._pathidxNext = { n: 1 }; // 0 reserved for the root path
        this._depth = { n: 0 };
        this._reldecls = new Map();
        this._pathidx = 0;
        this.manifest = [];
        this.opts = (0, type_1.DEFAULT_OPTS)();
        this.addopts(cfg.opts);
        // Budget defaults are the shared spec-visible constants
        // (test/spec/budget.tsv pins the boundaries in both ports); the
        // trust profile may lower or raise them, deterministically.
        const budget = this.opts.trust?.budget ?? {};
        this.budget = {
            passes: budget.passes ?? 9,
            revisits: 999,
            depth: budget.depth ?? 1000,
        };
    }
    clone(cfg) {
        const ctx = Object.create(this);
        ctx.path = cfg.path ?? this.path;
        ctx.root = cfg.root ?? this.root;
        ctx.var = Object.create(this.vars);
        ctx.collect = null != cfg.collect ? !!cfg.collect : ctx.collect;
        ctx.err = cfg.err ?? ctx.err;
        ctx.explain = Array.isArray(cfg.explain) ? cfg.explain : ctx.explain;
        ctx._pathstr = undefined;
        // Path didn't move unless cfg.path was supplied, so pathidx stays
        // valid in the common case. For cfg.path-override (4 calls per
        // run, fixpoint advances) fall back to the join-based lookup.
        if (cfg.path !== undefined) {
            ctx._pathidx = undefined;
        }
        return ctx;
    }
    descend(key) {
        // C3: reuse the child ctx from a previous descend with the same
        // (parent, key). Saves one Object.create + several property
        // writes per hit; ~48% hit rate on foo-sdk.
        //
        // NB: must use hasOwnProperty here — plain `this._childCache`
        // would walk the prototype chain and read the *parent's* cache
        // (ctxs are created via Object.create(parent)), so keys would
        // cross-contaminate between sibling branches.
        let childCache;
        if (Object.prototype.hasOwnProperty.call(this, '_childCache')) {
            childCache = this._childCache;
            const cached = childCache.get(key);
            if (cached !== undefined)
                return cached;
        }
        else {
            childCache = new Map();
            this._childCache = childCache;
        }
        const ctx = Object.create(this);
        ctx._pathstr = undefined;
        // Trie doubles as both pathidx assignment and path-array cache.
        // (parent_pathidx, key) uniquely identifies a descended path,
        // and is visited many times across fixpoint passes. Caching the
        // materialised array lets descend share references instead of
        // allocating a fresh concat every time.
        const parentIdx = this._pathidx;
        let childMap = this._pathTrie.get(parentIdx);
        if (childMap === undefined) {
            childMap = new Map();
            this._pathTrie.set(parentIdx, childMap);
        }
        let entry = childMap.get(key);
        if (entry === undefined) {
            entry = { idx: this._pathidxNext.n++, path: this.path.concat(key) };
            childMap.set(key, entry);
        }
        ctx._pathidx = entry.idx;
        ctx.path = entry.path;
        childCache.set(key, ctx);
        return ctx;
    }
    addopts(opts) {
        if (null != opts) {
            Object.assign(this.opts, opts);
        }
        this.collect = this.opts.collect ?? (null != this.opts.err || this.collect);
        this.err = this.opts.err ?? this.err;
        this.deps = this.opts.deps ?? this.deps;
        this.fs = this.opts.fs ?? this.fs;
        this.explain = this.opts.explain ?? this.explain;
        this.src = ('string' === typeof this.opts.src ? this.opts.src : undefined) ?? this.src;
        // TODO: rename srcpath to file
        this.srcpath = this.opts.path ?? this.srcpath;
    }
    adderr(err) {
        if (null != err && err.isNil) {
            if (null == err.primary) {
                err.primary = err;
            }
            if (!this.err.includes(err)) {
                this.err.push(err);
            }
            // NOTE: error message formatting is deferred to errmsg() / NilVal.gen.
            // Many NilVals are transient (disjunct member trials, etc.) and never
            // surface to the user — eager descErr was a major hot path.
        }
    }
    errmsg() {
        // return this.errlist
        return this.err
            .map((err) => (err && (null == err.msg || '' === err.msg)
            ? ((0, err_1.descErr)(err, this), err.msg)
            : err?.msg))
            .filter(msg => null != msg)
            .join('\n------\n');
    }
    find(path) {
        let node = this.root;
        let pI = 0;
        for (; pI < path.length; pI++) {
            let part = path[pI];
            if (node instanceof MapVal_1.MapVal) {
                node = node.peg[part];
            }
            else if (node instanceof ListVal_1.ListVal) {
                node = node.peg[part];
            }
            else {
                break;
            }
        }
        if (pI < path.length) {
            node = undefined;
        }
        return node;
    }
    get pathidx() {
        if (undefined === this._pathidx) {
            const key = this.path.join('\x00');
            let idx = this._pathmap.get(key);
            if (undefined === idx) {
                idx = this._pathmap.size;
                this._pathmap.set(key, idx);
            }
            this._pathidx = idx;
        }
        return this._pathidx;
    }
    get pathstr() {
        return this._pathstr ??
            (this._pathstr = this.path.map(p => p.replaceAll('.', '\\.')).join('.'));
    }
} /* node:coverage ignore next 8 */
exports.AontuContext = AontuContext;
//# sourceMappingURL=ctx.js.map