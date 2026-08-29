"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reachCheck = reachCheck;
// REACHABILITY OVER THE ENTITY GRAPH (the review's finding J,
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
// The entity an address names --- everything before the first dot. A
// link into `svc_auth.ports.http` reaches `svc_auth`: reachability is
// between ENTITIES, and the path inside one says which part of it the
// link arrives at. Same rule as relation.ts's entityOf, and it has to
// be, or the two verbs would disagree about what an edge connects.
function entityOf(addr) {
    const dot = addr.indexOf('.');
    return dot < 0 ? addr : addr.slice(0, dot);
}
function endpointFinding(name, known) {
    return {
        code: 'refer_unresolved',
        class: 'reference',
        severity: 'error',
        path: '$',
        // NOT "unreachable". An endpoint that names no entity is a
        // question the document cannot answer, and answering it `no` would
        // report a typo as a fact about the model --- the fail-open shape
        // this review exists to retire.
        message: `${name} names no entity in this document.`,
        sites: [],
        ...(0 === known.length ? {} : {
            note: 'known entities: ' + known.join(', '),
        }),
    };
}
// The reachability check for one document.
function reachCheck(src, from, to, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
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
    const known = graph.entities.map((e) => e.id).sort(keyorder_1.cmpCodePoint);
    const missing = [from, to].filter((n) => !known.includes(n));
    if (0 < missing.length) {
        return {
            verdict: 'error',
            errors: missing.map((n) => endpointFinding(n, known)),
        };
    }
    // The successor map, restricted to one relation when the caller asked
    // for one. Sorted, so the path the search finds is the same one in
    // both ports.
    const succ = new Map();
    for (const e of graph.edges) {
        if ('' === e.from ||
            (null != options.relation && options.relation !== e.key)) {
            continue;
        }
        const list = succ.get(e.from);
        const dest = entityOf(e.to);
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