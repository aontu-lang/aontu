"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpectVal = void 0;
const type_1 = require("../type");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const err_1 = require("../err");
const FeatureVal_1 = require("./FeatureVal");
class ExpectVal extends FeatureVal_1.FeatureVal {
    get canon() { return this.peg.canon; }
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isExpect = true;
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Expect', this, peer);
        let out = this;
        if (!peer.isTop) {
            // Expectations meet as one: nested, each later meet walked both
            // halves again, twice the work for every spread that met the value.
            const other = true === peer.isExpect ? peer : undefined;
            const peeru = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'EXPECT') }) : ctx, undefined === other ? peer : other.peg, this.peg, 'expect-self');
            const theirs = undefined === other ? peer : other.peer;
            const acc = undefined === this.peer || undefined === theirs ? this.peer ?? theirs :
                (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PEER') }) : ctx, this.peer, theirs, 'expect-peer');
            if (peeru.isGenable) {
                out = peeru;
            }
            else {
                const e = new ExpectVal({ peg: peeru }, ctx);
                e.key = this.key;
                e.parent = this.parent;
                e.peer = acc;
                out = e;
            }
        }
        out.dc = type_1.DONE;
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    gen(ctx) {
        // Unresolved expect cannot be generated, so always an error. The
        // CALL is the point -- it records the failure on ctx -- and there
        // is no value to bind: generation answers nothing.
        (0, err_1.makeNilErr)(ctx, 'expect', this.peg, this.peer);
        return undefined;
    }
    inspection(d) {
        return 'key=' + this.key +
            ',peg=' + this.peg?.inspect(d) +
            ',peer=' + this.peer?.inspect(d) +
            ',parent=' + this.parent?.inspect(d);
    }
} /* node:coverage ignore next 6 */
exports.ExpectVal = ExpectVal;
//# sourceMappingURL=ExpectVal.js.map