"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScalarKindVal = exports.Path = exports.Null = exports.Integer = exports.Float = exports.BigInteger = exports.BigDecimal = exports.String_ = void 0;
exports.kindParent = kindParent;
exports.kindSubsumes = kindSubsumes;
const type_1 = require("../type");
const utility_1 = require("../utility");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
// A ScalarKind for the int64-window exact integers.
class Integer {
}
exports.Integer = Integer;
// A ScalarKind for IEEE-754 binary64 values.
class Float {
}
exports.Float = Float;
// A ScalarKind for the unbounded exact integers, reached only by a `0d`
// literal with no fraction and no exponent.
class BigInteger {
}
exports.BigInteger = BigInteger;
class BigDecimal {
}
exports.BigDecimal = BigDecimal;
// A ScalarKind for null.
class Null {
}
exports.Null = Null;
class Path {
}
exports.Path = Path;
const KIND_PARENT = new Map([
    [Integer, Number],
    [Float, Number],
    [BigInteger, Number],
    [BigDecimal, Number],
]);
// The immediate lattice superior of a kind marker, or undefined when the
// marker's superior is any.
function kindParent(kind) {
    return KIND_PARENT.get(kind);
}
// True when `sub` is `sup`, or sits anywhere below it. The numeric
// lattice is two deep today; walking the chain keeps this correct if it
// ever deepens.
function kindSubsumes(sup, sub) {
    for (let k = sub; null != k; k = KIND_PARENT.get(k)) {
        if (k === sup) {
            return true;
        }
    }
    return false;
}
class ScalarKindVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isScalarKind = true;
        if (null == this.peg) {
            throw new err_1.AontuError('ScalarKindVal spec.peg undefined');
        }
        this.emptyOk = String === this.peg && true === spec.emptyOk;
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        return super.clone(ctx, { emptyOk: this.emptyOk, ...(spec ?? {}) });
    }
    withEmpty(ctx) {
        return this.emptyOk ? this : this.clone(ctx, { emptyOk: true });
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'ScalarKind', this, peer);
        const peerIsScalarVal = peer.isScalar;
        const peerIsScalarKind = peer.isScalarKind;
        let out = this;
        if (peer.isConstraint) {
            // The constraint algebra owns the kind-meets-constraint rules
            // (narrowing, domain checks) -- delegate, so disjunct trials and
            // direct drives agree with the sorted conjunct fold.
            out = peer.unify(this, ctx);
        }
        else if (peerIsScalarVal) {
            let peerKind = peer.kind;
            if (!kindSubsumes(this.peg, peerKind)) {
                out = (0, err_1.makeNilErr)(ctx, 'no_scalar_unify', this, peer);
            }
            else if (String === this.peg) {
                out = this.emptyOk ? peer.withEmpty(ctx) :
                    peer.withNonEmpty(ctx);
            }
            else {
                out = peer;
            }
        }
        else if (peerIsScalarKind) {
            if (this.peg === peer.peg) {
                out = !this.emptyOk && true === peer.emptyOk ? peer : this;
            }
            else if (kindSubsumes(this.peg, peer.peg)) {
                out = peer;
            }
            else if (kindSubsumes(peer.peg, this.peg)) {
                out = this;
            }
            else {
                out = (0, err_1.makeNilErr)(ctx, 'scalar-type', this, peer);
            }
        }
        else {
            out = (0, err_1.makeNilErr)(ctx, 'not-scalar-type', this, peer);
        }
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    get canon() {
        let ctor = this.peg;
        return ctor.name.toLowerCase() + (this.emptyOk ? '&empty()' : '');
    }
    superior() {
        const parent = kindParent(this.peg);
        return null == parent ?
            super.superior() :
            this.place(new ScalarKindVal({ peg: parent }));
    }
    same(peer) {
        let out = peer?.isScalarKind ?
            this.peg === peer?.peg && this.emptyOk === peer?.emptyOk :
            super.same(peer);
        return out;
    }
} /* node:coverage ignore next 20 */
exports.ScalarKindVal = ScalarKindVal;
// The string kind's marker, under a name a module that has its own
// `String` in scope can import.
const String_ = String;
exports.String_ = String_;
//# sourceMappingURL=ScalarKindVal.js.map