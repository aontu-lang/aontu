"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapVal = void 0;
exports.spreadSnapKey = spreadSnapKey;
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
const aliasname_1 = require("../aliasname");
const provenance_1 = require("../provenance");
function spreadSnapKey(cj) {
    return cj.spelling + '~' + cj.site.url + '~' + cj.site.row + ':' + cj.site.col;
}
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
                this.spread.cj =
                    Array.isArray(spread.v) ?
                        1 < spread.v.length ?
                            new ConjunctVal_1.ConjunctVal({ peg: spread.v }, ctx) :
                            spread.v[0] :
                        spread.v;
            }
        }
    }
    // An `export` answers to the root rule a declaration does.
    aliasDeclarationsAreRooted(ctx) {
        const named = 0 < this.aliasKeys.length ?
            (0, aliasname_1.aliasBareName)(this.aliasKeys[0]) :
            0 < this.exportKeys.length ? aliasname_1.EXPORT_DECL_NAME : undefined;
        if (undefined === named || 0 === this.path.length) {
            return undefined;
        }
        const nv = new NilVal_1.NilVal({ why: 'alias_not_toplevel' }, ctx);
        nv.site = this.site;
        nv.path = [...this.path, named];
        return nv;
    }
    unify(peer, ctx) {
        const arooted = this.aliasDeclarationsAreRooted(ctx);
        if (undefined !== arooted) {
            return arooted;
        }
        const TOP = (0, top_1.top)();
        peer = peer ?? TOP;
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
                out.spread.cj = null == out.spread.cj ? peer.spread.cj : (null == peer.spread.cj ? out.spread.cj :
                    out.spread.cj.canon === peer.spread.cj.canon ? out.spread.cj :
                        (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'SPR') }) : ctx, out.spread.cj, peer.spread.cj, 'map-self'));
            }
        }
        else {
        }
        if (!exit) {
            out.dc = this.dc + 1;
            let spread_cj = out.spread.cj ?? TOP;
            if (spread_cj.isRef && spread_cj.find) {
                const snap = snapshotRefSpread(spread_cj, ctx);
                if (snap)
                    spread_cj = snap;
            }
            if (spread_cj.isTypeFunc) {
                spread_cj = spread_cj.peg?.[0] ?? TOP;
            }
            // Always unify own children first
            for (let key in this.peg) {
                const child = this.peg[key];
                const keyctx = ctx.descend(key);
                (0, utility_1.propagateMarks)(this, child);
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
                    if (this.closed && !allowedKeys.includes(peerkey) &&
                        !upeer.aliasKeys.includes(peerkey)) {
                        bad = (0, err_1.makeNilErr)(ctx, 'closed', peerchild, undefined);
                    }
                    // key optionality is additive
                    if (upeer.optionalKeys.includes(peerkey) && !out.optionalKeys.includes(peerkey)) {
                        out.optionalKeys.push(peerkey);
                    }
                    if (upeer.aliasKeys.includes(peerkey) && !out.aliasKeys.includes(peerkey)) {
                        out.aliasKeys.push(peerkey);
                    }
                    let child = out.peg[peerkey];
                    const peerctx = ctx.descend(peerkey);
                    let oval = out.peg[peerkey] =
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
            else if (true === peer.isContainerKind) {
                // The container KIND delegates to its own arm, exactly as a
                // scalar delegates to a ScalarKindVal peer: the kind knows to
                // admit this map, and this map knows nothing about kinds.
                out = peer.unify(this, ctx);
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
        ctx.explain && (0, utility_1.explainClose)(te, out);
        return out;
    }
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
        return out;
    }
    get canon() {
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