"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterFuncVal = void 0;
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const ListVal_1 = require("./ListVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
class FilterFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isFilterFunc = true;
        // THE STAGING RULE (G8 phase 0). A subset of a bag that is still
        // being merged into is a subset of the wrong bag.
        this.staged = true;
    }
    funcname() {
        return 'filter';
    }
    // Neither argument is driven by the base: `unify` below drives the
    // DATA by hand, because a staged func must advance the argument it
    // is waiting on every pass rather than only on the one it fires.
    //
    // The CONDITION is not driven at all, and that is deliberate: it is
    // a template, tested against each child at that child's position,
    // so it may hold a `_` (G8 phase 3, the child it is being tested
    // against) or a relative reference — neither of which has an answer
    // at the call site. Driving it there would freeze both.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        if (!this.stagedReady(peer, ctx, 1)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const data = args[0];
        const cond = args[1];
        // The trial is run against CLONES: `unite` refines a bag in place,
        // and a child that failed the test must reach the result -- when
        // it passes -- exactly as it was written.
        //
        // Canon is the comparison because canon is what "the same value"
        // MEANS in this language: it is the form the two ports agree on,
        // the form `aontu diff` compares, and the form a hash is taken of.
        const keeps = (child, kctx) => {
            // `_` inside the condition binds the child being tested (G8
            // phase 3), so a condition can be about the child as a whole
            // rather than only about its shape. The condition is cloned as
            // a FULL instance per trial (`dup`, ADR-005) — a bare clone
            // shares call/pref innards across trials (see PackFuncVal).
            const inst = cond.clone(kctx, { dup: true });
            (0, Val_1.repathInstance)(inst, inst.path);
            const test = (0, PlaceVal_1.fillPlace)(inst, child, kctx);
            const met = (0, FuncBaseVal_1.trialUnify)(kctx, child.clone(kctx), test);
            return undefined !== met && met.canon === child.canon;
        };
        if (true === data?.isMap) {
            const peg = {};
            for (const key of Object.keys(data.peg)) {
                const kctx = ctx.descend(key);
                if (keeps(data.peg[key], kctx)) {
                    peg[key] = data.peg[key].clone(kctx);
                }
            }
            return new MapVal_1.MapVal({ peg }, ctx);
        }
        if (true === data?.isList) {
            const peg = [];
            for (const el of data.peg) {
                // The element context is the position it will END UP at, which
                // is its index in the RESULT: dropping the third of five moves
                // the fourth up, and a kept element must be pathed where it
                // lands rather than where it came from.
                const ectx = ctx.descend(String(peg.length));
                if (keeps(el, ectx)) {
                    peg.push(el.clone(ectx));
                }
            }
            return new ListVal_1.ListVal({ peg }, ctx);
        }
        return (0, err_1.makeNilErr)(ctx, 'filter_data', this);
    }
} /* node:coverage ignore next 5 */
exports.FilterFuncVal = FilterFuncVal;
//# sourceMappingURL=FilterFuncVal.js.map