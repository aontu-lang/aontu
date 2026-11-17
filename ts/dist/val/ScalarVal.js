"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScalarVal = void 0;
const type_1 = require("../type");
const utility_1 = require("../utility");
const err_1 = require("../err");
const Val_1 = require("./Val");
const ScalarKindVal_1 = require("./ScalarKindVal");
const genwrite_1 = require("./genwrite");
class ScalarVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isScalar = true;
        this.isGenable = true;
        this.kind = spec.kind;
        this.src = spec.src ?? '';
        this.dc = type_1.DONE;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, {
            peg: this.peg,
            kind: this.kind,
            ...(spec || {})
        });
        return out;
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Scalar', this, peer);
        let out;
        // Exactly equal scalars are handled in unify.unite
        if (peer.isScalarKind || peer.isConstraint) {
            out = peer.unify(this, ctx);
        }
        else if (peer.isTop) {
            out = this;
        }
        else {
            out = (0, err_1.makeNilErr)(ctx, 'scalar_' +
                (peer.kind === this.kind ? 'value' : 'kind'), this, peer);
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    get canon() {
        return null === this.peg ? 'null' :
            undefined === this.peg ? 'undefined' :
                this.peg.toString();
    }
    same(peer) {
        return peer?.isScalar ?
            (peer.kind === this.kind && this.samePeg(peer.peg)) :
            super.same(peer);
    }
    samePeg(peg) {
        return peg === this.peg;
    }
    gen(ctx) {
        // Normalize negative zero to 0 for deterministic output (JSON has
        // no -0, and the Go port produces 0).
        const out = Object.is(this.peg, -0) ? 0 : this.peg;
        return (0, genwrite_1.genWrites)(ctx, this) ? (0, genwrite_1.genWrite)(ctx, this, out) : out;
    }
    superior() {
        return this.place(new ScalarKindVal_1.ScalarKindVal({
            peg: this.kind
        }));
    }
} /* node:coverage ignore next 6 */
exports.ScalarVal = ScalarVal;
//# sourceMappingURL=ScalarVal.js.map