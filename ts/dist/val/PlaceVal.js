"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceVal = void 0;
exports.boundArgStart = boundArgStart;
exports.rebuild = rebuild;
exports.hasPlace = hasPlace;
exports.waitsOnHole = waitsOnHole;
exports.fillPlace = fillPlace;
exports.bindHole = bindHole;
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
function boundArgStart(v) {
    return true === v.isPackFunc || true === v.isEachFunc ||
        true === v.isFilterFunc || true === v.isEmitFunc ||
        true === v.isFormFunc ? 1 : Infinity;
}
function hasPlace(v) {
    return holeIn(v, true);
}
// A call waits on a hole in its arguments, not on one a container
// argument holds, which that container's own meet fills.
function waitsOnHole(v) {
    return holeIn(v, false);
}
function holeIn(v, bags) {
    if (true === v.isPlace) {
        return true;
    }
    if (!bags && (true === v.isMap || true === v.isList)) {
        return false;
    }
    const peg = v.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        for (let cI = 0; cI < peg.length && cI < bound; cI++) {
            const c = peg[cI];
            if (true === c?.isVal && holeIn(c, bags)) {
                return true;
            }
        }
    }
    else if (true === peg?.isVal) {
        return holeIn(peg, bags);
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k of Object.keys(peg)) {
            if (true === peg[k]?.isVal && holeIn(peg[k], bags)) {
                return true;
            }
        }
    }
    return false;
}
function fillPlace(v, fill, ctx) {
    return fillIn(v, fill, ctx, true);
}
// The holes a call waits on, bound to its peer: a container argument
// keeps its own.
function bindHole(v, fill, ctx) {
    return fillIn(v, fill, ctx, false);
}
function fillIn(v, fill, ctx, bags) {
    if (true === v.isPlace) {
        return fill.clone(ctx, { path: [...v.path] });
    }
    if (!bags && (true === v.isMap || true === v.isList)) {
        return v;
    }
    const peg = v.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        let changed = false;
        const out = peg.map((c, cI) => {
            if (true !== c?.isVal || bound <= cI) {
                return c;
            }
            const f = fillIn(c, fill, ctx, bags);
            changed = changed || f !== c;
            return f;
        });
        return changed ? rebuild(v, out, ctx) : v;
    }
    if (true === peg?.isVal) {
        const f = fillIn(peg, fill, ctx, bags);
        return f === peg ? v : rebuild(v, f, ctx);
    }
    if (null != peg && 'object' === typeof peg) {
        let changed = false;
        const out = {};
        for (const k of Object.keys(peg)) {
            const c = peg[k];
            // No isVal guard: a slot holding something that is not a Val
            // answers itself, because fillIn's own first tests -- is it a
            // hole, a container, has it a peg -- are all false for one.
            const f = fillIn(c, fill, ctx, bags);
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