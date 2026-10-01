"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JunctionVal = void 0;
const utility_1 = require("../utility");
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
        return this.peg.map((v) => {
            return v.isJunction && Array.isArray(v.peg) && 1 < v.peg.length ?
                '(' + (0, utility_1.canonRiders)(v) + ')' : (0, utility_1.canonRiders)(v);
        }).join(this.getJunctionSymbol()); // + '<' + (this.mark.hide ? 'H' : '') + '>'
    }
} /* node:coverage ignore next 6 */
exports.JunctionVal = JunctionVal;
//# sourceMappingURL=JunctionVal.js.map