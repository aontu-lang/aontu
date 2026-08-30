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
const lang_1 = require("./lang");
const utility_1 = require("./utility");
const top_1 = require("./val/top");
// The evaluation budgets live on the context (ctx.budget: passes,
// revisits, depth), defaulted there to the shared spec-visible
// constants test/spec/budget.tsv pins in both ports (9 / 999 / 1000)
// and configurable through the trust profile (G5, docs/trust.md) —
// deterministically: a budget is an integer count of engine events,
// never wall-clock.
//
// Why the revisit default is 999: how many times one (Val, path) pair
// may be re-unified within a single fixpoint pass before the evaluator
// calls it non-convergence (`unify_cycle`). The old false positive here
// -- a legal model with many sibling conjunct terms at one path, each
// re-running the TOP self-unify -- is fixed by the per-pass memo below
// (_tcc/_tpi); test/spec/budget.tsv drives 1200 sibling terms through
// both engines as the regression guard.
//
// Why the depth default is 1000: the whole shared suite peaks at 603
// (the deliberately extreme 1200-sibling-term fixture; ordinary
// documents are two orders below), and V8 exhausts its call stack
// somewhere past depth ~1500 in this evaluator. 1000 sits above every
// real document and below the host limit, so the budget -- not the
// host -- decides the verdict.
// Charge a DIRECT `Val.unify` recursion to the same depth budget that
// `unite` enforces. Function and operator arguments evaluate through
// `arg.unify(top(), ...)` rather than through the dispatcher, so without
// this the counter stays flat while the JavaScript stack keeps growing:
// a 1500-deep `upper(upper(...))` resolved in TypeScript while Go — which
// routes its arguments through the counted dispatcher — reported
// `unify_cycle`. Returns the budget nil instead of running when the
// budget is spent.
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
    // Fast paths that don't recurse and so don't need cycle-detection:
    // short-circuit before the saw-key build and seen-map lookup (which
    // together cost ~2.5µs per call). Only return early when the result
    // is already `done` — a non-done result would need the trailing
    // top() unify below.
    //
    //   A6a: same ref, already done
    //   A6b: different ref but same id + both done
    //   P1:  exact-equal scalars that are already done (14% of calls
    //        in foo-sdk, ~100% with a.done=true)
    if (a !== undefined && a !== null) {
        if (a === b) {
            if (a.done)
                return a;
        }
        // ... and NOT on an instrumented run (G7 provenance). Both arms
        // below answer with one operand and never reach the recorder at
        // the tail, so an equal pair — two positions of one entity that
        // agree, a clone meeting its source — contributed silently and
        // `why` named one site where the Go port, whose recorder wraps the
        // whole dispatcher, named both. Instrumented runs pay the slow
        // path knowingly; uninstrumented ones pay one undefined check.
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
                    // NOT two TOPs: every top has the same (absent) peg, so
                    // this path would treat any two as the same value and
                    // return one of them whole — dropping a rider the other
                    // carries. The slow path answers the same thing for two
                    // plain tops, so nothing is lost by declining the shortcut.
                    && !a.isTop && !b.isTop
                    // NOT two rel residuals (RELATIONS P1) for the same
                    // reason: a settled rel is DONE with an absent peg, so
                    // any two matched here — dropping one side's type and
                    // held constraints. RelVal.unify merges them instead.
                    // NOT two graph atoms (P2) either: acyclic() and
                    // inverse(x) share a constructor and an absent peg
                    // without being the same declaration.
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
        // Structural recursion budget. Without it, deep nesting exhausts the
        // V8 call stack and the catch-all below reports a RangeError as
        // `internal` — a verdict that depends on the host's stack size
        // rather than on the document, which is exactly what the
        // determinism clause forbids (docs/trust.md). Tripping here instead
        // makes it a stated budget error, like the pass budget.
        out = (0, err_1.makeNilErr)(ctx, 'unify_cycle', a, b);
    }
    else if (ctx.budget.revisits < sawCount) {
        // console.log('SAW', sawCount, saw, a?.id, a?.canon, b?.id, b?.canon, ctx.cc)
        out = (0, err_1.makeNilErr)(ctx, 'unify_cycle', a, b);
    }
    else {
        ctx.seen[saw] = sawCount + 1;
        ctx._depth.n++;
        try {
            let unified = false;
            // Dispatch ladder. Structure note:
            //   - `a == null` is degenerate (shouldn't happen in practice:
            //     the top-level call seeds with a real Val). Kept for safety.
            //   - TOP is the unit element: unifying with it returns the
            //     other side. Handle both sides.
            //   - Otherwise route by Val type. Complex Vals (Conjunct,
            //     Disjunct, Ref, Pref, Func, Expect) have their own unify
            //     that knows how to absorb the peer; prefer `a.unify` when
            //     `a` is complex, else `b.unify` when `b` is complex. If
            //     neither is complex and it's not a plain-scalar match, fall
            //     through to the generic `a.unify` (concrete Val classes
            //     each handle their own peer case).
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
                // The refer residual (G4 phase 2) DRIVES, like the other
                // residuals here: its peer is a plain string, which knows
                // nothing about entity addresses, so letting the string drive
                // dropped the address and left the constraint standing.
                || b.isRefer
                // An operator holding a HOLE (G8 phase 3) drives for the same
                // reason: its peer is what FILLS it, and a scalar asked to
                // unify with `_ + 2` sees an operator rather than a hole and
                // refuses it on kind. Narrow to placeheld operators on
                // purpose -- every other operator meets its peer the way it
                // always has, through the conjunct fold that drives it.
                || (b.isOp && (0, PlaceVal_1.hasPlace)(b))
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
            // Exactly equal scalars (not caught by early fast-path — e.g.
            // because a or b isn't .done yet). Rel residuals are excluded
            // exactly as in the fast path: their pegs are equally absent
            // without the values being the same relation.
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
            // Any non-done top-level result self-unifies with TOP to ensure
            // its children finish converging. Skipped when `unified` is true
            // because the branch that set `out = X.unify(Y, ctx)` already
            // ran that Val's own unify logic.
            if (!out.done && !unified) {
                // Once per pass per (Val, path): within a single fixpoint pass
                // nothing external to the subtree changes, so repeating the TOP
                // self-unify — which conjunct folds otherwise trigger once per
                // fold term — is pure re-work, and on large models (hundreds of
                // sibling terms) the repeats trip the MAXCYCLE guard as a false
                // positive. The path is part of the key: a shared Val can
                // resolve path-dependent content differently per location.
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
            // This catch-all converts an unexpected exception into an 'internal'
            // Nil so one bad node doesn't crash a whole unify. To avoid fully
            // masking regressions, preserve the original error message (and a
            // RangeError flag — i.e. stack overflow from runaway recursion) on
            // the Nil's details so it surfaces in the formatted error rather
            // than vanishing. See err.ts (descErr) for how details render.
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
    // The provenance record (G7 phase 3), at the one place every meet
    // passes through — the same reason the deprecation rider below lives
    // here. Off by default: an uninstrumented run pays this one property
    // load, and an instrumented one pays site materialisation knowingly.
    if (undefined !== ctx.prov) {
        ctx.prov.record(ctx.path, a, b, out);
    }
    // The deprecation record survives EVERY meet (G3 phase 4): the
    // boolean marks have their own sweeps (ConjunctVal, the bag walks),
    // but a record lost in one meet shape is a use the tooling never
    // warns about, so it rides here, at the one place all meets pass
    // through. First record wins; TOP and nil stay clean (TOP is the
    // unit, and an error needs no deprecation).
    if (null != out && true === out.isVal &&
        !out.isTop && !out.isNil && null == out.deprecation) {
        const dep = (null != a ? a.deprecation : undefined) ??
            (null != b ? b.deprecation : undefined);
        if (null != dep) {
            out.deprecation = dep;
        }
    }
    return out;
};
exports.unite = unite;
function update(x, _y) {
    // TODO: update x with y.site
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
// THE TYPE FLOW, APPLIED (G4 phase 2). `refer(t)` unifies `t` INTO the
// node it addresses, which is a write at a position the meet is not
// currently at -- the one non-local effect in the evaluator.
//
// It cannot be only a write made during the pass. A pass BUILDS a new
// tree from the old one, and `ctx.root` during pass N is pass N-1's
// result; a subtree rebuilt by pass N (which is exactly what happens
// when the link sits inside its own target, or when two nodes link at
// each other) drops a write made into the previous one. So each flow is
// also RECORDED, keyed by the target's path, and re-applied to the
// pass's own result here.
//
// Keyed by PATH, so there is no registry of names to collide in
// (ADR-014) -- the key is the position the address resolved to, and
// re-uniting the same type at the same position is idempotent, which is
// what makes replaying every recorded flow every pass correct rather
// than merely cheap.
function applyFlows(ctx, root) {
    const flows = ctx.referflows;
    // NOTHING TO APPLY is the common case -- a document with no links
    // pays one property load per pass, and the walk never runs.
    if (null == flows || 0 === flows.size) {
        return root;
    }
    // Sorted, so two flows landing at overlapping positions arrive in the
    // same order in both ports.
    for (const key of [...flows.keys()].sort()) {
        const path = key.split('\x00');
        // The SHARED resolver, the one `refer` itself uses: a second
        // descent written here would be a second answer to "what does this
        // path name", and the two would drift (the Go twin calls the same
        // findAt, arm for arm -- ADR-001).
        //
        // A RECORDED PATH THAT NO LONGER RESOLVES is skipped rather than
        // refused: the record outliving its position is a question about
        // the tree, and the link that named it answers it
        // (test/spec/refer.tsv, `flow-target-moved-away`).
        //
        // NO DOCUMENT REACHES IT: a record is written only for a path that
        // HAD resolved, and unification never takes a node back out of the
        // tree — `move` copies and hides its source rather than removing
        // it, which is the one rearrangement that looked like it would
        // (probed in both ports: the flow still resolves on every pass,
        // `flow-lands-then-its-parent-moves`). The guard is the contract
        // for a rearrangement that does, and it is pinned by a direct call
        // (`apply-flows-skips-a-record-that-stops-resolving` in
        // ts/test/coverage3.test.ts) rather than by an ignore marker: node's
        // `coverage ignore` drops LINES, and the gate reads BRANCH records,
        // which survive it. The Go twin in go/unify.go can use the marker
        // because that gate counts statements.
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
            // TODO: messy
            // uctx.seterr(this.err)
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
                // console.log('CC', this.cc, res.canon)
                uctx.cc = this.cc;
                uctx.seen = {};
                // THE STAGING RULE (G8 phase 0,
                // docs/capability-review/g8-generation.md), stated once, here,
                // for every value whose answer depends on WHERE IT IS. Such a
                // value residuates while the model is still moving and fires on
                // the first pass whose input is IDENTICAL to the previous
                // pass's input: nothing moved, so nothing will move it again,
                // and the position it reports is the position it ends at.
                //
                // Why the whole model and not the value's own path. A spread, a
                // reference or a `move` can place a value under a path it has
                // already been driven at and THEN change what encloses it --
                // `move` hides its source one pass AFTER it copies it, and a
                // `key()` that answered on the strength of its path alone would
                // answer for the ghost. Stability of the model is the only
                // signal that says every such rearrangement is finished.
                uctx.settle = settle;
                // Snapshot BEFORE the final pass (the loop condition has
                // already established the tree is not done), so exhaustion can
                // tell "still refining" from "stable residue" below. Taken at
                // the final pass's ENTRY rather than the previous pass's exit
                // — the same value when the budget allows two passes, and the
                // only possible value when the trust profile sets passes to 1,
                // where the old placement (cc === maxcc - 2, never true) made
                // exhaustion silent, exactly the truncation docs/trust.md
                // forbids. `lastCanon` IS that entry canon whenever a previous
                // pass rendered one, so this costs nothing extra.
                if (this.cc === maxcc - 1) {
                    prevCanon = lastCanon ?? res.canon;
                }
                res = unite(te ? uctx.clone({ explain: (0, utility_1.ec)(te, 'run') }) : uctx, res, (0, top_1.top)(), 'unify');
                // MULTI-ERROR COLLECTION (G2 phase 6): the pass loop CONTINUES
                // past an erroring pass, so independent failures a later pass
                // would reach are collected in the same run — the break that
                // stood here made every multi-error report truncated at the
                // first erroring pass.
                //
                // What controls the cascade the design feared: a nil is
                // ABSORBING (unite's isNil arms return the existing nil, no new
                // error), so one failure stays ONE NilVal however many later
                // meets touch it — a reference resolving to a failed target
                // takes the same nil identity, which is exactly what lets the
                // report layer dedup by identity. The probes that established
                // this (fan-in refs, spread templates, disjunct trials, nested
                // conjuncts) are pinned as vet.tsv's multi-* rows in both
                // ports.
                // The recorded type flows, re-applied to the tree THIS pass
                // built: a pass rebuilds subtrees, and a flow written into the
                // previous pass's tree does not survive that.
                res = applyFlows(uctx, res);
                // The staging signal for the NEXT pass, rendered here rather
                // than at the top of the loop so a model that is FINISHED is
                // never rendered at all: canon walks references, and the only
                // trees that close a cycle are hand-built ones (the pass loop
                // is what a test drives them through), which converge in one
                // pass and must not be walked to decide a question that no
                // longer arises.
                if (type_1.DONE !== res.dc) {
                    const nowCanon = res.canon;
                    settle = undefined !== lastCanon && lastCanon === nowCanon;
                    lastCanon = nowCanon;
                }
                uctx = uctx.clone({ root: res });
            }
            // The pass budget is spent AND the final pass still made
            // progress: the model was cut off while converging, and no other
            // error explains why. Silent truncation would surface later as
            // ordinary incompleteness, so exhaustion is a semantic error of
            // its own (class budget, docs/trust.md clause 2) -- retrying with
            // a larger budget is a valid response to THIS code and useless
            // for path_cycle or no_path. A STABLE residue (the final pass
            // changed nothing -- e.g. a stuck `1+true`) is not a budget
            // failure: it is ordinary incompleteness and stays silent here,
            // surfacing at generate exactly as before.
            if (maxcc <= this.cc && type_1.DONE !== res.dc && 0 === uctx.err.length
                && undefined !== prevCanon && prevCanon !== res.canon) {
                (0, err_1.makeNilErr)(uctx, 'budget_passes', undefined, undefined, 'resolve', {
                    budget: 'passes',
                    limit: maxcc,
                    paths: residuePaths(res, 4).join(' ') || '$',
                });
            }
            uctx.explain && (0, utility_1.explainClose)(te, res);
        }
        this.res = res;
    }
} /* node:coverage ignore next 10 */
exports.Unify = Unify;
//# sourceMappingURL=unify.js.map