"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphOf = graphOf;
const keyorder_1 = require("./keyorder");
const formatPath = (path) => 0 === path.length ? '$' : '$.' + path.join('.');
// Digits-only segments are list indices, which is exactly how the rest
// of the engine spells them.
const isIndex = (seg) => /^[0-9]+$/.test(seg);
// The node a link starts at and the relation it hangs under, derived
// from the link's own position.
//
// A DECLARED predicate (rel()-minted) is authoritative: the link is cut
// at the key the rel() sat on, wherever that is on the way down, which
// is what makes a MAP-valued relation report the relation rather than
// the inner label. Without one the relation is INFERRED: strip the list
// indices, and the first real key above the link is it.
const cut = (at, relkey) => {
    if (undefined !== relkey) {
        for (let i = at.length - 1; 0 <= i; i--) {
            if (at[i] === relkey) {
                return { from: formatPath(at.slice(0, i)), key: relkey };
            }
        }
    }
    let i = at.length - 1;
    for (; 0 <= i && isIndex(at[i]); i--) { }
    return 0 > i
        ? { from: formatPath([]), key: relkey ?? '' }
        : { from: formatPath(at.slice(0, i)), key: relkey ?? at[i] };
};
// The graph of an evaluated tree. Walks POSITIONS, not values: a
// reference or a spread can put one value object at several positions,
// and a walk guarded by object identity would find the first and miss
// every other place it is reached. The guard is therefore the ancestor
// chain — which is what a cycle actually is.
function graphOf(root) {
    const edges = [];
    const disjunct = [];
    // ONE WALK, with `undecided` saying which side of ADR-007 it is on:
    // below an unresolved disjunction every link is a position the
    // document has not decided, and nothing there is an edge.
    const visit = (node, path, ancestors, hidden, undecided) => {
        if (null == node || true !== node.isVal || ancestors.has(node)) {
            return;
        }
        hidden = hidden || true === node.mark?.hide;
        const link = node.link;
        if (null != link) {
            if (undecided) {
                disjunct.push(formatPath(path));
            }
            else {
                const { from, key } = cut(path, node.relkey);
                const edge = { from, key, to: link, at: formatPath(path) };
                if (hidden) {
                    edge.hidden = true;
                }
                edges.push(edge);
            }
        }
        // A graph atom is TRANSPARENT here (RELATIONS P2): it carries the
        // field's value at the field's own position, and the graph is about
        // the value.
        if (true === node.isGraphAtom && undefined !== node.held) {
            visit(node.held, path, ancestors, hidden, undecided);
        }
        // An unresolved conjunction (a link waiting on a peer that never
        // came, a constraint still open) holds its terms at the SAME
        // position; every link among them is written there, and is an
        // edge. This is what a match-selected branch or a deferred refer()
        // looks like after evaluation.
        if (true === node.isConjunct && Array.isArray(node.peg)) {
            ancestors.add(node);
            for (const term of node.peg) {
                visit(term, path, ancestors, hidden, undecided);
            }
            ancestors.delete(node);
        }
        // AN UNRESOLVED DISJUNCTION IS NOT A VALUE (ADR-007), so a link
        // under one of its arms is not an edge. Its POSITION is collected
        // instead, so a figure can report what the document leaves
        // undecided rather than drawing it or dropping it in silence.
        if (true === node.isDisjunct && Array.isArray(node.peg)) {
            ancestors.add(node);
            for (const arm of node.peg) {
                visit(arm, path, ancestors, hidden, true);
            }
            ancestors.delete(node);
        }
        if ((true === node.isMap || true === node.isList) && null != node.peg) {
            ancestors.add(node);
            for (const k of Object.keys(node.peg)) {
                visit(node.peg[k], [...path, k], ancestors, hidden, undecided);
            }
            ancestors.delete(node);
        }
    };
    visit(root, [], new Set(), false, false);
    // DETERMINISTIC by construction, not by luck: edges by the position
    // they are written at, which is unique — one link, one place. That
    // holds through a conjunction too: its terms share the position, and
    // two links there would have had to unify into one.
    edges.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at));
    if (0 < disjunct.length) {
        return { edges, disjunct: [...new Set(disjunct)].sort(keyorder_1.cmpCodePoint) };
    }
    return { edges };
}
//# sourceMappingURL=graph.js.map