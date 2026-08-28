"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hcanon = hcanon;
exports.canonHash = canonHash;
// The HASH FORM (G6 phase 0, docs/capability-review/g6-distribution.md):
// exactly the unify-level canon with the additions that close its
// semantic gaps, so that two documents with the same hash form have the
// same meaning:
//
//   - a CLOSED map or list renders wrapped: close({...}), close([...])
//     (canon drops closedness);
//   - the type/hide MARKS render as their builtin wrappers: type(x),
//     hide(x) (canon drops marks).
//
// Both additions reuse existing parseable syntax, so the hash form
// remains valid Aontu source and round-trips:
// hcanon(unify(parse(hcanon(v)))) == hcanon(v) is a spec-suite property
// (test/spec/hcanon.tsv). User-facing canon is UNCHANGED — hcanon is a
// separate rendering.
//
// The marks PROPAGATE to every descendant at unification (walkMark), so
// a wrapper is emitted only where a mark STARTS: the walk carries the
// inherited marks down and a child whose mark the parent already
// carries renders bare. Without that, hide({a:1}) would render every
// leaf re-wrapped — still correct, never minimal, and not what the
// source said.
//
// canonHash (G6 phase 1) is the pin built on it:
//   "aon1-" + base64url( SHA-256( UTF-8( hcanon(v) ) ) )
// (unpadded base64url, RFC 4648 section 5). The "aon1-" scheme id
// exists so a future semantically-stronger normal form is an upgrade,
// not a breakage. This is a CANONICAL-TEXT hash, not a semantic
// equivalence class: the failure direction is the safe one — a false
// "changed" forces a needless re-review; a false "unchanged" would need
// two hash forms with the same bytes and different meanings, which is
// exactly the gap the close/mark wrappers exist to shut.
const node_crypto_1 = require("node:crypto");
const keyorder_1 = require("./keyorder");
// One node's rendering, carrying the marks the ANCESTORS already
// wrapped. Bags and junctions recurse structurally (their canon getters
// render children through plain canon, which would drop a nested
// close); everything else — scalars, kinds, funcs, refs, constraints —
// delegates to its own canon, whose text is already in cross-port
// parity. The non-Val arm mirrors MapVal.canon's raw-peg fallback and
// is unreachable through an evaluated tree (direct-tested, ADR-002).
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
        // Alias declarations are dropped here for the same reason
        // MapVal.canon drops them, and this is the surface where it counts:
        // `aon1-` pins MEANING, so a document written with aliases and the
        // same document written longhand must hash to one string. Two
        // renderers, one rule -- hcanon is not canon and does not inherit
        // the filter (docs/design/ALIASES.0.md §4).
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
    else {
        s = v.canon;
    }
    // The IDENTITY is innermost, exactly as canon writes it (G4 phase
    // 1). It is IN the hash — a node declared `id(svc/auth)` and the
    // same node declared `id(svc/billing)` describe different systems,
    // and a pin that could not tell them apart would be a pin on the
    // shape rather than on the meaning.
    const e = v.entity;
    if (null != e) {
        s = 'id(' + JSON.stringify(e) + ')&' + s;
    }
    if (mtype && !inh.type) {
        s = 'type(' + s + ')';
    }
    if (mhide && !inh.hide) {
        s = 'hide(' + s + ')';
    }
    // The deprecation record rides outermost, as canonRiders
    // renders it (the wrappers are all reparseable calls, so order only
    // has to be FIXED, and this matches the canon the G3 rows pinned).
    const d = v.deprecation;
    if (null != d) {
        const dkeys = Object.keys(d).sort();
        const rec = dkeys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(d[k])).join(',');
        s = 'deprecate(' + s + ('' === rec ? '' : ',{' + rec + '}') + ')';
    }
    return s;
}
// The JunctionVal.canon parenthesisation rule, kept: a member that is
// itself a junction with more than one term keeps its parens so the
// text reparses with the same structure (`(1|2)&3`, not the
// differently-parsing `1|2&3`). Post-unification junctions are
// flattened by norm, so no SOURCE reaches the wrapping arm -- it is
// pinned by direct tests over constructed Vals in both ports, because
// a hash form that could render ambiguously would be a pin that
// silently agrees with a document it should not.
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
// The canon-hash pin. Scoped to the module evaluated STANDALONE: its
// own include closure resolved and unified at its own root, before any
// consumer context — which is what makes the pin transitive (an edit
// two includes deep changes the unified root, hence the hash).
function canonHash(v) {
    return 'aon1-' +
        (0, node_crypto_1.createHash)('sha256').update(hcanon(v), 'utf8').digest('base64url');
}
//# sourceMappingURL=hcanon.js.map