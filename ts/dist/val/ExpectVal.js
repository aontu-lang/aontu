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
    // An expectation canons as THE EXPECTATION ITSELF -- the peg the peer
    // must satisfy. Val.canon's default was the empty string, which
    // rendered a key with no value (`{"r":}`): text that is not a document
    // and could not be reparsed, breaking canon's round-trip contract in
    // both engines (issue #43).
    //
    // Not `top`, which was the first fix here and was wrong. An ExpectVal
    // is created for EVERY peer-introduced non-generable key, not just for
    // `&:` spread children -- `m:{x:1} m:{y:string}` makes one at `y` with
    // no spread in sight -- so rendering `top` erased the `string` and the
    // canon reparsed into a document that accepts values the original
    // rejects. A canon that silently drops a constraint is worse than one
    // that fails to parse. Go's ExpectVal.Canon renders the same peg.
    //
    // Which is why `peg` is kept the WHOLE expectation as peers arrive
    // (BUGS.md §48) rather than only what was first written: see unify.
    get canon() { return this.peg.canon; }
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isExpect = true;
    }
    // PURE, deliberately (the unequal-spread crosswire, BUGS.md §6-§7).
    // The old body accumulated `this.peer` IN PLACE, which was invisible
    // while an expectation only ever lived at one destination -- but the
    // spread-combination meet (MapVal.unify's 'map-self' unite) bakes an
    // ExpectVal INTO the combined template, and a path-independent
    // template is SHARED across every destination (spreadClone tier 1).
    // One stateful node in a shared template unified each sibling's own
    // data with the next sibling's ($.w.y.r: "Cannot unify value: 6 with
    // value: 5", both values sibling data). An expectation now answers
    // with a NEW node when it must keep accumulated state, so a shared
    // template's expect stays exactly what was written.
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Expect', this, peer);
        let out = this;
        if (!peer.isTop) {
            // THE PEER MEETS THE WHOLE EXPECTATION. `peg` already carries
            // every peer met so far (see below), so meeting the incoming peer
            // against the ACCUMULATED `peer` first -- as this did -- refused
            // against only the atom that happened to reject. A conflict with
            // `peg` is a conflict with the accumulation too, since peg
            // subsumes it, so nothing stops being refused: only the sentence
            // changes, to the residual the error's own hint promises
            // (BUGS.md §48).
            const peeru = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'EXPECT') }) : ctx, peer, this.peg, 'expect-self');
            if (peeru.isGenable) {
                out = peeru;
            }
            else {
                // Accumulated for the `expect` finding's operand only, now that
                // the meet is decided above.
                const acc = undefined === this.peer ? peer :
                    (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PEER') }) : ctx, this.peer, peer, 'expect-peer');
                // Still an expectation: carry the accumulated peer forward in a
                // fresh node stored at THIS destination by the caller, leaving
                // `this` -- possibly a shared template's child -- untouched.
                //
                // THE MEET IS THE NEW PEG (BUGS.md §48). An expectation that
                // has met a peer without being freed by it stands for `peg &
                // peer` from then on -- that is what a later peer must satisfy,
                // and what canon has to state. Rebuilding from the ORIGINAL peg
                // dropped the peer everywhere the node was later copied (the
                // bag re-wrap, Val.clone), so `b:{z:1} b:{u8:min(0)}
                // a:$.b.u8&max(15)` -- whose reference resolves a pass late, so
                // `max(15)` arrives as a peer -- canoned as `min(0)`. That text
                // reparses into a document admitting 20, which the original
                // rejects, and hashed differently in each port. Storing the
                // meet in `peg` needs no new field and no carrying: every copy
                // site already preserves `peg`.
                //
                // Purity is untouched -- this is a NEW node, so a shared
                // template's own expectation keeps the peg it was written with
                // (§6-§7).
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