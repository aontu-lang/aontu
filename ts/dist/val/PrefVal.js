"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefVal = void 0;
exports.prefInnerPeg = prefInnerPeg;
const type_1 = require("../type");
const unify_1 = require("../unify");
const err_1 = require("../err");
const utility_1 = require("../utility");
const top_1 = require("./top");
const FeatureVal_1 = require("./FeatureVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const SuperFuncVal_1 = require("./SuperFuncVal");
const DisjunctVal_1 = require("./DisjunctVal");
const genrec_1 = require("../genrec");
function prefInnerPeg(v) {
    let out = v;
    while (true === out?.isPref) {
        out = out.peg;
    }
    return out;
}
class PrefVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPref = true;
        this.isGenable = true;
        this.cjo = 30000;
        this.rank = 0;
        if (spec.peg instanceof PrefVal) {
            this.rank = 1 + spec.peg.rank;
        }
        this.resuper(ctx);
    }
    resuper(ctx) {
        let peg = this.peg;
        while (true === peg?.isPref) {
            peg = peg.peg;
        }
        const base = (0, SuperFuncVal_1.superOf)(ctx, peg);
        // A gate that a meet has already narrowed stays narrowed: the
        // override space only ever shrinks.
        this.superpeg = null == this.narrowed ? base
            : (0, unify_1.unite)(ctx, base, this.narrowed, 'pref-narrow/' + this.id);
    }
    restand(met, ctx, alone) {
        let out = met;
        for (let rI = 0; rI <= this.rank; rI++) {
            out = new PrefVal({ peg: out }, ctx);
        }
        out.alone = alone ?? this.alone ?? prefInnerPeg(this);
        return this.place(out);
    }
    // A peer of one rank meets the override space too: either's bound holds.
    overMet(peer, met, ctx) {
        const gate = this.superpeg.canon === peer.superpeg.canon ? this.superpeg :
            (0, FuncBaseVal_1.trialUnify)(ctx, this.superpeg.clone(ctx), peer.superpeg);
        if (undefined === gate || met.superpeg.canon === gate.canon) {
            return met;
        }
        const stood = this.restand(prefInnerPeg(met), ctx, met.alone);
        stood.narrowed = gate;
        stood.superpeg = gate;
        return stood;
    }
    // Ruling 40: the parent arm lifts the default as read on its own.
    parentArm(ctx) {
        const alone = this.alone ?? prefInnerPeg(this);
        const own = (0, FuncBaseVal_1.trialUnify)(ctx.holdArm(this.path, alone, undefined, true), alone.clone(ctx), (0, top_1.top)());
        return undefined === own ? this.superpeg.clone(ctx) :
            (0, unify_1.unite)(ctx, (0, SuperFuncVal_1.superOf)(ctx, own), this.superpeg.clone(ctx), 'pref/lift');
    }
    // Unchanged on both counts is the SAME preference, returned as
    // itself: minting a new one every pass would keep the fixpoint
    // moving for ever.
    stand(met, gate, ctx) {
        if (met.same(prefInnerPeg(this)) && gate.same(this.superpeg)) {
            return this;
        }
        const stood = this.restand(met, ctx);
        stood.narrowed = gate;
        stood.superpeg = gate;
        return stood;
    }
    // Scalar defaults of one rank meet as the disjunctions they stand
    // for: each stands only where the other's override space admits it.
    meetPref(peer, ctx) {
        const gate = (0, FuncBaseVal_1.trialUnify)(ctx, this.superpeg.clone(ctx), peer.superpeg.clone(ctx));
        if (undefined === gate) {
            return (0, err_1.makeNilErr)(ctx, 'empty', this, peer, 'unify');
        }
        const strongMet = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), peer.superpeg.clone(ctx));
        const weakMet = (0, FuncBaseVal_1.trialUnify)(ctx, this.superpeg.clone(ctx), prefInnerPeg(peer).clone(ctx));
        if (undefined !== strongMet && undefined !== weakMet) {
            const peg = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), prefInnerPeg(peer));
            return undefined === peg
                ? (0, err_1.makeNilErr)(ctx, 'pref_rank_clash', this, peer, 'unify')
                : this.stand(peg, gate, ctx);
        }
        return undefined !== strongMet ? this.stand(strongMet, gate, ctx)
            : undefined !== weakMet ? peer.stand(weakMet, gate, ctx)
                : gate;
    }
    // PrefVal unify always returns a PrefVal
    // PrefVals can only be removed by becoming Nil in a Disjunct
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Pref', this, peer);
        let out = this;
        let why = '';
        if (!this.peg.done && !(true === ctx.settle && 0 < this.dc)) {
            const rctx = (te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx)
                .holdArm(this.path, prefInnerPeg(this));
            // A default its peers have met that dies once its paths read
            // leaves the parent arm, as `x | super(x)` does.
            if (null != this.narrowed && undefined === (0, FuncBaseVal_1.trialUnify)(rctx, this.peg.clone(ctx), (0, top_1.top)())) {
                out = (0, unify_1.unite)(ctx, this.parentArm(ctx), (0, top_1.top)(), 'pref/over');
                (0, utility_1.explainClose)(te, out);
                return out;
            }
            this.peg = (0, unify_1.unite)(rctx, this.peg, (0, top_1.top)(), 'pref/resolve');
            this.resuper(ctx);
        }
        // `*nil` is `nil | super(nil)`: no arm holds a value, as in `nil | nil`.
        const inner = prefInnerPeg(this);
        if (true === inner.isNil && 'literal_nil' === inner.why) {
            const err = (0, err_1.makeNilErr)(ctx, 'empty', this, peer, 'unify');
            (0, utility_1.explainClose)(te, err);
            return err;
        }
        if (peer instanceof PrefVal) {
            why += 'pref-';
            if (this.id === peer.id) {
                out = this;
                why += 'same';
            }
            // Avoid MAXCYCLE errors
            else if (this.peg.id === peer.peg.id) {
                out = this.overMet(peer, this, ctx);
                why += 'same-peg';
            }
            else if (this.rank !== peer.rank) {
                out = (0, DisjunctVal_1.meetRanked)(ctx, this, peer);
                (0, utility_1.explainClose)(te, out);
                return out;
            }
            else if (true === prefInnerPeg(this).isScalar &&
                true === prefInnerPeg(peer).isScalar) {
                out = this.meetPref(peer, ctx);
                why += 'gated';
            }
            else {
                const peg = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), prefInnerPeg(peer));
                out = undefined === peg
                    ? (0, err_1.makeNilErr)(ctx, 'pref_rank_clash', this, peer, 'unify')
                    : this.overMet(peer, this.restand(peg, ctx, peg.clone(ctx)), ctx);
                why += 'rank-same';
            }
        }
        else if (true === peer.isDisjunct) {
            out = (0, DisjunctVal_1.meetRanked)(ctx, this, peer);
            (0, utility_1.explainClose)(te, out);
            return out;
        }
        else if (!peer.isTop) {
            why += 'super-';
            const met = (0, FuncBaseVal_1.trialUnify)(ctx.holdArm(this.path, prefInnerPeg(this), peer), prefInnerPeg(this).clone(ctx), peer);
            if (undefined !== met) {
                // An override space the peer empties leaves the preference
                // standing with nothing left to replace it, not a conflict.
                const space = (0, FuncBaseVal_1.trialUnify)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'GATE') }) : ctx, this.superpeg.clone(ctx), peer);
                const gate = undefined !== space ? space : this.superpeg;
                out = this.stand(met, gate, ctx);
                why += 'stands';
                (0, utility_1.explainClose)(te, out);
                out.dc = met.done || true === ctx.settle ? type_1.DONE : this.dc + 1;
                return out;
            }
            // The override arm is trialled too: its failure is not the
            // answer, it is half of the reason the answer is `empty`, and a
            // recorded `no_scalar_unify` would be the code the reader sees
            // however the refusal is relabelled afterwards.
            const over = (0, FuncBaseVal_1.trialUnify)(ctx, this.parentArm(ctx), peer);
            out = undefined !== over ? over
                // A peer that arrived already failed keeps its own refusal:
                // that is its failure, not the default's.
                : peer.isNil ? peer
                    : (0, err_1.makeNilErr)(ctx, 'empty', this, peer, 'unify');
            // }
        }
        else {
            why += 'none';
        }
        // Every pref result is DONE (as in go/pref.go), but one whose own
        // value still waits, as a reference may: until the settling pass.
        const waits = peer.isTop ? !this.peg.done :
            true === out.isPref && !prefInnerPeg(out).done;
        out.dc = waits && true !== ctx.settle ? this.dc + 1 : type_1.DONE;
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    same(peer) {
        if (null == peer) {
            return false;
        }
        let pegsame = (this.peg === peer.peg) ||
            (this.peg.isVal && this.peg.same(peer.peg));
        return pegsame;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        if (null != this.narrowed) {
            out.narrowed = this.narrowed;
            out.superpeg = this.superpeg;
        }
        out.alone = this.alone;
        if (true === spec?.dup && true === this.peg?.isVal) {
            out.peg = this.peg.clone(ctx, { dup: true });
        }
        return out;
    }
    get canon() {
        // return this.pref instanceof Nil ? this.peg.canon : '*' + this.pref.canon
        return '*' + (0, utility_1.canonRiders)(this.peg);
    }
    gen(ctx) {
        let val = this.peg;
        if (val.isNil) {
            if (null == ctx) {
                throw new err_1.AontuError(val.msg);
            }
        }
        return null == this.genrec ? val.gen(ctx) : (0, genrec_1.genHeld)(ctx, this);
    }
} /* node:coverage ignore next 7 */
exports.PrefVal = PrefVal;
//# sourceMappingURL=PrefVal.js.map