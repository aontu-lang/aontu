"use strict";
/* Copyright (c) 2021-2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aliasBudget = aliasBudget;
exports.aliasErrors = aliasErrors;
exports.expandAliases = expandAliases;
const err_1 = require("./err");
const keyorder_1 = require("./keyorder");
const MapVal_1 = require("./val/MapVal");
// EVERY ALIAS REFERENCE NAMES A DECLARED NAME, whether or not anything
// reaches it. Resolution is lazy, so a reference inside a template that
// nothing instantiates is never tried and a misspelling compiles clean.
// Whether a NAME is declared does not depend on what the tree holds, so
// it is answered here instead. See docs/design/ALIASES.0.md
function aliasErrors(ctx, root) {
    if (true !== root.isMap) {
        return;
    }
    const declared = new Set(root.aliasKeys);
    const seen = new Set();
    const visit = (v) => {
        if (null == v || true !== v.isVal || seen.has(v)) {
            return;
        }
        seen.add(v);
        if (true === v.isRef) {
            const key = v.aliasKey;
            if (undefined !== key && !declared.has(key)) {
                ctx.adderr((0, err_1.makeNilErr)(ctx, 'no_path', v, undefined, 'resolve'));
            }
            return;
        }
        if (true === v.isMap) {
            for (const k of Object.keys(v.peg)) {
                visit(v.peg[k]);
            }
        }
        else if (Array.isArray(v.peg)) {
            for (const e of v.peg) {
                visit(e);
            }
        }
        else if (null != v.peg && true === v.peg.isVal) {
            visit(v.peg);
        }
        if ((true === v.isMap || true === v.isList) && null != v.spread.cj) {
            visit(v.spread.cj);
        }
    };
    visit(root);
} /* node:coverage ignore next 3 */
// T-1 (ALIASES.0.md sections 7 and 9). Expansion TERMINATES -- no
// parameters, no recursion, a finite name set -- but a name that names
// names expands to the product of what they hold. The budget is on
// EXPANDED SIZE and charged here, ahead of evaluation.
function aliasBudget(ctx, root) {
    // A DOCUMENT THAT INCLUDES parses to a conjunct, not a map: the
    // deferred terms are where an included file's names arrive, so the
    // budget must see all of them, not only the first.
    const maps = [];
    const gather = (v) => {
        if (true === v?.isMap) {
            maps.push(v);
        }
        else if (true === v?.isConjunct && Array.isArray(v.peg)) {
            for (const t of v.peg) {
                gather(t);
            }
        }
    };
    gather(root);
    if (0 === maps.length) {
        return undefined;
    }
    const decl = {};
    for (const m of maps) {
        for (const k of m.aliasKeys) {
            decl[k] = m.peg[k];
        }
    }
    const limit = ctx.budget.alias;
    const size = new Map();
    const open = new Set();
    let over = undefined;
    // A cycle is refused at resolution, which has not run yet, so a name
    // already open costs nothing here rather than looping.
    const nameSize = (key) => {
        if (size.has(key)) {
            return size.get(key);
        }
        if (open.has(key) || !(key in decl)) {
            return 0;
        }
        open.add(key);
        const n = valSize(decl[key]);
        open.delete(key);
        size.set(key, n);
        return n;
    };
    const valSize = (v) => {
        if (true === v.isRef) {
            const key = v.aliasKey;
            return undefined === key ? 1 : 1 + nameSize(key);
        }
        let n = 1;
        if (true === v.isMap) {
            for (const k of Object.keys(v.peg)) {
                n += valSize(v.peg[k]);
            }
        }
        else if (Array.isArray(v.peg)) {
            for (const e of v.peg) {
                n += valSize(e);
            }
        }
        else if (null != v.peg && true === v.peg.isVal) {
            n += valSize(v.peg);
        }
        if ((true === v.isMap || true === v.isList) && null != v.spread?.cj) {
            n += valSize(v.spread.cj);
        }
        return limit < n ? limit + 1 : n;
    };
    let total = 0;
    for (const m of maps) {
        for (const k of Object.keys(m.peg)) {
            if (!(k in decl)) {
                total += valSize(m.peg[k]);
                if (limit < total) {
                    break;
                }
            }
        }
    }
    if (limit < total) {
        over = (0, err_1.makeNilErr)(ctx, 'alias_budget', root, undefined, 'resolve');
        over.details = { budget: '' + limit };
    }
    return over;
}
function expandAliases(root, snapmap) {
    if (true !== root.isMap) {
        return;
    }
    const seen = new Set();
    const visit = (v, stack) => {
        if (null == v || true !== v.isVal || seen.has(v)) {
            return;
        }
        seen.add(v);
        if (true === v.isRef) {
            const key = v.aliasKey;
            if (undefined === key) {
                return;
            }
            v.expansion = undefined;
            if (stack.includes(key)) {
                return;
            }
            const target = snapmap.get((0, MapVal_1.spreadSnapKey)(v)) ?? root.peg[key];
            if (null == target) {
                return;
            }
            v.expansion = target;
            visit(target, [...stack, key]);
            return;
        }
        if (true === v.isMap) {
            // A declaration is reached through its references, each under
            // its own name, never as a child: a self-reference inside it
            // is a knot only from inside.
            const keys = Object.keys(v.peg)
                .filter((k) => !v.aliasKeys.includes(k))
                .sort(keyorder_1.cmpCodePoint);
            for (const k of keys) {
                visit(v.peg[k], stack);
            }
        }
        else if (Array.isArray(v.peg)) {
            for (const e of v.peg) {
                visit(e, stack);
            }
        }
        else if (null != v.peg && true === v.peg.isVal) {
            visit(v.peg, stack);
        }
        if ((true === v.isMap || true === v.isList) && null != v.spread.cj) {
            visit(v.spread.cj, stack);
        }
    };
    visit(root, []);
} /* node:coverage ignore next 7 */
//# sourceMappingURL=alias.js.map