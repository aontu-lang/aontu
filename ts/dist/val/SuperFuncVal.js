"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperFuncVal = void 0;
exports.superOf = superOf;
const FuncBaseVal_1 = require("./FuncBaseVal");
const MapVal_1 = require("./MapVal");
const BagVal_1 = require("./BagVal");
const ListVal_1 = require("./ListVal");
const DisjunctVal_1 = require("./DisjunctVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
const top_1 = require("./top");
class SuperFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isSuperFunc = true;
    }
    make(_ctx, spec) {
        return new SuperFuncVal(spec);
    }
    funcname() {
        return 'super';
    }
    deferResolve(_ctx, args) {
        return true === args?.[0]?.isRecurse;
    }
    resolve(ctx, args) {
        // One argument, always a Val: funcArity pins super at [1,1]
        // before any resolve, and the parser builds arguments as Vals --
        // a guarded fallback here is dead code under ADR-002.
        return this.place(superOf(ctx, args[0]));
    }
}
exports.SuperFuncVal = SuperFuncVal;
// superOf answers the immediate parent type of a RESOLVED value (the
// caller drives arguments before resolve fires, so pending forms --
// held conjuncts, unresolved references, holes -- never arrive).
function superOf(ctx, v) {
    if (true === v.isRecurse) {
        const call = new SuperFuncVal({ peg: [v.clone(ctx)] }, ctx);
        return v.place(call);
    }
    if (true === v.isMap) {
        const peg = (0, BagVal_1.keyTable)();
        for (const k of Object.keys(v.peg)) {
            peg[k] = superOf(ctx, v.peg[k]);
        }
        const out = new MapVal_1.MapVal({ peg }, ctx);
        out.optionalKeys = [...v.optionalKeys];
        out.closed = v.closed;
        if (null != v.spread?.cj) {
            out.spread.cj = superOf(ctx, v.spread.cj);
        }
        return v.place(out);
    }
    if (true === v.isList) {
        const peg = v.peg.map((e) => superOf(ctx, e));
        const out = new ListVal_1.ListVal({ peg }, ctx);
        out.closed = v.closed;
        if (null != v.spread?.cj) {
            out.spread.cj = superOf(ctx, v.spread.cj);
        }
        return v.place(out);
    }
    if (true === v.isPref) {
        return superOf(ctx, v.peg);
    }
    // A choice lifts arm by arm: super(1|2) is integer, super(1|"a") is
    // integer|string. An arm whose lift is top absorbs the whole answer
    // -- a disjunct carrying top says nothing -- and duplicate lifts
    // collapse so the common case answers as the one kind it is.
    if (true === v.isDisjunct) {
        const arms = [];
        const seen = {};
        for (const a of v.peg) {
            const lift = superOf(ctx, a);
            if (true === lift.isTop) {
                return v.place((0, top_1.top)());
            }
            if (true !== seen[lift.canon]) {
                seen[lift.canon] = true;
                arms.push(lift);
            }
        }
        if (1 === arms.length) {
            return v.place(arms[0]);
        }
        return v.place(new DisjunctVal_1.DisjunctVal({ peg: arms }, ctx));
    }
    if (true === v.isConstraint) {
        if (null != v.kind) {
            return v.place(new ScalarKindVal_1.ScalarKindVal({ peg: v.kind }));
        }
        if ('number' === v.domain) {
            return v.place(new ScalarKindVal_1.ScalarKindVal({ peg: Number }));
        }
        if ('string' === v.domain) {
            return v.place(new ScalarKindVal_1.ScalarKindVal({ peg: String }));
        }
        return v.place((0, top_1.top)());
    }
    const sup = v.superior();
    if (null != sup && true !== sup.isTop) {
        return sup;
    }
    return v.place((0, top_1.top)());
} /* node:coverage ignore next 6 */
//# sourceMappingURL=SuperFuncVal.js.map