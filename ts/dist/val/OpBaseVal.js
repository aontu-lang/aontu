"use strict";
/* Copyright (c) 2024 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpBaseVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const unify_1 = require("../unify");
const utility_1 = require("../utility");
const top_1 = require("./top");
const ConjunctVal_1 = require("./ConjunctVal");
const FeatureVal_1 = require("./FeatureVal");
const PlaceVal_1 = require("./PlaceVal");
class OpBaseVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        // An op sorts BEFORE the kinds in a conjunct: only it knows to wait
        // for a staged operand, and a kind met first refuses it outright.
        this.cjo = 48000;
        this.isOp = true;
        this.peg = [];
        for (let pI = 0; pI < spec.peg.length; pI++) {
            this.append(spec.peg[pI]);
        }
    }
    append(part) {
        this.peg.push(part);
    }
    make(ctx, _spec) {
        return (0, err_1.makeNilErr)(ctx, 'op:' + this.opname(), this, undefined, 'make');
    }
    opname() {
        return 'op';
    }
    unify(peer, ctx) {
        // THE PLACEHOLDER (G8 phase 3, see PlaceVal), on the operator side:
        // `x: {&: {m: _ + 2}}` meeting `1` is `3`. Same rule as
        // FuncBaseVal's -- the peer fills the hole and the operation is
        // what answers.
        if (!peer.isTop && !peer.isNil && this.id !== peer.id && (0, PlaceVal_1.waitsOnHole)(this)) {
            if ((0, PlaceVal_1.waitsOnHole)(peer)) {
                return (0, err_1.makeNilErr)(ctx, 'place_pair', this, peer);
            }
            return (0, PlaceVal_1.bindHole)(this, peer, ctx).unify((0, top_1.top)(), ctx);
        }
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Op:' + this.opname(), this, peer);
        let out;
        if (this.id == peer.id) {
            return this;
        }
        let pegdone = true;
        let newpeg = [];
        for (let arg of this.peg) {
            if (!arg.done) {
                const a = arg;
                arg = (0, unify_1.withDepth)(ctx, a, (0, top_1.top)(), () => a.unify((0, top_1.top)(), ctx, (0, utility_1.ec)(te, 'ARG')));
            }
            pegdone &&= arg.done;
            newpeg.push(arg);
        }
        // console.log('OPVAL', this.id, this.opname(), pegdone, newpeg.map(p => p.canon))
        // Lists join once only their holes wait, as only a fill settles a hole.
        if (pegdone || (true === newpeg[0]?.isList && true === newpeg[1]?.isList
            && newpeg.every(PlaceVal_1.doneButHoles))) {
            // `|| this` makes result truthy, so an op that cannot compute yet
            // takes the OpBaseVal arm below rather than a separate null arm.
            let result = this.operate(ctx, newpeg) || this;
            if (result instanceof OpBaseVal) {
                if (peer.isTop) {
                    out = this;
                }
                else if (peer.isNil) {
                    out = (0, err_1.makeNilErr)(ctx, 'op[' + this.peg + ']', this, peer);
                }
                else if (this.canon === peer.canon) {
                    out = this;
                }
                else {
                    this.dc = type_1.DONE === this.dc ? type_1.DONE : this.dc + 1;
                    out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
                }
            }
            else {
                out = result.done && peer.isTop ? result :
                    (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'RES') }) : ctx, result, peer, 'op');
            }
            out.dc = type_1.DONE === out.dc ? type_1.DONE : this.dc + 1;
        }
        else if (peer.isTop) {
            this.notdone();
            out = this.make(ctx, { peg: newpeg });
            out.site.row = this.site.row;
            out.site.col = this.site.col;
            out.site.url = this.site.url;
            out.path = this.path;
        }
        else if (peer.isNil) {
            this.notdone();
            out = peer;
        }
        else {
            this.notdone();
            out = new ConjunctVal_1.ConjunctVal({ peg: [this, peer] }, ctx);
            out.site.row = this.site.row;
            out.site.col = this.site.col;
            out.site.url = this.site.url;
            out.path = this.path;
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    same(peer) {
        return null == peer ? false : this.peg === peer.peg;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, {
            peg: this.peg,
        });
        // THE PER-DESTINATION INSTANTIATION RULE (ADR-005): an operation
        // inside a template clones its operands as instances — the
        // default clone shares them (see FuncBaseVal.clone). Every
        // operand is a Val by construction, as in the Go twin's []Val.
        if (true === spec?.dup) {
            out.peg = this.peg.map((a) => a.clone(ctx, { dup: true }));
        }
        return out;
    }
    operate(ctx, _args) {
        return (0, err_1.makeNilErr)(ctx, 'op:' + this.opname(), this, undefined, 'operate');
    }
    get canon() {
        return 'op';
    }
    primatize(v) {
        const t = typeof v;
        if (null == v || 'string' === t || 'number' === t || 'boolean' === t) {
            return v;
        }
        else if (v?.isVal) {
            return this.primatize(v.peg);
        }
        else if (v?.toString) {
            return '' + v;
        }
        else {
            return undefined;
        }
    }
    gen(ctx) {
        // Unresolved op cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'op', this, undefined);
        nil.path = this.path;
        nil.site.url = this.site.url;
        nil.site.row = this.site.row;
        nil.site.col = this.site.col;
        (0, err_1.descErr)(nil, ctx);
        if (ctx) {
            ctx.adderr(nil);
        }
        else {
            throw new err_1.AontuError(nil.msg);
        }
        return undefined;
    }
} /* node:coverage ignore next 6 */
exports.OpBaseVal = OpBaseVal;
//# sourceMappingURL=OpBaseVal.js.map