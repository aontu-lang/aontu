"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConstraintKindVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const unify_1 = require("../unify");
const FeatureVal_1 = require("./FeatureVal");
// A constraint, or a kind that can become one's domain (`integer` in
// `constraint & integer & min(0)`).
function constrains(v) {
    return true === v?.isConstraint || true === v?.isRefer
        || true === v?.isRel || true === v?.isScalarKind
        || true === v?.isEmptyConstraint || true === v?.isGraphAtom;
}
// The type of constraints. It HOLDS the meet of the constraints it has
// met rather than answering with them, so a concrete value is refused
// whichever order the terms fold in: `constraint & min(3) & 5` is an
// error just as `constraint & 5` is, where answering `min(3)` would let
// `min(3) & 5` quietly become `5`.
class ConstraintKindVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isConstraintKind = true;
        this.held = spec.held;
        this.dc = null == this.held || this.held.done ? type_1.DONE : 0;
    }
    unify(peer, ctx) {
        const p = peer;
        if (true === p.isTop) {
            return null == this.held || this.held.done ? this :
                this.hold((0, unify_1.unite)(ctx, this.held, p, 'constraint-kind'), ctx);
        }
        const theirs = true === p.isConstraintKind ? p.held : constrains(p) ? p : undefined;
        if (true !== p.isConstraintKind && undefined === theirs) {
            return (0, err_1.makeNilErr)(ctx, 'constraint_kind', this, peer);
        }
        if (undefined === theirs) {
            return this;
        }
        return this.hold(null == this.held ? theirs :
            (0, unify_1.unite)(ctx, this.held, theirs, 'constraint-kind'), ctx);
    }
    hold(v, ctx) {
        if (true === v.isNil) {
            return v;
        }
        if (!constrains(v)) {
            return (0, err_1.makeNilErr)(ctx, 'constraint_kind', this, v);
        }
        const out = new ConstraintKindVal({ held: v }, ctx);
        out.site = this.site;
        out.path = this.path;
        return out;
    }
    clone(ctx, spec) {
        return super.clone(ctx, {
            ...(null == this.held ? {} : { held: this.held.clone(ctx) }),
            ...(spec ?? {}),
        });
    }
    get canon() {
        return null == this.held ? 'constraint' : 'constraint&' + this.held.canon;
    }
    same(peer) {
        return true === peer?.isConstraintKind &&
            (null == this.held ? null == peer.held :
                null != peer.held && this.held.same(peer.held));
    }
} /* node:coverage ignore next 5 */
exports.ConstraintKindVal = ConstraintKindVal;
//# sourceMappingURL=ConstraintKindVal.js.map