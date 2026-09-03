"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNodePath = parseNodePath;
exports.reachCheck = reachCheck;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
// REACHABILITY OVER THE LINK GRAPH (the review's finding J,
// use-cases/REVIEW.md): "ship a transitive `reaches(a, b)` check verb".
//
// `relations` answers questions about the edge set as a whole --- is it
// acyclic, does every edge have its inverse, is every far end what the
// relation says it is. This answers the question that needs the CLOSURE
// rather than the edges: does anything `a` depends on, at any remove,
// end up at `b`? That is the shape of every blast-radius question an
// operator asks ("if the billing database goes, what falls over?") and
// every containment question a policy asks ("nothing in the public tier
// may reach the ledger"), and neither can be expressed by looking one
// edge at a time.
//
// It is a VERB and not a constraint, for the same reason acyclicity is
// (docs/reference-language.md, "Declared relations"): reachability is
// global and non-monotone. One more edge can make an unreachable pair
// reachable, so a lattice citizen asserting non-reachability could be
// true and then false, and the lattice guarantee is that more
// information never falsifies what has already been observed.
//
// TRANSITIVE, NOT REFLEXIVE-TRANSITIVE: `reaches(a, a)` is true only
// when a path of one or more edges returns to `a`, which is the useful
// answer (it says the graph has a cycle through `a`) rather than the
// vacuous one.
//
// The Go twin is go/reach.go; what the two ports must agree on --- the
// verdict and the path --- is test/spec/reach.tsv.
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const graph_1 = require("./graph");
const keyorder_1 = require("./keyorder");
// The segments a `$.dotted` endpoint spells, or undefined when it is
// not one. Reachability is between TREE POSITIONS (ADR-014), so an
// endpoint is a path and nothing else --- the same spelling the report
// prints back.
function parseNodePath(s) {
    if ('$' === s) {
        return [];
    }
    if (!s.startsWith('$.')) {
        return undefined;
    }
    const parts = s.slice(2).split('.');
    return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) ? parts : undefined;
}
// Whether a path names a node of the evaluated tree. An endpoint that
// exists but has no edges is a perfectly good question with the answer
// `unreachable`; only one that names NOTHING is an error.
function nodeAt(root, path) {
    let node = root;
    for (const seg of path) {
        if (true !== node?.isMap && true !== node?.isList) {
            return false;
        }
        node = node.peg[seg];
        if (null == node) {
            return false;
        }
    }
    return null != node;
}
function endpointFinding(name, known) {
    return {
        code: 'refer_unresolved',
        class: 'reference',
        severity: 'error',
        path: '$',
        // NOT "unreachable". An endpoint that names no node is a question
        // the document cannot answer, and answering it `no` would report a
        // typo as a fact about the model --- the fail-open shape this
        // review exists to retire.
        message: `${name} names no node in this document.`,
        sites: [],
        ...(0 === known.length ? {} : {
            note: 'nodes with links: ' + known.join(', '),
        }),
    };
}
// The reachability check for one document.
function reachCheck(src, from, to, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const root = aontu.unify(src, parseOpts, ctx);
    // A document that does not stand up is not a document with an
    // unreachable pair: the errors it already has are the answer.
    if (0 < ctx.err.length || true === root?.isNil) {
        return {
            verdict: 'error',
            errors: [(0, vet_1.failureFinding)(ctx, options.path, root)],
        };
    }
    const graph = (0, graph_1.graphOf)(root);
    // The nodes the graph actually touches, for the error note: a
    // document has every path in it, and listing them all would drown the
    // one fact a mistyped endpoint needs.
    const linked = [...new Set(graph.edges
            .flatMap((e) => [e.from, e.to]))].sort(keyorder_1.cmpCodePoint);
    const missing = [from, to].filter((n) => {
        const parts = parseNodePath(n);
        return undefined === parts || !nodeAt(root, parts);
    });
    if (0 < missing.length) {
        return {
            verdict: 'error',
            errors: missing.map((n) => endpointFinding(n, linked)),
        };
    }
    // The successor map, restricted to one relation when the caller asked
    // for one. Sorted, so the path the search finds is the same one in
    // both ports.
    const succ = new Map();
    for (const e of graph.edges) {
        if (null != options.relation && options.relation !== e.key) {
            continue;
        }
        const list = succ.get(e.from);
        const dest = e.to;
        if (undefined === list) {
            succ.set(e.from, [dest]);
        }
        else if (!list.includes(dest)) {
            list.push(dest);
        }
    }
    for (const list of succ.values()) {
        list.sort(keyorder_1.cmpCodePoint);
    }
    // BREADTH-FIRST, so the path reported is a SHORTEST one --- the
    // evidence an operator wants is the tightest chain, not whichever the
    // walk happened to find first --- and, with the successors sorted, a
    // determined one: among shortest paths, the first in code-point order
    // at the first step that distinguishes them.
    const prev = new Map();
    const seen = new Set();
    let front = [from];
    while (0 < front.length) {
        const next = [];
        for (const node of front) {
            for (const dest of succ.get(node) ?? []) {
                if (dest === to) {
                    const path = [dest];
                    let step = node;
                    while (step !== from) {
                        path.unshift(step);
                        step = prev.get(step);
                    }
                    path.unshift(from);
                    return { verdict: 'reaches', path };
                }
                if (!seen.has(dest)) {
                    seen.add(dest);
                    prev.set(dest, node);
                    next.push(dest);
                }
            }
        }
        front = next;
    }
    return { verdict: 'unreachable' };
}
//# sourceMappingURL=reach.js.map