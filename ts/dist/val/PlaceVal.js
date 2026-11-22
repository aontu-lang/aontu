"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceVal = void 0;
exports.boundArgStart = boundArgStart;
exports.hasPlace = hasPlace;
exports.rebuild = rebuild;
exports.unboundHole = unboundHole;
exports.unknownCall = unknownCall;
exports.waitsOnHole = waitsOnHole;
exports.fillPlace = fillPlace;
const Val_1 = require("./Val");
const err_1 = require("../err");
class PlaceVal extends Val_1.Val {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isPlace = true;
    }
    // A hole left unbound stands for any value, as the definition reads an
    // unused declaration's body: against TOP it waits, never done, so a
    // call holding it is never made around it.
    unify(peer, _ctx) {
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
// An unknown name or a wrong count is refused wherever it stands, even
// where a trial or maybe would read it as admitting nothing (decision 77
// of sketch/DEFINITION.0.md). A declaration's body counts, reported where
// it is declared, and of several the least by path is reported.
function unknownCall(root) {
    const found = [];
    const seen = new Set();
    refusedCallIn(root, [], false, seen, found);
    for (const [body, path] of declBodies(root)) {
        refusedCallIn(body, path, true, seen, found);
    }
    let least = undefined;
    for (const f of found) {
        if (undefined === least || f[1].join('\x00') < least[1].join('\x00')) {
            least = f;
        }
    }
    if (undefined === least) {
        return undefined;
    }
    const nil = least[0];
    nil.path = least[1];
    return nil;
}
// `maybe()` is how canon writes an absence, so it is read back as one.
function refusedCall(v) {
    return true === v.isNil && ('unknown_function' === v.why ||
        ('func_arity' === v.why &&
            !('maybe' === v.refusedCall?.name && 0 === v.refusedCall.args.length)));
}
// Both walks keep their own stack, as aliasCycle does: a document may nest
// deeper than the host's stack, and the order is the recursive one.
function refusedCallIn(start, startPath, startCalls, seen, found) {
    const stack = [[start, startPath, startCalls]];
    while (0 < stack.length) {
        const [v, path, calls] = stack.pop();
        if (true !== v?.isVal || seen.has(v)) {
            continue;
        }
        seen.add(v);
        if (refusedCall(v)) {
            found.push([v, path]);
            continue;
        }
        const next = [];
        const call = callOf(v);
        const peg = v.peg;
        if (undefined !== call) {
            call.args.forEach((arg) => next.push([arg, path, true]));
        }
        else {
            if (Array.isArray(peg) || true === peg?.isVal) {
                [peg].flat().forEach((item, i) => next.push([item,
                    true === v.isList && !calls ? [...path, '' + i] : path,
                    calls || true === v.isOp || true === v.isConstraint]));
            }
            else if (null != peg && 'object' === typeof peg) {
                for (const k of Object.keys(peg)) {
                    if (!(v.aliasKeys ?? []).includes(k)) {
                        next.push([peg[k], calls ? path : [...path, k], calls]);
                    }
                }
            }
            next.push([v.spread?.cj, path, calls]);
        }
        stack.push(...next.reverse());
    }
}
function declBodies(start) {
    const out = [];
    const seen = new Set();
    const stack = [[start, []]];
    while (0 < stack.length) {
        const [v, path] = stack.pop();
        if (true !== v?.isVal || seen.has(v)) {
            continue;
        }
        seen.add(v);
        for (const k of v.aliasKeys ?? []) {
            out.push([v.peg[k], path]);
        }
        const next = [];
        const peg = v.peg;
        if (true === v.isMap && null != peg && 'object' === typeof peg) {
            for (const k of Object.keys(peg)) {
                if (!(v.aliasKeys ?? []).includes(k)) {
                    next.push([peg[k], [...path, k]]);
                }
            }
            next.push([v.spread?.cj, path]);
        }
        else {
            partsOf(v).forEach((c) => next.push([c, path]));
        }
        stack.push(...next.reverse());
    }
    return out;
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
// A hole at any depth, but in a nested generator's template; with bags
// false none a container holds, as a call waits on its own arguments' holes.
function holeIn(v, bags) {
    if (true === v?.isPlace) {
        return true;
    }
    if (!bags && (true === v?.isMap || true === v?.isList)) {
        return false;
    }
    const peg = v?.peg;
    const kids = Array.isArray(peg) ? peg.slice(0, boundArgStart(v)) :
        true === peg?.isVal ? [peg] : bags && null != peg && 'object' === typeof peg ? Object.values(peg) : [];
    return kids.some((c) => true === c?.isVal && holeIn(c, bags));
}
function hasPlace(v) {
    return holeIn(v, true);
}
function waitsOnHole(v) {
    return holeIn(v, false);
}
// Each hole an instance's template holds, bound to the value it is made
// from: not one in a nested generator's template, which is that one's.
function fillPlace(v, fill, ctx) {
    if (true === v.isPlace) {
        return fill.clone(ctx, { path: [...v.path] });
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
            // hole, has it a peg -- are all false for one.
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
} /* node:coverage ignore next 11 */
//# sourceMappingURL=PlaceVal.js.map