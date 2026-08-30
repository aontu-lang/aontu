"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationFindings = relationFindings;
exports.relationErrors = relationErrors;
exports.relationCheck = relationCheck;
// RELATION GRAPH VERDICTS (RELATIONS.0.md §3.3, replacing the G4
// phase 5 magic-key pass): acyclicity and inverse consistency over
// the edge set, DECLARED by the graph atoms -- `acyclic()` and
// `inverse(name)` conjoined at the field whose key is the predicate
// -- and decided AFTER unification, never by it.
//
// Why not in the lattice. Both properties are GLOBAL and NON-MONOTONE:
// an acyclic graph becomes cyclic when one more edge unifies in, and an
// inverse that is present becomes absent when the far side is narrowed.
// The lattice guarantee is that more information never falsifies what
// has been observed, so a constraint that could be true and then false
// is not a constraint the lattice may hold. These are facts about the
// finished model, so the atoms only REGISTER during unification
// (GraphAtomVal.register, onto ctx._reldecls), and the verdict lands
// at GENERATION -- the sizing atoms' model -- where no more
// information can arrive. The `relations` verb reports the same
// verdict from the same declarations: one decision, two surfaces.
//
// The old declaration channel -- a `relations:` key at the document
// root, read by name -- is GONE, discharging ADR-010's grandfather
// clause: the engine no longer knows any spellable key. The target
// half of the old declaration is `rel(t)`'s flow at the site, which
// checks by unifying rather than by a report-layer probe.
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const graph_1 = require("./graph");
const keyorder_1 = require("./keyorder");
const err_1 = require("./err");
// The first cycle reachable from `start`, as the node paths it runs
// through, or undefined. Depth-first with the path as the stack, and
// the successors visited in sorted order, so the cycle a report names
// is the same one in both ports.
function findCycle(start, succ, done) {
    const stack = [];
    const onStack = new Set();
    const walk = (node) => {
        if (onStack.has(node)) {
            return [...stack.slice(stack.indexOf(node)), node];
        }
        if (done.has(node)) {
            return undefined;
        }
        done.add(node);
        stack.push(node);
        onStack.add(node);
        for (const next of succ.get(node) ?? []) {
            const found = walk(next);
            if (undefined !== found) {
                return found;
            }
        }
        stack.pop();
        onStack.delete(node);
        return undefined;
    };
    return walk(start);
}
// The verdict itself, pure over what the evaluation produced: the
// registered declarations and the edge set. Shared by the generation
// hook (relationErrors) and the `relations` verb, so the two surfaces
// cannot disagree.
function relationFindings(decls, graph) {
    const findings = [];
    // The edge set, indexed the two ways the checks read it.
    const byRelation = new Map();
    const pairs = new Set();
    for (const e of graph.edges) {
        const list = byRelation.get(e.key);
        if (undefined === list) {
            byRelation.set(e.key, [e]);
        }
        else {
            list.push(e);
        }
        pairs.add(e.key + ' ' + e.from + ' ' + e.to);
    }
    // Predicates in sorted order, so the findings arrive the same way
    // in both ports (the registry is insertion-ordered here, random in
    // Go).
    const names = [...decls.keys()].sort(keyorder_1.cmpCodePoint);
    for (const name of names) {
        const decl = decls.get(name);
        const mine = byRelation.get(name) ?? [];
        if (true === decl.acyclic) {
            const succ = new Map();
            for (const e of mine) {
                const list = succ.get(e.from);
                const to = e.to;
                if (undefined === list) {
                    succ.set(e.from, [to]);
                }
                else {
                    list.push(to);
                }
            }
            for (const list of succ.values()) {
                list.sort(keyorder_1.cmpCodePoint);
            }
            // The roots are visited in sorted order, and a node already
            // settled is not revisited, so one cycle is reported once and the
            // SAME one in both ports.
            const done = new Set();
            const roots = [...succ.keys()].sort(keyorder_1.cmpCodePoint);
            for (const from of roots) {
                const cycle = findCycle(from, succ, done);
                if (undefined !== cycle) {
                    // The cycle's first node is a key of `succ`, and every key of
                    // `succ` came from an edge's `from`, so the edge is there.
                    const at = mine.find((e) => e.from === cycle[0]);
                    findings.push({
                        code: 'relation_cycle',
                        relation: name,
                        at: at.at,
                        detail: cycle,
                    });
                    break;
                }
            }
        }
        const inverses = [...decl.inverses].sort(keyorder_1.cmpCodePoint);
        for (const inv of inverses) {
            for (const e of mine) {
                const to = e.to;
                if (!pairs.has(inv + ' ' + to + ' ' + e.from)) {
                    findings.push({
                        code: 'relation_inverse_missing',
                        relation: name,
                        at: e.at,
                        detail: [e.from, to, inv],
                    });
                }
            }
        }
    }
    // SORTED, because a report is read by a machine that diffs it: by the
    // position the offending edge is written at, then by code, then by
    // the detail (two inverse declarations on one predicate can flag one
    // edge twice). The sort is STABLE and the predicates were iterated
    // in sorted order, so what order remains is fixed anyway.
    findings.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at) || (0, keyorder_1.cmpCodePoint)(a.code, b.code)
        || (0, keyorder_1.cmpCodePoint)(a.detail.join(' '), b.detail.join(' ')));
    return findings;
}
// The generation hook (Aontu.generate, between unification success
// and value generation): each finding becomes a LOCATED evaluation
// error at the offending edge, exactly as an unmet sizing atom
// refuses at generation. Findings name node paths and positions the
// document spelled, so the walk to the site cannot miss.
function relationErrors(ctx, root) {
    const decls = ctx._reldecls;
    if (0 === decls.size) {
        return;
    }
    const findings = relationFindings(decls, (0, graph_1.graphOf)(root));
    for (const f of findings) {
        let node = root;
        for (const seg of f.at.slice(2).split('.')) {
            // Graph atoms hold the field's value -- possibly nested, one
            // atom carrying another -- and the path steps through them
            // exactly as the graph walk does.
            while (true === node?.isGraphAtom) {
                node = node.held;
            }
            node = node?.peg?.[seg];
        }
        // No unwrap AFTER the walk: a finding's `at` names an edge
        // element, and an edge's element is a string -- an atom-wrapped
        // element mints no edge in the first place (the graph visit
        // descends atoms only at field values), so the walk cannot end on
        // an atom.
        ctx.adderr((0, err_1.makeNilErr)(ctx, f.code, node, undefined, 'relate', {
            relation: f.relation,
            detail: f.detail.join(' -> '),
        }));
    }
}
// The relation checks for one document: evaluate, then report the
// same verdict generation enforces.
function relationCheck(src, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == options.path ? undefined : { path: options.path };
    const root = aontu.unify(src, parseOpts, ctx);
    // A document that does not stand up is not a document with a bad
    // graph: the errors it already has are the answer, and blaming its
    // relations on top would be noise.
    if (0 < ctx.err.length || true === root?.isNil) {
        return {
            verdict: 'error',
            findings: [],
            errors: [(0, vet_1.failureFinding)(ctx, options.path, root)],
        };
    }
    const decls = ctx._reldecls;
    if (0 === decls.size) {
        return { verdict: 'pass', findings: [] };
    }
    const findings = relationFindings(decls, (0, graph_1.graphOf)(root));
    return {
        verdict: 0 === findings.length ? 'pass' : 'fail',
        findings,
    };
}
//# sourceMappingURL=relation.js.map