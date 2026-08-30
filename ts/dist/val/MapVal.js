"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapVal = void 0;
const type_1 = require("../type");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const err_1 = require("../err");
const top_1 = require("./top");
const RefVal_1 = require("./RefVal");
const ConjunctVal_1 = require("./ConjunctVal");
const NilVal_1 = require("./NilVal");
const BagVal_1 = require("./BagVal");
const Val_1 = require("./Val");
const keyorder_1 = require("../keyorder");
const provenance_1 = require("../provenance");
// Structural snapshots of ref spreads (see MapVal.unify), keyed by the
// ref's canon + source site rather than object identity: spread
// application clones templates (and the refs inside them) freely, and a
// clone must find the snapshot its parse-origin ref captured on an early
// pass. The map lives on the unify root ctx (see Unify), so it persists
// across fixpoint passes and is GC'd with the run.
function spreadSnapKey(cj) {
    return cj.canon + '~' + cj.site.row + ':' + cj.site.col;
}
// Snapshot a path-dependent ref spread to its structural target once,
// while inner key()/path() funcs in the target are still unresolved (see
// the call site comments in MapVal.unify). Shared by the direct
// application path and the deferred-spread early-snapshot walk.
function snapshotRefSpread(cj, ctx) {
    let snapmap = ctx.snapmap;
    if (undefined === snapmap) {
        // Direct Val.unify use without a Unify run: degrade to a ctx-local
        // map (snapshots then live only for that subtree, as before).
        snapmap = new Map();
        ctx.snapmap = snapmap;
    }
    const sk = spreadSnapKey(cj);
    let snap = snapmap.get(sk);
    if (undefined === snap) {
        // snap mode: the pending-mark-wrapper defer in find must not
        // apply here — the snapshot WANTS the pre-resolution structure.
        let tgt = cj.find(ctx, true);
        // A ref to a type() resolves to its inner template — snapshot that,
        // so a type-wrapped ref behaves like a plain-map ref spread.
        if (tgt && tgt.isTypeFunc)
            tgt = tgt.peg?.[0];
        // A pending type()/hide() CALL is not yet a value to snapshot
        // (ADR-005, the same rule find's non-snap path defers on): cached
        // here it resolves at every destination and STAMPS marks the
        // clearing walk ran too early to clear -- a mutual recursive
        // schema's members vanished from generation this way. No cache;
        // retry once the wrapper has resolved at its own field.
        if (tgt && (0, RefVal_1.pendingMarkWrapper)(tgt)) {
            return undefined;
        }
        // Only snapshot a found, path-dependent target. If the target is not
        // present yet (it may be introduced by a later conjunct/merge), do
        // NOT cache — retry on the next fixpoint pass.
        if (tgt && tgt.isVal && tgt.isPathDependent) {
            snap = tgt.clone(ctx);
            // Clear TYPE marks on the snapshot (recursively): a type() template
            // constrains values but must not make the spread destination
            // type-invisible at any depth. HIDE marks are preserved.
            (0, utility_1.walk)(snap, (_k, v) => {
                v.mark.type = false;
                return v;
            });
            snapmap.set(sk, snap);
        }
    }
    return snap;
}
class MapVal extends BagVal_1.BagVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isMap = true;
        if (null == this.peg) {
            throw new err_1.AontuError('MapVal spec.peg undefined');
        }
        this.mark.type = !!spec.mark?.type;
        this.mark.hide = !!spec.mark?.hide;
        let spread = this.peg[type_1.SPREAD];
        delete this.peg[type_1.SPREAD];
        if (spread) {
            if ('&' === spread.o) {
                // Multiple same-level spreads arrive as an array and conjoin;
                // an unequal spread arriving from ANOTHER statement meets this
                // one in unify's spread combination below — sound since the
                // combined template became stateless (pure ExpectVal, BUGS.md
                // §6-§7): each child meets the combined constraint
                // independently and children never meet each other's data.
                this.spread.cj =
                    Array.isArray(spread.v) ?
                        1 < spread.v.length ?
                            new ConjunctVal_1.ConjunctVal({ peg: spread.v }, ctx) :
                            spread.v[0] :
                        spread.v;
                // Clearing rule 3 (G4 phase 1): a CONSTANT id in the template
                // would declare every child to be one entity. The refusal
                // replaces the template, so it reaches every child and the
                // bag itself (see the isNil arm where the spread is applied)
                // as ONE nil identity — made here, once, rather than per
                // pass, so the report names it once.
                const idfn = (0, utility_1.constantIdFunc)(this.spread.cj);
                if (undefined !== idfn) {
                    const nil = new NilVal_1.NilVal({ why: 'id_spread' }, ctx);
                    nil.site.row = idfn.site.row;
                    nil.site.col = idfn.site.col;
                    nil.site.url = idfn.site.url;
                    nil.primary = idfn;
                    this.spread.cj = nil;
                }
            }
        }
        // console.log('MAPVAL-ctor', this.type, spec)
    }
    // NOTE: order of keys is not preserved!
    // not possible in any case - consider {a,b} unify {b,a}
    // ALIAS DECLARATIONS MUST SIT AT THE DOCUMENT ROOT. Stated on the
    // VALUE rather than at the parse, because the parse cannot see it: an
    // INCLUDED file's declarations are at the root of their own text, and
    // only once the loaded map is placed does it become apparent that
    // root is not the document's. `%name` is spelled as a reference from
    // the document root, so an included file's own `%b` would otherwise
    // reach the INCLUDER's `%b` -- cross-file capture, the hazard the
    // sigil exists to prevent, one level up.
    //
    // P1 is single-file by construction; carrying a name ACROSS files is
    // what `export` and the destructure are for (P2, not built), and this
    // refusal is what keeps the two from being confused meanwhile. Pathed
    // at the DECLARATION, which is what is wrong, not at the map.
    aliasDeclarationsAreRooted(ctx) {
        if (0 === this.aliasKeys.length || 0 === this.path.length) {
            return undefined;
        }
        const nv = new NilVal_1.NilVal({ why: 'alias_not_toplevel' }, ctx);
        nv.site = this.site;
        nv.path = [...this.path, this.aliasKeys[0]];
        return nv;
    }
    unify(peer, ctx) {
        const arooted = this.aliasDeclarationsAreRooted(ctx);
        if (undefined !== arooted) {
            return arooted;
        }
        // console.log('MAPVAL-UNIFY', this.id, this.canon, peer.id, peer.canon)
        const TOP = (0, top_1.top)();
        peer = peer ?? TOP;
        // A sizing residual (`length`, `unique`) sorts AFTER containers in a
        // conjunct so that it counts the MERGED map rather than the first
        // fragment (SIZING_CJO in ConstraintVal.ts). That makes the map the
        // accumulator and the constraint its peer, the reverse of the usual
        // order — and the reading belongs to the constraint either way, so
        // hand it straight back.
        if (true === peer.isConstraint) {
            return peer.unify(this, ctx);
        }
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Map', this, peer);
        let done = true;
        let exit = false;
        // NOTE: not a clone! needs to be constructed.
        let out = (peer.isTop ? this : new MapVal({ peg: {} }, ctx));
        out.closed = this.closed;
        out.optionalKeys = [...this.optionalKeys];
        out.aliasKeys = [...this.aliasKeys];
        out.spread.cj = this.spread.cj;
        out.site = this.site;
        // A rel() peer DRIVES whichever side the fold hands it on: the
        // relation constraint rewrites this container leaf by leaf
        // (RELATIONS.0.md §3.2), exactly as a sizing residual takes the
        // driver's seat above.
        if (true === peer?.isRel) {
            return peer.unify(this, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'REL') }) : ctx);
        }
        if (peer instanceof MapVal) {
            if (!this.closed && peer.closed) {
                out = peer.unify(this, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PMC') }) : ctx);
                exit = true;
            }
            // ensure determinism of unification
            else if (this.closed && peer.closed) {
                const peerkeys = Object.keys(peer.peg);
                const selfkeys = Object.keys(this.peg);
                if (peerkeys.length < selfkeys.length
                    || (peerkeys.length === selfkeys.length
                        && peerkeys.join('~') < selfkeys.join('~'))) {
                    out = peer.unify(this, te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'SPC') }) : ctx);
                    exit = true;
                }
            }
            if (!exit) {
                // Combine two spread constraints. Identical templates (same canon)
                // collapse to one: re-unifying them resolves key()/path() at the
                // shared intermediate path, producing spurious values (f1bb1063).
                // Distinct templates are unified in place — unite is idempotent,
                // whereas deferring the distinct case into a fresh ConjunctVal (as
                // f1bb1063 did) re-wraps every fixpoint pass, growing the conjunct
                // without bound and non-terminating on real models (the apidef +
                // sdkgen entity schemas each contribute a `&:` spread with name:key(),
                // combined here). unite resolves key()/path() at each destination via
                // spreadClone below, so nested + sibling key() cases stay correct
                // (test/spec/spread-nested-key, spread-key-all).
                //
                // The combined template must stay STATELESS: this meet wraps a
                // key present in only one side as an ExpectVal, the combined
                // map is shared across destinations when path-independent
                // (spreadClone tier 1), and a stateful expect accumulated the
                // first sibling's data and met it into the next (BUGS.md
                // §6-§7). ExpectVal.unify is pure for exactly this reason.
                out.spread.cj = null == out.spread.cj ? peer.spread.cj : (null == peer.spread.cj ? out.spread.cj :
                    out.spread.cj.canon === peer.spread.cj.canon ? out.spread.cj :
                        (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'SPR') }) : ctx, out.spread.cj, peer.spread.cj, 'map-self'));
            }
        }
        else {
            // console.log('MAPVAL-PEER-OTHER', this.id, this.canon, this.done, peer.id, peer.canon, peer.done)
        }
        if (!exit) {
            out.dc = this.dc + 1;
            // let newtype = this.type || peer.type
            let spread_cj = out.spread.cj ?? TOP;
            // The template REFUSED at construction (clearing rule 3, G4
            // phase 1): the bag itself is that refusal. Returning the nil
            // here rather than only letting it reach the children is what
            // makes an EMPTY bag with a bad template an error too — there
            // are no children to carry it.
            //
            // Narrow to THIS code on purpose. A nil spread from any other
            // cause keeps its existing behaviour of driving every key
            // (coverage3 `nil-spread-drives-every-key`): a template that has
            // merely not resolved yet must not permanently kill the bag that
            // holds it.
            if ('id_spread' === spread_cj.why) {
                return spread_cj;
            }
            // Snapshot a path-dependent *ref* spread to its structural target
            // once (while inner key()/path() funcs are still unresolved), so
            // later fixpoint passes don't re-resolve the ref against the mutated
            // tree and capture the target's own resolved key()/path() literals,
            // which would leak the source key into the spread destination.
            if (spread_cj.isRef && spread_cj.find) {
                const snap = snapshotRefSpread(spread_cj, ctx);
                if (snap)
                    spread_cj = snap;
            }
            // A type() used as a spread applies as its inner template: emit the
            // (constrained) values at each destination rather than marking the
            // destination as a type. I.e. `&:type({k:key(),x:number})` behaves
            // like the non-type spread `&:{k:key(),x:number}` — key() resolves
            // to the destination key, kinds constrain, fields are emitted.
            if (spread_cj.isTypeFunc) {
                spread_cj = spread_cj.peg?.[0] ?? TOP;
            }
            // Always unify own children first
            for (let key in this.peg) {
                const child = this.peg[key];
                const keyctx = ctx.descend(key);
                (0, utility_1.propagateMarks)(this, child);
                // Apply the spread constraint ONCE per child (marked with the
                // constraint's id below): the first application merges the
                // template into the child (with key()/path() placeholders that
                // resolve in place on later passes), so the constraint content
                // is inside the child from then on and only self-unification is
                // needed to progress it. Re-applying on every fixpoint pass and
                // every conjunct-fold step is the identity (unite is idempotent)
                // but costs O(keys) deep template clones per pass on large
                // models — the dominant cost on generated-SDK model trees.
                let oval;
                // No `undefined !== child` here: propagateMarks above already
                // dereferenced it, so a missing child would have thrown there.
                if (!spread_cj.isTop
                    && child._spr === (0, Val_1.spreadId)(spread_cj)) {
                    oval = child.done ? child :
                        (0, unify_1.unite)(te ? keyctx.clone({ explain: (0, utility_1.ec)(te, 'KEY:' + key) }) : keyctx, child, TOP, 'map-own');
                    oval._spr = (0, Val_1.spreadId)(spread_cj);
                }
                else {
                    const key_spread_cj = spread_cj.spreadClone(keyctx);
                    // The one place a spread is APPLIED, so the one place that
                    // knows a contribution came from a template rather than
                    // from the key itself (G7 phase 3). Only when someone is
                    // recording: the walk is O(template) per key per pass.
                    if (undefined !== keyctx.prov) {
                        (0, provenance_1.markSpread)(key_spread_cj);
                    }
                    // child is non-nullish: propagateMarks above dereferences it.
                    oval =
                        child.isNil ? child :
                            key_spread_cj.isNil ? key_spread_cj :
                                // The no-op meet is SKIPPED on the normal path (it is the
                                // identity) but TAKEN while recording: a value written once
                                // and never met is still a contribution the author wants
                                // pointed at, and the Go port's unite sees that meet (G7
                                // phase 4). Instrumented runs pay knowingly.
                                key_spread_cj.isTop && child.done && undefined === keyctx.prov
                                    ? child :
                                    child.isTop && key_spread_cj.done ? key_spread_cj :
                                        (0, unify_1.unite)(te ? keyctx.clone({ explain: (0, utility_1.ec)(te, 'KEY:' + key) }) : keyctx, child, key_spread_cj, 'map-own');
                    if (!spread_cj.isTop && !oval.isNil) {
                        ;
                        oval._spr = (0, Val_1.spreadId)(spread_cj);
                    }
                }
                out.peg[key] = oval;
                done = (done && type_1.DONE === oval.dc);
            }
            const allowedKeys = this.closed ? Object.keys(this.peg) : [];
            let bad = undefined;
            if (peer instanceof MapVal) {
                let upeer = peer.done ? peer : (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PER') }) : ctx, peer, TOP, 'map-peer-map');
                for (let peerkey in upeer.peg) {
                    let peerchild = upeer.peg[peerkey];
                    if (this.closed && !allowedKeys.includes(peerkey)) {
                        bad = (0, err_1.makeNilErr)(ctx, 'closed', peerchild, undefined);
                    }
                    // key optionality is additive
                    if (upeer.optionalKeys.includes(peerkey) && !out.optionalKeys.includes(peerkey)) {
                        out.optionalKeys.push(peerkey);
                    }
                    // ... and so is an alias declaration, for the same reason:
                    // two statements for one map are one map, and a name declared
                    // in either is declared in the result.
                    if (upeer.aliasKeys.includes(peerkey) && !out.aliasKeys.includes(peerkey)) {
                        out.aliasKeys.push(peerkey);
                    }
                    let child = out.peg[peerkey];
                    const peerctx = ctx.descend(peerkey);
                    let oval = out.peg[peerkey] =
                        // A peer-only key is CARRIED, not met — except on an
                        // instrumented run, where the identity meet is taken so
                        // the recorder sees where the value came from. The Go port
                        // unites a genable peer-only child with TOP unconditionally
                        // (go/mapval.go), and the difference was invisible until
                        // G4's identity merge brought a peer whose children the
                        // recorder counts as WRITTEN: `why $.b.k` on two positions
                        // of one entity named the site in Go and answered "nothing
                        // met here" in TypeScript.
                        undefined === child
                            ? (undefined !== peerctx.prov && peerchild.isGenable
                                ? (0, unify_1.unite)(peerctx, peerchild, TOP, 'map-peer-only')
                                : this.handleExpectedVal(peerkey, peerchild, this, ctx)) :
                            child.isTop && peerchild.done ? peerchild :
                                child.isNil ? child :
                                    peerchild.isNil ? peerchild :
                                        (0, unify_1.unite)(te ? peerctx.clone({ explain: (0, utility_1.ec)(te, 'CHD') }) : peerctx, child, peerchild, 'map-peer');
                    if (this.spread.cj) {
                        // Same apply-once discipline as the own-key loop: once the
                        // constraint is merged into the value (marked with the
                        // constraint's id), later passes only self-unify.
                        if (oval._spr !== (0, Val_1.spreadId)(spread_cj)) {
                            let key_spread_cj = spread_cj.spreadClone(peerctx);
                            // A SPREAD IS A SPREAD FROM EITHER SIDE. The own-key loop
                            // above marks its template so `why` can say the
                            // contribution came from `&:` rather than from the key;
                            // this arm did not, so the SAME document reported the
                            // role or dropped it depending on whether the template
                            // and the keys were written in one statement or two --
                            // `services: &: {..}` plus `services: {web:{}}` took the
                            // peer path and lost `(spread)` (use-cases/BUGS.md §55).
                            if (undefined !== peerctx.prov) {
                                (0, provenance_1.markSpread)(key_spread_cj);
                            }
                            oval = out.peg[peerkey] =
                                (0, unify_1.unite)(te ? peerctx.clone({ explain: (0, utility_1.ec)(te, 'PSP:' + peerkey) }) : peerctx, oval, key_spread_cj, 'map-peer-spread');
                            if (!spread_cj.isTop && !oval.isNil) {
                                ;
                                oval._spr = (0, Val_1.spreadId)(spread_cj);
                            }
                        }
                    }
                    (0, utility_1.propagateMarks)(this, oval);
                    done = (done && type_1.DONE === oval.dc);
                }
            }
            else if (!peer.isTop) {
                out = (0, err_1.makeNilErr)(ctx, 'map', this, peer);
            }
            if (null != bad) {
                out = bad;
            }
            if (!out.isNil) {
                ;
                (out.uh ??= []).push(peer.id);
                out.dc = done ? type_1.DONE : out.dc;
                (0, utility_1.propagateMarks)(peer, out);
                (0, utility_1.propagateMarks)(this, out);
            }
        }
        // console.log(
        //   'MAPVAL-OUT', out.canon,
        //   '\n  SELF', this,
        //   '\n  PEER', peer,
        //   '\n  OUT', out,
        //   '\n  FROM', (out as any).spread.cj
        // )
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
    // Spread clone: return a Val usable as the per-key spread constraint.
    //
    // Three tiers:
    //   1. tree is path-independent (no RefVal/KeyFuncVal/PathFuncVal/
    //      MoveFuncVal/SuperFuncVal anywhere below): return `this` directly.
    //      Nothing in the unify path mutates the spread root, and no
    //      child depends on its own stored .path, so sharing is safe.
    //   2. top-level children are all ScalarKindVal: shallow clone
    //      (share children, fresh MapVal wrapper).
    //   3. otherwise: full deep clone via `this.clone(ctx)`.
    //
    // Tier 1 handles the foo-sdk common case of simple type-constraint
    // spreads like `&:{active: *true | boolean, version: *'0.0.1' | string}`,
    // which are cloned thousands of times per run.
    spreadClone(ctx) {
        if (!this.isPathDependent)
            return this;
        let allScalarKind = true;
        for (let key in this.peg) {
            if (!this.peg[key]?.isScalarKind) {
                allScalarKind = false;
                break;
            }
        }
        if (!allScalarKind) {
            // A full instance (`dup`, ADR-005), paths normalised to the
            // destination: see Val.spreadClone and repathInstance.
            const out = this.clone(ctx, { dup: true });
            (0, Val_1.repathInstance)(out, out.path);
            return out;
        }
        let out = super.clone(ctx);
        out.peg = {};
        for (let entry of Object.entries(this.peg)) {
            out.peg[entry[0]] = entry[1];
        }
        // Must create a new spread object to avoid mutating the original.
        out.spread = {
            cj: this.spread.cj ? this.spread.cj.spreadClone(ctx) : undefined,
        };
        out.closed = this.closed;
        out.optionalKeys = [...this.optionalKeys];
        out.aliasKeys = [...this.aliasKeys];
        return out;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        out.peg = {};
        for (let entry of Object.entries(this.peg)) {
            out.peg[entry[0]] =
                entry[1]?.isVal ?
                    // (entry[1] as Val).clone(ctx, spec?.mark ? { mark: spec.mark } : {}) :
                    entry[1].clone(ctx, {
                        mark: spec?.mark ?? {},
                        path: [...out.path, entry[0]],
                        // The instantiation flag descends (ADR-005): a template's
                        // children are part of the instance.
                        dup: spec?.dup,
                    }) :
                    entry[1];
        }
        if (this.spread.cj) {
            out.spread.cj = this.spread.cj.clone(ctx, spec?.mark || spec?.dup ?
                { mark: spec?.mark, dup: spec?.dup } : {});
        }
        out.closed = this.closed;
        out.optionalKeys = [...this.optionalKeys];
        out.aliasKeys = [...this.aliasKeys];
        // out.from = this.from
        // console.log('MAPVAL-CLONE', this.canon, '->', out.canon)
        return out;
    }
    get canon() {
        // Keys are emitted in CODE POINT order so the canonical form is
        // independent of insertion/unification order and matches the Go
        // port. A bare .sort() is UTF-16 code-unit order, which puts an
        // astral key ahead of everything in U+E000-U+FFFF -- see cmpCodePoint.
        // An alias declaration is not part of the document, so canon does
        // not render it: a document with aliases and the document with
        // every alias written out longhand must produce the same text and
        // therefore the same `aon1-` hash. That is the sharpest statement
        // of what an alias IS -- a name for a value, and nothing more.
        let keys = Object.keys(this.peg)
            .filter(k => !this.aliasKeys.includes(k))
            .sort(keyorder_1.cmpCodePoint);
        return '' +
            // this.errcanon() +
            // (this.mark.type ? '<type>' : '') +
            // (this.id + '=') +
            '{' +
            (this.spread.cj ? '&:' + this.spread.cj.canon +
                (0 < keys.length ? ',' : '') : '') +
            keys
                .map(k => [
                JSON.stringify(k) +
                    (this.optionalKeys.includes(k) ? '?' : '') +
                    ':' +
                    // canonRiders, not .canon: a deprecated field renders
                    // back as its `deprecate(x, m)` call, reparseably (G3). The
                    // guard is the isVal FLAG, never the canon getter: computing
                    // canon in the guard and again in the render doubles the
                    // recursion per level, which is 2^depth on a nested document.
                    (true === this.peg[k]?.isVal
                        ? (0, utility_1.canonRiders)(this.peg[k]) : this.peg[k])
            ])
                .join(',') +
            '}'; // + '<' + (this.mark.hide ? 'H' : '') + '>'
    }
    inspection(d) {
        return this.spread.cj ? '&:' + this.spread.cj.inspect(null == d ? 0 : d + 1) : '';
    }
} /* node:coverage ignore next 6 */
exports.MapVal = MapVal;
//# sourceMappingURL=MapVal.js.map