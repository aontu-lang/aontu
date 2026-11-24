"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyFuncVal = void 0;
const StringVal_1 = require("../val/StringVal");
const ScalarKindVal_1 = require("../val/ScalarKindVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const err_1 = require("../err");
class KeyFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isKeyFunc = true;
        this.staged = true;
    }
    make(_ctx, spec) {
        return new KeyFuncVal(spec);
    }
    funcname() {
        return 'key';
    }
    resolve(ctx, _args) {
        let out = this;
        const argval = this.peg?.[0];
        let move = 1;
        if (null != argval) {
            if (argval.isInteger) {
                move = argval.peg;
            }
            else if (argval.isBigInteger) {
                // A level far outside the path simply misses, exactly as an
                // out-of-range plain integer already does, so Number() here needs
                // no bound of its own.
                move = Number(argval.peg);
            }
            else {
                return (0, err_1.makeNilErr)(ctx, 'key_level', this);
            }
        }
        let positioned = true;
        for (const seg of this.path) {
            if ('string' !== typeof seg) {
                positioned = false;
                break;
            }
        }
        const here = positioned ? this.path : ctx.path;
        const at = here.length - (1 + move);
        // A key that climbs out of a declaration's body waits for the use that places it.
        const waits = at <= 0 && true === ctx.root?.aliasKeys?.includes(here[0]);
        out = waits ? new ScalarKindVal_1.ScalarKindVal({ peg: String, emptyOk: true }) :
            new StringVal_1.StringVal({ peg: here[at] ?? '' });
        out.reread = [this];
        out.unplaced = waits;
        return out;
    }
    gen(_ctx) {
        return undefined;
    }
} /* node:coverage ignore next 6 */
exports.KeyFuncVal = KeyFuncVal;
//# sourceMappingURL=KeyFuncVal.js.map