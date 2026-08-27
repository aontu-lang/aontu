"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConjunctVal = void 0;
exports.norm = norm;
const type_1 = require("../type");
const err_1 = require("../err");
const unify_1 = require("../unify");
const err_2 = require("../err");
const JunctionVal_1 = require("./JunctionVal");
const BagVal_1 = require("./BagVal");
const utility_1 = require("../utility");
const top_1 = require("./top");
// TODO: move main logic to op/conjunct
class ConjunctVal extends JunctionVal_1.JunctionVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isConjunct = true;
        this.isGenable = true;
        this.cjo = 40000;
        this.mark.type = !!spec.mark?.type;
        this.mark.hide = !!spec.mark?.hide;
        this.peg = (Array.isArray(this.peg) ? this.peg : [])
            .filter((p) => null != p && p.isVal);
        this.peg?.map((v) => {
            (0, utility_1.propagateMarks)(this, v);
            return v;
        });
        // console.log('CONJUNCT-ctor', this.peg.map((v: Val) => v.canon))
    }
    // NOTE: mutation!
    append(peer) {
        super.append(peer);
        (0, utility_1.propagateMarks)(this, peer);
        return this;
    }
    unify(peer, ctx) {
        peer = peer ?? (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Conjunct', this, peer);
        let done = true;
        this.peg = norm(this.peg);
        // console.log('\nCONJUNCT', ctx.cc, this.id, this.canon, peer.id, peer.canon)
        // Unify each term of conjunct against peer
        let upeer = [];
        let newtype = this.mark.type || peer.mark.type;
        let newhide = this.mark.hide || peer.mark.hide;
        for (let vI = 0; vI < this.peg.length; vI++) {
            // console.log('CONJUNCT-peg', vI, this.peg[vI].canon, this.peg[vI].mark)
            newtype = this.peg[vI].mark.type || newtype;
            newhide = this.peg[vI].mark.hide || newhide;
        }
        for (let vI = 0; vI < this.peg.length; vI++) {
            this.peg[vI].mark.type = newtype;
            this.peg[vI].mark.hide = newhide;
            // console.log('CONJUNCT-TERM', this.id, vI, this.peg[vI].canon)
            upeer[vI] = (this.peg[vI].done && peer.isTop) ? this.peg[vI] :
                (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'OWN') }) : ctx, this.peg[vI], peer, 'cj-own');
            upeer[vI].mark.type = newtype = newtype || upeer[vI].mark.type;
            upeer[vI].mark.hide = newhide = newhide || upeer[vI].mark.hide;
            // let prevdone = done
            done = done && (type_1.DONE === upeer[vI].dc);
            if (upeer[vI].isNil) {
                return upeer[vI];
                // return Nil.make(
                //   ctx,
                //   '&peer[' + upeer[vI].canon + ',' + peer.canon + ']',
                //   this.peg[vI],
                //   peer
                // )
            }
        }
        upeer = norm(upeer);
        // console.log('CONJUNCT-UPEER', this.id, upeer.map((v: Val) => v.canon))
        // Unify terms against each other
        let outvals = [];
        let val;
        let t0 = upeer[0];
        // next_term:
        for (let pI = 0; pI < upeer.length; pI++) {
            let t1 = upeer[pI + 1];
            // console.log('CONJUNCT-TERMS-C', ctx.cc, this.id, pI, t0.id, t0.canon, t1?.id, t1?.canon, 'OV=', outvals.map((v: Val) => v.canon))
            if (null == t1) {
                outvals.push(t0);
                newtype = this.mark.type || t0.mark.type;
                newhide = this.mark.hide || t0.mark.hide;
            }
            // Can't unite with a RefVal, unless also a RefVal with same path.
            // else if (t0 instanceof RefVal && !(t1 instanceof RefVal)) {
            else if (t0.isRef && !(t1.isRef)) {
                outvals.push(t0);
                t0 = t1;
            }
            else if (t1.isRef && !(t0.isRef)) {
                outvals.push(t0);
                t0 = t1;
            }
            else {
                val = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'DEF') }) : ctx, t0, t1, 'cj-peer-t0t1');
                // console.log('CONJUNCT-T', t0.canon, t1?.canon, '->', val.canon)
                done = done && type_1.DONE === val.dc;
                newtype = this.mark.type || val.mark.type;
                newhide = this.mark.hide || val.mark.hide;
                // Unite was just a conjunt anyway, so discard.
                if (val.isConjunct) {
                    outvals.push(t0);
                    t0 = t1;
                }
                else if (val.isNil) {
                    return val;
                }
                else {
                    t0 = val;
                }
            }
        }
        let out;
        // console.log('CONJUCT-prepout', this.id, outvals.map((v: Val) => v.canon))
        if (0 === outvals.length) {
            // Empty conjuncts evaporate.
            out = (0, top_1.top)();
        }
        // TODO: corrects CV[CV[1&/x]] issue above, but swaps term order!
        else if (1 === outvals.length) {
            out = outvals[0];
            out.mark.type = newtype;
            out.mark.hide = newhide;
        }
        else {
            out = new ConjunctVal({ peg: outvals, mark: { type: newtype, hide: newhide } }, ctx);
        }
        out.dc = done ? type_1.DONE : this.dc + 1;
        // console.log('CONJUNCT-unify', this.id, sc, pc, '->', out.canon, 'D=' + out.dc, 'E=', this.err)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        return out;
    }
    getJunctionSymbol() {
        return '&';
    }
    gen(ctx) {
        // A RESIDUATED SIZING ATOM DECIDES HERE (the review's finding C,
        // use-cases/BUGS.md §16). `length`/`unique` over a container keep
        // the readings that MORE MEMBERS COULD STILL CHANGE -- an upper
        // bound satisfied, a lower bound violated, distinctness so far --
        // rather than deciding against whatever the container held when it
        // first settled (ConstraintVal.admitContainer). Generation is where
        // no more members can arrive, so it is where the provisional
        // reading becomes the verdict: the container generates if the atom
        // is satisfied, and the atom's OWN refusal is raised if it is not.
        //
        // Without this the conjunct would report `conjunct` for a document
        // whose only fault is a length -- the constraint's message is the
        // one the author needs.
        const residue = (0, BagVal_1.sizingResidue)(this);
        if (undefined !== residue) {
            const settled = residue.con.settleContainer(residue.bag, ctx);
            return true === settled?.isNil ? undefined : settled.gen(ctx);
        }
        // Unresolved conjunct cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'conjunct', this, // (formatPath(this.peg, this.absolute) as any),
        undefined);
        // TODO: refactor to use Site
        nil.path = this.path;
        nil.site.url = this.site.url;
        nil.site.row = this.site.row;
        nil.site.col = this.site.col;
        // descErr(nil, ctx)
        if (null == ctx) {
            throw new err_2.AontuError(nil.msg);
        }
        return undefined;
    }
}
exports.ConjunctVal = ConjunctVal;
// Normalize Conjunct:
// - flatten child conjuncts
// - consistent sorting of terms
function norm(terms) {
    let expand = [];
    for (let tI = 0, pI = 0; tI < terms.length; tI++, pI++) {
        if (terms[tI].isConjunct) {
            const cterms = terms[tI].peg;
            for (let cI = 0; cI < cterms.length; cI++) {
                expand[pI + cI] = cterms[cI];
            }
            pI += cterms.length - 1;
        }
        else {
            expand[pI] = terms[tI];
        }
    }
    // Consistent ordering ensures order independent unification.
    // Skip sort when already in order (common case).
    let sorted = true;
    for (let i = 1; i < expand.length; i++) {
        if (expand[i - 1].cjo > expand[i].cjo) {
            sorted = false;
            break;
        }
    }
    if (!sorted) {
        expand.sort((a, b) => a.cjo - b.cjo);
    }
    // console.log('NORM', expand.map(t => t.canon).join(', '))
    return expand;
} /* node:coverage ignore next 7 */
//# sourceMappingURL=ConjunctVal.js.map