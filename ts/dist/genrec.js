"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.genHeld = genHeld;
exports.genOn = genOn;
const ctx_1 = require("./ctx");
const err_1 = require("./err");
const unify_1 = require("./unify");
const keyorder_1 = require("./keyorder");
const top_1 = require("./val/top");
const FuncBaseVal_1 = require("./val/FuncBaseVal");
const genwrite_1 = require("./val/genwrite");
const ScalarKindVal_1 = require("./val/ScalarKindVal");
const GEN_MODEL = '@"aontu:gen"';
const READ_CACHE_MAX = 256;
function genFamily(v) {
    const kind = true === v.isScalar ? v.kind : true === v.isScalarKind ? v.peg : undefined;
    if (undefined !== kind) {
        return String === kind ? 'String' : Boolean === kind ? 'Boolean' : ScalarKindVal_1.Null === kind ? 'Null'
            : ScalarKindVal_1.Path === kind ? 'Path' : 'Number';
    }
    return true === v.isMap || true === v.isMapKind ? 'Map'
        : true === v.isList || true === v.isListKind ? 'List' : undefined;
}
const reads = new Map();
// A record is read against its type's standard set by the engine, in an
// evaluation of its own: an option is refused as any other value is.
// The record less its custom expression, which the set says nothing of.
function optionsOf(rec) {
    return null == rec.peg.custom ? rec.canon : '{' + Object.keys(rec.peg)
        .filter((k) => 'custom' !== k).sort(keyorder_1.cmpCodePoint)
        .map((k) => JSON.stringify(k) + ':' + rec.peg[k].canon).join(',') + '}';
}
function genRead(family, rec) {
    const options = optionsOf(rec);
    const key = family + ' ' + options;
    let read = reads.get(key);
    if (undefined === read) {
        const uni = new unify_1.Unify(GEN_MODEL + '\nout: $.aontu.Gen.' + family + ' & ' + options);
        const gctx = new ctx_1.AontuContext({ collect: true, err: uni.err });
        const out = 0 === uni.err.length ? uni.res.gen(gctx) : undefined;
        read = 0 === uni.err.length ? { opts: out.out } : { option: String(uni.err[0].path[1]) };
        if (READ_CACHE_MAX <= reads.size) {
            reads.clear();
        }
        reads.set(key, read);
    }
    return read;
}
let sets = undefined;
function genSet(family) {
    if (undefined === sets) {
        const gen = new unify_1.Unify(GEN_MODEL).res.peg.aontu.peg.Gen;
        sets = {};
        for (const name of Object.keys(gen.peg)) {
            sets[name] = gen.peg[name].canon;
        }
    }
    return sets[family];
}
// Each record is cloned: one rides many values.
function meetRec(ctx, a, b) {
    return a === b || a.canon === b.canon ? a : (0, FuncBaseVal_1.trialUnify)(ctx, a.clone(ctx), b.clone(ctx));
}
function conflict(ctx, a, b) {
    return (0, err_1.makeNilErr)(ctx, 'gen_conflict', a, b, undefined, { a: a.canon, b: b.canon });
}
function genOn(ctx, out, a, b) {
    const ra = a?.genrec;
    const rb = b?.genrec;
    if (null == ra && null == rb) {
        return out;
    }
    let rec = out.genrec;
    for (const r of [ra, rb]) {
        if (null != r && r !== rec) {
            const met = null == rec ? r : meetRec(ctx, rec, r);
            if (undefined === met) {
                return conflict(ctx, rec, r);
            }
            rec = met;
        }
    }
    return genLand(ctx, out, rec);
}
// A disjunction holds no record of its own, and a preference is held to
// its record by the value it prefers, whose own record it meets.
function genLand(ctx, out, rec) {
    if (true === out.isDisjunct) {
        return genArms(ctx, out, rec);
    }
    let held = out;
    let full = rec;
    while (true === held.isPref) {
        held = held.peg;
        if (null != held.genrec) {
            const met = meetRec(ctx, full, held.genrec);
            if (undefined === met) {
                return conflict(ctx, full, held.genrec);
            }
            full = met;
        }
    }
    const family = genFamily(held);
    let opts = undefined;
    if (undefined !== family) {
        const read = genRead(family, full);
        if (undefined !== read.option) {
            return (0, err_1.makeNilErr)(ctx, 'gen_option', out, full, undefined, {
                type: family.toLowerCase(),
                set: genSet(family),
                got: full.canon,
                option: read.option,
            });
        }
        const custom = full.peg.custom;
        opts = null == custom ? read.opts : { ...read.opts, custom: custom.peg };
    }
    out.genrec = rec;
    out.genopts = held === out ? opts : undefined;
    return out;
}
// An arm of a type that refuses the record drops, as under a constraint.
function genArms(ctx, out, rec) {
    const lands = out.peg.every((arm) => null != arm.genrec && meetRec(ctx, arm.genrec, rec)?.canon === arm.genrec.canon);
    if (lands) {
        return out;
    }
    const carrier = (0, top_1.top)();
    carrier.genrec = rec;
    return out.unify(carrier, ctx);
}
const customs = new Map();
// The expression is evaluated on its own, as `apply` is anywhere, over
// what the value writes without it. An output that places could share
// is made again for each.
function genCustom(ctx, v, custom, given) {
    const key = given + '\n' + custom;
    let made = customs.get(key);
    if (undefined === made) {
        const uni = new unify_1.Unify('out: apply(' + given + ', ' + custom + ')');
        const gctx = new ctx_1.AontuContext({ collect: true, err: uni.err });
        const out = 0 === uni.err.length ? uni.res.gen(gctx) : undefined;
        made = 0 === uni.err.length ? { out: out.out } : { cause: String(uni.err[0].why) };
        if (null == made.out || 'object' !== typeof made.out) {
            if (READ_CACHE_MAX <= customs.size) {
                customs.clear();
            }
            customs.set(key, made);
        }
    }
    return undefined === made.cause ? made.out :
        (0, genwrite_1.genRefuse)(ctx, 'gen_custom', v, { custom, given, cause: made.cause });
}
genwrite_1.genHooks.custom = genCustom;
// The record lands on the preferred value only where it is generated:
// an override takes it from the preference.
function genHeld(ctx, pref) {
    const lctx = ctx ?? new ctx_1.AontuContext({});
    return genOn(lctx, pref.peg.clone(lctx), pref, undefined).gen(ctx);
} /* node:coverage ignore next 6 */
//# sourceMappingURL=genrec.js.map