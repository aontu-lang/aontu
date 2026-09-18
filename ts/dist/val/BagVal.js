"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagVal = void 0;
exports.sizingResidue = sizingResidue;
exports.bagGenable = bagGenable;
const utility_1 = require("../utility");
const err_1 = require("../err");
const Val_1 = require("./Val");
const NilVal_1 = require("./NilVal");
const FeatureVal_1 = require("./FeatureVal");
const ExpectVal_1 = require("./ExpectVal");
const keyorder_1 = require("../keyorder");
class BagVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isBag = true;
        this.isGenable = true;
        this.closed = false;
        this.optionalKeys = [];
        this.aliasKeys = [];
        // THE NAMES THIS FILE PUBLISHES, read at parse time by a destructure,
        // so they do not travel through unify the way aliasKeys does.
        this.exportKeys = [];
        this.spread = {
            cj: undefined,
        };
    }
    clone(ctx, spec) {
        const bag = super.clone(ctx, spec);
        bag.spread = this.spread;
        return bag;
    }
    handleExpectedVal(key, val, parent, ctx) {
        if (val.isGenable || val.isOp || val.mark.type || val.mark.hide) {
            return val;
        }
        const expectVal = new ExpectVal_1.ExpectVal({ peg: val.isExpect ? val.peg : val }, ctx);
        expectVal.key = key;
        expectVal.parent = parent;
        return expectVal;
    }
    same(peer) {
        if (this === peer) {
            return true;
        }
        if (null == peer || true !== peer.isBag) {
            return false;
        }
        if (this.isMap !== peer.isMap ||
            this.closed !== peer.closed ||
            this.mark.type !== peer.mark.type ||
            this.mark.hide !== peer.mark.hide) {
            return false;
        }
        const scj = this.spread?.cj;
        const pcj = peer.spread?.cj;
        if ((null == scj) !== (null == pcj) ||
            (null != scj && null != pcj && scj.canon !== pcj.canon)) {
            return false;
        }
        const keys = Object.keys(this.peg);
        if (keys.length !== Object.keys(peer.peg).length) {
            return false;
        }
        if (this.optionalKeys.length !== peer.optionalKeys.length ||
            this.optionalKeys.some((k) => !peer.optionalKeys.includes(k))) {
            return false;
        }
        for (const k of keys) {
            const mine = this.peg[k];
            const theirs = peer.peg[k];
            if (null == mine || null == theirs || !mine.same(theirs)) {
                return false;
            }
        }
        return true;
    }
    gen(ctx) {
        let out = this.isMap ? {} : [];
        if ((this.mark.type || this.mark.hide) && true !== ctx?.probe) {
            return undefined;
        }
        let entries = (0, utility_1.items)(this.peg);
        if (this.isMap) {
            entries = entries
                .slice()
                .sort((a, b) => (0, keyorder_1.cmpCodePoint)(String(a[0]), String(b[0])));
        }
        for (let item of entries) {
            const p = item[0];
            const child = item[1];
            if ((child.mark.type || child.mark.hide) && true !== ctx?.probe) {
                continue;
            }
            // An alias declaration contributes no field, and unlike a marked
            // one it is skipped even under `probe`: the probe descends
            // through output marks to check what a `--at` anchor really
            // holds, and an alias is not part of the document at all.
            if (this.aliasKeys.includes('' + p)) {
                continue;
            }
            const optional = this.optionalKeys.includes('' + p);
            // Lists append compactly: a skipped element (hidden, dropped
            // optional) must not leave a hole/null at its index (matches the
            // Go port, which also drops skipped elements).
            const put = (v) => {
                if (this.isMap) {
                    out[p] = v;
                }
                else {
                    out.push(v);
                }
            };
            // Optional unresolved disjuncts are not an error, just dropped.
            if (child.isDisjunct && optional) {
                const dctx = ctx.clone({ err: [], collect: true });
                let cval = child.gen(dctx);
                if (undefined === cval) {
                    continue;
                }
                put(cval);
            }
            else if (bagGenable(child)) {
                const cctx = optional ? ctx.clone({ err: [], collect: true }) : ctx;
                let cval = child.gen(cctx);
                if (optional && (undefined === cval || (0, Val_1.empty)(cval))) {
                    continue;
                }
                // A child that generates nothing contributes nothing: setting
                // `undefined` would leave husk entries like {"q k": undefined}
                // (the Go port also drops such children). Any real failure has
                // already been recorded on ctx and raises below.
                if (undefined === cval) {
                    continue;
                }
                put(cval);
            }
            else if (child.isNil) {
                ctx.adderr(child);
            }
            else if (!optional) {
                const prefix = this.isMap ? 'map' : 'list';
                let code = this.closed ? prefix + 'val_required' : prefix + 'val_no_gen';
                let va = child;
                let vb = undefined;
                if (va.isExpect) {
                    code = prefix + 'val_spread_required';
                    if (va.parent) {
                        vb = new NilVal_1.NilVal({}, ctx);
                        va.parent.place(vb);
                    }
                    va = va.peg;
                }
                const details = { key: p };
                (0, err_1.makeNilErr)(ctx, code, va, vb, undefined, details);
                break;
            }
        }
        return out;
    }
} /* node:coverage ignore next 6 */
exports.BagVal = BagVal;
// A conjunct of exactly one sizing constraint and one container: the
// shape ConstraintVal.admitContainer leaves when its reading is still
// provisional, and the one ConjunctVal.gen knows how to finish. Kept
// here rather than as a flag on the conjunct because it is a question
// about the TERMS, and they can change until the meet converges.
function sizingResidue(v) {
    if (true !== v?.isConjunct || 2 !== v.peg?.length) {
        return undefined;
    }
    const [a, b] = v.peg;
    const con = true === a?.isConstraint ? a :
        true === b?.isConstraint ? b : undefined;
    const bag = true === a?.isConstraint ? b : a;
    return undefined !== con && (true === bag?.isMap || true === bag?.isList) ?
        { con, bag } : undefined;
}
function bagGenable(child) {
    if (true === child.isGraphAtom) {
        return undefined === child.held || bagGenable(child.held);
    }
    // The recursive residual carries its own generation refusal
    // (recursion_unexpanded), which names the schema and the site --
    // the bag's generic residue error would bury both.
    if (true === child.isRecurse) {
        return true;
    }
    return true === child.isScalar
        || true === child.isAbsent
        || true === child.isMap
        || true === child.isList
        || true === child.isPref
        || true === child.isRef
        || true === child.isDisjunct
        || true === child.isNil
        || undefined !== sizingResidue(child);
}
//# sourceMappingURL=BagVal.js.map