"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hcanon = hcanon;
exports.canonHash = canonHash;
const node_crypto_1 = require("node:crypto");
const keyorder_1 = require("./keyorder");
const rider_1 = require("./rider");
function render(v, inh) {
    if (true !== v?.isVal) {
        return String(v);
    }
    const mtype = true === v.mark?.type;
    const mhide = true === v.mark?.hide;
    const inner = {
        type: inh.type || mtype,
        hide: inh.hide || mhide,
    };
    let s;
    if (true === v.isMap) {
        const keys = Object.keys(v.peg)
            .filter((k) => !v.aliasKeys.includes(k))
            .sort(keyorder_1.cmpCodePoint);
        s = '{' +
            (v.spread.cj ? '&:' + render(v.spread.cj, inner) +
                (0 < keys.length ? ',' : '') : '') +
            keys.map((k) => JSON.stringify(k) +
                (v.optionalKeys.includes(k) ? '?' : '') +
                ':' +
                render(v.peg[k], inner)).join(',') +
            '}';
        if (true === v.closed) {
            s = 'close(' + s + ')';
        }
    }
    else if (true === v.isList) {
        const keys = Object.keys(v.peg);
        s = '[' +
            (v.spread.cj ? '&:' + render(v.spread.cj, inner) +
                (0 < keys.length ? ',' : '') : '') +
            keys.map((k) => render(v.peg[k], inner)).join(',') +
            ']';
        if (true === v.closed) {
            s = 'close(' + s + ')';
        }
    }
    else if (true === v.isPref) {
        s = '*' + render(v.peg, inner);
    }
    else if (true === v.isConjunct || true === v.isDisjunct) {
        s = junctionText(v, true === v.isConjunct ? '&' : '|', inner);
    }
    else if (true === v.isRef && undefined !== v.expansion) {
        s = render(v.expansion, inner);
    }
    else {
        s = v.canon;
    }
    if (mtype && !inh.type) {
        s = 'type(' + s + ')';
    }
    if (mhide && !inh.hide) {
        s = 'hide(' + s + ')';
    }
    // The riders go outermost, as canonRiders renders them: the wrappers
    // are reparseable calls, so the order only has to be fixed.
    return (0, rider_1.riderText)(s, v);
}
function junctionText(v, sym, inner) {
    return v.peg.map((m) => true === m?.isJunction && 1 < m.peg.length
        ? '(' + render(m, inner) + ')'
        : render(m, inner))
        .join(sym);
}
// The hash form of an EVALUATED Val (unify first; parse-level canon
// parenthesisation differs between the ports and is excluded by
// construction — AGENTS.md).
function hcanon(v) {
    return render(v, { type: false, hide: false });
}
function canonHash(v) {
    return 'aon1-' +
        (0, node_crypto_1.createHash)('sha256').update(hcanon(v), 'utf8').digest('base64url');
}
//# sourceMappingURL=hcanon.js.map