"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtFuncVal = void 0;
const err_1 = require("../err");
const siggate_1 = require("../siggate");
const FuncBaseVal_1 = require("./FuncBaseVal");
const RefVal_1 = require("./RefVal");
const SealVal_1 = require("./SealVal");
const RecurseVal_1 = require("./RecurseVal");
// A list counts a negative integer from its end, which a path step does not.
function step(node, key) {
    const at = 'number' === typeof key.peg && true === node?.isList && key.peg < 0 ?
        node.peg.length + key.peg : key.peg;
    return true === node?.isMap || true === node?.isList ? (0, RefVal_1.member)(node, String(at)) : undefined;
}
class AtFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isAtFunc = true;
        this.staged = true;
        this.folds = true;
    }
    make(_ctx, spec) {
        return new AtFuncVal(spec);
    }
    funcname() {
        return 'at';
    }
    prepare(_ctx, _args) {
        return null;
    }
    unify(peer, ctx) {
        if (!this.stagedReady(ctx, this.peg.length)) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const refused = (0, siggate_1.restRefuse)(ctx, this, args);
        if (undefined !== refused) {
            return refused;
        }
        let node = args[0];
        for (const key of args.slice(1)) {
            node = step((0, RecurseVal_1.throughWrap)(node), key);
            if (null == node) {
                return this.place((0, err_1.makeNilErr)(ctx, 'no_path', this));
            }
        }
        const out = node.clone(ctx, { dup: true });
        (0, SealVal_1.fixSeals)(out);
        return this.place((0, RefVal_1.liftCopy)(out, true === node.mark.type));
    }
} /* node:coverage ignore next 5 */
exports.AtFuncVal = AtFuncVal;
//# sourceMappingURL=AtFuncVal.js.map