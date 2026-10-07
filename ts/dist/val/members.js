"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bagMembers = bagMembers;
exports.memberVals = memberVals;
const keyorder_1 = require("../keyorder");
const Val_1 = require("./Val");
const BagVal_1 = require("./BagVal");
function bagMembers(data, ctx) {
    if (true !== data?.isMap && true !== data?.isList) {
        return undefined;
    }
    const keys = true === data.isMap ?
        Object.keys(data.peg).sort(keyorder_1.cmpCodePoint) :
        data.peg.map((_v, i) => '' + i);
    const lifted = true === data.mark.hide || true === data.mark.type;
    const out = [];
    for (const key of keys) {
        const val = data.peg[key];
        if ((!lifted && (true === val.mark.hide || true === val.mark.type))
            || data.aliasKeys.includes(key)) {
            continue;
        }
        if (data.optionalKeys.includes(key) &&
            (true === ctx.noFill || !filled(val, ctx))) {
            continue;
        }
        out.push({ key, val });
    }
    return out;
}
// An optional child is a member when it generates something, decided
// as BagVal.gen decides it: in an isolated collect context, so residue
// inside an absent optional subtree is dropped rather than raised.
function filled(val, ctx) {
    if (!(0, BagVal_1.bagGenable)(val)) {
        return false;
    }
    const cval = val.gen(ctx.clone({ err: [], collect: true }));
    return undefined !== cval && !(0, Val_1.empty)(cval);
}
// The member values alone, for the verbs that do not need the keys.
function memberVals(data, ctx) {
    const members = bagMembers(data, ctx);
    return undefined === members ? undefined : members.map((m) => m.val);
} /* node:coverage ignore next 6 */
//# sourceMappingURL=members.js.map