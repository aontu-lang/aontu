"use strict";
/* Copyright (c) 2021-2023 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VarVal = void 0;
const type_1 = require("../type");
const err_1 = require("../err");
const StringVal_1 = require("./StringVal");
const FeatureVal_1 = require("./FeatureVal");
const NullVal_1 = require("./NullVal");
const BooleanVal_1 = require("./BooleanVal");
const NumberVal_1 = require("./NumberVal");
const IntegerVal_1 = require("./IntegerVal");
const numkind_1 = require("./numkind");
const utility_1 = require("../utility");
const unify_1 = require("../unify");
const top_1 = require("./top");
class VarVal extends FeatureVal_1.FeatureVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isVar = true;
    }
    unify(peer, ctx) {
        const te = ctx.explain && (0, utility_1.explainOpen)(ctx, ctx.explain, 'Var', this, peer);
        let out;
        let nameVal;
        if (this.peg.isVal) {
            if (this.peg.isRef) {
                this.peg.absolute = true;
                nameVal = this.peg;
            }
            else {
                // Resolve the NAME against TOP only — the peer applies to the
                // variable's resolved VALUE below, not to its name (so
                // `k1:$flag &:boolean` checks the boolean value of $flag
                // against the spread, instead of unifying the string "flag"
                // with it).
                nameVal = this.peg.unify((0, top_1.top)(), te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'PEG') }) : ctx);
            }
        }
        else {
            nameVal = new StringVal_1.StringVal({ peg: '' + this.peg }, ctx);
        }
        if (!(nameVal.isRef) && type_1.DONE === nameVal.dc) {
            // `$` admits only a name, so a settled name is a string.
            {
                let found = ctx.vars[nameVal.peg];
                const ft = typeof found;
                // Single ladder: a missing var must report `unknown_var` and not
                // fall through to the `invalid_var_kind` default below.
                if (undefined === found) {
                    out = (0, err_1.makeNilErr)(ctx, 'unknown_var', this, peer);
                }
                else if (null === found) {
                    out = this.place(new NullVal_1.NullVal({ peg: null }));
                }
                else if ('string' === ft) {
                    out = new StringVal_1.StringVal({ peg: found });
                }
                else if ('boolean' === ft) {
                    out = new BooleanVal_1.BooleanVal({ peg: found });
                }
                else if ('number' === ft) {
                    // A raw var binding carries no source text, so the integral +
                    // int64-range conditions decide the kind (same helper as the
                    // val rule and rawToVal).
                    // (ctx.vars is declared as Record<string, Val> but also
                    // carries raw scalars, which is what `ft` has just proven.)
                    out = (0, numkind_1.isIntegerKind)(found) ?
                        new IntegerVal_1.IntegerVal({ peg: found }) :
                        new NumberVal_1.NumberVal({ peg: found });
                }
                else if ('object' === ft && found.isVal) {
                    out = found;
                }
                else {
                    out = (0, err_1.makeNilErr)(ctx, 'invalid_var_kind', this, peer);
                }
                if (!out.isNil && null != peer && !peer.isTop) {
                    out = (0, unify_1.unite)(te ? ctx.clone({ explain: (0, utility_1.ec)(te, 'VAL') }) : ctx, out, peer, 'var-val');
                }
            }
        }
        else {
            out = nameVal;
        }
        (0, utility_1.explainClose)(te, out);
        return out;
    }
    same(peer) {
        return null == peer ? false : peer instanceof VarVal && this.peg === peer.peg;
    }
    clone(ctx, spec) {
        let out = super.clone(ctx, spec);
        return out;
    }
    get canon() {
        return '$' + (this.peg?.isVal ? this.peg.canon : '' + this.peg);
    }
    gen(ctx) {
        // Unresolved var cannot be generated, so always an error.
        let nil = (0, err_1.makeNilErr)(ctx, 'var', this, undefined);
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
exports.VarVal = VarVal;
//# sourceMappingURL=VarVal.js.map