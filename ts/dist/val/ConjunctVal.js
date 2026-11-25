"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConjunctVal = exports.bareDirective = void 0;
exports.norm = norm;
exports.holdsRef = holdsRef;
exports.placeTerms = placeTerms;
exports.unmarkedTemplate = unmarkedTemplate;
const type_1 = require("../type");
const err_1 = require("../err");
const unify_1 = require("../unify");
const rider_1 = require("../rider");
const err_2 = require("../err");
const JunctionVal_1 = require("./JunctionVal");
const BagVal_1 = require("./BagVal");
const Val_1 = require("./Val");
const walk_1 = require("../walk");
const utility_1 = require("../utility");
const top_1 = require("./top");
class ConjunctVal extends JunctionVal_1.JunctionVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isConjunct = true;
        this.isGenable = true;
        this.cjo = 40000;
        this.waits = false;
        // One step of an `&` chain as the parser read it, no parenthesis around it yet.
        this.written = false;
        this.own = false;
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
        const carried = [];
        this.peg = norm(this.peg, carried, true === peer.isTop);
        if (true === peer.isData && this.peg.some(sealish)) {
            const alone = this.apart(peer, ctx);
            if (undefined !== alone) {
                return alone;
            }
        }
        // Unify each term of conjunct against peer
        let upeer = [];
        let newtype = this.mark.type || peer.mark.type;
        let newhide = this.mark.hide || peer.mark.hide;
        for (let vI = 0; vI < this.peg.length; vI++) {
            newtype = this.peg[vI].mark.type || newtype;
            newhide = this.peg[vI].mark.hide || newhide;
        }
        for (let vI = 0; vI < this.peg.length; vI++) {
            this.peg[vI].mark.type = newtype;
            this.peg[vI].mark.hide = newhide;
            upeer[vI] = (this.peg[vI].done && peer.isTop) ? this.peg[vI] :
                (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'OWN') }) : ctx, this.peg[vI], peer, 'cj-own');
            upeer[vI].mark.type = newtype = newtype || upeer[vI].mark.type;
            upeer[vI].mark.hide = newhide = newhide || upeer[vI].mark.hide;
            if (upeer[vI].isNil) {
                return upeer[vI];
            }
        }
        upeer = norm(upeer, carried, false);
        // console.log('CONJUNCT-UPEER', this.id, upeer.map((v: Val) => v.canon))
        // Unify terms against each other
        let outvals = [];
        let val;
        let open = false;
        let t0 = upeer[0];
        // next_term:
        for (let pI = 0; pI < upeer.length; pI++) {
            let t1 = upeer[pI + 1];
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
                newtype = this.mark.type || val.mark.type;
                newhide = this.mark.hide || val.mark.hide;
                // A conjunct answer is no progress, unless it is a sizing residue
                // of other terms: a decided disjunction or one level of an
                // expanded recursion is the meet so far.
                const moved = undefined !== (0, BagVal_1.sizingResidue)(val) && !sameTerms(val, t0, t1);
                if (val.isConjunct && !moved &&
                    (!(t0.isDisjunct || t1.isDisjunct) || sameTerms(val, t0, t1))) {
                    open = open || true === val.waits;
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
        if (0 === outvals.length) {
            // Empty conjuncts evaporate.
            out = (0, top_1.top)();
        }
        else if (1 === outvals.length) {
            out = outvals[0];
            out.mark.type = newtype;
            out.mark.hide = newhide;
        }
        else {
            out = new ConjunctVal({ peg: outvals, mark: { type: newtype, hide: newhide } }, ctx);
            out.own = this.own;
            out.site.row = this.site.row;
            out.site.col = this.site.col;
            out.site.url = this.site.url;
            out.site.len = this.site.len;
            out.site.src = this.site.src;
        }
        // A residual still waiting for its definition keeps the meet open.
        out.dc = !open && outvals.every((v) => type_1.DONE === v.dc) ? type_1.DONE : this.dc + 1;
        // A meet flattened in leaves its riders on the whole (ADR-052).
        for (const c of carried) {
            out = (0, unify_1.rideOn)(ctx, out, c, undefined);
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    // A directive's seal covers the place's own terms, not the data's (decision 44): they meet first.
    apart(peer, ctx) {
        if (this.peg.some((t) => t.isRef)) {
            this.own = true;
            const out = new ConjunctVal({ peg: [this, peer] }, ctx);
            out.dc = this.dc + 1;
            out.site = this.site;
            out.path = this.path;
            return out;
        }
        const bags = this.peg.every((t) => sealish(t) || true === t.isMap || true === t.isList);
        return bags ? (0, unify_1.unite)(ctx, this.unify((0, top_1.top)(), ctx), peer, 'cj-apart') : undefined;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        out.own = this.own;
        return out;
    }
    getJunctionSymbol() {
        return '&';
    }
    gen(ctx) {
        const residue = (0, BagVal_1.sizingResidue)(this);
        if (undefined !== residue) {
            const settled = residue.con.settleContainer(residue.bag, ctx);
            return true === settled?.isNil ? undefined : settled.gen(ctx);
        }
        // Unresolved conjunct cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'conjunct', this, // (formatPath(this.peg, this.absolute) as any),
        undefined);
        nil.path = this.path;
        nil.site.url = this.site.url;
        nil.site.row = this.site.row;
        nil.site.col = this.site.col;
        if (null == ctx) {
            throw new err_2.AontuError(nil.msg);
        }
        return undefined;
    }
}
exports.ConjunctVal = ConjunctVal;
function sameTerms(cj, t0, t1) {
    return 2 === cj.peg.length && cj.peg.includes(t0) && cj.peg.includes(t1);
}
const bareDirective = (t) => (true === t.isCloseFunc || true === t.isOpenFunc) && 0 === t.peg.length;
exports.bareDirective = bareDirective;
// A bare directive still to fold, or a bag one sealed.
const sealish = (t) => true === t.isSeal || bareDirective(t) || true === t.dirSealed;
function holdsRef(v) {
    let found = false;
    const seen = new Set();
    const visit = (t) => {
        found = found || true === t.isRef;
        // A default's value is its peg, which the walk reads as a key table.
        if (!found && true === t.peg?.isVal) {
            (0, walk_1.walkVals)(t.peg, visit, seen);
        }
        return !found;
    };
    (0, walk_1.walkVals)(v, visit, seen);
    return found;
}
// A bare directive in the argument of copy, pref or super acts where the value lands, beside the
// call (decision 46); not in a meet with a peer or beside a path, which may hold or read the data.
// An open() leaves only copy's, as the value of pref or super keeps its argument's seals.
function landed(t, lift) {
    if (lift && (true === t.isCopyFunc || true === t.isPrefFunc || true === t.isSuperFunc) &&
        1 === t.peg.length && !holdsRef(t.peg[0])) {
        const inner = placeTerms(t.peg[0]);
        const lifts = (u) => bareDirective(u) && (true === t.isCopyFunc || true === u.isCloseFunc);
        const rest = inner.filter((u) => !lifts(u));
        if (0 < rest.length && rest.length < inner.length) {
            const call = t.make(undefined, {
                peg: [1 === rest.length ? rest[0] : new ConjunctVal({ peg: rest })],
                mark: { type: t.mark.type, hide: t.mark.hide },
            });
            call.site = t.site;
            call.path = t.path;
            return [...inner.filter(lifts), call];
        }
    }
    return [t];
}
// The terms a meet holds at its place, written as a chain or not.
function placeTerms(t) {
    return true === t.isConjunct ? t.peg.flatMap(placeTerms) : landed(t, true);
}
// Normalize Conjunct:
// - flatten child conjuncts
// - consistent sorting of terms
function norm(terms, carried, lift) {
    let expand = [];
    for (const t of terms) {
        if (t.isConjunct && true !== t.own) {
            if ((0, rider_1.rides)(t)) {
                carried.push(t);
            }
            for (const u of t.peg) {
                expand.push(...landed(u, lift));
            }
        }
        else {
            expand.push(...landed(t, lift));
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
    // A repeated waiting match adds nothing, nor a residual met again.
    const seen = new Set();
    return expand.filter((t) => {
        const key = true === t.isRecurse ?
            '\u0000' + t.target.join('\u0000') :
            true === t.isMatchFunc && true !== t.done ? t.canon : undefined;
        return undefined === key || seen.size !== seen.add(key).size;
    });
}
// A spread's template meets each member without the marks written around
// it (ruling 39), through a meet and the other riders; a term rebuilt
// without them keeps its source's identity (spreadId), as members record it.
function unmarkedTemplate(cj, ctx) {
    const t = cj;
    if ((true === t.isHideFunc || true === t.isTypeFunc) && 0 < t.peg.length) {
        return unmarkedTemplate(t.peg[0], ctx);
    }
    const rider = true === t.isMetaFunc || true === t.isDeprecateFunc || true === t.isIdentFunc;
    if (!rider && true !== t.isConjunct) {
        return cj;
    }
    if (undefined === t._unmarked) {
        const peg = rider ? [unmarkedTemplate(t.peg[0], ctx), ...t.peg.slice(1)] :
            t.peg.map((p) => unmarkedTemplate(p, ctx));
        t._unmarked = cj;
        if (peg.some((p, i) => p !== t.peg[i])) {
            t._unmarked = cj.clone(ctx);
            t._unmarked.peg = peg;
            t._unmarked._sid = (0, Val_1.spreadId)(cj);
        }
    }
    return t._unmarked;
} /* node:coverage ignore next 10 */
//# sourceMappingURL=ConjunctVal.js.map