"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JunctionVal = void 0;
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
        // The instantiation flag descends with the mark (ADR-005): a
        // junction inside a template clones its members as instances (the
        // instantiation sites re-path the whole clone afterwards — see
        // repathInstance in Val.ts).
        const childspec = spec?.mark || spec?.dup ?
            { mark: spec?.mark, dup: spec?.dup } : {};
        out.peg = this.peg.map((entry) => entry.clone(ctx, childspec));
        return out;
    }
    get canon() {
        return this.peg.map((v) => {
            return v.isJunction && Array.isArray(v.peg) && 1 < v.peg.length ?
                '(' + v.canon + ')' : v.canon; // v.id + '=' + v.canon
        }).join(this.getJunctionSymbol()); // + '<' + (this.mark.hide ? 'H' : '') + '>'
    }
} /* node:coverage ignore next 6 */
exports.JunctionVal = JunctionVal;
//# sourceMappingURL=JunctionVal.js.map