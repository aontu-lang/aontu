"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreatestFuncVal = exports.LeastFuncVal = exports.SumFuncVal = exports.PickFuncVal = exports.JoinFuncVal = exports.AggFuncVal = void 0;
const err_1 = require("../err");
const IntegerVal_1 = require("./IntegerVal");
const ListVal_1 = require("./ListVal");
const StringVal_1 = require("./StringVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const arith_1 = require("./arith");
const numcmp_1 = require("./numcmp");
const keyorder_1 = require("../keyorder");
const PlusOpVal_1 = require("./PlusOpVal");
// The children of a bag, in the order the aggregate sees them: source
// order for a list, sorted-key order for a map -- `each`'s order, and
// for the same reason (a map has no order of its own, so the language
// picks one and states it).
function bagChildren(data) {
    if (true === data?.isList) {
        return data.peg;
    }
    if (true === data?.isMap) {
        // THE ONE MAP-KEY ORDER (../keyorder.ts), not a bare `.sort()`:
        // JavaScript compares by UTF-16 code unit, so an astral key's
        // leading surrogate sorts BELOW U+E000-U+FFFF and `pick` answered
        // in a different order from `each`, from canon, and from Go --
        // which sorts UTF-8 bytes, i.e. code points. `pick` is the
        // order-preserving projection, so that was one model producing two
        // different generated files (BUGS.md 62).
        return Object.keys(data.peg).sort(keyorder_1.cmpCodePoint).map((k) => data.peg[k]);
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
// Which of the three a value is.
//
// `text` -- `+` would take it, so the fold can.
//
// `never` -- a SETTLED value that will never become text: a map, a
// list, a null. This is `join_member`, class `conflict`, and it names
// the member rather than the call, because "one of these is not a
// string" is only actionable if you are told which.
//
// `notyet` -- an unresolved kind, a top, a stable residue. NOT a join
// failure at all: the call stays residual and generation reports
// `mapval_no_gen`, class `incomplete`, exactly as docs/trust.md
// requires ("a stable residue ... is ordinary incompleteness"). Getting
// this split wrong in either direction is the defect that matters here:
// refusing a residue makes `join` unusable inside a schema, and
// deferring on a map makes a real error arrive as a shrug.
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
// The separator is a STRING or it is nothing.
//
// A number would render perfectly well through `+`, and is still
// refused: the separator is not a member of the fold, it is the
// parameter naming the text between members, and `join(x, 5)` is far
// likelier a mistake than an intent to separate with "5". `pick`'s key
// argument draws the same line for the same reason. This is the
// direction that can be loosened later without breaking a document;
// the other direction cannot.
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
    // A `make` OVERRIDE, WHERE ITS AggFuncVal SIBLINGS HAVE NONE, and the
    // difference is worth stating because it is not arbitrary. `sum`,
    // `pick` and the rest are staged and nothing more: they residuate
    // before `unify` reaches the rebuild branch, so a `make` there would
    // be unreachable code pretending to be a contract, and the base's
    // `func:<name>` refusal is the loud answer if that ever changes.
    //
    // `join` is the first builtin that is BOTH staged AND defers its
    // resolution (see `deferResolve`). A deferred call has settled
    // arguments, so it does reach the rebuild branch, and without this it
    // raised `func:join` on the first document with an unresolved member
    // — where the Go port residuated and reported `mapval_no_gen`.
    // Opposite answers on `join($.m, ",")` with `m: [string]`, caught by
    // running both engines rather than by either test suite. `super` and
    // bare `id`, the two other deferring calls, each carry the same
    // override for the same reason.
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
        // BOTH arguments, unlike `pick`, which drives only its bag: `pick`'s
        // key is a bare word the parser has already made a string, while a
        // separator is an ordinary expression and `join($.rows, $.sep)` has
        // to wait for it.
        const ready = this.driveStagedArgs(ctx, 2);
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    // The `notyet` half of the verdict, taken before `resolve` runs: with
    // arguments settled but a member still a kind, the call rides the
    // ordinary args-not-done path and residuates, which is what makes an
    // unresolved member ordinary incompleteness rather than a refusal.
    deferResolve(_ctx, args) {
        const children = bagChildren(args?.[0]);
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
        const children = bagChildren(args?.[0]);
        if (undefined === children) {
            return this.place((0, err_1.makeNilErr)(ctx, 'aggregate_data', this, undefined, 'join'));
        }
        // Arity is [1,2], so a second argument is present or the separator
        // is the empty string -- which makes `join(coll)` concatenation.
        // The separator's SHAPE is settled before resolve runs: the
        // signature gate refuses every concrete non-string
        // (docs/design/SIGNATURES.0.md; join(d: map|list, sep?: string)),
        // and deferResolve holds the call while sepVerdict answers notyet
        // -- so a present separator here is text.
        let sep = '';
        if (1 < args.length) {
            sep = unpref(args[1]).peg;
        }
        // NO NIL-MEMBER GUARD, WHERE `sum` HAS ONE, and the difference is
        // the fold's shape rather than an oversight. `sum` folds with
        // `arith`, which MINTS a nil part-way through — a non-numeric child
        // or an overflow — so it has to stop and return it. `join` folds
        // already-unified values, and a nil among a list's elements
        // collapses the list before this call resolves: `join([least([])],
        // ",")` reports `aggregate_empty` at the member's own path,
        // `$.o.0`, and never reaches here. A guard was written, the
        // ADR-002 gate found it unexecuted, and probing confirmed no
        // spelling reaches it, so it is removed rather than excused.
        const parts = [];
        for (const child of children) {
            const u = unpref(child);
            const text = (0, PlusOpVal_1.plusText)(u);
            if (undefined === text) {
                return this.place((0, err_1.makeNilErr)(ctx, 'join_member', this, undefined, 'join', { member: String(u?.canon) }));
            }
            parts.push(text);
        }
        // Every part is already a string, so this IS the `+` fold seeded
        // with `""` -- written as one concatenation because a loop of `+`
        // over settled strings cannot differ from it, and because the Go
        // twin's strings.Join must produce the same bytes.
        return this.place(new StringVal_1.StringVal({ peg: parts.join(sep) }));
    }
}
exports.JoinFuncVal = JoinFuncVal;
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
} /* node:coverage ignore next 10 */
exports.GreatestFuncVal = GreatestFuncVal;
//# sourceMappingURL=AggFuncVal.js.map