"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplyFuncVal = void 0;
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
class ApplyFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isApplyFunc = true;
        // Staged as each is: the one instance it makes is each's for [v].
        this.staged = true;
    }
    funcname() {
        return 'apply';
    }
    // The template is not an argument to drive (see PackFuncVal.prepare).
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
        const inst = args[1].clone(ctx, { dup: true, path: this.path });
        (0, Val_1.repathInstance)(inst, inst.path);
        return (0, PlaceVal_1.fillPlace)(inst, args[0], ctx);
    }
} /* node:coverage ignore next 6 */
exports.ApplyFuncVal = ApplyFuncVal;
//# sourceMappingURL=ApplyFuncVal.js.map