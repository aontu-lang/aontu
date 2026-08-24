"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.diff = diff;
// PATH-ADDRESSED DIFF (G7 phase 6,
// docs/capability-review/g7-machine-access.md): what changed, at which
// paths, between two documents — the dyff-style answer, which
// deterministic canon makes possible without phantom noise. Two
// documents that mean the same thing canon the same way, so a diff of
// canons reports semantic change and not reformatting.
//
// The text compared is the HASH FORM (G6's `hcanon`), not the plain
// canon, for the reason G6 gives: canon drops closedness and the
// type/hide marks, so a canon diff calls `close({a:1})` and `{a:1}`
// identical. A false "changed" costs a needless read; a false
// "unchanged" is a change nobody reviewed, which is the one direction
// that must not happen.
//
// WHETHER a change is BREAKING is a different question, and it belongs
// to G3: `subsume` and `breaking` answer it with the lattice's own
// rules. This verb answers "what moved", which is what a reviewer
// reads first and what an agent needs before it can ask the other
// question at all.
const aontu_1 = require("./aontu");
const vet_1 = require("./vet");
const keyorder_1 = require("./keyorder");
const hcanon_1 = require("./hcanon");
const query_1 = require("./query");
function pathText(parts) {
    return '$' + (0 < parts.length ? '.' + parts.join('.') : '');
}
// Both sides of one node — never both absent: keys come from the
// union of the two bags, and list indices run to the longer side, so
// every walk has at least one value. Bags of the SAME kind recurse,
// which is what makes the report path-addressed rather than one line
// saying the whole document changed; everything else compares text.
function walk(left, right, parts, out) {
    if (null == left) {
        out.push({ kind: 'added', path: pathText(parts), right: (0, hcanon_1.hcanon)(right) });
        return;
    }
    if (null == right) {
        out.push({ kind: 'removed', left: (0, hcanon_1.hcanon)(left), path: pathText(parts) });
        return;
    }
    const bothMaps = true === left.isMap && true === right.isMap;
    const bothLists = true === left.isList && true === right.isList;
    if (bothMaps || bothLists) {
        // The bag's OWN attributes, at pseudo-keys under it: a recursing
        // bag never compares its own text, so what the children do not
        // carry has to be compared here. The spread is part of what a bag
        // MEANS; so are closedness and the marks, which is exactly why the
        // hash form spells them (G6).
        const lc = null == left.spread.cj ? undefined : (0, hcanon_1.hcanon)(left.spread.cj);
        const rc = null == right.spread.cj ? undefined : (0, hcanon_1.hcanon)(right.spread.cj);
        if (lc !== rc) {
            out.push({
                kind: null == lc ? 'added' : null == rc ? 'removed' : 'changed',
                ...(null == lc ? {} : { left: lc }),
                path: pathText(parts.concat('&')),
                ...(null == rc ? {} : { right: rc }),
            });
        }
        flag(left.closed, right.closed, parts, 'closed', out);
        flag(left.mark?.type, right.mark?.type, parts, 'type', out);
        flag(left.mark?.hide, right.mark?.hide, parts, 'hide', out);
        const keys = bothMaps
            ? [...new Set([
                    ...Object.keys(left.peg), ...Object.keys(right.peg),
                ])].sort(keyorder_1.cmpCodePoint)
            : [...new Set([
                    ...Object.keys(left.peg), ...Object.keys(right.peg),
                ])].sort((a, b) => Number(a) - Number(b));
        for (const k of keys) {
            walk(left.peg[k], right.peg[k], parts.concat(k), out);
        }
        return;
    }
    const lh = (0, hcanon_1.hcanon)(left);
    const rh = (0, hcanon_1.hcanon)(right);
    if (lh !== rh) {
        out.push({ kind: 'changed', left: lh, path: pathText(parts), right: rh });
    }
}
// One boolean attribute of a bag, as a pseudo-key: `$.a.&closed` says
// the map at `$.a` was closed (or opened) without saying anything
// about its keys.
function flag(left, right, parts, name, out) {
    const l = true === left;
    const r = true === right;
    if (l !== r) {
        out.push({
            kind: 'changed',
            left: String(l),
            path: pathText(parts.concat('&' + name)),
            right: String(r),
        });
    }
}
function evalSide(aontu, src, path, at) {
    const ctx = aontu.ctx({ collect: true });
    const parseOpts = null == path ? undefined : { path };
    const root = aontu.unify(src, parseOpts, ctx);
    if (0 < ctx.err.length) {
        // The query surface's own fold: a document that does not stand up
        // has no meaning to compare, and the engine's diagnosis is the
        // report.
        return { finding: (0, query_1.evalFailure)(ctx) };
    }
    const node = null == at ? root : (0, vet_1.anchorAt)(root, at);
    if (null == node) {
        return {
            finding: {
                code: 'no_path',
                class: 'reference',
                severity: 'error',
                path: at,
                message: `The path ${at} names nothing in this document.`,
                sites: [],
            },
        };
    }
    return { node };
}
// Diff two documents. Each is evaluated on its own — a document that
// does not stand up has no meaning to compare, and the report says so
// rather than diffing a wreck.
function diff(leftSrc, rightSrc, opts) {
    const options = opts ?? {};
    const aontu = new aontu_1.Aontu(null == options.trust ? undefined : { trust: options.trust });
    const l = evalSide(aontu, leftSrc, options.leftPath, options.at);
    const r = evalSide(aontu, rightSrc, options.rightPath, options.at);
    const findings = [l.finding, r.finding].filter(Boolean);
    if (0 < findings.length) {
        return { changes: [], findings, ok: false, same: false };
    }
    const changes = [];
    walk(l.node, r.node, [], changes);
    return { changes, findings: [], ok: true, same: 0 === changes.length };
}
//# sourceMappingURL=diff.js.map