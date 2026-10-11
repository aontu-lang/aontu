"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JunctionVal = void 0;
const utility_1 = require("../utility");
const keyorder_1 = require("../keyorder");
const FeatureVal_1 = require("./FeatureVal");
// Abstract base class for binary operations that work with arrays of Val objects
// (ConjunctVal and DisjunctVal)
class JunctionVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isJunction = true;
    }
    // NOTE: mutation!
    append(peer) {
        this.peg.push(peer);
        return this;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        const childspec = spec?.mark || spec?.dup ?
            { mark: spec?.mark, dup: spec?.dup, path: out.path }
            : { path: out.path };
        out.peg = this.peg.map((entry) => entry.clone(ctx, childspec));
        return out;
    }
    get canon() {
        const parts = this.peg.map((v) => [v.cjo, v.isJunction && Array.isArray(v.peg) && 1 < v.peg.length ?
                '(' + (0, utility_1.canonRiders)(v) + ')' : (0, utility_1.canonRiders)(v)]);
        // A meet is one value whatever order its terms were met in, so terms
        // of one rank are written in code-point order.
        if ('&' === this.getJunctionSymbol()) {
            parts.sort((a, b) => a[0] - b[0] || (0, keyorder_1.cmpCodePoint)(a[1], b[1]));
        }
        return parts.map((p) => p[1]).join(this.getJunctionSymbol());
    }
} /* node:coverage ignore next 6 */
exports.JunctionVal = JunctionVal;
//# sourceMappingURL=JunctionVal.js.map