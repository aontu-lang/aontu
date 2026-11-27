"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackFuncVal = void 0;
exports.packMembers = packMembers;
const type_1 = require("../type");
const unify_1 = require("../unify");
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const BagVal_1 = require("./BagVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
const members_1 = require("./members");
const top_1 = require("./top");
// Each member under the key its child takes: a code, a refusal `k`
// answered, or undefined while `k` waits.
function packMembers(ctx, data, k) {
    const members = (0, members_1.bagMembers)(data, ctx);
    if (undefined === members) {
        return 'pack_data';
    }
    if (undefined !== k) {
        const out = [];
        for (const { key, val } of members) {
            const read = readKey(ctx, k, val, key);
            if (type_1.DONE !== read.dc) {
                return undefined;
            }
            if (true === read.isNil) {
                return read;
            }
            if (!isName(read)) {
                return 'pack_key';
            }
            out.push({ key: read.peg, val });
        }
        return out;
    }
    if (true === data.isMap) {
        return members;
    }
    const out = [];
    for (const { val } of members) {
        // A key is a NAME, and only a string is one. A number would
        // key by position under another spelling, which is the failure
        // mode the data-keyed rule exists to refuse.
        if (!isName(val)) {
            return 'pack_key';
        }
        out.push({ key: val.peg, val });
    }
    return out;
}
function isName(v) {
    return true === v?.isScalar && 'string' === typeof v.peg;
}
// `k` for one member where it stands, run to a fixpoint as the admission
// trial runs its meet, its refusals kept until it answers.
function readKey(ctx, k, member, key) {
    const kctx = ctx.descend(key).clone({ err: [] });
    const inst = k.clone(kctx, { dup: true });
    (0, Val_1.repathInstance)(inst, inst.path);
    let out = (0, PlaceVal_1.fillPlace)(inst, member, kctx);
    let last = '';
    kctx.settle = false;
    for (let cc = 0; type_1.DONE !== out.dc && cc < kctx.budget.passes; cc++) {
        kctx.seen = {};
        kctx.cc = cc;
        out = (0, unify_1.unite)(kctx, out, (0, top_1.top)(), 'pack');
        const now = out.canon;
        if (kctx.settle && now === last) {
            break;
        }
        kctx.settle = now === last;
        last = now;
    }
    if (true === out.isNil) {
        ctx.err.push(...kctx.err);
    }
    return out;
}
class PackFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPackFunc = true;
        this.staged = true;
        this.packed = undefined;
    }
    funcname() {
        return 'pack';
    }
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        // ONE argument is driven: the data. The template is not (see
        // prepare above), and driveStagedArgs answers whether the data has
        // settled -- the other half of "ready to fire".
        if (!this.stagedReady(ctx, 1)) {
            return this.residuate(peer, ctx);
        }
        this.packed = packMembers(ctx, this.peg[0], this.peg[2]);
        if (undefined === this.packed) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const members = this.packed;
        if ('string' === typeof members) {
            return (0, err_1.makeNilErr)(ctx, members, this);
        }
        if (!Array.isArray(members)) {
            return members;
        }
        // Arity is checked at parse (funcArity), so the template is here.
        const tmpl = args[1];
        const peg = (0, BagVal_1.keyTable)();
        for (const { key, val } of members) {
            const keyctx = ctx.descend(key);
            const inst = tmpl.clone(keyctx, { dup: true });
            (0, Val_1.repathInstance)(inst, inst.path);
            const child = (0, PlaceVal_1.fillPlace)(inst, val, keyctx);
            peg[key] = undefined === peg[key] ? child :
                (0, unify_1.unite)(keyctx, peg[key], child, 'pack');
        }
        return new MapVal_1.MapVal({ peg }, ctx);
    }
} /* node:coverage ignore next 6 */
exports.PackFuncVal = PackFuncVal;
//# sourceMappingURL=PackFuncVal.js.map