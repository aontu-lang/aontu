"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackFuncVal = void 0;
exports.dataKeys = dataKeys;
const unify_1 = require("../unify");
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const BagVal_1 = require("./BagVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
const members_1 = require("./members");
function dataKeys(data, ctx) {
    const members = (0, members_1.bagMembers)(data, ctx);
    if (undefined === members) {
        return 'pack_data';
    }
    if (true === data.isMap) {
        return members.map((m) => m.key);
    }
    const out = [];
    for (const { val } of members) {
        const e = val;
        // A key is a NAME, and only a string is one. A number would
        // key by position under another spelling, which is the failure
        // mode the data-keyed rule exists to refuse.
        if (true !== e?.isScalar || 'string' !== typeof e.peg) {
            return 'pack_key';
        }
        out.push(e.peg);
    }
    return out;
}
class PackFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPackFunc = true;
        this.staged = true;
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
        if (!this.stagedReady(peer, ctx, 1)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const keys = dataKeys(args?.[0], ctx);
        if ('string' === typeof keys) {
            return (0, err_1.makeNilErr)(ctx, keys, this);
        }
        // Arity is checked at parse (funcArity), so both arguments are here.
        const tmpl = args[1];
        const peg = (0, BagVal_1.keyTable)();
        const src = args[0];
        for (const key of keys) {
            const keyctx = ctx.descend(key);
            const source = true === src?.isMap ? src.peg[key] : src.peg[keys.indexOf(key)];
            const inst = tmpl.clone(keyctx, { dup: true });
            (0, Val_1.repathInstance)(inst, inst.path);
            const child = (0, PlaceVal_1.fillPlace)(inst, source, keyctx);
            peg[key] = undefined === peg[key] ? child :
                (0, unify_1.unite)(keyctx, peg[key], child, 'pack');
        }
        return new MapVal_1.MapVal({ peg }, ctx);
    }
} /* node:coverage ignore next 7 */
exports.PackFuncVal = PackFuncVal;
//# sourceMappingURL=PackFuncVal.js.map