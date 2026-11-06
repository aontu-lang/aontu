"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationFindings = relationFindings;
exports.relationErrors = relationErrors;
exports.relationCheck = relationCheck;
/* Copyright (c) 2025 Richard Rodger, MIT License */
const utility_1 = require("./utility");
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const graph_1 = require("./graph");
const keyorder_1 = require("./keyorder");
const err_1 = require("./err");
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
function relationFindings(decls, graph) {
    const findings = [];
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
    findings.sort((a, b) => (0, keyorder_1.cmpCodePoint)(a.at, b.at) || (0, keyorder_1.cmpCodePoint)(a.code, b.code)
        || (0, keyorder_1.cmpCodePoint)(a.detail.join(' '), b.detail.join(' ')));
    return findings;
}
function relationErrors(ctx, root) {
    const decls = ctx._reldecls;
    if (0 === decls.size) {
        return;
    }
    const findings = relationFindings(decls, (0, graph_1.graphOf)(root));
    for (const f of findings) {
        let node = root;
        const at = f.at.slice(2).split('.');
        for (const seg of at) {
            // Graph atoms hold the field's value -- possibly nested, one
            // atom carrying another -- and the path steps through them
            // exactly as the graph walk does.
            while (true === node?.isGraphAtom) {
                node = node.held;
            }
            node = node?.peg?.[seg];
        }
        const nil = (0, err_1.makeNilErr)(ctx, f.code, node, undefined, 'relate', {
            relation: f.relation,
            detail: f.detail.join(' -> '),
        });
        nil.path = at;
        ctx.adderr(nil);
    }
}
// The relation checks for one document: evaluate, then report the
// same verdict generation enforces.
function relationCheck(src, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu((0, utility_1.includeOpts)(options));
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
    const counted = true === options.count ? { declared: decls.size } : {};
    if (0 === decls.size) {
        return { verdict: 'pass', findings: [], ...counted };
    }
    const gctx = ctx.clone({ err: [], collect: true });
    root.gen(gctx);
    if (0 < gctx.err.length) {
        return {
            verdict: 'error',
            findings: [],
            errors: [(0, vet_1.failureFinding)(gctx, options.path, root)],
        };
    }
    const findings = relationFindings(decls, (0, graph_1.graphOf)(root));
    return {
        verdict: 0 === findings.length ? 'pass' : 'fail',
        findings,
        ...counted,
    };
}
//# sourceMappingURL=relation.js.map