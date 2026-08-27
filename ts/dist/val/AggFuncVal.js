"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreatestFuncVal = exports.LeastFuncVal = exports.SumFuncVal = exports.PickFuncVal = exports.AggFuncVal = void 0;
const err_1 = require("../err");
const IntegerVal_1 = require("./IntegerVal");
const ListVal_1 = require("./ListVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const arith_1 = require("./arith");
const numcmp_1 = require("./numcmp");
// The children of a bag, in the order the aggregate sees them: source
// order for a list, sorted-key order for a map -- `each`'s order, and
// for the same reason (a map has no order of its own, so the language
// picks one and states it).
function bagChildren(data) {
    if (true === data?.isList) {
        return data.peg;
    }
    if (true === data?.isMap) {
        return Object.keys(data.peg).sort().map((k) => data.peg[k]);
    }
    return undefined;
}
class AggFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx, op) {
        super(spec, ctx);
        this.isAggFunc = true;
        // THE STAGING RULE (G8 phase 0). A total over a bag that is still
        // being merged into is a total of the wrong bag -- the same reason
        // `filter` and `each` wait.
        this.staged = true;
        this.op = op;
    }
    // NO `make` OVERRIDE, matching the other STAGED funcs (pack, each,
    // filter, match): a staged call returns `residuate` before `unify`
    // ever reaches the rebuild branch, so an override there would be
    // unreachable code pretending to be a contract. The base's `make`
    // raises `func:<name>` if that ever stops being true, which is the
    // loud answer rather than a value that silently lost its operation.
    funcname() {
        return this.op;
    }
    // The base does not drive the argument: `unify` drives it by hand,
    // because a staged func must advance what it is waiting on every
    // pass rather than only on the pass it fires.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        const ready = this.driveStagedArgs(ctx, 1);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const children = bagChildren(args?.[0]);
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, this.op));
        }
        if ('sum' === this.op) {
            // Zero is addition's identity, so an empty bag has an answer and
            // it is an integer -- the narrowest kind, which the first real
            // operand then widens under R5 exactly as `add(0, x)` would.
            let total = new IntegerVal_1.IntegerVal({ peg: 0 });
            for (const child of children) {
                total = (0, arith_1.arith)(ctx, 'add', this, total, child, this.op);
                // A refusal inside the fold IS the answer: adding on past a
                // non-numeric child or an overflow would report the wrong
                // reason, or none.
                if (true === total.isNil) {
                    return this.place(total);
                }
            }
            return this.place(total);
        }
        if (0 === children.length) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_empty', this, undefined, this.op));
        }
        const want = 'least' === this.op ? -1 : 1;
        let best = undefined;
        for (const child of children) {
            const c = unpref(child);
            if (!(c?.isVal && c.isScalar && 'string' !== typeof c.peg &&
                'boolean' !== typeof c.peg && !c.isNull)) {
                return this.place((0, err_1.makeNilErr)(ctx, 'invalid-arg', this, undefined, this.op));
            }
            // The EXACT comparator (numcmp), never binary64: a bigdecimal and
            // an integer in one bag must order by their values and not by
            // whatever their float images happen to be.
            if (undefined === best || want === (0, numcmp_1.cmpNumeric)(c, best)) {
                best = c;
            }
        }
        // The winner is returned as itself, so it keeps its own kind: the
        // least of a bag of bigdecimals is a bigdecimal.
        return this.place(best.clone(ctx));
    }
}
exports.AggFuncVal = AggFuncVal;
// A pref child contributes its preferred value, and therefore that
// value's kind too -- the rule `+` and the arithmetic family apply to
// operands, applied here to bag members.
function unpref(v) {
    while (v?.isPref) {
        v = v.peg;
    }
    return v;
}
// PROJECTION: `pick(d, k)` -- one element per child of `d`, being that
// child's `k`.
//
// The other half of the review's finding I: "`_.field` is unspellable,
// `filter` cannot see into lists, `unique()`-by-field is reserved but
// absent -- so 'no two services share a port' and 'unique event ids'
// cannot be said." Without it the aggregates above cannot reach the
// case that motivated them, because `sum` needs a bag of NUMBERS and a
// model holds a bag of RECORDS:
//
//   total: sum(pick($.lines, amountCents))
//
// IT IS NOT `each` WITH A CLEVER TEMPLATE. `each(d, t)` MEETS each
// child with `t`, and a meet cannot select: `each($.lines, _.amount)`
// asks for a child that is simultaneously the whole record and one of
// its fields, which is why every spelling of it answers `no_path`.
// Selection is a different operation and gets its own verb.
//
// A CHILD MISSING THE KEY IS AN ERROR, not a silently shorter list.
// Skipping would make `sum(pick(...))` quietly total the wrong set of
// records -- the failure mode an aggregate exists to prevent -- so the
// refusal names the child (`pick_key`).
class PickFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPickFunc = true;
        // The bag must settle before it is projected, exactly as it must
        // before it is folded.
        this.staged = true;
    }
    funcname() {
        return 'pick';
    }
    // The base drives neither argument: the DATA is driven by hand below
    // (a staged func must advance what it waits on every pass), and the
    // KEY is a bare word, which the parser has already made a string.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        const ready = this.driveStagedArgs(ctx, 1);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const children = bagChildren(args?.[0]);
        const key = args?.[1];
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, 'pick'));
        }
        // The key is a STRING for a map child and the decimal spelling of an
        // index for a list child -- the same rule a reference segment
        // follows, so `pick(d, 0)` and `$.d.0.x` agree about what `0` names.
        const name = null == key?.peg ? undefined :
            'string' === typeof key.peg ? key.peg :
                'number' === typeof key.peg && key.isInteger ? String(key.peg) :
                    undefined;
        if (undefined === name) {
            return this.place((0, err_1.makeNilErr)(ctx, 'invalid-arg', this, undefined, 'pick'));
        }
        const peg = [];
        for (const child of children) {
            const c = child;
            const got = true === c?.isMap ? c.peg[name] :
                true === c?.isList ? c.peg[Number(name)] :
                    undefined;
            if (null == got) {
                return this.place((0, err_1.makeNilErr)(ctx, 'pick_key', this, undefined, 'pick', { key: name }));
            }
            peg.push(got.clone(ctx.descend(String(peg.length))));
        }
        return this.place(new ListVal_1.ListVal({ peg }, ctx));
    }
}
exports.PickFuncVal = PickFuncVal;
// The three the registry names. Each is its operation and nothing else.
class SumFuncVal extends AggFuncVal {
    constructor(spec, ctx) { super(spec, ctx, 'sum'); }
}
exports.SumFuncVal = SumFuncVal;
class LeastFuncVal extends AggFuncVal {
    constructor(spec, ctx) { super(spec, ctx, 'least'); }
}
exports.LeastFuncVal = LeastFuncVal;
class GreatestFuncVal extends AggFuncVal {
    constructor(spec, ctx) {
        super(spec, ctx, 'greatest');
    }
} /* node:coverage ignore next 9 */
exports.GreatestFuncVal = GreatestFuncVal;
//# sourceMappingURL=AggFuncVal.js.map