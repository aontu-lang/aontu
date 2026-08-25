"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkVals = walkVals;
exports.collectNils = collectNils;
// One tree walk, two consumers: the language server collects NilVals
// for diagnostics (ts/src/lsp.ts) and the validation verb both stamps
// provenance and collects NilVals for findings (ts/src/vet.ts). They had
// the same traversal written out twice, which is one copy too many for
// something with three easy ways to be subtly wrong:
//
//   - a Val's children live under `peg`, which is an ARRAY for lists,
//     conjuncts and disjuncts, and an OBJECT for maps;
//   - a spread constraint lives OFF-peg (`spread.cj`), so a value inside
//     a `&:` template is reachable only by following it deliberately;
//   - the `seen` set is a termination guard, not an optimisation, and
//     the non-Val guard is load-bearing too: a peg object can hold
//     entries that are not Vals.
//
// The visitor returns false to prune the subtree below a node, which is
// how a nil collector stops at the nil rather than walking into the
// operands it carries.
function walkVals(v, visit, seen) {
    if (null == v || 'object' !== typeof v || true !== v.isVal) {
        return;
    }
    if (seen.has(v)) {
        return;
    }
    seen.add(v);
    if (!visit(v)) {
        return;
    }
    const peg = v.peg;
    if (Array.isArray(peg)) {
        for (const c of peg) {
            walkVals(c, visit, seen);
        }
    }
    else if (null != peg && 'object' === typeof peg) {
        for (const k in peg) {
            walkVals(peg[k], visit, seen);
        }
    }
    const spread = v.spread?.cj;
    if (spread) {
        walkVals(spread, visit, seen);
    }
    // OFF-PEG VALUES THAT CAN BE REPORTED. A preference carries the type
    // yardstick it derived from its own value, and a `must` carries the
    // value it checks against; neither is a peg entry, and both can end
    // up as an operand of a failure — the preference's yardstick is what
    // `*1 & {}` conflicts with. A caller
    // that stamps provenance (ts/src/vet.ts) has to reach them, or a
    // report names the document such a value came from as "unknown",
    // and the two ports disagree about it (go/walk.go does the same).
    walkVals(v.superpeg, visit, seen);
    for (const must of (v.musts ?? [])) {
        walkVals(must?.v, visit, seen);
    }
    // A FAILURE'S OPERANDS, for the same reason and with the same
    // safety. They are not peg entries, and they are exactly what a
    // report names: a finding's sites are the nil's primary and
    // secondary (ts/src/vet.ts, siteOf). A visitor that PRUNES at a nil
    // never gets here -- collectNils returns false and this line is
    // behind that gate -- so a nil collector is unaffected. A visitor
    // that does not prune, and stamping provenance is the one that does
    // not, must reach them or a broken schema's finding names no file at
    // all (go/walk.go does the same).
    walkVals(v.primary, visit, seen);
    walkVals(v.secondary, visit, seen);
}
// Every NilVal in the tree, in walk order. Callers that need a stable
// order across the two ports must sort — the walk follows raw key
// order, and the hosts disagree about that (ts/src/keyorder.ts).
//
// The `seen` set is the caller's, not an internal detail: both callers
// go on to dedup context-only errors against the nils already found,
// which is only possible if they hold the set.
function collectNils(root, seen) {
    const out = [];
    walkVals(root, (v) => {
        if (true === v.isNil) {
            out.push(v);
            return false;
        }
        return true;
    }, seen);
    return out;
}
//# sourceMappingURL=walk.js.map