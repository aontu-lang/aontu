"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuncBaseVal = void 0;
exports.trialUnify = trialUnify;
exports.sameMembers = sameMembers;
const type_1 = require("../type");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const err_1 = require("../err");
const siggate_1 = require("../siggate");
const top_1 = require("./top");
const ConjunctVal_1 = require("../val/ConjunctVal");
const FeatureVal_1 = require("../val/FeatureVal");
const PlaceVal_1 = require("../val/PlaceVal");
// Did the meet ADD a key or narrow a leaf, or only constrain?
function sameKids(a, b) {
    if (true === a?.isMap && true === b?.isMap) {
        const ak = Object.keys(a.peg ?? {});
        if (ak.length !== Object.keys(b.peg ?? {}).length) {
            return false;
        }
        return ak.every((k) => sameKids(a.peg[k], b.peg?.[k]));
    }
    if (true === a?.isList && true === b?.isList) {
        return a.peg.length === b.peg.length &&
            a.peg.every((el, i) => sameKids(el, b.peg[i]));
    }
    return a?.canon === b?.canon;
}
// A disjunction WHOLE is several values at once, so whether any
// matches is what the meet answered; one under it is a member.
function sameMembers(a, b) {
    return true === a?.isDisjunct || sameKids(a, b);
}
function trialUnify(ctx, a, b) {
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
        out = (0, unify_1.unite)(ctx, a, b, 'trial');
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
        return new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
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