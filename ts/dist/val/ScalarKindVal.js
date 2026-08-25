"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScalarKindVal = exports.Null = exports.Integer = exports.Float = exports.BigInteger = exports.BigDecimal = void 0;
exports.kindParent = kindParent;
exports.kindSubsumes = kindSubsumes;
const type_1 = require("../type");
const utility_1 = require("../utility");
const err_1 = require("../err");
// import { BaseVal } from './BaseVal'
const FeatureVal_1 = require("./FeatureVal");
// Kind markers.
//
// A ScalarKindVal's canon is its marker's constructor name, lowercased,
// so these class names are load-bearing language surface: `Integer` is
// the keyword `integer`, `Float` is the keyword `float`.
//
// The numeric part of the lattice is a pure supertype over disjoint
// leaves:
//
//   number                       (the global Number constructor)
//   |- integer     Integer       int64-window exact
//   |- float       Float         IEEE-754 binary64
//   |- biginteger  BigInteger    exact, opt-in via 0d
//   |- bigdecimal  BigDecimal    exact, opt-in via 0d
//
// The global `Number` constructor is the marker for the SUPERTYPE only:
// no concrete ScalarVal ever carries it. A binary64 value is FLOAT kind
// (NumberVal is the binary64 leaf; the class name is historical).
//
// A ScalarKindVal for `number` matches a concrete value of any numeric
// leaf, and meeting it with a leaf yields that leaf. Two distinct leaves
// are disjoint sets with no common lower bound, so they do not unify.
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
// A ScalarKind for the exact base-10 decimals, reached only by a `0d`
// literal carrying a `.` or an exponent.
class BigDecimal {
}
exports.BigDecimal = BigDecimal;
// A ScalarKind for null.
class Null {
}
exports.Null = Null;
// The immediate lattice parent of each kind marker. A marker absent from
// this table sits directly under top (string, boolean, null -- and
// `number` itself, which is the root of the numeric family).
//
// Adding a leaf is one row.
const KIND_PARENT = new Map([
    [Integer, Number],
    [Float, Number],
    [BigInteger, Number],
    [BigDecimal, Number],
]);
// The immediate lattice superior of a kind marker, or undefined when the
// marker's superior is top.
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
// class ScalarKindVal extends BaseVal {
class ScalarKindVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isScalarKind = true;
        if (null == this.peg) {
            throw new err_1.AontuError('ScalarKindVal spec.peg undefined');
        }
        this.dc = type_1.DONE;
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
            // A kind admits a concrete value of that kind, or of any kind
            // below it: `float & 1.5` is 1.5, and `number & 1` is 1 because
            // integer sits under number.
            if (kindSubsumes(this.peg, peerKind)) {
                out = peer;
            }
            else {
                out = (0, err_1.makeNilErr)(ctx, 'no_scalar_unify', this, peer);
            }
        }
        else if (peerIsScalarKind) {
            // The meet of two kinds is the narrower one when they are
            // comparable. Distinct leaves (float & integer) are disjoint sets
            // of values, so they have no common lower bound and fail.
            if (this.peg === peer.peg) {
                out = this;
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
        // console.log('SCALARKINDVAL', this.canon.peer.canon, '->', out.canon)
        return out;
    }
    get canon() {
        let ctor = this.peg;
        return ctor.name.toLowerCase();
    }
    // The super() ladder: a leaf kind lifts to its parent kind
    // (super(integer) -> number, super(float) -> number), and a kind with
    // no parent lifts to top (super(number) -> top). A concrete value
    // lifts to its own leaf via ScalarVal.superior.
    superior() {
        const parent = kindParent(this.peg);
        return null == parent ?
            super.superior() :
            this.place(new ScalarKindVal({ peg: parent }));
    }
    same(peer) {
        let out = peer?.isScalarKind ? this.peg === peer?.peg : super.same(peer);
        return out;
    }
} /* node:coverage ignore next 15 */
exports.ScalarKindVal = ScalarKindVal;
//# sourceMappingURL=ScalarKindVal.js.map