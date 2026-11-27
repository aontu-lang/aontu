"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterFuncVal = void 0;
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const BagVal_1 = require("./BagVal");
const ListVal_1 = require("./ListVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const admission_1 = require("./admission");
const PrefVal_1 = require("./PrefVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
const members_1 = require("./members");
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
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        if (!this.stagedReady(ctx, 1)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const data = args[0];
        const cond = args[1];
        const keeps = (child, kctx) => {
            const inst = cond.clone(kctx, { dup: true });
            (0, Val_1.repathInstance)(inst, inst.path);
            const test = (0, PlaceVal_1.fillPlace)(inst, child, kctx);
            // Each value the child admits must be admitted: a disjunction is read arm by arm (ruling 51).
            const arms = (true === child.isDisjunct ? child.peg : [child]).map(PrefVal_1.prefInnerPeg);
            const owns = arms.map((arm) => (0, admission_1.ownJson)(arm, kctx));
            const declares = 0 < (test.aliasKeys ?? []).length;
            if (!declares && owns.every((own) => undefined !== own)) {
                const verdicts = arms.map((arm, i) => !(0, admission_1.sealedMiss)(test, owns[i]) && (0, admission_1.admitsSettled)(kctx, test, arm, owns[i], kctx.path));
                if (verdicts.every((v) => undefined !== v)) {
                    return verdicts.every((v) => true === v);
                }
            }
            const met = (0, FuncBaseVal_1.trialUnify)(kctx, child.clone(kctx), test);
            return undefined !== met && (0, FuncBaseVal_1.sameMembers)(child, met, kctx, true);
        };
        // The candidates are the bag's MEMBERS -- what generation would
        // emit (./members.ts, BUGS.md §79) -- so a hidden child is never
        // selected into the result.
        if (true === data?.isMap) {
            const peg = (0, BagVal_1.keyTable)();
            for (const { key, val } of (0, members_1.bagMembers)(data, ctx)) {
                const kctx = ctx.descend(key);
                if (keeps(val, kctx)) {
                    peg[key] = val.clone(kctx);
                }
            }
            return new MapVal_1.MapVal({ peg }, ctx);
        }
        if (true === data?.isList) {
            const peg = [];
            for (const { val: el } of (0, members_1.bagMembers)(data, ctx)) {
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