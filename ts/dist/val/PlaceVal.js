"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceVal = void 0;
exports.boundArgStart = boundArgStart;
exports.rebuild = rebuild;
exports.hasPlace = hasPlace;
exports.fillPlace = fillPlace;
const Val_1 = require("./Val");
class PlaceVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPlace = true;
    }
    unify(peer, _ctx) {
        // The peer FILLS the hole. Against TOP there is nothing to fill it
        // with, so it waits -- and waiting is not done, or a call holding
        // it would resolve around it.
        if (peer.isTop) {
            this.notdone();
            return this;
        }
        return peer;
    }
    get canon() {
        return '_';
    }
    // A hole admits everything, so nothing sits above it -- the same
    // answer TOP gives, for the same reason.
    superior() {
        return this;
    }
}
exports.PlaceVal = PlaceVal;
// A HOLE BELONGS TO ITS NEAREST ENCLOSING GENERATOR. A `_` inside a
// generator's template (pack/each, arg 1), condition (filter, arg 1)
// or rule table (emit, arg 1) is that generator's to bind — "_ is the
// source child" — so neither the hole test nor the fill walk may cross
// into those arguments from outside. Before this boundary, `close(pack(d, _ & t))` reported a
// hole to the OUTER call, so an ordinary overlay statement was
// absorbed into the template instead of merging with the generated
// child (use-cases/BUGS.md §10), and an outer pack's fill pass
// captured a NESTED pack's hole lexically, binding it to the outer
// source (§34). The data argument (arg 0) is not a binding position,
// so it stays visible: a hole there is an outer hole as before.
function boundArgStart(v) {
    return true === v.isPackFunc || true === v.isEachFunc ||
        true === v.isFilterFunc || true === v.isEmitFunc ? 1 : Infinity;
}
// Does this value CONTAIN a hole? Asked of a call before it resolves:
// a call holding one must wait for a peer to fill it. Holes inside a
// generator's own binding arguments are NOT this value's holes — see
// boundArgStart above.
function hasPlace(v) {
    if (true === v.isPlace) {
        return true;
    }
    const peg = v.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        for (let cI = 0; cI < peg.length && cI < bound; cI++) {
            const c = peg[cI];
            if (true === c?.isVal && hasPlace(c)) {
                return true;
            }
        }
    }
    else if (true === peg?.isVal) {
        return hasPlace(peg);
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k of Object.keys(peg)) {
            if (true === peg[k]?.isVal && hasPlace(peg[k])) {
                return true;
            }
        }
    }
    return false;
}
// The same tree with every hole filled by `fill`. Answers the value
// UNCHANGED when it holds no hole, so a caller can test identity to
// know whether anything was filled -- and so a tree with no hole is
// never needlessly cloned. A nested generator's binding arguments are
// left untouched (boundArgStart): those holes are the inner
// generator's to fill with its OWN source children when it fires.
function fillPlace(v, fill, ctx) {
    if (true === v.isPlace) {
        return fill;
    }
    const peg = v.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        let changed = false;
        const out = peg.map((c, cI) => {
            if (true !== c?.isVal || bound <= cI) {
                return c;
            }
            const f = fillPlace(c, fill, ctx);
            changed = changed || f !== c;
            return f;
        });
        return changed ? rebuild(v, out, ctx) : v;
    }
    if (true === peg?.isVal) {
        const f = fillPlace(peg, fill, ctx);
        return f === peg ? v : rebuild(v, f, ctx);
    }
    if (null != peg && 'object' === typeof peg) {
        let changed = false;
        const out = {};
        for (const k of Object.keys(peg)) {
            const c = peg[k];
            // No isVal guard: a slot holding something that is not a Val
            // answers itself, because fillPlace's own first tests -- is it a
            // hole, has it a peg -- are both false for one.
            const f = fillPlace(c, fill, ctx);
            changed = changed || f !== c;
            out[k] = f;
        }
        return changed ? rebuild(v, out, ctx) : v;
    }
    return v;
}
// A clone carrying a new peg. `clone` shares the peg by reference (see
// Val.clone), which is exactly what must NOT happen here: the tree
// being filled is a template, and the fill is one destination's.
function rebuild(v, peg, ctx) {
    const out = v.clone(ctx);
    out.peg = peg;
    out.dc = 0;
    return out;
} /* node:coverage ignore next 10 */
//# sourceMappingURL=PlaceVal.js.map