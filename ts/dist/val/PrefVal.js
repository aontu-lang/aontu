"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefVal = void 0;
const type_1 = require("../type");
const unify_1 = require("../unify");
const err_1 = require("../err");
const utility_1 = require("../utility");
const top_1 = require("./top");
const FeatureVal_1 = require("./FeatureVal");
class PrefVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPref = true;
        this.isGenable = true;
        this.cjo = 30000;
        // THE GATE AN OVERRIDING PEER MUST PASS IS `superpeg` ITSELF — the
        // preferred value's own KIND, not its family.
        //
        // A preference is a DEFAULT, so a concrete peer replaces it, but only
        // where the peer is the same kind of thing: `*lower(1.1) & a` is a
        // conflict, not an override. The number tower made `integer` and
        // `float` disjoint siblings under `number`, and this gate used to
        // widen to that family — so `*2.2 & 3` worked, and so did
        // `*8080 & 3.5`. Those are ONE rule in two directions; no kind-based
        // gate can keep the first and refuse the second.
        //
        // Refusing both is the choice, because the second is the documented
        // default idiom: `port: *8080 | integer` accepted 3.5 in both ports,
        // silently widening every key written that way from integer to
        // number — the finding §6 of the 2026-08-21 status report calls the
        // most consequential, precisely because docs/skill/examples.md
        // teaches the idiom to agents.
        //
        // What the tightening costs is named rather than hidden: mixing the
        // numeric leaves around a preference is now an error instead of a
        // silent widening. `*1.5 & integer` used to answer `integer` and
        // DISCARD a default that could never apply; it now says so.
        this.rank = 0;
        // this.pref = spec.pref || spec.peg
        // this.superpeg = makeSuper(spec.peg)
        if (spec.peg instanceof PrefVal) {
            this.rank = 1 + spec.peg.rank;
        }
        this.resuper();
        // console.log('PVC', this.peg.canon, this.superpeg.canon)
    }
    // Recompute the type yardstick and the override gate from the current
    // peg. Called again whenever the peg resolves (e.g. a ref).
    resuper() {
        const peg = this.peg;
        // A preference whose peg is ITSELF a kind (`*integer`) constrains
        // nothing: there is no type-of-a-type in this lattice, so any peer
        // wins. (Pinned by test/spec/var.tsv:var-pref-kind-narrow. Before
        // the tower this fell out of a ScalarKindVal's superior being top;
        // now that a leaf kind lifts to `number`, it has to be said.)
        if (true === peg.isScalarKind) {
            this.superpeg = (0, top_1.top)();
            return;
        }
        // No optional chain: superior() is contractually non-null (every
        // Val returns one, a NilVal returning itself), so guarding against
        // nullish here would claim a possibility the type does not have.
        this.superpeg = peg.superior();
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
            // console.log('PREF-RESOLVED', this.peg.canon, '->', resolved)
            this.peg = resolved;
            this.resuper();
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
                // console.log('PREF-PEER',
                //   this.peg.id, this.peg, this.peg.done,
                //   peer.peg.id, peer.peg, peer.peg.done,
                // )
                let peg = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PREF-PEER') }) : ctx, this.peg, peer.peg, 'pref-peer/' + this.id);
                out = new PrefVal({ peg }, ctx);
                // console.log('PREF-RANK-SAME-OUT', peg, peg.done, out, out.done)
                why += 'rank-same';
            }
        }
        else if (!peer.isTop) {
            why += 'super-';
            out = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'SUPER') }) : ctx, this.superpeg, peer, 'pref-super/' + this.id);
            // The peer added nothing beyond a type the preferred value already
            // satisfies (`*1 & integer`, `*1 & number`), so the preference
            // stands. Anything else is a concrete override and wins.
            if (out.same(this.superpeg)) {
                out = this.peg;
                why += 'same';
            }
            // }
        }
        else {
            why += 'none';
        }
        // Every pref result is DONE, including a stuck conjunct from the
        // superior-unify (mirrored by PrefVal.Unify in go/pref.go).
        out.dc = type_1.DONE;
        // console.log('PREFVAL-OUT', why, this.canon, peer.canon, '->', out.canon, out.done)
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
        // out.pref = this.pref.clone(null, ctx)
        return out;
    }
    get canon() {
        // return this.pref instanceof Nil ? this.peg.canon : '*' + this.pref.canon
        return '*' + this.peg.canon;
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
} /* node:coverage ignore next 6 */
exports.PrefVal = PrefVal;
//# sourceMappingURL=PrefVal.js.map