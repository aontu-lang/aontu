"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreatestFuncVal = exports.LeastFuncVal = exports.SumFuncVal = exports.SortFuncVal = exports.PickFuncVal = exports.JoinFuncVal = exports.AggFuncVal = void 0;
const err_1 = require("../err");
const IntegerVal_1 = require("./IntegerVal");
const ListVal_1 = require("./ListVal");
const StringVal_1 = require("./StringVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const arith_1 = require("./arith");
const numcmp_1 = require("./numcmp");
const keyorder_1 = require("../keyorder");
const members_1 = require("./members");
const PlusOpVal_1 = require("./PlusOpVal");
function bagChildren(data, ctx) {
    return (0, members_1.memberVals)(data, ctx);
}
class AggFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx, op) {
        super(spec, ctx);
        this.isAggFunc = true;
        this.staged = true;
        this.op = op;
    }
    funcname() {
        return this.op;
    }
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
        const children = bagChildren(args?.[0], ctx);
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, this.op));
        }
        if ('sum' === this.op) {
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
    // The base drives neither argument: `unify` drives both by hand, as a
    // staged func must advance what it waits on every pass, so a key given
    // through a rider, a name or a path is read as its value.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        const ready = this.driveStagedArgs(ctx, 2);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const children = bagChildren(args?.[0], ctx);
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
// `pick`'s rule, plus: the empty string is the member itself, which is
// how a keyless descending sort is spelled.
function projectorName(key) {
    if (null == key || null == key.peg) {
        return ['', true];
    }
    if ('string' === typeof key.peg) {
        return [key.peg, true];
    }
    if ('number' === typeof key.peg && key.isInteger) {
        return [String(key.peg), true];
    }
    return ['', false];
}
function fieldOf(child, name) {
    return true === child?.isMap ? child.peg[name] :
        true === child?.isList ? child.peg[Number(name)] :
            undefined;
}
const SORT_DIRECTIONS = { asc: 1, desc: -1 };
function directionOf(v) {
    if (null == v || null == v.peg) {
        return 1;
    }
    return 'string' === typeof v.peg ? SORT_DIRECTIONS[v.peg] : undefined;
}
// Text by code point, numbers by the exact comparator, nothing else.
function sortDomain(u) {
    if (true !== u?.isVal || true !== u.isScalar || true === u.isNull) {
        return undefined;
    }
    if ('string' === typeof u.peg) {
        return 'text';
    }
    return 'boolean' === typeof u.peg ? undefined : 'number';
}
class SortFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isSortFunc = true;
        // The bag must settle before it is ordered, exactly as it must
        // before it is projected.
        this.staged = true;
    }
    funcname() {
        return 'sort';
    }
    // The base drives no argument: `unify` drives all three by hand, as
    // `pick` drives its key.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        const ready = this.driveStagedArgs(ctx, 3);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const children = bagChildren(args?.[0], ctx);
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, 'sort'));
        }
        const [name, nameok] = projectorName(args?.[1]);
        if (!nameok) {
            return this.place((0, err_1.makeNilErr)(ctx, 'invalid-arg', this, undefined, 'sort'));
        }
        const dir = directionOf(args?.[2]);
        if (undefined === dir) {
            return this.place((0, err_1.makeNilErr)(ctx, 'sort_dir', this, undefined, 'sort', { dir: args[2].canon }));
        }
        const rows = [];
        let domain = undefined;
        for (const child of children) {
            const at = '' === name ? child : fieldOf(child, name);
            if (null == at) {
                return this.place((0, err_1.makeNilErr)(ctx, 'sort_key', this, undefined, 'sort', { key: name }));
            }
            const u = unpref(at);
            const found = sortDomain(u);
            if (undefined === found ||
                (undefined !== domain && found !== domain)) {
                return this.place((0, err_1.makeNilErr)(ctx, 'sort_domain', this, undefined, 'sort', { member: u.canon }));
            }
            domain = found;
            rows.push({ idx: rows.length, val: child, key: u });
        }
        // The source index breaks every tie, so the order is TOTAL and
        // neither port's sort algorithm can reorder equals.
        rows.sort((a, b) => {
            const c = 'text' === domain ?
                (0, keyorder_1.cmpCodePoint)(a.key.peg, b.key.peg) :
                (0, numcmp_1.cmpNumeric)(a.key, b.key);
            return 0 === c ? a.idx - b.idx : dir * c;
        });
        const peg = rows.map((r, i) => r.val.clone(ctx.descend(String(i))));
        return this.place(new ListVal_1.ListVal({ peg }, ctx));
    }
}
exports.SortFuncVal = SortFuncVal;
function memberVerdict(v) {
    const u = unpref(v);
    if (undefined !== (0, PlusOpVal_1.plusText)(u)) {
        return 'text';
    }
    if (true === u?.isMap || true === u?.isList || true === u?.isNull) {
        return 'never';
    }
    return 'notyet';
}
function sepVerdict(v) {
    const u = unpref(v);
    if (u?.isVal && u.isScalar) {
        return 'string' === typeof u.peg ? 'text' : 'never';
    }
    if (true === u?.isMap || true === u?.isList || true === u?.isNull) {
        return 'never';
    }
    return 'notyet';
}
class JoinFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isJoinFunc = true;
        // The bag must settle before it is folded, exactly as it must before
        // it is summed or projected.
        this.staged = true;
    }
    make(_ctx, spec) {
        return new JoinFuncVal(spec);
    }
    funcname() {
        return 'join';
    }
    // The base does not drive: `unify` drives by hand, because a staged
    // func must advance what it is waiting on every pass rather than only
    // on the pass it fires.
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        const ready = this.driveStagedArgs(ctx, 2);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    deferResolve(ctx, args) {
        const children = bagChildren(args?.[0], ctx);
        if (undefined === children) {
            // Not a bag at all: let `resolve` say so rather than waiting for
            // a settling that has already happened.
            return false;
        }
        const sep = args?.[1];
        if (undefined !== sep && 'notyet' === sepVerdict(sep)) {
            return true;
        }
        return children.some((c) => 'notyet' === memberVerdict(c));
    }
    resolve(ctx, args) {
        const children = bagChildren(args?.[0], ctx);
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, 'join'));
        }
        let sep = '';
        if (1 < args.length) {
            sep = unpref(args[1]).peg;
        }
        const parts = [];
        for (const child of children) {
            const u = unpref(child);
            const text = (0, PlusOpVal_1.plusText)(u);
            if (undefined === text) {
                return this.place((0, err_1.makeNilErr)(ctx, 'join_member', this, undefined, 'join', { member: String(u?.canon) }));
            }
            parts.push(text);
        }
        return this.place(new StringVal_1.StringVal({ peg: parts.join(sep) }));
    }
}
exports.JoinFuncVal = JoinFuncVal;
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
} /* node:coverage ignore next 11 */
exports.GreatestFuncVal = GreatestFuncVal;
//# sourceMappingURL=AggFuncVal.js.map