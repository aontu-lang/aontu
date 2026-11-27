"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisjunctVal = void 0;
exports.meetRanked = meetRanked;
exports.unread = unread;
const type_1 = require("../type");
const err_1 = require("../err");
const exactjson_1 = require("../exactjson");
const unify_1 = require("../unify");
const rider_1 = require("../rider");
const utility_1 = require("../utility");
const top_1 = require("./top");
const NilVal_1 = require("../val/NilVal");
const PrefVal_1 = require("../val/PrefVal");
const FuncBaseVal_1 = require("../val/FuncBaseVal");
const admission_1 = require("../val/admission");
const JunctionVal_1 = require("../val/JunctionVal");
const ConjunctVal_1 = require("../val/ConjunctVal");
const PathVal_1 = require("../val/PathVal");
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
        // An arm that isn't read yet is read, the peer held, before the disjunction meets the peer:
        // a default that reaches the arm stands as the arm it is whenever it settles (ruling 89).
        if (!peer.isTop && this.peg.some(pends) && !this.readArms(peer, ctx)) {
            const held = this.place(new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx));
            (0, utility_1.explainClose)(te, held);
            return held;
        }
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
        // A rider still a call resolves first: met member by member it would
        // write its record on each. Only TypeScript gets here, through the
        // `_tcc` shortcut in unite, which leaves a peer met with top this pass
        // undriven.
        if (true === peer.isFunc && !peer.done && peer.rides()) {
            peer = peer.unify((0, top_1.top)(), ctx);
        }
        // The peer's annotations ride the result once, not each member, so a
        // disjunction met with itself is itself.
        const annotated = null != peer.meta || null != peer.deprecation ||
            null != peer.via || null != peer.reldecl;
        const member = annotated ? peer.clone(ctx, { path: peer.path }) : peer;
        if (annotated) {
            member.meta = undefined;
            member.deprecation = undefined;
            member.via = undefined;
            member.reldecl = undefined;
        }
        if (member instanceof PrefVal_1.PrefVal ||
            member instanceof DisjunctVal && undefined !== (leadRank(this) ?? leadRank(member))) {
            const out = meetRanked(ctx, this, member);
            if (annotated) {
                (0, unify_1.ride)(out, undefined, peer);
            }
            (0, utility_1.explainClose)(te, out);
            return out;
        }
        const savedErr = ctx.err;
        const savedTrialMode = ctx._trialMode;
        const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err');
        const ownTrialMode = Object.prototype.hasOwnProperty.call(ctx, '_trialMode');
        ctx._trialMode = true;
        let gate = undefined;
        let waits = false;
        try {
            for (let vI = 0; vI < this.peg.length; vI++) {
                const v = this.peg[vI];
                const trialErr = [];
                ctx.err = trialErr;
                oval[vI] = (0, unify_1.unite)((te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'DIST:' + vI) }) : ctx)
                    .holdArm(this.path, (0, PrefVal_1.prefInnerPeg)(v), member), v, member, 'dj-peer');
                // An arm's path into its own place that names nothing fails the arm, once all has settled.
                if (0 < trialErr.length || holdsUnmetNil(oval[vI]) ||
                    (true === ctx.settle && undefined !== (0, PrefVal_1.strayIn)(oval[vI], this.path))) {
                    oval[vI] = NilVal_1.TRIAL_NIL;
                }
                else if (v instanceof PrefVal_1.PrefVal && !peer.isTop) {
                    // A candidate for the admission gate below: a non-pref,
                    // non-top peer met a preference inside this disjunction.
                    ;
                    (gate = gate ?? []).push(vI);
                }
                done = done && type_1.DONE === oval[vI].dc;
            }
            if (undefined !== gate) {
                // An arm `*x` is the arm `x` of rank one, with no parent type:
                // a peer its own value refuses kills it.
                for (const gI of gate) {
                    const admitErr = [];
                    ctx.err = admitErr;
                    // The trial is against a CLONE: the preferred value must
                    // stay pristine for the surviving preference (the
                    // MatchFuncVal.resolve precedent).
                    const met = (0, unify_1.unite)(ctx, (0, PrefVal_1.prefInnerPeg)(this.peg[gI]).clone(ctx), peer.clone(ctx), 'dj-admit');
                    if (0 < admitErr.length || met.isNil) {
                        oval[gI] = NilVal_1.TRIAL_NIL;
                    }
                    else if (unread(met)) {
                        waits = true;
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
        }
        // A default arm whose own value a path hasn't read can't answer its gate, so the meet is tried again.
        if (waits) {
            const held = this.place(new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx));
            (0, utility_1.explainClose)(te, held);
            return held;
        }
        // Remove duplicates, and normalize
        if (1 < oval.length) {
            for (let vI = 0; vI < oval.length; vI++) {
                oval.splice(vI, 1, ...flatArms(oval[vI]));
            }
            dedupArms(ctx, oval, false);
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
        if (annotated) {
            (0, unify_1.ride)(out, undefined, peer);
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    // Reads each arm that isn't read yet; false where one still waits.
    readArms(peer, ctx) {
        const arms = [];
        for (const v of this.peg) {
            if (!pends(v)) {
                arms.push(v);
                continue;
            }
            const rctx = ctx.holdArm(this.path, (0, PrefVal_1.prefInnerPeg)(v), peer);
            rctx.err = [];
            rctx._trialMode = true;
            const read = (0, unify_1.unite)(rctx, v, (0, top_1.top)(), 'dj-read');
            if (0 === rctx.err.length && !read.isNil) {
                arms.push(...flatArms(read));
            }
        }
        this.peg = arms;
        this.prefsRanked = false;
        return !arms.some(pends);
    }
    rankPrefs(ctx) {
        const prefs = [];
        // A star over a call or a path adds to the rank of what it reads as (ruling 89).
        for (let vI = 0; vI < this.peg.length; vI++) {
            const v = this.peg[vI];
            if (v instanceof PrefVal_1.PrefVal && !v.peg.done && (true === v.peg.isRef || true === v.peg.isPrefFunc)) {
                const rctx = ctx.clone({ err: [], collect: true });
                const read = (0, unify_1.unite)(rctx, v.clone(ctx), (0, top_1.top)(), 'dj-rank');
                if (0 < rctx.err.length || true === read.isNil) {
                    continue;
                }
                if (!read.peg?.done) {
                    return undefined;
                }
                this.peg[vI] = read;
            }
        }
        for (let vI = 0; vI < this.peg.length; vI++) {
            const v = this.peg[vI];
            if (v.isDisjunct) {
                const subrank = v.rankPrefs(ctx);
                if (null != subrank && subrank.isNil) {
                    return subrank;
                }
                if (subrank instanceof PrefVal_1.PrefVal) {
                    this.peg[vI] = subrank;
                }
            }
            if (this.peg[vI] instanceof PrefVal_1.PrefVal) {
                prefs.push(vI);
            }
        }
        // Only the defaults the rank rule picks fold: foldArms in spec/Aontu/Meet.lean.
        const lead = Math.min(...prefs.map((vI) => this.peg[vI].rank));
        const written = this.peg.slice();
        const plain = (v) => {
            while (true === v.isPref) {
                v = v.peg;
            }
            return v;
        };
        let first = undefined;
        let at = undefined;
        for (const vI of prefs) {
            const pref = this.peg[vI];
            if (lead === pref.rank && undefined === at) {
                at = vI;
            }
            else if (lead === pref.rank) {
                // Twins that differ in their output records do not fold into one.
                const folded = (0, rider_1.sameRec)(pref, this.peg[at]) ? pref.unify(this.peg[at], ctx) :
                    (0, err_1.makeNilErr)(ctx, 'pref_rank_clash', pref, this.peg[at], 'unify');
                if (folded.isNil) {
                    return folded;
                }
                this.peg[at] = folded;
                // The arms the fold stands for stay at rank 0, so the disjunction admits no wider.
                this.peg[vI] = plain(written[vI]);
                first = at;
            }
        }
        if (undefined !== first) {
            this.peg.splice(first + 1, 0, plain(written[first]));
        }
        this.peg = this.peg.filter((p) => null != p);
        this.prefsRanked = true;
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
            const toward = ctx?._toward;
            if (undefined !== toward && 1 < this.peg.length && this.peg.some((arm) => (0, admission_1.armAdmits)(true === arm.isPref ? arm.peg : arm, ctx, toward.v))) {
                return toward.v;
            }
            const prefs = this.peg.filter((v) => v instanceof PrefVal_1.PrefVal);
            if (0 === prefs.length && 1 < this.peg.length) {
                const read = armsAlike(this.peg, ctx, true);
                const alike = undefined === read || true === ctx.plain ? read : armsAlike(this.peg, ctx, false);
                if (undefined !== alike) {
                    return alike.out;
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
function flatArms(v) {
    return true === v.isDisjunct ? v.peg : [v];
}
function pends(v) {
    return true !== v.done && (true === v.isRef || true === v.isFunc || true === v.isConjunct);
}
function unread(v, which) {
    const kids = true === v.isBag || true === v.isJunction || true === v.isFunc || true === v.isOp;
    return true === v.isRef ? undefined === which || which(v) :
        kids && Object.values(v.peg).some((k) => unread(k, which));
}
function dedupArms(ctx, oval, ranked) {
    // Dedup: duplicate Vals in the disjunct are replaced with the
    // trial sentinel, which is filtered out a few lines below.
    // (No need for a fresh NilVal — any isNil value gets filtered.)
    for (let vI = 0; vI < oval.length; vI++) {
        for (let kI = vI + 1; kI < oval.length; kI++) {
            const a = oval[vI];
            const b = oval[kI];
            // Twin defaults leave the value at rank 0 beside the default, as the fold does.
            const plain = !ranked && true === a.isPref && true === b.isPref && a.rank === b.rank ?
                (0, PrefVal_1.prefInnerPeg)(a) : NilVal_1.TRIAL_NIL;
            if (b.same(a) && (0, rider_1.sameRec)(b, a)) {
                oval[vI] = keepRiders(ctx, a, b);
                oval[kI] = plain;
                continue;
            }
            if (true === a.isPref && true === b.isPref
                && (0, PrefVal_1.prefInnerPeg)(a).same((0, PrefVal_1.prefInnerPeg)(b)) && (0, rider_1.sameRec)(a, b)) {
                if (a.rank <= b.rank) {
                    oval[vI] = keepRiders(ctx, a, b);
                    oval[kI] = plain;
                }
                else {
                    oval[kI] = keepRiders(ctx, b, a);
                    oval[vI] = plain;
                    break;
                }
            }
            // A plain arm the ranked meet makes beside a preferred one of the
            // same value adds nothing to it.
            else if (ranked && (true === a.isPref) !== (true === b.isPref)
                && (0, PrefVal_1.prefInnerPeg)(a).same((0, PrefVal_1.prefInnerPeg)(b)) && (0, rider_1.sameRec)(a, b)) {
                oval[vI] = true === a.isPref ? keepRiders(ctx, a, b) : keepRiders(ctx, b, a);
                oval[kI] = NilVal_1.TRIAL_NIL;
            }
        }
    }
}
function meetRanked(ctx, a, b) {
    const arms = meetArms(ctx, a, b);
    return 0 === arms.length ? (0, err_1.makeNilErr)(ctx, 'empty', a, b) : armsVal(ctx, a, arms);
}
function nodeOf(v) {
    return v instanceof DisjunctVal || v instanceof PrefVal_1.PrefVal;
}
// A preferred arm's preference layers carry its riders through the meet.
function armOf(v) {
    return v instanceof PrefVal_1.PrefVal ? [[v.rank + 1, (0, PrefVal_1.prefInnerPeg)(v), prefLayers(v)]] :
        v instanceof DisjunctVal ? v.peg.flatMap(armOf) : [[0, v, []]];
}
function prefLayers(v) {
    const out = [];
    for (let p = v; true === p?.isPref; p = p.peg) {
        out.push(p);
    }
    return out;
}
// A lone preference `*x` is `x | super(x)`.
function armsOf(v) {
    return v instanceof PrefVal_1.PrefVal ? [[v.rank + 1, (0, PrefVal_1.prefInnerPeg)(v), []], [0, v.superpeg, []]] : armOf(v);
}
function leadRank(v) {
    const ranks = armsOf(v).map((p) => p[0]).filter((r) => 0 < r);
    return 0 === ranks.length ? undefined : Math.min(...ranks);
}
function meetArms(ctx, a, b) {
    if (!nodeOf(a) && !nodeOf(b)) {
        const met = (0, FuncBaseVal_1.trialUnify)(ctx, a, b);
        return undefined === met ? [] : armsOf(met);
    }
    const ra = leadRank(a);
    const rb = leadRank(b);
    if (undefined !== ra && ra === rb) {
        return tieArms(ctx, ra, a, b);
    }
    return undefined !== ra && (undefined === rb || ra < rb) || undefined === rb && nodeOf(a) ?
        spread(ctx, a, armsOf(a), (x) => meetArms(ctx, x, b)) :
        spread(ctx, a, armsOf(b), (y) => meetArms(ctx, a, y));
}
function spread(ctx, home, arms, meet) {
    return arms.flatMap(([r, v, s]) => ranked(ctx, home, r, meet(v), s));
}
function ranked(ctx, home, r, arms, s) {
    return 0 === arms.length ? [] : 0 === r ? arms : [[r, armsVal(ctx, home, arms), s]];
}
function tieArms(ctx, r, a, b) {
    const at = (v) => armsOf(v).filter((p) => p[0] === r);
    const off = (v) => armsOf(v).filter((p) => p[0] !== r);
    const pairs = at(a).flatMap((p) => at(b).map((q) => [meetArms(ctx, p[1], q[1]), [...p[2], ...q[2]]]));
    const live = pairs.some((m) => 0 < m[0].length);
    const k = live ? r + 1 : r;
    const arms = [
        ...pairs.flatMap((m) => ranked(ctx, a, r, m[0], m[1])),
        ...at(a).flatMap((p) => ranked(ctx, a, k, spread(ctx, a, off(b), (y) => meetArms(ctx, p[1], y)), p[2])),
        ...at(b).flatMap((q) => ranked(ctx, a, k, spread(ctx, a, off(a), (x) => meetArms(ctx, x, q[1])), q[2])),
    ];
    const rest = meetArms(ctx, armsVal(ctx, a, off(a)), armsVal(ctx, a, off(b)));
    return [...(live ? ranked(ctx, a, r, arms, []) : arms), ...rest];
}
function armsVal(ctx, home, arms) {
    const pegs = arms.map(([r, v, s]) => {
        for (let rI = 0; rI < r; rI++) {
            v = (rI === r - 1 ? s[0] ?? v : v).place(new PrefVal_1.PrefVal({ peg: v }, ctx));
        }
        for (const layer of s) {
            (0, unify_1.ride)(v, layer, undefined);
        }
        return v;
    });
    dedupArms(ctx, pegs, true);
    const kept = pegs.filter((v) => !v.isNil);
    if (1 === kept.length) {
        const one = (0, PrefVal_1.prefInnerPeg)(kept[0]).clone(ctx);
        (0, unify_1.ride)(one, kept[0], undefined);
        return one;
    }
    const out = home.place(new DisjunctVal({ peg: kept }, ctx));
    out.dc = arms.every((p) => type_1.DONE === p[1].dc) ? type_1.DONE : home.dc + 1;
    return out;
}
// Generated output with the number KINDS the JSON loses: `1` and
// `1.0` generate the same digits, and are still different values.
// A member dropped as a duplicate leaves its riders on the survivor, at
// every depth, so the join is as order-free as the meet.
function keepRiders(ctx, keep, drop, sends = true) {
    if (!ridden(drop)) {
        return keep;
    }
    const out = keep.clone(ctx);
    (0, unify_1.ride)(out, keep, drop);
    // The twins' links are both sent only where neither outranks the other.
    sends = sends && !(true === keep.isPref && true === drop.isPref && keep.rank !== drop.rank);
    if (sends) {
        out.flows = (0, PathVal_1.joinFlows)(out.flows, drop.flows);
    }
    if (true === drop.isPref && true !== out.isPref) {
        // A twin of a higher rank holds one more preference layer.
        return keepRiders(ctx, out, drop.peg, sends);
    }
    if (true === out.isBag) {
        for (const k of Object.keys(out.peg)) {
            out.peg[k] = keepRiders(ctx, out.peg[k], drop.peg[k], sends);
        }
    }
    else if (true === out.isPref) {
        out.peg = keepRiders(ctx, out.peg, drop.peg, sends);
    }
    return out;
}
function ridden(v) {
    return null != v.deprecation || null != v.meta || null != v.flows || null != v.reldecl ||
        (true === v.isBag && Object.values(v.peg).some(ridden)) ||
        (true === v.isPref && ridden(v.peg));
}
// Read plain first: values that differ stay apart though an option writes them alike.
function armsAlike(arms, ctx, plain) {
    const gctx = ctx.clone({ err: [], collect: true });
    gctx.plain = plain;
    let first;
    for (let gI = 0; gI < arms.length; gI++) {
        const gout = arms[gI].gen(gctx);
        if (0 < gctx.err.length || undefined === gout) {
            return undefined;
        }
        if (0 === gI) {
            first = gout;
        }
        else if (genShape(arms[gI], gout) !== genShape(arms[0], first)) {
            return undefined;
        }
    }
    return { out: first };
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
}
// An arm that holds a written nil at a member it must have refuses (ruling 54).
function holdsUnmetNil(v) {
    const unmet = (c) => (true === c?.isNil && 'literal_nil' === c.why) || holdsUnmetNil(c);
    return true === v?.isMap ?
        Object.keys(v.peg).some((k) => !v.optionalKeys.includes(k) && unmet(v.peg[k])) :
        true === v?.isList && v.peg.some(unmet);
} /* node:coverage ignore next 8 */
//# sourceMappingURL=DisjunctVal.js.map