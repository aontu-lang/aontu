"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphOf = graphOf;
const keyorder_1 = require("./keyorder");
const formatPath = (path) => 0 === path.length ? '$' : '$.' + path.join('.');
// The nearest map key on the path below an entity: list indices are
// positions within a relation, not relations of their own. Digits-only
// segments are the indices, which is exactly how the rest of the engine
// spells them.
const relationKey = (tail) => {
    for (let i = tail.length - 1; 0 <= i; i--) {
        if (!/^[0-9]+$/.test(tail[i])) {
            return tail[i];
        }
    }
    return '';
};
// The graph of an evaluated tree. Walks POSITIONS, not values: two
// positions of one entity share a value object after the merge, so a
// walk guarded by object identity would find the entity once and miss
// every other place it is declared. The guard is therefore the
// ancestor chain — which is what a cycle actually is.
function graphOf(root) {
    const byId = new Map();
    const edges = [];
    const visit = (node, path, entity, tail, ancestors) => {
        if (null == node || true !== node.isVal || ancestors.has(node)) {
            return;
        }
        let inside = entity;
        let below = tail;
        const name = node.entity;
        if (null != name) {
            let paths = byId.get(name);
            if (undefined === paths) {
                paths = [];
                byId.set(name, paths);
            }
            paths.push(formatPath(path));
            // A nested entity is not a component of the one above it: the
            // key path restarts at the identified node.
            inside = name;
            below = [];
        }
        const link = node.link;
        if (null != link) {
            edges.push({
                from: inside,
                // A rel()-minted link carries its PREDICATE -- the key the
                // rel() sat on, declared in the schema -- and that beats the
                // path inference, which answered wrongly for map-valued
                // relations (it named the inner label, not the relation).
                // refer()-minted links keep the inference until P3 retires
                // them.
                key: node.relkey ?? relationKey(below),
                to: link,
                at: formatPath(path),
            });
        }
        if ((true === node.isMap || true === node.isList) && null != node.peg) {
            ancestors.add(node);
            for (const k of Object.keys(node.peg)) {
                visit(node.peg[k], [...path, k], inside, [...below, k], ancestors);
            }
            ancestors.delete(node);
        }
    };
    visit(root, [], '', [], new Set());
    // DETERMINISTIC by construction, not by luck: ids in code-point
    // order, each id's paths in code-point order, edges by the position
    // they are written at (which is unique — one link, one place).
    const entities = [...byId.keys()]
        .sort(keyorder_1.cmpCodePoint)
        .map((id) => ({ id, paths: byId.get(id).sort(keyorder_1.cmpCodePoint) }));
    edges.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at));
    return { entities, edges };
}
//# sourceMappingURL=graph.js.map