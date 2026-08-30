"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Provenance = exports.INNER_OF = exports.WRITTEN = exports.FROM_SPREAD = void 0;
exports.markSpread = markSpread;
// Set on a spread template's per-key clone, at the one place a spread
// is applied (MapVal/ListVal.unify). Nothing else reads it.
exports.FROM_SPREAD = '_fromSpread';
// THE AUTHORED MARK, and it is a property of the VALUE rather than a
// set of ids held beside it (the review's finding E). A contribution
// is a value the author wrote, and the recorder used to decide that by
// looking the operand's id up in a set stamped over the parsed tree --
// which is true of the parsed tree and of nothing derived from it. So
// every value that reached a path through a CLONE was dark: a default
// flowing into a `pack()`-generated child, a shape carried by a `$ref`,
// a value a spread template stamped. `why` answered "(no contributions:
// nothing met at this path)" over a value it had just printed, with
// exit 0 -- a false statement, and the one an audit surface may not
// make (use-cases/BUGS.md §23, §24).
//
// A clone of a written value IS that written value, re-instantiated
// somewhere else: it carries the author's site, so it can be pointed
// at. Val.clone therefore carries this mark, exactly as it carries the
// site -- provenance is part of the clone contract, not a recorder
// bolted beside it. Values the engine MINTS (a kind lifted while a
// disjunct trials its members, a fold's intermediate) are constructed
// rather than cloned and stay unmarked, which is what keeps the record
// to what the author can edit.
//
// The mark is only ever SET by an instrumented run (`why` calls
// writtenFrom; nothing else does), so an ordinary evaluation pays one
// undefined property read per clone.
exports.WRITTEN = '_written';
// THE CONTAINER A VALUE IS PART OF, when the two stand at the SAME
// path: a junction's members, a preference's inner value, a function's
// arguments, an operator's operands. `*1|integer` is one thing the
// author wrote, and `*1` is not a second thing beside it.
//
// The recorder already knew that where the container itself met
// something -- contributing it marked its members `inside` and the
// filter dropped them. But the container only appears as an operand
// when the fixpoint happens to meet it whole; where it resolves
// member-wise instead (a later sibling of a spread, a default reaching
// a generated child) the members arrived alone and the record split
// one written value into two contributions at two columns. Which
// happened was decided by evaluation order, so `why` answered
// differently for identical statements (use-cases/BUGS.md §22).
//
// So the relation is recorded as a fact about the DOCUMENT, at
// stamping time, and an operand is reported as the outermost written
// value it is part of. NOT set for a bag's children (they stand at
// their own, deeper paths) nor for a conjunct's terms (a conjunct is
// the statement that several things must all hold, and each term is
// one of them -- which is exactly what the author needs shown).
exports.INNER_OF = '_innerOf';
// Mark a spread clone and everything inside it, so a contribution
// several levels down a template is still known to have come from the
// template. ONLY on an instrumented run: the walk is O(template) per
// key per pass, which is real money on a large model and buys nothing
// when no one is recording.
//
// THE GUARD IS A CYCLE GUARD, NOT A "DONE" FLAG, and that distinction
// is the whole of the review's finding E for sibling position. A
// template is applied once per destination, and the fixpoint advances
// values IN PLACE between those applications (AGENTS.md, the mutation
// caveat): by the time the second key is spread, the template's
// `replicas` child is no longer the disjunction the first key saw but
// the value that meet produced. Skipping the walk because the
// CONTAINER was already marked left every one of those replacements
// unmarked, so `why` at the first sibling reported the written
// `*1|integer` as one contribution and at the second reported `*1` and
// `integer` as two -- identical statements, different answers, decided
// by which key the fixpoint reached first (use-cases/BUGS.md §22).
// Marking is idempotent, so re-walking costs a pass and changes
// nothing where nothing moved.
function markSpread(v, seen) {
    const marked = seen ?? new Set();
    if (null == v || true !== v.isVal || marked.has(v)) {
        return;
    }
    marked.add(v);
    v[exports.FROM_SPREAD] = true;
    if (true === v.isMap && null != v.peg) {
        for (const k of Object.keys(v.peg)) {
            markSpread(v.peg[k], marked);
        }
    }
    else if (true === v.isList && null != v.peg) {
        for (const k of Object.keys(v.peg)) {
            markSpread(v.peg[k], marked);
        }
    }
    else if (Array.isArray(v.peg)) {
        // A junction, a func's arguments, an op's operands: every one of
        // them can hold the value that reaches the destination.
        for (const m of v.peg) {
            markSpread(m, marked);
        }
    }
    else if (true === v.isPref) {
        markSpread(v.peg, marked);
    }
}
// The children that stand at the SAME path as v. See INNER_OF.
function samePathKids(v) {
    if (true === v.isMap || true === v.isList || true === v.isConjunct) {
        return [];
    }
    if (true === v.isPref) {
        return null != v.peg && true === v.peg.isVal ? [v.peg] : [];
    }
    return Array.isArray(v.peg)
        ? v.peg.filter((k) => null != k && true === k.isVal) : [];
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
        // id -> the written container it names, for INNER_OF. The mark on a
        // value is the container's ID rather than the container itself: a
        // Val holding another Val as an own property is a reference cycle
        // through the tree, and enough of the engine walks a value's own
        // properties that one is not safe to introduce.
        this.containers = new Map();
    }
    // Stamp the parsed tree with the AUTHORED mark: everything the
    // author wrote, before unification starts. A value minted during
    // unification — a kind lifted from a leaf while a disjunct trials
    // its members, a fold's intermediate — is the engine's own work, not
    // a contribution the author can be pointed at. A CLONE of a marked
    // value keeps the mark (see WRITTEN above), because it is the same
    // written value somewhere else. Called once, before unify, by `why`.
    writtenFrom(v) {
        if (null == v || true !== v.isVal || true === v[exports.WRITTEN]) {
            return;
        }
        v[exports.WRITTEN] = true;
        const kids = (true === v.isMap || true === v.isList) && null != v.peg
            ? Object.keys(v.peg).map((k) => v.peg[k])
            : Array.isArray(v.peg) ? v.peg
                : null != v.peg && true === v.peg.isVal ? [v.peg]
                    : [];
        for (const k of kids) {
            this.writtenFrom(k);
        }
        // OUTERMOST WINS: the walk is top-down, so a value already pointed
        // at a container is inside that one and this one, and the answer
        // the author wants is the whole written statement.
        for (const k of samePathKids(v)) {
            if (null == k[exports.INNER_OF]) {
                k[exports.INNER_OF] = v.id;
                this.containers.set(v.id, v);
            }
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
                conjuncts: [], made: new Set(), seen: new Set(),
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
        // PART OF a written value is not a value beside it: report the
        // whole statement the author wrote, whichever piece of it the
        // fixpoint happened to meet here. See INNER_OF.
        let outer = v;
        for (let up = this.containers.get(outer[exports.INNER_OF]); null != up; up = this.containers.get(outer[exports.INNER_OF])) {
            outer = up;
        }
        if (outer !== v) {
            this.contribute(rec, outer);
            return;
        }
        // Not the author's: see WRITTEN.
        if (true !== v[exports.WRITTEN] && true !== v[exports.FROM_SPREAD]) {
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
    // THE VALUE THAT STANDS at a path is a contribution when nothing met
    // there and the author wrote it. A meet is where information
    // vanishes, so a meet is what the recorder watches -- but a
    // generator PLACES a value without meeting anything, and `why` then
    // answered "(no contributions: nothing met at this path)" over a
    // value it had just printed. That is literally true and practically
    // false: the author is asking where the value came from, and it came
    // from somewhere they can be shown (use-cases/BUGS.md §23).
    //
    // Only when the record is otherwise EMPTY. Where something did meet,
    // the standing value is that meet's result -- an intermediate, and
    // the recorder's oldest rule is that a result is not a source.
    stands(path, v) {
        const key = path.join('.');
        const rec = this.paths.get(key);
        if (null != rec && 0 < rec.conjuncts.length) {
            return;
        }
        this.record(path, v, undefined, undefined);
    }
    // The record at one path. Empty when nothing met there and nothing
    // the author wrote stands there either — which is a true and useful
    // answer rather than an error.
    //
    // ONLY WHOLE WRITTEN VALUES are contributions. A Val's own unify
    // re-enters `unite` at the same path — a disjunct trials each member
    // there, a constraint meets its atoms there — and those members are
    // PARTS OF one written value, not further values beside it. That is
    // settled BEFORE a member is ever pushed, by the INNER_OF fact
    // stamped over the document (see `contribute`), which is why no
    // filter runs here: a per-path "inside" set used to do it, and it
    // could only work where the container itself happened to meet
    // something at the same path — the order-dependence finding E
    // records.
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
        // ONE WRITTEN TOKEN IS ONE CONTRIBUTION, and the SITE is what
        // identifies it -- not the val id, and not the canon.
        //
        // Not the id, because provenance travels through clones now: a
        // written value and a clone of it are the same statement in the
        // same place, and a path that met both would list it twice.
        //
        // Not the canon, because the same written value reaches a path at
        // different stages of narrowing -- `3|(1|2)` as the author wrote
        // it and `3|1|2` after a fold -- and both name one token.
        //
        // Not the role either: the role says how the value REACHED this
        // path, not which value it is, and one written value can reach a
        // path both ways (a template applied to a key whose value is also
        // written there). Keeping the literal would throw away the more
        // informative half, so the roles have a precedence.
        //
        // ONLY WHERE THE SITE IS REAL. An unsited contribution (row -1)
        // cannot be told apart from another unsited one, so those are kept
        // as they come rather than collapsed into whichever arrived first.
        const shown = new Map();
        const order = ['spread', 'ref', 'pref', 'literal'];
        const out = [];
        for (const c of rec.conjuncts.slice().sort(cmpSite)) {
            if (c.site.row < 0) {
                out.push(c);
                continue;
            }
            const key = [c.src, c.site.file,
                c.site.row, c.site.col, c.site.len].join('\u0000');
            const had = shown.get(key);
            if (null == had) {
                shown.set(key, c);
                out.push(c);
            }
            else if (order.indexOf(c.role) < order.indexOf(had.role)) {
                had.role = c.role;
            }
        }
        return out.map(({ id, ...rest }) => rest);
    }
}
exports.Provenance = Provenance;
//# sourceMappingURL=provenance.js.map