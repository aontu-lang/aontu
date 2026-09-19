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
        this.settle = false;
        this.vars = {};
        this.probe = false;
        this.root = cfg.root;
        this.path = [...(cfg.path ?? [])];
        this.src = cfg.src;
        this.collect = cfg.collect ?? null != cfg.err;
        this.prov = cfg.prov;
        this.reads = cfg.reads;
        this.err = cfg.err ?? [];
        this.explain = Array.isArray(cfg.explain) ? cfg.explain : null;
        this.fs = cfg.fs ?? null;
        this.errfs = cfg.errfs ?? null;
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
            alias: budget.alias ?? 1000000,
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
        if (cfg.path !== undefined) {
            ctx._pathidx = undefined;
        }
        return ctx;
    }
    descend(key) {
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
        this.errfs = this.opts.errfs ?? this.errfs;
        this.explain = this.opts.explain ?? this.explain;
        this.src = ('string' === typeof this.opts.src ? this.opts.src : undefined) ?? this.src;
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