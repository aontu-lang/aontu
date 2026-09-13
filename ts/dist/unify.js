"use strict";
/* Copyright (c) 2021-2023 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withDepth = exports.unite = exports.Unify = void 0;
exports.applyFlows = applyFlows;
const ctx_1 = require("./ctx");
const type_1 = require("./type");
const err_1 = require("./err");
const ReferFuncVal_1 = require("./val/ReferFuncVal");
const PlaceVal_1 = require("./val/PlaceVal");
const alias_1 = require("./alias");
const lang_1 = require("./lang");
const utility_1 = require("./utility");
const top_1 = require("./val/top");
const withDepth = (ctx, a, b, run) => {
    if (ctx.budget.depth <= ctx._depth.n) {
        return (0, err_1.makeNilErr)(ctx, 'unify_cycle', a, b);
    }
    ctx._depth.n++;
    try {
        return run();
    }
    finally {
        ctx._depth.n--;
    }
};
exports.withDepth = withDepth;
// Vals should only have to unify downwards (in .unify) over Vals they understand.
// and for complex Vals, TOP, which means self unify if not yet done
const unite = (ctx, a, b, whence) => {
    if (a !== undefined && a !== null) {
        if (a === b) {
            if (a.done)
                return a;
        }
        else if (b !== undefined && b !== null && undefined === ctx.prov) {
            if (a.done && b.done) {
                if (a.id === b.id) {
                    // The deprecation record survives the fast path (G3).
                    if (null == a.deprecation && null != b.deprecation) {
                        a.deprecation = b.deprecation;
                    }
                    return a;
                }
                if (a.constructor === b.constructor && a.peg === b.peg
                    && !a.isNil && !b.isNil
                    && !a.isMap && !a.isList
                    && !a.isConjunct && !a.isDisjunct
                    && !a.isRef && !a.isPref && !a.isFunc && !a.isExpect
                    && !a.isTop && !b.isTop
                    && !a.isRefer
                    && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
                    // The deprecation record survives the fast path too (G3):
                    // `deprecate(5) & 5` short-circuits here.
                    if (null == a.deprecation && null != b.deprecation) {
                        a.deprecation = b.deprecation;
                    }
                    return a;
                }
            }
        }
    }
    // ABSENCE IS THE UNIT OF THE MEET (ADR-034). The dispatch below is
    // the LEFT operand's, so `&` commutes only if it is answered here.
    if (null != a && null != b) {
        if (true === a.isAbsent) {
            return a.unify(b, ctx);
        }
        if (true === b.isAbsent) {
            return b.unify(a, ctx);
        }
    }
    const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'unite', a, b);
    let out = a;
    let why = 'u';
    // Cycle-detection key. Use numeric path index for speed; fall back to
    // full string key when debug is enabled so the saw value is human-readable.
    const saw = ctx.opts.debug
        ? (a ? a.id + (a.done ? '' : '*') : '') + '~' +
            (b ? b.id + (b.done ? '' : '*') : '') + '@' + ctx.pathstr
        : (a ? a.id + (a.done ? 'd' : '') : 0) + '~' +
            (b ? b.id + (b.done ? 'd' : '') : 0) + '~' + ctx.pathidx;
    // NOTE: if this error occurs "unreasonably", attemp to avoid unnecesary unification
    // See for example PrefVal peg.id equality inspection.
    const sawCount = ctx.seen[saw] ?? 0;
    if (ctx.budget.depth <= ctx._depth.n) {
        out = (0, err_1.makeNilErr)(ctx, 'unify_cycle', a, b);
    }
    else if (ctx.budget.revisits < sawCount) {
        out = (0, err_1.makeNilErr)(ctx, 'unify_cycle', a, b);
    }
    else {
        ctx.seen[saw] = sawCount + 1;
        ctx._depth.n++;
        try {
            let unified = false;
            if (a == null) {
                out = b;
                why = 'b';
            }
            else if (b == null || b.isTop) {
                out = a;
                why = 'a';
            }
            else if (a.isTop) {
                out = b;
                why = 'b';
            }
            else if (a.isNil) {
                out = update(a, b);
                why = 'an';
            }
            else if (b.isNil) {
                out = update(b, a);
                why = 'bn';
            }
            else if (a.isConjunct || a.isExpect) {
                out = a.unify(b, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'AC') }) : ctx);
                unified = true;
                why = 'a*';
            }
            else if (b.isConjunct
                || b.isDisjunct
                || b.isRef
                || b.isPref
                || b.isVar
                || b.isFunc
                || b.isExpect
                || b.isRefer
                // An op DRIVES while an operand has not decided (ADR-037).
                || (b.isOp && ((0, PlaceVal_1.hasPlace)(b) || b.holdsStaged))
                // A graph atom DRIVES (RELATIONS P2): its peer is the value
                // it rides beside -- a container, a rel, a scalar -- and none
                // of them know the atom; the atom knows to residuate.
                || b.isGraphAtom
                // The recursive residual DRIVES for the same reason: its peer
                // is the concrete structure it expands against.
                || b.isRecurse) {
                out = b.unify(a, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'BW') }) : ctx);
                unified = true;
                why = 'bv';
            }
            else if (a.constructor === b.constructor && a.peg === b.peg
                && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
                out = update(a, b);
                why = 'up';
            }
            else {
                out = a.unify(b, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'GN') }) : ctx);
                unified = true;
                why = 'ab';
            }
            if (!out || !out.unify) {
                out = (0, err_1.makeNilErr)(ctx, 'unite', a, b, whence + '/nil');
                why += 'N';
            }
            if (!out.done && !unified) {
                if (undefined !== ctx.cc
                    && out._tcc === ctx.cc && out._tpi === ctx.pathidx) {
                    why += 't';
                }
                else {
                    out = out.unify((0, top_1.top)(), te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'ND') }) : ctx);
                    if (!out.done && undefined !== ctx.cc) {
                        ;
                        out._tcc = ctx.cc;
                        out._tpi = ctx.pathidx;
                    }
                    why += 'T';
                }
            }
        }
        catch (err) {
            out = (0, err_1.makeNilErr)(ctx, 'internal', a, b, undefined, {
                error: String(err?.message ?? err),
                ...(err instanceof RangeError ? { overflow: true } : {}),
            });
        }
        finally {
            ctx._depth.n--;
        }
    }
    ctx.explain && (0, utility_1.explainClose)(te, out);
    if (undefined !== ctx.prov) {
        ctx.prov.record(ctx.path, a, b, out);
    }
    if (null != out && true === out.isVal &&
        !out.isTop && !out.isNil && null == out.deprecation) {
        const dep = (null != a ? a.deprecation : undefined) ??
            (null != b ? b.deprecation : undefined);
        if (null != dep) {
            out.deprecation = dep;
        }
    }
    if (undefined !== ctx.reads &&
        null != out && true === out.isVal && !out.isTop && !out.isNil) {
        riders(a, b, out);
    }
    return out;
};
exports.unite = unite;
function riders(a, b, to) {
    const av = Object(a);
    const bv = Object(b);
    if (null == to.origin) {
        const org = av.origin ?? bv.origin;
        if (null != org) {
            to.origin = org;
        }
    }
    if (null == to.emitted) {
        const emt = av.emitted ?? bv.emitted;
        if (null != emt) {
            to.emitted = emt;
        }
    }
}
function update(x, _y) {
    return x;
}
// The still-refining paths named by a budget_passes error: the first
// `max` non-done nodes of the residue, as `$.dotted.paths`. Depth-first
// over bag children only -- this feeds an error message, not a report,
// so a small deterministic sample beats completeness.
function residuePaths(v, max) {
    const out = [];
    const visit = (n, isroot) => {
        if (null == n || max <= out.length) {
            return;
        }
        if (!isroot && !n.done) {
            out.push('$' + (0 < (n.path?.length ?? 0) ? '.' + n.path.join('.') : ''));
        }
        if (n.isMap || n.isList) {
            for (const k in n.peg) {
                visit(n.peg[k], false);
            }
        }
    };
    visit(v, true);
    return out;
}
function applyFlows(ctx, root) {
    const flows = ctx.referflows;
    // NOTHING TO APPLY is the common case -- a document with no links
    // pays one property load per pass, and the walk never runs.
    if (null == flows || 0 === flows.size) {
        return root;
    }
    for (const key of [...flows.keys()].sort()) {
        const path = key.split('\x00');
        const found = (0, ReferFuncVal_1.findAt)(root, path);
        if (undefined === found) {
            continue;
        }
        const { parent, key: pkey, val: node } = found;
        const merged = unite(ctx.descend(pkey), node, flows.get(key), 'refer-flow');
        parent.peg[pkey] = merged;
    }
    return root;
}
class Unify {
    constructor(root, lang, ctx, src) {
        this.lang = lang || new lang_1.Lang();
        if ('string' === typeof root) {
            root = this.lang.parse(root);
        }
        if ('string' !== typeof src) {
            src = '';
        }
        this.cc = 0;
        this.root = root;
        this.res = root;
        // Always use a fresh array for mutable error collection to avoid
        // mutating the shared EMPTY_ERR singleton on Val instances.
        this.err = ctx?.err ?? (root.err.length > 0 ? root.err : []);
        this.explain = ctx?.explain ?? root.explain ?? null;
        let res = root;
        let uctx;
        // Only unify if no syntax errors
        if (!root.isNil) {
            if (ctx instanceof ctx_1.AontuContext) {
                uctx = ctx;
            }
            else {
                uctx = new ctx_1.AontuContext({
                    ...(ctx || {}),
                    root: res,
                    err: this.err,
                    explain: this.explain,
                    src,
                });
            }
            uctx.err = this.err;
            uctx.explain = this.explain;
            uctx.snapmap = new Map();
            uctx.referflows = new Map();
            uctx._referflow = new Set();
            const explain = null == ctx?.explain ? undefined : ctx?.explain;
            const te = explain && (0, utility_1.explainOpen)(uctx, explain, 'root', res);
            // NOTE: if true === res.done already, then this loop never needs to run.
            let maxcc = uctx.budget.passes;
            let prevCanon = undefined;
            let lastCanon = undefined;
            let settle = false;
            for (; this.cc < maxcc && type_1.DONE !== res.dc; this.cc++) {
                uctx.cc = this.cc;
                uctx.seen = {};
                uctx.settle = settle;
                if (this.cc === maxcc - 1) {
                    prevCanon = lastCanon ?? res.canon;
                }
                res = unite(te ? uctx.clone({ explain: (0, utility_1.ec)(te, 'run') }) : uctx, res, (0, top_1.top)(), 'unify');
                // The recorded type flows, re-applied to the tree THIS pass
                // built: a pass rebuilds subtrees, and a flow written into the
                // previous pass's tree does not survive that.
                res = applyFlows(uctx, res);
                if (type_1.DONE !== res.dc) {
                    const nowCanon = res.canon;
                    settle = undefined !== lastCanon && lastCanon === nowCanon;
                    lastCanon = nowCanon;
                }
                uctx = uctx.clone({ root: res });
            }
            if (maxcc <= this.cc && type_1.DONE !== res.dc && 0 === uctx.err.length
                && undefined !== prevCanon && prevCanon !== res.canon) {
                (0, err_1.makeNilErr)(uctx, 'budget_passes', undefined, undefined, 'resolve', {
                    budget: 'passes',
                    limit: maxcc,
                    paths: residuePaths(res, 4).join(' ') || '$',
                });
            }
            // The settled tree's alias references canon as the values they
            // name (ts/src/alias.ts): attached here, once, after the last
            // pass, from the snapshot store this run kept.
            (0, alias_1.expandAliases)(res, uctx.snapmap);
            uctx.explain && (0, utility_1.explainClose)(te, res);
        }
        this.res = res;
    }
} /* node:coverage ignore next 10 */
exports.Unify = Unify;
//# sourceMappingURL=unify.js.map