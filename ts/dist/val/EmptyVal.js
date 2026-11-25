"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmptyVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
const ScalarKindVal_1 = require("./ScalarKindVal");
// `empty()` standing apart from a `string`: every string. Written beside
// `string` in one conjunction it is that kind's second word, which the
// parser reads; met any other way it widens nothing (decision 3).
class EmptyVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super({ ...spec, peg: [] }, ctx);
        this.isEmptyConstraint = true;
        this.cjo = 20000;
        this.dc = type_1.DONE;
    }
    unify(peer, ctx) {
        const p = peer;
        if (null == p || true === p.isTop || true === p.isEmptyConstraint) {
            return this;
        }
        if (true === p.isNil) {
            return p;
        }
        if (true === p.isScalarKind && ScalarKindVal_1.String_ === p.peg) {
            return p;
        }
        if (true === p.isString) {
            return p.withEmpty(ctx);
        }
        if (true === p.isConstraint) {
            return p.allowEmpty(ctx, this);
        }
        if (true === p.isConstraintKind) {
            return p.unify(this, ctx);
        }
        return (0, err_1.makeNilErr)(ctx, 'empty_domain', this, peer);
    }
    get canon() {
        return 'empty()';
    }
    same(peer) {
        return true === peer?.isEmptyConstraint;
    }
} /* node:coverage ignore next 5 */
exports.EmptyVal = EmptyVal;
//# sourceMappingURL=EmptyVal.js.map