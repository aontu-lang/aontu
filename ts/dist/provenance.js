"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Provenance = exports.FROM_SPREAD = void 0;
exports.markSpread = markSpread;
// Set on a spread template's per-key clone, at the one place a spread
// is applied (MapVal/ListVal.unify). Nothing else reads it.
exports.FROM_SPREAD = '_fromSpread';
// Mark a spread clone and everything inside it, so a contribution
// several levels down a template is still known to have come from the
// template. ONLY on an instrumented run: the walk is O(template) per
// key per pass, which is real money on a large model and buys nothing
// when no one is recording.
function markSpread(v) {
    if (null == v || true !== v.isVal || true === v[exports.FROM_SPREAD]) {
        return;
    }
    v[exports.FROM_SPREAD] = true;
    if (true === v.isMap && null != v.peg) {
        for (const k of Object.keys(v.peg)) {
            markSpread(v.peg[k]);
        }
    }
    else if (true === v.isList && null != v.peg) {
        for (const k of Object.keys(v.peg)) {
            markSpread(v.peg[k]);
        }
    }
    else if (Array.isArray(v.peg)) {
        // A junction, a func's arguments, an op's operands: every one of
        // them can hold the value that reaches the destination.
        for (const m of v.peg) {
            markSpread(m);
        }
    }
    else if (true === v.isPref) {
        markSpread(v.peg);
    }
}
// Every val id structurally inside v (not v itself), by the same walk
// markSpread makes: bags, junctions, func arguments, preferences.
function insideIds(v, out) {
    const kids = (true === v.isMap || true === v.isList) && null != v.peg
        ? Object.keys(v.peg).map((k) => v.peg[k])
        : Array.isArray(v.peg) ? v.peg
            : true === v.isPref ? [v.peg]
                : [];
    for (const k of kids) {
        if (null != k && true === k.isVal && !out.has(k.id)) {
            out.add(k.id);
            insideIds(k, out);
        }
    }
}
// Order contributions the way the document reads: by file, then row,
// then column, with the canon as the last tiebreak so the order is
// total even for two values written at the same position (which a
// merged duplicate key can produce).
function cmpSite(a, b) {
    return a.site.file.localeCompare(b.site.file) ||
        a.site.row - b.site.row ||
        a.site.col - b.site.col ||
        a.canon.localeCompare(b.canon);
}
function roleOf(v) {
    if (true === v[exports.FROM_SPREAD]) {
        return 'spread';
    }
    if (true === v.isRef) {
        return 'ref';
    }
    if (true === v.isPref) {
        return 'pref';
    }
    return 'literal';
}
class Provenance {
    constructor() {
        this.paths = new Map();
        // Ids of the values the AUTHOR WROTE: everything in the parsed tree,
        // stamped before unification starts. A value minted during
        // unification — a kind lifted from a leaf while a disjunct trials
        // its members, a fold's intermediate — is the engine's own work, not
        // a contribution the author can be pointed at. The one exception is
        // a SPREAD clone, which is an authored template re-minted per key
        // and carries FROM_SPREAD to say so.
        this.written = new Set();
    }
    // Stamp the parsed tree. Called once, before unify, by `why`.
    writtenFrom(v) {
        if (null == v || true !== v.isVal || this.written.has(v.id)) {
            return;
        }
        this.written.add(v.id);
        const kids = (true === v.isMap || true === v.isList) && null != v.peg
            ? Object.keys(v.peg).map((k) => v.peg[k])
            : Array.isArray(v.peg) ? v.peg
                : null != v.peg && true === v.peg.isVal ? [v.peg]
                    : [];
        for (const k of kids) {
            this.writtenFrom(k);
        }
        if (null != v.spread?.cj) {
            this.writtenFrom(v.spread.cj);
        }
    }
    // One meet. Both operands are candidate contributions; the result is
    // remembered so a later meet does not mistake it for a source.
    record(path, a, b, out) {
        const key = path.join('.');
        let rec = this.paths.get(key);
        if (null == rec) {
            rec = {
                conjuncts: [], made: new Set(), inside: new Set(), seen: new Set(),
            };
            this.paths.set(key, rec);
        }
        this.contribute(rec, a);
        this.contribute(rec, b);
        if (null != out && true === out.isVal && out !== a && out !== b) {
            rec.made.add(out.id);
        }
    }
    contribute(rec, v) {
        // TOP is the unit element and a nil is a failure, neither of which
        // is information the author wrote. A value an earlier meet MADE is
        // an intermediate; the source that made it is already recorded.
        if (null == v || true !== v.isVal || true === v.isTop || true === v.isNil ||
            rec.made.has(v.id) || rec.seen.has(v.id)) {
            return;
        }
        // Not the author's: see `written`.
        if (!this.written.has(v.id) && true !== v[exports.FROM_SPREAD]) {
            return;
        }
        // A CONJUNCT is not one contribution, it is the statement that
        // several must all hold — duplicate keys merged at parse, an
        // explicit `a & b`. Its own site is nowhere (the merge has no
        // source position), while its terms each have one, which is what
        // the author needs to be shown.
        if (true === v.isConjunct && Array.isArray(v.peg)) {
            rec.seen.add(v.id);
            for (const term of v.peg) {
                this.contribute(rec, term);
            }
            return;
        }
        rec.seen.add(v.id);
        // Everything INSIDE this value is part of it, not a further
        // contribution beside it: a disjunct's members and a constraint's
        // atoms meet at the same path when the value resolves.
        insideIds(v, rec.inside);
        rec.conjuncts.push({
            canon: v.canon,
            id: v.id,
            role: roleOf(v),
            // COALESCED, unlike vet's siteOf: a `why` run reads whatever
            // source it was handed, and an inline document (a spec row, a
            // piped stdin) has no file name to stamp. The Go port answers
            // the empty string for the same value, so the two agree.
            site: {
                col: v.site.col, file: v.site.url ?? '', len: v.site.len,
                row: v.site.row,
            },
            src: v.site.src,
        });
    }
    // The record at one path. Empty when nothing met there — a value
    // written once and never unified against anything has no conjuncts,
    // which is a true and useful answer rather than an error.
    //
    // ONLY WHOLE WRITTEN VALUES are contributions. A Val's own unify
    // re-enters `unite` at the same path — a disjunct trials each member
    // there, a constraint meets its atoms there — and those members are
    // PARTS OF one written value, not further values beside it. Nesting
    // is the test, not stack depth: the same value is met at different
    // depths on different fixpoint passes, while what is inside it is
    // inside it on every one.
    at(path) {
        const rec = this.paths.get(path.join('.'));
        if (null == rec) {
            return [];
        }
        // SOURCE ORDER, not meet order: the two are the same in simple
        // cases and diverge with the fixpoint's fold order, which is an
        // engine detail and a parity risk. Sites are parse data, identical
        // in both ports, so ordering by them makes the record read as the
        // document reads and pins it across implementations.
        return rec.conjuncts
            .filter((c) => !rec.inside.has(c.id))
            .sort(cmpSite)
            .map(({ id, ...rest }) => rest);
    }
}
exports.Provenance = Provenance;
//# sourceMappingURL=provenance.js.map