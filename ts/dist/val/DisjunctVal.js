"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisjunctVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const exactjson_1 = require("../exactjson");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const top_1 = require("./top");
const NilVal_1 = require("../val/NilVal");
const PrefVal_1 = require("../val/PrefVal");
const JunctionVal_1 = require("../val/JunctionVal");
class DisjunctVal extends JunctionVal_1.JunctionVal {
    constructor(spec, ctx, _sites) {
        super(spec, ctx);
        this.isDisjunct = true;
        this.isGenable = true;
        this.cjo = 35000;
        this.prefsRanked = false;
    }
    // NOTE: mutation!
    append(peer) {
        super.append(peer);
        this.prefsRanked = false;
        return this;
    }
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Disjunct', this, peer);
        if (!this.prefsRanked) {
            const ranked = this.rankPrefs(ctx);
            // A clash between equal-rank defaults refuses for the whole
            // disjunction (R2): the disagreement IS the answer.
            if (null != ranked && ranked.isNil) {
                return ranked;
            }
        }
        let done = true;
        let oval = [];
        const savedErr = ctx.err;
        const savedTrialMode = ctx._trialMode;
        const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err');
        const ownTrialMode = Object.prototype.hasOwnProperty.call(ctx, '_trialMode');
        const savedFlows = ctx.referflows;
        const staged = [];
        ctx._trialMode = true;
        let gate = undefined;
        try {
            for (let vI = 0; vI < this.peg.length; vI++) {
                const v = this.peg[vI];
                const trialErr = [];
                ctx.err = trialErr;
                if (undefined !== savedFlows) {
                    staged[vI] = new Map();
                    ctx.referflows = staged[vI];
                }
                oval[vI] = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'DIST:' + vI) }) : ctx, v, peer, 'dj-peer');
                if (0 < trialErr.length) {
                    oval[vI] = NilVal_1.TRIAL_NIL;
                }
                else if (v instanceof PrefVal_1.PrefVal &&
                    !peer.isPref && !peer.isTop &&
                    true === (0, PrefVal_1.prefInnerPeg)(v).isScalar) {
                    // A candidate for the admission gate below: a non-pref,
                    // non-top peer met a scalar preference inside this
                    // disjunction.
                    ;
                    (gate = gate ?? []).push(vI);
                }
                done = done && type_1.DONE === oval[vI].dc;
            }
            if (undefined !== gate) {
                for (const gI of gate) {
                    let admitted = false;
                    for (let kI = 0; kI < oval.length && !admitted; kI++) {
                        // Sibling alternatives only: a pref member cannot admit
                        // its own override (post-rankPrefs at most one pref
                        // stands at this level, so this is defensive).
                        admitted = kI !== gI && !oval[kI].isNil &&
                            !this.peg[kI].isPref;
                    }
                    if (!admitted) {
                        const admitErr = [];
                        ctx.err = admitErr;
                        // The trial is against a CLONE: the preferred value must
                        // stay pristine for the surviving preference (the
                        // MatchFuncVal.resolve precedent).
                        const met = (0, unify_1.unite)(ctx, (0, PrefVal_1.prefInnerPeg)(this.peg[gI]).clone(ctx), peer, 'dj-admit');
                        if (0 < admitErr.length || met.isNil) {
                            oval[gI] = NilVal_1.TRIAL_NIL;
                        }
                    }
                }
            }
        }
        finally {
            if (ownTrialMode) {
                ctx._trialMode = savedTrialMode;
            }
            else {
                delete ctx._trialMode;
            }
            if (ownErr) {
                ctx.err = savedErr;
            }
            else {
                delete ctx.err;
            }
            ;
            ctx.referflows = savedFlows;
        }
        // // // console.log('DISJUNCT-unify-B', this.id, oval.map(v => v.canon))
        if (true === peer.isPref) {
            const want = (0, PrefVal_1.prefInnerPeg)(peer);
            for (let vI = 0; vI < oval.length; vI++) {
                const got = oval[vI];
                if (!got.isNil && true !== got.isPref && got.same(want)) {
                    const wrapped = new PrefVal_1.PrefVal({ peg: got }, ctx);
                    wrapped.rank = peer.rank;
                    peer.place(wrapped);
                    oval[vI] = wrapped;
                }
            }
        }
        // Remove duplicates, and normalize
        if (1 < oval.length) {
            for (let vI = 0; vI < oval.length; vI++) {
                if (oval[vI].isDisjunct) {
                    oval.splice(vI, 1, ...oval[vI].peg);
                }
            }
            // // // console.log('DISJUNCT-unify-C', this.id, oval.map(v => v.id + '=' + v.canon))
            // Dedup: duplicate Vals in the disjunct are replaced with the
            // trial sentinel, which is filtered out a few lines below.
            // (No need for a fresh NilVal — any isNil value gets filtered.)
            for (let vI = 0; vI < oval.length; vI++) {
                for (let kI = vI + 1; kI < oval.length; kI++) {
                    if (oval[kI].same(oval[vI])) {
                        oval[vI] = keepRiders(ctx, oval[vI], oval[kI]);
                        oval[kI] = NilVal_1.TRIAL_NIL;
                        continue;
                    }
                    const a = oval[vI];
                    const b = oval[kI];
                    if (true === a.isPref && true === b.isPref
                        && (0, PrefVal_1.prefInnerPeg)(a).same((0, PrefVal_1.prefInnerPeg)(b))) {
                        if (a.rank <= b.rank) {
                            oval[vI] = keepRiders(ctx, a, b);
                            oval[kI] = NilVal_1.TRIAL_NIL;
                        }
                        else {
                            oval[kI] = keepRiders(ctx, b, a);
                            oval[vI] = NilVal_1.TRIAL_NIL;
                            break;
                        }
                    }
                }
            }
            // // // console.log('DISJUNCT-unify-D', this.id, oval.map(v => v.canon))
        }
        if (undefined !== savedFlows) {
            for (let vI = 0; vI < staged.length; vI++) {
                const st = staged[vI];
                if (undefined === st || true === oval[vI]?.isNil) {
                    continue;
                }
                for (const [k, fv] of st) {
                    const prev = savedFlows.get(k);
                    savedFlows.set(k, undefined === prev ? fv
                        : (0, unify_1.unite)(ctx, prev, fv, 'refer-flow-record'));
                }
            }
        }
        // Outside the 1<length block: a SINGLE-member disjunction (e.g. a
        // rankPrefs collapse) whose one member fails the trial or the
        // admission gate must reach the `empty` refusal below, not
        // return the trial sentinel as if it were the answer.
        oval = oval.filter(v => !v.isNil);
        let out;
        if (1 == oval.length) {
            out = oval[0];
        }
        else if (0 == oval.length) {
            return (0, err_1.makeNilErr)(ctx, 'empty', this, peer);
        }
        else {
            out = new DisjunctVal({ peg: oval }, ctx);
            this.place(out);
        }
        out.dc = done ? type_1.DONE : this.dc + 1;
        // // // console.log('DISJUNCT-unify',
        //   this.id, sc, pc, '->', out.canon, 'D=' + out.dc, 'E=', this.err)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    rankPrefs(ctx) {
        // The kept index per rank, so an equal-rank twin folds into the
        // arm already standing for that rank.
        const atRank = {};
        // // // console.log('RP-A', this.peg.map((p: Val) => p.canon))
        for (let vI = 0; vI < this.peg.length; vI++) {
            const v = this.peg[vI];
            let pref = undefined;
            if (v instanceof PrefVal_1.PrefVal) {
                pref = v;
            }
            else if (v.isDisjunct) {
                const subrank = v.rankPrefs(ctx);
                if (null != subrank && subrank.isNil) {
                    return subrank;
                }
                if (subrank instanceof PrefVal_1.PrefVal) {
                    this.peg[vI] = subrank;
                    pref = subrank;
                }
            }
            if (undefined !== pref) {
                const at = atRank[pref.rank];
                if (undefined === at) {
                    atRank[pref.rank] = vI;
                }
                else {
                    const folded = pref.unify(this.peg[at], ctx);
                    if (folded.isNil) {
                        return folded;
                    }
                    this.peg[at] = folded;
                    this.peg[vI] = null;
                }
            }
        }
        this.peg = this.peg.filter((p) => null != p);
        this.prefsRanked = true;
        // // // console.log('RP-Z', this.peg.map((p: Val) => p.canon))
        if (1 === this.peg.length && this.peg[0] instanceof PrefVal_1.PrefVal) {
            return this.peg[0];
        }
        return undefined;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        return out;
    }
    getJunctionSymbol() {
        return '|';
    }
    gen(ctx) {
        if (0 < this.peg.length) {
            // Ranking may not have run when gen is reached without a prior
            // unify (a library caller generating a freshly parsed tree), and
            // it is what guarantees at most one preference stands here.
            if (!this.prefsRanked) {
                this.rankPrefs(ctx);
            }
            const prefs = this.peg.filter((v) => v instanceof PrefVal_1.PrefVal);
            if (0 === prefs.length && 1 < this.peg.length) {
                const gctx = ctx.clone({ err: [], collect: true });
                let firstOut;
                let allSame = true;
                for (let gI = 0; gI < this.peg.length && allSame; gI++) {
                    const gout = this.peg[gI].gen(gctx);
                    if (0 < gctx.err.length || undefined === gout) {
                        allSame = false;
                    }
                    else if (0 === gI) {
                        firstOut = gout;
                    }
                    else {
                        allSame = genShape(this.peg[gI], gout) === genShape(this.peg[0], firstOut);
                    }
                }
                if (allSame) {
                    return firstOut;
                }
            }
            if (0 === prefs.length && 1 < this.peg.length) {
                const nerr = (0, err_1.makeNilErr)(ctx, 'disjunct_no_gen', this);
                (0, err_1.descErr)(nerr, ctx);
                ctx?.adderr(nerr);
                if (null == ctx || !ctx.collect) {
                    throw new err_1.AontuError(nerr.msg, [nerr]);
                }
                return undefined;
            }
            let best = this.peg[0];
            if (0 < prefs.length) {
                best = prefs[0];
                for (const p of prefs) {
                    if (p.rank < best.rank) {
                        best = p;
                    }
                }
            }
            return best.gen(ctx);
        }
        return super.gen(ctx);
    }
}
exports.DisjunctVal = DisjunctVal;
// Generated output with the number KINDS the JSON loses: `1` and
// `1.0` generate the same digits, and are still different values.
// A member dropped as a duplicate leaves its riders on the survivor, at
// every depth, so the join is as order-free as the meet (ADR-052).
function keepRiders(ctx, keep, drop) {
    if (!ridden(drop)) {
        return keep;
    }
    const out = keep.clone(ctx);
    (0, unify_1.ride)(out, keep, drop);
    if (true === drop.isPref && true !== out.isPref) {
        // A twin of a higher rank holds one more preference layer.
        return keepRiders(ctx, out, drop.peg);
    }
    if (true === out.isBag) {
        for (const k of Object.keys(out.peg)) {
            out.peg[k] = keepRiders(ctx, out.peg[k], drop.peg[k]);
        }
    }
    else if (true === out.isPref) {
        out.peg = keepRiders(ctx, out.peg, drop.peg);
    }
    return out;
}
function ridden(v) {
    return null != v.deprecation || null != v.meta ||
        (true === v.isBag && Object.values(v.peg).some(ridden)) ||
        (true === v.isPref && ridden(v.peg));
}
function genShape(v, out) {
    if ('number' === typeof out && true === v?.isScalar) {
        return (true === v.isInteger ? 'i' : true === v.isNumber ? 'f' : 'n') + (0, exactjson_1.exactJSON)(out);
    }
    if (null != out && 'object' === typeof out && !Array.isArray(out) && true === v?.isMap) {
        return '{' + Object.keys(out).sort().map((k) => JSON.stringify(k) + ':' + genShape(v.peg[k], out[k])).join(',') + '}';
    }
    // Generation drops marked and absent elements, so pair what remains.
    const kids = true === v?.isList ? v.peg.filter((c) => !(c.mark?.type || c.mark?.hide) && true !== c.isAbsent &&
        true !== c.isMaybeFunc) : [];
    if (Array.isArray(out) && kids.length === out.length) {
        return '[' + out.map((o, i) => genShape(kids[i], o)).join(',') + ']';
    }
    return (0, exactjson_1.exactJSON)(out);
} /* node:coverage ignore next 8 */
//# sourceMappingURL=DisjunctVal.js.map