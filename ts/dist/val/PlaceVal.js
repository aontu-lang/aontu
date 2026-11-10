"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceVal = exports.HOLDING = exports.HELD_BOUNDS = void 0;
exports.bagHoles = bagHoles;
exports.boundArgStart = boundArgStart;
exports.rebuild = rebuild;
exports.hasPlace = hasPlace;
exports.unboundHole = unboundHole;
exports.holdHoles = holdHoles;
exports.unfillable = unfillable;
exports.doneButHoles = doneButHoles;
exports.waitsOnHole = waitsOnHole;
exports.fillPlace = fillPlace;
exports.bindHole = bindHole;
const Val_1 = require("./Val");
const err_1 = require("../err");
class PlaceVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPlace = true;
        this.held = false;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        out.held = this.held;
        return out;
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
    // A hole admits everything, so nothing sits above it, as for TOP.
    superior() {
        return this;
    }
}
exports.PlaceVal = PlaceVal;
// The calls whose arguments from the second on are templates.
const BINDING = new Set(['pack', 'each', 'apply', 'filter', 'emit']);
function boundArgStart(v) {
    return true === v?.isFunc ? boundFrom(v.funcname()) : Infinity;
}
function boundFrom(name) {
    return BINDING.has(name) ? 1 : Infinity;
}
// A hole nothing binds where it is written (ruling 34): one outside the
// template of a generator, an apply or a filter's condition, one in a
// spread's template, and a name whose body holds one, though not as an
// emit's table. It is reported at the member it is written in.
function unboundHole(ctx, root) {
    const decls = new Map();
    declsIn(root, decls, new Set());
    const holed = new Set();
    let grew = true;
    while (grew) {
        grew = false;
        for (const [key, body] of decls) {
            if (!holed.has(key) && undefined !== looseIn(body, holed, false, [])) {
                holed.add(key);
                grew = true;
            }
        }
    }
    const found = looseIn(root, holed, false, []);
    if (undefined === found) {
        return undefined;
    }
    const nil = (0, err_1.makeNilErr)(ctx, 'hole_unbound', found[0], undefined, 'parse');
    nil.path = found[1];
    return nil;
}
function declsIn(v, decls, seen) {
    if (true !== v?.isVal || seen.has(v)) {
        return;
    }
    seen.add(v);
    for (const key of v.aliasKeys ?? []) {
        decls.set(key, v.peg[key]);
    }
    partsOf(v).forEach((c) => declsIn(c, decls, seen));
}
// The path steps through members only: a list or a map inside a call's
// arguments is no member, and the engines shape those differently.
function looseIn(v, holed, tmpl, path, calls = false) {
    if (true === v?.isPlace) {
        return tmpl ? undefined : [v, path];
    }
    if (true === v?.isRef) {
        return holed.has(v.aliasKey) ? [v, path] : undefined;
    }
    if (true !== v?.isVal) {
        return undefined;
    }
    const call = callOf(v);
    if (undefined !== call) {
        const from = boundFrom(call.name);
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            if ('emit' === call.name && 1 === i && undefined !== arg?.aliasKey) {
                continue;
            }
            const found = looseIn(arg, holed, tmpl || from <= i, path, true);
            if (undefined !== found) {
                return found;
            }
        }
        return undefined;
    }
    const peg = v.peg;
    if (Array.isArray(peg) || true === peg?.isVal) {
        const items = [peg].flat();
        for (let i = 0; i < items.length; i++) {
            const found = looseIn(items[i], holed, tmpl, true === v.isList && !calls ? [...path, '' + i] : path, calls || true === v.isOp || true === v.isConstraint);
            if (undefined !== found) {
                return found;
            }
        }
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k of Object.keys(peg)) {
            if (!(v.aliasKeys ?? []).includes(k)) {
                const found = looseIn(peg[k], holed, tmpl, calls ? path : [...path, k], calls);
                if (undefined !== found) {
                    return found;
                }
            }
        }
    }
    return looseIn(v.spread?.cj, holed, false, path, calls);
}
// A call's name and arguments: a refused one's are as written.
function callOf(v) {
    return true === v.isFunc ? { name: v.funcname(), args: v.peg } : v.refusedCall;
}
function partsOf(v) {
    const peg = callOf(v)?.args ?? v.peg;
    const parts = Array.isArray(peg) ? [...peg] : true === peg?.isVal ? [peg] :
        null != peg && 'object' === typeof peg ? Object.values(peg) : [];
    return null == v.spread?.cj ? parts : [...parts, v.spread.cj];
}
function hasPlace(v) {
    return holeIn(v, true);
}
// Done but for the holes it waits on, which settle only when filled.
function doneButHoles(v) {
    if (v.done || true === v.isPlace) {
        return true;
    }
    if (true === v.isFunc || true === v.isOp) {
        return waitsOnHole(v) && v.peg.slice(0, boundArgStart(v)).every(doneButHoles);
    }
    if (true === v.isConjunct || true === v.isDisjunct) {
        return v.peg.every(doneButHoles);
    }
    if (true === v.isList) {
        return null == v.spread.cj && v.peg.every(doneButHoles);
    }
    if (true === v.isMap) {
        return null == v.spread.cj && Object.values(v.peg).every(doneButHoles);
    }
    return false;
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
// The calls that compute from their arguments' values, so are made only
// once those values are whole, by the first argument whose holes they
// hold: a join over a list that holds a hole stands, as the definition
// reads it, so its separator is the first.
const HOLDING = {
    add: 0, sub: 0, mul: 0, div: 0, mod: 0, rem: 0, sum: 0, least: 0,
    greatest: 0, pick: 0, sort: 0, join: 1, upper: 0, lower: 0, esc: 0,
    usc: 0, rep: 0, split: 0, translate: 0, nom: 0, path: 0, abnf: 0,
    parse: 0, project: 0, folder: 0, file: 0, content: 0, line: 0,
    fragment: 0, slot: 0, inject: 0, copyfiles: 0, listitems: 0,
};
exports.HOLDING = HOLDING;
// A hole in a container a call takes is held: no peer of the call fills it.
function holdHoles(v, bagged) {
    if (true === v?.isPlace) {
        v.held = v.held || bagged;
        return;
    }
    const bag = bagged || true === v?.isMap || true === v?.isList;
    const peg = v?.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        peg.slice(0, bound).forEach((c) => true === c?.isVal && holdHoles(c, bag));
    }
    else if (true === peg?.isVal) {
        holdHoles(peg, bag);
    }
    else if (null != peg && 'object' === typeof peg) {
        Object.values(peg).forEach((c) => true === c?.isVal && holdHoles(c, bag));
    }
}
function heldIn(v) {
    if (true === v?.isPlace) {
        return true === v.held;
    }
    const peg = v?.peg;
    const bound = boundArgStart(v);
    if (Array.isArray(peg)) {
        return peg.slice(0, bound).some((c) => true === c?.isVal && heldIn(c));
    }
    if (true === peg?.isVal) {
        return heldIn(peg);
    }
    if (null != peg && 'object' === typeof peg) {
        return Object.values(peg).some((c) => true === c?.isVal && heldIn(c));
    }
    return false;
}
// A held hole no meet reaches, under lists, maps and calls alone.
function stuckIn(v) {
    if (true === v?.isPlace) {
        return true === v.held;
    }
    if ((true === v?.isList || true === v?.isMap) && null == v.spread?.cj) {
        return Object.values(v.peg).some((c) => true === c?.isVal && stuckIn(c));
    }
    if (true === v?.isFunc) {
        return v.peg.slice(0, boundArgStart(v)).some((c) => true === c?.isVal && stuckIn(c));
    }
    return false;
}
// Settled but for the holes a list or a map holds, or only the held
// ones where `held` asks, since no peer of the call fills them, and
// where `calls` asks, the calls there that wait on a hole of their own.
function bagHoles(v, held, calls = false) {
    if (true === v?.done) {
        return true;
    }
    if (true === v?.isPlace) {
        return !held || true === v.held;
    }
    if (calls && (true === v?.isFunc || true === v?.isOp)) {
        return doneButHoles(v);
    }
    return (true === v?.isList || true === v?.isMap) && null == v.spread?.cj &&
        Object.values(v.peg).every((c) => bagHoles(c, held, calls));
}
// Settled but for a hole its own container holds, which nothing fills,
// or holding one no meet reaches, whatever else it waits on.
function unfillable(ctx, call, args) {
    return true === ctx.settle && undefined !== HOLDING[call.funcname()] &&
        !waitsOnHole(call) && (args.some(stuckIn) || (args.every(doneButHoles) && args.some(heldIn)));
}
// The bounds whose list or map argument holds its holes as a call's does.
const HELD_BOUNDS = new Set(['min', 'max', 'above', 'below', 'neq', 'mulof']);
exports.HELD_BOUNDS = HELD_BOUNDS;
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
} /* node:coverage ignore next 17 */
//# sourceMappingURL=PlaceVal.js.map