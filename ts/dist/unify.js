"use strict";
/* Copyright (c) 2021-2023 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withDepth = exports.meetTemplate = exports.unite = exports.Unify = void 0;
exports.holdsLink = holdsLink;
exports.linksOf = linksOf;
exports.ride = ride;
exports.rideOn = rideOn;
const ctx_1 = require("./ctx");
const type_1 = require("./type");
const err_1 = require("./err");
const ReferFuncVal_1 = require("./val/ReferFuncVal");
const ConjunctVal_1 = require("./val/ConjunctVal");
const ListVal_1 = require("./val/ListVal");
const MapVal_1 = require("./val/MapVal");
const PlaceVal_1 = require("./val/PlaceVal");
const alias_1 = require("./alias");
const rider_1 = require("./rider");
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
// The meet's riders are the union of its operands' (ADR-052).
function ride(out, a, b) {
    if (null != out.deprecation || null != a?.deprecation || null != b?.deprecation) {
        out.deprecation = (0, rider_1.unionRecords)([out.deprecation, a?.deprecation, b?.deprecation], (s) => s);
    }
    if (null != out.meta || null != a?.meta || null != b?.meta) {
        out.meta = (0, rider_1.unionRecords)([out.meta, a?.meta, b?.meta], (v) => v.canon);
    }
    if (null != out.via || null != a?.via || null != b?.via) {
        out.via = (0, rider_1.unionVia)(out.via, a?.via, b?.via);
    }
    if (null != out.identity || null != a?.identity || null != b?.identity) {
        out.identity = (0, rider_1.unionRecords)([out.identity, a?.identity, b?.identity], (v) => v.canon);
    }
}
// The meet's riders go to its result, a top's on a fresh top where they
// add to its own, since an operand top may be a value written elsewhere.
function rideOn(ctx, out, a, b) {
    if (!out.isTop) {
        ride(out, a, b);
        return out;
    }
    if (!(0, rider_1.rides)(a) && !(0, rider_1.rides)(b)) {
        return out;
    }
    const t = out.clone(ctx);
    ride(t, a, b);
    return (0, rider_1.riderText)('', t) === (0, rider_1.riderText)('', out) ? out : t;
}
function drives(v) {
    return v.isConjunct
        || v.isDisjunct
        || v.isRef
        || v.isPref
        || v.isVar
        || v.isFunc
        || v.isExpect
        || v.isRefer
        // An op DRIVES while an operand has not decided (ADR-037).
        || (v.isOp && ((0, PlaceVal_1.waitsOnHole)(v) || v.holdsStaged))
        // A graph atom DRIVES (RELATIONS P2): its peer is the value it rides
        // beside -- a container, a rel, a scalar -- and none of them know
        // the atom; the atom knows to residuate.
        || v.isGraphAtom
        // The recursive residual DRIVES for the same reason: its peer is the
        // concrete structure it expands against.
        || v.isRecurse;
}
const unite = (ctx, a, b, whence) => {
    if (a !== undefined && a !== null) {
        if (a === b) {
            if (a.done)
                return a;
        }
        else if (b !== undefined && b !== null && undefined === ctx.prov) {
            if (a.done && b.done) {
                if (a.id === b.id) {
                    // The riders survive the fast path (G3, G12).
                    return rideOn(ctx, a, a, b);
                }
                if (a.constructor === b.constructor && a.peg === b.peg
                    && a.emptyOk === b.emptyOk
                    && a.needsNonEmpty === b.needsNonEmpty
                    && a.link === b.link
                    && a.flows === b.flows
                    && !a.isNil && !b.isNil
                    && !a.isMap && !a.isList
                    && !a.isConjunct && !a.isDisjunct
                    && !a.isRef && !a.isPref && !a.isFunc && !a.isExpect
                    && !a.isTop && !b.isTop
                    && !a.isRefer
                    && !a.isRel && !a.isGraphAtom && !a.isRecurse) {
                    // The riders survive this fast path too: `deprecate(5) & 5`.
                    ride(a, a, b);
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
            else if (drives(b)) {
                out = b.unify(a, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'BW') }) : ctx);
                unified = true;
                why = 'bv';
            }
            // These answer from either side, but a hole in a match matches nothing.
            else if ((true === b.isConstraintKind
                || true === b.isEmptyConstraint
                || true === b.isSeal
                || (true === b.isPlace && true !== ctx._matchRead))
                && !drives(a)) {
                out = b.unify(a, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'BK') }) : ctx);
                unified = true;
                why = 'bk';
            }
            else if (a.constructor === b.constructor && a.peg === b.peg
                && a.emptyOk === b.emptyOk
                && a.needsNonEmpty === b.needsNonEmpty
                && a.link === b.link
                && a.flows === b.flows
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
    if (null != out && true === out.isVal && !out.isNil) {
        out = rideOn(ctx, out, a, b);
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
// The links a result holds where the output reads them: through maps,
// lists, marks and meets, the value a preference stands as, and the arms
// of a disjunction the rank rule picks, those of the lowest rank where
// any has one and every arm where none has. A spread's template holds
// no position, so its links are its members'.
function linksOf(root) {
    const out = [];
    const visit = (node, put, at) => {
        if (true === node.isPath) {
            if (undefined !== node.linkto) {
                out.push({ link: node, at, put });
            }
        }
        else if (true === node.isMap || true === node.isList) {
            const peg = node.peg;
            for (const k of Object.keys(peg)) {
                visit(peg[k], (v) => { peg[k] = v; }, [...at, k]);
            }
        }
        else if (true === node.isDisjunct || true === node.isConjunct) {
            const arms = node.peg;
            const ranks = true === node.isDisjunct
                ? arms.filter((a) => true === a.isPref).map((a) => a.rank) : [];
            const rank = 0 === ranks.length ? undefined : Math.min(...ranks);
            arms.forEach((a, i) => {
                if (undefined === rank || (true === a.isPref && rank === a.rank)) {
                    visit(a, (v) => { arms[i] = v; }, at);
                }
            });
        }
        else if (true === node.isPref) {
            visit(node.peg, (v) => { node.peg = v; }, at);
        }
        else if (true === node.isGraphAtom && undefined !== node.held) {
            visit(node.held, (v) => { node.held = v; }, at);
        }
    };
    visit(root, () => undefined, []);
    return out;
}
// The templates of the links the output takes whose targets the result
// holds, each once, in a fixed order.
function flowsOf(root, links) {
    const seen = new Map();
    for (const { link } of links) {
        for (const [key, t] of link.flows ?? []) {
            const id = key + '\x01' + t.canon;
            const to = key.split('\x00');
            if (!seen.has(id) && undefined !== (0, ReferFuncVal_1.findAt)(root, to)) {
                seen.set(id, { to, t, id });
            }
        }
    }
    return [...seen.keys()].sort().map((id) => seen.get(id));
}
// What meets each template at its target and asks nothing else: an open
// map holding the step's key as optional, or a list holding `any` before
// the step's position, as the result holds the container, down to the
// template.
function flowDoc(ctx, root, flows, depth) {
    const here = flows.filter((f) => depth === f.to.length)
        .map((f) => f.t.clone(ctx, { dup: true }));
    const below = flows.filter((f) => depth < f.to.length);
    if (0 < below.length) {
        const steps = [...new Set(below.map((f) => f.to[depth]))];
        const path = below[0].to.slice(0, depth);
        const inner = (k) => flowDoc(ctx, root.peg[k], below.filter((f) => k === f.to[depth]), depth + 1);
        if (true === root.isList) {
            const last = Math.max(...steps.map(Number));
            const items = [];
            for (let i = 0; i <= last; i++) {
                items.push(steps.includes('' + i) ? inner('' + i) : (0, top_1.top)());
            }
            here.push(new ListVal_1.ListVal({ peg: items, path }, ctx));
        }
        else {
            const peg = {};
            for (const k of steps) {
                peg[k] = inner(k);
            }
            const m = new MapVal_1.MapVal({ peg, path }, ctx);
            m.optionalKeys = steps;
            here.push(m);
        }
    }
    return 1 === here.length ? here[0] : new ConjunctVal_1.ConjunctVal({ peg: here }, ctx);
}
// Whether a tree holds a link anywhere, so that its evaluation has to
// start again with templates met in.
function holdsLink(v, seen = new Set()) {
    if (null == v || true !== v.isVal || seen.has(v)) {
        return false;
    }
    seen.add(v);
    if (true === v.isReferFunc || true === v.isRelFunc || true === v.isRefer
        || true === v.isRel || undefined !== v.linkto) {
        return true;
    }
    const peg = v.peg;
    return (null != peg && 'object' === typeof peg &&
        (true === peg.isVal ? holdsLink(peg, seen)
            : Object.values(peg).some((c) => holdsLink(c, seen))))
        || holdsLink(v.spread?.cj, seen);
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
                // The first pass reads references from the root, as below.
                uctx.root = uctx.root ?? res;
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
            const explain = null == ctx?.explain ? undefined : ctx?.explain;
            const te = explain && (0, utility_1.explainOpen)(uctx, explain, 'root', res);
            // A document with links is evaluated in rounds: each round the
            // document as written, with the templates of the links the last
            // round's output takes met at their targets, until no template is
            // new. A copy of the first tree is kept for the rounds after it.
            const errBase = this.err.length;
            const pristine = holdsLink(res) ? res.clone(uctx, { dup: true }) : undefined;
            let applied = '';
            let links = [];
            for (let round = 0;; round++) {
                // Ref-spread snapshot store (see snapshotRefSpread in MapVal):
                // keyed by ref canon + source site, shared across a round's passes.
                ;
                uctx.snapmap = new Map();
                // NOTE: if true === res.done already, then this loop never needs to run.
                const maxcc = uctx.budget.passes;
                let prevCanon = undefined;
                let lastCanon = undefined;
                let settle = false;
                for (this.cc = 0; this.cc < maxcc && type_1.DONE !== res.dc; this.cc++) {
                    uctx.cc = this.cc;
                    uctx.seen = {};
                    uctx.settle = settle;
                    if (this.cc === maxcc - 1) {
                        prevCanon = lastCanon ?? res.canon;
                    }
                    res = unite(te ? uctx.clone({ explain: (0, utility_1.ec)(te, 'run') }) : uctx, res, (0, top_1.top)(), 'unify');
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
                links = linksOf(res);
                const flows = undefined === pristine ? [] : flowsOf(res, links);
                const ids = flows.map((f) => f.id).join('\n');
                if (ids === applied || uctx.budget.passes <= round) {
                    break;
                }
                applied = ids;
                this.err.length = errBase;
                res = new ConjunctVal_1.ConjunctVal({
                    peg: [pristine.clone(uctx, { dup: true }), flowDoc(uctx, res, flows, 0)],
                }, uctx);
                uctx = uctx.clone({ root: res });
            }
            // A link the output takes names something the document holds.
            for (const { link, at, put } of links) {
                if (undefined === (0, ReferFuncVal_1.findAt)(res, link.linkto)) {
                    const nil = (0, err_1.makeNilErr)(uctx, link.linkcode ?? 'refer_unresolved', link, undefined, 'refer', { addr: link.peg });
                    nil.path = at;
                    put(nil);
                }
            }
            // The settled tree's alias references canon as the values they
            // name (ts/src/alias.ts): attached here, once, after the last
            // pass, from the snapshot store this run kept.
            (0, alias_1.expandAliases)(res, uctx.snapmap, uctx.err);
            uctx.explain && (0, utility_1.explainClose)(te, res);
        }
        this.res = res;
    }
}
exports.Unify = Unify;
const meetTemplate = (ctx, member, tmpl, whence) => true === tmpl.isPlace && true !== ctx._matchRead ? unite(ctx, tmpl, member, whence)
    : unite(ctx, member, tmpl, whence); /* node:coverage ignore next 11 */
exports.meetTemplate = meetTemplate;
//# sourceMappingURL=unify.js.map