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
// TODO: move main logic to op/disjunct
class DisjunctVal extends JunctionVal_1.JunctionVal {
    // TODO: sites from normalization of orginal Disjuncts, as well as child pegs
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
        // // // console.log('DISJUNCT-unify-A', this.id, this.canon)
        let done = true;
        let oval = [];
        // Conjunction (&) distributes over disjunction (|).
        //
        // Each member is tried against peer in isolation: if that trial
        // produces any errors, the member fails and is marked with a NilVal.
        // Previously this used `ctx?.clone({err: []})` per member - a
        // per-iteration context clone (two Object.creates) just to hold a
        // throwaway error array. For schemas with many disjunctions
        // (e.g. `*true | boolean`, `method: GET | PUT | ...`) this was the
        // single largest source of clones in the unify hot path.
        //
        // Swap-and-restore avoids the clone: the existing ctx's err array
        // is saved, replaced with a fresh array for each trial, then
        // restored. ctx mutation is scoped to this loop and fully undone
        // before return.
        const savedErr = ctx.err;
        const savedTrialMode = ctx._trialMode;
        // A MEMBER'S TYPE FLOW IS PART OF THAT MEMBER. `refer(t)`/`rel(t)`
        // assert `t` on ANOTHER node, and the assertion may only take
        // effect if the member that makes it survives: committing every
        // member's flow puts `t_A & t_B` on the target, which no reading
        // of `A | B` licenses and which leaves the target MORE constrained
        // than either alternative. The flow record is therefore staged per
        // trial, like `ctx.err`, and only the survivors' records are
        // merged into the real one below.
        const savedFlows = ctx.referflows;
        const staged = [];
        // C1-inner: tell `makeNilErr` to return TRIAL_NIL in this scope
        // instead of allocating per-failure NilVals. Save/restore so
        // nested DisjunctVal trials (and the outer non-trial code) are
        // not affected. The restore lives in `finally`: if a trial throws,
        // leaving ctx._trialMode=true would collapse every subsequent real
        // error in this ctx to the shared TRIAL_NIL sentinel.
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
                    // C1: failed-trial marker is never user-visible — it just
                    // signals "this disjunct member doesn't match" and is
                    // filtered out before the result is built. Use the shared
                    // sentinel instead of allocating a fresh NilVal per trial.
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
            // THE ADMISSION GATE (ADR-004). A peer that meets a preference
            // INSIDE a disjunction must be admitted by the disjunction: by
            // some sibling alternative (whose own trial above already
            // answers that), or by the preferred value itself (the pref
            // branch's own admitted set). The pref's kind gate alone used to
            // decide, so a same-kind concrete peer replaced the default with
            // the alternatives never consulted -- `k:*'auto'|'literal'|'data'`
            // plus `k:'autoo'` answered "autoo", and `*8080|(integer&neq(80))`
            // admitted 80 (use-cases/BUGS.md §1-2). An inadmissible override
            // now fails the pref member's trial, and when every member is
            // gone the meet is the existing `empty` refusal.
            //
            // SCALAR preferred values only, exactly the kind gate's own
            // boundary (test/spec/pref.tsv, "THE GATE IS A SCALAR GATE"): a
            // structural or kind-peg default stays ungated. A deliberately
            // open default remains spellable as `*x|top` -- the top branch
            // admits every override (the apidef machine-emitted idiom).
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
            ctx._trialMode = savedTrialMode;
            ctx.err = savedErr;
            ctx.referflows = savedFlows;
        }
        // // // console.log('DISJUNCT-unify-B', this.id, oval.map(v => v.canon))
        // A PREFERENCE CONJOINED WITH A DISJUNCTION IS A PREFERENCE ON THE
        // ALTERNATIVE IT NAMES: `(A|B) & *A` is `*A|B`, the same value the
        // direct spelling `*A|B` denotes. Distribution carries the peer to
        // each member, and a scalar preference meeting a concrete same-kind
        // member is replaced BY that member (the kind gate) -- so the
        // preference simply vanished, and `specversion: ("1.0"|"1.1") &
        // *"1.0"`, the enum-with-default written the other way round, held
        // no default at all. The old generation fold hid it by folding the
        // members together; ADR-007 does not, and a disjunction that has
        // lost its default is not the value the author wrote.
        //
        // A preference naming no alternative is dropped, as it is today: it
        // has nothing to prefer, and the default-validity lint is what
        // reports that shape.
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
                        oval[kI] = NilVal_1.TRIAL_NIL;
                        continue;
                    }
                    // TWO PREFERENCES OVER ONE VALUE ARE ONE PREFERENCE, and
                    // the lower rank is the one that generates: `*1 | **1` is
                    // `*1`. Ranking folds EQUAL ranks (R2); this folds the rest,
                    // which R5 stopped discarding.
                    //
                    // A PLAIN arm holding that same value is NOT a duplicate of
                    // it and must not be folded away: it is the sibling that
                    // ADMITS an override under ADR-004's gate, which is the
                    // whole point of writing `*x | x`. Folding it turned that
                    // idiom's own default into a `pref_not_instance` finding,
                    // and `*top | top` is pinned as its control.
                    const a = oval[vI];
                    const b = oval[kI];
                    if (true === a.isPref && true === b.isPref
                        && (0, PrefVal_1.prefInnerPeg)(a).same((0, PrefVal_1.prefInnerPeg)(b))) {
                        if (a.rank <= b.rank) {
                            oval[kI] = NilVal_1.TRIAL_NIL;
                        }
                        else {
                            oval[vI] = NilVal_1.TRIAL_NIL;
                            break;
                        }
                    }
                }
            }
            // // // console.log('DISJUNCT-unify-D', this.id, oval.map(v => v.canon))
        }
        // THE SURVIVORS' FLOWS, AND ONLY THEIRS. Members knocked out by
        // the trial, by the admission gate or by the dedup above are all
        // nil here, so this runs after every one of those and before the
        // filter that drops them.
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
            // A NARROWED DISJUNCTION IS STILL THAT DISJUNCTION. The meet mints
            // a fresh value, which used to arrive unsited and file-less -- so
            // every finding naming a disjunction that had met anything
            // pointed at row -1 with no file, and an agent handed the report
            // had nowhere to go (the review's finding F). `place` copies the
            // whole site, position and url together, which is what tells the
            // report which document it came from.
            this.place(out);
        }
        out.dc = done ? type_1.DONE : this.dc + 1;
        // // // console.log('DISJUNCT-unify',
        //   this.id, sc, pc, '->', out.canon, 'D=' + out.dc, 'E=', this.err)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    // RANK ORDERS THE SURVIVORS, IT DOES NOT DISCARD AT PARSE (ADR-011
    // R5, docs/design/DEFAULTS.0.md). Every rank is KEPT here, and
    // generation takes the lowest-rank preference still standing -- so
    // eliminating the lower arm PROMOTES the next instead of taking the
    // whole ladder with it. This ran once, before the member trials,
    // and discarded every arm but the lowest: `*1 | **2` met by
    // `neq(1)` lost the default entirely and refused, where the ladder
    // exists precisely to answer 2. Rank is a preference order over
    // WHAT SURVIVES, which is not knowable until the trials have run.
    //
    // Only EQUAL ranks fold, because two defaults at one rank are one
    // decision: compatible pegs merge, and a disagreement is the
    // `pref_rank_clash` refusal (R2), which belongs to the whole
    // disjunction -- there is no alternative to fall back to.
    //
    // Answers the sole surviving preference when the disjunction holds
    // exactly one -- which the RECURSIVE call below consumes to lift a
    // nested disjunct's winner into this one -- or the clash refusal.
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
    // AN UNRESOLVED DISJUNCTION IS NOT A VALUE (ADR-007).
    //
    // Generation used to FOLD the surviving members together with unify
    // and emit the result. That answer is in no branch of the
    // disjunction: `({x:1}|{y:2}) & {z:3}` generated `{x:1,y:2,z:3}`, a
    // map the model never admits, and `1|2` died as a scalar_value
    // CONFLICT -- the conflict of the fold, not of anything the author
    // wrote. The second half is what made vet decorative: vet's
    // incompleteness check keeps incomplete-class findings, so a missing
    // required enum field (`role: 'a'|'b'` with no data) arrived as a
    // conflict, was filtered out, and vetted VALID with zero findings
    // (use-cases/BUGS.md §13, the review's finding C).
    //
    // What remains after unification is what the model still admits, so
    // more than one surviving alternative means the truth is not yet
    // settled -- incomplete, the same class a bare `string` residue
    // answers, and the same answer CUE gives for a non-concrete export.
    // A preference resolves it (that is what `*` is for), and so does a
    // single surviving member.
    gen(ctx) {
        if (0 < this.peg.length) {
            // Ranking may not have run when gen is reached without a prior
            // unify (a library caller generating a freshly parsed tree), and
            // it is what guarantees at most one preference stands here.
            if (!this.prefsRanked) {
                this.rankPrefs(ctx);
            }
            const prefs = this.peg.filter((v) => v instanceof PrefVal_1.PrefVal);
            // ALTERNATIVES THAT GENERATE THE SAME VALUE ARE RESOLVED
            // (ADR-007's rule, asked at the moment it matters): `[] | [&:
            // T]` met by an empty list keeps both arms -- they differ as
            // SCHEMAS, which is what stops the dedup collapsing the
            // template away (BUGS.md §52 regime 4) -- but both generate
            // the empty list, and one generated value is one value.
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
                        allSame = (0, exactjson_1.exactJSON)(gout) === (0, exactjson_1.exactJSON)(firstOut);
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
            // THE LOWEST-RANK SURVIVOR (R5). Ranking no longer discards the
            // weaker arms, so the choice is made here, over what is left:
            // `*1 | **2` answers 1, and answers 2 once `*1` is gone.
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
} /* node:coverage ignore next 8 */
exports.DisjunctVal = DisjunctVal;
//# sourceMappingURL=DisjunctVal.js.map