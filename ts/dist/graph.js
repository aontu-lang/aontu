"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphOf = graphOf;
exports.writtenOf = writtenOf;
exports.declsOf = declsOf;
const keyorder_1 = require("./keyorder");
const formatPath = (path) => 0 === path.length ? '$' : '$.' + path.join('.');
// Digits-only segments are list indices, which is exactly how the rest
// of the engine spells them.
const isIndex = (seg) => /^[0-9]+$/.test(seg);
const PREDICATE_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/;
const cut = (at) => {
    let i = at.length - 1;
    for (; 0 <= i && isIndex(at[i]); i--) { }
    return 0 > i
        ? { from: formatPath([]), key: '' }
        : { from: formatPath(at.slice(0, i)), key: at[i] };
};
// The arms generation writes: the preference of the lowest rank, or every arm, which it writes only alike.
const picked = (arms) => {
    const prefs = arms.filter((arm) => true === arm.isPref);
    return 0 === prefs.length ? arms :
        [prefs.reduce((best, p) => p.rank < best.rank ? p : best)];
};
function walk(root, written) {
    const edges = [];
    const disjunct = [];
    const decls = new Map();
    const sites = new Map();
    // ONE WALK, with `undecided` saying which side of the disjunction it is on:
    // a default and the arm generation picks are decided (ruling 94); below
    // a disjunction with no preferred arm every link is undecided unless
    // read as `written`, which takes every arm (ruling 95).
    const visit = (node, path, ancestors, hidden, undecided, under) => {
        if (null == node || true !== node.isVal || ancestors.has(node)) {
            return;
        }
        hidden = hidden || true === node.mark?.hide;
        // A graph atom declares where it is met, as a link is an edge: never
        // below an unresolved disjunction.
        const name = path[path.length - 1] ?? '';
        if (null != node.reldecl && !undecided && PREDICATE_NAME.test(name)) {
            const d = decls.get(name) ?? { inverses: new Set() };
            d.acyclic = d.acyclic || node.reldecl.acyclic;
            node.reldecl.inverses.forEach((k) => d.inverses.add(k));
            decls.set(name, d);
        }
        const link = node.link;
        if (null != link) {
            if (undecided) {
                disjunct.push(formatPath(path));
            }
            else {
                const { from, key } = true === node.relroot || undefined === under
                    ? cut(path)
                    : { from: formatPath(under.slice(0, -1)), key: under[under.length - 1] };
                const edge = { from, key, to: link, at: formatPath(path) };
                if (hidden) {
                    edge.hidden = true;
                }
                edges.push(edge);
                sites.set(edge.at, sites.get(edge.at) ?? node);
            }
        }
        if (true === node.isConjunct && Array.isArray(node.peg)) {
            ancestors.add(node);
            for (const term of node.peg) {
                visit(term, path, ancestors, hidden, undecided, under);
            }
            ancestors.delete(node);
        }
        if (true === node.isDisjunct && Array.isArray(node.peg)) {
            ancestors.add(node);
            const arms = picked(node.peg);
            const open = !written && arms === node.peg;
            for (const arm of arms) {
                visit(arm, path, ancestors, hidden, undecided || open, under);
            }
            ancestors.delete(node);
        }
        if (true === node.isPref) {
            ancestors.add(node);
            visit(node.peg, path, ancestors, hidden, undecided, under);
            ancestors.delete(node);
        }
        if ((true === node.isMap || true === node.isList) && null != node.peg) {
            // Canon writes `relate()` at this field, so the field names the edges.
            if (true === node.relroot) {
                under = 0 < path.length && PREDICATE_NAME.test(path[path.length - 1])
                    ? path : undefined;
            }
            ancestors.add(node);
            for (const k of Object.keys(node.peg)) {
                visit(node.peg[k], [...path, k], ancestors, hidden, undecided, under);
            }
            ancestors.delete(node);
        }
    };
    visit(root, [], new Set(), false, false, undefined);
    edges.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at));
    return { edges, disjunct, decls, sites };
}
function graphOf(root) {
    const { edges, disjunct } = walk(root, false);
    if (0 < disjunct.length) {
        return { edges, disjunct: [...new Set(disjunct)].sort(keyorder_1.cmpCodePoint) };
    }
    return { edges };
}
function writtenOf(root) {
    const { edges, decls, sites } = walk(root, true);
    return { graph: { edges }, decls, sites };
}
// The relation declarations: every graph atom the finished value holds,
// read by the key it is met at, hidden or not.
function declsOf(root) {
    return walk(root, false).decls;
}
//# sourceMappingURL=graph.js.map