"use strict";
/* Copyright (c) 2021-2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigRefuse = sigRefuse;
const err_1 = require("./err");
const sig_1 = require("./sig");
const ScalarKindVal_1 = require("./val/ScalarKindVal");
// The scalar-kind words the gate enforces, each to its lattice
// marker. A declared type is gate-checkable only when EVERY union
// word is here: `any`, `constraint`, and the container words leave
// the argument to the builtin.
const SIG_KIND = new Map([
    ['string', String],
    ['number', Number],
    ['integer', ScalarKindVal_1.Integer],
    ['float', ScalarKindVal_1.Float],
    ['biginteger', ScalarKindVal_1.BigInteger],
    ['bigdecimal', ScalarKindVal_1.BigDecimal],
    ['boolean', Boolean],
    ['path', ScalarKindVal_1.Path],
]);
function gateWords(type) {
    const out = [];
    for (const word of type.split('|')) {
        const marker = SIG_KIND.get(word);
        if (undefined === marker) {
            return undefined;
        }
        out.push(marker);
    }
    return out;
}
// The declared type admits a driven Val when the Val is a concrete
// scalar whose leaf kind is, or sits below, one of the declared
// words -- the same walk subsumption makes, so `number` admits every
// numeric leaf and `string` admits a path value.
function admits(markers, arg) {
    const leaf = arg.superior?.();
    if (true !== arg.isScalar || true !== leaf?.isScalarKind) {
        return false;
    }
    for (const marker of markers) {
        if (marker === leaf.peg || (0, ScalarKindVal_1.kindSubsumes)(marker, leaf.peg)) {
            return true;
        }
    }
    return false;
}
// The gate. Answers the func_arg refusal, or undefined to let the
// call resolve.
function sigRefuse(ctx, fn, args) {
    const sig = sig_1.funcSig[fn.funcname()];
    // key() reads its level off the written peg and `key_level` names
    // what is wrong with a bad one; the gate leaves the meaning where
    // it lives.
    if (undefined === sig || 'key' === sig.name) {
        return undefined;
    }
    for (let i = 0; i < sig.args.length; i++) {
        const a = sig.args[i];
        if (true === a.rest) {
            break;
        }
        if ('value' !== a.mode) {
            continue;
        }
        const markers = gateWords(a.type);
        if (undefined === markers) {
            continue;
        }
        const arg = args[i];
        if (undefined === arg || true === arg.isNil || true !== arg.done) {
            continue;
        }
        const shaped = (true === arg.isScalar) ||
            (true === arg.isMap) || (true === arg.isList) ||
            (true === arg.isScalarKind);
        if (shaped && !admits(markers, arg)) {
            return (0, err_1.makeNilErr)(ctx, 'func_arg', fn, arg, undefined, {
                func: sig.name,
                sig: (0, sig_1.renderSig)(sig),
                arg: a.name,
                argn: '' + (i + 1),
                got: arg.canon,
            });
        }
    }
    return undefined;
}
//# sourceMappingURL=siggate.js.map