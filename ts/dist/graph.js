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
    const visit = (node, path, ancestors) => {
        if (null == node || true !== node.isVal || ancestors.has(node)) {
            return;
        }
        const link = node.link;
        if (null != link) {
            const { from, key } = cut(path, node.relkey);
            edges.push({ from, key, to: link, at: formatPath(path) });
        }
        // A graph atom is TRANSPARENT here (RELATIONS P2): it carries the
        // field's value at the field's own position, and the graph is about
        // the value.
        if (true === node.isGraphAtom && undefined !== node.held) {
            visit(node.held, path, ancestors);
        }
        if ((true === node.isMap || true === node.isList) && null != node.peg) {
            ancestors.add(node);
            for (const k of Object.keys(node.peg)) {
                visit(node.peg[k], [...path, k], ancestors);
            }
            ancestors.delete(node);
        }
    };
    visit(root, [], new Set());
    // DETERMINISTIC by construction, not by luck: edges by the position
    // they are written at, which is unique — one link, one place.
    edges.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at));
    return { edges };
}
//# sourceMappingURL=graph.js.map