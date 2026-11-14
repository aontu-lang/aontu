"use strict";
/* Copyright (c) 2021-2023 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegerVal = void 0;
const err_1 = require("../err");
const ScalarVal_1 = require("./ScalarVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
const numkind_1 = require("./numkind");
const genwrite_1 = require("./genwrite");
const utility_1 = require("../utility");
class IntegerVal extends ScalarVal_1.ScalarVal {
    get canon() {
        return (0, numkind_1.integerDigits)(this.peg);
    }
    gen(ctx) {
        const peg = this.peg;
        const out = Number.isSafeInteger(peg) ? peg : BigInt(peg);
        return null == this.genopts ? out : (0, genwrite_1.genWrite)(ctx, this, out);
    }
    constructor(spec, ctx) {
        // An IntegerVal must hold a value of *integer kind*: integral AND
        // within the int64 range, so it can never hold something the Go
        // port's int64 storage could not (see isIntegerKind). Every
        // construction site pre-checks with the same helper, so reaching
        // here is a programming error, not user input — hence a throw.
        if (!(0, numkind_1.isIntegerKind)(spec.peg)) {
            throw new err_1.AontuError('not-integer-kind: ' + spec.peg);
        }
        super({ ...spec, kind: ScalarKindVal_1.Integer }, ctx);
        this.isInteger = true;
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Integer', this, peer);
        let out = this;
        if (null != peer) {
            if (peer.isScalarKind || peer.isConstraint) {
                out = peer.unify(this, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'KND') }) : ctx);
            }
            else if (peer.isScalar &&
                peer.kind === this.kind &&
                peer.peg === this.peg) {
                out = this;
            }
            else if (peer.isTop) {
                out = this;
            }
            else {
                out = (0, err_1.makeNilErr)(ctx, 'scalar_' +
                    (peer.kind === this.kind ? 'value' : 'kind'), this, peer);
            }
        }
        else {
            out = super.unify(peer, ctx);
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
} /* node:coverage ignore next 6 */
exports.IntegerVal = IntegerVal;
//# sourceMappingURL=IntegerVal.js.map