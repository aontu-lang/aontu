"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyedFuncVal = exports.MatchFuncVal = void 0;
exports.effectiveScrutinee = effectiveScrutinee;
const err_1 = require("../err");
const top_1 = require("./top");
const PrefVal_1 = require("./PrefVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const Val_1 = require("./Val");
const ConstraintVal_1 = require("./ConstraintVal");
function effectiveScrutinee(v) {
    let out = v;
    if (true === out?.isDisjunct && Array.isArray(out.peg)) {
        const prefs = out.peg.filter((m) => true === m?.isPref);
        if (0 === prefs.length) {
            return v;
        }
        out = prefs.reduce((a, b) => b.rank < a.rank ? b : a);
    }
    return (0, PrefVal_1.prefInnerPeg)(out);
}
// What a selection is made by, as the output reads it: a scalar, or a bag
// whose output members are such; a nil or an absence goes on as before.
function generates(v) {
    const s = effectiveScrutinee(v);
    const unseen = (k, c) => true === c.mark?.type || true === c.mark?.hide ||
        true === s.optionalKeys?.includes(k) || true === s.aliasKeys?.includes(k);
    return true === s?.isScalar || true === s?.isNil || true === s?.isAbsent ||
        ((true === s?.isMap || true === s?.isList) &&
            Object.entries(s.peg).every(([k, c]) => unseen(k, c) || generates(c)));
}
// A result stands where the selection stands, so the relative paths
// written in it read from there, as a template's instance reads them.
function placed(result, ctx) {
    const out = result.clone(ctx, { dup: true });
    (0, Val_1.repathInstance)(out, ctx.path);
    return out;
}
class MatchFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isMatchFunc = true;
        this.staged = true;
    }
    funcname() {
        return 'match';
    }
    callname() {
        return 'match';
    }
    prepare(_ctx, _args) {
        return null;
    }
    hasDefault() {
        return 0 === this.peg.length % 2;
    }
    unify(peer, ctx) {
        // The scrutinee and the PATTERNS are driven; the results are not
        // (see the header). driveStagedArgs takes a prefix, so the odd
        // positions are driven one at a time.
        // A path to the match's own place reads the peer held there; a
        // scrutinee waits, read again, until it generates a value.
        const held = peer.isTop ? ctx : ctx.holdArm(this.path, peer, undefined, true);
        const scrut = this.peg[0].done ? undefined : this.peg[0].clone(ctx, { dup: true });
        let ready = this.driveStagedArgs(held, 1);
        if (ready && !generates(this.peg[0])) {
            this.peg[0] = scrut ?? this.peg[0];
            ready = false;
        }
        const last = this.peg.length - (this.hasDefault() ? 1 : 0);
        for (let i = 1; i < last; i += 2) {
            const arg = this.peg[i];
            if (!arg.done) {
                this.peg[i] = arg.unify((0, top_1.top)(), (0, ConstraintVal_1.readsPlace)(arg, this.path) ? held : ctx);
            }
            ready = ready && true === this.peg[i].done;
        }
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    resolve(ctx, args) {
        const scrutinee = effectiveScrutinee(args[0]);
        const dflt = this.hasDefault() ?
            args[args.length - 1] : undefined;
        const last = args.length - (undefined === dflt ? 0 : 1);
        const tried = [];
        for (let i = 1; i < last; i += 2) {
            const pattern = args[i];
            tried.push(pattern.canon);
            // The trial is against CLONES: `unite` refines a bag in place
            // against a TOP peer, and a pattern that failed must be
            // untouched for the next document that reads its canon.
            const met = (0, FuncBaseVal_1.trialUnify)(ctx, scrutinee.clone(ctx), pattern.clone(ctx));
            if (undefined !== met && (0, FuncBaseVal_1.sameMembers)(scrutinee, met, ctx, true)) {
                return placed(args[i + 1], ctx);
            }
        }
        if (undefined !== dflt) {
            return placed(dflt, ctx);
        }
        return (0, err_1.makeNilErr)(ctx, 'match_none', this, undefined, 'resolve', {
            value: scrutinee.canon,
            tried: tried.join(' '),
        });
    }
}
exports.MatchFuncVal = MatchFuncVal;
// keyed() IS CARRIED OUT BY ITS MATCH AND WRITTEN UNDER ITS OWN NAME (ADR-080).
class KeyedFuncVal extends MatchFuncVal {
    callname() {
        return 'keyed';
    }
    get canon() {
        const [, p, t, e] = this.peg;
        return 'keyed(' + p.canon + ',' + t.canon + (true === e.isTop ? '' : ',' + e.canon) + ')';
    }
} /* node:coverage ignore next 7 */
exports.KeyedFuncVal = KeyedFuncVal;
//# sourceMappingURL=MatchFuncVal.js.map