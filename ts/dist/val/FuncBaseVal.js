"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuncBaseVal = void 0;
exports.trialUnify = trialUnify;
exports.admits = admits;
const type_1 = require("../type");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const err_1 = require("../err");
const siggate_1 = require("../siggate");
const top_1 = require("./top");
const ConjunctVal_1 = require("../val/ConjunctVal");
const FeatureVal_1 = require("../val/FeatureVal");
const PlaceVal_1 = require("../val/PlaceVal");
const members_1 = require("./members");
const BagVal_1 = require("./BagVal");
// Did the meet ADD a key or narrow a leaf, or only constrain? MEMBERS,
// not raw keys, so an unfilled optional is not something to add.
function sameKids(a, b, ctx) {
    if (true === a?.isMap || true === a?.isList) {
        const am = (0, members_1.bagMembers)(a, ctx);
        const bm = (0, members_1.bagMembers)(b, ctx);
        if (null == am || null == bm || am.length !== bm.length) {
            return false;
        }
        const peers = new Map(bm.map((m) => [m.key, m.val]));
        return am.every((m) => peers.has(m.key) && sameKids(m.val, peers.get(m.key), ctx));
    }
    return a?.canon === b?.canon;
}
// A pref-free disjunction is several values at once: any match counts.
function sameMembers(a, b, ctx) {
    if (true === a?.isDisjunct && Array.isArray(a.peg) &&
        !a.peg.some((m) => true === m?.isPref)) {
        return true;
    }
    return sameKids(a, b, ctx);
}
function trialUnify(ctx, a, b) {
    return sandboxed(ctx, () => (0, unify_1.unite)(ctx, a, b, 'trial'));
}
// Runs `fn` as a trial: a failure is an answer, not an error.
function sandboxed(ctx, fn) {
    const savedErr = ctx.err;
    const savedTrial = ctx._trialMode;
    // Restored by DELETION where they were inherited, for the reason
    // DisjunctVal.unify's own sandbox gives at length: contexts are
    // Object.create(parent) and cached per (parent, key), so writing
    // these back leaves own properties that shadow the ancestor and make
    // a later trial invisible to the value running inside it.
    const ownErr = Object.prototype.hasOwnProperty.call(ctx, 'err');
    const ownTrial = Object.prototype.hasOwnProperty.call(ctx, '_trialMode');
    const trialErr = [];
    ctx.err = trialErr;
    ctx._trialMode = true;
    let out;
    try {
        out = fn();
    }
    finally {
        if (ownErr) {
            ctx.err = savedErr;
        }
        else {
            delete ctx.err;
        }
        if (ownTrial) {
            ctx._trialMode = savedTrial;
        }
        else {
            delete ctx._trialMode;
        }
    }
    return 0 < trialErr.length || out.isNil ? undefined : out;
}
// A condition whose verdict over a settled scalar its canon decides: it
// reads no position, so one trial answers every node that canons alike.
function pureCond(c) {
    return true === c.isScalar || true === c.isScalarKind ||
        (true === c.isConstraint && null == c.pending && 0 === c.musts.length &&
            0 === c.nofs.length && 0 === c.whens.length) ||
        (true === c.isDisjunct &&
            c.peg.every((m) => true !== m.isPref && pureCond(m)));
}
// A settled value's trial runs the meet, then settled passes until done,
// so a staged builtin in the condition answers per member.
function settleTrial(ctx, met) {
    const sctx = ctx.clone({});
    sctx.settle = true;
    for (let i = 0; undefined !== met && true !== met.done &&
        i < ctx.budget.passes; i++) {
        met = trialUnify(sctx, met, (0, top_1.top)());
    }
    const done = met;
    return undefined === done ? undefined :
        sandboxed(sctx, () => finished(sctx, done));
}
// As generation does: a container a constraint still holds is decided.
function finished(ctx, v) {
    const residue = (0, BagVal_1.sizingResidue)(v);
    const out = undefined === residue ? v :
        residue.con.settleContainer(residue.bag, ctx);
    if (true === out.isMap || true === out.isList) {
        for (const k of Object.keys(out.peg)) {
            const child = finished(ctx, out.peg[k]);
            if (true === child.isNil && !out.optionalKeys.includes(k)) {
                return child;
            }
            out.peg[k] = child;
        }
    }
    return out;
}
// The admission trial (G12 design, section 3): does `node` already
// satisfy `cond`? Each one run counts against the `trials` budget.
function admits(ctx, node, cond, pair, settled) {
    const st = ctx._trials;
    const key = true === node.isScalar && pureCond(cond) ?
        node.canon + '\u0000' + cond.canon : undefined;
    const known = undefined === key ? undefined : st.memo.get(key);
    if (undefined !== known || st.over) {
        return true === known;
    }
    if (ctx.budget.trials < ++st.n) {
        st.over = true;
        return false;
    }
    const [a, b] = pair();
    const first = trialUnify(ctx, a, b);
    const met = true === settled ? settleTrial(ctx, first) : first;
    const ok = undefined !== met && sameMembers(node, met, ctx);
    if (undefined !== key) {
        st.memo.set(key, ok);
    }
    return ok;
}
class FuncBaseVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isFunc = true;
        this.forgives = false;
        this.isGenable = true;
        this.staged = false;
    }
    validateArgs(args, min) {
        if (min < args.length) {
            throw new err_1.AontuError('The ' + this.funcname() + ' function needs at least ' +
                min + ' argument' + (1 === min ? '' : 's') + '.');
        }
    }
    make(ctx, _spec) {
        return (0, err_1.makeNilErr)(ctx, 'func:' + this.funcname(), this, undefined, 'make');
    }
    driveStagedArgs(ctx, count) {
        const TOP = (0, top_1.top)();
        let alldone = true;
        const actx = ctx.clone({});
        actx.argsnap = true;
        for (let i = 0; i < count && i < this.peg.length; i++) {
            const arg = this.peg[i];
            if (!arg.done) {
                // Charged to the depth budget, as FuncBaseVal's own arg loop is:
                // this recurses without going through `unite`.
                this.peg[i] = (0, unify_1.withDepth)(ctx, arg, TOP, () => arg.unify(TOP, actx));
            }
            alldone = alldone && true === this.peg[i].done;
        }
        return alldone;
    }
    stagedReady(peer, ctx, count) {
        const ready = this.driveStagedArgs(ctx, count);
        return (ready || (!peer.isTop && (0, PlaceVal_1.hasPlace)(this))) && true === ctx.settle;
    }
    clone(ctx, spec) {
        const out = super.clone(ctx, spec);
        if (true === spec?.dup && Array.isArray(this.peg)) {
            out.peg = this.peg.map((a) => a.clone(ctx, { dup: true }));
        }
        return out;
    }
    // The shape a staged func holds while it waits: not done, so the pass
    // loop keeps going; unchanged against TOP, so nothing reads an answer
    // it has not given; and collapsed against an identical twin at the
    // same position, so `key() & key()` does not grow a conjunct per pass.
    residuate(peer, ctx) {
        this.notdone();
        if (peer.isTop || (peer.id === this.id)) {
            // Cloned rather than returned: a driver that met the same object
            // twice in one pass would charge the revisit budget and report
            // `unify_cycle`.
            return this.clone(ctx);
        }
        if (peer.isNil) {
            return peer;
        }
        if (peer.isFunc
            && peer.funcname() === this.funcname()
            && peer.path.join('.') === this.path.join('.')
            && peer.canon === this.canon) {
            return this;
        }
        const out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
        out.site.row = this.site.row;
        out.site.col = this.site.col;
        out.site.url = this.site.url;
        out.site.len = this.site.len;
        out.site.src = this.site.src;
        return out;
    }
    unify(peer, ctx) {
        if (this.staged && !ctx.settle) {
            return this.residuate(peer, ctx);
        }
        if (!peer.isTop && !peer.isNil && this.id !== peer.id && (0, PlaceVal_1.hasPlace)(this)) {
            if ((0, PlaceVal_1.hasPlace)(peer)) {
                return (0, err_1.makeNilErr)(ctx, 'place_pair', this, peer);
            }
            return (0, PlaceVal_1.fillPlace)(this, peer, ctx).unify((0, top_1.top)(), ctx);
        }
        const TOP = (0, top_1.top)();
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Func:' + this.funcname(), this, peer);
        let why = '';
        let out = this;
        let pegdone = true;
        if (this.id !== peer.id) {
            if (peer.isTop && (this.mark.type || this.mark.hide)) {
                this.dc = type_1.DONE;
            }
            else {
                let newpeg = [];
                let newtype = this.mark.type;
                let newhide = this.mark.hide;
                let pegprep = this.prepare(ctx, this.peg);
                if (null === pegprep) {
                    pegdone = true;
                    newpeg = this.peg;
                }
                else {
                    this.peg = pegprep;
                    for (let arg of this.peg) {
                        let newarg = arg;
                        if (!arg.done) {
                            const argctx = te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'ARG') }) : ctx;
                            newarg = (0, unify_1.withDepth)(ctx, arg, TOP, () => arg.unify(TOP, argctx));
                            newtype = newtype || newarg.mark.type;
                            newhide = newhide || newarg.mark.hide;
                        }
                        // pegdone &&= arg.done
                        pegdone &&= newarg.done;
                        newpeg.push(newarg);
                    }
                }
                // console.log('FUNCBASE-PEG', this.id, pegdone, this.peg.map((p: any) => p?.canon))
                // ABSENCE PROPAGATES (ADR-034), ahead of deferResolve.
                const gone = this.forgives ? undefined :
                    newpeg.find((a) => true === a.isAbsent);
                if (pegdone &&
                    (undefined !== gone || !this.deferResolve(ctx, newpeg))) {
                    // THE SIGNATURE GATE (docs/design/SIGNATURES.0.md): the
                    // driven arguments against the declared signature, before
                    // the builtin's own logic sees them. See siggate.ts for
                    // what the gate owns and what stays with the builtins.
                    const resolved = gone ?? (0, siggate_1.sigRefuse)(ctx, this, newpeg) ??
                        this.resolve(ctx, newpeg);
                    // The TOP peer is DROPPED as the unit it is.
                    out = resolved.done && peer.isTop ? resolved :
                        (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PEG') }) : ctx, resolved, peer, 'func-' + this.funcname() + '/' + this.id);
                    (0, utility_1.propagateMarks)(this, out);
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'pegdone';
                }
                else if (peer.isTop) {
                    this.notdone();
                    out = this.make(ctx, { peg: newpeg, mark: { type: newtype, hide: newhide } });
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'top';
                }
                else if (peer.isNil) {
                    this.notdone();
                    out = peer;
                    why += 'nil';
                }
                else {
                    this.notdone();
                    out = new ConjunctVal_1.ConjunctVal({
                        peg: [this, peer], mark: { type: newtype, hide: newhide }
                    }, ctx);
                    out.site.row = this.site.row;
                    out.site.col = this.site.col;
                    out.site.url = this.site.url;
                    out.site.len = this.site.len;
                    out.site.src = this.site.src;
                    out.path = this.path;
                    why += 'defer';
                }
            }
        }
        // console.log('FUNC-UNIFY-OUT', ctx.cc, this.funcname(), this.id, this.canon, 'D=', pegdone, 'W=', why, peer.id, peer.canon, 'O=', out.dc, out.id, out.canon)
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    get canon() {
        return '' +
            // (this.type ? '<type>' : '') +
            // (this.done ? '<done>' : '') +
            // (this.id + '=') +
            this.funcname() + '(' + (this.peg.map((p) => p.canon).join(',')) + ')';
    }
    funcname() {
        return 'func';
    }
    prepare(_ctx, args) {
        return args;
    }
    resolve(ctx, _args) {
        return (0, err_1.makeNilErr)(ctx, 'func:' + this.funcname(), this, undefined, 'resolve');
    }
    deferResolve(_ctx, _args) {
        return false;
    }
} /* node:coverage ignore next 7 */
exports.FuncBaseVal = FuncBaseVal;
//# sourceMappingURL=FuncBaseVal.js.map