"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackFuncVal = void 0;
exports.dataKeys = dataKeys;
const unify_1 = require("../unify");
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const PlaceVal_1 = require("./PlaceVal");
// The keys a data bag names, in the order the result must carry them,
// or a code naming what is wrong with it. Shared with `each`, which
// asks the same question of the same argument and answers it with the
// values rather than the keys.
function dataKeys(data) {
    const d = data;
    if (true === d?.isMap) {
        return Object.keys(d.peg);
    }
    if (true === d?.isList) {
        const out = [];
        for (const el of d.peg) {
            const e = el;
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
    return 'pack_data';
}
class PackFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPackFunc = true;
        // THE STAGING RULE (G8 phase 0, see AontuContext.settle). A
        // generator's data argument is not settled merely by being `done`
        // once: a sibling conjunct, an include or a spread can still merge
        // keys into it, and children generated from the half-merged bag
        // would be missing. It fires on the settle pass and only then.
        this.staged = true;
    }
    funcname() {
        return 'pack';
    }
    // The TEMPLATE IS NOT AN ARGUMENT TO DRIVE. Driving it would resolve
    // its `key()` at the CALL SITE -- the one position the template is
    // never used at -- and freeze whatever else in it is path-dependent
    // there too. The data argument is driven by `unify` below instead,
    // one argument by hand rather than all of them by the base.
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
        const keys = dataKeys(args?.[0]);
        if ('string' === typeof keys) {
            return (0, err_1.makeNilErr)(ctx, keys, this);
        }
        // Arity is checked at parse (funcArity), so both arguments are here.
        const tmpl = args[1];
        const peg = {};
        const src = args[0];
        for (const key of keys) {
            const keyctx = ctx.descend(key);
            // THE PLACEHOLDER BINDS THE SOURCE CHILD (G8 phase 3): inside a
            // generator's template `_` is the datum this child is being made
            // FROM. For a map that is the child's value; for a list of names
            // it is the name, which is also the key -- so `_` and `key()`
            // agree there, and differ the moment the data is a map.
            const source = true === src?.isMap ? src.peg[key] : src.peg[keys.indexOf(key)];
            // CLONED, never shared. A spread may share a template that holds
            // nothing path-dependent (MapVal.spreadClone), because a spread
            // CONSTRAINS a child that exists; a generator's template IS the
            // child, and a child is a position. Sharing left every generated
            // child pointing at the template's own parse-time location, which
            // is the position the template is never used at -- visible as the
            // site an error inside a generated child reports.
            //
            // A FULL INSTANCE, to the leaves (`dup`, ADR-005): a bare clone
            // shares the inner structure of any call, preference or
            // operation in the template, so the first child's resolution of
            // a shared key()/ref answered for every child (BUGS.md §8, §9).
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