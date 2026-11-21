"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aliasCycle = aliasCycle;
const err_1 = require("./err");
// A path steps through these as through the value they hold.
const RIDERS = new Set(['hide', 'type', 'meta', 'deprecate', 'ident', 'close', 'open']);
const OPEN = 1;
const DONE = 2;
// THE ALIAS-CYCLE RULE (decisions 1, 2 and 7 of sketch/DEFINITION.0.md
// section 7): a name or a path that reaches itself with no key and no
// element between has no finite derivation, so it is refused before
// evaluation instead of by a budget. A name is a path from the root, so
// one graph holds both, and a step into a member is the guard.
function aliasCycle(ctx, root) {
    const roots = rootMaps(root);
    if (0 === roots.length) {
        return undefined;
    }
    const state = new Map();
    // The search keeps its own stack: a chain of names can run deeper
    // than the host's.
    const stack = [];
    const enter = (path) => {
        const id = path.join('\u0000');
        if (OPEN === state.get(id)) {
            return stack.find((frame) => frame.id === id);
        }
        if (undefined === state.get(id)) {
            state.set(id, OPEN);
            stack.push({ id, path, edges: edges(roots, path), at: 0, ref: undefined });
        }
        return undefined;
    };
    // A cycle is reported where the document first reaches it, as the
    // engines report one they meet while evaluating.
    const starts = [];
    positions(roots, [], starts);
    for (const start of starts) {
        let found = enter(start);
        while (undefined === found && 0 < stack.length) {
            const top = stack[stack.length - 1];
            if (top.at < top.edges.length) {
                const [ref, to] = top.edges[top.at++];
                top.ref = ref;
                found = enter(to);
            }
            else {
                state.set(top.id, DONE);
                stack.pop();
            }
        }
        if (undefined !== found) {
            const nil = (0, err_1.makeNilErr)(ctx, 'path_cycle', found.ref);
            nil.path = found.path;
            return nil;
        }
    }
    return undefined;
}
function edges(roots, path) {
    const out = [];
    for (const term of termsAt(roots, path)) {
        for (const [ref, placed] of unguarded(term, true, [])) {
            const to = target(ref, placed);
            if (undefined !== to) {
                out.push([ref, to]);
            }
        }
    }
    return out;
}
function rootMaps(v) {
    return true === v?.isMap ? [v] :
        true === v?.isConjunct && Array.isArray(v.peg) ? v.peg.flatMap(rootMaps) : [];
}
// The place a reference names, or none where it can't say statically:
// a variable step, or a relative path whose place depends on where a
// call or a template stands.
function target(ref, placed) {
    if (true !== ref.absolute && !placed) {
        return undefined;
    }
    if (!ref.peg.every((p) => 'string' === typeof p)) {
        return undefined;
    }
    const out = [];
    for (const p of true === ref.absolute ? ref.peg : [...ref.path.slice(0, -1), ...ref.peg]) {
        if ('.' !== p) {
            out.push(p);
        }
        else if (undefined === out.pop()) {
            return undefined;
        }
    }
    return out;
}
function termsAt(roots, path) {
    let at = roots;
    for (const step of path) {
        const next = [];
        for (const v of at.flatMap(unwrap)) {
            if (true === v.isMap && Object.prototype.hasOwnProperty.call(v.peg, step)) {
                next.push(v.peg[step]);
            }
            else if (true === v.isList && /^(0|[1-9][0-9]*)$/.test(step) && +step < v.peg.length) {
                next.push(v.peg[+step]);
            }
        }
        at = next;
    }
    return at;
}
function unwrap(v) {
    if (true === v?.isConjunct && Array.isArray(v.peg)) {
        return v.peg.flatMap(unwrap);
    }
    return true === v?.isFunc && RIDERS.has(v.funcname()) && null != v.peg[0] ?
        unwrap(v.peg[0]) : [v];
}
// The references a term holds with no key and no element between, each
// with whether a relative one still stands where it is written. Only a
// trial's count and branches are read, so `contains` keeps its member
// term and `rest` all but a cover's `if`, as the definition reads them.
function unguarded(v, placed, out) {
    if (true !== v?.isVal || true === v.isMap || true === v.isList) {
        return out;
    }
    if (true === v.isRef) {
        out.push([v, placed]);
        return out;
    }
    const kids = true === v.isConstraint ? trialArgs(v) :
        true === v.isFunc ? ('path' === v.funcname() ? [] : v.peg) :
            Array.isArray(v.peg) ? v.peg : [v.peg];
    const inner = placed && true !== v.isConstraint && true !== v.isFunc;
    for (const k of kids) {
        unguarded(k, inner, out);
    }
    return out;
}
function trialArgs(v) {
    const atom = v.pending?.atom;
    const args = v.pending?.args ?? [];
    return [
        ...('contains' === atom ? args.slice(1) :
            'rest' === atom ? args.slice(1).filter((c) => true === c?.isMap)
                .map((c) => c.peg.if) : args),
        ...v.musts.map((m) => m.v),
    ];
}
// Every place the document writes, in the order it writes them.
function positions(terms, path, out) {
    for (const v of terms.flatMap(unwrap)) {
        if (true === v.isMap) {
            for (const k of Object.keys(v.peg)) {
                out.push([...path, k]);
                positions([v.peg[k]], [...path, k], out);
            }
        }
        else if (true === v.isList) {
            v.peg.forEach((e, i) => {
                out.push([...path, '' + i]);
                positions([e], [...path, '' + i], out);
            });
        }
    }
} /* node:coverage ignore next 5 */
//# sourceMappingURL=cycle.js.map