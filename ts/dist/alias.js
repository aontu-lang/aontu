"use strict";
/* Copyright (c) 2021-2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
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
            const name = v.aliasName;
            if (undefined !== name && !declared.has(name)) {
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
            const name = v.aliasName;
            if (undefined === name) {
                return;
            }
            v.expansion = undefined;
            if (stack.includes(name)) {
                return;
            }
            const target = snapmap.get((0, MapVal_1.spreadSnapKey)(v)) ?? root.peg[name];
            if (null == target) {
                return;
            }
            v.expansion = target;
            visit(target, [...stack, name]);
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
} /* node:coverage ignore next 6 */
//# sourceMappingURL=alias.js.map