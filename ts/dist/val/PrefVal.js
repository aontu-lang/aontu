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
    restand(met, ctx) {
        let out = met;
        for (let rI = 0; rI <= this.rank; rI++) {
            out = new PrefVal({ peg: out }, ctx);
        }
        return this.place(out);
    }
    // PrefVal unify always returns a PrefVal
    // PrefVals can only be removed by becoming Nil in a Disjunct
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Pref', this, peer);
        let out = this;
        let why = '';
        if (!this.peg.done) {
            const resolved = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx, this.peg, (0, top_1.top)(), 'pref/resolve');
            this.peg = resolved;
            this.resuper(ctx);
        }
        if (peer instanceof PrefVal) {
            why += 'pref-';
            if (this.id === peer.id) {
                out = this;
                why += 'same';
            }
            // Avoid MAXCYCLE errors
            else if (this.peg.id === peer.peg.id) {
                out = this;
                why += 'same-peg';
            }
            else if (this.rank < peer.rank) {
                out = this;
                why += 'rank-win';
            }
            else if (peer.rank < this.rank) {
                out = peer;
                why += 'rank-lose';
            }
            else {
                const peg = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), prefInnerPeg(peer));
                out = undefined === peg
                    ? (0, err_1.makeNilErr)(ctx, 'pref_rank_clash', this, peer, 'unify')
                    : this.restand(peg, ctx);
                why += 'rank-same';
            }
        }
        else if (!peer.isTop) {
            why += 'super-';
            const met = (0, FuncBaseVal_1.trialUnify)(ctx, prefInnerPeg(this).clone(ctx), peer);
            if (undefined !== met) {
                const gate = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'GATE') }) : ctx, this.superpeg.clone(ctx), peer, 'pref-gate/' + this.id);
                // Unchanged on both counts is the SAME preference, returned as
                // itself: minting a new one every pass would keep the fixpoint
                // moving for ever.
                if (met.same(prefInnerPeg(this)) && gate.same(this.superpeg)) {
                    out = this;
                }
                else {
                    const stood = this.restand(met, ctx);
                    stood.narrowed = gate;
                    stood.superpeg = gate;
                    out = stood;
                }
                why += 'stands';
                (0, utility_1.explainClose)(te, out);
                out.dc = type_1.DONE;
                return out;
            }
            // The override arm is trialled too: its failure is not the
            // answer, it is half of the reason the answer is `empty`, and a
            // recorded `no_scalar_unify` would be the code the reader sees
            // however the refusal is relabelled afterwards.
            const over = (0, FuncBaseVal_1.trialUnify)(ctx, this.superpeg.clone(ctx), peer);
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
        // Every pref result is DONE, including a stuck conjunct from the
        // superior-unify (mirrored by PrefVal.Unify in go/pref.go).
        out.dc = type_1.DONE;
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
        return val.gen(ctx);
    }
} /* node:coverage ignore next 7 */
exports.PrefVal = PrefVal;
//# sourceMappingURL=PrefVal.js.map