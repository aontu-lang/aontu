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
const subsume_1 = require("../subsume");
const admission_1 = require("./admission");
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
function below(scrutinee, pattern) {
    const state = { profile: 'values', findings: [], generalUrl: '', specificUrl: '', pairs: (0, subsume_1.newPairs)() };
    return 'yes' === (0, subsume_1.subsumeNode)(state, [], pattern, scrutinee);
}
// The scrutinee as the output reads it: a member the generated value leaves out is no member.
function outputOf(v, own, ctx) {
    if (true !== v?.isMap || null == own || 'object' !== typeof own || Array.isArray(own)) {
        return v;
    }
    const out = v.clone(ctx);
    const peg = {};
    for (const k of Object.keys(out.peg)) {
        if (Object.prototype.hasOwnProperty.call(own, k)) {
            peg[k] = outputOf(out.peg[k], own[k], ctx);
        }
    }
    out.peg = peg;
    out.optionalKeys = out.optionalKeys.filter((k) => undefined !== peg[k]);
    return out;
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
        // (see the header), and the odd positions one at a time. A path to
        // the match's own place reads the peer held there; a scrutinee waits,
        // read again, until it generates a value or no data could change the
        // arm it takes (ruling 87).
        const held = peer.isTop ? ctx : ctx.holdArm(this.path, peer, undefined, true);
        const scrut = this.peg[0].done ? undefined : this.peg[0].clone(ctx, { dup: true });
        let ready = this.driveStagedArgs(held, 1);
        const open = ready && !generates(this.peg[0]);
        const last = this.peg.length - (this.hasDefault() ? 1 : 0);
        for (let i = 1; i < last; i += 2) {
            const arg = this.peg[i];
            if (!arg.done) {
                this.peg[i] = arg.unify((0, top_1.top)(), (0, ConstraintVal_1.readsPlace)(arg, this.path) ? held : ctx);
            }
            ready = ready && true === this.peg[i].done;
        }
        if (open && !(ready && this.certain(ctx))) {
            this.peg[0] = scrut ?? this.peg[0];
            ready = false;
        }
        if (!ready || !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        return super.unify(peer, ctx);
    }
    // The first arm the scrutinee shares a value with is taken where every value it admits satisfies the pattern.
    certain(ctx) {
        const last = this.peg.length - (this.hasDefault() ? 1 : 0);
        for (let i = 1; i < last; i += 2) {
            if (undefined !== (0, FuncBaseVal_1.trialUnify)(ctx, this.peg[0].clone(ctx), this.peg[i].clone(ctx))) {
                return below(this.peg[0], this.peg[i]);
            }
        }
        return true;
    }
    // A result not taken that holds a path into the match's place naming nothing there is still the schema's error.
    taking(ctx, args, taken) {
        const at = ctx.path;
        const out = placed(args[taken], ctx);
        const last = args.length - (this.hasDefault() ? 1 : 0);
        const results = [];
        for (let i = 2; i <= last; i += 2) {
            results.push(i);
        }
        if (this.hasDefault()) {
            results.push(args.length - 1);
        }
        for (const ri of results.filter((ri) => ri !== taken)) {
            const r = placed(args[ri], ctx);
            const stray = (0, PrefVal_1.strayRef)(r, (ref) => {
                const to = [].concat(ref.plainRefPath() ?? []);
                const rest = to.slice(at.length);
                return 0 < rest.length && at.every((p, k) => String(p) === String(to[k])) &&
                    (0, PrefVal_1.namesNothing)(r, rest) && (0, PrefVal_1.namesNothing)(out, rest);
            });
            if (undefined !== stray) {
                return (0, err_1.makeNilErr)(ctx, 'no_path', stray);
            }
        }
        return out;
    }
    resolve(ctx, args) {
        const scrutinee = effectiveScrutinee(args[0]);
        const dflt = this.hasDefault() ?
            args[args.length - 1] : undefined;
        const last = args.length - (undefined === dflt ? 0 : 1);
        const tried = [];
        const open = !generates(args[0]);
        const own = open ? undefined : (0, admission_1.ownJson)(scrutinee, ctx);
        const output = undefined === own ? undefined : outputOf(scrutinee, own, ctx);
        for (let i = 1; i < last; i += 2) {
            const pattern = args[i];
            tried.push(pattern.canon);
            const admits = undefined === output ? undefined :
                !(0, admission_1.sealedMiss)(pattern, own) && (0, admission_1.admitsSettled)(ctx, pattern, output, own, this.path);
            if (undefined !== admits) {
                if (admits) {
                    return this.taking(ctx, args, i + 1);
                }
                continue;
            }
            // The trial is against CLONES: `unite` refines a bag in place
            // against a TOP peer, and a pattern that failed must be
            // untouched for the next document that reads its canon.
            const met = (0, FuncBaseVal_1.trialUnify)(ctx, scrutinee.clone(ctx), pattern.clone(ctx));
            if (undefined !== met && ((0, FuncBaseVal_1.sameMembers)(scrutinee, met, ctx, true) || (open && below(args[0], pattern)))) {
                return this.taking(ctx, args, i + 1);
            }
        }
        if (undefined !== dflt) {
            return this.taking(ctx, args, args.length - 1);
        }
        return (0, err_1.makeNilErr)(ctx, 'match_none', this, undefined, 'resolve', {
            value: scrutinee.canon,
            tried: tried.join(' '),
        });
    }
}
exports.MatchFuncVal = MatchFuncVal;
// keyed() IS CARRIED OUT BY ITS MATCH AND WRITTEN UNDER ITS OWN NAME.
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